import "./style.css";
import { registerSW } from "virtual:pwa-register";
import { BattleEngine } from "../battle/engine.js";
import { EquipSlot } from "../core/equipment.js";
import { DUNGEON_STAMINA_COST, STAGE_STAMINA_COST } from "../core/fighterLevel.js";
import { MonsterInstance, addExp } from "../core/monsterInstance.js";
import { STAR_MAX_LEVEL } from "../core/rarity.js";
import { findMonsterById } from "../data/monsters.js";
import { DungeonFloor, rollDungeonEquipment, rollDungeonReincarnationPig, rollDungeonSummonScroll } from "../data/equipmentDungeon.js";
import { Stage, StageDrop, rollStageDrop, rollStageEquipment, rollStageReincarnationPig, rollStageSummonScroll } from "../data/stages.js";
import { SUMMON_COST_SINGLE, SUMMON_COST_TEN, SummonResult, summonMany } from "../game/gacha.js";
import { setupDungeonBattle } from "../game/dungeonRunner.js";
import {
  PlayerState,
  addEquipment,
  addFighterExp,
  addMonster,
  addSummonScrolls,
  applyPassiveStaminaRegen,
  equipToMonster,
  getDungeonParty,
  getParty,
  loadPlayerState,
  markStageCleared,
  removeMonsters,
  savePlayerState,
  toggleDungeonPartyMember,
  tryEnhanceEquipment,
  trySpendStamina,
  tryUseSummonScroll,
  unequipFromMonster,
} from "../game/playerState.js";
import { applyRankUp, checkRankUp } from "../game/progression.js";
import { extractSurvivors, setupWaveBattle } from "../game/stageRunner.js";
import { renderBottomNav, ScreenName } from "./views/bottomNav.js";
import { BattleViewHandle, renderBattleView } from "./views/battleView.js";
import { renderDungeonParty } from "./views/dungeonParty.js";
import { EquipmentPickerContext, renderEquipment } from "./views/equipment.js";
import { renderEquipmentDungeon } from "./views/equipmentDungeon.js";
import { renderHome } from "./views/home.js";
import { renderMonsters } from "./views/monsters.js";
import { renderParty } from "./views/party.js";
import { renderStages } from "./views/stages.js";
import { StageResultInfo, StageResultLevelUp, renderStageResult } from "./views/stageResult.js";
import { renderSummon } from "./views/summon.js";

registerSW({ immediate: true });

