import { Element } from "../core/element.js";
import { DungeonEnemy } from "./equipmentDungeon.js";
import { findMonster } from "./monsters.js";
import type { TowerTrait } from "./trialTower.js";

/**
 * 試練の塔 51〜99階の通常階。
 *
 * ## なぜ50階までと別の作りにしたか
 *
 * 50階までは1本の等比曲線(`towerPowerOf`)で「総合の強さ」を決めている。
 * その曲線は50階で55、100階で1100まで伸びる作りで、**上へ行くほど数字だけが跳ねる**。
 * 51階以降をそのまま乗せると、階が難しくなる理由が「数字が2倍になったから」しか無くなり、
 * 顔ぶれもスキルも噛み合いも、難易度に何も寄与しないただの飾りになる。
 *
 * そこで51階以降は
 *
 *   1. **実効ステータスを帯で決める**(下の `TOWER_UPPER_BANDS`。10階ぶんで約1.2倍)
 *   2. **顔ぶれを1階ずつ手で決める**(下の `TOWER_UPPER_FLOOR_DEFS`)
 *
 * の2本立てにした。数字はなだらかに伸ばし、圧は**編成の質**で作る。
 * 上の階ほど、強いスキルを持つ顔ぶれが増え、役割が噛み合っていく。
 *
 * ## 属性は種族と一緒に手で決めてある
 *
 * スキル2・3は属性ごとに違う組み合わせが選ばれるので、
 * **「ゴーレム」とだけ書くと盾を1枚も張らないゴーレムが守りの階に立つ。**
 * 下の表はすべて、その階の狙いに要る効果を実際に持っている個体を
 * 図鑑の定義から確かめて並べてある(`tests/trialTowerUpper.test.ts` が機械的に見張る)。
 *
 * 例:
 *   ・癒やし  → HEAL / REGEN / CLEANSE を実際に持つ属性
 *   ・守り    → SHIELD / MITIGATE / PROTECT / 防御上昇
 *   ・疾風/加速 → GAUGE / 速度上昇 / 速度低下 / STUN
 *   ・妨害    → STRIP / COOLDOWN_EXTEND / ゲージ減少 / 防御低下
 *   ・火力    → DAMAGE 中心
 *
 * ## 「群れの階」は51階以降では使わない
 *
 * 数で押す階は、全体攻撃を持っているかどうかだけで決まってしまい、
 * 持っていない編成には手の打ちようがない。50階までは残すが、
 * 51階以降は**4体(51〜59)/5体(61〜99)**で固定する。
 * 61階以降が5体なのは、こちら側が5体編成になるため。
 */

/** 51階以降の1体。**属性まで指定する**(種族だけではスキルが決まらない) */
export interface TowerUpperUnit {
  templateId: string;
  element: Element;
}

export interface TowerUpperFloorDef {
  /**
   * 画面に出す階の呼び名。傾向(`TowerTrait`)は5種類しかないので、
   * 「妨害」「鉄壁」「攻防一体」のような狙いはこちらで名乗る
   */
  concept: string;
  trait: TowerTrait;
  units: TowerUpperUnit[];
}

const u = (templateId: string, element: Element): TowerUpperUnit => ({ templateId, element });

/**
 * 51〜99階の顔ぶれ。**ローテーション生成はしない。**
 *
 * 巡回で組んでいた頃は、階の属性が変わった瞬間に全員のスキル2・3が入れ替わり、
 * 「守りの階なのに盾が無い」が黙って生まれていた。1階ずつ書くのは冗長だが、
 * ここは冗長さと引き換えに**書いたものがそのまま出る**ことを取る。
 *
 * 70/80/90/100階は今回の対象外なので**この表に入れない**(従来のボス階のまま)。
 * 60階も専用編成なので入っていない(`trialTowerFloor60.ts`)。
 */
