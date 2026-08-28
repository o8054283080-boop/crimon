import "./style.css";
import { audioContextState, BgmScene, getAudioSettings, initAudio, playBgm, playSfx, updateAudioSettings } from "./audio/index.js";
import { registerSW } from "virtual:pwa-register";
import { BattleEngine } from "../battle/engine.js";
import { equipmentSellPrice, EquipSlot } from "../core/equipment.js";
import { DUNGEON_STAMINA_COST, GOLD_DUNGEON_STAMINA_COST, LEVEL_DUNGEON_STAMINA_COST, STAGE_STAMINA_COST } from "../core/fighterLevel.js";
import { MonsterInstance } from "../core/monsterInstance.js";
import { DungeonFloor, EQUIPMENT_DUNGEON_FLOORS } from "../data/equipmentDungeon.js";
import { GoldDungeonFloor, GOLD_DUNGEON_FLOORS } from "../data/goldDungeon.js";
import { LevelDungeonDef, LevelDungeonTier, LEVEL_DUNGEON_DEFS } from "../data/levelDungeon.js";
import { Difficulty, DIFFICULTY_JA, Stage, STAGES } from "../data/stages.js";
import { summonTutorial, SUMMON_COST_SINGLE, SUMMON_COST_TEN, SummonResult, summonMany, SpecialSummonScroll, useSpecialSummonScroll } from "../game/gacha.js";
import { setupDungeonBattle } from "../game/dungeonRunner.js";
import { AutoFarmResult, AutoFarmStopReason, emptyResult, farmBlockReason, mergeReward } from "../game/autoFarm.js";
import { BackgroundFarmJob, MAX_OFFLINE_FARM_MS, availableBackgroundRuns, createBackgroundFarmJob, dismissFinishedBackgroundFarm, finishBackgroundFarm, parseRequestedRuns, shouldStopForJstDateChange } from "../game/backgroundAutoFarm.js";
import { manualClearKey, recordManualBattle, referenceRunTime } from "../game/manualClearTimes.js";
import {
  PersistState,
  backupTakenAt,
  ensurePersistentStorage,
  readStartupBackup,
  takeStartupBackup,
} from "../game/saveDurability.js";
import { TOWER_FLOOR_COUNT, TOWER_TRAIT_LABEL } from "../data/trialTower.js";
import {
  TowerBattleSetup,
  TowerRewardResult,
  applyTowerFloorResult,
  beginTowerRun,
  abandonTowerRun,
  describeTowerRun,
  getTowerParty,
  nextTowerFloor,
  setupTowerBattle,
  spendTowerStamina,
  towerBlockReason,
} from "../game/trialTower.js";
import { renderTrialTower } from "./views/trialTower.js";
import {
  ClearRewardResult,
  applyDungeonClearRewards,
  applyGoldDungeonClearRewards,
  applyLevelDungeonClearRewards,
  applyStageClearRewards,
} from "../game/rewards.js";
import { applyMonsterPowerUp, checkMonsterPowerUp } from "../game/monsterPowerUp.js";
import { CreateSlot, applyMonsterCreate, clearMonsterCreate, describeCreatedSkill } from "../game/monsterCreate.js";
import { awakenLatentAbility, LATENT_ABILITY_CANDIDATES, reawakenLatentAbility, reincarnateMonsterType, resetAbilityPoints, setAbilityPoint } from "../game/monsterDevelopment.js";
import { AllocatableStat, MONSTER_TYPE_DESCRIPTIONS, MONSTER_TYPE_LABELS, MonsterType } from "../core/monsterDevelopment.js";
import {
  claimDailyLoginBonus,
  FIGHTER_NAME_MAX_LENGTH,
  LoginBonusResult,
  PlayerState,
  addMonster,
  applyPassiveStaminaRegen,
  buyShopEntry,
  equipToMonster,
  ensureTowerMonthlyState,
  getShop,
  getDungeonParty,
  MAX_DUNGEON_PARTY_SIZE,
  getParty,
  loadPlayerState,
  normalizeLoadedState,
  removeMonsters,
  savePlayerState,
  sellEquipment,
  setFighterName,
  toggleDungeonPartyMember,
  toggleTowerPartyMember,
  trySpendLevelDungeonChallenge,
  levelDungeonChallengesRemaining,
  tryEnhanceEquipment,
  tryRefillStaminaFull,
  tryRefillStaminaPartial,
  trySpendGoldDungeonChallenge,
  trySpendStamina,
  trySpendSummonScrolls,
  unlockShopSlot,
  goldDungeonChallengesRemaining,
  isStageCleared,
  isDungeonFloorCleared,
  isLevelDungeonTierCleared,
} from "../game/playerState.js";
import { MonsterSortKey, monsterPower } from "../game/monsterSort.js";
import { findMonsterById } from "../data/monsters.js";
import { EMPTY_MONSTER_FILTER, MonsterFilter } from "./monsterFilter.js";
import { applyRankUp, checkRankUp } from "../game/progression.js";
import { extractSurvivors, setupWaveBattle } from "../game/stageRunner.js";
import { renderBottomNav, ScreenName } from "./views/bottomNav.js";
import { renderShop } from "./views/shop.js";
import { describeSaveFile, parseSaveFile, saveFileName, serializeSaveFile } from "../game/saveFile.js";
import { CompensationClaim, claimCompensations } from "../game/compensation.js";
import { renderAutoFarmResult } from "./views/autoFarmResult.js";
import { loadNavigationState, saveNavigationState } from "./navigationState.js";
import { ResultAction } from "./views/resultActions.js";
import { BattleChainInfo, BattleViewHandle, renderBattleView } from "./views/battleView.js";
import { EquipmentPickerContext, EquipmentSortKey, renderEquipment } from "./views/equipment.js";
import { renderEquipmentDungeon } from "./views/equipmentDungeon.js";
import { renderGoldDungeon } from "./views/goldDungeon.js";
import { renderHome } from "./views/home.js";
import { TutorialDestination, claimTutorialMission } from "../game/tutorialMissions.js";
import { renderLevelDungeon } from "./views/levelDungeon.js";
import { renderMonsterDex } from "./views/monsterDex.js";
import { renderPvpArena } from "./views/pvpArena.js";
import { renderHowToPlay } from "./views/howToPlay.js";
import { ArenaTeamSlot } from "./views/pvpArena.js";
import {
  advanceArenaOpponentSeed,
  applyArenaTicketRegen,
  ArenaOpponent,
  ArenaPeriodSettlement,
  generateArenaOpponents,
  getArenaTeam,
  resolveArenaMatch,
  settleArenaPeriod,
  setupArenaBattle,
  toggleArenaTeamMember,
  tryRefillArenaTickets,
  trySpendArenaTicket,
} from "../game/pvpArena.js";
import { renderMonsters } from "./views/monsters.js";
import { PartyEditMode, renderParty } from "./views/party.js";
import { renderMonsterTraining } from "./views/monsterTraining.js";
import { CreateMenu, renderMonsterCreate } from "./views/monsterCreate.js";
import { renderStages } from "./views/stages.js";
import { StageResultInfo, StageResultLevelUp, renderStageResult } from "./views/stageResult.js";
import { renderSummon } from "./views/summon.js";
import { el } from "./dom.js";
import { PwaUpdateController } from "./pwaUpdate.js";

let appMounted = false;
const pwaUpdate = new PwaUpdateController(
  typeof navigator === "undefined" ? null : navigator.serviceWorker,
  () => { if (appMounted) render(); },
  () => window.location.reload(),
);

const updateWorker = registerSW({
  immediate: true,
  onNeedRefresh() { pwaUpdate.announce(); },
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    // 起動時点ですでに waiting なら、updatefound の再発火を待たず表示する。
    if (registration.waiting) pwaUpdate.announce();
    const checkForUpdate = () => {
      // オフライン時の更新確認失敗はゲーム進行と無関係。未処理rejectionにしない。
      void registration.update().catch(() => undefined);
    };
    // 開きっぱなしで遊んでいる間に配信された更新も拾えるよう、定期的に確認する
    setInterval(checkForUpdate, 30 * 60 * 1000);
    // 画面に戻ってきた時も確認する。放置していた端末はこちらの方が早く気付く
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") checkForUpdate();
    });
  },
});
pwaUpdate.setUpdateWorker(updateWorker);

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
  manualStartedAt: number;
}

interface DungeonRunState {
  floor: DungeonFloor;
  partyInstances: MonsterInstance[];
  manualStartedAt: number;
}

interface LevelDungeonRunState {
  def: LevelDungeonDef;
  partyInstances: MonsterInstance[];
  manualStartedAt: number;
}

interface GoldDungeonRunState {
  floor: GoldDungeonFloor;
  partyInstances: MonsterInstance[];
  manualStartedAt: number;
}

/**
 * 直前に挑んだ場所。
 *
 * 結果画面から**同じ場所へ1手で戻る**ために覚えておく。
 * これが無かったため、周回のたびに「ホーム → タブ → 一覧を探す → 選ぶ → 挑戦」と
 * 4〜6手を繰り返させていた。
 */
type LastRun =
  | { kind: "STAGE"; stage: Stage; difficulty: Difficulty }
  | { kind: "EQUIP_DUNGEON"; floor: DungeonFloor }
  | { kind: "LEVEL_DUNGEON"; def: LevelDungeonDef }
  | { kind: "GOLD_DUNGEON"; floor: GoldDungeonFloor }
  | { kind: "ARENA"; opponent: ArenaOpponent };

/** 進行中のアリーナ1戦 */
interface ArenaRun {
  opponent: ArenaOpponent;
  partyInstances: MonsterInstance[];
}

/**
 * 直前に登った階の決着。塔の画面はこれを見て「何が起きて戻ってきたか」を出す。
 *
 * **どれも「戻ってきた理由」が違う。**節を越えたのと力尽きたのを同じ扱いにすると、
 * 次にやることが分からないまま同じボタンだけが残る。
 */
type TowerOutcome = {
  kind: "CHECKPOINT" | "WIPED" | "COMPLETED" | "PAUSED";
  /** その決着がついた階 */
  floor: number;
  reward: TowerRewardResult;
};

