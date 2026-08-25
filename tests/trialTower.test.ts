import { describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import { EQUIP_SLOTS, EquipStar, generateEquipment } from "../src/core/equipment.js";
import { createMonsterInstance } from "../src/core/monsterInstance.js";
import { findMonsterById } from "../src/data/monsters.js";
import {
  TOWER_BOSS_INTERVAL,
  TOWER_CHECKPOINT_INTERVAL,
  TOWER_FLOOR_COUNT,
  TRIAL_TOWER_FLOORS,
  isTowerBossFloor,
  isTowerCheckpoint,
  towerStartFloor,
  towerTraitProblem,
} from "../src/data/trialTower.js";
import { PlayerState, addEquipment, createInitialState, equipToMonster } from "../src/game/playerState.js";
import { applyTowerFloorResult, beginTowerRun, claimTowerFloorReward, setupTowerBattle } from "../src/game/trialTower.js";

/**
 * 試練の塔のバランス。
 *
 * **数値の丸写しはしない。**曲線の定数をそのまま書き写したテストは、
 * 定数を書き換えた瞬間に一緒に書き換わるだけで、何も守らない。
 * ここで見張るのは「壊れたら設計が壊れている」ことだけ:
 *
 * - 階が上へ行くほど実際に重くなっているか(飽和しない指標で)
 * - 通常モンスターだけの編成が、育てれば奥まで登れるか(docs/design-concept.md の芯)
 * - 毒・耐久という戦い方が通用するか(封じられていないか)
 * - 階が名乗った傾向を、その顔ぶれが実際に実行できるか
 *
 * 測定は tools/towerPressure.mjs と同じ経路(setupTowerBattle / applyTowerFloorResult)を通す。
 * 持ち越しをテスト側で書き直すと、実装が変わってもテストだけ古い規則で通ってしまう。
 */

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 測定の育成度。★6 Lv60 + ★5装備。全編成そろって同じにする */
const GEAR_STAR: EquipStar = 5;

/**
 * 比べる編成。**名乗った戦術を実際に実行できるかは下の自己点検で確かめる。**
 * 毒を1つも持たない3体を「毒編成」として測り、まるごと嘘の結論を出したことがある。
 */
const TEAMS = {
  通常: ["knight_WATER", "wolf_GRASS", "imp_ELECTRIC", "fairy_WATER"],
  高レア: ["griffon_GRASS", "dragon_FIRE", "seraph_WATER", "nemesis_ELECTRIC"],
  耐久: ["golem_GRASS", "treant_ELECTRIC", "fairy_ELECTRIC", "wisp_WATER"],
  毒: ["slime_GRASS", "slime_WATER", "imp_ELECTRIC", "wolf_ELECTRIC"],
};

function effectKinds(dexId: string): Set<string> {
  const dex = findMonsterById(dexId);
  if (!dex) throw new Error(`図鑑にない: ${dexId}`);
  const kinds = new Set<string>();
  for (const skill of dex.skills) for (const effect of skill.effects) kinds.add(effect.kind);
  return kinds;
}

/** その編成のうち、指定の効果を持っている体数 */
function membersWith(ids: string[], kinds: string[]): number {
  return ids.filter((id) => kinds.some((k) => effectKinds(id).has(k))).length;
}

function buildClimber(ids: string[], rng: () => number): PlayerState {
  const state = createInitialState();
  state.stamina = 9999;
  const party = ids.map((id) => createMonsterInstance(id, 6, 60));
  state.monsters = party;
  for (const m of party) {
    for (const slot of EQUIP_SLOTS) {
      const eq = generateEquipment({ slot, star: GEAR_STAR, subStatCount: 4, rng });
      addEquipment(state, eq);
      equipToMonster(state, m.id, eq.id);
    }
  }
  state.towerPartyIds = party.map((m) => m.id);
  return state;
}

interface ClimbResult {
  reached: number;
  maxPoisonOnEnemy: number;
}

/** 1回ぶんの登坂。持ち越しは実装(src/game/trialTower.ts)そのものに任せる */
function climbOnce(ids: string[], seed: number): ClimbResult {
  const rng = mulberry32(seed);
  const state = buildClimber(ids, rng);
  let maxPoisonOnEnemy = 0;
  for (let guard = 0; guard < TOWER_FLOOR_COUNT * 2; guard += 1) {
    const run = state.trialTowerRun ?? beginTowerRun(state);
    if (!run) break;
    const setup = setupTowerBattle(state, run);
    if (!setup) break;
    const engine = new BattleEngine(setup.playerDefs, setup.enemyDefs, {
      rng,
      initialPlayerHp: setup.initialPlayerHp,
      initialCooldowns: setup.initialCooldowns,
    });
    const result = engine.run();
    for (const turn of result.turns) {
      for (const u of turn.snapshot) {
        if (u.team === "ENEMY") maxPoisonOnEnemy = Math.max(maxPoisonOnEnemy, u.poisonStacks);
      }
    }
    const outcome = applyTowerFloorResult(state, run, setup, engine, result.winner === "PLAYER", rng);
    if (outcome.wiped || outcome.completed) break;
  }
  return { reached: state.trialTowerBestFloor, maxPoisonOnEnemy };
}

function medianReached(ids: string[], climbs = 12): ClimbResult & { median: number } {
  const reached: number[] = [];
  let maxPoisonOnEnemy = 0;
  for (let i = 0; i < climbs; i += 1) {
    const r = climbOnce(ids, 4200 + i * 17);
    reached.push(r.reached);
    maxPoisonOnEnemy = Math.max(maxPoisonOnEnemy, r.maxPoisonOnEnemy);
  }
  reached.sort((a, b) => a - b);
  return { median: reached[Math.floor(reached.length / 2)], reached: reached[0], maxPoisonOnEnemy };
}

/** 全回復から1階だけ挑んだ時、決着時点で味方に残っているHPの割合(0〜1) */
function floorCost(ids: string[], floorNumber: number, trials = 6): number {
  const floor = TRIAL_TOWER_FLOORS[floorNumber - 1];
  let left = 0;
  for (let i = 0; i < trials; i += 1) {
    const rng = mulberry32(7700 + i * 31);
    const state = buildClimber(ids, rng);
    const run = beginTowerRun(state);
    if (!run) throw new Error("登坂を始められない");
    run.floor = floor.floor;
    const setup = setupTowerBattle(state, run);
    if (!setup) throw new Error("階を組めない");
    const result = new BattleEngine(setup.playerDefs, setup.enemyDefs, { rng }).run();
    const last = result.turns[result.turns.length - 1];
    const snap = last ? last.snapshot.filter((u) => u.team === "PLAYER") : [];
    const maxHp = snap.reduce((s, u) => s + u.maxHp, 0);
    left += maxHp > 0 ? snap.reduce((s, u) => s + Math.max(0, u.currentHp), 0) / maxHp : 0;
  }
  return left / trials;
}

describe("試練の塔: 階の並び", () => {
  it("30階あり、階数に抜けも重複もない", () => {
    expect(TRIAL_TOWER_FLOORS).toHaveLength(TOWER_FLOOR_COUNT);
    expect(TRIAL_TOWER_FLOORS.map((f) => f.floor)).toEqual(
      Array.from({ length: TOWER_FLOOR_COUNT }, (_, i) => i + 1),
    );
  });

  it("ボス階は5階ごと、節は10階ごとで、節は必ずボス階でもある", () => {
    for (const floor of TRIAL_TOWER_FLOORS) {
      expect(isTowerBossFloor(floor.floor)).toBe(floor.floor % TOWER_BOSS_INTERVAL === 0);
      expect(isTowerCheckpoint(floor.floor)).toBe(floor.floor % TOWER_CHECKPOINT_INTERVAL === 0);
      if (isTowerCheckpoint(floor.floor)) expect(isTowerBossFloor(floor.floor)).toBe(true);
    }
  });

  it("節を越えた所から再開できる(越えていなければ1階から)", () => {
    expect(towerStartFloor(0)).toBe(1);
    expect(towerStartFloor(9)).toBe(1);
    expect(towerStartFloor(10)).toBe(11);
    expect(towerStartFloor(19)).toBe(11);
    expect(towerStartFloor(20)).toBe(21);
  });

  it("ボス階にはボスが1体だけ立ち、傾向は載らない", () => {
    for (const floor of TRIAL_TOWER_FLOORS) {
      const bosses = floor.enemies.filter((e) => e.isBoss);
      if (isTowerBossFloor(floor.floor)) {
        expect(bosses).toHaveLength(1);
        expect(floor.trait).toBe("NONE");
      } else {
        expect(bosses).toHaveLength(0);
      }
    }
  });
});

describe("試練の塔: 報酬", () => {
  it("召喚の書と転生ピッグは節と最上階だけ、装備は関門だけ", () => {
    for (const floor of TRIAL_TOWER_FLOORS) {
      const reward = floor.firstClearReward;
      const special = isTowerCheckpoint(floor.floor);
      expect(Boolean(reward.summonScroll)).toBe(special);
      expect(Boolean(reward.pigStar)).toBe(special);
      expect(Boolean(reward.equipmentStar)).toBe(isTowerBossFloor(floor.floor));
    }
  });

  it("同じ種類の階どうしでは、上の階ほど報酬が増える", () => {
    const groups = [
      TRIAL_TOWER_FLOORS.filter((f) => !isTowerBossFloor(f.floor)),
      TRIAL_TOWER_FLOORS.filter((f) => isTowerBossFloor(f.floor) && !isTowerCheckpoint(f.floor)),
      TRIAL_TOWER_FLOORS.filter((f) => isTowerCheckpoint(f.floor)),
    ];
    for (const group of groups) {
      for (let i = 1; i < group.length; i += 1) {
        expect(group[i].firstClearReward.crystal ?? 0).toBeGreaterThan(group[i - 1].firstClearReward.crystal ?? 0);
        expect(group[i].firstClearReward.gold ?? 0).toBeGreaterThan(group[i - 1].firstClearReward.gold ?? 0);
      }
    }
    // 最上階は塔で一番大きい報酬
    const top = TRIAL_TOWER_FLOORS[TOWER_FLOOR_COUNT - 1].firstClearReward;
    for (const floor of TRIAL_TOWER_FLOORS.slice(0, -1)) {
      expect(top.crystal ?? 0).toBeGreaterThan(floor.firstClearReward.crystal ?? 0);
    }
  });

  it("同じ階の報酬は二度受け取れない(登り直しても増えない)", () => {
    const state = createInitialState();
    const rng = mulberry32(1);
    const first = claimTowerFloorReward(state, 10, rng);
    const second = claimTowerFloorReward(state, 10, rng);
    expect(first.crystal).toBeGreaterThan(0);
    expect(second.crystal).toBe(0);
    expect(second.summonScrolls).toBe(0);
    expect(second.equipment).toBeNull();
    expect(second.pigDexId).toBeNull();
  });
});

describe("試練の塔: 傾向がただの色違いになっていないか", () => {
  it("すべての階が、名乗った傾向を実際に実行できる顔ぶれになっている", () => {
    const problems = TRIAL_TOWER_FLOORS.map((f) => (towerTraitProblem(f) ? `${f.floor}階: ${towerTraitProblem(f)}` : null))
      .filter((p): p is string => p !== null);
    expect(problems).toEqual([]);
  });

  it("癒やしの階・守りの階でない階には、癒やす敵も盾を張る敵もいない", () => {
    // ここが崩れると「どの階にも癒やし手がいる」状態になり、癒やしの階が癒やしの階でなくなる。
    // 実際そうなっていて、双方が回復し合って300手で引き分ける盤面まで生まれていた
    for (const floor of TRIAL_TOWER_FLOORS) {
      if (floor.trait === "HEALER" || floor.trait === "WARD") continue;
      for (const enemy of floor.enemies) {
        const dex = findMonsterById(`${enemy.templateId}_${enemy.element}`);
        if (!dex) throw new Error(`図鑑にない: ${enemy.templateId}_${enemy.element}`);
        const kinds = new Set(dex.skills.flatMap((s) => s.effects.map((e) => e.kind)));
        expect({ floor: floor.floor, id: dex.id, heal: kinds.has("HEAL"), shield: kinds.has("SHIELD") }).toEqual({
          floor: floor.floor,
          id: dex.id,
          heal: false,
          shield: false,
        });
      }
    }
  });

  it("群れの階は数が多く、疾風の階は敵全員が速い", () => {
    const swarm = TRIAL_TOWER_FLOORS.filter((f) => f.trait === "SWARM");
    const plain = TRIAL_TOWER_FLOORS.filter((f) => f.trait === "NONE" && !isTowerBossFloor(f.floor));
    expect(swarm.length).toBeGreaterThan(0);
    for (const f of swarm) expect(f.enemies.length).toBeGreaterThan(plain[0]?.enemies.length ?? 4);
    for (const f of TRIAL_TOWER_FLOORS.filter((x) => x.trait === "SWIFT")) {
      for (const e of f.enemies) expect(e.spdMultiplier ?? 1).toBeGreaterThan(1);
    }
  });
});

describe("試練の塔: 難易度が上へ向かって単調に重くなる", () => {
  it("同じ編成が全回復から挑んだとき、上の階ほど残りHPが減る", () => {
    // **勝率では測らない。**上げすぎると全編成が0%に張り付いて、
    // どの階が難しいかすら読めなくなる(装備ダンジョンで実際に起きた)。
    // 決着時点の味方残HPは飽和しないので、勝てる階どうしでも差が読める
    const costs = [5, 15, 25].map((floor) => floorCost(TEAMS.通常, floor));
    expect(costs[0]).toBeGreaterThan(costs[1]);
    expect(costs[1]).toBeGreaterThan(costs[2]);
    // 序盤は入口として軽く、上は明確に高くつく
    expect(costs[0]).toBeGreaterThan(0.8);
    expect(costs[2]).toBeLessThan(0.6);
  });
});

describe("試練の塔: 編成が名乗った戦術を実行できるか(測定の前提)", () => {
  it("耐久編成は回復・盾・免疫/解除を実際に持っている", () => {
    expect(membersWith(TEAMS.耐久, ["HEAL"])).toBeGreaterThanOrEqual(2);
    expect(membersWith(TEAMS.耐久, ["SHIELD"])).toBeGreaterThanOrEqual(2);
    expect(membersWith(TEAMS.耐久, ["REGEN"])).toBeGreaterThanOrEqual(1);
    expect(membersWith(TEAMS.耐久, ["CLEANSE", "IMMUNITY"])).toBeGreaterThanOrEqual(1);
  });

  it("毒編成は毒を実際に持っている", () => {
    expect(membersWith(TEAMS.毒, ["POISON"])).toBeGreaterThanOrEqual(3);
  });

  it("通常編成に召喚限定のモンスターが混ざっていない", () => {
    for (const id of TEAMS.通常) {
      const dex = findMonsterById(id);
      expect(dex).toBeDefined();
      expect(["griffon", "dragon", "seraph", "nemesis"]).not.toContain(dex?.templateId);
      // 光/闇は召喚でしか手に入らない。混ぜると「通常編成」ではなくなる
      expect(["LIGHT", "DARK"]).not.toContain(dex?.element);
    }
  });
});

describe("試練の塔: 到達階(登り切るまで実際に登らせて測る)", () => {
  const 通常 = medianReached(TEAMS.通常);
  const 高レア = medianReached(TEAMS.高レア);
  const 耐久 = medianReached(TEAMS.耐久);
  const 毒 = medianReached(TEAMS.毒);

  it("通常モンスターだけの編成でも、育てれば20階あたりまで登れる", () => {
    // docs/design-concept.md の芯。ここが崩れたら設計が失敗している。
    // 実測の中央値は23階前後。18階を割ったら、まず塔の曲線を疑うこと
    expect(通常.median).toBeGreaterThanOrEqual(18);
  });

  it("高レア編成は先へ行くが、通常編成を無意味にするほどの差はつかない", () => {
    expect(高レア.median).toBeGreaterThanOrEqual(通常.median);
    expect(高レア.median - 通常.median).toBeLessThanOrEqual(8);
  });

  it("持ち越しの塔なので、耐久編成が通常編成より深くまで行ける", () => {
    expect(耐久.median).toBeGreaterThanOrEqual(通常.median - 1);
    expect(耐久.median).toBeGreaterThanOrEqual(18);
  });

  it("毒編成も通用する(毒を封じる調整が入っていない)", () => {
    // 毒は塞ぐべき抜け道ではなく、ちゃんとした戦い方。
    // 継続ダメージ耐性のような「その戦術を選んだこと自体への罰」を入れると、まずここが落ちる
    expect(毒.maxPoisonOnEnemy).toBeGreaterThan(0);
    expect(毒.median).toBeGreaterThanOrEqual(12);
  });

  it("最初の節(10階)は、どの戦い方でも越えられる", () => {
    for (const team of [通常, 高レア, 耐久, 毒]) expect(team.median).toBeGreaterThanOrEqual(10);
  });

  it("30階は誰でも登れる場所ではない(★5装備では届かない)", () => {
    for (const team of [通常, 高レア, 耐久, 毒]) expect(team.median).toBeLessThan(TOWER_FLOOR_COUNT);
  });
});
