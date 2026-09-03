import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/*
 * 決着のあとの出口。
 *
 * ## アリーナで「もう一度」を出すのは、負けた時だけ
 *
 * ほかの場所の「もう一度」は同じ階へ挑み直すことで、**周回そのものが遊びの形**に
 * なっている。アリーナは違う。相手は毎回選ぶもので、勝った相手へもう一度挑んで
 * 挑戦券を1枚使うのは、ほとんどの場合やりたいことではない。
 *
 * 負けた時は違う。**同じ相手に挑み直したい**のが素直な流れなので、そこだけ残す
 * (依頼主の指定)。
 *
 * 「選び直す」は押したら**すぐ相手の一覧へ行く。**
 * 以前はアリーナのトップへ戻っていたので、そこから「対戦」をもう1回
 * 押さないと相手を選べなかった。
 *
 * ## なぜ本文を読む形で書くのか
 *
 * `main.ts` は起動時に画面を組み立てるので、テストから読み込めない。
 * 画面を動かす代わりに、**約束が本文に書かれていること**を見張る
 * (`tests/arenaNavigation.test.ts` と同じ作り)。
 */

const main = readFileSync(new URL("../src/web/main.ts", import.meta.url), "utf8");

/** `function buildResultActions(...) { ... }` の中身 */
function resultActionsBody(): string {
  const at = main.indexOf("function buildResultActions(");
  expect(at, "buildResultActions が無い").toBeGreaterThan(-1);
  const end = main.indexOf("\n}", at);
  return main.slice(at, end);
}

/** `function backToLastRunList(): void { ... }` の中身 */
function backToListBody(): string {
  const at = main.indexOf("function backToLastRunList(): void {");
  expect(at, "backToLastRunList が無い").toBeGreaterThan(-1);
  const end = main.indexOf("\n}", at);
  return main.slice(at, end);
}

describe("アリーナの決着画面", () => {
  it("勝った時は「もう一度」を積まない", () => {
    /*
     * 出す・出さないを分けているのはこの2行。消えると、
     * 勝った相手へ挑み直す道が主役の位置に戻ってくる。
     */
    const body = resultActionsBody();
    expect(body).toContain('const isArena = last?.kind === "ARENA";');
    expect(body).toContain('const arenaRetry = isArena && state.stageResult?.cleared === false;');
    expect(body).toContain("if (last && (!isArena || arenaRetry)) {");
  });

  it("負けた時だけ、同じ相手へ挑み直せる", () => {
    // 負けた直後は「同じ相手にやり返す」のが素直な流れ
    expect(resultActionsBody()).toContain('"🔁 同じ相手にもう一度 (挑戦券1)"');
  });

  it("主役が2つにならない", () => {
    /*
     * 勝った時は「選び直す」が主役。負けた時は「もう一度」が主役。
     * どちらも primary にすると、押してほしい方が分からなくなる。
     */
    const body = resultActionsBody();
    expect(body).toContain('label: isArena ? "⚔ 相手を選び直す" : "🗺 選び直す"');
    expect(body).toContain('variant: isArena && !arenaRetry ? "primary" : undefined');
  });

  it("スタミナの表示がアリーナに出ない", () => {
    // アリーナは挑戦券で回すので ⚡ を出すと嘘になる
    const body = resultActionsBody();
    expect(body).toContain("arenaRetry\n          ? \"🔁 同じ相手にもう一度 (挑戦券1)\"");
  });
});

describe("選び直した先", () => {
  it("アリーナは相手の一覧へ行く", () => {
    /*
     * `navigate("ARENA")` だけだとトップに戻る(`navigate` が中の行き先を畳む)。
     * そこから「対戦」をもう1回押させるのは、**選び直すと言っておいて
     * 選ばせない**ことになる。
     */
    const body = backToListBody();
    expect(body).toContain('navigate("ARENA")');
    expect(body).toContain('state.arenaView = "OPPONENTS"');
  });

  it("畳んだ後に開き直す順番になっている", () => {
    // 逆だと `navigate` が畳んでしまい、トップのまま出る
    const body = backToListBody();
    expect(body.indexOf('navigate("ARENA")'))
      .toBeLessThan(body.indexOf('state.arenaView = "OPPONENTS"'));
  });
});