export const TOWER_UPPER_FLOOR_DEFS: Readonly<Record<number, TowerUpperFloorDef>> = {
  /* ---- 51〜59: 4体。新規11種はまだ1〜2体 ---- */
  // ウルフ[火]2.8倍+スタン / インプ[火]全体+攻撃低下 / ナイト[草]全体+スタン / コボルト[水]2.3倍
  51: { concept: "通常の階", trait: "NONE", units: [u("wolf", "FIRE"), u("imp", "FIRE"), u("knight", "GRASS"), u("kobold", "WATER")] },
  // フェアリー[水]は回復0.35の全体回復、ナイト[草]は解除+防御上昇
  52: { concept: "癒やしの階", trait: "HEALER", units: [u("fairy", "WATER"), u("knight", "GRASS"), u("wolf", "FIRE"), u("mushroon", "FIRE")] },
  // ゴーレム[火]だけが盾を持たない攻撃型。通常の階に盾持ちを立てない
  53: { concept: "通常の階", trait: "NONE", units: [u("golem", "FIRE"), u("griffon", "GRASS"), u("imp", "WATER"), u("kobold", "FIRE")] },
  // ゴーレム[水]てっぺき(盾) / トレント[電気]盾+免疫 / シェルタートル[草]かばう
  54: { concept: "守りの階", trait: "WARD", units: [u("golem", "WATER"), u("treant", "ELECTRIC"), u("wolf", "FIRE"), u("shellturtle", "GRASS")] },
  // 全員電気。ウルフ[電気]はやての号令、サンダービースト[電気]雷獣覚醒
  55: { concept: "疾風の階", trait: "SWIFT", units: [u("wolf", "ELECTRIC"), u("imp", "ELECTRIC"), u("thunderbeast", "ELECTRIC"), u("knight", "ELECTRIC")] },
  56: { concept: "通常の階", trait: "NONE", units: [u("griffon", "GRASS"), u("seraph", "FIRE"), u("kobold", "WATER"), u("mushroon", "FIRE")] },
  // ウィスプ[水]回復+免疫 / トレント[火]回復+継続回復 / ミミック[水]反撃態勢+自己回復
  57: { concept: "癒やしの階", trait: "HEALER", units: [u("wisp", "WATER"), u("treant", "FIRE"), u("griffon", "FIRE"), u("mimic", "WATER")] },
  // ゴーレム[草]てっぺき / シェルタートル[電気]守護陣(軽減+防御上昇) / ウィスプ[水]盾+解除
  58: { concept: "守りの階", trait: "WARD", units: [u("wisp", "WATER"), u("golem", "GRASS"), u("shellturtle", "ELECTRIC"), u("kobold", "FIRE")] },
  // バジリスク[電気]死の凝視(スタン80%) / ヴァルキリア[電気]天翼の加護 / サンダービースト[水]天雷の号令
  59: { concept: "強敵の階", trait: "NONE", units: [u("basilisk", "ELECTRIC"), u("thunderbeast", "WATER"), u("valkyria", "ELECTRIC"), u("griffon", "FIRE")] },

  /* ---- 61〜69: ここから5体 ---- */
  61: { concept: "通常の階", trait: "NONE", units: [u("kobold", "FIRE"), u("griffon", "GRASS"), u("mimic", "FIRE"), u("seraph", "FIRE"), u("knight", "WATER")] },
  // フェアリー[電気]は回復+継続回復の両方を持つ唯一の属性
  62: { concept: "癒やしの階", trait: "HEALER", units: [u("fairy", "ELECTRIC"), u("valkyria", "ELECTRIC"), u("thunderbeast", "WATER"), u("treant", "FIRE"), u("kobold", "WATER")] },
  // バジリスク[火]全体の速度低下+ゲージ減 / マッシュルン[電気]全体の防御低下+ゲージ減 / ネメシス[草]防御大低下
  63: { concept: "妨害の階", trait: "NONE", units: [u("basilisk", "FIRE"), u("kobold", "ELECTRIC"), u("nemesis", "GRASS"), u("griffon", "ELECTRIC"), u("mushroon", "ELECTRIC")] },
  // ゴーレム[水]てっぺき / ミミック[電気]軽減+反撃 / ネメシス[火]終焉の一撃3.9倍が唯一の火力
  64: { concept: "守りの階", trait: "WARD", units: [u("shellturtle", "ELECTRIC"), u("wisp", "WATER"), u("mimic", "ELECTRIC"), u("nemesis", "FIRE"), u("golem", "WATER")] },
  65: { concept: "疾風の階", trait: "SWIFT", units: [u("thunderbeast", "ELECTRIC"), u("basilisk", "ELECTRIC"), u("wolf", "ELECTRIC"), u("griffon", "ELECTRIC"), u("imp", "ELECTRIC")] },
  66: { concept: "攻撃の階", trait: "NONE", units: [u("dragon", "FIRE"), u("mushroon", "FIRE"), u("kobold", "WATER"), u("mimic", "FIRE"), u("griffon", "GRASS")] },
  // セラフ[水]は回復2.0倍+免疫。シェルタートル[水]は甲羅再生(回復+解除+継続回復)
  67: { concept: "癒やしの階", trait: "HEALER", units: [u("valkyria", "ELECTRIC"), u("treant", "FIRE"), u("fenrir", "FIRE"), u("seraph", "WATER"), u("shellturtle", "WATER")] },
  // ベヒモス[草]巨獣の守り(盾+免疫)
  68: { concept: "守りの階", trait: "WARD", units: [u("behemoth", "GRASS"), u("shellturtle", "ELECTRIC"), u("nemesis", "WATER"), u("wisp", "WATER"), u("mimic", "ELECTRIC")] },
  // フェンリル[電気]血の追跡(2.8倍+回復不能+毒)
  69: { concept: "強敵の階", trait: "NONE", units: [u("fenrir", "ELECTRIC"), u("valkyria", "ELECTRIC"), u("basilisk", "ELECTRIC"), u("dragon", "FIRE"), u("thunderbeast", "WATER")] },

  /* ---- 71〜79 ---- */
  // ドラゴン[草]竜神の逆鱗3.6倍
  71: { concept: "攻撃の階", trait: "NONE", units: [u("dragon", "GRASS"), u("fenrir", "ELECTRIC"), u("kobold", "FIRE"), u("valkyria", "FIRE"), u("griffon", "FIRE")] },
  72: { concept: "弱体の階", trait: "NONE", units: [u("basilisk", "FIRE"), u("mushroon", "ELECTRIC"), u("nemesis", "GRASS"), u("mimic", "FIRE"), u("kobold", "ELECTRIC")] },
  // ベヒモス[電気]不落の巨体(回復+解除+軽減) / ウィスプ[水]が盾を持つ
  73: { concept: "耐久の階", trait: "WARD", units: [u("behemoth", "ELECTRIC"), u("shellturtle", "GRASS"), u("valkyria", "ELECTRIC"), u("seraph", "WATER"), u("wisp", "WATER")] },
  // 全員がゲージか速度を動かす。フェンリル[電気]喉笛裂きはゲージ+50%
  74: { concept: "加速の階", trait: "SWIFT", units: [u("thunderbeast", "WATER"), u("valkyria", "FIRE"), u("griffon", "ELECTRIC"), u("fenrir", "ELECTRIC"), u("kobold", "ELECTRIC")] },
  // クロノス[電気]終焉時計(CT延長+ゲージ-50%+スタン)
  75: { concept: "疾風の階", trait: "SWIFT", units: [u("chronos", "ELECTRIC"), u("thunderbeast", "ELECTRIC"), u("basilisk", "ELECTRIC"), u("fenrir", "ELECTRIC"), u("wolf", "ELECTRIC")] },
  // アビスリーパー[電気]魂喰らいの宴(全体+解除)
  76: { concept: "弱体攻撃の階", trait: "NONE", units: [u("abyssreaper", "ELECTRIC"), u("mushroon", "ELECTRIC"), u("basilisk", "FIRE"), u("dragon", "FIRE"), u("kobold", "FIRE")] },
  77: { concept: "守りの階", trait: "WARD", units: [u("behemoth", "GRASS"), u("mimic", "ELECTRIC"), u("wisp", "WATER"), u("nemesis", "FIRE"), u("shellturtle", "ELECTRIC")] },
  78: { concept: "攻撃の階", trait: "NONE", units: [u("fenrir", "ELECTRIC"), u("dragon", "FIRE"), u("thunderbeast", "ELECTRIC"), u("valkyria", "FIRE"), u("griffon", "FIRE")] },
  // クロノス[水]時空崩壊(全体スタン+ゲージ-100%) / アビスリーパー[火]死の宣告
  79: { concept: "強敵の階", trait: "NONE", units: [u("chronos", "WATER"), u("abyssreaper", "FIRE"), u("fenrir", "ELECTRIC"), u("behemoth", "ELECTRIC"), u("valkyria", "ELECTRIC")] },

  /* ---- 81〜89 ---- */
  // ドラゴン[電気]りゅうの闘気(会心ダメ+速度) / ヴァルキリア[火]戦乙女の号令(ゲージ+攻撃)
  81: { concept: "火力支援の階", trait: "NONE", units: [u("dragon", "ELECTRIC"), u("fenrir", "ELECTRIC"), u("basilisk", "FIRE"), u("valkyria", "FIRE"), u("kobold", "FIRE")] },
  82: { concept: "回復耐久の階", trait: "HEALER", units: [u("valkyria", "ELECTRIC"), u("seraph", "WATER"), u("behemoth", "ELECTRIC"), u("nemesis", "FIRE"), u("shellturtle", "WATER")] },
  // クロノス[草]時間停止/時空崩壊。マッシュルン[草]衰弱胞子(攻撃低下+回復阻害)
  83: { concept: "行動阻害の階", trait: "NONE", units: [u("chronos", "GRASS"), u("basilisk", "ELECTRIC"), u("abyssreaper", "ELECTRIC"), u("mushroon", "GRASS"), u("kobold", "ELECTRIC")] },
  // ヴァルキリア[草]守護の翼(回復+解除+防御上昇)
  84: { concept: "鉄壁の階", trait: "WARD", units: [u("behemoth", "GRASS"), u("mimic", "ELECTRIC"), u("shellturtle", "ELECTRIC"), u("valkyria", "GRASS"), u("wisp", "WATER")] },
  // クロノス[火]クロノブースト(味方全体のゲージ+CT短縮)
  85: { concept: "高速攻撃の階", trait: "SWIFT", units: [u("thunderbeast", "ELECTRIC"), u("fenrir", "ELECTRIC"), u("chronos", "FIRE"), u("griffon", "FIRE"), u("valkyria", "FIRE")] },
  // 全員が防御低下か解除を持つ。ドラゴン[水]ドラゴンクロー(防御大低下)
  86: { concept: "弱体集中の階", trait: "NONE", units: [u("abyssreaper", "ELECTRIC"), u("mushroon", "ELECTRIC"), u("basilisk", "GRASS"), u("dragon", "WATER"), u("fenrir", "FIRE")] },
  // ネメシス[電気]加速の号令(ゲージ+会心率)
  87: { concept: "加速攻撃の階", trait: "SWIFT", units: [u("valkyria", "FIRE"), u("chronos", "FIRE"), u("fenrir", "ELECTRIC"), u("nemesis", "ELECTRIC"), u("thunderbeast", "WATER")] },
  // ミミック[水]貪欲な反撃(反撃態勢) / シェルタートル[草]かばう
  88: { concept: "反撃耐久の階", trait: "WARD", units: [u("behemoth", "ELECTRIC"), u("mimic", "WATER"), u("wisp", "WATER"), u("thunderbeast", "GRASS"), u("shellturtle", "GRASS")] },
  89: { concept: "強敵の階", trait: "NONE", units: [u("chronos", "ELECTRIC"), u("abyssreaper", "ELECTRIC"), u("fenrir", "ELECTRIC"), u("dragon", "FIRE"), u("valkyria", "ELECTRIC")] },

  /* ---- 91〜99 ---- */
  91: { concept: "純火力の階", trait: "NONE", units: [u("dragon", "FIRE"), u("fenrir", "ELECTRIC"), u("thunderbeast", "ELECTRIC"), u("valkyria", "FIRE"), u("griffon", "FIRE")] },
  92: { concept: "妨害の階", trait: "NONE", units: [u("chronos", "ELECTRIC"), u("basilisk", "ELECTRIC"), u("abyssreaper", "ELECTRIC"), u("mushroon", "ELECTRIC"), u("nemesis", "GRASS")] },
  93: { concept: "鉄壁の階", trait: "WARD", units: [u("behemoth", "GRASS"), u("shellturtle", "ELECTRIC"), u("mimic", "ELECTRIC"), u("valkyria", "ELECTRIC"), u("seraph", "WATER")] },
  94: { concept: "速攻の階", trait: "SWIFT", units: [u("chronos", "FIRE"), u("thunderbeast", "ELECTRIC"), u("fenrir", "ELECTRIC"), u("nemesis", "ELECTRIC"), u("valkyria", "FIRE")] },
  95: { concept: "強化火力の階", trait: "NONE", units: [u("valkyria", "FIRE"), u("dragon", "ELECTRIC"), u("fenrir", "ELECTRIC"), u("abyssreaper", "FIRE"), u("thunderbeast", "WATER")] },
  // ベヒモス[火]天地崩壊(全体+防御大低下+ゲージ減)
  96: { concept: "制圧の階", trait: "NONE", units: [u("chronos", "WATER"), u("basilisk", "ELECTRIC"), u("abyssreaper", "ELECTRIC"), u("behemoth", "FIRE"), u("mushroon", "ELECTRIC")] },
  // ドラゴン[水]古龍の加護(攻撃+防御上昇+回復)。攻めながら支える1体
  97: { concept: "攻防一体の階", trait: "NONE", units: [u("behemoth", "ELECTRIC"), u("valkyria", "ELECTRIC"), u("fenrir", "ELECTRIC"), u("dragon", "WATER"), u("abyssreaper", "FIRE")] },
  98: { concept: "高速制圧の階", trait: "SWIFT", units: [u("chronos", "ELECTRIC"), u("thunderbeast", "ELECTRIC"), u("basilisk", "ELECTRIC"), u("abyssreaper", "ELECTRIC"), u("fenrir", "ELECTRIC")] },
  /*
   * 最後の通常階。**5つの役割が全部埋まった編成**にしてある。
   *   クロノス[電気]      ゲージ・クールタイム操作
   *   アビスリーパー[電気] 剥がし・妨害
   *   フェンリル[電気]     火力・仕留め役
   *   ベヒモス[水]         受け(古代巨獣のパッシブ+全体攻撃力低下)
   *   ヴァルキリア[電気]   回復・加速
   */
  99: { concept: "最終通常階", trait: "NONE", units: [u("chronos", "ELECTRIC"), u("abyssreaper", "ELECTRIC"), u("fenrir", "ELECTRIC"), u("behemoth", "WATER"), u("valkyria", "ELECTRIC")] },
};

