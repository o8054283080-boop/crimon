/**
 * 試練の塔HARDを、**本番の登坂の関数をそのまま使って**1階から登らせる。
 *
 *   npx tsx tools/towerHardClimb.ts --climbs 20 --seed 20260927
 *
 * 依頼主の実際の5体(2026-09-27のスクショ)を、クリエイト・才能・潜在・装備セット・アクセまで
 * 個体として組み、`beginTowerRun` → `setupTowerBattle` → BattleEngine → `applyTowerFloorResult` を回す。
 * 節(10階ごと)で全回復、HP・クールタイムの持ち越しも本番のまま。
 *
 * **ステータスだけはスクショの最終値で上書きする。**装備の乱数を合わせ込むより確かなので。
 * アクセの特殊効果は画面に出ている分だけ合わせた(見えない分は近い値)。
 * 本番のデータ・エンジンには触らない。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { BattleEngine } from "../src/battle/engine.js";
import { generateEquipment, EQUIP_SLOTS, type SetType } from "../src/core/equipment.js";
import { createMonsterInstance, type MonsterInstance } from "../src/core/monsterInstance.js";
import { createDefaultTalentState } from "../src/core/talents.js";
import { applyStatEffect } from "../src/battle/unit.js";
import type { Accessory } from "../src/core/accessory.js";
import type { Stats } from "../src/core/monster.js";
import { addEquipment, createInitialState, equipToMonster, type PlayerState } from "../src/game/playerState.js";
import { applyTowerFloorResult, beginTowerRun, setupTowerBattle } from "../src/game/trialTower.js";

const argv = process.argv.slice(2);
const arg = (name: string, fallback: string): string => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const CLIMBS = Number(arg("climbs", "20"));
const SEED = Number(arg("seed", "20260927")) >>> 0;
/** 負けた時に節からやり直す回数の上限(1回の登坂あたり)。本番は何度でも挑める */
const RETRIES = Number(arg("retries", "0"));

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Member {
  dexId: string;
  skillLevels: [number, number, number];
  latentId: string;
  sets: SetType[]; // S1〜S6
  created?: { slot: 1 | 2; skillId: string; sourceDexId: string };
  talents: (t: ReturnType<typeof createDefaultTalentState>) => void;
  accessory?: Omit<Accessory, "id">;
  /** スクショの最終値。criDmg は「+79%」→ 1.79 */
  stats: Pick<Stats, "hp" | "atk" | "def" | "spd" | "criRate" | "criDmg" | "accuracy" | "resistance">;
}