describe("配信でオンラインになれること", () => {
  const deploy = readFileSync(new URL("../.github/workflows/deploy-pages.yml", import.meta.url), "utf8");

  it("組み立てに Supabase の環境変数を渡している", () => {
    /*
     * **渡さないと、配信されたページは永久にオフライン。**
     *
     * Vite は `VITE_` を組み立ての時に焼き込む。渡さなければ
     * `arenaSyncAvailable()` がずっと false になり、ランキングは
     * 「ローカル(この端末の中だけ)」のままになる。
     * 表もRPCもEdge Functionも整っているのに、そこへ繋ぎに行かない。
     */
    expect(deploy).toContain("VITE_SUPABASE_URL:");
    expect(deploy).toContain("VITE_SUPABASE_ANON_KEY:");
  });

  it("service_role を配信へ渡していない", () => {
    /*
     * 1か所でも入ると、サーバ側の守りが全部無意味になる。
     *
     * **注釈は数えない。** 「ここへ書かないこと」という戒めそのものに
     * 同じ言葉が入るので、文字列で探すと自分の注意書きに引っかかる
     * (実際に引っかかった)。見るのは実際の設定行だけ。
     */
    const statements = deploy
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("#"))
      .join("\n");
    expect(statements).not.toMatch(/service_role/i);
  });
});

describe("相手を変える回数", () => {
  const main2 = readFileSync(new URL("../src/web/main.ts", import.meta.url), "utf8");
  const view = readFileSync(new URL("../src/web/views/arena/opponents.ts", import.meta.url), "utf8");
  const data = readFileSync(new URL("../src/data/pvpArena.ts", import.meta.url), "utf8");
  const match = readFileSync(new URL("../src/game/arena/match.ts", import.meta.url), "utf8");

  it("回数の上限は1か所で決める", () => {
    // 画面と処理で別々に持つと、必ずどちらかが古くなる(この案件で何度も出た)
    expect(data).toContain("export const ARENA_REROLL_LIMIT = 3;");
    expect(main2).toContain("ARENA_REROLL_LIMIT");
  });

  it("使い切ったら押せない", () => {
    /*
     * **押せなくするだけでなく、処理側でも弾く。**
     * 画面のボタンを消すのは案内であって、制限ではない。
     */
    expect(main2).toContain("if (state.player.arenaRerollsSinceBattle >= ARENA_REROLL_LIMIT) {");
    expect(view).toContain("disabled: left <= 0");
  });

  it("1戦すると数え直す", () => {
    /*
     * 日付で区切らないのは、**挑めば戻る**方が分かりやすいから。
     * 防衛(留守中に攻められた分)では戻さない——自分が挑んだわけではない。
     */
    expect(match).toContain("state.arenaRerollsSinceBattle = 0;");
    const offense = match.slice(match.indexOf('if (input.side === "OFFENSE") {'));
    expect(offense.indexOf("state.arenaRerollsSinceBattle = 0;")).toBeGreaterThan(-1);
  });

  it("残り回数を札に出す", () => {
    // 押せなくなってから理由を探させない
    expect(view).toContain("相手を変える（残り ${left} / ${props.rerollLimit}）");
    expect(view).toContain("1戦すると、また変えられます");
  });

  it("一覧の下にも置く", () => {
    /*
     * 候補は5人ぶん縦に伸びるので、全部見終わった時には上のボタンは画面の外。
     * そこから指を戻させるのは、「どれも違った」と分かった直後に
     * いちばんやらせたくない動きになる。
     */
    const count = view.split("rerollButton(props)").length - 1;
    expect(count, "上と下の2か所に無い").toBeGreaterThanOrEqual(2);
  });
});
