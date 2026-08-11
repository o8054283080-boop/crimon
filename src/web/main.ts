import "./style.css";
import { registerSW } from "virtual:pwa-register";
import { BattleEngine } from "../battle/engine.js";
import { EquipSlot } from "../core/equipment.js";
import { DUNGEON_STAMINA_COST, LEVEL_DUNGEON_STAMINA_COST, STAGE_STAMINA_COST } from "../core/fighterLevel.js";
import { MonsterInstance } from "../core/monsterInstance.js";
import { DungeonFloor } from "../data/equipmentDungeon.js";
import { LevelDungeonDef, LevelDungeonTier } from "../data/levelDungeon.js";
import { Difficulty, DIFFICULTY_JA, Stage } from "../data/stages.js";
import { SUMMON_COST_SINGLE, SUMMON_COST_TEN, SummonResult, summonMany } from "../game/gacha.js";
import { setupDungeonBattle } from "../game/dungeonRunner.js";
import { AutoFarmResult, runDungeonAutoFarm, runLevelDungeonAutoFarm, runStageAutoFarm } from "../game/autoFarm.js";
import { applyDungeonClearRewards, applyLevelDungeonClearRewards, applyStageClearRewards } from "../game/rewards.js";
import { applyMonsterPowerUp, checkMonsterPowerUp } from "../game/monsterPowerUp.js";
import {
  PlayerState,
  addMonster,
  applyPassiveStaminaRegen,
  equipToMonster,
  getDungeonParty,
  getParty,
  loadPlayerState,
  removeMonsters,
  savePlayerState,
  toggleDungeonPartyMember,
  tryEnhanceEquipment,
  trySpendStamina,
  tryUseSummonScroll,
} from "../game/playerState.js";
import { applyRankUp, checkRankUp } from "../game/progression.js";
import { extractSurvivors, setupWaveBattle } from "../game/stageRunner.js";
import { renderBottomNav, ScreenName } from "./views/bottomNav.js";
import { renderAutoFarmResult } from "./views/autoFarmResult.js";
import { BattleViewHandle, renderBattleView } from "./views/battleView.js";
import { renderDungeonParty } from "./views/dungeonParty.js";
import { EquipmentPickerContext, renderEquipment } from "./views/equipment.js";
import { renderEquipmentDungeon } from "./views/equipmentDungeon.js";
import { renderHome } from "./views/home.js";
import { renderLevelDungeon } from "./views/levelDungeon.js";
import { renderMonsterDex } from "./views/monsterDex.js";
import { renderMonsters } from "./views/monsters.js";
import { PartyEditMode, renderParty } from "./views/party.js";
import { renderMonsterTraining } from "./views/monsterTraining.js";
import { renderStages } from "./views/stages.js";
import { StageResultInfo, StageResultLevelUp, renderStageResult } from "./views/stageResult.js";
import { renderSummon } from "./views/summon.js";

registerSW({ immediate: true });

interface StageRunState {
  stage: Stage;
  difficulty: Difficulty;
  waveIndex: number;
  originalPartyIds: string[];
  currentPartyInstances: MonsterInstance[];
  carryHp: Map<string, number> | null;
  goldEarned: number;
  wavesCleared: number;
}

interface DungeonRunState {
  floor: DungeonFloor;
  partyInstances: MonsterInstance[];
}

interface LevelDungeonRunState {
  def: LevelDungeonDef;
  partyInstances: MonsterInstance[];
}

interface AppState {
  screen: ScreenName;
  player: PlayerState;
  summonResults: SummonResult[] | null;
  monsterDetailId: string | null;
  rankUpMode: boolean;
  rankUpSacrificeIds: string[];
  selectedStageId: string | null;
  selectedDifficulty: Difficulty;
  stageRun: StageRunState | null;
  stageResult: StageResultInfo | null;
  equipmentDetailId: string | null;
  equipmentPickerContext: EquipmentPickerContext | null;
  equipmentSlotFilter: EquipSlot | null;
  selectedDungeonFloor: number | null;
  dungeonRun: DungeonRunState | null;
  selectedLevelDungeonTier: LevelDungeonTier | null;
  levelDungeonRun: LevelDungeonRunState | null;
  selectedDexEntryId: string | null;
  monsterTrainingTargetId: string | null;
  monsterTrainingMaterialIds: string[];
  partyEditMode: PartyEditMode;
  autoFarmCount: number;
  autoFarmResult: AutoFarmResult | null;
  autoFarmTargetName: string;
}