/**
 * 実効ステータスの帯。**10階ぶんで約1.2倍**しか伸ばさない。
 *
 * 50階までの曲線は10階で約1.65倍(50→55 が 60→92)で、そのまま続けると
 * 100階で1100、つまり50階の20倍になる。それは「育てば届く」ではなく
 * 「別の単位の敵」であって、`docs/design-concept.md` の
 * **ふつうのモンスターでも育てて装備を整えれば奥まで行ける**と正面から衝突する。
 *
 * ここは実数で置く。倍率で書くと星・レベル・属性補正が全部掛かって、
 * 「結局いくつなのか」がコードのどこにも書かれていない状態になる
 * (実際、装備ダンジョンと魔獣ダンジョンは実数へ移してある)。
 */
export interface TowerUpperBand {
  /** この帯が受け持つ階(両端を含む) */
  from: number;
  to: number;
  hp: readonly [number, number];
  atk: readonly [number, number];
  def: readonly [number, number];
  spd: readonly [number, number];
  /**
   * 疾風・加速の階で敵全員に足す速度。
   *
   * **倍率にしない。**倍率だと上の帯で効きすぎて、91〜99階の疾風が
   * 速度250〜300へ飛ぶ(手番が2周してから初手が来る盤面になる)。
   * 実数なら帯の上限から一定の距離に収まり、最速個体でも190〜200で止まる。
   */
  swiftSpdBonus: number;
}

