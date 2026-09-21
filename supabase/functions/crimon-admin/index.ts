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

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function number(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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
    const [{ data: seasons }, authResult, profilesResult, standingsResult, walletsResult, recoveryResult] = await Promise.all([
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
        .select("id,recovery_id,latest_revision,latest_saved_at,failed_attempts,locked_until,created_at,updated_at,latest_save")
        .order("updated_at", { ascending: false }).limit(1000),
    ]);

    type Season = { id: string; name: string; status: string; starts_at: string; ends_at: string };
    const seasonRows = (seasons ?? []) as Season[];
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

    type Profile = Record<string, unknown> & { user_id: string };
    const arenaPlayers = ((profilesResult.data ?? []) as Profile[]).map((profile) => {
      const standing = standingMap.get(profile.user_id) ?? {} as Standing;
      const wallet = walletMap.get(profile.user_id) ?? {} as Wallet;
      return {
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
    const recoveryAccounts = ((recoveryResult.data ?? []) as RecoveryRow[]).map((account) => ({
      id: account.id,
      recoveryId: account.recovery_id,
      latestRevision: number(account.latest_revision),
      latestSavedAt: account.latest_saved_at,
      failedAttempts: number(account.failed_attempts),
      lockedUntil: account.locked_until,
      createdAt: account.created_at,
      updatedAt: account.updated_at,
      ...saveSummary(account.latest_save),
    }));

    return json({
      generatedAt: new Date().toISOString(),
      activeSeason,
      summary: {
        authUsers: authResult.data?.users?.length ?? 0,
        arenaProfiles: arenaPlayers.length,
        recoveryAccounts: recoveryAccounts.length,
      },
      arenaPlayers,
      recoveryAccounts,
    });
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