const state: AppState = {
  screen: "HOME",
  player: loadPlayerState(),
  summonResults: null,
  monsterDetailId: null,
  rankUpMode: false,
  rankUpSacrificeIds: [],
  selectedStageId: null,
  selectedDifficulty: "NORMAL",
  stageRun: null,
  stageResult: null,
  equipmentDetailId: null,
  equipmentPickerContext: null,
  equipmentSlotFilter: null,
  selectedDungeonFloor: null,
  dungeonRun: null,
  selectedLevelDungeonTier: null,
  levelDungeonRun: null,
  selectedDexEntryId: null,
  monsterTrainingTargetId: null,
  monsterTrainingMaterialIds: [],
  partyEditMode: "NORMAL",
  autoFarmCount: 10,
  autoFarmResult: null,
  autoFarmTargetName: "",
};

const rootCandidate = document.getElementById("app");
if (!rootCandidate) throw new Error("#app root element not found");
const root: HTMLElement = rootCandidate;

let disposeCurrentView: (() => void) | null = null;

/** 画面(+サブ状態)ごとのスクロール位置を記憶し、その画面に戻った時に復元する */
const scrollPositions = new Map<string, number>();
let lastRouteKey: string | null = null;

function routeKey(): string {
  return JSON.stringify([
    state.screen,
    state.monsterDetailId,
    state.rankUpMode,
    state.equipmentDetailId,
    state.equipmentPickerContext,
    state.equipmentSlotFilter,
    state.selectedStageId,
    state.selectedDifficulty,
    state.selectedDungeonFloor,
    state.selectedDexEntryId,
    state.monsterTrainingTargetId,
    state.selectedLevelDungeonTier,
  ]);
}

function navigate(screen: ScreenName): void {
  state.screen = screen;
  state.monsterDetailId = null;
  state.rankUpMode = false;
  state.rankUpSacrificeIds = [];
  state.selectedStageId = null;
  state.selectedDifficulty = "NORMAL";
  state.summonResults = null;
  state.equipmentDetailId = null;
  state.equipmentPickerContext = null;
  state.equipmentSlotFilter = null;
  state.selectedDungeonFloor = null;
  state.selectedLevelDungeonTier = null;
  state.selectedDexEntryId = null;
  state.monsterTrainingTargetId = null;
  state.monsterTrainingMaterialIds = [];
  state.autoFarmResult = null;
  render();
}

function handleSelectSlot(monsterId: string, slot: EquipSlot): void {
  state.equipmentPickerContext = { monsterId, slot };
  state.screen = "EQUIPMENT";
  render();
}

function handleViewEquippedSlot(equipmentId: string): void {
  state.equipmentDetailId = equipmentId;
  state.screen = "EQUIPMENT";
  render();
}

function handleEquip(equipmentId: string, monsterId: string): void {
  equipToMonster(state.player, monsterId, equipmentId);
  savePlayerState(state.player);
  state.equipmentPickerContext = null;
  state.screen = "MONSTERS";
  render();
}

function handleUnequipFromEquipmentScreen(equipmentId: string): void {
  const equipment = state.player.equipment.find((e) => e.id === equipmentId);
  if (!equipment) return;
  for (const monster of state.player.monsters) {
    if (monster.equipment[equipment.slot] === equipmentId) {
      delete monster.equipment[equipment.slot];
    }
  }
  savePlayerState(state.player);
  render();
}

function handleEnhanceEquipment(equipmentId: string): void {
  const result = tryEnhanceEquipment(state.player, equipmentId);
  if (!result.ok) return;
  savePlayerState(state.player);
  render();
}