const OWNER_TEAM: Member[] = [
  {
    dexId: "phoenix_WATER", skillLevels: [5, 5, 5], latentId: "phoenix_WATER_latent_2",
    sets: ["VITALITY", "VITALITY", "VITALITY", "WARD", "VITALITY", "WARD"],
    talents: (t) => { t.basic.hp = 2; t.awakening = { slot: 2, id: "awk_heal_shield" }; },
    accessory: { star: 6, rarity: "LEGEND", family: "SUPPORT", level: 15, mainStat: "HP", mainRoll: 1, specials: [{ id: "HEAL_UP", value: 0.17 }, { id: "HEALED_DR", value: 0.1 }], weak: "W_HEAL_UP" },
    stats: { hp: 120100, atk: 1560, def: 3175, spd: 177, criRate: 0.30, criDmg: 1.79, accuracy: 0.49, resistance: 1.00 },
  },
  {
    dexId: "thunderbeast_LIGHT", skillLevels: [3, 3, 5], latentId: "thunderbeast_LIGHT_latent_2",
    sets: ["SWIFT", "VITALITY", "SWIFT", "CRIT", "SWIFT", "SWIFT"],
    created: { slot: 2, skillId: "chronos_s3_b", sourceDexId: "chronos_WATER" },
    talents: (t) => { t.basic.spd = 2; },
    stats: { hp: 27790, atk: 3717, def: 2619, spd: 425, criRate: 0.87, criDmg: 2.32, accuracy: 0.14, resistance: 0.24 },
  },
  {
    dexId: "chronos_DARK", skillLevels: [5, 5, 5], latentId: "chronos_DARK_latent_3",
    sets: ["RAMPAGE", "RAMPAGE", "RAMPAGE", "SWIFT", "RAMPAGE", "SWIFT"],
    created: { slot: 1, skillId: "nemesis_s2_a", sourceDexId: "nemesis_FIRE" },
    talents: (t) => { t.basic.hp = 2; t.awakening = { slot: 1, id: "awk_atk_strip" }; },
    accessory: { star: 6, rarity: "EPIC", family: "DISRUPT", level: 15, mainStat: "HP", mainRoll: 1, specials: [{ id: "GAUGE_DOWN_UP", value: 0.114 }, { id: "STRIP_SELF_GAUGE", value: 0.08 }, { id: "S1_RATE", value: 0.048 }], weak: "W_DEBUFF_RATE" },
    stats: { hp: 58582, atk: 1541, def: 5480, spd: 302, criRate: 0.39, criDmg: 2.08, accuracy: 0.95, resistance: 0.27 },
  },
  {
    dexId: "undine_GRASS", skillLevels: [4, 3, 5], latentId: "undine_GRASS_latent_3",
    sets: ["RAMPAGE", "RAMPAGE", "RAMPAGE", "IMMUNITY_SET", "RAMPAGE", "IMMUNITY_SET"],
    talents: (t) => { t.basic.hp = 3; t.basic.def = 2; t.battle.damageTaken = 1; },
    stats: { hp: 51471, atk: 2165, def: 12321, spd: 196, criRate: 0.05, criDmg: 1.59, accuracy: 0.94, resistance: 0.91 },
  },
  {
    dexId: "crim_LIGHT", skillLevels: [5, 5, 5], latentId: "crim_LIGHT_latent_2",
    sets: ["POWER", "GUARD", "POWER", "POWER", "POWER", "POWER"],
    talents: (t) => { t.basic.atk = 3; t.basic.criRate = 3; t.basic.criDmg = 2; t.skill[1] = ["atk_momentum"]; },
    accessory: { star: 6, rarity: "LEGEND", family: "ATTACK", level: 15, mainStat: "ATK", mainRoll: 1, specials: [{ id: "FIRST", value: 0.08 }, { id: "KILL_GAUGE", value: 0.07 }], weak: "W_FINISH" },
    stats: { hp: 27728, atk: 17241, def: 1567, spd: 169, criRate: 0.83, criDmg: 4.14, accuracy: 0.45, resistance: 0.55 },
  },
];

/*
 * 依頼主の案(2026-09-27)で入れ替える個体。**スクショが無いので仮の組み**。
 * 依頼主の5体と同じ仕上がり(★6Lv60・スキルMAX・速度才能2)で、「速い」に合わせて
 * クロノス(302)前後の速度、的中はクロノス並みに置いた。
 */
const EXTRA: Record<string, Member> = {
  mushroon_FIRE: {
    // S2 毒胞子の雨 / S3 毒床。潜在は猛毒培養(スキル1の毒+30%)
    dexId: "mushroon_FIRE", skillLevels: [5, 5, 5], latentId: "mushroon_FIRE_latent_1",
    sets: ["SWIFT", "VITALITY", "SWIFT", "VITALITY", "SWIFT", "SWIFT"],
    talents: (t) => { t.basic.spd = 2; },
    stats: { hp: 42000, atk: 2400, def: 2900, spd: 300, criRate: 0.25, criDmg: 1.7, accuracy: 0.85, resistance: 0.40 },
  },
  basilisk_DARK: {
    // S2 石化の眼差し / S3 深淵の魔眼。潜在は時喰み(速度低下が入ったらゲージ-25%)
    dexId: "basilisk_DARK", skillLevels: [5, 5, 5], latentId: "basilisk_DARK_latent_3",
    sets: ["SWIFT", "VITALITY", "SWIFT", "VITALITY", "SWIFT", "SWIFT"],
    talents: (t) => { t.basic.spd = 2; },
    stats: { hp: 40000, atk: 2600, def: 2800, spd: 310, criRate: 0.25, criDmg: 1.7, accuracy: 0.90, resistance: 0.40 },
  },
  mushroon_ELECTRIC: {
    // 防御DOWN持ち。S2 しびれ胞子 / S3 腐敗の胞子(敵全体の防御-75%)。潜在は高速胞子
    dexId: "mushroon_ELECTRIC", skillLevels: [5, 5, 5], latentId: "mushroon_ELECTRIC_latent_1",
    sets: ["SWIFT", "VITALITY", "SWIFT", "VITALITY", "SWIFT", "SWIFT"],
    talents: (t) => { t.basic.spd = 2; },
    stats: { hp: 42000, atk: 2400, def: 2900, spd: 300, criRate: 0.25, criDmg: 1.7, accuracy: 0.85, resistance: 0.40 },
  },
  basilisk_ELECTRIC: {
    // 回復なし編成の「もう1体の気絶係」。S2 石化の眼差し / S3 死の凝視
    dexId: "basilisk_ELECTRIC", skillLevels: [5, 5, 5], latentId: "basilisk_ELECTRIC_latent_2",
    sets: ["SWIFT", "VITALITY", "SWIFT", "VITALITY", "SWIFT", "SWIFT"],
    talents: (t) => { t.basic.spd = 2; },
    stats: { hp: 40000, atk: 2600, def: 2800, spd: 290, criRate: 0.25, criDmg: 1.7, accuracy: 0.90, resistance: 0.40 },
  },
};

