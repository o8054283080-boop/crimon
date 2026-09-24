import {
  type Accessory, type AccessoryFamily, type AccessoryRarity, generateAccessory, pickWeighted,
} from "../core/accessory.js";
import { type Equipment, type SetType, SET_TYPES, generateEquipment } from "../core/equipment.js";
import { dungeonFloorInitialSubWeights, pickInitialSubStatCount } from "../core/equipmentRarity.js";
import {
  type AbilityPointAllocation, LIMIT_BREAK_CORE_COST, LIMIT_POINT_MAX_PLUS, sanitizeLimitPoints,
} from "../core/monsterDevelopment.js";
import { addAccessory } from "./accessories.js";
import { addEquipment, type PlayerState } from "./playerState.js";

/**
 * 古代のカケラでの製作と、進化核での限界能力付与。
 *
 * ## カケラ製作
 *
 * 150個で1つ。**余りは残す**(160個あれば10個残る)。150個に届かなければ作れない。
 *
 *   アクセ … ★6確定、系統は選べる。レア度はヒーロー/レジェンド/エピックを 50/35/15 で引き、
 *            メイン・特殊・弱効果・値はふつうに引く
 *   装備   … ★6確定、シリーズは選べる。枠・メイン・サブは引く。
 *            初期サブ数の出方は装備ダンジョン12階と同じ(12階より良くはならない)
 *
 * ## 進化核
 *
 * アクセの素材ではない。100個で1体の限界能力付与を解放する。
 */

export const ANCIENT_CRAFT_COST = 150;

/** カケラ製作のアクセのレア度。★6確定 */
export const CRAFT_ACCESSORY_RARITY_WEIGHTS: readonly (readonly [AccessoryRarity, number])[] = [
  ["HERO", 50], ["LEGEND", 35], ["EPIC", 15],
];

/** カケラ製作の装備の初期サブ数。**装備ダンジョン12階と同じ表を読む** */
export const CRAFT_EQUIPMENT_SUB_FLOOR = 12;

export type CraftResult<T> = { ok: true; item: T } | { ok: false; reason: string };

export function canCraft(state: Pick<PlayerState, "ancientShards">): boolean {
  return (state.ancientShards ?? 0) >= ANCIENT_CRAFT_COST;
}

function payShards(state: PlayerState): boolean {
  if (!canCraft(state)) return false;
  state.ancientShards = (state.ancientShards ?? 0) - ANCIENT_CRAFT_COST;
  return true;
}

export function craftAccessory(state: PlayerState, family: AccessoryFamily, rng: () => number = Math.random): CraftResult<Accessory> {
  if (!canCraft(state)) return { ok: false, reason: `古代のカケラが${ANCIENT_CRAFT_COST}個必要です` };
  if (!["ATTACK", "DURABILITY", "SUPPORT", "DISRUPT"].includes(family)) return { ok: false, reason: "系統を選んでください" };
  payShards(state);
  const rarity = pickWeighted(CRAFT_ACCESSORY_RARITY_WEIGHTS, rng);
  const item = generateAccessory({ star: 6, rarity, family, rng });
  addAccessory(state, item);
  return { ok: true, item };
}

export function craftEquipment(state: PlayerState, set: SetType, rng: () => number = Math.random): CraftResult<Equipment> {
  if (!canCraft(state)) return { ok: false, reason: `古代のカケラが${ANCIENT_CRAFT_COST}個必要です` };
  if (!SET_TYPES.includes(set)) return { ok: false, reason: "シリーズを選んでください" };
  payShards(state);
  const subStatCount = pickInitialSubStatCount(dungeonFloorInitialSubWeights(CRAFT_EQUIPMENT_SUB_FLOOR), rng);
  const item = generateEquipment({ star: 6, set, subStatCount, rng });
  addEquipment(state, item);
  return { ok: true, item };
}

/* ==========================================================================
 * 限界能力付与
 * ========================================================================== */

export type LimitActionResult = { ok: true } | { ok: false; reason: string };

export function isLimitBreakUnlocked(monster: { development: { limitBreak?: { unlocked: boolean } } }): boolean {
  return monster.development.limitBreak?.unlocked === true;
}

/**
 * 進化核100個で1体ぶん解放する。**★6の個体だけ**
 * (通常の能力ポイントの上限100が★6の値なので、その外側を開く仕組みとして★6に揃える)。
 */
export function unlockLimitBreak(state: PlayerState, monsterId: string): LimitActionResult {
  const monster = state.monsters.find((m) => m.id === monsterId);
  if (!monster) return { ok: false, reason: "モンスターが見つかりません" };
  if (monster.star < 6) return { ok: false, reason: "★6のモンスターだけが解放できます" };
  if (isLimitBreakUnlocked(monster)) return { ok: false, reason: "すでに解放しています" };
  if ((state.evolutionCores ?? 0) < LIMIT_BREAK_CORE_COST) return { ok: false, reason: `進化核が${LIMIT_BREAK_CORE_COST}個必要です` };
  state.evolutionCores = (state.evolutionCores ?? 0) - LIMIT_BREAK_CORE_COST;
  monster.development.limitBreak = { unlocked: true, points: { hp: 0, atk: 0, def: 0, spd: 0 } };
  return { ok: true };
}

/**
 * 限界配分をまるごと置き換える。**決まりを外れた配分は受け付けない**
 * (+側の合計は50まで、−側の合計は+側と同じ)。
 * 何度でも無料で振り直せる——足した分だけ必ずどこかが2倍削れるので、
 * 振り直しに代金を取る理由が無い。
 */
export function setLimitPoints(state: PlayerState, monsterId: string, points: AbilityPointAllocation): LimitActionResult {
  const monster = state.monsters.find((m) => m.id === monsterId);
  if (!monster) return { ok: false, reason: "モンスターが見つかりません" };
  if (!isLimitBreakUnlocked(monster)) return { ok: false, reason: "限界能力付与が解放されていません" };
  const next = { unlocked: true, points: { hp: points.hp, atk: points.atk, def: points.def, spd: points.spd } };
  const valid = sanitizeLimitPoints(next);
  if (!valid) {
    const plus = Object.values(next.points).filter((v) => v > 0).reduce((a, b) => a + b, 0);
    const minus = -Object.values(next.points).filter((v) => v < 0).reduce((a, b) => a + b, 0);
    if (plus > LIMIT_POINT_MAX_PLUS) return { ok: false, reason: `+側は合計${LIMIT_POINT_MAX_PLUS}までです` };
    if (plus !== minus) return { ok: false, reason: "+側と−側の合計を同じにしてください" };
    return { ok: false, reason: "配分が正しくありません" };
  }
  monster.development.limitBreak = { unlocked: true, points: valid };
  return { ok: true };
}

export function limitPointTotals(points: AbilityPointAllocation): { plus: number; minus: number } {
  let plus = 0;
  let minus = 0;
  for (const v of Object.values(points)) { if (v > 0) plus += v; else minus -= v; }
  return { plus, minus };
}