/**
 * 進行中の周回。
 *
 * 以前はここで戦闘を実行せずに決着だけ出して集計画面へ飛ばしていた。
 * 10回まとめて挑むと**一瞬で終わり、戦闘画面を一度も見ないまま遊べた**ため取りやめ、
 * 1戦ずつ実際に戦闘画面で戦って、勝つたびに自動で次の1戦へ送る形にした。
 * 1戦ごとの成果は `result` に積み、最後にまとめて見せる。
 */
interface FarmRun {
  /** まとめて挑むと決めた回数 */
  total: number;
  /** 集計画面に出す場所の名前(周回の途中で選び直せないよう、始めた時に固定する) */
  targetName: string;
  result: AutoFarmResult;
  /** ⏹ が押された。今の1戦を終えたら切り上げる */
  stopRequested: boolean;
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
  /** 所持モンスターの並べ替えの軸 */
  monsterSortKey: MonsterSortKey;
  /** 所持モンスターの絞り込み条件。所持一覧と編成画面で共有する(同じ探し方で通す) */
  monsterFilter: MonsterFilter;
  /** 絞り込みの札を開いているか */
  monsterFilterOpen: boolean;
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
  /* --- アリーナ --- */
  /** 編成を編集中の枠。null なら対戦相手の一覧 */
  arenaEditing: ArenaTeamSlot | null;
  arenaRun: ArenaRun | null;
  arenaNotice: string | null;
  /** 期間が変わった時に出す前の期のまとめ報酬。受け取るまで残す */
  arenaSettlement: ArenaPeriodSettlement | null;
  monsterTrainingTargetId: string | null;
  monsterTrainingMaterialIds: string[];
  /** クリエイト(スキル合成)の対象・素材・移し替える枠 */
  createTargetId: string | null;
  createMaterialId: string | null;
  createSlot: CreateSlot | null;
  createNotice: string | null;
  createMenu: CreateMenu;
  reawakenConfirmOpen: boolean;
  partyEditMode: PartyEditMode;
  autoFarmCount: number;
  /** 周回の途中。null なら単発の挑戦 */
  farmRun: FarmRun | null;
  /* --- 試練の塔 --- */
  /** 塔の画面に出す案内(スタミナ切れ・編成が空など)。次の操作まで残す */
  towerNotice: string | null;
  /** 直前の階の決着。塔の画面へ戻った理由と、受け取った報酬を伝える */
  towerOutcome: TowerOutcome | null;
  /** 戦闘画面の ⏹ が押された。今の階を終えたら登坂を止める */
  towerStopRequested: boolean;
  autoFarmResult: AutoFarmResult | null;
  autoFarmTargetName: string;
  /** 結果確認後に通知だけを閉じる対象。報酬データとは独立して扱う。 */
  viewingBackgroundFarmJobId: string | null;
  loginBonusResult: LoginBonusResult | null;
  /** 起動時に受け取ったお詫び配布。閉じるまでホームに出す */
  compensationClaims: CompensationClaim[];
  /** 直前に挑んだ場所。結果画面の「もう一度」の行き先になる */
  lastRun: LastRun | null;
  /** 編成画面での直前の操作の結果。次の操作まで出しておく */
  partyNotice: string | null;
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
  monsterSortKey: "recommended",
  monsterFilter: { ...EMPTY_MONSTER_FILTER },
  monsterFilterOpen: false,
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
  arenaEditing: null,
  arenaRun: null,
  arenaNotice: null,
  arenaSettlement: null,
  monsterTrainingTargetId: null,
  monsterTrainingMaterialIds: [],
  createTargetId: null,
  createMaterialId: null,
  createSlot: null,
  createNotice: null,
  createMenu: "SKILL",
  reawakenConfirmOpen: false,
  partyEditMode: "NORMAL",
  autoFarmCount: 10,
  farmRun: null,
  towerNotice: null,
  towerOutcome: null,
  towerStopRequested: false,
  autoFarmResult: null,
  autoFarmTargetName: "",
  viewingBackgroundFarmJobId: null,
  loginBonusResult: null,
  compensationClaims: [],
  lastRun: null,
  partyNotice: null,
};

// ゲームセーブとは別のキーから画面だけを復元する。対象が消えていた詳細画面は安全な一覧へ戻す。
{
  const restored = loadNavigationState();
  if (restored) {
    state.screen = restored.screen;
    if (restored.monsterDetailId && state.player.monsters.some((m) => m.id === restored.monsterDetailId)) {
      state.monsterDetailId = restored.monsterDetailId;
    }
    if (restored.equipmentDetailId && state.player.equipment.some((e) => e.id === restored.equipmentDetailId)) {
      state.equipmentDetailId = restored.equipmentDetailId;
    }
    if (restored.selectedDexEntryId) state.selectedDexEntryId = restored.selectedDexEntryId;
    if (restored.monsterTrainingTargetId && state.player.monsters.some((m) => m.id === restored.monsterTrainingTargetId)) {
      state.monsterTrainingTargetId = restored.monsterTrainingTargetId;
    } else if (state.screen === "MONSTER_TRAINING") state.screen = "MONSTERS";
    if (restored.createTargetId && state.player.monsters.some((m) => m.id === restored.createTargetId)) {
      state.createTargetId = restored.createTargetId;
    } else if (state.screen === "MONSTER_CREATE") state.screen = "MONSTERS";
  }
}

/**
 * ブラウザが勝手にデータを消さない設定になっているか。
 *
 * 頼む処理は非同期なので、最初の描画には間に合わない。
 * 分かった時点で控えの案内だけを描き直す(画面全体を作り直す必要は無い)。
 */
let persistState: PersistState = "UNSUPPORTED";