export const TOWER_UPPER_BANDS: readonly TowerUpperBand[] = [
  { from: 51, to: 59, hp: [48_000, 68_000], atk: [4_400, 5_900], def: [1_600, 2_400], spd: [138, 162], swiftSpdBonus: 10 },
  { from: 61, to: 69, hp: [57_000, 80_000], atk: [5_000, 6_700], def: [1_750, 2_650], spd: [143, 168], swiftSpdBonus: 10 },
  { from: 71, to: 79, hp: [67_000, 94_000], atk: [5_700, 7_500], def: [1_950, 2_950], spd: [148, 174], swiftSpdBonus: 11 },
  { from: 81, to: 89, hp: [78_000, 108_000], atk: [6_400, 8_400], def: [2_150, 3_250], spd: [153, 180], swiftSpdBonus: 11 },
  { from: 91, to: 99, hp: [90_000, 125_000], atk: [7_100, 9_500], def: [2_400, 3_650], spd: [158, 188], swiftSpdBonus: 12 },
];

export function towerUpperBandOf(floor: number): TowerUpperBand | null {
  return TOWER_UPPER_BANDS.find((band) => floor >= band.from && floor <= band.to) ?? null;
}

/**
 * 帯の中でどこに置くかの重み。
 *
 * **階の位置だけで決めない。**全員を同じ数値にすると、HP型・攻撃型・防御型の差が消えて
 * 「同じ敵が5体並んでいる」になる。ベヒモスとコボルトが同じHPで同じ攻撃力の階は、
 * 誰から倒すかを考える必要が無い。
 *
 * **モンスターの素の値だけでも決めない。**それだと階が上がっても
 * 同じ顔ぶれなら同じ強さになり、51階と59階の区別がつかない。
 *
 * だから両方を混ぜる。階の位置を主(0.62)、素の値を従(0.38)。
 * 従の側が大きすぎると、上の階に低ステータスの支援役を置いた瞬間に
 * 帯の下限へ落ちて階が軽くなる。
 */
