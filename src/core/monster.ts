import { Element, ELEMENT_COLOR, ELEMENT_JA, ELEMENTS } from "./element.js";
import { CombatModifiers } from "./equipment.js";
import { Skill, SkillEffect } from "./skill.js";
import { applySeptemberSkillBalance } from "./skillRebalance.js";
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
  /**
   * 図鑑に出す説明。**戦い方ではなく「何のために居るのか」を書く。**
   *
   * 素材専用のモンスターは、スキルとステータスを見ても用途が分からない。
   * 「ぷいぷい(攻撃力0.3倍)」を読んでも、それが**戦うための数字ではない**ことは
   * どこにも書いていなかった。使い道と入手先はここで言う。
   */
  dexNote?: string;
  /**
   * 属性ごとに、どの変種を使うかを明示する。添字は `skill2Variants` / `skill3Variants` のもの。
   *
   * **省略した属性は、今までどおり `pickSkillVariant` が決める。**
   * 既存の8種+ガチャ限定4種はここを持たないので、組み合わせは1つも変わらない。
   *
   * 明示できる形にしたのは、種族ごとに「この属性はこの役割」という設計が
   * 先にあるモンスターが出てきたため。自動割り当ては**候補の並び順を変えた瞬間に
   * 全属性の組み合わせが入れ替わる**ので、意図した表がある時はそれを書く方が安全。
   */
  skillAssignment?: Partial<Record<Element, { skill2?: number; skill3?: number }>>;
  /**
   * 召喚で出る時の星。ガチャの抽選プールを組むのに使う。
   * 未指定のテンプレートは、従来どおり呼び出し側が並べたプールで扱う。
   */
  gachaStar?: 3 | 4 | 5;
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
  /**
   * その階の主。**見た目にだけ効く。**戦闘の計算には1つも入らない。
   *
   * `victoryTarget` とは別に持つ。装備ダンジョンは最終階以外
   * 「ボスだが倒しただけでは勝ちにならない」ので、勝利条件で見分けると
   * 9階までの主が普通の敵と同じ大きさのまま並ぶ。
   */
  isBoss?: boolean;
  /** 支援AIが単体攻撃バフを優先する主要対象。 */
  primaryTarget?: boolean;
  /** 戦闘開始時点のスキル残りクールタイム。 */
  initialCooldowns?: [number, number, number];
  /** 図鑑に出す説明。テンプレートの `dexNote` がそのまま渡る */
  dexNote?: string;
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
  /**
   * 反撃で**そのスキルをそのまま撃つ**(0〜2)。省略時は従来どおり
   * `counterMultiplier` の一撃だけを返す。
   *
   * 単発で殴り返すのと、全体技を撃ち返すのとでは意味がまるで違う。
   * 「6回殴ったら全体攻撃が返る」を作るには、スキルそのものを撃たせるしかない。
   *
   * **撃ってもクールタイムは動かない。** 反撃で溜まりが消えると、
   * こちらの手数がそのままボスの手を縛る道具になってしまう。
   */
  counterSkillIndex?: 0 | 1 | 2;
  /** 行動終了時に追加ターンを得る確率。 */
  extraTurnChance?: number;
  /** 1回の攻撃行動ごとに判定する部分防御無視。 */
  defenseIgnoreChance?: number;
  defenseIgnoreRatio?: number;
  /** 味方が閾値以下で生存した時、一度だけ回復する支援特性。 */
  allyThresholdHeal?: { hpRatio: number; healPercent: number };
  /**
   * **この個体が倒れた時**、生き残っている `victoryTarget` の敵へ足す実数。
   *
   * 取り巻きを「先に消しておく置物」で終わらせないための仕掛け。
   * 消せば消すほど本体が強くなるので、**どの順で倒すか**そのものが
   * 考えどころになる。倍率ではなく実数なのは、
   * 「攻撃力を2000上げる」を額のまま書けるようにするため。
   */
  empowerBossOnDeath?: { atk?: number; spd?: number; def?: number };
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
 * 既存の弱いスキルだけを対象にした2026-09-01の底上げ。
 *
 * 原型配列の並び順は属性ごとのスキル割り当てに使われているため、データ本体を並べ替えず
 * 実体化の直前にIDで差し替える。光/闇固有技や新規高レアには一切波及しない。
 */
