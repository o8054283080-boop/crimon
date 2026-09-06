import { GACHA_STAR4_TEMPLATES, GACHA_STAR5_TEMPLATES } from "./monsters.js";
import type { InitialRarity } from "../core/talents.js";

/**
 * そのモンスターの「元々のレアリティ」。
 *
 * ## なぜ保存しないのか
 *
 * ★3を★6まで育てても、元が★3であることは変わらない。
 * **個体に焼き付けず、図鑑IDから毎回導く。**装備のレア度と同じ考え方で、
 * 導けるものを控えに持つと、片方だけ古い値が残る事故が必ず起きる。
 *
 * ## 判定は召喚の抽選表から
 *
 * ★4・★5の抽選対象に入っているテンプレートだけが、その星の出身。
 * 残りは全部★3扱い——ステージや装備ダンジョンで手に入る顔ぶれも、
 * 転生ピッグのような素材専用も、才能覚醒では★3(20pt)として扱う。
 * **迷ったら多い方に倒す。**育てにくい個体を厚くするのがこの仕組みの趣旨で、
 * 未知のテンプレートを11ptに落とすと、後から足した種族が理由なく損をする。
 */
const STAR4_TEMPLATE_IDS: ReadonlySet<string> = new Set(GACHA_STAR4_TEMPLATES.map((t) => t.templateId));
const STAR5_TEMPLATE_IDS: ReadonlySet<string> = new Set(GACHA_STAR5_TEMPLATES.map((t) => t.templateId));

/**
 * 図鑑ID(`templateId_ELEMENT`)から初期レアリティを引く。
 *
 * 属性は関係ない。**同じ種族なら光でも火でも同じ出身**なので、
 * テンプレートIDだけを見る。
 */
export function initialRarityOfDexId(dexId: string): InitialRarity {
  /*
   * 属性は末尾の `_属性` として付いている。テンプレートIDに `_` が
   * 含まれる種族(`reincarnation_pig` など)があるので、
   * **末尾の1つだけを落とす**(先頭から切ると種族名が壊れる)。
   */
  const templateId = dexId.slice(0, dexId.lastIndexOf("_"));
  if (STAR5_TEMPLATE_IDS.has(templateId)) return 5;
  if (STAR4_TEMPLATE_IDS.has(templateId)) return 4;
  return 3;
}