/** `CLIMB_TEAM=<名前>` で選ぶ。既定は依頼主の5体そのまま */
const [PHOENIX, THUNDER, CHRONOS, UNDINE, CRIM] = OWNER_TEAM;
const TEAMS: Record<string, Member[]> = {
  owner: OWNER_TEAM,
  // クリムを抜いて速い火マッシュルン
  mush: [PHOENIX, THUNDER, CHRONOS, UNDINE, EXTRA.mushroon_FIRE],
  // クリムを抜いて防御DOWN持ちの雷マッシュルン
  mush_def: [PHOENIX, THUNDER, CHRONOS, UNDINE, EXTRA.mushroon_ELECTRIC],
  // クリムを抜いてマッシュルン、回復はフェニックスだけ、ウンディーネの代わりに闇バジリスク
  mush_basi_phx: [PHOENIX, THUNDER, CHRONOS, EXTRA.mushroon_FIRE, EXTRA.basilisk_DARK],
  // 同じく、フェニックスの代わりにウンディーネを残す
  mush_basi_und: [UNDINE, THUNDER, CHRONOS, EXTRA.mushroon_FIRE, EXTRA.basilisk_DARK],
  // 回復役を抜き、ゲージ操作・気絶係をもう1体
  noheal: [THUNDER, CHRONOS, EXTRA.mushroon_FIRE, EXTRA.basilisk_DARK, EXTRA.basilisk_ELECTRIC],
};
const TEAM_NAME = process.env.CLIMB_TEAM ?? "owner";
if (!TEAMS[TEAM_NAME]) throw new Error(`CLIMB_TEAM は ${Object.keys(TEAMS).join(" / ")} のどれか`);
/** `CLIMB_EXTRA_SPD=60` で仮の組みの個体だけ速度を足す(「どれだけ速ければ効くか」を見る) */
const EXTRA_SPD = Number(process.env.CLIMB_EXTRA_SPD ?? "0");
const EXTRA_MEMBERS = new Set(Object.values(EXTRA));
const TEAM: Member[] = TEAMS[TEAM_NAME].map((m) => ({
  ...m, sets: [...m.sets],
  stats: EXTRA_MEMBERS.has(m) ? { ...m.stats, spd: m.stats.spd + EXTRA_SPD } : m.stats,
}));

/**
 * 切り分け用(`CLIMB_ABLATE=no_tb_create,no_rampage,...`)。何が効いているかを1つずつ外して測る。
 *   no_tb_create … サンダービーストのクリエイト(時空崩壊)を外し、元のスキル3に戻す
 *   tb_spd_302   … サンダービーストの速度を 425 → 302(クロノスと同じ)
 *   no_rampage   … 暴走シリーズを速攻へ替える(追加ターン15%を外す)
 *   no_undine_s3 … ウンディーネのスキル3(味方の被ダメ-25%)を他の個体の同じ枠へ(フェニックスS3で代用)
 */
const ABLATE = new Set((process.env.CLIMB_ABLATE ?? "").split(",").filter(Boolean));
for (const m of TEAM) {
  if (ABLATE.has("no_tb_create") && m.dexId === "thunderbeast_LIGHT") delete m.created;
  if (ABLATE.has("tb_spd_302") && m.dexId === "thunderbeast_LIGHT") m.stats = { ...m.stats, spd: 302 };
  if (ABLATE.has("no_rampage")) m.sets = m.sets.map((set) => (set === "RAMPAGE" ? "SWIFT" : set));
  if (ABLATE.has("no_undine_s3") && m.dexId === "undine_GRASS") m.created = { slot: 2, skillId: "phoenix_s3_b", sourceDexId: "phoenix_WATER" };
}

