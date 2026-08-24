import { BattleEngine } from "../battle/engine.js";
import { Equipment, generateEquipment } from "../core/equipment.js";
import { MonsterDefinition } from "../core/monster.js";
import { MonsterInstance, resolveEquippedItems, toBattleDefinition } from "../core/monsterInstance.js";
import { Star, STAR_MAX_LEVEL } from "../core/rarity.js";
import { REINCARNATION_PIG_DEX } from "../data/monsters.js";
import {
  TOWER_FLOOR_COUNT,
  TOWER_STAMINA_COST,
  TowerFloor,
  TowerReward,
  findTowerFloor,
  isTowerCheckpoint,
  towerStartFloor,
} from "../data/trialTower.js";
import { buildDungeonEnemyTeam } from "./dungeonRunner.js";
import {
  PlayerState,
  addEquipment,
  addMonster,
  addSummonScrolls,
  trySpendStamina,
} from "./playerState.js";
import { resolveDex } from "./stageRunner.js";

/**
 * 試練の塔の登坂。
 *
 * 既存のダンジョンと決定的に違うのは、**階の間で何も回復しない**こと。
 * HPもクールタイムも次の階へ持ち越し、倒れた仲間は節(10階ごと)まで戻らない。
 *
 * 登坂の途中の状態は保存する。10戦を1度に登り切れるとは限らず、
 * **アプリを閉じた瞬間に進みが消えるのは壊れているのと同じ**なので、
 * 途中経過ごと控えに残して次回そのまま続きから入れるようにしている。
 */

/** 登坂中の1体の状態。持ち越すのはHPとクールタイムの2つ */
export interface TowerMemberState {
  instanceId: string;
  /** 今のHP。0なら倒れている(節まで戻らない) */
  hp: number;
  /** 3つのスキルの残りクールタイム */
  cooldowns: [number, number, number];
}

export interface TowerRun {
  /** これから挑む階 */
  floor: number;
  /** この登坂で連れている顔ぶれ。途中で入れ替えられない */
  members: TowerMemberState[];
}

/** 塔の報酬を実際に渡した結果。画面に出すために、渡したものを控える */
export interface TowerRewardResult {
  crystal: number;
  gold: number;
  summonScrolls: number;
  equipment: Equipment | null;
  pigDexId: string | null;
  pigStar: Star | null;
}

export function emptyTowerRewardResult(): TowerRewardResult {
  return { crystal: 0, gold: 0, summonScrolls: 0, equipment: null, pigDexId: null, pigStar: null };
}

/** 登坂を始められない理由。始められるなら null */
export function towerBlockReason(state: PlayerState): string | null {
  if (getTowerParty(state).length === 0) return "塔の編成が組まれていません";
  if (state.stamina < TOWER_STAMINA_COST) {
    return `スタミナが足りません(⚡${TOWER_STAMINA_COST}必要 / 手持ち⚡${state.stamina})`;
  }
  return null;
}

/** 塔の編成に入っている手持ち。控えから消えた分は落とす */
export function getTowerParty(state: PlayerState): MonsterInstance[] {
  return state.towerPartyIds
    .map((id) => state.monsters.find((m) => m.id === id))
    .filter((m): m is MonsterInstance => m !== undefined);
}

/** 次に挑む階。節を越えていればそこから、登坂の途中ならその階 */
export function nextTowerFloor(state: PlayerState): number {
  if (state.trialTowerRun) return state.trialTowerRun.floor;
  return towerStartFloor(state.trialTowerBestFloor);
}

/** 塔を登り切っているか */
export function isTowerCompleted(state: PlayerState): boolean {
  return state.trialTowerBestFloor >= TOWER_FLOOR_COUNT;
}

/**
 * 登坂を始める(または節から再開する)。
 * 全員が最大HP・クールタイム0の状態で始まる。
 */