function handleSummon(count: number): void {
  const cost = count >= 10 ? SUMMON_COST_TEN : SUMMON_COST_SINGLE * count;
  if (state.player.crystal < cost) return;
  state.player.crystal -= cost;
  const results = summonMany(count);
  for (const r of results) addMonster(state.player, r.dexId, r.star);
  savePlayerState(state.player);
  state.summonResults = results;
  render();
}

function handleUseSummonScroll(): void {
  if (!tryUseSummonScroll(state.player)) return;
  const results = summonMany(1);
  for (const r of results) addMonster(state.player, r.dexId, r.star);
  savePlayerState(state.player);
  state.summonResults = results;
  render();
}

function handleConfirmRankUp(): void {
  const target = state.player.monsters.find((m) => m.id === state.monsterDetailId);
  if (!target) return;
  const sacrifices = state.rankUpSacrificeIds
    .map((id) => state.player.monsters.find((m) => m.id === id))
    .filter((m): m is MonsterInstance => m !== undefined);
  const check = checkRankUp(target, sacrifices, state.player.partyIds);
  if (!check.ok) return;

  applyRankUp(target);
  removeMonsters(state.player, state.rankUpSacrificeIds);
  savePlayerState(state.player);
  state.rankUpMode = false;
  state.rankUpSacrificeIds = [];
  render();
}

function handleConfirmMonsterTraining(): void {
  const target = state.player.monsters.find((m) => m.id === state.monsterTrainingTargetId);
  if (!target) return;
  const materials = state.monsterTrainingMaterialIds
    .map((id) => state.player.monsters.find((m) => m.id === id))
    .filter((m): m is MonsterInstance => m !== undefined);
  const check = checkMonsterPowerUp(target, materials, state.player.partyIds);
  if (!check.ok) return;

  applyMonsterPowerUp(target, materials);
  removeMonsters(state.player, state.monsterTrainingMaterialIds);
  savePlayerState(state.player);
  state.monsterTrainingTargetId = null;
  state.monsterTrainingMaterialIds = [];
  state.monsterDetailId = target.id;
  state.screen = "MONSTERS";
  render();
}

function handleToggleParty(instanceId: string): void {
  const idx = state.player.partyIds.indexOf(instanceId);
  if (idx >= 0) {
    state.player.partyIds.splice(idx, 1);
  } else {
    if (state.player.partyIds.length >= 4) return;
    state.player.partyIds.push(instanceId);
  }
  savePlayerState(state.player);
  render();
}

function startStage(stage: Stage, difficulty: Difficulty): void {
  const party = getParty(state.player);
  if (party.length === 0) return;
  if (!trySpendStamina(state.player, STAGE_STAMINA_COST).ok) return;
  savePlayerState(state.player);
  state.stageRun = {
    stage,
    difficulty,
    waveIndex: 0,
    originalPartyIds: party.map((p) => p.id),
    currentPartyInstances: party,
    carryHp: null,
    goldEarned: 0,
    wavesCleared: 0,
  };
  state.screen = "BATTLE";
  render();
}

function finishStage(cleared: boolean): void {
  const run = state.stageRun;
  if (!run) return;
  const stage = run.stage;

  const partyInstances = run.originalPartyIds
    .map((id) => state.player.monsters.find((m) => m.id === id))
    .filter((m): m is MonsterInstance => m !== undefined);
  const reward = cleared ? applyStageClearRewards(state.player, stage, run.wavesCleared, partyInstances, run.difficulty) : null;
  state.player.gold += run.goldEarned;
  savePlayerState(state.player);

  const difficultySuffix = run.difficulty === "NORMAL" ? "" : ` [${DIFFICULTY_JA[run.difficulty]}]`;
  state.stageResult = {
    cleared,
    stageName: `${stage.name}${difficultySuffix}`,
    goldEarned: run.goldEarned + (reward?.goldEarned ?? 0),
    crystalEarned: reward?.crystalEarned ?? 0,
    wavesCleared: run.wavesCleared,
    totalWaves: stage.waves.length,
    levelUps: reward?.levelUps ?? [],
    dropDexId: reward?.dropDexId ?? null,
    dropStar: reward?.dropStar ?? null,
    equipmentDrop: reward?.equipmentDrop ?? null,
    pigDrop: reward?.pigDrop ?? null,
    summonScrollDropped: reward?.summonScrollDropped ?? false,
    fighterLevelsGained: reward?.fighterLevelsGained ?? 0,
  };
  state.stageRun = null;
  state.screen = "STAGE_RESULT";
  render();
}