/**
 * 通常階だけ、PR #431 の ABSOLUTE_CURVE(実数アンカーの間を補間)へ置き換える(`CLIMB_CURVE=absolute`)。
 * ボス階(10の倍数)は本番のHARD倍率のまま。敵ごとの相対差は残し、階の平均だけを合わせる
 * (`tools/towerHardScan.ts` の `absoluteCurveEnemies` と同じ考え方)。
 * `CLIMB_ANCHOR="89:spd=238;99:spd=246"` でアンカーの一部だけ差し替えられる。
 */
type Quad = { hp: number; atk: number; def: number; spd: number };
const ANCHORS: { floor: number; stats: Quad }[] = [
  { floor: 1, stats: { hp: 54000, atk: 4300, def: 2360, spd: 135 } },
  { floor: 9, stats: { hp: 70000, atk: 5100, def: 2440, spd: 151 } },
  { floor: 19, stats: { hp: 85000, atk: 6200, def: 3000, spd: 158 } },
  { floor: 29, stats: { hp: 105000, atk: 7500, def: 3600, spd: 165 } },
  { floor: 39, stats: { hp: 130000, atk: 9000, def: 4300, spd: 172 } },
  { floor: 49, stats: { hp: 160000, atk: 11000, def: 5000, spd: 180 } },
  { floor: 59, stats: { hp: 190000, atk: 14000, def: 6200, spd: 200 } },
  { floor: 69, stats: { hp: 225000, atk: 17000, def: 7200, spd: 215 } },
  { floor: 79, stats: { hp: 265000, atk: 20000, def: 8200, spd: 230 } },
  { floor: 89, stats: { hp: 310000, atk: 23500, def: 9200, spd: 245 } },
  { floor: 99, stats: { hp: 360000, atk: 27000, def: 10500, spd: 260 } },
];
for (const part of (process.env.CLIMB_ANCHOR ?? "").split(";").filter(Boolean)) {
  const [f, assigns] = part.split(":");
  const anchor = ANCHORS.find((a) => a.floor === Number(f))!;
  for (const kv of assigns.split(",")) { const [k, v] = kv.split("="); anchor.stats[k as keyof Quad] = Number(v); }
}
const CURVE = process.env.CLIMB_CURVE ?? "production";
/** `CLIMB_CURVE_FLOORS=51-99` で、実数の案を掛ける階をその範囲の通常階へ絞る */
const CURVE_FLOORS = process.env.CLIMB_CURVE_FLOORS?.split("-").map(Number);
function anchorAt(floor: number): Quad {
  const upper = ANCHORS.findIndex((a) => floor <= a.floor);
  if (upper <= 0) return ANCHORS[0].stats;
  const lo = ANCHORS[upper - 1], hi = ANCHORS[upper];
  const t = (floor - lo.floor) / (hi.floor - lo.floor);
  const mix = (k: keyof Quad) => lo.stats[k] + (hi.stats[k] - lo.stats[k]) * t;
  return { hp: mix("hp"), atk: mix("atk"), def: mix("def"), spd: mix("spd") };
}
/**
 * 普通の階を「均した案」にする(`CLIMB_CURVE=smooth`)。ボス階は触らない。
 * 攻撃は階の平均を下のアンカーの間で補間、防御は51階から上だけアンカーへ、HPは本番のまま。
 * 速度は `CLIMB_SPD_MUL=1.1` で本番の値へ掛ける。敵どうしの差は残す。
 */
const SMOOTH_ATK: [number, number][] = [[1, 25_000], [19, 30_000], [39, 40_000], [49, 60_000], [59, 90_000], [69, 95_000], [79, 100_000], [89, 110_000], [99, 120_000]];
const SMOOTH_DEF: [number, number][] = [[51, 1_500], [99, 2_000]];
const SPD_MUL = Number(process.env.CLIMB_SPD_MUL ?? "1");
function lerpAnchors(points: [number, number][], floor: number): number {
  if (floor <= points[0][0]) return points[0][1];
  const upper = points.findIndex(([f]) => floor <= f);
  if (upper < 0) return points[points.length - 1][1];
  const [f0, v0] = points[upper - 1], [f1, v1] = points[upper];
  return v0 + (v1 - v0) * (floor - f0) / (f1 - f0);
}
/**
 * 1〜99階を「自然に強くなる1本の線」にする案(`CLIMB_CURVE=natural`)。51階から上がり方を強める。
 * 攻撃・防御・速度は階の平均をアンカーの間で補間。HPは「倒しにくさ」(HP÷通る割合)の目標から逆算するので、
 * 防御が高い階ほどHPは低い。敵どうしの差は残す。
 */
