import { PassiveLevelEffect, PassiveSpec, PassiveTrigger } from "../../core/passive.js";

/**
 * 11種を書くときに使い回す決まりごと。
 *
 * **数字をその場に散らさない。** 「攻撃力50%DOWN」は依頼主が固定と決めた値なので、
 * 定数にしておけば、どこか1つだけ違う値を書いてしまう事故が起きない。
 */

/*
 * 通常のバフ・デバフの効果量は `src/core/statusValues.ts` が唯一の置き場所。
 * ここは**そこへの入口**で、値そのものは持たない。
 * 11種を書いた時はここに書いてあったが、既存モンスターが直書きのままで
 * 同じ名前の効果に違う値が混在していたため、全体で1か所へ寄せた。
 */
export {
  ATK_UP, DEF_UP, SPD_UP, CRI_RATE_UP, CRI_DMG_UP,
  ATK_DOWN, DEF_DOWN, SPD_DOWN, CRI_RATE_DOWN,
  CRIT_RATE_TAKEN_UP, CRIT_RATE_TAKEN_DOWN,
} from "../../core/statusValues.js";

/** 毒1スタックあたりのダメージ割合。既存の毒と同じ水準 */
export const POISON_RATE = 0.05;

/*
 * **治癒阻害に強さの段は無い。**掛かっている間は回復を受け付けない、の一本。
 * 前はここに `HEAL_BLOCK_HALF = 0.5` があったが、エンジンは昔から
 * 回復量を0に固定していて、半減はどこにも効いていなかった
 * (説明文だけが「回復50%減」と嘘をついていた)。
 */

/** Lv1〜5の5段を、書き並べた配列から作る。数が5でないとその場で分かる */
export function passive(trigger: PassiveTrigger, levels: PassiveLevelEffect[]): PassiveSpec {
  if (levels.length !== 5) throw new Error(`パッシブのレベルは5段でなければならない (${levels.length}段)`);
  return { trigger, levels: levels as unknown as PassiveSpec["levels"] };
}
