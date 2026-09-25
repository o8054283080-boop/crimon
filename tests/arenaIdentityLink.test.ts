/**
 * アリーナのアカウントが2つに分かれる件。
 *
 * ## 実際に起きたこと(依頼主の指摘)
 *
 * 「荒モンボス猿さんが2人になってしまっています」。ランキングに同じ名前で
 * **レート2535(99勝6敗)と レート1180(10勝0敗)**が並んだ。
 *
 * **アリーナの身元は端末の localStorage にしかない**(`crimon.arena.auth.v1`)。
 * クラウドの控えにもセーブファイルにも入らないので、
 *
 *   - 端末やブラウザを変えた
 *   - サイトデータが消えた(iOS Safari は訪問が途切れると消すことがある)
 *   - クラウド復旧で別端末へ移した
 *
 * のどれかで新しい匿名ユーザが生まれる。名前はセーブから来るので、
 * **同じ名前で2人**になる。
 *
 * 復旧IDの側に「この人のアリーナはこれ」を覚えさせておけば、気づける。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const SQL = read("supabase/migrations/20260922080000_recovery_arena_link.sql");
const RECOVERY = read("supabase/functions/crimon-recovery/index.ts");
const CLOUD = read("src/game/cloudRecovery.ts");
const BOOTSTRAP = read("src/web/cloudRecoveryBootstrap.ts");
const ARENA_AUTH = read("src/net/arenaAuth.ts");
const ADMIN_EDGE = read("supabase/functions/crimon-admin/index.ts");
const ADMIN_PANEL = read("src/web/adminPanel.ts");
const APPLY = read(".github/workflows/db-apply-sql.yml");

describe("身元が勝手に作り直されないこと(元からある守り)", () => {
  it("更新に失敗しても、新しい匿名ユーザを作らない", () => {
    /*
     * ここが緩むと、通信が一度こけただけで**別人**になる。
     * 新規作成は「保存済みの本人が存在しない初回だけ」。
     */
    expect(ARENA_AUTH).toContain("保存済み本人が存在しない初回だけ");
    const login = ARENA_AUTH.indexOf("async function login(");
    const block = ARENA_AUTH.slice(login);
    const refresh = block.indexOf("stored?.refreshToken");
    const signup = block.indexOf('post("signup"');
    expect(refresh).toBeGreaterThan(-1);
    // signup は refresh の分岐より後ろ(= refresh が無い時だけ通る)
    expect(signup).toBeGreaterThan(refresh);
  });

  it("身元を捨てる関数は、どこからも呼ばれていない", () => {
    // `clearArenaAuth` を普段使いすると、次の起動で別人になる
    for (const path of ["src/web/main.ts", "src/web/cloudRecoveryBootstrap.ts", "src/web/views/home.ts"]) {
      expect(read(path), `${path} が身元を捨てている`).not.toContain("clearArenaAuth");
    }
  });
});

describe("復旧IDに、アリーナの身元を覚えさせる", () => {
  it("列を足すSQLがある。**冪等**であること", () => {
    expect(SQL).toContain("add column if not exists arena_user_id uuid");
    expect(SQL).toContain("create index if not exists");
  });

  it("外部キーは張らない(arena_profiles が消えても復旧データは残す)", () => {
    expect(SQL).not.toMatch(/references\s+public\.arena_profiles/i);
  });

  it("登録時に記録し、バックアップでは既存の身元を動かさない", () => {
    expect(RECOVERY).toContain("function arenaUserId(");
    expect(RECOVERY).toContain("arena_user_id: arenaUserId(body.arenaUserId)");
    // 保存時は既存IDを読むだけ。競合再試行が戦績移動を起こしてはいけない。
    const save = RECOVERY.indexOf('action === "save"');
    expect(RECOVERY.slice(save)).not.toContain("reconcileArenaIdentity(");
    expect(RECOVERY.slice(save)).toContain('select("arena_user_id")');
  });

  it("送られてこない時は消さない", () => {
    /*
     * 古い版のクライアントが上げた時に、覚えていた身元を失いたくない。
     * **消えると、2つに分かれたことに気づけなくなる。**
     */
    const save = RECOVERY.indexOf('action === "save"');
    expect(RECOVERY.slice(save)).not.toContain('.update({ arena_user_id: arena })');
    expect(RECOVERY).toContain("if (!current) return remembered;");
  });

  it("ログイン・復旧・読み込みで返す", () => {
    expect(RECOVERY).toContain("arenaUserId: resolvedArenaUserId ?? account.arena_user_id ?? null");
    expect(RECOVERY).toContain("arenaUserId: data.arena_user_id ?? null");
  });

  it("形だけを検める(UUID以外は受け取らない)", () => {
    expect(RECOVERY).toMatch(/\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}/);
  });
});