const NATURAL_ATK: [number, number][] = [[1, 25_000], [19, 35_000], [29, 42_000], [39, 50_000], [49, 60_000], [59, 95_000], [69, 105_000], [79, 115_000], [89, 125_000], [99, 135_000]];
const NATURAL_DEF: [number, number][] = [[1, 250], [19, 700], [29, 1_200], [39, 2_100], [49, 3_000], [59, 3_300], [69, 3_600], [79, 3_900], [89, 4_200], [99, 4_500]];
const NATURAL_SPD: [number, number][] = [[1, 190], [19, 198], [29, 203], [39, 209], [49, 215], [59, 225], [69, 233], [79, 240], [89, 248], [99, 255]];
const NATURAL_TOUGHNESS: [number, number][] = [[1, 150_000], [19, 260_000], [29, 320_000], [39, 380_000], [49, 450_000], [59, 520_000], [69, 600_000], [79, 680_000], [89, 760_000], [99, 850_000]];
/*
 * `CLIMB_NATURAL_LOWDEF=1`: 防御の上がり方を抑える(99階で2,500)。倒しにくさは同じなので、その分HPが高くなる。
 *   防御が高いほど防御DOWN(75%)の効き目が大きく、4,500だと×2.7になるため
 * `CLIMB_NATURAL_SOFT=1`: 51階から上の倒しにくさと攻撃を、今の本番の平均くらいまで緩める
 */
if (process.env.CLIMB_NATURAL_LOWDEF) {
  NATURAL_DEF.splice(0, NATURAL_DEF.length, [1, 250], [19, 600], [29, 900], [39, 1_400], [49, 2_000], [59, 2_100], [69, 2_200], [79, 2_300], [89, 2_400], [99, 2_500]);
}
if (process.env.CLIMB_NATURAL_SOFT) {
  NATURAL_TOUGHNESS.splice(5, 5, [59, 400_000], [69, 470_000], [79, 530_000], [89, 600_000], [99, 670_000]);
  NATURAL_ATK.splice(5, 5, [59, 85_000], [69, 92_000], [79, 100_000], [89, 107_000], [99, 115_000]);
}
const passRate = (def: number) => 1000 / (1000 + 1.2 * def);

function applySmoothCurve(enemies: { stats: Quad & Record<string, unknown> }[], floor: number): void {
  if (floor % 10 === 0) return;
  if (CURVE === "natural") {
    const mean = (f: (e: { stats: Quad }) => number) => enemies.reduce((a, e) => a + f(e), 0) / enemies.length;
    const atkMean = mean((e) => e.stats.atk), defMean = mean((e) => e.stats.def), spdMean = mean((e) => e.stats.spd);
    const atk = lerpAnchors(NATURAL_ATK, floor), def = lerpAnchors(NATURAL_DEF, floor), spd = lerpAnchors(NATURAL_SPD, floor);
    for (const e of enemies) {
      e.stats.atk = Math.max(1, Math.round(atk * e.stats.atk / atkMean));
      e.stats.def = Math.max(1, Math.round(def * e.stats.def / defMean));
      e.stats.spd = Math.max(1, Math.round(spd * e.stats.spd / spdMean));
    }
    const toughness = mean((e) => e.stats.hp / passRate(e.stats.def));
    const k = lerpAnchors(NATURAL_TOUGHNESS, floor) / toughness;
    for (const e of enemies) e.stats.hp = Math.max(1, Math.round(e.stats.hp * k));
  }
  if (CURVE === "smooth") {
    const mean = (k: keyof Quad) => enemies.reduce((a, e) => a + e.stats[k], 0) / enemies.length;
    const atkMean = mean("atk"), defMean = mean("def");
    const atkTarget = lerpAnchors(SMOOTH_ATK, floor);
    const defTarget = floor >= 51 ? lerpAnchors(SMOOTH_DEF, floor) : defMean;
    for (const e of enemies) {
      e.stats.atk = Math.max(1, Math.round(atkTarget * e.stats.atk / atkMean));
      e.stats.def = Math.max(1, Math.round(defTarget * e.stats.def / defMean));
    }
  }
  if (SPD_MUL !== 1) for (const e of enemies) e.stats.spd = Math.max(1, Math.round(e.stats.spd * SPD_MUL));
}