{
  // **起動のたびに1回だけ**。保存のたびに取り直すと、壊れた状態で数回保存された時点で
  // 控えまで壊れた状態に置き換わり、戻り先が無くなる
  takeStartupBackup(state.player);
  void ensurePersistentStorage().then((result) => {
    if (result === persistState) return;
    persistState = result;
    render();
  });

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

  // アリーナ。期が変わっていれば前の期のまとめ報酬を精算し、
  // 挑戦券の自然回復を反映する(起動のたびに1度だけ)
  const settlement = settleArenaPeriod(state.player);
  if (settlement) state.arenaSettlement = settlement;
  applyArenaTicketRegen(state.player);
  if (settlement) savePlayerState(state.player);
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

function persistNavigationState(): void {
  saveNavigationState({
    screen: state.screen,
    monsterDetailId: state.monsterDetailId ?? undefined,
    equipmentDetailId: state.equipmentDetailId ?? undefined,
    selectedDexEntryId: state.selectedDexEntryId ?? undefined,
    monsterTrainingTargetId: state.monsterTrainingTargetId ?? undefined,
    createTargetId: state.createTargetId ?? undefined,
  });
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
  state.viewingBackgroundFarmJobId = null;
  // 旧式の戦闘画面連鎖だけを破棄する。保存型ジョブは別画面でも継続する。
  state.farmRun = null;
  // 塔の案内は次の画面へ持ち越さない。**登坂そのもの(trialTowerRun)は消さない**
  // ――あれは控えに残る進みで、画面を移っただけで捨ててはいけない
  state.towerNotice = null;
  state.towerOutcome = null;
  state.towerStopRequested = false;
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
  if (!result.ok) {
    // ゴールド不足や最大強化。**なぜ押せなかったかは画面に出ているので、
    // 音は「効かなかった」ことだけを伝えればよい**
    playSfx("denied", 0.7);
    return;
  }
  savePlayerState(state.player);
  playSfx("enhance", 0.9);
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
  if (state.player.crystal < cost) {
    playSfx("denied", 0.7);
    return;
  }
  state.player.crystal -= cost;
  const results = summonMany(count);
  for (const r of results) addMonster(state.player, r.dexId, r.star);
  savePlayerState(state.player);
  state.summonResults = results;
  playSummonSfx(results);
  render();
}

/**
 * はじまりの10連。1度きり、無料。
 *
 * 引いた印は**結果を出す前に立てて保存する。**ここを後回しにすると、
 * 演出中に閉じられた時に印だけが残らず、何度でも引けてしまう。
 */
function handleTutorialSummon(): void {
  if (state.player.tutorialSummonDone) return;
  state.player.tutorialSummonDone = true;
  const results = summonTutorial();
  for (const r of results) addMonster(state.player, r.dexId, r.star);
  savePlayerState(state.player);
  state.summonResults = results;
  playSummonSfx(results);
  render();
}

/**
 * 召喚の音。**当たった時だけ音が変わる**ようにする。
 *
 * 引く音が毎回同じだと、結果を見る前から「またハズレか」と分かってしまい、
 * 逆に音が結果を先に漏らすと演出が死ぬ。ここでは開く音は共通にして、
 * 高レアが入っている時だけ、開いたあとに層を重ねる。
 */
function playSummonSfx(results: SummonResult[]): void {
  playSfx("summon", 0.9);
  if (results.some((r) => r.star >= 5 || r.isRare)) playSfx("summonRare", 0.75);
}

/**
 * 召喚の書で引く。10枚あれば10連にでき、ダイヤの10連と同じ★4以上確定が付く
 * (書を10枚ためた人が、ばら引きより損をする形にはしない)。
 */
function handleUseSummonScroll(count: number): void {
  if (!trySpendSummonScrolls(state.player, count)) {
    playSfx("denied", 0.7);
    return;
  }
  const results = summonMany(count);
  for (const r of results) addMonster(state.player, r.dexId, r.star);
  savePlayerState(state.player);
  state.summonResults = results;
  playSummonSfx(results);
  render();
}

function handleUseSpecialSummonScroll(type: SpecialSummonScroll): void {
  const result = useSpecialSummonScroll(state.player, type);
  if (!result) { playSfx("denied", 0.7); return; }
  savePlayerState(state.player);
  state.summonResults = [result];
  playSummonSfx([result]);
  render();
}

function handleConfirmRankUp(): void {
  const target = state.player.monsters.find((m) => m.id === state.monsterDetailId);
  if (!target) return;
  const sacrifices = state.rankUpSacrificeIds
    .map((id) => state.player.monsters.find((m) => m.id === id))
    .filter((m): m is MonsterInstance => m !== undefined);
  const check = checkRankUp(target, sacrifices, state.player.partyIds);
  if (!check.ok) {
    playSfx("denied", 0.7);
    return;
  }

  applyRankUp(target, sacrifices);
  playSfx("levelUp");
  removeMonsters(state.player, state.rankUpSacrificeIds);
  savePlayerState(state.player);
  state.rankUpMode = false;
  state.rankUpSacrificeIds = [];
  render();
}

/**
 * クリエイトを実行する。
 *
 * **素材は消える。**押した後で取り消せないので、断る時は理由を必ず言葉で返す
 * (押せないボタンだけを出すと、何を満たせばよいのかが分からない)。
 */
function handleConfirmMonsterCreate(): void {
  const target = state.player.monsters.find((m) => m.id === state.createTargetId);
  const material = state.player.monsters.find((m) => m.id === state.createMaterialId);
  const slot = state.createSlot;
  if (!target || !material || slot === null) return;

  const result = applyMonsterCreate(target, material, slot, state.player.partyIds, state.player.dungeonPartyIds);
  if (!result.ok) {
    playSfx("denied", 0.7);
    state.createNotice = result.reason ?? "クリエイトできませんでした";
    render();
    return;
  }

  // 中核は対象の書き換えだけを行う。手持ちからの取り除きはこちらの責任
  removeMonsters(state.player, [material.id]);
  savePlayerState(state.player);
  playSfx("levelUp");

  const replaced = result.replaced ? `(${describeCreatedSkill(result.replaced)} は失われました)` : "";
  state.createNotice = `${describeCreatedSkill(result.created!)} ${replaced}`.trim();
  state.createMaterialId = null;
  state.createSlot = null;
  render();
}

function handleClearMonsterCreate(): void {
  const target = state.player.monsters.find((m) => m.id === state.createTargetId);
  if (!target || !clearMonsterCreate(target)) return;
  savePlayerState(state.player);
  playSfx("tap");
  state.createNotice = "移し替えを取り消し、元のスキルへ戻しました";
  render();
}

function handleConfirmMonsterTraining(): void {
  const target = state.player.monsters.find((m) => m.id === state.monsterTrainingTargetId);
  if (!target) return;
  const materials = state.monsterTrainingMaterialIds
    .map((id) => state.player.monsters.find((m) => m.id === id))
    .filter((m): m is MonsterInstance => m !== undefined);
  const check = checkMonsterPowerUp(target, materials, state.player.partyIds);
  if (!check.ok) {
    playSfx("denied", 0.7);
    return;
  }

  applyMonsterPowerUp(target, materials);
  playSfx("levelUp");
  removeMonsters(state.player, state.monsterTrainingMaterialIds);
  savePlayerState(state.player);
  state.monsterTrainingTargetId = null;
  state.monsterTrainingMaterialIds = [];
  state.monsterDetailId = target.id;
  state.screen = "MONSTERS";
  render();
}

const MAX_NORMAL_PARTY_SIZE = 4;

function handleToggleParty(instanceId: string): void {
  const idx = state.player.partyIds.indexOf(instanceId);
  if (idx >= 0) {
    state.player.partyIds.splice(idx, 1);
    state.partyNotice = null;
  } else {
    if (state.player.partyIds.length >= MAX_NORMAL_PARTY_SIZE) {
      // 黙って何も起きないと「押したのに反応しない壊れた画面」に見える。
      // 何が起きたか・どうすれば入るかを必ず出す
      playSfx("denied", 0.7);
      state.partyNotice = `パーティは${MAX_NORMAL_PARTY_SIZE}体までです。上の枠を押して外してから選んでください。`;
      render();
      return;
    }
    state.player.partyIds.push(instanceId);
    state.partyNotice = null;
  }
  state.player.tutorialMissions.partyChanged = true;
  savePlayerState(state.player);
  render();
}

function handleToggleDungeonPartyMember(instanceId: string): void {
  const before = state.player.dungeonPartyIds.length;
  const wasMember = state.player.dungeonPartyIds.includes(instanceId);
  toggleDungeonPartyMember(state.player, instanceId);
  if (!wasMember && state.player.dungeonPartyIds.length === before) {
    playSfx("denied", 0.7);
    state.partyNotice = `ダンジョン専用パーティは${MAX_DUNGEON_PARTY_SIZE}体までです。上の枠を押して外してから選んでください。`;
    render();
    return;
  }
  state.partyNotice = null;
  savePlayerState(state.player);
  render();
}

function handleToggleTowerPartyMember(instanceId: string): void {
  // 登坂の途中で顔ぶれが変わると、持ち越しているHPとクールタイムの持ち主が入れ替わる。
  // **登坂中は編成を触らせない。**外した1体が塔の中でだけ生き続ける、という状態を作らない
  if (state.player.trialTowerRun) {
    playSfx("denied", 0.7);
    state.partyNotice = "登坂の途中は編成を変えられません。塔の画面で登坂をやめてください。";
    render();
    return;
  }
  const before = state.player.towerPartyIds.length;
  const wasMember = state.player.towerPartyIds.includes(instanceId);
  toggleTowerPartyMember(state.player, instanceId);
  if (!wasMember && state.player.towerPartyIds.length === before) {
    playSfx("denied", 0.7);
    state.partyNotice = `塔の編成は${MAX_DUNGEON_PARTY_SIZE}体までです。上の枠を押して外してから選んでください。`;
    render();
    return;
  }
  state.partyNotice = null;
  savePlayerState(state.player);
  render();
}

/**
 * 空いている枠を、強い順に自動で埋める。
 *
 * 手持ちが数十体になると、1体ずつ選ぶだけで何十手もかかる。
 * 素材専用のモンスター(転生ピッグなど)は編成しても意味が無いので外す。
 */
/** いま編集している枠の中身。3つの枠(通常/装備ダンジョン/塔)で同じ操作を通す */
function editingPartyIds(): string[] {
  if (state.partyEditMode === "DUNGEON") return state.player.dungeonPartyIds;
  if (state.partyEditMode === "TOWER") return state.player.towerPartyIds;
  return state.player.partyIds;
}

function handleAutoFillParty(): void {
  const ids = editingPartyIds();
  const maxSize = state.partyEditMode === "NORMAL" ? MAX_NORMAL_PARTY_SIZE : MAX_DUNGEON_PARTY_SIZE;

  const candidates = state.player.monsters
    .filter((m) => !ids.includes(m.id) && findMonsterById(m.dexId)?.role !== "素材")
    .sort((a, b) => monsterPower(b) - monsterPower(a));

  const added = candidates.slice(0, Math.max(0, maxSize - ids.length));
  if (added.length === 0) {
    playSfx("denied", 0.7);
    state.partyNotice = "編成できるモンスターがいません。";
    render();
    return;
  }
  for (const monster of added) ids.push(monster.id);
  savePlayerState(state.player);
  state.partyNotice = `総合力の高い${added.length}体を編成しました。`;
  render();
}

function handleClearParty(): void {
  const ids = editingPartyIds();
  ids.length = 0;
  savePlayerState(state.player);
  state.partyNotice = "編成を全部外しました。";
  render();
}

function startStage(stage: Stage, difficulty: Difficulty): void {
  if (state.player.backgroundFarmJob?.status === "RUNNING") { playSfx("denied", 0.7); return; }
  const party = getParty(state.player);
  if (party.length === 0) return;
  if (!trySpendStamina(state.player, STAGE_STAMINA_COST).ok) {
    playSfx("denied", 0.7);
    return;
  }
  savePlayerState(state.player);
  state.lastRun = { kind: "STAGE", stage, difficulty };
  state.stageRun = {
    stage,
    difficulty,
    waveIndex: 0,
    originalPartyIds: party.map((p) => p.id),
    currentPartyInstances: party,
    carryHp: null,
    goldEarned: 0,
    wavesCleared: 0,
    manualStartedAt: Date.now(),
  };
  state.screen = "BATTLE";
  render();
}

/**
 * 報酬画面へ移る。
 *
 * **ここで鳴らす。画面の描画側で鳴らしてはいけない。** 報酬画面は状態が
 * 変わるたびに描き直されるので、描画のたびに鳴らすと同じ音が何度も出る。
 *
 * 負けた時は鳴らさない。戦闘が終わった時点で敗北の音が鳴っており、
 * そこへ重ねても「終わった」以上のことは伝わらない。
 */
function enterStageResult(): void {
  if (state.stageResult?.cleared) playSfx("stageClear");
  state.screen = "STAGE_RESULT";
  render();
}

/** 直前に挑んだ場所の1回あたりの消費スタミナ */
function lastRunStaminaCost(last: LastRun): number {
  switch (last.kind) {
    case "STAGE":
      return STAGE_STAMINA_COST;
    case "EQUIP_DUNGEON":
      return DUNGEON_STAMINA_COST;
    case "LEVEL_DUNGEON":
      return LEVEL_DUNGEON_STAMINA_COST;
    case "GOLD_DUNGEON":
      return GOLD_DUNGEON_STAMINA_COST;
    case "ARENA":
      // アリーナは挑戦券で回すのでスタミナは要らない
      return 0;
  }
}

/**
 * 「もう一度」が押せない理由。
 *
 * **押せないボタンだけを出して理由を伏せない。** スタミナ切れなのか
 * 編成が空なのかが分からないと、次に何をすればいいかが決められない。
 */
function retryBlockedReason(last: LastRun): string | null {
  if (last.kind === "ARENA") {
    if (getArenaTeam(state.player, "OFFENSE").length === 0) return "攻撃編成が組まれていません";
    applyArenaTicketRegen(state.player);
    if (state.player.arenaTickets <= 0) return "挑戦券が足りません(時間で回復します)";
    return null;
  }
  const party = last.kind === "EQUIP_DUNGEON" ? getDungeonParty(state.player) : getParty(state.player);
  if (party.length === 0) return "パーティが編成されていません";
  const cost = lastRunStaminaCost(last);
  if (state.player.stamina < cost) return `スタミナが足りません(⚡${cost}必要 / 手持ち⚡${state.player.stamina})`;
  if (last.kind === "GOLD_DUNGEON" && goldDungeonChallengesRemaining(state.player) <= 0) {
    return "本日の挑戦回数の上限に達しています";
  }
  if (last.kind === "LEVEL_DUNGEON" && levelDungeonChallengesRemaining(state.player) <= 0) {
    return "本日の挑戦回数の上限に達しています";
  }
  return null;
}

/** 同じ場所へもう1回挑む。始められなければ何もしない(理由は各 start が伝える) */
function startFromLastRun(last: LastRun): void {
  switch (last.kind) {
    case "STAGE":
      startStage(last.stage, last.difficulty);
      break;
    case "EQUIP_DUNGEON":
      startDungeonFloor(last.floor);
      break;
    case "LEVEL_DUNGEON":
      startLevelDungeonTier(last.def);
      break;
    case "GOLD_DUNGEON":
      startGoldDungeonFloor(last.floor);
      break;
    case "ARENA":
      startArenaMatch(last.opponent);
      break;
  }
}

/** 直前と同じ場所へもう一度挑む */
function retryLastRun(): void {
  const last = state.lastRun;
  if (!last) return;
  const before = state.screen;
  startFromLastRun(last);
  // 始められなかった時は結果画面に留める(黙って消えると何が起きたか分からない)
  if (state.screen === before) render();
}

/** 直前に挑んだ場所の一覧へ戻る。別の階/別の難易度を選び直すための道 */
function backToLastRunList(): void {
  const last = state.lastRun;
  if (!last) {
    navigate("HOME");
    return;
  }
  switch (last.kind) {
    case "STAGE":
      navigate("STAGES");
      break;
    case "EQUIP_DUNGEON":
      navigate("EQUIP_DUNGEON");
      break;
    case "LEVEL_DUNGEON":
      navigate("LEVEL_DUNGEON");
      break;
    case "GOLD_DUNGEON":
      navigate("GOLD_DUNGEON");
      break;
    case "ARENA":
      navigate("ARENA");
      break;
  }
}

/**
 * 結果画面の出口。
 *
 * 周回で押すのはほぼ「もう一度」なので、それを主役の位置に置く。
 * オート周回の結果なら、同じ回数でもう一周できるようにする。
 */
function buildResultActions(fromAutoFarm: boolean): ResultAction[] {
  const last = state.lastRun;
  const reason = last ? retryBlockedReason(last) : "挑戦した場所が分かりません";
  const cost = last ? lastRunStaminaCost(last) : 0;

  const actions: ResultAction[] = [];
  if (last) {
    actions.push({
      // アリーナはスタミナではなく挑戦券で回す。⚡0 と出すと「無料で回せる」と読めてしまう
      label: fromAutoFarm
        ? `🔁 もう一度 ×${state.autoFarmCount}`
        : last.kind === "ARENA"
          ? `🔁 もう一度 (挑戦券1)`
          : `🔁 もう一度 (⚡${cost})`,
      variant: "primary",
      disabled: reason !== null,
      reason: reason ?? undefined,
      run: () => {
        if (!fromAutoFarm) {
          retryLastRun();
          return;
        }
        switch (last.kind) {
          case "STAGE":
            handleAutoFarmStage(last.stage, state.autoFarmCount, last.difficulty);
            break;
          case "EQUIP_DUNGEON":
            handleAutoFarmDungeon(last.floor, state.autoFarmCount);
            break;
          case "LEVEL_DUNGEON":
            handleAutoFarmLevelDungeon(last.def, state.autoFarmCount);
            break;
          case "GOLD_DUNGEON":
            handleAutoFarmGoldDungeon(last.floor, state.autoFarmCount);
            break;
        }
      },
    });
  }
  actions.push({ label: "🗺 選び直す", run: backToLastRunList });
  actions.push({ label: "🏠 ホーム", run: () => navigate("HOME") });
  return actions;
}

/* ============================================================
 * 周回(まとめて何回も挑む)
 * ============================================================ */

let backgroundFarmTimer: number | null = null;

function backgroundParty(job: BackgroundFarmJob): MonsterInstance[] {
  return job.partyIds.map((id) => state.player.monsters.find((m) => m.id === id)).filter((m): m is MonsterInstance => Boolean(m));
}

function backgroundFarmCost(job: BackgroundFarmJob): number {
  if (job.kind === "STAGE") return STAGE_STAMINA_COST;
  if (job.kind === "EQUIP_DUNGEON") return DUNGEON_STAMINA_COST;
  if (job.kind === "LEVEL_DUNGEON") return LEVEL_DUNGEON_STAMINA_COST;
  return GOLD_DUNGEON_STAMINA_COST;
}

function scheduleBackgroundFarm(delay = 0): void {
  if (backgroundFarmTimer !== null) return;
  backgroundFarmTimer = window.setTimeout(() => {
    backgroundFarmTimer = null;
    processBackgroundFarmOnce();
  }, delay);
}

/** BattleEngine を1周だけ同期実行し、周と周の間は必ずイベントループへ戻す。 */
function simulateBackgroundBattle(job: BackgroundFarmJob, party: MonsterInstance[]): { won: boolean; waves: number; extraGold: number } {
  if (job.kind === "STAGE") {
    const stage = STAGES.find((s) => s.id === job.targetId)!;
    let alive = party;
    let hp: Map<string, number> | null = null;
    let waves = 0;
    for (const wave of stage.waves) {
      const setup = setupWaveBattle(alive, hp, wave, state.player.equipment, job.difficulty ?? "NORMAL");
      const engine = new BattleEngine(setup.playerDefs, setup.enemyDefs, { initialPlayerHp: setup.initialPlayerHp });
      if (engine.run().winner !== "PLAYER") return { won: false, waves, extraGold: waves * stage.rewards.waveGold };
      const survivors = extractSurvivors(engine, alive);
      alive = survivors.survivorInstances; hp = survivors.survivorHp; waves += 1;
    }
    return { won: true, waves, extraGold: waves * stage.rewards.waveGold };
  }
  const target = job.kind === "EQUIP_DUNGEON"
    ? EQUIPMENT_DUNGEON_FLOORS.find((f) => String(f.floor) === job.targetId)
    : job.kind === "LEVEL_DUNGEON"
      ? LEVEL_DUNGEON_DEFS.find((f) => f.tier === job.targetId)
      : GOLD_DUNGEON_FLOORS.find((f) => String(f.floor) === job.targetId);
  if (!target) return { won: false, waves: 0, extraGold: 0 };
  const setup = setupDungeonBattle(party, target, state.player.equipment);
  return { won: new BattleEngine(setup.playerDefs, setup.enemyDefs).run().winner === "PLAYER", waves: 1, extraGold: 0 };
}

function processBackgroundFarmOnce(): void {
  const job = state.player.backgroundFarmJob;
  if (!job || job.status !== "RUNNING") return;
  if (job.completedRuns >= job.requestedRuns) { finishBackgroundFarm(job, "COMPLETED"); savePlayerState(state.player); render(); return; }
  if (shouldStopForJstDateChange(job)) { finishBackgroundFarm(job, "DAILY_LIMIT"); savePlayerState(state.player); render(); return; }
  const party = backgroundParty(job);
  if (party.length !== job.partyIds.length || party.length === 0) { finishBackgroundFarm(job, "NO_PARTY"); savePlayerState(state.player); render(); return; }
  // 完全終了が8時間を超えても、復帰時に持ち越せる処理権は最大8時間ぶん。
  job.lastProcessedAt = Math.max(job.lastProcessedAt, Date.now() - MAX_OFFLINE_FARM_MS);
  const available = availableBackgroundRuns(job, Date.now());
  if (available < 1 && !job.inFlight) {
    const nextAt = job.lastProcessedAt + job.referenceRunSeconds * 1000;
    scheduleBackgroundFarm(Math.max(1, nextAt - Date.now()));
    return;
  }

  if (!job.inFlight) {
    const cost = backgroundFarmCost(job);
    const remaining = job.kind === "LEVEL_DUNGEON" ? levelDungeonChallengesRemaining(state.player)
      : job.kind === "GOLD_DUNGEON" ? goldDungeonChallengesRemaining(state.player) : undefined;
    const blocked = farmBlockReason({ partySize: party.length, stamina: state.player.stamina, staminaCost: cost, challengesLeft: remaining });
    if (blocked) { finishBackgroundFarm(job, blocked); savePlayerState(state.player); render(); return; }
    if (job.kind === "LEVEL_DUNGEON") trySpendLevelDungeonChallenge(state.player);
    if (job.kind === "GOLD_DUNGEON") trySpendGoldDungeonChallenge(state.player);
    trySpendStamina(state.player, cost);
    job.staminaSpent += cost;
    job.inFlight = true;
    job.status = "SETTLING";
    savePlayerState(state.player); // 支払い済みマーカーを報酬より先に永続化
    job.status = "RUNNING";
  }

  const battle = simulateBackgroundBattle(job, party);
  job.result.attempts += 1;
  if (!battle.won) { job.inFlight = false; finishBackgroundFarm(job, "DEFEAT"); savePlayerState(state.player); render(); return; }
  let reward: ClearRewardResult;
  if (job.kind === "STAGE") reward = applyStageClearRewards(state.player, STAGES.find((s) => s.id === job.targetId)!, battle.waves, party, job.difficulty);
  else if (job.kind === "EQUIP_DUNGEON") reward = applyDungeonClearRewards(state.player, EQUIPMENT_DUNGEON_FLOORS.find((f) => String(f.floor) === job.targetId)!, party);
  else if (job.kind === "LEVEL_DUNGEON") reward = applyLevelDungeonClearRewards(state.player, LEVEL_DUNGEON_DEFS.find((f) => f.tier === job.targetId)!, party);
  else reward = applyGoldDungeonClearRewards(state.player, GOLD_DUNGEON_FLOORS.find((f) => String(f.floor) === job.targetId)!, party);
  state.player.gold += battle.extraGold;
  mergeReward(job.result, reward, battle.extraGold);
  job.result.cleared += 1; job.completedRuns += 1; job.inFlight = false;
  // 実行にかかったCPU時間で権利を失わない。経過した基準時間を1周ぶんだけ消費する。
  job.lastProcessedAt = Math.min(Date.now(), job.lastProcessedAt + job.referenceRunSeconds * 1000);
  savePlayerState(state.player);
  render();
  scheduleBackgroundFarm(job.completedRuns >= job.requestedRuns || availableBackgroundRuns(job, Date.now()) > 0
    ? 0
    : Math.max(1, job.lastProcessedAt + job.referenceRunSeconds * 1000 - Date.now()));
}

function beginBackgroundFarm(input: Omit<Parameters<typeof createBackgroundFarmJob>[0], "partyIds">, partyIds: string[], unlocked: boolean): void {
  const count = parseRequestedRuns(input.requestedRuns);
  const currentStatus = state.player.backgroundFarmJob?.status;
  if (count === null || !unlocked || currentStatus === "RUNNING" || currentStatus === "SETTLING") { playSfx("denied", 0.7); return; }
  // 完了通知はここで新しいジョブに置き換える。報酬は完了時に既に player へ保存済み。
  const timing = referenceRunTime(state.player.recentManualClearTimes, input.kind, input.targetId, input.difficulty);
  state.player.backgroundFarmJob = createBackgroundFarmJob({ ...input, requestedRuns: count, partyIds, referenceRunSeconds: timing.seconds, referenceFromManual: timing.fromManual });
  savePlayerState(state.player);
  state.screen = "HOME";
  render(); scheduleBackgroundFarm();
}

/** いまの手持ちで、その場所へもう1回挑めるか(判定そのものは autoFarm.ts) */
function farmBlockReasonFor(last: LastRun): AutoFarmStopReason | null {
  const party = last.kind === "EQUIP_DUNGEON" ? getDungeonParty(state.player) : getParty(state.player);
  return farmBlockReason({
    partySize: party.length,
    stamina: state.player.stamina,
    staminaCost: lastRunStaminaCost(last),
    challengesLeft:
      last.kind === "GOLD_DUNGEON"
        ? goldDungeonChallengesRemaining(state.player)
        : last.kind === "LEVEL_DUNGEON"
          ? levelDungeonChallengesRemaining(state.player)
          : undefined,
  });
}

/** 周回を終えて集計画面へ移す */
function endFarmRun(farm: FarmRun, reason: AutoFarmStopReason): void {
  farm.result.stopReason = reason;
  state.autoFarmResult = farm.result;
  state.autoFarmTargetName = farm.targetName;
  state.farmRun = null;
  state.selectedStageId = null;
  state.selectedDungeonFloor = null;
  state.selectedLevelDungeonTier = null;
  state.selectedGoldDungeonFloor = null;
  state.screen = "AUTO_FARM_RESULT";
  render();
}

/**
 * 周回の途中なら、1戦ぶんの成果を積んで次へ送る。
 * 引き受けたら true(呼び出し元は単発の結果画面へ進まない)。
 *
 * `extraGold` はステージのウェーブ報酬のように、クリア報酬とは別に入るぶん。
 * 負けた回でも受け取っているので、クリアできなくても集計へ足す。
 */
function advanceFarmRun(cleared: boolean, reward: ClearRewardResult | null, extraGold: number): boolean {
  const farm = state.farmRun;
  if (!farm) return false;

  farm.result.attempts += 1;
  if (cleared && reward) {
    mergeReward(farm.result, reward, extraGold);
    farm.result.cleared += 1;
  } else {
    farm.result.totalGold += extraGold;
  }

  const last = state.lastRun;
  if (!cleared) {
    endFarmRun(farm, "DEFEAT");
    return true;
  }
  if (farm.stopRequested) {
    endFarmRun(farm, "STOPPED");
    return true;
  }
  if (farm.result.attempts >= farm.total || !last) {
    endFarmRun(farm, "COMPLETED");
    return true;
  }
  const blocked = farmBlockReasonFor(last);
  if (blocked) {
    endFarmRun(farm, blocked);
    return true;
  }

  startFromLastRun(last);
  return true;
}

/**
 * 周回を始める。
 *
 * 1戦目が始められなければ周回そのものを取り消す。理由は挑戦する側が
 * すでに伝えている(スタミナ切れの音、編成が空なら押せない)ので、
 * ここで空の集計画面を出すと「0回中0回クリア」だけが残って邪魔になる。
 */
function beginFarmRun(count: number, targetName: string, last: LastRun): void {
  state.farmRun = { total: Math.max(1, count), targetName, result: emptyResult(), stopRequested: false };
  const before = state.screen;
  startFromLastRun(last);
  if (state.screen === before) state.farmRun = null;
}

/** 戦闘画面へ渡す、周回の進み具合。周回中でなければ undefined */
function battleChainInfo(): BattleChainInfo | undefined {
  const farm = state.farmRun;
  if (!farm) return undefined;
  return {
    // attempts は1戦が終わるたびに増えるので、いま戦っているのは次の番号
    index: farm.result.attempts + 1,
    total: farm.total,
    stopped: farm.stopRequested,
    onStop: () => {
      if (state.farmRun) state.farmRun.stopRequested = true;
    },
  };
}

function finishStage(cleared: boolean): void {
  const run = state.stageRun;
  if (!run) return;
  const stage = run.stage;
  if (cleared) recordManualBattle(state.player.recentManualClearTimes, manualClearKey("STAGE", stage.id, run.difficulty), run.manualStartedAt, Date.now());

  const partyInstances = run.originalPartyIds
    .map((id) => state.player.monsters.find((m) => m.id === id))
    .filter((m): m is MonsterInstance => m !== undefined);
  const reward = cleared ? applyStageClearRewards(state.player, stage, run.wavesCleared, partyInstances, run.difficulty) : null;
  state.player.gold += run.goldEarned;
  savePlayerState(state.player);

  state.stageRun = null;
  if (advanceFarmRun(cleared, reward, run.goldEarned)) return;

  const difficultySuffix = run.difficulty === "NORMAL" ? "" : ` [${DIFFICULTY_JA[run.difficulty]}]`;
  state.stageResult = {
    cleared,
    stageName: `${stage.name}${difficultySuffix}`,
    goldEarned: run.goldEarned + (reward?.goldEarned ?? 0),
    crystalEarned: reward?.crystalEarned ?? 0,
    wavesCleared: run.wavesCleared,
    totalWaves: stage.waves.length,
    levelUps: reward?.levelUps ?? [],
    expAwards: reward?.expAwards ?? [],
    dropDexId: reward?.dropDexId ?? null,
    dropStar: reward?.dropStar ?? null,
    equipmentDrop: reward?.equipmentDrop ?? null,
    pigDrop: reward?.pigDrop ?? null,
    summonScrollDropped: reward?.summonScrollDropped ?? false,
    fighterLevelsGained: reward?.fighterLevelsGained ?? 0,
  };
  enterStageResult();
}

function startDungeonFloor(floor: DungeonFloor): void {
  if (state.player.backgroundFarmJob?.status === "RUNNING") { playSfx("denied", 0.7); return; }
  const party = getDungeonParty(state.player);
  if (party.length === 0) return;
  if (!trySpendStamina(state.player, DUNGEON_STAMINA_COST).ok) {
    playSfx("denied", 0.7);
    return;
  }
  savePlayerState(state.player);
  state.lastRun = { kind: "EQUIP_DUNGEON", floor };
  state.dungeonRun = { floor, partyInstances: party, manualStartedAt: Date.now() };
  state.screen = "DUNGEON_BATTLE";
  render();
}

function finishDungeon(cleared: boolean): void {
  const run = state.dungeonRun;
  if (!run) return;
  const floor = run.floor;
  if (cleared) recordManualBattle(state.player.recentManualClearTimes, manualClearKey("EQUIP_DUNGEON", String(floor.floor)), run.manualStartedAt, Date.now());

  const reward = cleared ? applyDungeonClearRewards(state.player, floor, run.partyInstances) : null;
  savePlayerState(state.player);

  state.dungeonRun = null;
  if (advanceFarmRun(cleared, reward, 0)) return;

  state.stageResult = {
    cleared,
    stageName: floor.name,
    goldEarned: reward?.goldEarned ?? 0,
    crystalEarned: reward?.crystalEarned ?? 0,
    wavesCleared: cleared ? 1 : 0,
    totalWaves: 1,
    levelUps: reward?.levelUps ?? [],
    expAwards: reward?.expAwards ?? [],
    dropDexId: null,
    dropStar: null,
    equipmentDrop: reward?.equipmentDrop ?? null,
    pigDrop: reward?.pigDrop ?? null,
    summonScrollDropped: reward?.summonScrollDropped ?? false,
    fighterLevelsGained: reward?.fighterLevelsGained ?? 0,
  };
  enterStageResult();
}

function handleAutoFarmStage(stage: Stage, count: number, difficulty: Difficulty): void {
  const difficultySuffix = difficulty === "NORMAL" ? "" : ` [${DIFFICULTY_JA[difficulty]}]`;
  beginBackgroundFarm({ kind: "STAGE", targetId: stage.id, targetName: `${stage.name}${difficultySuffix}`, difficulty, requestedRuns: count }, state.player.partyIds, isStageCleared(state.player, stage.id, difficulty));
}

function handleAutoFarmDungeon(floor: DungeonFloor, count: number): void {
  beginBackgroundFarm({ kind: "EQUIP_DUNGEON", targetId: String(floor.floor), targetName: floor.name, requestedRuns: count }, state.player.dungeonPartyIds, isDungeonFloorCleared(state.player, floor.floor));
}

function startLevelDungeonTier(def: LevelDungeonDef): void {
  if (state.player.backgroundFarmJob?.status === "RUNNING") { playSfx("denied", 0.7); return; }
  const party = getParty(state.player);
  if (party.length === 0) return;
  // **1日の上限を先に見る。**スタミナを払ってから上限に弾かれると、払い損になる
  if (!trySpendLevelDungeonChallenge(state.player).ok) {
    playSfx("denied", 0.7);
    return;
  }
  if (!trySpendStamina(state.player, LEVEL_DUNGEON_STAMINA_COST).ok) {
    playSfx("denied", 0.7);
    return;
  }
  savePlayerState(state.player);
  state.lastRun = { kind: "LEVEL_DUNGEON", def };
  state.levelDungeonRun = { def, partyInstances: party, manualStartedAt: Date.now() };
  state.screen = "LEVEL_DUNGEON_BATTLE";
  render();
}

function finishLevelDungeon(cleared: boolean): void {
  const run = state.levelDungeonRun;
  if (!run) return;
  const def = run.def;
  if (cleared) recordManualBattle(state.player.recentManualClearTimes, manualClearKey("LEVEL_DUNGEON", def.tier), run.manualStartedAt, Date.now());

  const reward = cleared ? applyLevelDungeonClearRewards(state.player, def, run.partyInstances) : null;
  savePlayerState(state.player);

  state.levelDungeonRun = null;
  if (advanceFarmRun(cleared, reward, 0)) return;

  state.stageResult = {
    cleared,
    stageName: def.name,
    goldEarned: reward?.goldEarned ?? 0,
    crystalEarned: reward?.crystalEarned ?? 0,
    wavesCleared: cleared ? 1 : 0,
    totalWaves: 1,
    levelUps: reward?.levelUps ?? [],
    expAwards: reward?.expAwards ?? [],
    dropDexId: null,
    dropStar: null,
    equipmentDrop: null,
    pigDrop: reward?.pigDrop ?? null,
    summonScrollDropped: false,
    fighterLevelsGained: reward?.fighterLevelsGained ?? 0,
  };
  enterStageResult();
}

function handleAutoFarmLevelDungeon(def: LevelDungeonDef, count: number): void {
  beginBackgroundFarm({ kind: "LEVEL_DUNGEON", targetId: def.tier, targetName: def.name, requestedRuns: count }, state.player.partyIds, isLevelDungeonTierCleared(state.player, def.tier));
}

function startGoldDungeonFloor(floor: GoldDungeonFloor): void {
  if (state.player.backgroundFarmJob?.status === "RUNNING") { playSfx("denied", 0.7); return; }
  const party = getParty(state.player);
  if (party.length === 0) return;
  if (!trySpendGoldDungeonChallenge(state.player).ok) return;
  if (!trySpendStamina(state.player, GOLD_DUNGEON_STAMINA_COST).ok) {
    playSfx("denied", 0.7);
    return;
  }
  savePlayerState(state.player);
  state.lastRun = { kind: "GOLD_DUNGEON", floor };
  state.goldDungeonRun = { floor, partyInstances: party, manualStartedAt: Date.now() };
  state.screen = "GOLD_DUNGEON_BATTLE";
  render();
}

function finishGoldDungeon(cleared: boolean): void {
  const run = state.goldDungeonRun;
  if (!run) return;
  const floor = run.floor;
  if (cleared) recordManualBattle(state.player.recentManualClearTimes, manualClearKey("GOLD_DUNGEON", String(floor.floor)), run.manualStartedAt, Date.now());

  const reward = cleared ? applyGoldDungeonClearRewards(state.player, floor, run.partyInstances) : null;
  if (cleared && !state.player.clearedGoldDungeonFloors.includes(floor.floor)) state.player.clearedGoldDungeonFloors.push(floor.floor);
  savePlayerState(state.player);

  state.goldDungeonRun = null;
  if (advanceFarmRun(cleared, reward, 0)) return;

  state.stageResult = {
    cleared,
    stageName: floor.name,
    goldEarned: reward?.goldEarned ?? 0,
    crystalEarned: reward?.crystalEarned ?? 0,
    wavesCleared: cleared ? 1 : 0,
    totalWaves: 1,
    levelUps: reward?.levelUps ?? [],
    expAwards: reward?.expAwards ?? [],
    dropDexId: null,
    dropStar: null,
    equipmentDrop: null,
    pigDrop: null,
    summonScrollDropped: false,
    fighterLevelsGained: reward?.fighterLevelsGained ?? 0,
  };
  enterStageResult();
}

function handleAutoFarmGoldDungeon(floor: GoldDungeonFloor, count: number): void {
  beginBackgroundFarm({ kind: "GOLD_DUNGEON", targetId: String(floor.floor), targetName: floor.name, requestedRuns: count }, state.player.partyIds, state.player.clearedGoldDungeonFloors.includes(floor.floor));
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
    chain: battleChainInfo(),
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
    chain: battleChainInfo(),
  });
}