const FLOOR_WEIGHT = 0.62;
const ARCHETYPE_WEIGHT = 1 - FLOOR_WEIGHT;

type ArchetypeStat = "hp" | "atk" | "def" | "spd";

function dexOf(unit: TowerUpperUnit) {
  const dex = findMonster(unit.templateId, unit.element);
  if (!dex) throw new Error(`51階以降の編成に図鑑にない個体がある: ${unit.templateId}_${unit.element}`);
  return dex;
}

/**
 * 素の値を0〜1へ正規化するための幅。
 *
 * **51階以降に実際に出る顔ぶれだけ**から取る。図鑑全体から取ると、
 * 塔に一度も出ないスライムやピッグが幅を決めてしまい、
 * 実際に出る顔ぶれが帯の狭いところへ固まる。
 */
const ARCHETYPE_RANGE: Record<ArchetypeStat, { min: number; max: number }> = (() => {
  const stats: ArchetypeStat[] = ["hp", "atk", "def", "spd"];
  const all = Object.values(TOWER_UPPER_FLOOR_DEFS).flatMap((def) => def.units.map((unit) => dexOf(unit).stats));
  const range = {} as Record<ArchetypeStat, { min: number; max: number }>;
  for (const stat of stats) {
    const values = all.map((s) => s[stat]);
    range[stat] = { min: Math.min(...values), max: Math.max(...values) };
  }
  return range;
})();