describe("クライアントが、身元を送って受け取る", () => {
  it("保存と登録で送る", () => {
    expect(CLOUD).toContain("action: \"save\", sessionToken: meta.sessionToken, revision, save, arenaUserId");
    expect(CLOUD).toContain("action: \"register\", recoveryId: normalized, password, save, arenaUserId");
    expect(CLOUD).toContain("action: \"login\", recoveryId: normalized, password, arenaUserId");
    expect(CLOUD).toContain("action: \"recover\", recoveryId: normalized, recoveryKey: recoveryKey.trim().toUpperCase(), arenaUserId");
    // 実際に今の身元を渡していること(渡し忘れると常に空で上がる)
    expect(BOOTSTRAP).toContain("uploadCloudSave(meta, save, arenaAuthUserId())");
    expect(BOOTSTRAP).toContain("registerRecovery(id.value, password.value, save, arenaAuthUserId())");
  });

  it("受け取った身元を控える", () => {
    expect(CLOUD).toContain("arenaUserId: data.arenaUserId ?? null");
  });
});

describe("入れ替わっていたら、そう伝える", () => {
  it("サーバの記録と、いまの身元がずれていたら出す", () => {
    expect(BOOTSTRAP).toContain("meta.arenaUserId && mine && meta.arenaUserId !== mine");
    expect(BOOTSTRAP).toContain("アリーナが別のアカウントになっています");
  });

  it("**直せるふりをしない**", () => {
    /*
     * 成績を移すのは運営の仕事で、プレイヤーの画面からは直せない。
     * 押しても何も起きないボタンを置く方が、何も置かないより悪い。
     */
    const at = BOOTSTRAP.indexOf("アリーナが別のアカウントになっています");
    const block = BOOTSTRAP.slice(at - 200, at + 800);
    expect(block).toContain("お問い合わせください");
    expect(block).not.toContain("btn btn--primary");
  });

  it("手持ちは無事だと書く(いちばん不安な所)", () => {
    expect(BOOTSTRAP).toContain("手持ちのモンスターや装備は無事");
  });
});

describe("管理者画面から、どちらが本人か引き当てられる", () => {
  it("復旧IDの行にアリーナIDを出す", () => {
    expect(ADMIN_EDGE).toContain("arenaUserId: account.arena_user_id ?? null");
    expect(ADMIN_EDGE).toContain("latest_save,arena_user_id");
    expect(ADMIN_PANEL).toContain("row.arenaUserId");
  });
});

describe("本番へSQLを流す道", () => {
  it("押した時だけ動く", () => {
    expect(APPLY).toContain("workflow_dispatch:");
    expect(APPLY).not.toMatch(/^on:\s*\n\s*push:/m);
  });

  it("流せるのは supabase/migrations の .sql だけ", () => {
    expect(APPLY).toContain("supabase/migrations/*.sql)");
  });

  it("1本の取引にまとめる(途中で落ちたら何も残さない)", () => {
    expect(APPLY).toContain("--single-transaction");
    expect(APPLY).toContain("ON_ERROR_STOP=1");
  });

  it("鍵が無い時は落とす", () => {
    expect(APPLY).toContain("SUPABASE_DB_PASSWORD が登録されていません");
  });
});


describe("分裂を検知したら自動で元成績へ戻す", () => {
  const RELINK = read("supabase/migrations/20260922183000_arena_identity_relink.sql");

  it("復旧IDで本人確認した後だけrelinkする", () => {
    expect(RECOVERY).toContain('supabase.rpc("crimon_arena_relink"');
    expect(RECOVERY).toContain("remembered === current");
  });

  it("新しい側の仮戦績を合算せず破棄する", () => {
    expect(RELINK).toContain("delete from public.arena_standings where user_id = p_to");
    expect(RELINK).toContain("update public.arena_standings set user_id = p_to where user_id = p_from");
    expect(RELINK).not.toContain("wins +");
  });

  it("ブラウザからRPCを直接呼べない", () => {
    expect(RELINK).toContain("revoke all on function public.crimon_arena_relink(uuid, uuid) from public, anon, authenticated");
  });
});
