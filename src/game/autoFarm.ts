import { BattleEngine } from "../battle/engine.js";
import { DUNGEON_STAMINA_COST, STAGE_STAMINA_COST } from "../core/fighterLevel.js";
import { DungeonFloor } from "../data/equipmentDungeon.js";
import { Stage } from "../data/stages.js";
import { setupDungeonBattle } from "./dungeonRunner.js";
import { getDungeonParty, getParty, PlayerState, trySpendStamina } from "./playerState.js";
import { ClearRewardResult, LevelUpInfo, applyDungeonClearRewards, applyStageClearRewards } from "./rewards.js";
import { extractSurvivors, setupWaveBattle } from "./stageRunner.js";

export type AutoFarmStopReason = "COMPLETED" | "STAMINA" | "DEFEAT" | "NO_PARTY";

export interface AutoFarmDrop {
  dexId: string;
  star: number;
}

export interface AutoFarmResult {
  /** 実際に挑戦を試みた回数(スタミナ切れ等で中断した場合、指定回数より少なくなる) */
  attempts: number;
  /** そのうちクリアできた回数 */
  cleared: number;
  stopReason: AutoFarmStopReason;
  totalGold: number;
  totalCrystal: number;
  totalExp: number;
  totalFighterLevels: number;
  monsterDrops: AutoFarmDrop[];
  equipmentDropCount: number;
  pigDropCount: number;
  summonScrollCount: number;
  levelUps: LevelUpInfo[];
}

function emptyResult(): AutoFarmResult {
  return {
    attempts: 0,
    cleared: 0,
    stopReason: "COMPLETED",
    totalGold: 0,
    totalCrystal: 0,
    totalExp: 0,
    totalFighterLevels: 0,
    monsterDrops: [],
    equipmentDropCount: 0,
    pigDropCount: 0,
    summonScrollCount: 0,
    levelUps: [],
  };
}

function mergeReward(result: AutoFarmResult, reward: ClearRewardResult, extraGold: number): void {
  result.totalGold += reward.goldEarned + extraGold;
  result.totalCrystal += reward.crystalEarned;
  result.totalExp += reward.expTotal;
  result.totalFighterLevels += reward.fighterLevelsGained;
  if (reward.dropDexId && reward.dropStar) {
    result.monsterDrops.push({ dexId: reward.dropDexId, star: reward.dropStar });
  }
  if (reward.equipmentDrop) result.equipmentDropCount += 1;
  if (reward.pigDrop) {
    result.pigDropCount += 1;
    result.monsterDrops.push({ dexId: reward.pigDrop.dexId, star: reward.pigDrop.star });
  }
  if (reward.summonScrollDropped) result.summonScrollCount += 1;

  for (const levelUp of reward.levelUps) {
    const existing = result.levelUps.find((l) => l.instanceId === levelUp.instanceId);
    if (existing) existing.levels += levelUp.levels;
    else result.levelUps.push({ ...levelUp });
  }
}

/**
 * ステージに指定回数まで自動で挑戦する(周回)。
 * スタミナが尽きる・敗北する・パーティが編成されていない場合はその時点で中断する。
 * 各回のバトルはBattleEngine.run()による全自動シミュレーションで即座に決着させる。
 */
export function runStageAutoFarm(
  state: PlayerState,
  stage: Stage,
  times: number,
  rng: () => number = Math.random,
): AutoFarmResult {
  const result = emptyResult();

  for (let i = 0; i < times; i++) {
    const originalParty = getParty(state);
    if (originalParty.length === 0) {
      result.stopReason = "NO_PARTY";
      break;
    }
    if (!trySpendStamina(state, STAGE_STAMINA_COST).ok) {
      result.stopReason = "STAMINA";
      break;
    }
    result.attempts += 1;

    let carryHp: Map<string, number> | null = null;
    let currentParty = originalParty;
    let wavesCleared = 0;
    let waveGoldEarned = 0;
    let cleared = true;

    for (const wave of stage.waves) {
      const setup = setupWaveBattle(currentParty, carryHp, wave, state.equipment);
      const engine = new BattleEngine(setup.playerDefs, setup.enemyDefs, { initialPlayerHp: setup.initialPlayerHp, rng });
      const battleResult = engine.run();
      if (battleResult.winner !== "PLAYER") {
        cleared = false;
        break;
      }
      const survivors = extractSurvivors(engine, currentParty);
      waveGoldEarned += stage.rewards.waveGold;
      wavesCleared += 1;
      carryHp = survivors.survivorHp;
      currentParty = survivors.survivorInstances;
    }

    state.gold += waveGoldEarned;

    if (cleared) {
      const reward = applyStageClearRewards(state, stage, wavesCleared, originalParty);
      mergeReward(result, reward, 0);
      result.cleared += 1;
    } else {
      result.totalGold += waveGoldEarned;
      result.stopReason = "DEFEAT";
      break;
    }
  }

  return result;
}

/**
 * 装備ダンジョンの指定階層に指定回数まで自動で挑戦する(周回)。
 * ステージと異なり単発バトル・持ち越しHPなしで、毎回全回復状態から挑む。
 */
export function runDungeonAutoFarm(
  state: PlayerState,
  floor: DungeonFloor,
  times: number,
  rng: () => number = Math.random,
): AutoFarmResult {
  const result = emptyResult();

  for (let i = 0; i < times; i++) {
    const party = getDungeonParty(state);
    if (party.length === 0) {
      result.stopReason = "NO_PARTY";
      break;
    }
    if (!trySpendStamina(state, DUNGEON_STAMINA_COST).ok) {
      result.stopReason = "STAMINA";
      break;
    }
    result.attempts += 1;

    const setup = setupDungeonBattle(party, floor, state.equipment);
    const engine = new BattleEngine(setup.playerDefs, setup.enemyDefs, { rng });
    const battleResult = engine.run();

    if (battleResult.winner === "PLAYER") {
      const reward = applyDungeonClearRewards(state, floor, party);
      mergeReward(result, reward, 0);
      result.cleared += 1;
    } else {
      result.stopReason = "DEFEAT";
      break;
    }
  }

  return result;
}
