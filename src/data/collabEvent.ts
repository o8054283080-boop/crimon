import { COLLAB_MONSTER_TEMPLATES } from "./collabMonsters/index.js";
import { Element } from "../core/element.js";
import { MonsterTemplate } from "../core/monster.js";
import { SUEZO_TEMPLATE_ID } from "./collabMonsters/suezo.js";

/**
 * 期間限定のコラボイベント。**いつ・誰が・どこまでが対象か**をここだけで決める。
 *
 * 召喚・ミッション・お知らせ・プレゼントがそれぞれ「コラボ対象か」を
 * 判断する場面が出てくるので、判定を散らさない。
 * 種族を足したり期間を変えたりする時に読む場所を1つにしておく。
 */

/** このイベントの識別子。プレゼントとミッションの受取済み記録に使う */
export const COLLAB_EVENT_ID = "2026-09-collab";

/*
 * 開催期間(日本時間)。
 *
 * **終わった後もセーブに記録は残る。**受け取り済みの印を消すと、
 * 次に同じIDのイベントを開いた時に二重で配ることになる。
 */
export const COLLAB_EVENT_FROM_DATE = "2026-09-19";
export const COLLAB_EVENT_TO_DATE = "2026-10-19";

/**
 * コラボの対象種族。**★4以上だけ。**
 *
 * `gachaStar` を持たない種族は端から対象外にしてある。
 * 「コラボの一員なのに召喚に出ない」という食い違いが起きないよう、
 * 判定はこの配列だけを見る。
 */
export const COLLAB_TEMPLATES: readonly MonsterTemplate[] = COLLAB_MONSTER_TEMPLATES
  .filter((template) => (template.gachaStar ?? 0) >= 4);

/** コラボの★4種族(モッチー・スエゾー) */
export const COLLAB_STAR4_TEMPLATES: readonly MonsterTemplate[] =
  COLLAB_TEMPLATES.filter((template) => template.gachaStar === 4);

/** コラボの★5種族(ウンディーネ・グジラ) */
export const COLLAB_STAR5_TEMPLATES: readonly MonsterTemplate[] =
  COLLAB_TEMPLATES.filter((template) => template.gachaStar === 5);

/** 種族IDの集合。手持ちの1体がコラボかどうかを O(1) で見る */
export const COLLAB_TEMPLATE_IDS: ReadonlySet<string> = new Set(
  COLLAB_TEMPLATES.map((template) => template.templateId),
);

/** 24体ぶんの図鑑ID。ミッションの進捗や配布の宛先に使う */
export const COLLAB_DEX_IDS: readonly string[] = COLLAB_TEMPLATES.flatMap(
  (template) => (template.elements ?? ["FIRE", "WATER", "ELECTRIC", "GRASS", "LIGHT", "DARK"] as Element[])
    .map((element) => `${template.templateId}_${element}`),
);

/**
 * 記念配布で配る1体。**通常の電気スエゾーとまったく同じ個体。**
 *
 * 配布専用の弱い個体は作らない(依頼主の指定)。
 * `createMonsterInstance` に同じ図鑑IDを渡すだけなので、
 * 召喚で引いたものと1つも違いが出ない。
 */
export const COLLAB_GIFT_DEX_ID = `${SUEZO_TEMPLATE_ID}_ELECTRIC`;

/**
 * その図鑑IDがコラボ対象か。
 *
 * **種族IDで見る。**図鑑IDの文字列を前方一致で調べると、
 * 似た名前の種族が増えた時に静かに巻き込む。
 */
export function isCollabDexId(dexId: string): boolean {
  const templateId = dexId.slice(0, dexId.lastIndexOf("_"));
  return COLLAB_TEMPLATE_IDS.has(templateId);
}

/** 日付(日本時間の YYYY-MM-DD)が開催期間内か */
export function isCollabEventActiveOn(today: string): boolean {
  return today >= COLLAB_EVENT_FROM_DATE && today <= COLLAB_EVENT_TO_DATE;
}
