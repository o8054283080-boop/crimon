import "./style.css";
import { audioContextState, getAudioSettings, initAudio, playSfx, updateAudioSettings } from "./audio/index.js";
import { registerSW } from "virtual:pwa-register";
import { BattleEngine } from "../battle/engine.js";
import { equipmentSellPrice, EquipSlot } from "../core/equipment.js";
import { DUNGEON_STAMINA_COST, GOLD_DUNGEON_STAMINA_COST, LEVEL_DUNGEON_STAMINA_COST, STAGE_STAMINA_COST } from "../core/fighterLevel.js";
import { MonsterInstance } from "../core/monsterInstance.js";
import { DungeonFloor } from "../data/equipmentDungeon.js";
import { GoldDungeonFloor } from "../data/goldDungeon.js";
import { LevelDungeonDef, LevelDungeonTier } from "../data/levelDungeon.js";
import { Difficulty, DIFFICULTY_JA, Stage } from "../data/stages.js";
import { SUMMON_COST_SINGLE, SUMMON_COST_TEN, SummonResult, summonMany } from "../game/gacha.js";
import { setupDungeonBattle } from "../game/dungeonRunner.js";
import { AutoFarmResult, runDungeonAutoFarm, runGoldDungeonAutoFarm, runLevelDungeonAutoFarm, runStageAutoFarm } from "../game/autoFarm.js";
import { applyDungeonClearRewards, applyGoldDungeonClearRewards, applyLevelDungeonClearRewards, applyStageClearRewards } from "../game/rewards.js";
import { applyMonsterPowerUp, checkMonsterPowerUp } from "../game/monsterPowerUp.js";
import {
  claimDailyLoginBonus,
  FIGHTER_NAME_MAX_LENGTH,
  LoginBonusResult,
  PlayerState,
  addMonster,
  applyPassiveStaminaRegen,
  buyShopEntry,
  equipToMonster,
  getShop,
  getDungeonParty,
  getParty,
  loadPlayerState,
  normalizeLoadedState,
  removeMonsters,
  savePlayerState,
  sellEquipment,
  setFighterName,
  toggleDungeonPartyMember,
  tryEnhanceEquipment,
  tryRefillStaminaFull,
  tryRefillStaminaPartial,
  trySpendGoldDungeonChallenge,
  trySpendStamina,
  trySpendSummonScrolls,
  unlockShopSlot,
} from "../game/playerState.js";
import { applyRankUp, checkRankUp } from "../game/progression.js";
import { extractSurvivors, setupWaveBattle } from "../game/stageRunner.js";
import { renderBottomNav, ScreenName } from "./views/bottomNav.js";
import { renderShop } from "./views/shop.js";
import { describeSaveFile, parseSaveFile, saveFileName, serializeSaveFile } from "../game/saveFile.js";
import { CompensationClaim, claimCompensations } from "../game/compensation.js";
import { renderAutoFarmResult } from "./views/autoFarmResult.js";
import { BattleViewHandle, renderBattleView } from "./views/battleView.js";
import { renderDungeonParty } from "./views/dungeonParty.js";
import { EquipmentPickerContext, EquipmentSortKey, renderEquipment } from "./views/equipment.js";
import { renderEquipmentDungeon } from "./views/equipmentDungeon.js";
import { renderGoldDungeon } from "./views/goldDungeon.js";
import { renderHome } from "./views/home.js";
import { renderLevelDungeon } from "./views/levelDungeon.js";
import { renderMonsterDex } from "./views/monsterDex.js";
import { renderMonsters } from "./views/monsters.js";
import { PartyEditMode, renderParty } from "./views/party.js";
import { renderMonsterTraining } from "./views/monsterTraining.js";
import { renderStages } from "./views/stages.js";
import { StageResultInfo, StageResultLevelUp, renderStageResult } from "./views/stageResult.js";
import { renderSummon } from "./views/summon.js";

/**
 * 更新の取り込み。
 *
 * `autoUpdate` にしていても、**新しいServiceWorkerが権利を取っただけでは
 * すでに開いている画面は古いままになる**。実際にこれで、配信は成功しているのに
 * 「音もショップも装備ダンジョンの変更も反映されていない」状態になった。
 * 権利が入れ替わった時点で1度だけ読み込み直して、確実に新しい版へ乗せ替える。
 */
function installUpdateReload(): void {
  if (typeof navigator === "undefined" || !navigator.serviceWorker) return;
  // 初回訪問では「制御なし → 制御あり」で必ず1度発火する。
  // そこで読み込み直すと無駄なちらつきになるので、すでに制御されていた時だけ乗せ替える
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });
}

installUpdateReload();

registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    // 開きっぱなしで遊んでいる間に配信された更新も拾えるよう、定期的に確認する
    setInterval(() => void registration.update(), 30 * 60 * 1000);
    // 画面に戻ってきた時も確認する。放置していた端末はこちらの方が早く気付く
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void registration.update();
    });
  },
});

initAudio();

/**
 * ボタンやカードを押した時のUI音。
 *
 * 押した場所ごとに個別に鳴らすと付け忘れが必ず出るので、
 * 文書全体で1回だけ拾って、押されたものの種類で音を選ぶ。
 */
document.addEventListener(
  "pointerdown",
  (event) => {
    const target = (event.target as HTMLElement | null)?.closest("button, a, .stage-tile, .monster-card, .equipment-card");
    if (!target) return;
    // 決定系(ボタン)と選択系(カード)で音を分け、押した対象が伝わるようにする
    playSfx(target.matches("button, a") ? "tap" : "select", 0.55);
  },
  { passive: true, capture: true },
);

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

interface GoldDungeonRunState {
  floor: GoldDungeonFloor;
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
  equipmentSortKey: EquipmentSortKey;
  /** まとめて売却するために選ばれている装備 */
  equipmentSelectedIds: string[];
  /** ショップで直前に買ったものの案内。次に何か操作したら消す */
  shopNotice: string | null;
  /** まとめ売却の選択モード中か */
  equipmentSelecting: boolean;
  /** モンスターの装備スロットから装備詳細を開いた場合、戻る操作でこのモンスターの画面に戻るための参照 */
  equipmentReturnMonsterId: string | null;
  selectedDungeonFloor: number | null;
  dungeonRun: DungeonRunState | null;
  selectedLevelDungeonTier: LevelDungeonTier | null;
  levelDungeonRun: LevelDungeonRunState | null;
  selectedGoldDungeonFloor: number | null;
  goldDungeonRun: GoldDungeonRunState | null;
  selectedDexEntryId: string | null;
  monsterTrainingTargetId: string | null;
  monsterTrainingMaterialIds: string[];
  partyEditMode: PartyEditMode;
  autoFarmCount: number;
  autoFarmResult: AutoFarmResult | null;
  autoFarmTargetName: string;
  loginBonusResult: LoginBonusResult | null;
  /** 起動時に受け取ったお詫び配布。閉じるまでホームに出す */
  compensationClaims: CompensationClaim[];
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
  equipmentSortKey: "recommended",
  equipmentSelectedIds: [],
  shopNotice: null,
  equipmentSelecting: false,
  equipmentReturnMonsterId: null,
  selectedDungeonFloor: null,
  dungeonRun: null,
  selectedLevelDungeonTier: null,
  levelDungeonRun: null,
  selectedGoldDungeonFloor: null,
  goldDungeonRun: null,
  selectedDexEntryId: null,
  monsterTrainingTargetId: null,
  monsterTrainingMaterialIds: [],
  partyEditMode: "NORMAL",
  autoFarmCount: 10,
  autoFarmResult: null,
  autoFarmTargetName: "",
  loginBonusResult: null,
  compensationClaims: [],
};

{
  const loginBonus = claimDailyLoginBonus(state.player);
  if (loginBonus.claimed) {
    state.loginBonusResult = loginBonus;
    savePlayerState(state.player);
  }
  // お詫びの配布。期間中に一度開けば自動で受け取れる(重複はしない)
  const claims = claimCompensations(state.player);
  if (claims.length > 0) {
    state.compensationClaims = claims;
    savePlayerState(state.player);
  }
}

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
    state.selectedGoldDungeonFloor,
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
  state.equipmentReturnMonsterId = null;
  state.selectedDungeonFloor = null;
  state.selectedLevelDungeonTier = null;
  state.selectedGoldDungeonFloor = null;
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