function startDungeonFloor(floor: DungeonFloor): void {
  const party = getDungeonParty(state.player);
  if (party.length === 0) return;
  if (!trySpendStamina(state.player, DUNGEON_STAMINA_COST).ok) return;
  savePlayerState(state.player);
  state.dungeonRun = { floor, partyInstances: party };
  state.screen = "DUNGEON_BATTLE";
  render();
}

function finishDungeon(cleared: boolean): void {
  const run = state.dungeonRun;
  if (!run) return;
  const floor = run.floor;

  const reward = cleared ? applyDungeonClearRewards(state.player, floor, run.partyInstances) : null;
  savePlayerState(state.player);

  state.stageResult = {
    cleared,
    stageName: floor.name,
    goldEarned: reward?.goldEarned ?? 0,
    crystalEarned: reward?.crystalEarned ?? 0,
    wavesCleared: cleared ? 1 : 0,
    totalWaves: 1,
    levelUps: reward?.levelUps ?? [],
    dropDexId: null,
    dropStar: null,
    equipmentDrop: reward?.equipmentDrop ?? null,
    pigDrop: reward?.pigDrop ?? null,
    summonScrollDropped: reward?.summonScrollDropped ?? false,
    fighterLevelsGained: reward?.fighterLevelsGained ?? 0,
  };
  state.dungeonRun = null;
  state.screen = "STAGE_RESULT";
  render();
}

function handleAutoFarmStage(stage: Stage, count: number, difficulty: Difficulty): void {
  const result = runStageAutoFarm(state.player, stage, count, Math.random, difficulty);
  savePlayerState(state.player);
  state.autoFarmResult = result;
  const difficultySuffix = difficulty === "NORMAL" ? "" : ` [${DIFFICULTY_JA[difficulty]}]`;
  state.autoFarmTargetName = `${stage.name}${difficultySuffix}`;
  state.selectedStageId = null;
  state.screen = "AUTO_FARM_RESULT";
  render();
}

function handleAutoFarmDungeon(floor: DungeonFloor, count: number): void {
  const result = runDungeonAutoFarm(state.player, floor, count);
  savePlayerState(state.player);
  state.autoFarmResult = result;
  state.autoFarmTargetName = floor.name;
  state.selectedDungeonFloor = null;
  state.screen = "AUTO_FARM_RESULT";
  render();
}

function startLevelDungeonTier(def: LevelDungeonDef): void {
  const party = getParty(state.player);
  if (party.length === 0) return;
  if (!trySpendStamina(state.player, LEVEL_DUNGEON_STAMINA_COST).ok) return;
  savePlayerState(state.player);
  state.levelDungeonRun = { def, partyInstances: party };
  state.screen = "LEVEL_DUNGEON_BATTLE";
  render();
}

function finishLevelDungeon(cleared: boolean): void {
  const run = state.levelDungeonRun;
  if (!run) return;
  const def = run.def;

  const reward = cleared ? applyLevelDungeonClearRewards(state.player, def, run.partyInstances) : null;
  savePlayerState(state.player);

  state.stageResult = {
    cleared,
    stageName: def.name,
    goldEarned: reward?.goldEarned ?? 0,
    crystalEarned: reward?.crystalEarned ?? 0,
    wavesCleared: cleared ? 1 : 0,
    totalWaves: 1,
    levelUps: reward?.levelUps ?? [],
    dropDexId: null,
    dropStar: null,
    equipmentDrop: null,
    pigDrop: reward?.pigDrop ?? null,
    summonScrollDropped: false,
    fighterLevelsGained: reward?.fighterLevelsGained ?? 0,
  };
  state.levelDungeonRun = null;
  state.screen = "STAGE_RESULT";
  render();
}

