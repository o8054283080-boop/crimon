import { Element, ELEMENT_COLOR, ELEMENT_JA, ELEMENTS } from "./element.js";
import { CombatModifiers } from "./equipment.js";
import { Skill } from "./skill.js";
import { Stats, cloneStats } from "./stats.js";
import type { LatentAbilityCandidate } from "./monsterDevelopment.js";

/**
 * モンスターの「原型」。6属性の色違いバリエーションのベースとなる。
 * スキル1(クールタイム無しの通常攻撃)は全属性共通だが、スキル2・3は属性ごとに
 * 異なる組み合わせになるよう、それぞれ候補(通常3種類)から属性に応じて1つ選ばれる。
 */
export interface MonsterTemplate {
  templateId: string;
  baseName: string;
  role: string;
  /** 専用アイコン画像が入るまでの仮アイコン(絵文字) */
  emoji: string;
  baseStats: Stats;
  skill1: Skill;
  skill2Variants: Skill[];
  skill3Variants: Skill[];
  /**
   * このテンプレートが実体化される属性の範囲。省略時は全6属性。
   * ガチャ限定の光/闇専用モンスターなど、一部の属性でしか登場しないテンプレートに使う。
   */
  elements?: Element[];
  /**
   * 光/闇だけが持つ固有のスキル3。指定があれば skill3Variants より優先される。
   *
   * 光と闇はステージにも装備ダンジョンにも出ないため、召喚でしか手に入らない。
   * その希少さに見合うよう、**同じ種族の他の属性より明確に強い**スキルを与えている。
   * ただし「別のモンスター」になるほど役割を変えないこと。
   * 同じ種族として育ててきた意味が消える。
   */
  lightSkill3?: Skill;
  darkSkill3?: Skill;
  /** ボス固有の性質(反撃・継続ダメージ耐性)。実体化した定義へそのまま渡る */
  bossTraits?: BossTraits;
}

/** 属性ごとの色違いバリエーションとして実体化されたモンスター定義(静的データ) */
export interface MonsterDefinition {
  id: string;
  templateId: string;
  name: string;
  element: Element;
  color: string;
  role: string;
  /** 専用アイコン画像が入るまでの仮アイコン(絵文字) */
  emoji: string;
  stats: Stats;
  skills: [Skill, Skill, Skill];
  /** 装備セット由来の戦闘専用効果。装備なし(敵など)ではundefined */
  combatMods?: CombatModifiers;
  /** 所有個体で選択済みの潜在能力。静的な図鑑/敵定義には存在しない。 */
  latentAbility?: LatentAbilityCandidate;
  /**
   * ボス固有の性質。ステータスを盛るだけでは作れない「戦い方の要求」をここで表す。
   *
   * サマナーズウォーの巨人ダンジョンを見ると、あの階が難しいのは数字ではなく
   * **状態が刻々と悪化することと、特定の戦い方に代償があること**だった。
   * こちらのボスは長らく「硬くて痛いだけの置物」で、
   * 毒を重ねて耐久で待つだけで抜けられてしまっていた。
   */
  bossTraits?: BossTraits;
  /** この敵の死亡を勝利条件にする。未指定の戦闘は従来通り敵全滅で勝利する。 */
  victoryTarget?: boolean;
  /** 支援AIが単体攻撃バフを優先する主要対象。 */
  primaryTarget?: boolean;
}

export interface BossTraits {
  /**
   * この回数だけ攻撃を受けると、即座に反撃する(0なら反撃しない)。
   *
   * **小さい攻撃を何度も当てる戦い方に代償を作る。**毒を重ねるにも、
   * 多段攻撃で削るにも手数が要るので、そこに必ず反撃が返る。
   */
  counterAfterHits?: number;
  /** 反撃のダメージ倍率 */
  counterMultiplier?: number;
}

/*
 * 毒・火傷への耐性倍率をボスに持たせていたが、取りやめた。
 *
 * 毒と耐久は**ちゃんとした戦術**であって、塞ぐべき抜け道ではない。
 * 継続ダメージを直接弱めるのは、その戦術を選んだこと自体に罰を与える調整で、
 * 「スキルがモンスターにいろんな場所での役割を与える」という設計そのものと衝突する
 * (docs/design-concept.md)。難易度は、戦術を否定しない形で作ること。
 */

/**
 * 属性ごとの簡単なステータス補正。同じモンスターでも属性違いで
 * 少しだけ得意分野が変わる(色違い=完全に同一ステータスではない)フレーバー付け。
 */
const ELEMENT_STAT_FLAVOR: Record<Element, (stats: Stats) => Stats> = {
  FIRE: (s) => ({ ...s, atk: Math.round(s.atk * 1.1) }),
  WATER: (s) => ({ ...s, def: Math.round(s.def * 1.1), hp: Math.round(s.hp * 1.05) }),
  ELECTRIC: (s) => ({ ...s, spd: Math.round(s.spd * 1.15) }),
  GRASS: (s) => ({ ...s, hp: Math.round(s.hp * 1.15) }),
  LIGHT: (s) => ({ ...s, criRate: Math.min(1, s.criRate + 0.03) }),
  DARK: (s) => ({ ...s, criDmg: s.criDmg + 0.05 }),
};

/**
 * 属性(ELEMENTS配列中の並び順)に応じて、スキル候補の中から1つを決定的に選ぶ。
 * candidateCountより属性数が多い場合、単純な剰余だけだと複数の属性が同じ添字に
 * 揃ってしまう(例: 候補3種×属性6なら2属性ずつ完全に同じ組み合わせになる)。
 * groupOffsetを1にすると、2周目以降の属性ではさらに1つずらした添字を使うため、
 * skill2とskill3を異なるgroupOffsetで選べば、6属性すべてで(skill2, skill3)の
 * 組み合わせが重複しなくなる。
 */
function pickSkillVariant(variants: Skill[], element: Element, groupOffset: number): Skill {
  const elementIndex = ELEMENTS.indexOf(element);
  const group = Math.floor(elementIndex / variants.length);
  const index = (elementIndex + group * groupOffset) % variants.length;
  return variants[index];
}

export function createMonsterVariant(template: MonsterTemplate, element: Element): MonsterDefinition {
  const flavoredStats = ELEMENT_STAT_FLAVOR[element](cloneStats(template.baseStats));
  const skill2 = pickSkillVariant(template.skill2Variants, element, 0);
  // 光/闇に固有のスキル3があれば、候補からの抽選より優先する
  const uniqueSkill3 = element === "LIGHT" ? template.lightSkill3 : element === "DARK" ? template.darkSkill3 : undefined;
  const skill3 = uniqueSkill3 ?? pickSkillVariant(template.skill3Variants, element, 1);
  return {
    id: `${template.templateId}_${element}`,
    templateId: template.templateId,
    name: `${template.baseName}[${ELEMENT_JA[element]}]`,
    element,
    color: ELEMENT_COLOR[element],
    role: template.role,
    emoji: template.emoji,
    stats: flavoredStats,
    skills: [template.skill1, skill2, skill3],
    bossTraits: template.bossTraits,
  };
}

/** テンプレートから(elements指定があればその範囲、なければ全6属性の)色違いバリエーションを生成する */
export function createAllVariants(template: MonsterTemplate): MonsterDefinition[] {
  return (template.elements ?? ELEMENTS).map((element) => createMonsterVariant(template, element));
}
