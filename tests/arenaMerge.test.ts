/**
 * 分かれてしまったアリーナアカウントを、1つに合わせる。
 *
 * ## なぜ要るのか
 *
 * アリーナの身元は端末の localStorage にしかないので、機種を変えたり
 * サイトデータが消えたりすると新しい匿名ユーザが生まれ、
 * ランキングに**同じ名前で2人**並ぶ(荒モンボス猿さん)。
 * 以後は気づけるようにしたが、**既に分かれたぶんは合わせるしかない。**
 *
 * ## ここで見張ること
 *
 * **本番のデータを動かす。**取り返しがつかない操作なので、
 *
 *   1. 表を1つも漏らさないこと(`arena_profiles` は9つから CASCADE で参照されている)
 *   2. 親を消すのは、子を全部移した**後**であること
 *   3. 実行前の姿を控えてから触ること
 *   4. 押し間違いで実行できないこと
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const SQL = read("supabase/migrations/20260922090000_arena_merge.sql");
const EDGE = read("supabase/functions/crimon-admin/index.ts");
const PANEL = read("src/web/adminPanel.ts");
const CSS = read("src/web/adminPanel.css");

describe("表を1つも漏らさない", () => {
  /**
   * `arena_profiles.user_id` を参照している表。**本番から取得した一覧**
   * (`docs/handoff.md`)。1つでも漏らすと、成績やコインが置き去りになるか、
   * 親を消した時に CASCADE で道連れになって**消える。**
   */
  const TABLES = [
    "arena_standings",
    "arena_wallets",
    "trial_tower_progress",
    "arena_defenses",
    "arena_season_results",
    "arena_reward_claims",
    "personal_gifts",
    "arena_matches",
    "arena_match_sessions",
    "arena_shop_purchases",
  ];

  for (const table of TABLES) {
    it(`${table} を扱っている`, () => {
      expect(SQL, `${table} が抜けている(置き去りか、道連れで消える)`).toContain(table);
    });
  }

  it("控えにも、消える側の中身を全部入れる", () => {
    // 戻す時はこれだけが頼り
    for (const key of ["profile", "standings", "wallet", "tower", "defense", "season_results", "reward_claims", "gifts"]) {
      expect(SQL, `控えに ${key} が無い`).toContain(`'${key}',`);
    }
  });
});

describe("親を消すのは最後", () => {
  it("arena_profiles の削除が、子より後にある", () => {
    /*
     * 親を先に消すと、9つの子が CASCADE で道連れになる。
     * **移す前に消えるので、何も残らない。**
     */
    const parent = SQL.indexOf("delete from public.arena_profiles");
    expect(parent).toBeGreaterThan(-1);
    for (const table of ["arena_standings", "arena_wallets", "trial_tower_progress", "arena_matches"]) {
      const child = SQL.lastIndexOf(table);
      expect(child, `${table} の処理が親の削除より後にある`).toBeLessThan(parent);
    }
  });
});

describe("合わせ方", () => {
  it("レートは高い方、勝敗は合算", () => {
    expect(SQL).toContain("rating         = greatest(t.rating, f.rating)");
    expect(SQL).toContain("wins           = t.wins + f.wins");
  });

  it("挑戦券は合算しない(持てる数なので)", () => {
    expect(SQL).toContain("tickets        = greatest(t.tickets, f.tickets)");
    expect(SQL).toContain("coins          = t.coins + f.coins");
  });

  it("塔は高い階と、その階に着いた時刻", () => {
    expect(SQL).toContain("best_floor            = greatest(t.best_floor, f.best_floor)");
    expect(SQL).toContain("case when f.best_floor > t.best_floor then f.best_floor_reached_at");
  });

  it("受け取り記録は、衝突したら残す(二重受け取りを作らない)", () => {
    const at = SQL.indexOf("public.arena_reward_claims c set user_id");
    expect(at).toBeGreaterThan(-1);
    expect(SQL.slice(at, at + 400)).toContain("not exists");
  });

  it("防衛編成は新しい方を残す", () => {
    // 古い編成を持ってくると、いま持っていないモンスターが並ぶ
    expect(SQL).toContain("**新しい方を残す。**");
  });

  it("登録日は古い方を残す(いつから遊んでいるか)", () => {
    expect(SQL).toContain("created_at = least(t.created_at, f.created_at)");
  });

  it("片方しか持っていない時刻を epoch へ落とさない", () => {
    expect(SQL).toContain("'-infinity'::timestamptz");
    expect(SQL).toContain("nullif(greatest(");
  });
});

describe("取り返しがつく", () => {
  it("実行前の姿を控える表がある", () => {
    expect(SQL).toContain("create table if not exists public.crimon_arena_merge_log");
    expect(SQL).toContain("before_snapshot jsonb       not null");
  });

  it("控えてから触る(控える前に書き換えない)", () => {
    const snapshot = SQL.indexOf("v_before := jsonb_build_object");
    const firstWrite = SQL.indexOf("update public.arena_standings");
    expect(snapshot).toBeGreaterThan(-1);
    expect(snapshot, "控える前に書き換えている").toBeLessThan(firstWrite);
  });

  it("何も書かずに予測だけ返せる", () => {
    expect(SQL).toContain("if p_dry_run then");
    const dry = SQL.indexOf("if p_dry_run then");
    const firstWrite = SQL.indexOf("update public.arena_standings");
    expect(dry, "書き換えの後で判定している").toBeLessThan(firstWrite);
  });

  it("同じIDや、居ないIDでは止まる", () => {
    expect(SQL).toContain("raise exception 'SAME_USER'");
    expect(SQL).toContain("raise exception 'FROM_NOT_FOUND'");
    expect(SQL).toContain("raise exception 'TO_NOT_FOUND'");
  });

  it("クライアントからは呼べない", () => {
    // service_role だけ。プレイヤーが叩けたら、他人の成績を動かせてしまう
    expect(SQL).toContain("revoke all on function public.crimon_arena_merge(uuid, uuid, boolean) from public, anon, authenticated");
  });
});

describe("押し間違いで実行できない", () => {
  it("確認だけと実行が別のアクション", () => {
    expect(EDGE).toContain('action === "arena_merge_preview" || action === "arena_merge"');
    expect(EDGE).toContain('const dryRun = action === "arena_merge_preview"');
  });

  it("実行の側だけ、移し先の表示名を合言葉に要る", () => {
    expect(EDGE).toContain("confirm_name_mismatch");
    const at = EDGE.indexOf("if (!dryRun) {");
    expect(at).toBeGreaterThan(-1);
    expect(EDGE.slice(at, at + 500)).toContain("body.confirmName");
  });

  it("UUID以外は受け取らない", () => {
    const at = EDGE.indexOf('action === "arena_merge_preview"');
    expect(EDGE.slice(at, at + 700)).toContain("invalid_user_id");
  });

  it("画面でも、押す前に確かめる", () => {
    expect(PANEL).toContain("function renderArenaMerge(");
    expect(PANEL).toContain("window.confirm(");
    expect(PANEL).toContain("こうなります（確認だけ）");
  });

  it("実行のボタンは、見分けが付く形にする", () => {
    expect(PANEL).toContain("crimon-admin-btn--danger");
    expect(CSS).toContain(".crimon-admin-merge__actions");
  });

  it("同じ名前を隣どうしに並べる(名前順)", () => {
    // 動きの新しい順だと、同名の2人が離れて選び間違える
    expect(PANEL).toContain('localeCompare(b.displayName || "", "ja")');
  });
});