function applyAbsoluteCurve(enemies: { stats: Quad & Record<string, unknown> }[], floor: number): void {
  if (CURVE !== "absolute" || floor % 10 === 0) return;
  if (CURVE_FLOORS && (floor < CURVE_FLOORS[0] || floor > CURVE_FLOORS[1])) return;
  const target = anchorAt(floor);
  const mean = (k: keyof Quad) => enemies.reduce((a, e) => a + e.stats[k], 0) / enemies.length;
  const means = { hp: mean("hp"), atk: mean("atk"), def: mean("def"), spd: mean("spd") };
  for (const e of enemies) {
    for (const k of ["hp", "atk", "def", "spd"] as const) e.stats[k] = Math.max(1, Math.round(target[k] * e.stats[k] / means[k]));
  }
}

/*
 * 対策の試し付け(本番には無い)。依頼主の案「敵のHPを上げ、ボスには気絶時に速度大幅アップと
 * ゲージ操作半減」を、エンジンを書き換えずに外から被せて測る。
 *   CLIMB_ENEMY_HP=1.5          … 敵全員の最大HPを倍率で上げる(ボスも含む)
 *   CLIMB_BOSS_TRAITS=stun_haste,gauge_half
 *     stun_haste … 新しく気絶した時、速度+50%(3ターン)を得る
 *     gauge_half … 相手から受ける行動ゲージの減少・吸収を半分にする
 *   CLIMB_TRAIT_SCOPE=boss|all  … 特性を付ける相手(既定はボス階のボスだけ)
 */
const ENEMY_HP = Number(process.env.CLIMB_ENEMY_HP ?? "1");
/** `CLIMB_HP_FLOORS=51-99` で、敵HPの倍率を**その範囲の通常階だけ**へ絞る(ボス階には掛けない) */
const HP_FLOORS = process.env.CLIMB_HP_FLOORS?.split("-").map(Number);
const hpScaleAt = (floor: number): number => {
  if (!HP_FLOORS) return ENEMY_HP;
  return floor >= HP_FLOORS[0] && floor <= HP_FLOORS[1] && floor % 10 !== 0 ? ENEMY_HP : 1;
};
const BOSS_TRAITS = new Set((process.env.CLIMB_BOSS_TRAITS ?? "").split(",").filter(Boolean));
const TRAIT_SCOPE = process.env.CLIMB_TRAIT_SCOPE ?? "boss";
const STUN_HASTE = { amount: 0.5, turns: 3 };
const ATB = 100;
/** 特性が実際に働いた回数(効いていないのに「差が無い」と読まないための確認用) */
const traitHits = { stunHaste: 0, gaugeHalved: 0 };

function installBossTraits(engine: BattleEngine, floor: number): void {
  if (BOSS_TRAITS.size === 0) return;
  const enemies = engine.getUnits().filter((u) => u.team === "ENEMY");
  let targets = enemies;
  if (TRAIT_SCOPE === "boss") {
    if (floor % 10 !== 0) return;
    const boss = enemies.find((u) => u.def.victoryTarget) ?? [...enemies].sort((a, b) => b.maxHp - a.maxHp)[0];
    targets = boss ? [boss] : [];
  }
  for (const unit of targets) {
    if (BOSS_TRAITS.has("gauge_half")) {
      let gauge = unit.gauge;
      Object.defineProperty(unit, "gauge", {
        configurable: true, enumerable: true,
        get: () => gauge,
        set: (next: number) => {
          const drop = gauge - next;
          // 自分の手番でゲージを使う時(ちょうど100減る)はそのまま。それ以外の減少を半分に
          const halve = drop > 0 && unit.alive && Math.abs(drop - ATB) > 1e-6;
          if (halve) traitHits.gaugeHalved += 1;
          gauge = halve ? gauge - drop * 0.5 : next;
        },
      });
    }
    if (BOSS_TRAITS.has("stun_haste")) {
      // 気絶は状態の配列ではなく `stunTurns` の数で持っている。0 → 正 になった瞬間を拾う
      let stun = unit.stunTurns;
      Object.defineProperty(unit, "stunTurns", {
        configurable: true, enumerable: true,
        get: () => stun,
        set: (next: number) => {
          if (stun <= 0 && next > 0 && unit.alive) {
            applyStatEffect(unit, "spd", STUN_HASTE.amount, STUN_HASTE.turns, "BUFF");
            traitHits.stunHaste += 1;
          }
          stun = next;
        },
      });
    }
  }
}

