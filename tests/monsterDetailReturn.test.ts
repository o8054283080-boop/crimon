import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/*
 * 編成から開いたモンスター詳細は、閉じたら編成へ帰るか。
 *
 * ## なぜ壊れていたのか
 *
 * モンスターの詳細は「所持モンスター」画面(`screen === "MONSTERS"`)の
 * 中にしか無い。そのため編成画面から詳細を見るには `screen` を
 * `MONSTERS` へ移すしかなく、実際そう書かれていた:
 *
 *     onViewDetail: (id) => { state.monsterDetailId = id; state.screen = "MONSTERS"; render(); }
 *
 * **どこから来たかを控えていないので、閉じた人は所持一覧に立っていた。**
 * 編成の途中で1体調べただけなのに、選びかけの画面から放り出される。
 * 依頼主の報告で分かった(「編成画面からモンスターの詳細をタップし、
 * 戻ると編成画面にいかないでモンスターの画面にいってしまいます」)。
 *
 * 同じ書き方が3か所にあった。パーティ編成・アリーナの編成・ホームのパーティ札。
 *
 * ## 帰り先は画面名だけでは足りない
 *
 * パーティ編成は通常・装備ダンジョン・試練の塔で別々の枠を持ち、
 * アリーナは攻撃編成と防衛登録で別の画面になる。画面名だけ戻すと
 * **帰れてはいるが別の編成が開いている**という直しそこないになるので、
 * `partyEditMode` と `arenaView` まで復元する。
 *
 * ## 控えは1回きり
 *
 * `monsterDetailReturn` は「見ている場所」ではなく片道の控えなので
 * `RouteState` には入れない。代わりに、画面を移る2つの口
 * (`navigate` と `goBack`)で必ず捨てる。捨てないと、編成から詳細を
 * 開いた人が別の画面へ移った後、無関係な詳細を閉じた時にまで編成へ飛ぶ。
 *
 * ## なぜ本文を読む形で書くのか
 *
 * `main.ts` は起動時に画面を組み立てるので、テストから読み込めない
 * (`arenaNavigation.test.ts` と同じ理由)。画面を動かす代わりに、
 * 約束が本文に書かれていることを見張る。消されたら落ちる。
 */

const main = readFileSync(new URL("../src/web/main.ts", import.meta.url), "utf8");

/** `function <名前>(...) { ... }` の中身を、対応する閉じ括弧まで取り出す */
function functionBody(signature: string): string {
  const at = main.indexOf(signature);
  expect(at, `${signature} が無い`).toBeGreaterThan(-1);
  const end = main.indexOf("\n}", at);
  expect(end, `${signature} の終端が見つからない`).toBeGreaterThan(at);
  return main.slice(at, end);
}

describe("編成から開いた詳細の帰り先", () => {
  it("詳細を開く3か所が、素の画面切り替えではなく帰り先つきの入口を通る", () => {
    // パーティ編成の長押し
    expect(main).toContain('openMonsterDetail(instanceId, { kind: "PARTY", mode: state.partyEditMode })');
    // アリーナの攻撃編成・防衛登録
    expect(main).toContain('openMonsterDetail(instanceId, { kind: "ARENA", view: state.arenaView })');
    // ホームのパーティ札
    expect(main).toContain('openMonsterDetail(id, { kind: "HOME" })');

    /*
     * 素の書き方へ戻っていないこと。**「詳細を新しく開く口」だけを見る。**
     *
     * `state.monsterDetailId = x; state.screen = "MONSTERS";` という並び自体は
     * 他にも2か所あるが、どちらも**既に詳細を見ていた人を詳細へ帰す**もので
     * (強化を実行した後・装備画面から戻る時)、控えはそのまま残るので
     * そこから「戻る」を押せば元の編成へ帰れる。混ぜて数えると
     * 正しい2か所のせいで落ち続ける。
     *
     * 新しく開く口は `onView…` という名前で揃っているので、そこだけを読む。
     */
    const openers = main.match(/onView\w*: \([^)]*\) =>\s*\{[^}]*\}/g) ?? [];
    expect(openers.length, "詳細を開く口が見つからない").toBeGreaterThanOrEqual(3);
    for (const opener of openers) {
      expect(opener, "帰り先を控えずに所持一覧へ移している").not.toContain('state.screen = "MONSTERS"');
    }
  });

  it("閉じる時、控えがあればその画面と「どこを見ていたか」まで戻す", () => {
    const body = functionBody("function returnFromMonsterDetail(): boolean {");

    expect(body, "控えが無ければ何もしない").toContain("if (!from) return false;");
    // 画面名だけでなく、その画面の中の位置まで戻す
    expect(body, "編成の種類を戻していない").toContain("state.partyEditMode = from.mode;");
    expect(body, "アリーナの行き先を戻していない").toContain("state.arenaView = from.view;");
    expect(body).toContain('state.screen = "PARTY";');
    expect(body).toContain('state.screen = "ARENA";');
    expect(body).toContain('state.screen = "HOME";');
    // 使った控えは残さない
    expect(body, "控えを使い捨てにしていない").toContain("state.monsterDetailReturn = null;");
  });

  it("詳細を閉じる入口が、既存のダンジョン用の戻り道より先に控えを見る", () => {
    const at = main.indexOf("onSelectDetail: (id) => {");
    expect(at, "onSelectDetail が無い").toBeGreaterThan(-1);
    const body = main.slice(at, at + 600);

    const mine = body.indexOf("returnFromMonsterDetail()");
    const dungeon = body.indexOf("state.returnContext");
    expect(mine, "控えを見ていない").toBeGreaterThan(-1);
    expect(dungeon, "ダンジョン用の戻り道が消えている").toBeGreaterThan(-1);
    expect(mine, "ダンジョン用の戻り道より後に控えを見ている").toBeLessThan(dungeon);
  });

  it("画面を移る2つの口で、片道の控えを必ず捨てる", () => {
    expect(
      functionBody("function navigate(screen: ScreenName): void {"),
      "navigate が控えを捨てていない",
    ).toContain("state.monsterDetailReturn = null;");

    expect(
      functionBody("function goBack(): void {"),
      "goBack が控えを捨てていない",
    ).toContain("state.monsterDetailReturn = null;");
  });

  it("控えは「見ている場所」ではないので、戻る履歴には積まない", () => {
    const at = main.indexOf("const ROUTE_FIELDS = [");
    expect(at, "ROUTE_FIELDS が無い").toBeGreaterThan(-1);
    const block = main.slice(at, main.indexOf("]", at));
    expect(block).not.toContain("monsterDetailReturn");
  });
});