/* ==========================================================================
 * アリーナ(対人戦)
 * ========================================================================== */

/** 今の点数帯から、並べる挑戦相手を作る。同じ点数・同じ種なら同じ顔ぶれになる */
function currentArenaOpponents(): ArenaOpponent[] {
  return generateArenaOpponents(state.player.arenaPoints, state.player.arenaOpponentSeed);
}

function startArenaMatch(opponent: ArenaOpponent): void {
  const party = getArenaTeam(state.player, "OFFENSE");
  if (party.length === 0) {
    state.arenaNotice = "攻撃編成を組んでください";
    render();
    return;
  }
  // アリーナはスタミナではなく挑戦券で回す。育成の周回と取り合いにしないため
  if (!trySpendArenaTicket(state.player).ok) {
    state.arenaNotice = "挑戦券が足りません";
    playSfx("denied", 0.7);
    render();
    return;
  }
  savePlayerState(state.player);
  state.arenaNotice = null;
  state.lastRun = { kind: "ARENA", opponent };
  state.arenaRun = { opponent, partyInstances: party };
  state.screen = "ARENA_BATTLE";
  render();
}

function finishArenaMatch(won: boolean): void {
  const run = state.arenaRun;
  if (!run) return;

  const result = resolveArenaMatch(state.player, run.opponent, won);
  savePlayerState(state.player);

  const rankLine =
    result.rankChange === "UP"
      ? `${result.rankAfter.name}へ昇格！`
      : result.rankChange === "DOWN"
        ? `${result.rankAfter.name}へ降格`
        : null;

  state.stageResult = {
    cleared: won,
    stageName: `アリーナ ${run.opponent.name}`,
    goldEarned: result.goldEarned,
    crystalEarned: result.crystalEarned,
    wavesCleared: won ? 1 : 0,
    totalWaves: 1,
    levelUps: [],
    dropDexId: null,
    dropStar: null,
    equipmentDrop: null,
    pigDrop: null,
    summonScrollDropped: result.scrollEarned > 0,
    fighterLevelsGained: 0,
  };
  // 点数の増減と昇降格は、勝敗そのものと同じくらい見たい情報
  state.arenaNotice = [
    `${result.pointDelta >= 0 ? "+" : ""}${result.pointDelta} pt (${result.pointsAfter} pt)`,
    rankLine,
  ]
    .filter(Boolean)
    .join(" / ");
  state.arenaRun = null;
  enterStageResult();
}