function handleAutoFarmLevelDungeon(def: LevelDungeonDef, count: number): void {
  const result = runLevelDungeonAutoFarm(state.player, def, count);
  savePlayerState(state.player);
  state.autoFarmResult = result;
  state.autoFarmTargetName = def.name;
  state.selectedLevelDungeonTier = null;
  state.screen = "AUTO_FARM_RESULT";
  render();
}

function renderCurrentDungeonBattle(): BattleViewHandle {
  const run = state.dungeonRun;
  if (!run) throw new Error("dungeonRun is not set");

  const setup = setupDungeonBattle(run.partyInstances, run.floor, state.player.equipment);
  const engine = new BattleEngine(setup.playerDefs, setup.enemyDefs);

  return renderBattleView({
    engine,
    playerTeam: setup.playerDefs,
    enemyTeam: setup.enemyDefs,
    title: run.floor.name,
    resultLabel: (winner) => (winner === "PLAYER" ? "🎁 報酬を受け取る" : "ダンジョンに戻る"),
    onFinish: (winner) => finishDungeon(winner === "PLAYER"),
  });
}

function renderCurrentLevelDungeonBattle(): BattleViewHandle {
  const run = state.levelDungeonRun;
  if (!run) throw new Error("levelDungeonRun is not set");

  const setup = setupDungeonBattle(run.partyInstances, run.def, state.player.equipment);
  const engine = new BattleEngine(setup.playerDefs, setup.enemyDefs);

  return renderBattleView({
    engine,
    playerTeam: setup.playerDefs,
    enemyTeam: setup.enemyDefs,
    title: run.def.name,
    resultLabel: (winner) => (winner === "PLAYER" ? "🎁 報酬を受け取る" : "ダンジョンに戻る"),
    onFinish: (winner) => finishLevelDungeon(winner === "PLAYER"),
  });
}

function renderCurrentWaveBattle(): BattleViewHandle {
  const run = state.stageRun;
  if (!run) throw new Error("stageRun is not set");

  const wave = run.stage.waves[run.waveIndex];
  const setup = setupWaveBattle(run.currentPartyInstances, run.carryHp, wave, state.player.equipment, run.difficulty);
  const engine = new BattleEngine(setup.playerDefs, setup.enemyDefs, { initialPlayerHp: setup.initialPlayerHp });
  const isLastWave = run.waveIndex >= run.stage.waves.length - 1;
  const difficultySuffix = run.difficulty === "NORMAL" ? "" : ` [${DIFFICULTY_JA[run.difficulty]}]`;

  return renderBattleView({
    engine,
    playerTeam: setup.playerDefs,
    enemyTeam: setup.enemyDefs,
    title: `${run.stage.name}${difficultySuffix} - ウェーブ${wave.waveNumber}${wave.isBossWave ? "(BOSS)" : ""}`,
    resultLabel: (winner) => {
      if (winner !== "PLAYER") return "ステージ選択に戻る";
      return isLastWave ? "🎁 報酬を受け取る" : "▶ 次のウェーブへ";
    },
    onFinish: (winner) => {
      if (winner === "PLAYER") {
        const { survivorInstances, survivorHp } = extractSurvivors(engine, run.currentPartyInstances);
        run.goldEarned += run.stage.rewards.waveGold;
        run.wavesCleared += 1;
        run.carryHp = survivorHp;
        run.currentPartyInstances = survivorInstances;
        if (isLastWave) {
          finishStage(true);
        } else {
          run.waveIndex += 1;
          render();
        }
      } else {
        finishStage(false);
      }
    },
  });
}

