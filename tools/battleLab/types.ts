/**
 * Battle Lab のシナリオの形。
 *
 * ## ここに書いてあるのは「何を戦わせるか」だけ
 *
 * ダメージも会心も命中/抵抗もゲージも、**1行も持っていない。**
 * それらは全部 `src/battle/engine.ts` の仕事で、この道具は
 * 盤面を組み立てて `BattleEngine` へ渡すだけに徹する。
 *
 * この線を越えて「Battle Lab専用の簡易計算」を書き始めた瞬間、
 * この道具で測った数字は本編の数字ではなくなる。
 */
import type { EquipStar, SetType, StatType } from "../../src/core/equipment.js";
import type { Element } from "../../src/core/element.js";
import type { MonsterType } from "../../src/core/monsterDevelopment.js";
import type { Skill } from "../../src/core/skill.js";
import type { Stats } from "../../src/core/stats.js";
import type { BossTraits } from "../../src/core/monster.js";
import type { Star } from "../../src/core/rarity.js";

/** 能力ポイントの振り分け(★6なら合計100まで) */
export interface AbilityPointSpec {
  hp?: number;
  atk?: number;
  def?: number;
  spd?: number;
}

/** 装備1個ぶんの指定。**メイン・サブを名指しできる**(引き直しに頼らない) */
export interface GearSpec {
  slot: 1 | 2 | 3 | 4 | 5 | 6;
  star?: EquipStar;
  set?: SetType;
  level?: number;
  main: StatType;
  subs: StatType[];
}

/**
 * 味方1体ぶん。
 *
 * `preset` を書けば「かなり仕上がった実戦個体」が出来上がり、
 * そこへ書いた項目だけが上書きされる。
 * `MAX_ATTACKER` に速度だけ足したい、が1行で書ける。
 */
export interface AllySpec {
  /** 表示名。省略すると図鑑の名前 */
  label?: string;
  templateId: string;
  element: Element;
  preset?: PresetName;
  star?: Star;
  level?: number;
  type?: MonsterType;
  abilityPoints?: AbilityPointSpec;
  /** スキルレベル。省略時はプリセット(最大)のまま */
  skillLevels?: [number, number, number];
  /** 装備。省略時はプリセットのもの */
  gear?: GearSpec[];
  /** 潜在覚醒。候補の並びの何番目か。`null` で覚醒なし */
  latentIndex?: number | null;
  /**
   * 最終ステータスの直接上書き。**プリセットも装備も通した後にかかる。**
   * 「速度180ちょうどで比べたい」のような、詰めの確認に使う。
   */
  statOverrides?: Partial<Stats>;
}

/** 敵1体ぶん。開発中の仮ステータスを直接書ける */
export interface EnemySpec {
  label?: string;
  /** 図鑑の見た目・属性を借りる先。スキルまで借りるかは `useDexSkills` で決める */
  templateId: string;
  element: Element;
  star?: Star;
  level?: number;
  /** 図鑑のスキルをそのまま使う。`skills` を書いた時は無視される */
  useDexSkills?: boolean;
  /** 最終ステータス。書いた項目だけ上書きする */
  stats?: Partial<Stats>;
  /** スキル3つ。書いた時は図鑑のスキルを完全に置き換える */
  skills?: [Skill, Skill, Skill];
  bossTraits?: BossTraits;
  /** この敵を倒したら勝ち(取り巻きを残していても勝ち) */
  victoryTarget?: boolean;
  initialCooldowns?: [number, number, number];
}

/** 味方AIの狙う順。前から順に、生きている最初の1体を狙い続ける */
export interface FocusOrder {
  name: string;
  /** `EnemySpec.label` の並び。空なら既存AIに任せる */
  order: string[];
}

/** 崩れていないかを見る基準。範囲から外れたら警告を出す */
export interface ExpectRange {
  minWinRate?: number;
  maxWinRate?: number;
}

/**
 * 手番の境目に差し込む観測点。
 *
 * ## 何のためにあるか
 *
 * 本編のエンジンに**まだ無い挙動**を試したい時がある。試練の塔70階の
 * 「自ターン終了時に回復」「取り巻きが生きている間だけ回復量が増える」
 * 「一定の手番ごとに自動でシールド」は、どれも本編に機構が無い。
 *
 * ## それでも戦闘の中身は本編のまま
 *
 * ここが触れるのは**手番と手番の間だけ**。ダメージ計算・スキル処理・
 * 命中/抵抗・AI・バフ/デバフには一切入らない。使うのも
 * `currentHp` `shieldValue` `mitigateTurns` `flatStatBonus` といった
 * **本編がすでに持っている口**だけで、新しい計算式は1つも足さない。
 *
 * この線を越えて「Battle Lab専用のダメージ計算」を書き始めた瞬間、
 * この道具で測った数字は本編の数字ではなくなる。
 */