/* ============================================================
 * 試練の塔
 * ============================================================ */

/**
 * 次の階へ挑む(登坂の開始も継続もここ)。
 *
 * 塔の1階ぶんは、他のコンテンツと同じ「1戦」だが、**戦闘の入り口で
 * 持ち越しを渡す**点だけが違う。持ち越しの計算は `src/game/trialTower.ts` が持ち、
 * ここは画面遷移とスタミナだけを見る。
 */
function startTowerFloor(): void {
  const blocked = towerBlockReason(state.player);
  if (blocked) {
    state.towerNotice = blocked;
    playSfx("denied", 0.7);
    render();
    return;
  }
  const run = state.player.trialTowerRun ?? beginTowerRun(state.player);
  if (!run) return;
  if (!spendTowerStamina(state.player)) {
    // 登坂そのものは残す。**理由(スタミナが足りない)はボタンの脇が伝える**ので、
    // ここは「進みが消えていない」ことだけを言う
    state.towerNotice = "登坂はそのまま残っています。スタミナが戻れば続きから登れます。";
    playSfx("denied", 0.7);
    savePlayerState(state.player);
    state.screen = "TRIAL_TOWER";
    render();
    return;
  }
  state.towerNotice = null;
  savePlayerState(state.player);
  state.screen = "TOWER_BATTLE";
  render();
}