function handleViewEquippedSlot(equipmentId: string, monsterId: string): void {
  state.equipmentDetailId = equipmentId;
  state.equipmentReturnMonsterId = monsterId;
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

function handleSellEquipment(equipmentId: string): void {
  if (!window.confirm("この装備を売却しますか?この操作は取り消せません。")) return;
  const result = sellEquipment(state.player, equipmentId);
  if (!result.ok) return;
  savePlayerState(state.player);
  state.equipmentDetailId = null;
  render();
}

/**
 * 選択した装備をまとめて売却する。
 *
 * 一括操作は取り消せないので、**何個いくらで売れるのかを確認の文面に必ず出す**。
 * 装着中のものは売れないため、選択の時点で弾いてある(ここでも念のため数を数え直す)。
 */
function handleBulkSellEquipment(): void {
  const targets = state.player.equipment.filter((e) => state.equipmentSelectedIds.includes(e.id));
  if (targets.length === 0) return;
  const total = targets.reduce((sum, e) => sum + equipmentSellPrice(e), 0);
  if (!window.confirm(`${targets.length}個の装備を売却して🪙${total.toLocaleString()}を得ます。この操作は取り消せません。`)) return;

  let sold = 0;
  for (const target of targets) {
    const result = sellEquipment(state.player, target.id);
    if (result.ok) sold += 1;
  }
  if (sold > 0) savePlayerState(state.player);
  state.equipmentSelectedIds = [];
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

/**
 * 召喚の書で引く。10枚あれば10連にでき、ダイヤの10連と同じ★4以上確定が付く
 * (書を10枚ためた人が、ばら引きより損をする形にはしない)。
 */
function handleUseSummonScroll(count: number): void {
  if (!trySpendSummonScrolls(state.player, count)) return;
  const results = summonMany(count);
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

  applyRankUp(target, sacrifices);
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

function startGoldDungeonFloor(floor: GoldDungeonFloor): void {
  const party = getParty(state.player);
  if (party.length === 0) return;
  if (!trySpendGoldDungeonChallenge(state.player).ok) return;
  if (!trySpendStamina(state.player, GOLD_DUNGEON_STAMINA_COST).ok) return;
  savePlayerState(state.player);
  state.goldDungeonRun = { floor, partyInstances: party };
  state.screen = "GOLD_DUNGEON_BATTLE";
  render();
}

function finishGoldDungeon(cleared: boolean): void {
  const run = state.goldDungeonRun;
  if (!run) return;
  const floor = run.floor;

  const reward = cleared ? applyGoldDungeonClearRewards(state.player, floor, run.partyInstances) : null;
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
    equipmentDrop: null,
    pigDrop: null,
    summonScrollDropped: false,
    fighterLevelsGained: reward?.fighterLevelsGained ?? 0,
  };
  state.goldDungeonRun = null;
  state.screen = "STAGE_RESULT";
  render();
}

function handleAutoFarmGoldDungeon(floor: GoldDungeonFloor, count: number): void {
  const result = runGoldDungeonAutoFarm(state.player, floor, count);
  savePlayerState(state.player);
  state.autoFarmResult = result;
  state.autoFarmTargetName = floor.name;
  state.selectedGoldDungeonFloor = null;
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

function renderCurrentGoldDungeonBattle(): BattleViewHandle {
  const run = state.goldDungeonRun;
  if (!run) throw new Error("goldDungeonRun is not set");

  const setup = setupDungeonBattle(run.partyInstances, run.floor, state.player.equipment);
  const engine = new BattleEngine(setup.playerDefs, setup.enemyDefs);

  return renderBattleView({
    engine,
    playerTeam: setup.playerDefs,
    enemyTeam: setup.enemyDefs,
    title: run.floor.name,
    resultLabel: (winner) => (winner === "PLAYER" ? "🎁 報酬を受け取る" : "ダンジョンに戻る"),
    onFinish: (winner) => finishGoldDungeon(winner === "PLAYER"),
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
        loginBonusResult: state.loginBonusResult,
        compensationClaims: state.compensationClaims,
        onDismissCompensation: () => {
          state.compensationClaims = [];
          render();
        },
        onDismissLoginBonus: () => {
          state.loginBonusResult = null;
          render();
        },
        onGoSummon: () => navigate("SUMMON"),
        onGoStages: () => navigate("STAGES"),
        onGoParty: () => navigate("PARTY"),
        onGoEquipDungeon: () => navigate("EQUIP_DUNGEON"),
        onGoLevelDungeon: () => navigate("LEVEL_DUNGEON"),
        onGoGoldDungeon: () => navigate("GOLD_DUNGEON"),
        onRefillStaminaPartial: () => {
          if (!tryRefillStaminaPartial(state.player).ok) return;
          savePlayerState(state.player);
          render();
        },
        onRefillStaminaFull: () => {
          if (!tryRefillStaminaFull(state.player).ok) return;
          savePlayerState(state.player);
          render();
        },
        onEditFighterName: () => {
          const name = window.prompt(`ファイター名を入力してください(最大${FIGHTER_NAME_MAX_LENGTH}文字)`, state.player.fighterName);
          if (name === null) return;
          setFighterName(state.player, name);
          savePlayerState(state.player);
          render();
        },
        audioSettings: {
          settings: getAudioSettings(),
          contextState: audioContextState(),
          onChange: (patch) => {
            updateAudioSettings(patch);
            render();
          },
          // 試聴は、設定を変えた直後にその場で確かめられることが大事
          onTest: () => playSfx("select", 1),
        },
        onExportSave: handleExportSave,
        onImportSave: handleImportSave,
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

    case "SHOP":
      content = renderShop({
        player: state.player,
        shop: getShop(state.player),
        notice: state.shopNotice,
        onBuy: (slotIndex) => {
          const result = buyShopEntry(state.player, slotIndex);
          state.shopNotice = result.ok ? (result.label ?? "購入しました") : (result.reason ?? "購入できませんでした");
          if (result.ok) savePlayerState(state.player);
          render();
        },
        onUnlockSlot: () => {
          const result = unlockShopSlot(state.player);
          state.shopNotice = result.ok ? "枠を1つ増やしました" : (result.reason ?? "開放できませんでした");
          if (result.ok) savePlayerState(state.player);
          render();
        },
      });
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

    case "GOLD_DUNGEON":
      content = renderGoldDungeon({
        player: state.player,
        selectedFloor: state.selectedGoldDungeonFloor,
        onSelectFloor: (floor) => {
          state.selectedGoldDungeonFloor = floor;
          render();
        },
        onStartFloor: startGoldDungeonFloor,
        onGoParty: () => navigate("PARTY"),
        autoFarmCount: state.autoFarmCount,
        onChangeAutoFarmCount: (count) => {
          state.autoFarmCount = count;
          render();
        },
        onAutoFarm: handleAutoFarmGoldDungeon,
      });
      break;

    case "GOLD_DUNGEON_BATTLE": {
      showNav = false;
      const handle = renderCurrentGoldDungeonBattle();
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
      if (id === null && state.equipmentReturnMonsterId) {
        const monsterId = state.equipmentReturnMonsterId;
        state.equipmentReturnMonsterId = null;
        state.equipmentDetailId = null;
        state.monsterDetailId = monsterId;
        state.screen = "MONSTERS";
        render();
        return;
      }
      state.equipmentDetailId = id;
      state.equipmentReturnMonsterId = null;
      render();
    },
    onEquip: handleEquip,
    onUnequip: handleUnequipFromEquipmentScreen,
    onEnhance: handleEnhanceEquipment,
    onSell: handleSellEquipment,
    onCancelPicker: () => {
      state.equipmentPickerContext = null;
      state.screen = "MONSTERS";
      render();
    },
    onGoDungeon: () => navigate("EQUIP_DUNGEON"),
    sortKey: state.equipmentSortKey,
    selectedIds: state.equipmentSelectedIds,
    selecting: state.equipmentSelecting,
    onChangeSort: (key) => {
      state.equipmentSortKey = key;
      render();
    },
    onToggleSelecting: () => {
      state.equipmentSelecting = !state.equipmentSelecting;
      // 選択モードを抜ける時は選択も捨てる。残しておくと次に入った時に
      // 身に覚えのない選択が残っていて事故になる
      if (!state.equipmentSelecting) state.equipmentSelectedIds = [];
      render();
    },
    onToggleSelected: (equipmentId) => {
      state.equipmentSelectedIds = state.equipmentSelectedIds.includes(equipmentId)
        ? state.equipmentSelectedIds.filter((id) => id !== equipmentId)
        : [...state.equipmentSelectedIds, equipmentId];
      render();
    },
    onSelectAllShown: (ids) => {
      state.equipmentSelectedIds = ids;
      render();
    },
    onClearSelection: () => {
      state.equipmentSelectedIds = [];
      render();
    },
    onBulkSell: handleBulkSellEquipment,
  });
}

/**
 * データを端末へ書き出す。
 *
 * 保存先がブラウザの中だけだと、「サイトのデータを削除」で予告なく全部消える。
 * 実際にそれで手持ちを全て失う事故が起きたので、控えを取れる経路を必ず残す。
 */
function handleExportSave(): void {
  const text = serializeSaveFile(state.player);
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = saveFileName();
  document.body.append(link);
  link.click();
  link.remove();
  // 解放が早すぎると保存に失敗する端末があるので、少し待ってから捨てる
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * 控えから読み込む。
 *
 * **読み込みは今の手持ちを丸ごと置き換える。** 取り違えると二次被害になるので、
 * 中身の概要を見せて確認を取ってから差し替える。
 */
function handleImportSave(file: File): void {
  void file.text().then((text) => {
    const result = parseSaveFile(text);
    if (!result.ok) {
      window.alert(`読み込めませんでした。\n\n${result.reason}`);
      return;
    }
    const ok = window.confirm(
      `このデータで今の状態を置き換えますか?\n\n${describeSaveFile(result.file)}\n\n※ 今遊んでいるデータは失われます。`,
    );
    if (!ok) return;
    state.player = normalizeLoadedState(result.file.state);
    savePlayerState(state.player);
    render();
    window.alert("データを読み込みました。");
  });
}

render();
