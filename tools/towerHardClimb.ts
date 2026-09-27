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
import { BattleEngine } from "../src/battle/engine.js";
import { generateEquipment, EQUIP_SLOTS, type SetType } from "../src/core/equipment.js";
import { createMonsterInstance, type MonsterInstance } from "../src/core/monsterInstance.js";
import { createDefaultTalentState } from "../src/core/talents.js";
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

const TEAM: Member[] = [
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
function anchorAt(floor: number): Quad {
  const upper = ANCHORS.findIndex((a) => floor <= a.floor);
  if (upper <= 0) return ANCHORS[0].stats;
  const lo = ANCHORS[upper - 1], hi = ANCHORS[upper];
  const t = (floor - lo.floor) / (hi.floor - lo.floor);
  const mix = (k: keyof Quad) => lo.stats[k] + (hi.stats[k] - lo.stats[k]) * t;
  return { hp: mix("hp"), atk: mix("atk"), def: mix("def"), spd: mix("spd") };
}
function applyAbsoluteCurve(enemies: { stats: Quad & Record<string, unknown> }[], floor: number): void {
  if (CURVE !== "absolute" || floor % 10 === 0) return;
  const target = anchorAt(floor);
  const mean = (k: keyof Quad) => enemies.reduce((a, e) => a + e.stats[k], 0) / enemies.length;
  const means = { hp: mean("hp"), atk: mean("atk"), def: mean("def"), spd: mean("spd") };
  for (const e of enemies) {
    for (const k of ["hp", "atk", "def", "spd"] as const) e.stats[k] = Math.max(1, Math.round(target[k] * e.stats[k] / means[k]));
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
    const engine = new BattleEngine(setup.playerDefs, setup.enemyDefs, {
      rng,
      initialPlayerHp: setup.initialPlayerHp,
      initialCooldowns: setup.initialCooldowns,
      trialTowerFloor: setup.floor.floor,
      trialTowerHardMultipliers: setup.hardMultipliers,
    });
    const battle = engine.run();
    const cleared = battle.winner === "PLAYER";
    if (!cleared && process.env.CLIMB_DEBUG) {
      console.log(`--- ${setup.floor.floor}F で負け (${battle.winner}, ${battle.turnsTaken}手)`);
      console.log("味方:", setup.playerDefs.map((d) => `${d.name} hp${d.stats.hp} spd${d.stats.spd}`).join(" / "));
      console.log("敵:", setup.enemyDefs.map((d) => `${d.name} hp${Math.round(d.stats.hp)} atk${Math.round(d.stats.atk)} def${Math.round(d.stats.def)} spd${Math.round(d.stats.spd)}`).join(" / "));
      console.log(battle.log.slice(0, 40).join("\n"));
    }
    result.floorTurns[setup.floor.floor] = battle.turnsTaken;
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
console.log(`登坂 ${CLIMBS}回 / 負けたら節からやり直し ${RETRIES}回まで / 切り分け: ${[...ABLATE].join(",") || "なし"} / 曲線: ${CURVE}${process.env.CLIMB_ANCHOR ? ` (${process.env.CLIMB_ANCHOR})` : ""}`);
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