function render(): void {
  if (lastRouteKey !== null) scrollPositions.set(lastRouteKey, window.scrollY);

  disposeCurrentView?.();
  disposeCurrentView = null;
  root.innerHTML = "";

  const staminaBefore = state.player.stamina;
  applyPassiveStaminaRegen(state.player);
  if (state.player.stamina !== staminaBefore) savePlayerState(state.player);

  let content: HTMLElement;
  let showNav = true;

  switch (state.screen) {
    case "HOME":
      content = renderHome({
        player: state.player,
        onGoSummon: () => navigate("SUMMON"),
        onGoStages: () => navigate("STAGES"),
        onGoParty: () => navigate("PARTY"),
        onGoEquipDungeon: () => navigate("EQUIP_DUNGEON"),
        onGoLevelDungeon: () => navigate("LEVEL_DUNGEON"),
      });
      break;

    case "SUMMON":
      content = renderSummonScreen();
      break;

    case "MONSTERS":
      content = renderMonstersScreen();
      break;

    case "EQUIPMENT":
      content = renderEquipmentScreen();
      break;

    case "PARTY":
      content = renderParty({
        player: state.player,
        mode: state.partyEditMode,
        onSetMode: (mode) => {
          state.partyEditMode = mode;
          render();
        },
        onToggleParty: handleToggleParty,
        onToggleDungeonMember: (id) => {
          toggleDungeonPartyMember(state.player, id);
          savePlayerState(state.player);
          render();
        },
      });
      break;

    case "STAGES":
      content = renderStages({
        player: state.player,
        selectedStageId: state.selectedStageId,
        onSelectStage: (id) => {
          state.selectedStageId = id;
          state.selectedDifficulty = "NORMAL";
          render();
        },
        selectedDifficulty: state.selectedDifficulty,
        onSelectDifficulty: (difficulty) => {
          state.selectedDifficulty = difficulty;
          render();
        },
        onStartStage: startStage,
        autoFarmCount: state.autoFarmCount,
        onChangeAutoFarmCount: (count) => {
          state.autoFarmCount = count;
          render();
        },
        onAutoFarm: handleAutoFarmStage,
      });
      break;

    case "BATTLE": {
      showNav = false;
      const handle = renderCurrentWaveBattle();
      disposeCurrentView = handle.dispose;
      content = handle.element;
      break;
    }

    case "EQUIP_DUNGEON":
      content = renderEquipmentDungeon({
        player: state.player,
        selectedFloor: state.selectedDungeonFloor,
        onSelectFloor: (floor) => {
          state.selectedDungeonFloor = floor;
          render();
        },
        onStartFloor: startDungeonFloor,
        onGoDungeonParty: () => {
          state.screen = "DUNGEON_PARTY";
          render();
        },
        autoFarmCount: state.autoFarmCount,
        onChangeAutoFarmCount: (count) => {
          state.autoFarmCount = count;
          render();
        },
        onAutoFarm: handleAutoFarmDungeon,
      });
      break;

    case "DUNGEON_PARTY":
      content = renderDungeonParty({
        player: state.player,
        onToggleMember: (id) => {
          toggleDungeonPartyMember(state.player, id);
          savePlayerState(state.player);
          render();
        },
        onBack: () => {
          state.screen = "EQUIP_DUNGEON";
          render();
        },
      });
      break;

    case "DUNGEON_BATTLE": {
      showNav = false;
      const handle = renderCurrentDungeonBattle();
      disposeCurrentView = handle.dispose;
      content = handle.element;
      break;
    }

    case "LEVEL_DUNGEON":
      content = renderLevelDungeon({
        player: state.player,
        selectedTier: state.selectedLevelDungeonTier,
        onSelectTier: (tier) => {
          state.selectedLevelDungeonTier = tier;
          render();
        },
        onStartTier: startLevelDungeonTier,
        onGoParty: () => navigate("PARTY"),
        autoFarmCount: state.autoFarmCount,
        onChangeAutoFarmCount: (count) => {
          state.autoFarmCount = count;
          render();
        },
        onAutoFarm: handleAutoFarmLevelDungeon,
      });
      break;

    case "LEVEL_DUNGEON_BATTLE": {
      showNav = false;
      const handle = renderCurrentLevelDungeonBattle();
      disposeCurrentView = handle.dispose;
      content = handle.element;
      break;
    }

    case "MONSTER_DEX":
      content = renderMonsterDex({
        selectedDexId: state.selectedDexEntryId,
        onSelectEntry: (id) => {
          state.selectedDexEntryId = id;
          render();
        },
        onBack: () => {
          state.selectedDexEntryId = null;
          state.screen = "MONSTERS";
          render();
        },
      });
      break;

    case "MONSTER_TRAINING": {
      if (!state.monsterTrainingTargetId) {
        navigate("MONSTERS");
        return;
      }
      content = renderMonsterTraining({
        player: state.player,
        targetId: state.monsterTrainingTargetId,
        selectedMaterialIds: state.monsterTrainingMaterialIds,
        onToggleMaterial: (id) => {
          const idx = state.monsterTrainingMaterialIds.indexOf(id);
          if (idx >= 0) state.monsterTrainingMaterialIds.splice(idx, 1);
          else state.monsterTrainingMaterialIds.push(id);
          render();
        },
        onConfirm: handleConfirmMonsterTraining,
        onCancel: () => {
          state.monsterTrainingTargetId = null;
          state.monsterTrainingMaterialIds = [];
          state.screen = "MONSTERS";
          render();
        },
      });
      break;
    }

    case "STAGE_RESULT": {
      showNav = false;
      const info = state.stageResult;
      if (!info) {
        navigate("HOME");
        return;
      }
      content = renderStageResult({ info, onClose: () => navigate("HOME") });
      break;
    }

    case "AUTO_FARM_RESULT": {
      showNav = false;
      const result = state.autoFarmResult;
      if (!result) {
        navigate("HOME");
        return;
      }
      content = renderAutoFarmResult({ result, targetName: state.autoFarmTargetName, onClose: () => navigate("HOME") });
      break;
    }
  }

  root.append(content);
  if (showNav) root.append(renderBottomNav(state.screen, navigate));

  const newRouteKey = routeKey();
  window.scrollTo(0, scrollPositions.get(newRouteKey) ?? 0);
  lastRouteKey = newRouteKey;
}