function applyLegacySkillBalance(skill: Skill): Skill {
  skill = applySeptemberSkillBalance(skill);
  switch (skill.id) {
    case "slime_s3_a":
      return {
        ...skill,
        description: "限界を超えた力で敵全体に攻撃力1.8倍のダメージを与える。この攻撃で敵を倒していた場合、自身の行動ゲージを20%進める。",
        effects: [
          { kind: "DAMAGE", multiplier: 1.8 },
          { kind: "GAUGE", amount: 0.2, applyTo: "SELF", requires: "KILLED_TARGET" },
        ],
      };
    case "slime_s3_c":
      return {
        ...skill,
        description: "眩い粘液を弾けさせ、敵全体に攻撃力1.5倍のダメージを与え、75%で2ターン暗闇を付与する。",
        effects: [
          { kind: "DAMAGE", multiplier: 1.5 },
          { kind: "BLIND", durationTurns: 2, chance: 0.75 },
        ],
      };
    case "wolf_s3_a":
      return {
        ...skill,
        description: "渾身の一撃(2.8倍)を叩き込み、50%で相手をスタンさせる。",
        effects: [
          { kind: "DAMAGE", multiplier: 2.8 },
          { kind: "STUN", durationTurns: 1, chance: 0.5 },
        ],
      };
    case "wolf_s3_b":
      return {
        ...skill,
        description: "敵単体に攻撃力0.85倍のダメージを3回与え、1撃ごとに防御力を25%低下させる。",
        effects: skill.effects.map((effect) => effect.kind === "DAMAGE" ? { ...effect, multiplier: 0.85 } : effect),
      };
    case "imp_s3_a":
      return {
        ...skill,
        description: "敵全体に攻撃力1.1倍のダメージを与え、75%で2ターン攻撃力を大きく低下させ、行動ゲージを15%減少させる。",
        effects: [
          { kind: "DAMAGE", multiplier: 1.1 },
          { kind: "DEBUFF", stat: "atk", amount: 0.5, durationTurns: 2, chance: 0.75 },
          { kind: "GAUGE", amount: -0.15 },
        ],
      };
    case "imp_s3_b":
      return {
        ...skill,
        description: "敵全体に攻撃力1.1倍のダメージを与え、75%で全員のスキルのクールタイムを1ターン延長する。",
        cooldownTurns: 4,
        effects: [
          { kind: "DAMAGE", multiplier: 1.1 },
          { kind: "COOLDOWN_EXTEND", turns: 1, chance: 0.75 },
        ],
      };
    case "wisp_s2_b":
      return {
        ...skill,
        description: "味方全体の素早さを2ターン上昇させ、行動ゲージを25%進める。",
        effects: skill.effects.map((effect) => effect.kind === "GAUGE" ? { ...effect, amount: 0.25 } : effect),
      };
    case "fairy_s3_c":
      return {
        ...skill,
        description: "味方全体のHPを最大HPの25%回復し、防御力を2ターン上昇させる。",
        cooldownTurns: 4,
        effects: [
          { kind: "HEAL", healRate: 0.25 },
          { kind: "BUFF", stat: "def", amount: 0.3, durationTurns: 2 },
        ],
      };
    case "knight_s3_b":
      return {
        ...skill,
        description: "敵全体に攻撃力1.5倍のダメージを与え、60%で1ターン行動不能にする。",
        effects: [
          { kind: "DAMAGE", multiplier: 1.5 },
          { kind: "STUN", durationTurns: 1, chance: 0.6 },
        ],
      };
    case "chronos_s3_b": {
      /*
       * GAUGEには基礎発動率フィールドが無いため、0ターンSTUNを発動判定だけの印として使う。
       * 成功時(70%、命中/抵抗判定込み)はSTUN_FAILEDが立たず-100%、失敗時は+100%を相殺して0%。
       * duration=0なのでスタンそのものは一切残らない。
       */
      const procMarker = { kind: "STUN", durationTurns: 0, chance: 0.7 } as SkillEffect;
      return {
        ...skill,
        description: "時空が軋み、敵全体に攻撃力1.0倍のダメージを与える。ダメージのあと70%で敵の行動ゲージを100%減少させる。",
        effects: [
          { kind: "DAMAGE", multiplier: 1.0 },
          procMarker,
          { kind: "GAUGE", amount: -1, conditionalExtra: { when: "STUN_FAILED", amount: 1 } },
        ],
      };
    }
    default:
      return skill;
  }
}

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
  const assignment = template.skillAssignment?.[element];
  const skill2 = applyLegacySkillBalance(
    template.skill2Variants[assignment?.skill2 ?? -1] ?? pickSkillVariant(template.skill2Variants, element, 0),
  );
  // 光/闇に固有のスキル3があれば、候補からの抽選より優先する
  const uniqueSkill3 = element === "LIGHT" ? template.lightSkill3 : element === "DARK" ? template.darkSkill3 : undefined;
  const skill3 = applyLegacySkillBalance(
    uniqueSkill3
      ?? template.skill3Variants[assignment?.skill3 ?? -1]
      ?? pickSkillVariant(template.skill3Variants, element, 1),
  );
  return {
    id: `${template.templateId}_${element}`,
    templateId: template.templateId,
    name: `${template.baseName}[${ELEMENT_JA[element]}]`,
    element,
    color: ELEMENT_COLOR[element],
    role: template.role,
    emoji: template.emoji,
    stats: flavoredStats,
    skills: [applyLegacySkillBalance(template.skill1), skill2, skill3],
    bossTraits: template.bossTraits,
    dexNote: template.dexNote,
  };
}

/** テンプレートから(elements指定があればその範囲、なければ全6属性の)色違いバリエーションを生成する */
export function createAllVariants(template: MonsterTemplate): MonsterDefinition[] {
  return (template.elements ?? ELEMENTS).map((element) => createMonsterVariant(template, element));
}
