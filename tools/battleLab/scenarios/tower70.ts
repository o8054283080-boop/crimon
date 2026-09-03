/**
 * 試練の塔 70階「始祖ベヒモス」(検証中)。
 *
 * ## これは本編ではない
 *
 * `src/data/trialTower.ts` の70階には**一切触れていない。**あちらは今も
 * 従来どおり古代の魔人+お供2体で、`trialTowerFloor: 70` の超再生が効く。
 * ここに書いてあるのは「こういう階にしたらどうなるか」を測るための盤面で、
 * 本編へ入れるのはこの道具で測ってからの別作業(依頼主の指定)。
 *
 * ## 何を確かめたい階か
 *
 * 本体は硬くて自分で回復する。取り巻きは性質が違う:
 *
 *   ・生命晶 …… 3ターンごとに**味方全体の弱化を全解除**し、本体の再生を厚くする
 *   ・脈動晶 …… 本体へシールドと軽減を配り、寿命を延ばす
 *
 * だから**どちらを先に落とすかで戦いの形が変わる**。
 * 毒は通る(耐性を1つも付けていない)が、生命晶が生きている限り消される。
 * 「毒が有効だが、毒でなければ勝てない階」にはしない、という線を測る。
 *
 * ## 編成は4つとも装備の仕上がりを揃える
 *
 * 編成の差だけを見たいので、装備段階は全部 TYPICAL で回す。
 * 装備の差を見たい時は `--gear` を振ること。
 */
import type { AllySpec, Scenario } from "../types.js";
import { tower70Enemies } from "../tower70/enemies.js";
import { tower70Probe } from "../tower70/probe.js";
import { TOWER70_BASE, TOWER70_LABELS, type Tower70Numbers } from "../tower70/spec.js";

/** 60階で使っていた5体。**同じ物差しで比べるため、そのまま借りる** */
export const TOWER70_TYPICAL: AllySpec[] = [
  { label: "ドラゴン[火]", templateId: "dragon", element: "FIRE", preset: "MAX_ATTACKER" },
  { label: "ウィスプ[水]", templateId: "wisp", element: "WATER", preset: "MAX_HEALER" },
  { label: "クロノス[電気]", templateId: "chronos", element: "ELECTRIC", preset: "MAX_SPEED" },
  { label: "アビスリーパー[闇]", templateId: "abyssreaper", element: "DARK", preset: "MAX_DEBUFFER" },
  { label: "ヴァルキリア[火]", templateId: "valkyria", element: "FIRE", preset: "MAX_TANK" },
];

/** 召喚限定の高レア中心 */
export const TOWER70_HIGH_RARITY: AllySpec[] = [
  { label: "ネメシス[火]", templateId: "nemesis", element: "FIRE", preset: "MAX_ATTACKER" },
  { label: "ドラゴン[草]", templateId: "dragon", element: "GRASS", preset: "MAX_ATTACKER" },
  { label: "セラフ[水]", templateId: "seraph", element: "WATER", preset: "MAX_HEALER" },
  { label: "グリフォン[電気]", templateId: "griffon", element: "ELECTRIC", preset: "MAX_SPEED" },
  { label: "クロノス[闇]", templateId: "chronos", element: "DARK", preset: "MAX_SUPPORT" },
];

/** 回復・耐久寄り。長引く盤面で本体を削り切れるかを見る */
export const TOWER70_SUSTAIN: AllySpec[] = [
  { label: "セラフ[水]", templateId: "seraph", element: "WATER", preset: "MAX_HEALER" },
  { label: "ウィスプ[水]", templateId: "wisp", element: "WATER", preset: "MAX_SUPPORT" },
  { label: "ヴァルキリア[電気]", templateId: "valkyria", element: "ELECTRIC", preset: "MAX_TANK" },
  { label: "ベヒモス[電気]", templateId: "behemoth", element: "ELECTRIC", preset: "MAX_TANK" },
  { label: "ドラゴン[火]", templateId: "dragon", element: "FIRE", preset: "MAX_ATTACKER" },
];

/**
 * 毒編成。**本編に実在する毒スキルだけ**で組んである(架空の毒を作らない)。
 *
 * 味方AIはクールタイムが明けている中で番号の大きいスキルを選ぶので、
 * **スキル3に毒がある個体**を並べないと毒が実際には撒かれない
 * (毒を1つも持たない3体を「毒編成」として測り、嘘の結論を出した前例がある)。
 *
 *   ・マッシュルン[火] …… S1胞子弾/S2毒胞子の雨/S3毒床 の3つとも毒
 *   ・スライム[草] ……… S3毒噴射(全体・70%)
 *   ・インプ[電気] ……… S3どくのきり(全体・65%)
 *
 * 残り2枠は、長期戦を保たせる回復とゲージ役。
 */
export const TOWER70_POISON: AllySpec[] = [
  { label: "マッシュルン[火]", templateId: "mushroon", element: "FIRE", preset: "MAX_DEBUFFER" },
  { label: "スライム[草]", templateId: "slime", element: "GRASS", preset: "MAX_DEBUFFER" },
  { label: "インプ[電気]", templateId: "imp", element: "ELECTRIC", preset: "MAX_DEBUFFER" },
  { label: "ウィスプ[水]", templateId: "wisp", element: "WATER", preset: "MAX_HEALER" },
  { label: "クロノス[電気]", templateId: "chronos", element: "ELECTRIC", preset: "MAX_SPEED" },
];

export const TOWER70_PARTIES: Record<string, AllySpec[]> = {
  TYPICAL: TOWER70_TYPICAL,
  HIGH_RARITY: TOWER70_HIGH_RARITY,
  SUSTAIN: TOWER70_SUSTAIN,
  POISON: TOWER70_POISON,
};

/**
 * 狙う順。**1つ目が既定。**
 *
 * 「どれから倒すか」で戦いの形が変わることを狙った階なので、
 * 順番を切り替えて比べられないと、その狙いが効いているか確かめようがない。
 * 既定は実測でいちばん強かった線を置くこと(作った後に並べ直す)。
 */
export const TOWER70_FOCUS = [
  { name: "生命晶→脈動晶→ボス", order: [TOWER70_LABELS.life, TOWER70_LABELS.pulse, TOWER70_LABELS.boss] },
  { name: "生命晶→ボス", order: [TOWER70_LABELS.life, TOWER70_LABELS.boss] },
  { name: "脈動晶→ボス", order: [TOWER70_LABELS.pulse, TOWER70_LABELS.boss] },
  { name: "ボス集中", order: [TOWER70_LABELS.boss] },
  { name: "既存AIまかせ", order: [] },
];

/** 編成と数値を差し替えた盤面を作る。スイープはこれを回す */
export function buildTower70(options: {
  id?: string;
  allies?: AllySpec[];
  numbers?: Tower70Numbers;
  note?: string;
} = {}): Scenario {
  const numbers = options.numbers ?? TOWER70_BASE;
  return {
    id: options.id ?? "tower-70",
    title: "試練の塔 70階 始祖ベヒモス(検証中)",
    note: options.note
      ?? "本体の再生と取り巻き2種。どちらを先に落とすかで形が変わるか、毒が通るかを見る",
    maxTurns: 300,
    allies: options.allies ?? TOWER70_TYPICAL,
    enemies: tower70Enemies(numbers),
    focusPatterns: TOWER70_FOCUS,
    hook: (context) => tower70Probe(context, numbers),
  };
}

export const TOWER70: Scenario = buildTower70();