export function beginTowerRun(state: PlayerState): TowerRun | null {
  if (towerBlockReason(state) !== null) return null;
  const party = getTowerParty(state);
  const run: TowerRun = {
    floor: nextTowerFloor(state),
    members: party.map((instance) => ({
      instanceId: instance.id,
      // 開始時は満タン。実際の最大HPは装備込みで決まるので、ここでは -1 を「満タン」の印にする
      hp: -1,
      cooldowns: [0, 0, 0],
    })),
  };
  state.trialTowerRun = run;
  return run;
}

/** 登坂をやめる。途中経過は捨て、次は節からやり直しになる */
export function abandonTowerRun(state: PlayerState): void {
  state.trialTowerRun = null;
}

export interface TowerBattleSetup {
  playerDefs: MonsterDefinition[];
  enemyDefs: MonsterDefinition[];
  /** 持ち越したHP。満タンの印(-1)は渡さない */
  initialPlayerHp?: number[];
  initialCooldowns: [number, number, number][];
  /** この階に出る顔ぶれ(倒れた仲間を除いたもの)。結果の反映に同じ並びが要る */
  standingMembers: TowerMemberState[];
  floor: TowerFloor;
}

/**
 * この階の戦闘を組む。
 *
 * **倒れている仲間は連れて行かない。**HP0のまま並べると、
 * 開幕から死体が4体並ぶ絵になり、生き残りが何体いるのかも読めない。
 */
export function setupTowerBattle(state: PlayerState, run: TowerRun): TowerBattleSetup | null {
  const floor = findTowerFloor(run.floor);
  if (!floor) return null;

  const standingMembers = run.members.filter((m) => m.hp !== 0);
  const instances = standingMembers
    .map((m) => state.monsters.find((x) => x.id === m.instanceId))
    .filter((m): m is MonsterInstance => m !== undefined);
  if (instances.length === 0) return null;

  const playerDefs = instances.map((instance) =>
    toBattleDefinition(instance, resolveDex(instance.dexId), resolveEquippedItems(instance, state.equipment)),
  );

  // 満タンの印(-1)が1つでも混じっていたら、そこは上書きしない値を入れる必要がある。
  // 最大HPは装備込みで決まるので、ここで def から引いて渡す
  const initialPlayerHp = standingMembers.map((m, i) => (m.hp < 0 ? playerDefs[i].stats.hp : m.hp));

  return {
    playerDefs,
    enemyDefs: buildDungeonEnemyTeam(floor),
    initialPlayerHp,
    initialCooldowns: standingMembers.map((m) => [...m.cooldowns] as [number, number, number]),
    standingMembers,
    floor,
  };
}

export interface TowerFloorOutcome {
  cleared: boolean;
  /** 節を越えたので全員が戻り、全回復したか */
  restored: boolean;
  /** 塔を登り切ったか */
  completed: boolean;
  /** 全滅して登坂が終わったか */
  wiped: boolean;
  reward: TowerRewardResult;
}

/**
 * 1階ぶんの決着を登坂へ反映する。
 *
 * 勝った時だけ次の階へ進み、生き残りのHPとクールタイムを持ち越す。
 * 節を越えたら全回復して倒れた仲間も戻る。
 */
export function applyTowerFloorResult(
  state: PlayerState,
  run: TowerRun,
  setup: TowerBattleSetup,
  engine: BattleEngine,
  cleared: boolean,
  rng: () => number = Math.random,
): TowerFloorOutcome {
  const units = engine.getUnits();

  // 生死とHP・クールタイムを控えへ写す。並びは setupTowerBattle が組んだ順
  setup.standingMembers.forEach((member, i) => {
    const unit = units[i];
    if (!unit) return;
    member.hp = unit.alive ? Math.max(1, Math.round(unit.currentHp)) : 0;
    member.cooldowns = [...unit.cooldowns] as [number, number, number];
  });

  if (!cleared) {
    // 負けたらこの登坂は終わり。次は節からやり直し
    state.trialTowerRun = null;
    return { cleared: false, restored: false, completed: false, wiped: true, reward: emptyTowerRewardResult() };
  }

  const clearedFloor = run.floor;
  const reward = claimTowerFloorReward(state, clearedFloor, rng);
  if (clearedFloor > state.trialTowerBestFloor) state.trialTowerBestFloor = clearedFloor;

  const completed = clearedFloor >= TOWER_FLOOR_COUNT;
  if (completed) {
    state.trialTowerRun = null;
    return { cleared: true, restored: false, completed: true, wiped: false, reward };
  }

  const restored = isTowerCheckpoint(clearedFloor);
  if (restored) {
    // 節を越えた。倒れた仲間も戻り、全回復してここから再開できる
    state.trialTowerRun = null;
  } else {
    run.floor = clearedFloor + 1;
    state.trialTowerRun = run;
  }

  return { cleared: true, restored, completed: false, wiped: false, reward };
}

