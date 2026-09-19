import { GUJIRA_TEMPLATES } from "./gujira.js";
import { MOCCHI_TEMPLATES } from "./mocchi.js";
import { MonsterTemplate } from "../../core/monster.js";
import { SUEZO_TEMPLATES } from "./suezo.js";
import { UNDINE_TEMPLATES } from "./undine.js";

/**
 * コラボ4種の入口。
 *
 * 4種 × 6属性で24体。**種族ごとにファイルを分けてある**のは、
 * 1体のバランスを触る時に読む範囲をその種族だけで済ませるため。
 *
 * **この並びを途中で変えないこと。**そのまま
 * `ALL_DISPLAYABLE_MONSTERS_DEX` の並びになり、
 * **潜在覚醒の候補IDは添字から作られる**(`latentAbilities.ts`)。
 * 途中へ差し込むと、既に覚醒済みの個体が持っているIDの指す先が
 * 別のモンスターの候補へずれる。足すなら末尾へ。
 */

export * from "./gujira.js";
export * from "./mocchi.js";
export * from "./suezo.js";
export * from "./undine.js";

export const COLLAB_MONSTER_TEMPLATES: MonsterTemplate[] = [
  ...MOCCHI_TEMPLATES,
  ...SUEZO_TEMPLATES,
  ...UNDINE_TEMPLATES,
  ...GUJIRA_TEMPLATES,
];