/**
 * 1階ぶんの決着を反映する。
 *
 * 勝てば持ち越して次の階へ**自動で進む**。周回と同じ考え方で、
 * まとめてよいのは押す手数であって戦闘そのものではない。
 * 節を越えた時と、負けた時と、登り切った時だけ画面を止める。
 */
function finishTowerFloor(cleared: boolean, setup: TowerBattleSetup, engine: BattleEngine): void {
  const run = state.player.trialTowerRun;
  if (!run) return;
  const clearedFloor = run.floor;

  const outcome = applyTowerFloorResult(state.player, run, setup, engine, cleared);
  savePlayerState(state.player);

  /** 塔の画面へ戻す。⏹ の押下は登坂ごとのものなので、ここで必ず畳む */
  const backToTower = (kind: TowerOutcome["kind"], fanfare = false): void => {
    state.towerStopRequested = false;
    state.towerOutcome = { kind, floor: clearedFloor, reward: outcome.reward };
    state.screen = "TRIAL_TOWER";
    if (fanfare) playSfx("stageClear");
    render();
  };

  if (outcome.wiped) return backToTower("WIPED");
  if (outcome.completed) return backToTower("COMPLETED", true);
  if (outcome.restored) return backToTower("CHECKPOINT", true);
  // ⏹ が押されていたら、この階で止める。登坂は途中のまま残るので続きから入れる
  if (state.towerStopRequested) return backToTower("PAUSED");

  /*
   * まだ節の途中。持ち越したまま次の階へ送る。
   *
   * **入り口を1つにする。**ここでスタミナを払ってしまうと、払った直後に
   * 画面を離れた人がその階を戦わないまま次にもう一度払うことになる。
   * 開始と継続で同じ `startTowerFloor` を通し、
   * **戦闘が実際に始まる瞬間にだけ**払う形にしてある。
   */
  startTowerFloor();
}