function archetypeRatio(stat: ArchetypeStat, value: number): number {
  const { min, max } = ARCHETYPE_RANGE[stat];
  if (max === min) return 0.5;
  return (value - min) / (max - min);
}

function lerp(range: readonly [number, number], t: number): number {
  return range[0] + (range[1] - range[0]) * t;
}

/** その階の実効ステータス1体ぶん。**帯の中に必ず収まる**(疾風の加算だけが例外) */
export function towerUpperStatsOf(
  floor: number,
  unit: TowerUpperUnit,
  trait: TowerTrait,
): { hp: number; atk: number; def: number; spd: number } {
  const band = towerUpperBandOf(floor);
  if (!band) throw new Error(`51階以降の帯に入っていない階: ${floor}`);
  const base = dexOf(unit).stats;
  const floorT = band.to === band.from ? 1 : (floor - band.from) / (band.to - band.from);
  const at = (stat: ArchetypeStat, target: readonly [number, number]): number => {
    const blend = FLOOR_WEIGHT * floorT + ARCHETYPE_WEIGHT * archetypeRatio(stat, base[stat]);
    return Math.round(lerp(target, blend));
  };
  const swift = trait === "SWIFT" ? band.swiftSpdBonus : 0;
  return { hp: at("hp", band.hp), atk: at("atk", band.atk), def: at("def", band.def), spd: at("spd", band.spd) + swift };
}

/** 疾風・加速の階なら、その階の敵全員がこの速度以上になっている(傾向の自己点検に使う) */
export function towerUpperSwiftFloorSpd(floor: number): number | null {
  const band = towerUpperBandOf(floor);
  if (!band) return null;
  return band.spd[0] + band.swiftSpdBonus;
}

/** その階が51階以降の通常階か(60/70/80/90/100 のボス階は含まない) */
export function isTowerUpperFloor(floor: number): boolean {
  return TOWER_UPPER_FLOOR_DEFS[floor] !== undefined;
}

export function towerUpperFloorDef(floor: number): TowerUpperFloorDef | null {
  return TOWER_UPPER_FLOOR_DEFS[floor] ?? null;
}

/**
 * 名札の説明。**何が起きるかだけを書く。**
 *
 * 「解除を持って行け」とは書かない。何を連れて行くかは考える所で、
 * 答えを先に書くと階が問いではなくなる。
 *
 * 呼び名ごとに1本ずつ。階ごとに書かないのは、同じ呼び名の階で
 * 説明が食い違うのを防ぐため(51階と61階の「通常の階」は同じ説明でよい)。
 */
