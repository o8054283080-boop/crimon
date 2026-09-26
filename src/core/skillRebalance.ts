import type { Skill, SkillEffect } from "./skill.js";
import { SPD_UP } from "./statusValues.js";

/**
 * 9月の合意済み調整。実体化時に適用し、所持済み・継承済みの技にも反映する。
 *
 * **残っているのは2件だけ。**ほかの16件は2026年10月のスキル調整で定義ファイルの
 * `levelOverrides` へ移した(`docs/SKILL_BALANCE_GUIDE.md` の「実行時の差し替え」)。
 *
 * - `abyssreaper_s2_c` … S2の多段化が保留のため、今回は数字を動かしていない(互換のため残す)
 * - `wisp_s3_c` … 調整の指定が差し替え前の「全体30%」を前提にしていて、
 *   今の単体80%と食い違うため保留(互換のため残す)
 *
 * どちらも定義ファイルへ移せば消せる。移す時は `npm run skills:report -- --overrides` で
 * 差し替え前後が一致することを確かめること。
 */
export function applySeptemberSkillBalance(skill: Skill): Skill {
  const change = (description: string, effects: SkillEffect[], rest: Partial<Skill> = {}): Skill =>
    ({ ...skill, description, effects, ...rest });
  switch (skill.id) {
    case "abyssreaper_s2_c": return change("敵単体の強化を1個奪い、行動ゲージを50%減少。さらに強化阻害と毒1スタックをそれぞれ90%で2ターン付与する。", [
      { kind: "STEAL_BUFF", count: 1 }, { kind: "GAUGE", amount: -0.5 },
      { kind: "STATUS", status: "BUFF_BLOCK", chance: 0.9, durationTurns: 2 },
      { kind: "POISON", damageRatePerStack: 0.05, stacks: 1, chance: 0.9, durationTurns: 2 }]);
    case "wisp_s3_c": return change("味方単体の行動ゲージを80%進め、速度を20%上昇させる(2ターン)。最大レベルでゲージ100%、速度3ターン、CT3。", [
      { kind: "GAUGE", amount: 0.8 }, { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 2 }], {
      target: "SINGLE_ALLY", cooldownTurns: 4, maxLevelOverride: { cooldownTurns: 3, effects: [
        { kind: "GAUGE", amount: 1 }, { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 3 }] } });
    default: return skill;
  }
}
