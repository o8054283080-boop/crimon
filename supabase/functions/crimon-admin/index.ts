/**
 * 管理者画面のAPI。
 *
 * ## このファイルは、Supabase から取り出して置き直したもの
 *
 * ここは長いあいだ**リポジトリに無かった。**Supabase の画面から直接貼って
 * 動かしていたので、手元からは中身が読めず、**管理者画面に項目を足せなかった**
 * ——サーバが返していないものは、画面側では出しようがない。
 *
 * `supabase functions download crimon-admin` で取り出し、
 * トランスパイルで剥がれていた型を付け直したのがこのファイル。
 * これ以降は `arena-settle` と同じで、**main へ入れば自動で本番へ流れる**
 * (`.github/workflows/admin-edge.yml`)。Supabase の画面から直接編集しないこと。
 *
 * ## 鍵の扱い
 *
 * `SUPABASE_SERVICE_ROLE_KEY` は**この関数の中だけ**にある。
 * 管理者セッションの署名にも同じ鍵を使う(別の秘密を増やさないため)。
 * フロントへ渡るのは、期限付きの短いトークンだけ。
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildDaily, DAILY_DAYS, number, type SaveProgress, saveProgress, text } from "./progress.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** 管理者セッションの有効期限。閉じ忘れた画面が延々と叩けないよう短く切る */
const SESSION_TTL_MS = 30 * 60 * 1000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmac(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return base64Url(new Uint8Array(signature));
}

async function makeToken(secret: string): Promise<string> {
  const payload = base64Url(encoder.encode(JSON.stringify({
    exp: Date.now() + SESSION_TTL_MS,
    nonce: crypto.randomUUID(),
  })));
  return `${payload}.${await hmac(payload, secret)}`;
}

/**
 * セッションの検証。**署名を1文字ずつ全部見てから返す**
 * (途中で抜けると、掛かった時間から正解の長さが読めてしまう)。
 */
async function verifyToken(token: unknown, secret: string): Promise<boolean> {
  if (typeof token !== "string" || !token.includes(".")) return false;
  const [payload, signature] = token.split(".", 2);
  if (!payload || !signature) return false;
  const expected = await hmac(payload, secret);
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  if (diff !== 0) return false;
  try {
    const parsed = JSON.parse(decoder.decode(fromBase64Url(payload))) as { exp?: unknown };
    return typeof parsed.exp === "number" && Number.isFinite(parsed.exp) && parsed.exp > Date.now();
  } catch {
    return false;
  }
}

type SaveSummary = {
  fighterName?: string;
  fighterLevel?: number;
  gold?: number;
  crystal?: number;
  monsterCount?: number;
  equipmentCount?: number;
};

/**
 * 控えの中の `summary`(`src/game/saveFile.ts` が書く)を読む。
 *
 * **ここに出るものは、プレイヤーの端末がクラウド保存した時点の値。**
 * レートや勝敗のようにサーバが直接持つ値とは、遅れ方がまるで違う。
 */