const CONCEPT_NOTES: Readonly<Record<string, string>> = {
  "通常の階": "素直な殴り合いです。",
  "癒やしの階": "敵が味方を癒やします。削りきる前に戻されます。",
  "守りの階": "敵が盾と免疫を張ります。素直に殴っても通りません。",
  "耐久の階": "敵が受けを固め、削られた分を戻してきます。",
  "鉄壁の階": "敵が盾・軽減・かばうを重ねてきます。",
  "反撃耐久の階": "敵が反撃の構えを取ります。殴った分が返ります。",
  "回復耐久の階": "敵が癒やしながら受けを固めます。長い戦いになります。",
  "疾風の階": "敵が速く、先に動いてきます。",
  "加速の階": "敵が味方の行動ゲージを進め、手番を増やしてきます。",
  "速攻の階": "敵が速く、しかも手番を増やしてきます。",
  "高速攻撃の階": "速い敵が、そのまま火力を出してきます。",
  "加速攻撃の階": "敵が手番を増やしながら攻めてきます。",
  "高速制圧の階": "速い敵が、行動そのものを止めにきます。",
  "妨害の階": "敵が強化を剥がし、行動ゲージを削ってきます。",
  "弱体の階": "敵が攻撃力・防御力・速度を削ってきます。",
  "弱体攻撃の階": "敵が弱らせながら攻めてきます。",
  "弱体集中の階": "敵が防御力を削り切ってから殴ってきます。",
  "行動阻害の階": "敵が気絶・ゲージ減少・クールタイム延長で手番を奪います。",
  "制圧の階": "敵が全体を止めながら削ってきます。",
  "攻撃の階": "敵が真っ直ぐ火力で押してきます。",
  "純火力の階": "敵の火力だけが極まっています。",
  "火力支援の階": "敵が味方を強化してから殴ってきます。",
  "強化火力の階": "敵が強化を積み上げて火力を伸ばしてきます。",
  "攻防一体の階": "敵が攻めながら自分たちを支えます。",
  "強敵の階": "役割の揃った編成が待っています。",
  "最終通常階": "ゲージ操作・剥がし・火力・受け・回復が揃った編成です。",
};

/** その階の名札の説明。呼び名に対応する説明が無ければ空文字 */
export function towerUpperNote(floor: number): string {
  const def = towerUpperFloorDef(floor);
  if (!def) return "";
  return CONCEPT_NOTES[def.concept] ?? "";
}

/** 呼び名すべてに説明があるかを確かめるための一覧(テストが使う) */
export const TOWER_UPPER_CONCEPT_NOTES = CONCEPT_NOTES;

/**
 * 51階以降の1階ぶんの敵。
 *
 * `star` / `level` は `fixedStats` があるので実効値には効かないが、
 * 型が要求するので帯の上限(★6 Lv60)を入れてある。
 * **難易度は倍率ではなく上の実数で決まっている。**
 */
export function towerUpperEnemies(floor: number): DungeonEnemy[] | null {
  const def = towerUpperFloorDef(floor);
  if (!def) return null;
  return def.units.map((unit) => ({
    templateId: unit.templateId,
    element: unit.element,
    star: 6 as const,
    level: 60,
    fixedStats: towerUpperStatsOf(floor, unit, def.trait),
  }));
}

/**
 * 「強いスキルを持つ顔ぶれ」の数。上の階ほど増えていることを確かめるために数える。
 *
 * 数える対象は**今回追加した11種**。★3〜★5に散っているが、
 * 解除・回復阻害・ゲージ操作・パッシブといった、既存8種が持っていない手を持っている。
 */
export const TOWER_UPPER_STRONG_TEMPLATE_IDS: ReadonlySet<string> = new Set([
  "mushroon", "shellturtle", "kobold",
  "basilisk", "mimic", "valkyria", "thunderbeast",
  "abyssreaper", "fenrir", "chronos", "behemoth",
]);

export function towerUpperStrongCount(floor: number): number {
  const def = towerUpperFloorDef(floor);
  if (!def) return 0;
  return def.units.filter((unit) => TOWER_UPPER_STRONG_TEMPLATE_IDS.has(unit.templateId)).length;
}