export interface ScenarioProbe {
  /** 1手番の直前 */
  beforeTurn(unitId: string): void;
  /** 1手番の直後。`lines` はその手番でエンジンが出したログ */
  afterTurn(unitId: string, lines: readonly string[]): void;
  /** 決着後に返す、この階だけの集計 */
  finish(): Record<string, number>;
}

/** エンジン1つにつき1回だけ呼ばれ、観測点を返す */
export type ScenarioHook = (context: {
  /** 敵の並び順の識別子(`E1`/`E2`…)から実体を引く */
  unitOf(id: string): TrackedUnit | undefined;
  /** 生きているか */
  aliveOf(id: string): boolean;
}) => ScenarioProbe;

/**
 * 観測点が触れてよい範囲。**本編の `BattleUnit` の一部だけ**を写している。
 * ここに無い項目(スキルの解決過程や命中判定)へは手が届かない。
 */
export interface TrackedUnit {
  currentHp: number;
  readonly maxHp: number;
  shieldValue: number;
  shieldTurns: number;
  mitigateTurns: number;
  mitigateAmount: number;
  flatStatBonus: { spd?: number; atk?: number; def?: number };
  readonly poisonStacks: number;
  /** かかっている弱体の数(効果・状態・毒・気絶などを合わせた数) */
  readonly debuffCount: number;
  readonly alive: boolean;
  readonly skills: readonly { name: string; hpCoefficients: readonly number[] }[];
  /** HP比例ダメージの係数を丸ごと差し替える(HP50%以下の+20%の再現に使う) */
  scaleHpCoefficients(factor: number): void;
}

export interface Scenario {
  id: string;
  title: string;
  /** 何を確かめるためのシナリオか。読む人のために必ず書く */
  note: string;
  allies: AllySpec[];
  enemies: EnemySpec[];
  /** 狙う順の候補。1つ目が既定 */
  focusPatterns?: FocusOrder[];
  maxTurns?: number;
  expect?: ExpectRange;
  /**
   * 手番の境目に差し込む観測点。**本編に無い挙動を試す時だけ。**
   * 書かなければ、これまでどおり本編のエンジンだけが動く。
   */
  hook?: ScenarioHook;
}

/**
 * 装備の仕上がり具合。
 *
 * **プリセットは「装備を極めた人」の姿しか出せない。** それだけで測ると、
 * 上の階が誰にとっても楽か、あるいは装備がまだの人には手も足も出ないのか、
 * どちらなのかが読めない。段階を変えて同じ盤面を測れるようにしてある。
 *
 *   FINISHED  ★6 +15 / サブは役割どおり。仕上げ切った人
 *   STRONG    ★6 +15 / サブは半分だけ役割どおり。真面目に集めた人
 *   TYPICAL   ★6 +15 / **初期サブ1〜2個から最大まで上げた**。塔の上の方の想定
 *   MID       ★6 +12 / サブは1つだけ役割どおり。育成の途中
 *   ROUGH     ★5 +9  / サブは引いたまま。拾ったものを着けている段階
 *
 * ★や強化値ではなく**サブの中身が主役**にしてある。この案件では
 * 強い個体と弱い個体の差の大半がそこから出る。
 *
 * ## TYPICAL だけ、増え方まで本物どおり
 *
 * この作品は **+3 / +6 / +9 / +12 / +15 でサブOPが1つ増える**
 * (`SUBSTAT_POWERUP_LEVELS`)。初期1個の装備を+15まで上げると4個になるが、
 * 増えた3個は**種類が選べない。** 他の段は最初から4個そろえて配るのに対し、
 * TYPICAL は初期ぶんだけ役割どおりに置き、残りは
 * `enhanceEquipment` に増やさせる。**装備を集める側から見た本当の姿**はこれ。
 */
export type GearGrade = "FINISHED" | "STRONG" | "TYPICAL" | "MID" | "ROUGH";

export type PresetName =
  | "MAX_ATTACKER"
  | "MAX_SUPPORT"
  | "MAX_HEALER"
  | "MAX_DEBUFFER"
  | "MAX_TANK"
  | "MAX_SPEED";