function renderSummonScreen(): HTMLElement {
  return renderSummon({
    player: state.player,
    lastResults: state.summonResults,
    onSummon: handleSummon,
    onDismissResults: () => {
      state.summonResults = null;
      render();
    },
    onUseSummonScroll: handleUseSummonScroll,
  });
}

function renderMonstersScreen(): HTMLElement {
  return renderMonsters({
    player: state.player,
    detailId: state.monsterDetailId,
    rankUpMode: state.rankUpMode,
    selectedSacrificeIds: state.rankUpSacrificeIds,
    onSelectDetail: (id) => {
      state.monsterDetailId = id;
      state.rankUpMode = false;
      state.rankUpSacrificeIds = [];
      render();
    },
    onStartRankUp: () => {
      state.rankUpMode = true;
      state.rankUpSacrificeIds = [];
      render();
    },
    onToggleSacrifice: (id) => {
      const idx = state.rankUpSacrificeIds.indexOf(id);
      if (idx >= 0) state.rankUpSacrificeIds.splice(idx, 1);
      else state.rankUpSacrificeIds.push(id);
      render();
    },
    onConfirmRankUp: handleConfirmRankUp,
    onCancelRankUp: () => {
      state.rankUpMode = false;
      state.rankUpSacrificeIds = [];
      render();
    },
    onSelectSlot: handleSelectSlot,
    onViewEquippedSlot: handleViewEquippedSlot,
    onGoMonsterTraining: (monsterId) => {
      state.monsterTrainingTargetId = monsterId;
      state.monsterTrainingMaterialIds = [];
      state.screen = "MONSTER_TRAINING";
      render();
    },
    onGoMonsterDex: () => {
      state.selectedDexEntryId = null;
      state.screen = "MONSTER_DEX";
      render();
    },
  });
}

function renderEquipmentScreen(): HTMLElement {
  return renderEquipment({
    player: state.player,
    detailId: state.equipmentDetailId,
    pickerContext: state.equipmentPickerContext,
    slotFilter: state.equipmentSlotFilter,
    onChangeSlotFilter: (slot) => {
      state.equipmentSlotFilter = slot;
      render();
    },
    onSelectDetail: (id) => {
      state.equipmentDetailId = id;
      render();
    },
    onEquip: handleEquip,
    onUnequip: handleUnequipFromEquipmentScreen,
    onEnhance: handleEnhanceEquipment,
    onCancelPicker: () => {
      state.equipmentPickerContext = null;
      state.screen = "MONSTERS";
      render();
    },
    onGoDungeon: () => navigate("EQUIP_DUNGEON"),
  });
}

render();