interface StageRunState {
  stage: Stage;
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

interface AppState {
  screen: ScreenName;
  player: PlayerState;
  summonResults: SummonResult[] | null;
  monsterDetailId: string | null;
  rankUpMode: boolean;
  rankUpSacrificeIds: string[];
  selectedStageId: string | null;
  stageRun: StageRunState | null;
  stageResult: StageResultInfo | null;
  equipmentDetailId: string | null;
  equipmentPickerContext: EquipmentPickerContext | null;
  selectedDungeonFloor: number | null;
  dungeonRun: DungeonRunState | null;
}

const state: AppState = {
  screen: "HOME",
  player: loadPlayerState(),
  summonResults: null,
  monsterDetailId: null,
  rankUpMode: false,
  rankUpSacrificeIds: [],
  selectedStageId: null,
  stageRun: null,
  stageResult: null,
  equipmentDetailId: null,
  equipmentPickerContext: null,
  selectedDungeonFloor: null,
  dungeonRun: null,
};

const rootCandidate = document.getElementById("app");
if (!rootCandidate) throw new Error("#app root element not found");
const root: HTMLElement = rootCandidate;

let disposeCurrentView: (() => void) | null = null;

function navigate(screen: ScreenName): void {
  state.screen = screen;
  state.monsterDetailId = null;
  state.rankUpMode = false;
  state.rankUpSacrificeIds = [];
  state.selectedStageId = null;
  state.summonResults = null;
  state.equipmentDetailId = null;
  state.equipmentPickerContext = null;
  state.selectedDungeonFloor = null;
  render();
}

function handleSelectSlot(monsterId: string, slot: EquipSlot): void {
  state.equipmentPickerContext = { monsterId, slot };
  state.screen = "EQUIPMENT";
  render();
}

function handleUnequipSlot(monsterId: string, slot: EquipSlot): void {
  unequipFromMonster(state.player, monsterId, slot);
  savePlayerState(state.player);
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

function startStage(stage: Stage): void {
  const party = getParty(state.player);
  if (party.length === 0) return;
  if (!trySpendStamina(state.player, STAGE_STAMINA_COST).ok) return;
  savePlayerState(state.player);
  state.stageRun = {
    stage,
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

  const levelUps: StageResultLevelUp[] = [];
  const expTotal = run.wavesCleared * stage.rewards.waveExp;
  for (const id of run.originalPartyIds) {
    const instance = state.player.monsters.find((m) => m.id === id);
    if (!instance) continue;
    const gained = addExp(instance, expTotal, STAR_MAX_LEVEL[instance.star]);
    if (gained > 0) {
      const dex = findMonsterById(instance.dexId);
      levelUps.push({ instanceId: id, name: dex ? dex.name : instance.dexId, levels: gained });
    }
  }

  let totalGold = run.goldEarned;
  let drop: StageDrop | null = null;
  let equipmentDrop = null;
  let pigDrop: StageDrop | null = null;
  let summonScrollDropped = false;
  let fighterLevelsGained = 0;
  if (cleared) {
    totalGold += stage.rewards.clearGold;
    markStageCleared(state.player, stage.id);
    drop = rollStageDrop(stage);
    if (drop) addMonster(state.player, drop.dexId, drop.star);
    equipmentDrop = rollStageEquipment(stage);
    if (equipmentDrop) addEquipment(state.player, equipmentDrop);

    pigDrop = rollStageReincarnationPig();
    if (pigDrop) addMonster(state.player, pigDrop.dexId, pigDrop.star, STAR_MAX_LEVEL[pigDrop.star]);

    summonScrollDropped = rollStageSummonScroll();
    if (summonScrollDropped) addSummonScrolls(state.player, 1);

    fighterLevelsGained = addFighterExp(state.player, expTotal).levelsGained;
  }
  state.player.gold += totalGold;
  savePlayerState(state.player);

  state.stageResult = {
    cleared,
    stageName: stage.name,
    goldEarned: totalGold,
    wavesCleared: run.wavesCleared,
    totalWaves: stage.waves.length,
    levelUps,
    dropDexId: drop ? drop.dexId : null,
    dropStar: drop ? drop.star : null,
    equipmentDrop,
    pigDrop,
    summonScrollDropped,
    fighterLevelsGained,
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

  const levelUps: StageResultLevelUp[] = [];
  let goldEarned = 0;
  let equipmentDrop = null;
  let pigDrop: StageDrop | null = null;
  let summonScrollDropped = false;
  let fighterLevelsGained = 0;

  if (cleared) {
    const expTotal = floor.floor * 20;
    for (const instance of run.partyInstances) {
      const gained = addExp(instance, expTotal, STAR_MAX_LEVEL[instance.star]);
      if (gained > 0) {
        const dex = findMonsterById(instance.dexId);
        levelUps.push({ instanceId: instance.id, name: dex ? dex.name : instance.dexId, levels: gained });
      }
    }

    goldEarned = floor.goldReward;
    equipmentDrop = rollDungeonEquipment(floor);
    addEquipment(state.player, equipmentDrop);

    summonScrollDropped = rollDungeonSummonScroll();
    if (summonScrollDropped) addSummonScrolls(state.player, 1);

    const pig = rollDungeonReincarnationPig(floor);
    if (pig) {
      pigDrop = { dexId: pig.dexId, star: pig.star };
      addMonster(state.player, pig.dexId, pig.star, STAR_MAX_LEVEL[pig.star]);
    }

    fighterLevelsGained = addFighterExp(state.player, expTotal).levelsGained;
  }

  state.player.gold += goldEarned;
  savePlayerState(state.player);

  state.stageResult = {
    cleared,
    stageName: floor.name,
    goldEarned,
    wavesCleared: cleared ? 1 : 0,
    totalWaves: 1,
    levelUps,
    dropDexId: null,
    dropStar: null,
    equipmentDrop,
    pigDrop,
    summonScrollDropped,
    fighterLevelsGained,
  };
  state.dungeonRun = null;
  state.screen = "STAGE_RESULT";
  render();
}

function renderCurrentDungeonBattle(): BattleViewHandle {
  const run = state.dungeonRun;
  if (!run) throw new Error("dungeonRun is not set");

  const setup = setupDungeonBattle(run.partyInstances, run.floor, state.player.equipment);
  const engine = new BattleEngine(setup.playerDefs, setup.enemyDefs);
  const result = engine.run();

  const backLabel = result.winner === "PLAYER" ? "🎁 報酬を受け取る" : "ダンジョンに戻る";
  const onBack = () => finishDungeon(result.winner === "PLAYER");

  return renderBattleView({
    result,
    playerTeam: setup.playerDefs,
    enemyTeam: setup.enemyDefs,
    backLabel,
    title: run.floor.name,
    onBack,
  });
}

function renderCurrentWaveBattle(): BattleViewHandle {
  const run = state.stageRun;
  if (!run) throw new Error("stageRun is not set");

  const wave = run.stage.waves[run.waveIndex];
  const setup = setupWaveBattle(run.currentPartyInstances, run.carryHp, wave, state.player.equipment);
  const engine = new BattleEngine(setup.playerDefs, setup.enemyDefs, { initialPlayerHp: setup.initialPlayerHp });
  const result = engine.run();
  const { survivorInstances, survivorHp } = extractSurvivors(engine, run.currentPartyInstances);

  let backLabel: string;
  let onBack: () => void;

  if (result.winner === "PLAYER") {
    run.goldEarned += run.stage.rewards.waveGold;
    run.wavesCleared += 1;
    run.carryHp = survivorHp;
    run.currentPartyInstances = survivorInstances;

    const isLastWave = run.waveIndex >= run.stage.waves.length - 1;
    if (isLastWave) {
      backLabel = "🎁 報酬を受け取る";
      onBack = () => finishStage(true);
    } else {
      backLabel = "▶ 次のウェーブへ";
      onBack = () => {
        run.waveIndex += 1;
        render();
      };
    }
  } else {
    backLabel = "ステージ選択に戻る";
    onBack = () => finishStage(false);
  }

  return renderBattleView({
    result,
    playerTeam: setup.playerDefs,
    enemyTeam: setup.enemyDefs,
    backLabel,
    title: `${run.stage.name} - ウェーブ${wave.waveNumber}${wave.isBossWave ? "(BOSS)" : ""}`,
    onBack,
  });
}

function render(): void {
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
      content = renderParty({ player: state.player, onToggleParty: handleToggleParty });
      break;

    case "STAGES":
      content = renderStages({
        player: state.player,
        selectedStageId: state.selectedStageId,
        onSelectStage: (id) => {
          state.selectedStageId = id;
          render();
        },
        onStartStage: startStage,
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
  }

  root.append(content);
  if (showNav) root.append(renderBottomNav(state.screen, navigate));
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
    onUnequipSlot: handleUnequipSlot,
  });
}

function renderEquipmentScreen(): HTMLElement {
  return renderEquipment({
    player: state.player,
    detailId: state.equipmentDetailId,
    pickerContext: state.equipmentPickerContext,
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
