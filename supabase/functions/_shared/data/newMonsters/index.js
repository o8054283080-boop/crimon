import { CRIM_TEMPLATES } from "./crim.js";
import { FOUR_SPECIES } from "./fourSpecies.js";
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
export * from "./crim.js";
export * from "./star3.js";
export * from "./star4.js";
export * from "./star5.js";
export { NEW_STAR3_TEMPLATES, NEW_STAR4_TEMPLATES, NEW_STAR5_TEMPLATES, CRIM_TEMPLATES };
/**
 * 追加分すべて。
 *
 * **クリムは必ず末尾に置くこと。**この並びがそのまま
 * `ALL_DISPLAYABLE_MONSTERS_DEX` の並びになり、
 * **潜在覚醒の候補IDは添字から作られる**(`latentAbilities.ts`)。
 * 途中へ差し込むと、既に覚醒済みの個体が持っているIDの指す先が
 * 別のモンスターの候補へずれる。
 */
export const NEW_MONSTER_TEMPLATES = [
    ...FOUR_SPECIES,
    ...NEW_STAR3_TEMPLATES,
    ...NEW_STAR4_TEMPLATES,
    ...NEW_STAR5_TEMPLATES,
    ...CRIM_TEMPLATES,
];
