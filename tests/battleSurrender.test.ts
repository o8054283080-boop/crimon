import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/*
 * 戦闘を諦めるボタン。
 *
 * ## なぜ足したか
 *
 * 耐久寄りの編成で塔の上の階へ挑むと、**どちらも倒しきれないまま
 * 数百手まで伸びる**戦いになる(100階の実測で平均224手・引き分け15.3%)。
 * それまでは手を止める術が無く、アプリを閉じるしかなかった。
 *
 * ## ここで見張っていること
 *
 * DOMを組む関数なので、中身はソースを読んで確かめる。
 * **型もテストもCSSの重なりを拾わない**ので、置き場所と幅は
 * 実ブラウザで測ってある(390px・周回の札あり・塔100階の名前)。
 * ここが守るのは「その測定の前提が崩れていないか」だけ。
 */
const source = readFileSync(new URL("../src/web/views/battleView.ts", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/web/ui/battleSurrender.css", import.meta.url), "utf8");
const mainSource = readFileSync(new URL("../src/web/main.ts", import.meta.url), "utf8");

describe("戦闘を諦める", () => {
  it("押すと敗北として決着する。周回に入っていればそこで打ち切る", () => {
    expect(source, "諦めが敗北として決着していない").toContain('showResult("ENEMY", true)');
    /*
     * **周回を止めないと意味が無い。**1戦を諦めただけのつもりで
     * 次の1戦が始まってしまうのでは、そもそも止めたくて押している人の
     * 用が足りない。
     */
    const at = source.indexOf('showResult("ENEMY", true)');
    expect(source.slice(Math.max(0, at - 400), at), "周回を打ち切っていない").toContain("chain.onStop()");
  });

  /*
   * 押した1回では終わらせない。一時停止は戦況を見るためにも押すので、
   * その隣に「押したら戦いが終わるボタン」が黙って並ぶことになる。
   */
  it("2段階にする。5秒放っておけば元へ戻る", () => {
    expect(source).toContain("battle-surrender-btn--armed");
    expect(source).toContain("本当にやめる?");
    expect(source).toMatch(/setTimeout\(disarmSurrender, 5000\)/);
    // 再生に戻した時も畳む(止めて考え直した結果として再生を押している)
    expect(source).toMatch(/if \(!userPaused\) \{\s*disarmSurrender\(\);/);
  });

  /*
   * **上帯の操作の列には入れない。**
   *
   * 一度は並べたが、実測(390px・周回の札あり)で塔100階の
   * 「塔 100階 癒やしの階」(必要137px)が**36pxまで潰れた。**
   * 確認の「本当にやめる?」に変わると5px——ほぼ消える。
   * 階の呼び名は、その階で何が起きるか(癒やし・守り・群れ・疾風)を
   * 伝える攻略の情報で、戦っている間ずっと要る。
   */
  it("上帯の操作の列に入れない。名前を潰さない位置へ置く", () => {
    const bar = source.slice(source.indexOf('className: "battle-topbar__controls"'));
    expect(bar.slice(0, bar.indexOf("]),")), "上帯の列へ戻っている").not.toContain("surrenderBtn");
    expect(source, "戦場側へ足していない").toContain("if (surrenderBtn) stageHost.append(surrenderBtn)");
    // ログ帯と同じ式で上帯の下へ降ろす。上帯の高さは中の丸ボタンで決まる
    expect(css).toContain("top: calc(max(8px, env(safe-area-inset-top)) + 70px)");
  });

  /*
   * 出していない間は場所ごと空ける。`visibility` で残すと、
   * 隠している時まで幅を取って名前を削ってしまう。
   */
  it("再生中と決着後は場所ごと空ける", () => {
    const gone = css.slice(css.indexOf(".battle-surrender-btn--gone"));
    expect(gone.slice(0, gone.indexOf("}"))).toContain("display: none");
    expect(source, "既定で隠していない").toContain('className: "battle-surrender-btn battle-surrender-btn--gone"');
    expect(source, "決着後に残っている").toMatch(/surrenderBtn\?\.classList\.add\("battle-surrender-btn--gone"\)/);
  });

  /*
   * **対人戦だけは諦められない。**
   *
   * 勝敗はサーバが同じ種で戦闘を再現して決める。こちらで負けにしても
   * 向こうは勝ちのまま進むので、画面とサーバが別の結末を持つ。
   */
  it("対人戦では出さない", () => {
    expect(source).toContain("canSurrender = props.canSurrender !== false");
    const arena = mainSource.slice(mainSource.indexOf("finishArenaMatch(winner === \"PLAYER\")"));
    expect(arena.slice(0, 600), "アリーナで諦めを塞いでいない").toContain("canSurrender: false");
  });

  /*
   * 扱いは負けと同じでも、押した本人にとっては起きたことが違う。
   * 負けた覚えのない「💀 敗北…」は、不具合で落とされたようにしか読めない。
   */
  it("結果は「敗北」ではなく「諦めました」と出す", () => {
    expect(source).toContain('"🏳 諦めました"');
    expect(source).toContain("function showResult(winner: BattleWinner, surrendered = false)");
  });
});
