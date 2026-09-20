import { Skill, describeSkillLines } from "../../core/skill.js";
import { levelMultiplier, starMultiplier } from "../../core/rarity.js";

/**
 * コラボ4種(モッチー・スエゾー・ウンディーネ・グジラ)で使い回す決まりごと。
 *
 * 4種はいずれも**6属性ぶんが同時に生まれる**ので、
 * 「1体だけ違う値を書いてしまった」が起きると24体のうち何体に
 * 波及したのかが分からなくなる。数字はここと各種族のファイルの
 * 冒頭にだけ置き、スキルの中には散らさない。
 */

/** ★6 Lv60 の成長倍率。1.4^5 × 2.0 = 10.75648 */
const STAR6_LV60_MULTIPLIER = starMultiplier(6) * levelMultiplier(6, 60);

/**
 * 「★6 Lv60でこの値にしたい」から素の値を出す。
 *
 * **手で丸めた数字を置かない。**成長の式を触った時に
 * 設計値との対応が切れて、誰にも直せなくなる。
 *
 * ただしコラボ4種は**属性補正を通す**ので、`Math.round` が
 * 補正の時点でもう一度入る。到達値は設計値ちょうどにはならず、
 * 属性ごとに数の位がずれる(そのぶんの幅は `tests/collabMonsters.test.ts` が見る)。
 */
export const fromStar6Lv60 = (value: number): number => value / STAR6_LV60_MULTIPLIER;

/**
 * 効果から説明文を作り、後ろへ「どこへ当たるのか」を足す。
 *
 * **34本を手で書かない。**`tests/monsterDescription.test.ts` は
 * `levelOverrides` を持つスキルの説明文が `describeSkillLines` の出力で
 * 始まることを見張っているが、見張れるのは**書いた後**の食い違いだけで、
 * 書く時のずれは止められない。効果を直したら説明文も動く形にしておけば、
 * そもそもずれようがない。
 *
 * 足す `note` は数字を持たないこと。**数字は効果側にしか無い**という
 * 一本道にしておかないと、自動生成にした意味が無くなる。
 */
export function described(skill: Skill, note: string): Skill {
  return { ...skill, description: `${describeSkillLines(skill).join("。")}。${note}` };
}