function saveSummary(save: unknown): SaveSummary {
  if (!save || typeof save !== "object") return {};
  const raw = save as { summary?: unknown };
  const summary = raw.summary;
  if (!summary || typeof summary !== "object") return {};
  const row = summary as Record<string, unknown>;
  return {
    fighterName: text(row.fighterName),
    fighterLevel: number(row.fighterLevel),
    gold: number(row.gold),
    crystal: number(row.crystal),
    monsterCount: number(row.monsterCount),
    equipmentCount: number(row.equipmentCount),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "server_not_configured" }, 500);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "invalid_json" }, 400);
  const action = text(body.action);

  const { data: setting, error: settingError } = await supabase
    .from("crimon_admin_settings")
    .select("value")
    .eq("key", "password_sha256")
    .maybeSingle();
  if (settingError || !setting?.value) return json({ error: "admin_not_configured" }, 503);

  if (action === "login") {
    const password = text(body.password);
    if (!password || await sha256(password) !== setting.value) {
      // 総当たりを遅くする。**外した時だけ待つ**ので、正しい人は待たされない
      await new Promise((resolve) => setTimeout(resolve, 650));
      return json({ error: "invalid_password" }, 401);
    }
    return json({ token: await makeToken(serviceRoleKey), expiresInSeconds: SESSION_TTL_MS / 1000 });
  }

  if (!await verifyToken(body.token, serviceRoleKey)) return json({ error: "unauthorized" }, 401);

  if (action === "change_password") {
    const nextPassword = text(body.newPassword);
    if (nextPassword.length < 10 || nextPassword.length > 128) return json({ error: "password_length" }, 400);
    const nextHash = await sha256(nextPassword);
    const { error } = await supabase.from("crimon_admin_settings").upsert({
      key: "password_sha256",
      value: nextHash,
      updated_at: new Date().toISOString(),
    });
    if (error) return json({ error: "password_update_failed" }, 500);
    return json({ ok: true, token: await makeToken(serviceRoleKey) });
  }

  if (action === "dashboard") {
    /*
     * **日別の動きは、対戦の行そのものを数える。**
     * `arena_standings` の勝敗は合計なので、「いつ動いたか」が出てこない。
     * 直近14日ぶんだけを、`created_at` の1列に絞って取る。
     */
    const dailySince = new Date(Date.now() - DAILY_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const [
      seasonsResult,
      authResult,
      profilesResult,
      standingsResult,
      walletsResult,
      recoveryResult,
      matchDaysResult,
      towerResult,
      snapshotsResult,
      conflictCopiesResult,
    ] = await Promise.all([
      supabase.from("arena_seasons").select("id,name,status,starts_at,ends_at").order("starts_at", { ascending: false }).limit(5),
      supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      supabase.from("arena_profiles")
        .select("user_id,display_name,icon_key,lead_dex_id,lead_star,created_at,updated_at")
        .order("updated_at", { ascending: false }).limit(1000),
      supabase.from("arena_standings")
        .select("user_id,season_id,rating,best_rating,tier_id,wins,losses,defense_wins,defense_losses,last_match_at,updated_at")
        .order("updated_at", { ascending: false }).limit(2000),
      supabase.from("arena_wallets").select("user_id,coins,lifetime_coins,tickets,tickets_max,updated_at").limit(1000),
      supabase.from("crimon_recovery_accounts")
        .select("id,recovery_id,latest_revision,latest_saved_at,failed_attempts,locked_until,created_at,updated_at,latest_save,arena_user_id")
        .order("updated_at", { ascending: false }).limit(1000),
      supabase.from("arena_matches").select("created_at").gte("created_at", dailySince).limit(20000),
      /*
       * **塔の到達階は、控えから読んではいけない。**
       *
       * 試練の塔が入ったのは 9/5。それより前の控えには塔の項目が無いので、
       * 控えから読むと**69階まで登った人が「未挑戦」と出る**(実際に出した)。
       * この表はサーバが直接持っていて、塔の画面を開くたびに更新される。
       */
      supabase.from("trial_tower_progress")
        .select("user_id,player_name,best_floor,best_floor_reached_at,updated_at")
        .order("best_floor", { ascending: false }).limit(1000),
      supabase.from("crimon_player_snapshots").select("user_id,save,saved_at").order("saved_at", { ascending: false }).limit(1000),
      /*
       * **保存が2つに分かれた端末の控え**(crimon-recovery の save_copy)。
       * 分かれている間、端末の新しい遊びはこちらにしか届かない。
       * ここを読まないと、管理画面には止まった方の古い姿しか出ない。
       */
      supabase.from("crimon_recovery_conflict_copies").select("account_id,device_id,save,base_revision,saved_at")
        .order("saved_at", { ascending: false }).limit(2000),
    ]);

    // 取得失敗を「プレイヤー0人」に変換しない。
    const requiredResults = { seasonsResult, authResult, profilesResult, standingsResult, walletsResult, recoveryResult, matchDaysResult, towerResult };
    for (const [source, result] of Object.entries(requiredResults)) {
      if (result.error) {
        console.error("dashboard_read_failed", source, result.error.code);
        return json({ error: "dashboard_read_failed" }, 503);
      }
    }
    const snapshotStatus = snapshotsResult.error ? "unavailable" : "ready";
    if (snapshotsResult.error) console.error("snapshot_read_failed", snapshotsResult.error.code);
    // 控えの表は後から足したもの。読めなくても本体の一覧は出す(読めなかったことは画面へ伝える)
    const conflictCopyStatus = conflictCopiesResult.error ? "unavailable" : "ready";
    if (conflictCopiesResult.error) console.error("conflict_copy_read_failed", conflictCopiesResult.error.code);
    type CopyRow = { account_id: string; device_id: string; save: unknown; base_revision: number | null; saved_at: string };
    const copiesByAccount = new Map<string, CopyRow[]>();
    for (const row of (conflictCopiesResult.data ?? []) as CopyRow[]) {
      const key = String(row.account_id);
      copiesByAccount.set(key, [...(copiesByAccount.get(key) ?? []), row]);
    }

    type Season = { id: string; name: string; status: string; starts_at: string; ends_at: string };
    const seasonRows = (seasonsResult.data ?? []) as Season[];
    const activeSeason = seasonRows.find((season) => season.status === "ACTIVE") ?? seasonRows[0] ?? null;

    type Standing = Record<string, unknown> & { user_id: string; season_id: string };
    const standingMap = new Map<string, Standing>();
    for (const row of (standingsResult.data ?? []) as Standing[]) {
      // 今のシーズンのものだけを見る(過去シーズンの行が混ざると、レートが巻き戻って見える)
      if (activeSeason && row.season_id !== activeSeason.id) continue;
      if (!standingMap.has(row.user_id)) standingMap.set(row.user_id, row);
    }

    type Wallet = Record<string, unknown> & { user_id: string };
    const walletMap = new Map<string, Wallet>((walletsResult.data ?? []).map((row) => [(row as Wallet).user_id, row as Wallet]));

    type TowerRow = { user_id: string; player_name: string; best_floor: number; best_floor_reached_at: string; updated_at: string };
    const towerRows = (towerResult.data ?? []) as TowerRow[];
    const towerMap = new Map<string, TowerRow>(towerRows.map((row) => [row.user_id, row]));

    type Profile = Record<string, unknown> & { user_id: string };
    const arenaPlayers = ((profilesResult.data ?? []) as Profile[]).map((profile) => {
      const standing = standingMap.get(profile.user_id) ?? {} as Standing;
      const wallet = walletMap.get(profile.user_id) ?? {} as Wallet;
      const tower = towerMap.get(profile.user_id);
      return {
        // **塔だけは控えではなく、サーバが直接持つ値。**遅れない
        towerBestFloor: tower ? number(tower.best_floor) : null,
        towerReachedAt: tower?.best_floor_reached_at ?? null,
        userId: profile.user_id,
        displayName: profile.display_name,
        leadDexId: profile.lead_dex_id,
        leadStar: profile.lead_star,
        rating: number(standing.rating),
        bestRating: number(standing.best_rating),
        tierId: text(standing.tier_id),
        wins: number(standing.wins),
        losses: number(standing.losses),
        defenseWins: number(standing.defense_wins),
        defenseLosses: number(standing.defense_losses),
        coins: number(wallet.coins),
        lifetimeCoins: number(wallet.lifetime_coins),
        tickets: number(wallet.tickets),
        ticketsMax: number(wallet.tickets_max),
        createdAt: profile.created_at,
        updatedAt: profile.updated_at,
        lastMatchAt: standing.last_match_at ?? null,
      };
    });

    type RecoveryRow = Record<string, unknown> & { id: string };
    const recoveryAccounts = ((recoveryResult.data ?? []) as RecoveryRow[]).map((account) => {
      /*
       * **いちばん新しいデータを出す。**
       *
       * 保存が2つに分かれると、本来のバックアップ(latest_save)は止まり、
       * 端末の新しい遊びは控え(conflict copies)にだけ届く。本来の方だけを見ていると
       * **止まった古い姿を今の姿として読ませる**(依頼主「新しいデータが見れないと意味がない」)。
       * 控えの方が新しければ、行の値はすべて控えから読む。どちらから読んだかは `newestSource` で返す。
       */
      const copies = (copiesByAccount.get(String(account.id)) ?? [])
        .slice().sort((a, b) => new Date(b.saved_at).getTime() - new Date(a.saved_at).getTime());
      const newestCopy = copies[0] ?? null;
      const copyIsNewer = newestCopy !== null
        && new Date(newestCopy.saved_at).getTime() > new Date(text(account.latest_saved_at)).getTime();
      const shownSave = copyIsNewer ? newestCopy!.save : account.latest_save;
      const progress = saveProgress(shownSave);
      const summary = saveSummary(shownSave);
      /*
       * **出どころを混ぜない。**
       *
       * レベル・所持金・所持数は `summary` から、進め具合は `state` から読んでいた。
       * 同じ行に2つの出どころが並ぶので、片方だけ古い形の控えだと
       * 「Lv.1 なのに★6が12体」という、あり得ない組み合わせが出る。
       * **`state` を先に見て、そこに無い時だけ `summary` で補う。**
       */
      const pick = (fromState: number | null | undefined, fromSummary: number | undefined) =>
        fromState ?? fromSummary ?? 0;
      return {
        id: account.id,
        recoveryId: account.recovery_id,
        latestRevision: number(account.latest_revision),
        latestSavedAt: account.latest_saved_at,
        failedAttempts: number(account.failed_attempts),
        lockedUntil: account.locked_until,
        createdAt: account.created_at,
        updatedAt: account.updated_at,
        /*
         * **この復旧IDが最後に使っていたアリーナの身元。**
         * 同じ名前がランキングに2人並んだ時、どちらが本人かを引き当てる手掛かり。
         */
        arenaUserId: account.arena_user_id ?? null,
        fighterName: progress?.fighterName ?? summary.fighterName ?? "",
        fighterLevel: pick(progress?.fighterLevel, summary.fighterLevel),
        gold: pick(progress?.gold, summary.gold),
        crystal: pick(progress?.crystal, summary.crystal),
        monsterCount: pick(progress?.monsterCount, summary.monsterCount),
        equipmentCount: pick(progress?.equipmentCount, summary.equipmentCount),
        /** 本人の値と進め具合が食い違ったら、控えそのものが壊れている合図 */
        sourceMismatch: progress !== null && summary.fighterLevel !== undefined
          && progress.fighterLevel !== null && progress.fighterLevel !== summary.fighterLevel,
        progress,
        /** 行の値をどちらから読んだか。COPY なら保存が2つに分かれていて、端末の控えの方が新しい */
        newestSource: copyIsNewer ? "COPY" : "MAIN",
        /** 行の値の保存日時(控えから読んだ時は控えの日時) */
        shownSavedAt: copyIsNewer ? newestCopy!.saved_at : account.latest_saved_at,
        /*
         * 分かれた端末の控えを全部。端末ごとに1行。
         * 本来のバックアップの姿も、比べられるように `main` として添える。
         */
        conflictCopies: copies.map((copy) => {
          const copyProgress = saveProgress(copy.save);
          const copySummary = saveSummary(copy.save);
          return {
            deviceId: copy.device_id,
            savedAt: copy.saved_at,
            baseRevision: copy.base_revision,
            fighterLevel: pick(copyProgress?.fighterLevel, copySummary.fighterLevel),
            gold: pick(copyProgress?.gold, copySummary.gold),
            crystal: pick(copyProgress?.crystal, copySummary.crystal),
            monsterCount: pick(copyProgress?.monsterCount, copySummary.monsterCount),
            equipmentCount: pick(copyProgress?.equipmentCount, copySummary.equipmentCount),
          };
        }),
        main: copies.length > 0 ? (() => {
          const mainProgress = saveProgress(account.latest_save);
          const mainSummary = saveSummary(account.latest_save);
          return {
            savedAt: account.latest_saved_at,
            fighterLevel: pick(mainProgress?.fighterLevel, mainSummary.fighterLevel),
            gold: pick(mainProgress?.gold, mainSummary.gold),
            crystal: pick(mainProgress?.crystal, mainSummary.crystal),
            monsterCount: pick(mainProgress?.monsterCount, mainSummary.monsterCount),
            equipmentCount: pick(mainProgress?.equipmentCount, mainSummary.equipmentCount),
          };
        })() : null,
      };
    });

    type SnapshotRow = { user_id: string; save: unknown; saved_at: string };
    const playerSnapshots = ((snapshotsResult.data ?? []) as SnapshotRow[]).map((row) => ({
      userId: row.user_id,
      savedAt: row.saved_at,
      summary: saveSummary(row.save),
      progress: saveProgress(row.save),
    }));

    const daily = buildDaily(DAILY_DAYS, {
      created: ((recoveryResult.data ?? []) as RecoveryRow[]).map((row) => row.created_at),
      saved: ((recoveryResult.data ?? []) as RecoveryRow[]).map((row) => row.latest_saved_at),
      matched: ((matchDaysResult.data ?? []) as { created_at: string }[]).map((row) => row.created_at),
      arenaCreated: ((profilesResult.data ?? []) as Profile[]).map((row) => row.created_at),
    });

    /*
     * **全体の進み具合。**1人ずつの行を上から読まなくても、
     * 「どこで止まっている人が多いか」がここだけで分かるようにする。
     */
    const withProgress = recoveryAccounts.map((row) => row.progress).filter((row): row is SaveProgress => row !== null);
    const sum = (pick: (row: SaveProgress) => number) => withProgress.reduce((total, row) => total + pick(row), 0);
    const overview = {
      players: withProgress.length,
      // 「直近7日で保存があった人」。登録数ではなく、**いま遊んでいる人の数**
      // 保存が分かれた人は控えの日時で数える(本来の方は止まっているので、遊んでいても数えられなくなる)
      activePlayers: recoveryAccounts.filter((row) => {
        const at = new Date(text(row.shownSavedAt)).getTime();
        return Number.isFinite(at) && Date.now() - at < 7 * 24 * 60 * 60 * 1000;
      }).length,
      /*
       * **塔はサーバの表から数える。**控えから数えていたが、塔が入ったのは 9/5 で、
       * それより前の控えには項目が無い。控えが古い人がまとめて「未挑戦」に化けて、
       * 69階まで登った人まで0人側に入っていた。
       */
      towerReached: towerRows.length,
      towerBest: towerRows.reduce((best, row) => Math.max(best, number(row.best_floor)), 0),
      sixStarOwners: withProgress.filter((row) => row.monsterMaxStar >= 6).length,
      monsters: sum((row) => Object.values(row.monsterStars).reduce((a, b) => a + b, 0)),
      equipment: sum((row) => Object.values(row.equipStars).reduce((a, b) => a + b, 0)),
      // 章ごとの人数。**詰まっている場所は、ここにしか出ない**
      chapters: withProgress.reduce<Record<string, number>>((table, row) => {
        const key = String(row.stageChapter);
        table[key] = (table[key] ?? 0) + 1;
        return table;
      }, {}),
      towerFloors: towerRows.reduce<Record<string, number>>((table, row) => {
        // 10階ごとの節でまとめる(1階刻みでは読めない)
        const floor = number(row.best_floor);
        const band = floor <= 0 ? "0" : String(Math.floor((floor - 1) / 10) * 10 + 1);
        table[band] = (table[band] ?? 0) + 1;
        return table;
      }, {}),
    };

    /*
     * **塔の到達階は、ここでしか正しく出せない。**
     *
     * この表はアリーナの `user_id` で引いてある。一方、登録データ(復旧ID)は
     * **別の身元の体系**で、アリーナの id は端末の localStorage にあって
     * 控えには入っていない。だから復旧IDの行へは結び付けられない。
     * 名前で当てにいくと別人を混ぜるので、**独立した並びとして出す。**
     */
    const towerRanking = towerRows
      .slice()
      .sort((a, b) => number(b.best_floor) - number(a.best_floor))
      .slice(0, 50)
      .map((row, index) => ({
        rank: index + 1,
        userId: row.user_id,
        name: row.player_name,
        bestFloor: number(row.best_floor),
        reachedAt: row.best_floor_reached_at,
      }));

    return json({
      generatedAt: new Date().toISOString(),
      activeSeason,
      summary: {
        authUsers: authResult.data?.users?.length ?? 0,
        arenaProfiles: arenaPlayers.length,
        recoveryAccounts: recoveryAccounts.length,
        playerSnapshots: playerSnapshots.length,
      },
      overview,
      towerRanking,
      daily,
      arenaPlayers,
      recoveryAccounts,
      playerSnapshots,
      snapshotStatus,
      conflictCopyStatus,
    });
  }

  /*
   * **分かれてしまったアリーナアカウントを合わせる。**
   *
   * アリーナの身元は端末の中にしかないので、機種を変えたりサイトデータが
   * 消えたりすると新しい匿名ユーザが生まれ、ランキングに同じ名前で2人並ぶ。
   * 既に分かれたぶんは、ここで合わせるしかない。
   *
   * **本番のデータを動かす。**だから2段構えにしてある:
   *
   *   1. `arena_merge_preview` … 何も書かずに「こうなります」だけ返す
   *   2. `arena_merge`         … 実行。**実行前の姿を控えてから**触る
   *
   * 押す前に必ず 1 を見る。間違えたら控え(`crimon_arena_merge_log`)から戻せる。
   */
  if (action === "arena_merge_preview" || action === "arena_merge") {
    const from = text(body.fromUserId);
    const to = text(body.toUserId);
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuid.test(from) || !uuid.test(to)) return json({ error: "invalid_user_id" }, 400);
    if (from === to) return json({ error: "same_user" }, 400);
    const dryRun = action === "arena_merge_preview";
    /*
     * **実行の側だけ、合言葉を要る。**
     * 一覧の行を押し間違えただけで本番のデータが動くのは危ない。
     * 画面は移し先の表示名を打たせて、ここで突き合わせる。
     */
    if (!dryRun) {
      const { data: target } = await supabase
        .from("arena_profiles").select("display_name").eq("user_id", to).maybeSingle();
      const typed = text(body.confirmName).trim();
      if (!target || typed !== text(target.display_name).trim()) {
        return json({ error: "confirm_name_mismatch" }, 400);
      }
    }
    const { data, error } = await supabase.rpc("crimon_arena_merge", {
      p_from: from,
      p_to: to,
      p_dry_run: dryRun,
    });
    if (error) {
      const known: Record<string, string> = {
        SAME_USER: "same_user",
        FROM_NOT_FOUND: "from_not_found",
        TO_NOT_FOUND: "to_not_found",
        MISSING_USER: "invalid_user_id",
      };
      const hit = Object.keys(known).find((key) => String(error.message).includes(key));
      return json({ error: hit ? known[hit] : "merge_failed" }, 400);
    }
    return json({ ok: true, result: data });
  }

  if (action === "arena_detail") {
    const userId = text(body.userId);
    if (!/^[0-9a-f-]{36}$/i.test(userId)) return json({ error: "invalid_user_id" }, 400);
    const [profile, wallet, standings, matches, purchases] = await Promise.all([
      supabase.from("arena_profiles")
        .select("user_id,display_name,icon_key,lead_dex_id,lead_star,created_at,updated_at")
        .eq("user_id", userId).maybeSingle(),
      supabase.from("arena_wallets")
        .select("user_id,coins,lifetime_coins,tickets,tickets_max,tickets_refilled_at,updated_at")
        .eq("user_id", userId).maybeSingle(),
      supabase.from("arena_standings")
        .select("season_id,rating,best_rating,tier_id,wins,losses,defense_wins,defense_losses,last_match_at,updated_at")
        .eq("user_id", userId).order("updated_at", { ascending: false }).limit(10),
      supabase.from("arena_matches")
        .select("id,season_id,attacker_id,defender_id,opponent_kind,npc_name,attacker_won,attacker_rating_before,attacker_rating_delta,attacker_rating_after,defender_rating_before,defender_rating_delta,defender_rating_after,coins_awarded,defender_coins_awarded,created_at")
        .or(`attacker_id.eq.${userId},defender_id.eq.${userId}`)
        .order("created_at", { ascending: false }).limit(30),
      supabase.from("arena_shop_purchases")
        .select("id,item_id,quantity,unit_price,total_price,created_at,fulfilled_at")
        .eq("user_id", userId).order("created_at", { ascending: false }).limit(30),
    ]);
    return json({
      profile: profile.data,
      wallet: wallet.data,
      standings: standings.data ?? [],
      matches: matches.data ?? [],
      purchases: purchases.data ?? [],
    });
  }

  return json({ error: "unknown_action" }, 400);
});