function renderCurrentTowerBattle(): BattleViewHandle {
  const run = state.player.trialTowerRun;
  if (!run) throw new Error("trialTowerRun is not set");
  const setup = setupTowerBattle(state.player, run);
  if (!setup) throw new Error("試練の塔の編成を組めません");

  const engine = new BattleEngine(setup.playerDefs, setup.enemyDefs, {
    initialPlayerHp: setup.initialPlayerHp,
    initialCooldowns: setup.initialCooldowns,
  });

  const traitLabel = TOWER_TRAIT_LABEL[setup.floor.trait];
  return renderBattleView({
    engine,
    playerTeam: setup.playerDefs,
    enemyTeam: setup.enemyDefs,
    title: `塔 ${setup.floor.floor}階${traitLabel ? ` ${traitLabel}` : ""}`,
    resultLabel: (winner) => (winner === "PLAYER" ? "▲ 次の階へ" : "塔に戻る"),
    onFinish: (winner) => finishTowerFloor(winner === "PLAYER", setup, engine),
    // 勝てば自動で次の階へ送る。負けた時は送らない(そこで登坂は終わりなので、見せずに飛ばさない)
    chain: {
      index: setup.floor.floor,
      total: TOWER_FLOOR_COUNT,
      stopped: state.towerStopRequested,
      onStop: () => {
        state.towerStopRequested = true;
      },
      stopTitle: "この階で登坂を終える(続きから再開できます)",
    },
  });
}