function buildState(rng: () => number): { state: PlayerState; statsById: Map<string, Member["stats"]> } {
  const state = createInitialState();
  state.monsters = [];
  state.trialTowerLifetimeBestFloor = 100; // HARD解放済み
  state.stamina = 1_000_000;
  const statsById = new Map<string, Member["stats"]>();
  state.accessories = state.accessories ?? [];
  for (const m of TEAM) {
    const inst: MonsterInstance = createMonsterInstance(m.dexId, 6, 60);
    inst.skillLevels = [...m.skillLevels];
    if (m.created) inst.createdSkill = m.created;
    inst.development.latentAbilityId = m.latentId;
    const talents = createDefaultTalentState();
    m.talents(talents);
    inst.development.talents = talents;
    state.monsters.push(inst);
    EQUIP_SLOTS.forEach((slot, i) => {
      const eq = generateEquipment({ slot, star: 6, subStatCount: 4, set: m.sets[i], rng });
      eq.level = 15;
      addEquipment(state, eq);
      equipToMonster(state, inst.id, eq.id);
    });
    if (m.accessory) {
      const acc = { ...m.accessory, id: `acc_${inst.id}` } as Accessory;
      state.accessories.push(acc);
      inst.accessoryId = acc.id;
    }
    statsById.set(inst.id, m.stats);
  }
  state.towerPartyIds = state.monsters.map((x) => x.id);
  return { state, statsById };
}

const DUMP_DIR = process.env.CLIMB_DUMP_DIR;
if (DUMP_DIR) mkdirSync(DUMP_DIR, { recursive: true });
let dumpCount = 0;

interface ClimbResult { reached: number; losses: number; floorTurns: Record<number, number>; lostAt: number[] }

function climb(seed: number): ClimbResult {
  const rng = mulberry32(seed);
  const { state, statsById } = buildState(rng);
  const result: ClimbResult = { reached: 0, losses: 0, floorTurns: {}, lostAt: [] };
  let retries = RETRIES;
  for (let guard = 0; guard < 400; guard += 1) {
    let run = state.trialTowerHardRun ?? beginTowerRun(state, "HARD");
    if (!run) throw new Error("HARDを始められない");
    const setup = setupTowerBattle(state, run);
    if (!setup) throw new Error(`${run.floor}階の編成を組めない`);
    // ステータスをスクショの最終値へ。満タンの印(-1)は上書き後の最大HPで埋め直す
    setup.playerDefs.forEach((def, i) => {
      const s = statsById.get(setup.standingMembers[i].instanceId)!;
      if (process.env.CLIMB_STATS && run.floor === 1) {
        const r = (v: number) => Math.round(v * 100) / 100;
        console.log(`${def.name}: 組み立て hp${Math.round(def.stats.hp)} atk${Math.round(def.stats.atk)} def${Math.round(def.stats.def)} spd${Math.round(def.stats.spd)} cr${r(def.stats.criRate)} cd${r(def.stats.criDmg)} acc${r(def.stats.accuracy)} res${r(def.stats.resistance)}`
          + ` / スクショ hp${s.hp} atk${s.atk} def${s.def} spd${s.spd} cr${s.criRate} cd${s.criDmg} acc${s.accuracy} res${s.resistance}`);
      }
      def.stats = { ...def.stats, ...s };
      if (setup.standingMembers[i].hp < 0) setup.initialPlayerHp[i] = s.hp;
    });
    applyAbsoluteCurve(setup.enemyDefs as never, setup.floor.floor);
    applySmoothCurve(setup.enemyDefs as never, setup.floor.floor);
    const hpScale = hpScaleAt(setup.floor.floor);
    if (hpScale !== 1) for (const e of setup.enemyDefs) e.stats = { ...e.stats, hp: Math.round(e.stats.hp * hpScale) };
    const engine = new BattleEngine(setup.playerDefs, setup.enemyDefs, {
      rng,
      initialPlayerHp: setup.initialPlayerHp,
      initialCooldowns: setup.initialCooldowns,
      trialTowerFloor: setup.floor.floor,
      trialTowerHardMultipliers: setup.hardMultipliers,
    });
    installBossTraits(engine, setup.floor.floor);
    const battle = engine.run();
    const cleared = battle.winner === "PLAYER";
    if (!cleared && process.env.CLIMB_DEBUG) {
      console.log(`--- ${setup.floor.floor}F で負け (${battle.winner}, ${battle.turnsTaken}手)`);
      console.log("味方:", setup.playerDefs.map((d) => `${d.name} hp${d.stats.hp} spd${d.stats.spd}`).join(" / "));
      console.log("敵:", setup.enemyDefs.map((d) => `${d.name} hp${Math.round(d.stats.hp)} atk${Math.round(d.stats.atk)} def${Math.round(d.stats.def)} spd${Math.round(d.stats.spd)}`).join(" / "));
      console.log(battle.log.slice(0, 40).join("\n"));
    }
    result.floorTurns[setup.floor.floor] = battle.turnsTaken;
    // `CLIMB_DUMP_FLOOR=70 CLIMB_DUMP_DIR=<場所>` で、その階の戦闘ログを1戦ずつ書き出す(壁の中身を読む用)
    if (DUMP_DIR && Number(process.env.CLIMB_DUMP_FLOOR) === setup.floor.floor) {
      dumpCount += 1;
      writeFileSync(`${DUMP_DIR}/${setup.floor.floor}F-${String(dumpCount).padStart(4, "0")}-${cleared ? "win" : "lose"}.log`, battle.log.join("\n"));
    }
    if (process.env.CLIMB_TRACE) {
      const units = engine.getUnits().filter((u) => u.team === "PLAYER");
      console.log(`${setup.floor.floor}F ${cleared ? "勝" : "負"} ${battle.turnsTaken}手 残り: ${units.map((u) => `${u.def.name.replace(/★.*/, "")}${u.alive ? Math.round(100 * u.currentHp / u.maxHp) + "%" : "×"}`).join(" ")}`);
    }
    const outcome = applyTowerFloorResult(state, run, setup, engine, cleared, rng);
    if (cleared) result.reached = Math.max(result.reached, setup.floor.floor);
    if (outcome.completed) break;
    if (!cleared) {
      result.losses += 1;
      result.lostAt.push(setup.floor.floor);
      if (retries <= 0) break;
      retries -= 1;
    }
    run = state.trialTowerHardRun!;
  }
  return result;
}