/**
 * 階の初回到達報酬を渡す。2度目以降は何も渡さない。
 *
 * **登り直しても増えない。**そうしないと、easy な階を往復するのが
 * 一番効率のいい遊び方になり、塔が塔でなくなる。
 */
export function claimTowerFloorReward(state: PlayerState, floor: number, rng: () => number = Math.random): TowerRewardResult {
  const result = emptyTowerRewardResult();
  const def = findTowerFloor(floor);
  if (!def) return result;
  if (state.trialTowerClaimedFloors.includes(floor)) return result;
  state.trialTowerClaimedFloors.push(floor);

  const reward: TowerReward = def.firstClearReward;
  if (reward.crystal) {
    state.crystal += reward.crystal;
    result.crystal = reward.crystal;
  }
  if (reward.gold) {
    state.gold += reward.gold;
    result.gold = reward.gold;
  }
  if (reward.summonScroll) {
    addSummonScrolls(state, reward.summonScroll);
    result.summonScrolls = reward.summonScroll;
  }
  if (reward.equipmentStar) {
    const equipment = generateEquipment({ star: reward.equipmentStar, subStatCount: 2, rng });
    addEquipment(state, equipment);
    result.equipment = equipment;
  }
  if (reward.pigStar) {
    const dex = REINCARNATION_PIG_DEX[0];
    addMonster(state, dex.id, reward.pigStar, STAR_MAX_LEVEL[reward.pigStar]);
    result.pigDexId = dex.id;
    result.pigStar = reward.pigStar;
  }
  return result;
}

/** 画面に出す、登坂中の1体 */
export interface TowerRunMemberView {
  instanceId: string;
  name: string;
  dexId: string;
  hp: number;
  maxHp: number;
  fallen: boolean;
}

/**
 * 登坂の途中経過を画面用に開く。
 *
 * **最大HPは装備込みでしか出せない**(素の値ではない)ので、
 * 画面側で組み直させず、ここで戦闘用の定義から引いて渡す。
 */
export function describeTowerRun(state: PlayerState): { floor: number; members: TowerRunMemberView[] } | null {
  const run = state.trialTowerRun;
  if (!run) return null;
  return {
    floor: run.floor,
    members: run.members.map((member) => {
      const instance = state.monsters.find((m) => m.id === member.instanceId);
      if (!instance) {
        return { instanceId: member.instanceId, name: "?", dexId: "", hp: 0, maxHp: 0, fallen: true };
      }
      const def = toBattleDefinition(instance, resolveDex(instance.dexId), resolveEquippedItems(instance, state.equipment));
      return {
        instanceId: member.instanceId,
        name: def.name,
        dexId: instance.dexId,
        // 開始時の満タンは -1 の印で持っているので、表示では最大値へ読み替える
        hp: member.hp < 0 ? def.stats.hp : member.hp,
        maxHp: def.stats.hp,
        fallen: member.hp === 0,
      };
    }),
  };
}

/** 1階ぶんのスタミナを払う。払えたら true */
export function spendTowerStamina(state: PlayerState): boolean {
  return trySpendStamina(state, TOWER_STAMINA_COST).ok;
}
