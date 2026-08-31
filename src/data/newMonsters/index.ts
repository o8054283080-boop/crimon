import { MonsterTemplate } from "../../core/monster.js";
import { NEW_STAR3_TEMPLATES } from "./star3.js";
import { NEW_STAR4_TEMPLATES } from "./star4.js";
import { NEW_STAR5_TEMPLATES } from "./star5.js";

/**
 * 追加した11種の入口。
 *
 * **既存の `src/data/monsters.ts` へは書き足していない。**
 * あちらは1900行を超えていて、1体足すたびにファイル全体が
 * 編集の対象になっていた。星ごとに分けておけば、
 * バランスを触る時に読む範囲がその星だけで済む。
 */

export * from "./star3.js";
export * from "./star4.js";
export * from "./star5.js";
export { NEW_STAR3_TEMPLATES, NEW_STAR4_TEMPLATES, NEW_STAR5_TEMPLATES };

/** 今回追加した11種すべて */
export const NEW_MONSTER_TEMPLATES: MonsterTemplate[] = [
  ...NEW_STAR3_TEMPLATES,
  ...NEW_STAR4_TEMPLATES,
  ...NEW_STAR5_TEMPLATES,
];
