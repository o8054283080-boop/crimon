import { describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import { createMonsterInstance } from "../src/core/monsterInstance.js";
import { TOWER_FLOOR_COUNT, TOWER_STAMINA_COST, findTowerFloor, isTowerCheckpoint, towerStartFloor } from "../src/data/trialTower.js";
import { createInitialState, normalizeLoadedState, PlayerState } from "../src/game/playerState.js";
import {
  applyTowerFloorResult,
  beginTowerRun,
  describeTowerRun,
  nextTowerFloor,
  setupTowerBattle,
  towerBlockReason,
} from "../src/game/trialTower.js";

/*
 * 試練の塔の**持ち越し**まわり。
 *
 * 塔が他のダンジョンと違うのは、階の間で何も回復しないことだけ。
 * つまり**持ち越しが壊れたら塔ではなくなる**ので、そこを重点的に押さえる。
 * 階のバランス(どこまで登れるか)は tests/trialTower.test.ts が見る。
 */

function stateWithTowerParty(count = 4): PlayerState {
  const state = createInitialState();
  state.monsters = [];
  state.towerPartyIds = [];
  for (let i = 0; i < count; i++) {
    const instance = createMonsterInstance("golem_WATER", 6, 60);
    state.monsters.push(instance);
    state.towerPartyIds.push(instance.id);
  }
  state.stamina = 500;
  state.maxStamina = 500;
  return state;
}

describe("節と再開地点 (towerStartFloor)", () => {
  it("まだ一度も登っていなければ1階から", () => {
    expect(towerStartFloor(0)).toBe(1);
  });

  it("節に届いていない到達は、次も1階から", () => {
    // 9階まで登っても、節(10階)を越えていないので持ち越せない
    expect(towerStartFloor(9)).toBe(1);
  });

  it("節を越えていれば、その次の階から再開できる", () => {
    expect(towerStartFloor(10)).toBe(11);
    expect(towerStartFloor(19)).toBe(11);
    expect(towerStartFloor(20)).toBe(21);
  });

  it("節・ボス階の位置が決まりどおりに並んでいる", () => {
    const checkpoints = Array.from({ length: TOWER_FLOOR_COUNT }, (_, i) => i + 1).filter(isTowerCheckpoint);
    expect(checkpoints).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  });
});

describe("登坂の開始 (beginTowerRun)", () => {
  it("編成が空なら始められない", () => {
    const state = createInitialState();
    state.towerPartyIds = [];
    expect(towerBlockReason(state)).not.toBeNull();
    expect(beginTowerRun(state)).toBeNull();
  });

  it("スタミナが1階ぶんに足りなければ始められない", () => {
    const state = stateWithTowerParty();
    state.stamina = TOWER_STAMINA_COST - 1;
    expect(towerBlockReason(state)).toContain("スタミナ");
  });

  it("始めると、全員が満タン・クールタイム0で並ぶ", () => {
    const state = stateWithTowerParty();
    const run = beginTowerRun(state);
    expect(run).not.toBeNull();
    expect(run!.floor).toBe(1);
    expect(run!.members).toHaveLength(4);
    for (const member of run!.members) expect(member.cooldowns).toEqual([0, 0, 0]);

    // 満タンは -1 の印で持つ(最大HPは装備込みでしか出せないため)。
    // 画面へ渡す時に最大値へ読み替わっていること
    const view = describeTowerRun(state);
    expect(view!.members.every((m) => m.hp === m.maxHp)).toBe(true);
    expect(view!.members.every((m) => m.maxHp > 0)).toBe(true);
    expect(view!.members.every((m) => !m.fallen)).toBe(true);
  });
});

describe("持ち越し (applyTowerFloorResult)", () => {
  /** 1階ぶんを、勝った状態で決着させる。engine は実際に走らせる */
  function climbOneFloor(state: PlayerState, damage: number[] = [], cooldowns?: [number, number, number][]) {
    const run = state.trialTowerRun!;
    const setup = setupTowerBattle(state, run)!;
    const engine = new BattleEngine(setup.playerDefs, setup.enemyDefs, {
      initialPlayerHp: setup.initialPlayerHp,
      initialCooldowns: setup.initialCooldowns,
    });
    // 決着そのものはここでは作らず、ユニットの状態を直接いじって「その階の結果」を作る
    const units = engine.getUnits();
    damage.forEach((amount, i) => {
      const unit = units[i];
      if (!unit) return;
      unit.currentHp = Math.max(0, unit.currentHp - amount);
      if (unit.currentHp === 0) unit.alive = false;
    });
    if (cooldowns) {
      cooldowns.forEach((cd, i) => {
        if (units[i]) units[i].cooldowns = [...cd] as [number, number, number];
      });
    }
    return applyTowerFloorResult(state, run, setup, engine, true);
  }

  it("削られたHPは次の階へ持ち越される", () => {
    const state = stateWithTowerParty();
    beginTowerRun(state);
    const maxHp = describeTowerRun(state)!.members[0].maxHp;

    climbOneFloor(state, [500]);

    const after = describeTowerRun(state)!;
    expect(after.floor).toBe(2);
    expect(after.members[0].hp).toBe(maxHp - 500);
    // 削られていない仲間は満タンのまま
    expect(after.members[1].hp).toBe(after.members[1].maxHp);
  });

  it("クールタイムも次の階へ持ち越される", () => {
    // **HPだけ持ち越すと、強い技を毎階の頭で撃ち直せてしまう。**
    // 「強い技ほど間隔が長い」という決まりが階の境目で消える
    const state = stateWithTowerParty();
    beginTowerRun(state);

    climbOneFloor(state, [], [[0, 2, 3]]);

    expect(state.trialTowerRun!.members[0].cooldowns).toEqual([0, 2, 3]);

    // 次の階の戦闘に、その残りがそのまま渡ること
    const setup = setupTowerBattle(state, state.trialTowerRun!)!;
    expect(setup.initialCooldowns[0]).toEqual([0, 2, 3]);
    const engine = new BattleEngine(setup.playerDefs, setup.enemyDefs, {
      initialCooldowns: setup.initialCooldowns,
    });
    expect(engine.getUnits()[0].cooldowns).toEqual([0, 2, 3]);
  });

  it("倒れた仲間は次の階に連れて行かない", () => {
    const state = stateWithTowerParty();
    beginTowerRun(state);
    const maxHp = describeTowerRun(state)!.members[0].maxHp;

    climbOneFloor(state, [maxHp]);

    const after = describeTowerRun(state)!;
    // 一覧には残る(あと何体で挑むのかが判断の材料になる)
    expect(after.members).toHaveLength(4);
    expect(after.members[0].fallen).toBe(true);

    // 戦闘の顔ぶれからは外れる
    const setup = setupTowerBattle(state, state.trialTowerRun!)!;
    expect(setup.playerDefs).toHaveLength(3);
    expect(setup.standingMembers.every((m) => m.hp !== 0)).toBe(true);
  });

  it("節を越えると全員が戻り、次はそこから再開できる", () => {
    const state = stateWithTowerParty();
    state.trialTowerBestFloor = 9;
    beginTowerRun(state);
    // 9階までは節に届いていないので1階からになる。ここでは節の挙動だけ見たいので直接置く
    state.trialTowerRun!.floor = 10;
    const maxHp = describeTowerRun(state)!.members[0].maxHp;

    const outcome = climbOneFloor(state, [maxHp, 300]);

    expect(outcome.restored).toBe(true);
    // 登坂は畳まれる。次は節から、全員満タンで始まる
    expect(state.trialTowerRun).toBeNull();
    expect(state.trialTowerBestFloor).toBe(10);
    expect(nextTowerFloor(state)).toBe(11);

    const next = beginTowerRun(state)!;
    expect(next.floor).toBe(11);
    expect(describeTowerRun(state)!.members.every((m) => !m.fallen && m.hp === m.maxHp)).toBe(true);
  });

  it("全滅すると登坂は終わるが、節までの到達は消えない", () => {
    const state = stateWithTowerParty();
    state.trialTowerBestFloor = 10;
    beginTowerRun(state);
    state.trialTowerRun!.floor = 13;

    const run = state.trialTowerRun!;
    const setup = setupTowerBattle(state, run)!;
    const engine = new BattleEngine(setup.playerDefs, setup.enemyDefs);
    const outcome = applyTowerFloorResult(state, run, setup, engine, false);

    expect(outcome.wiped).toBe(true);
    expect(state.trialTowerRun).toBeNull();
    // ここが消えると「全部やり直し」になる。節は残る
    expect(state.trialTowerBestFloor).toBe(10);
    expect(nextTowerFloor(state)).toBe(11);
  });

  it("最上階を越えたら登り切りになる", () => {
    const state = stateWithTowerParty();
    beginTowerRun(state);
    state.trialTowerRun!.floor = TOWER_FLOOR_COUNT;

    const outcome = climbOneFloor(state);

    expect(outcome.completed).toBe(true);
    expect(state.trialTowerBestFloor).toBe(TOWER_FLOOR_COUNT);
    expect(state.trialTowerRun).toBeNull();
  });
});

describe("初回到達報酬", () => {
  it("同じ階を登り直しても2度は受け取れない", () => {
    // **登り直しても増えない。**でないと、楽な階を往復するのが一番効率のいい遊び方になる
    const state = stateWithTowerParty();
    const crystalBefore = state.crystal;

    beginTowerRun(state);
    const run = state.trialTowerRun!;
    const setup = setupTowerBattle(state, run)!;
    const engine = new BattleEngine(setup.playerDefs, setup.enemyDefs);
    const first = applyTowerFloorResult(state, run, setup, engine, true);
    const gained = state.crystal - crystalBefore;
    expect(first.reward.crystal).toBeGreaterThan(0);
    expect(gained).toBe(first.reward.crystal);

    // 1階へ戻って、もう一度越える。
    // **登坂を畳んでから**始めること(残っていると続きの階から再開してしまう)
    state.trialTowerRun = null;
    state.trialTowerBestFloor = 0;
    beginTowerRun(state);
    expect(state.trialTowerRun!.floor).toBe(1);
    const run2 = state.trialTowerRun!;
    const setup2 = setupTowerBattle(state, run2)!;
    const engine2 = new BattleEngine(setup2.playerDefs, setup2.enemyDefs);
    const second = applyTowerFloorResult(state, run2, setup2, engine2, true);

    expect(second.reward.crystal).toBe(0);
    expect(state.crystal - crystalBefore).toBe(gained);
  });

  it("すべての階に報酬が決まっていて、確率で揺れない", () => {
    for (let floor = 1; floor <= TOWER_FLOOR_COUNT; floor++) {
      const def = findTowerFloor(floor);
      expect(def, `${floor}階の定義が無い`).toBeDefined();
      const reward = def!.firstClearReward;
      const total =
        (reward.crystal ?? 0) + (reward.gold ?? 0) + (reward.summonScroll ?? 0) + (reward.pigStar ?? 0) + (reward.equipmentStar ?? 0);
      expect(total, `${floor}階の報酬が空`).toBeGreaterThan(0);
    }
  });
});

describe("控えの移行 (normalizeState)", () => {
  it("古い控えを読んでも塔の項目が埋まる", () => {
    const old = createInitialState() as unknown as Record<string, unknown>;
    delete old.towerPartyIds;
    delete old.trialTowerBestFloor;
    delete old.trialTowerClaimedFloors;
    delete old.trialTowerRun;

    const loaded = normalizeLoadedState(JSON.parse(JSON.stringify(old)) as PlayerState);
    expect(loaded.towerPartyIds).toEqual([]);
    expect(loaded.trialTowerBestFloor).toBe(0);
    expect(loaded.trialTowerClaimedFloors).toEqual([]);
    expect(loaded.trialTowerRun).toBeNull();
  });

  it("登坂中の仲間を手放していたら、登坂ごと捨てる", () => {
    // 残った顔ぶれで続けさせると「4体で登り始めたのに3体になっている」という
    // 説明のつかない状態になる
    const state = stateWithTowerParty();
    beginTowerRun(state);
    const lost = state.monsters[1].id;
    state.monsters = state.monsters.filter((m) => m.id !== lost);

    const loaded = normalizeLoadedState(JSON.parse(JSON.stringify(state)) as PlayerState);
    expect(loaded.trialTowerRun).toBeNull();
    expect(loaded.towerPartyIds).not.toContain(lost);
  });
});