function renderCurrentArenaBattle(): BattleViewHandle {
  const run = state.arenaRun;
  if (!run) throw new Error("arenaRun is not set");

  const setup = setupArenaBattle(run.partyInstances, run.opponent, state.player.equipment);
  const engine = new BattleEngine(setup.playerDefs, setup.enemyDefs);

  return renderBattleView({
    engine,
    playerTeam: setup.playerDefs,
    enemyTeam: setup.enemyDefs,
    title: `vs ${run.opponent.name}`,
    resultLabel: (winner) => (winner === "PLAYER" ? "🏆 結果を見る" : "アリーナに戻る"),
    onFinish: (winner) => finishArenaMatch(winner === "PLAYER"),
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
    chain: battleChainInfo(),
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
    /*
     * 上帯の名前。
     *
     * **「ステージ」の4文字を落としてある。**戦闘画面にいる時点でステージだと
     * 分かっているうえ、縦画面(390px)では上帯の幅がぎりぎりで、
     * この4文字があると周回の札と並んだ時に「ウェーブ1」の側が削れる。
     * 章と番号、そして今が何ウェーブ目かの方が、ここでは要る情報。
     */
    title: `${run.stage.name.replace(/^ステージ\s*/, "")}${difficultySuffix} ・ ウェーブ${wave.waveNumber}${wave.isBossWave ? "(BOSS)" : ""}`,
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
    chain: battleChainInfo(),
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

  persistNavigationState();

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
        onGoShop: () => navigate("SHOP"),
        onGoArena: () => navigate("ARENA"),
        onGoTrialTower: () => navigate("TRIAL_TOWER"),
        onGoHowToPlay: () => navigate("HOW_TO_PLAY"),
        onGoTutorialDestination: (destination: TutorialDestination) => {
          if (destination === "MONSTER_CREATE") {
            const target = state.player.monsters.find(m => m.star === 6);
            if (target) {
              state.createTargetId = target.id; state.createMenu = "ABILITY";
              state.player.tutorialMissions.createOpened = true; savePlayerState(state.player);
              state.screen = "MONSTER_CREATE"; render(); return;
            }
            navigate("MONSTERS"); return;
          }
          navigate(destination);
        },
        onClaimTutorial: (id) => {
          if (claimTutorialMission(state.player, id)) { savePlayerState(state.player); playSfx("stageClear"); }
          render();
        },
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
        persistState,
        backupAt: backupTakenAt(),
        onRestoreBackup: handleRestoreBackup,
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
        onToggleDungeonMember: handleToggleDungeonPartyMember,
        onToggleTowerMember: handleToggleTowerPartyMember,
        onAutoFill: handleAutoFillParty,
        onClearParty: handleClearParty,
        notice: state.partyNotice,
        sortKey: state.monsterSortKey,
        onChangeSort: (key) => {
          state.monsterSortKey = key;
          render();
        },
        // 長押しは編成を変えずに詳細だけを見たい時の操作。所持一覧の詳細へ送る
        onViewDetail: (instanceId) => {
          state.monsterDetailId = instanceId;
          state.screen = "MONSTERS";
          render();
        },
        filter: state.monsterFilter,
        filterOpen: state.monsterFilterOpen,
        onChangeFilter: handleChangeMonsterFilter,
        onToggleFilterOpen: handleToggleMonsterFilterOpen,
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
        // 専用の編成画面には絞り込みも並べ替えも無く、同じことを2か所で
        // 別々にやらせていた。編成はすべて編成画面へ集約する
        onGoDungeonParty: () => {
          state.partyEditMode = "DUNGEON";
          navigate("PARTY");
        },
        autoFarmCount: state.autoFarmCount,
        onChangeAutoFarmCount: (count) => {
          state.autoFarmCount = count;
          render();
        },
        onAutoFarm: handleAutoFarmDungeon,
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

    case "ARENA":
      content = renderPvpArena({
        player: state.player,
        opponents: currentArenaOpponents(),
        editing: state.arenaEditing,
        notice: state.arenaNotice,
        settlement: state.arenaSettlement,
        onEdit: (slot) => {
          state.arenaEditing = slot;
          state.arenaNotice = null;
          render();
        },
        onToggleMember: (slot, instanceId) => {
          toggleArenaTeamMember(state.player, slot, instanceId);
          savePlayerState(state.player);
          render();
        },
        onChallenge: startArenaMatch,
        onRefillTickets: () => {
          const result = tryRefillArenaTickets(state.player);
          state.arenaNotice = result.ok ? "挑戦券を回復しました" : (result.reason ?? "回復できませんでした");
          if (result.ok) savePlayerState(state.player);
          render();
        },
        onRerollOpponents: () => {
          // 券は減らさない。並んだ3人がどれも噛み合わない時に
          // 券を捨てて選び直させるのは理不尽なので
          advanceArenaOpponentSeed(state.player);
          savePlayerState(state.player);
          render();
        },
        onDismissSettlement: () => {
          state.arenaSettlement = null;
          render();
        },
        onViewDetail: (instanceId) => {
          state.monsterDetailId = instanceId;
          state.screen = "MONSTERS";
          render();
        },
      });
      break;

    case "TRIAL_TOWER": {
      if (ensureTowerMonthlyState(state.player)) savePlayerState(state.player);
      const blockedReason = towerBlockReason(state.player);
      content = renderTrialTower({
        bestFloor: state.player.trialTowerBestFloor,
        nextFloor: nextTowerFloor(state.player),
        run: describeTowerRun(state.player),
        party: getTowerParty(state.player),
        player: state.player,
        claimedFloors: state.player.trialTowerClaimedFloors,
        /*
         * 挑めない理由(`blockedReason`)はボタンの脇に必ず出る。
         * 案内がそれと同じことを言っている時は**上の帯に出さない**。
         * スタミナ切れで「上の帯」と「ボタンの赤字」に同じ文が2つ並んでいた
         */
        notice: state.towerNotice === blockedReason ? null : state.towerNotice,
        outcome: state.towerOutcome,
        blockedReason,
        onEditParty: () => {
          state.partyEditMode = "TOWER";
          state.towerOutcome = null;
          navigate("PARTY");
        },
        onChallenge: () => {
          state.towerOutcome = null;
          startTowerFloor();
        },
        onAbandon: () => {
          abandonTowerRun(state.player);
          savePlayerState(state.player);
          state.towerOutcome = null;
          state.towerNotice = "登坂をやめました。次は節から登り直しになります。";
          render();
        },
        onDismissOutcome: () => {
          state.towerOutcome = null;
          render();
        },
        onBack: () => navigate("HOME"),
      });
      break;
    }

    case "TOWER_BATTLE": {
      showNav = false;
      const handle = renderCurrentTowerBattle();
      disposeCurrentView = handle.dispose;
      content = handle.element;
      break;
    }

    case "HOW_TO_PLAY":
      content = renderHowToPlay({ onBack: () => navigate("HOME") });
      break;

    case "ARENA_BATTLE": {
      showNav = false;
      const handle = renderCurrentArenaBattle();
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

    case "MONSTER_CREATE": {
      const createTarget = state.player.monsters.find((m) => m.id === state.createTargetId);
      if (!createTarget) {
        navigate("MONSTERS");
        return;
      }
      content = renderMonsterCreate({
        target: createTarget,
        monsters: state.player.monsters,
        partyIds: state.player.partyIds,
        dungeonPartyIds: state.player.dungeonPartyIds,
        materialId: state.createMaterialId,
        slot: state.createSlot,
        sortKey: state.monsterSortKey,
        notice: state.createNotice,
        menu: state.createMenu,
        awakeningOrbs: state.player.awakeningOrbs,
        gold: state.player.gold,
        reawakenConfirmOpen: state.reawakenConfirmOpen,
        onSelectMenu: (menu) => {
          state.createMenu = menu;
          state.createNotice = null;
          state.reawakenConfirmOpen = false;
          render();
        },
        onReincarnate: (type: MonsterType) => {
          const label = MONSTER_TYPE_LABELS[type];
          if (!window.confirm(`${label}タイプへ転生しますか？\n${MONSTER_TYPE_DESCRIPTIONS[type]}\n費用：150,000G\nレベル・EXPは維持されます。\n能力ポイントはリセットされ、振り直せます。`)) return;
          if (!reincarnateMonsterType(createTarget, type, state.player)) return;
          state.createNotice = `150,000Gでタイプを変更しました（Lv・EXP維持）`;
          savePlayerState(state.player);
          playSfx("levelUp");
          render();
        },
        onSetAbilityPoint: (stat: AllocatableStat, points: number) => {
          if (!setAbilityPoint(createTarget, stat, points)) return;
          savePlayerState(state.player);
          render();
        },
        onResetAbilityPoints: () => {
          if (!window.confirm("能力ポイントをリセットしますか？\n能力ポイントがすべて0になります\n再び100ptを自由に振り直せます\n費用：100,000ゴールド")) return;
          if (!resetAbilityPoints(createTarget, state.player)) return;
          state.createNotice = "能力ポイントをリセットしました";
          savePlayerState(state.player);
          render();
        },
        onAwaken: (candidateId) => {
          const candidates = LATENT_ABILITY_CANDIDATES[createTarget.dexId] ?? [];
          const wasReselecting = createTarget.development.latentReselectPending;
          if (!awakenLatentAbility(createTarget, candidateId, candidates, state.player)) return;
          savePlayerState(state.player);
          state.createNotice = wasReselecting ? "潜在能力を再選択しました" : "潜在能力を覚醒しました";
          playSfx("levelUp");
          render();
        },
        onRequestReawaken: () => {
          state.reawakenConfirmOpen = true;
          render();
        },
        onCancelReawaken: () => {
          state.reawakenConfirmOpen = false;
          render();
        },
        onConfirmReawaken: () => {
          if (!reawakenLatentAbility(createTarget, state.player)) {
            state.reawakenConfirmOpen = false;
            state.createNotice = "再覚醒に必要な資源が不足しています";
            render();
            return;
          }
          state.reawakenConfirmOpen = false;
          state.createNotice = "再覚醒しました。潜在能力を選び直してください";
          savePlayerState(state.player);
          playSfx("levelUp");
          render();
        },
        onSelectMaterial: (id) => {
          state.createMaterialId = id;
          // 素材が変われば出せるスキルも変わる。枠の選択は持ち越さない
          state.createSlot = null;
          state.createNotice = null;
          render();
        },
        onSelectSlot: (slot) => {
          state.createSlot = slot;
          state.createNotice = null;
          render();
        },
        onConfirm: handleConfirmMonsterCreate,
        onClear: handleClearMonsterCreate,
        onBack: () => {
          state.reawakenConfirmOpen = false;
          state.createTargetId = null;
          state.createMaterialId = null;
          state.createSlot = null;
          state.createNotice = null;
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
      content = renderStageResult({ info, actions: buildResultActions(false) });
      break;
    }

    case "AUTO_FARM_RESULT": {
      showNav = false;
      const result = state.autoFarmResult;
      if (!result) {
        navigate("HOME");
        return;
      }
      const actions = buildResultActions(true);
      if (state.viewingBackgroundFarmJobId) actions.push({ label: "✓ 確認して閉じる", variant: "primary", run: () => {
        const job = state.player.backgroundFarmJob;
        if (job?.id === state.viewingBackgroundFarmJobId && dismissFinishedBackgroundFarm(state.player, state.viewingBackgroundFarmJobId)) {
          // 確定済み報酬には触れず、完了ジョブ（結果通知）だけを削除する。
          savePlayerState(state.player);
        }
        navigate("HOME");
      } });
      content = renderAutoFarmResult({ result, targetName: state.autoFarmTargetName, actions });
      break;
    }
  }

  root.append(content);
  if (pwaUpdate.snapshot.available) {
    const inBattle = BATTLE_SCREENS.has(state.screen);
    const applying = pwaUpdate.snapshot.applying;
    root.append(el("aside", { className: "pwa-update-banner", role: "status" }, [
      el("div", { className: "pwa-update-banner__copy" }, [
        el("strong", {}, ["新しいバージョンがあります"]),
        ...(inBattle ? [el("span", {}, ["戦闘終了後にアップデートできます"])] : []),
      ]),
      el("button", {
        type: "button",
        className: "btn btn--primary pwa-update-banner__button",
        disabled: inBattle || applying,
        onclick: () => void pwaUpdate.apply(() => {
          // PR #111の画面復帰用UI状態と、永続化済み周回ジョブを同じ時点で保存する。
          persistNavigationState();
          savePlayerState(state.player);
        }),
      }, [applying ? "更新中…" : "アップデート"]),
    ]));
  }
  const backgroundJob = state.player.backgroundFarmJob;
  if (backgroundJob) {
    const remaining = Math.max(0, backgroundJob.requestedRuns - backgroundJob.completedRuns);
    const status = backgroundJob.status === "RUNNING" ? "進行中" : backgroundJob.status === "COMPLETED" ? "完了" : "終了";
    root.append(el("aside", { className: "background-farm-status" }, [
      el("button", { type: "button", className: "background-farm-status__summary", onclick: () => {
        if (backgroundJob.status !== "RUNNING") {
          state.autoFarmResult = backgroundJob.result; state.autoFarmTargetName = backgroundJob.targetName; state.viewingBackgroundFarmJobId = backgroundJob.id; state.screen = "AUTO_FARM_RESULT"; render();
        }
      } }, [`🔁 ${backgroundJob.targetName}　${backgroundJob.completedRuns} / ${backgroundJob.requestedRuns}周　${status}`]),
      el("span", { className: "background-farm-status__detail" }, [`残り${remaining}周 / ⚡${backgroundJob.staminaSpent}消費 / EXP ${backgroundJob.result.totalExp} / 🪙${backgroundJob.result.totalGold} / 装備${backgroundJob.result.equipmentDropCount}個`]),
      backgroundJob.status === "RUNNING" ? el("button", { type: "button", className: "btn btn--ghost", onclick: () => {
        finishBackgroundFarm(backgroundJob, "STOPPED"); savePlayerState(state.player); render();
      } }, ["周回を終了"]) : el("button", { type: "button", className: "btn btn--ghost", onclick: () => {
        state.autoFarmResult = backgroundJob.result; state.autoFarmTargetName = backgroundJob.targetName; state.viewingBackgroundFarmJobId = backgroundJob.id; state.screen = "AUTO_FARM_RESULT"; render();
      } }, ["結果を見る"]),
    ]));
  }
  if (showNav) root.append(renderBottomNav(state.screen, navigate));
  playBgm(bgmSceneOf(state.screen));

  const newRouteKey = routeKey();
  window.scrollTo(0, scrollPositions.get(newRouteKey) ?? 0);
  lastRouteKey = newRouteKey;
}

/**
 * 画面ごとに敷くBGM。
 *
 * 焼いてあるのは2つだけで、戦闘とそれ以外で分ける。場面をこれ以上刻んでも、
 * 中身の差を作れなければ切り替わりが目立つだけで良くならない。
 *
 * `playBgm` は同じ場面を何度渡しても鳴らし直さないので、
 * 再描画のたびに呼んで構わない(むしろ、そう呼ぶ前提で作ってある)。
 */
const BATTLE_SCREENS = new Set<ScreenName>([
  "BATTLE",
  "DUNGEON_BATTLE",
  "LEVEL_DUNGEON_BATTLE",
  "GOLD_DUNGEON_BATTLE",
  "ARENA_BATTLE",
  "TOWER_BATTLE",
]);

function bgmSceneOf(screen: ScreenName): BgmScene {
  return BATTLE_SCREENS.has(screen) ? "battle" : "home";
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
    onUseSpecialSummonScroll: handleUseSpecialSummonScroll,
    onTutorialSummon: handleTutorialSummon,
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
    onGoCreate: (monsterId) => {
      state.createTargetId = monsterId;
      state.createMaterialId = null;
      state.createSlot = null;
      state.createNotice = null;
      state.createMenu = "SKILL";
      state.screen = "MONSTER_CREATE";
      state.player.tutorialMissions.createOpened = true;
      savePlayerState(state.player);
      render();
    },
    onGoMonsterDex: () => {
      state.selectedDexEntryId = null;
      state.screen = "MONSTER_DEX";
      render();
    },
    sortKey: state.monsterSortKey,
    onChangeSort: (key) => {
      state.monsterSortKey = key;
      render();
    },
    filter: state.monsterFilter,
    filterOpen: state.monsterFilterOpen,
    onChangeFilter: handleChangeMonsterFilter,
    onToggleFilterOpen: handleToggleMonsterFilterOpen,
  });
}

/**
 * 絞り込みは所持一覧と編成画面で同じものを使う。
 * 画面を移るたびに条件が消えると、「火の★6を探す」の続きができない。
 */
function handleChangeMonsterFilter(filter: MonsterFilter): void {
  state.monsterFilter = filter;
  render();
}

function handleToggleMonsterFilterOpen(): void {
  state.monsterFilterOpen = !state.monsterFilterOpen;
  render();
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
/**
 * 前回起動時の控えへ戻す。
 *
 * 読み込みを間違えた時・素材にする相手を間違えた時の、最後の綱。
 * **今の状態は失われる**ので、何がどう変わるのかを見せてから確かめる。
 */
function handleRestoreBackup(): void {
  const backup = readStartupBackup();
  if (!backup) {
    window.alert("戻せる控えがありません。");
    return;
  }
  const ok = window.confirm(
    `前回このアプリを開いた時の状態に戻しますか?\n\n${describeSaveFile(backup)}\n\n※ それ以降に進めた分は失われます。`,
  );
  if (!ok) return;
  state.player = normalizeLoadedState(backup.state);
  savePlayerState(state.player);
  render();
  window.alert("前回起動時の状態に戻しました。");
}

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

/**
 * 開発中だけ、状態を一発で作れる引き出しを出す。
 * 「確認が面倒な場所ほど確認されない」を潰すための道具で、本番には入らない。
 */
if (import.meta.env.DEV) {
  void import("./devMenu.js").then((m) =>
    m.mountDevMenu({
      player: state.player,
      save: () => savePlayerState(state.player),
      render,
    }),
  );
}

appMounted = true;
render();
scheduleBackgroundFarm(250);

document.addEventListener("visibilitychange", () => {
  savePlayerState(state.player);
  if (document.visibilityState === "visible") scheduleBackgroundFarm(0);
});
window.addEventListener("pagehide", () => savePlayerState(state.player));
