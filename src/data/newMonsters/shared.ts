import { PassiveLevelEffect, PassiveSpec, PassiveTrigger } from "../../core/passive.js";

/**
 * 11種を書くときに使い回す決まりごと。
 *
 * **数字をその場に散らさない。** 「攻撃力50%DOWN」は依頼主が固定と決めた値なので、
 * 定数にしておけば、どこか1つだけ違う値を書いてしまう事故が起きない。
 */

/** 攻撃DOWN・防御DOWNの効果量。**依頼主の指定で50%固定** */
export const ATK_DOWN = 0.5;
export const DEF_DOWN = 0.5;
/** 速度DOWNの効果量。既存モンスターと同じ水準に揃えてある */
export const SPD_DOWN = 0.3;

/** 能力上昇の標準量。既存モンスターで最も多い値に合わせてある */
export const ATK_UP = 0.4;
export const DEF_UP = 0.5;
export const SPD_UP = 0.3;
export const CRI_RATE_UP = 0.25;
export const CRI_DMG_UP = 0.3;

/** 毒1スタックあたりのダメージ割合。既存の毒と同じ水準 */
export const POISON_RATE = 0.05;

/** 治癒阻害の倍率(受ける回復が半分になる) */
export const HEAL_BLOCK_HALF = 0.5;

/** Lv1〜5の5段を、書き並べた配列から作る。数が5でないとその場で分かる */
export function passive(trigger: PassiveTrigger, levels: PassiveLevelEffect[]): PassiveSpec {
  if (levels.length !== 5) throw new Error(`パッシブのレベルは5段でなければならない (${levels.length}段)`);
  return { trigger, levels: levels as unknown as PassiveSpec["levels"] };
}
