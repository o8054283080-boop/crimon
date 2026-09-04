import { describe, expect, it } from "vitest";
import { TOWER70_V7_NUMBERS } from "../tools/battleLab/scenarios/tower70v7.js";

/*
 * **計測はここから外した。**
 *
 * 元は「1000戦×5攻略順を実測してログへ出す」という `it` があったが、
 * 確かめていたのは `expect(rows).toHaveLength(5)` だけ——5回ループしたことしか
 * 見ておらず、肝心の数字は `console.log` へ流すだけだった。
 * そのために毎回のCIが約170秒(7件で)遅くなっていた。**測定はテストではない。**
 *
 * 数字が要る時は `npx tsx tools/battleLab/tower70/measure.ts` から回す。
 * ここに残すのは、壊れたら落ちる仕様の見張りだけ。
 */

describe("70階V7: HP17万 / ATK8000 / 回復阻害3体 vs 混合2型", () => {
  it("第7回は始祖ベヒモス HP170000 / ATK8000", () => {
    expect(TOWER70_V7_NUMBERS.bossHp).toBe(170_000);
    expect(TOWER70_V7_NUMBERS.bossAtk).toBe(8_000);
  });
});
