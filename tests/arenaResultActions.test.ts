import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/*
 * 決着のあとの出口。
 *
 * ## アリーナに「もう一度」は出さない
 *
 * ほかの場所の「もう一度」は同じ階へ挑み直すことで、**周回そのものが遊びの形**に
 * なっている。アリーナは違う。相手は毎回選ぶもので、同じ人へ挑み直すのは
 * 「選ぶ」を飛ばすだけになる。勝った相手にもう一度挑んで挑戦券を1枚使うのは、
 * ほとんどの場合やりたいことではない(依頼主の指定)。
 *
 * 代わりに「選び直す」が主役になり、押したら**すぐ相手の一覧へ行く。**
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
  it("「もう一度」を積まない", () => {
    /*
     * 出す・出さないを分けているのはこの1行。消えると、
     * 勝った相手へ挑み直す道が主役の位置に戻ってくる。
     */
    const body = resultActionsBody();
    expect(body).toContain('const isArena = last?.kind === "ARENA";');
    expect(body).toContain("if (last && !isArena) {");
  });

  it("「選び直す」が主役になっている", () => {
    // 「もう一度」を外したぶん、ここが主役でないと押す先が分からなくなる
    const body = resultActionsBody();
    expect(body).toContain('label: isArena ? "⚔ 相手を選び直す" : "🗺 選び直す"');
    expect(body).toContain('variant: isArena ? "primary" : undefined');
  });

  it("スタミナの表示にアリーナが混ざっていない", () => {
    /*
     * アリーナは挑戦券で回すので ⚡ を出すと嘘になる。
     * 「もう一度」を出さなくなった以上、その分岐は要らない——
     * 残っていると、読む人が「アリーナでも出る」と誤解する。
     */
    expect(resultActionsBody()).not.toContain("もう一度 (挑戦券1)");
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