const results: ClimbResult[] = [];
for (let i = 0; i < CLIMBS; i += 1) results.push(climb(SEED + i * 7919));
const reached = results.map((r) => r.reached).sort((a, b) => a - b);
console.log(`編成: ${TEAM_NAME} (${TEAM.map((m) => m.dexId).join(", ")})`);
console.log(`登坂 ${CLIMBS}回 / 負けたら節からやり直し ${RETRIES}回まで / 切り分け: ${[...ABLATE].join(",") || "なし"} / 曲線: ${CURVE}${process.env.CLIMB_ANCHOR ? ` (${process.env.CLIMB_ANCHOR})` : ""}`
  + `${SPD_MUL !== 1 ? ` / 通常階の速度×${SPD_MUL}` : ""} / 敵HP×${ENEMY_HP}${HP_FLOORS ? `(${HP_FLOORS.join("〜")}階の通常階)` : ""} / 特性: ${[...BOSS_TRAITS].join(",") || "なし"}${BOSS_TRAITS.size ? `(${TRAIT_SCOPE})` : ""}`);
if (BOSS_TRAITS.size) console.log(`特性の発動: 気絶で加速 ${traitHits.stunHaste}回 / ゲージ減少を半分 ${traitHits.gaugeHalved}回`);
console.log(`負け: 合計 ${results.reduce((a, r) => a + r.losses, 0)} / 1回の登坂あたり ${(results.reduce((a, r) => a + r.losses, 0) / CLIMBS).toFixed(1)}`);
console.log(`到達階: 最低 ${reached[0]} / 中央 ${reached[Math.floor(reached.length / 2)]} / 最高 ${reached.at(-1)} / 100階踏破 ${reached.filter((f) => f >= 100).length}/${CLIMBS}`);
const lostCounts = new Map<number, number>();
for (const r of results) for (const f of r.lostAt) lostCounts.set(f, (lostCounts.get(f) ?? 0) + 1);
console.log("負けた階:", [...lostCounts.entries()].sort((a, b) => b[1] - a[1]).map(([f, n]) => `${f}F×${n}`).join(" ") || "なし");
const turnSum = new Map<number, number[]>();
for (const r of results) for (const [f, t] of Object.entries(r.floorTurns)) (turnSum.get(Number(f)) ?? turnSum.set(Number(f), []).get(Number(f))!).push(t);
const line = [10, 20, 30, 40, 50, 60, 70, 80, 90, 99, 100].map((f) => {
  const ts = turnSum.get(f) ?? [];
  return `${f}F:${ts.length ? Math.round(ts.reduce((a, b) => a + b, 0) / ts.length) : "-"}`;
}).join(" ");
console.log("平均手数(ボス階と99F):", line);
