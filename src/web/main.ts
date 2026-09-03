import "./style.css";
import "./crimon-visual-system.css";
import "./home-pop-design.css";
import "./mobile-ux.css";
import "./ui/tutorialBar.css";
import "./ui/arena.css";
import "./ui/portraitOnly.css";
import "./ui/monsterList.css";
import "./ui/crystalShop.css";
import { audioContextState, BgmScene, getAudioSettings, initAudio, playBgm, playSfx, updateAudioSettings } from "./audio/index.js";
import { registerSW } from "virtual:pwa-register";
import { BattleEngine } from "../battle/engine.js";
import { equipmentSellPrice, EquipSlot } from "../core/equipment.js";
import { DUNGEON_STAMINA_COST, GOLD_DUNGEON_STAMINA_COST, LEVEL_DUNGEON_STAMINA_COST, STAGE_STAMINA_COST } from "../core/fighterLevel.js";
import { MonsterInstance } from "../core/monsterInstance.js";
import { DungeonFloor, EquipmentDungeonKind, dungeonFloorKey, findDungeonFloorByKey } from "../data/equipmentDungeon.js";
import { GoldDungeonFloor, GOLD_DUNGEON_FLOORS } from "../data/goldDungeon.js";
import { LevelDungeonDef, LevelDungeonTier, LEVEL_DUNGEON_DEFS } from "../data/levelDungeon.js";
import { Difficulty, DIFFICULTY_JA, Stage, STAGES, stageWaveGold } from "../data/stages.js";
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
import { executeMonsterPowerUp } from "../game/monsterPowerUp.js";
import { CREATE_GOLD_COST, CreateSlot, applyMonsterCreate, clearMonsterCreate, describeCreatedSkill } from "../game/monsterCreate.js";
import { awakenLatentAbility, confirmAbilityPoints, confirmLatentAwakening, LATENT_ABILITY_CANDIDATES, reawakenLatentAbility, reincarnateMonsterType, resetAbilityPoints, setAbilityPoint, usedAbilityPoints } from "../game/monsterDevelopment.js";
import {
  TYPE_REINCARNATION_GOLD_COST,
  ABILITY_POINT_RESET_COST, AllocatableStat, MONSTER_TYPE_DESCRIPTIONS, MONSTER_TYPE_LABELS, MonsterType } from "../core/monsterDevelopment.js";
import {
  ARENA_HISTORY_MAX,
  claimDailyLoginBonus,
  FIGHTER_NAME_MAX_LENGTH,
  LoginBonusResult,
  PlayerState,
  addMonster,
  applyPassiveStaminaRegen,
  buyShopEntry,
  equipToMonster,
  findEquippedOwner,
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
  setEquipmentLocked,
  setMonsterLocked,
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
import { renderGlobalBackButton } from "./views/backButton.js";
import { renderAutoFarmResult } from "./views/autoFarmResult.js";
import { renderFarmEquipmentResult } from "./views/farmEquipmentResult.js";
import { loadNavigationState, saveNavigationState } from "./navigationState.js";
import { DungeonReturnContext, keepReturnContext, normalStageReturnContext, rememberedScrollTop, replacePartySlot, restoreDungeonSelection, restoreScrollTop, sellableEquipmentIds } from "./uxHelpers.js";
import { ResultAction } from "./views/resultActions.js";
import { BattleChainInfo, BattleViewHandle, renderBattleView } from "./views/battleView.js";
import { EquipmentPickerContext, EquipmentSortKey, renderEquipment } from "./views/equipment.js";
import { renderEquipmentDungeon } from "./views/equipmentDungeon.js";
import { renderGoldDungeon } from "./views/goldDungeon.js";
import { renderHome } from "./views/home.js";
import { TutorialDestination, canClaimTutorialMission, claimTutorialMission, nextTutorialMission, tutorialMissionProgress } from "../game/tutorialMissions.js";
import { renderLevelDungeon } from "./views/levelDungeon.js";
import { renderMonsterDex } from "./views/monsterDex.js";
import { DexSortKey } from "../game/monsterDexSort.js";
import { DexFilter, EMPTY_DEX_FILTER } from "../game/monsterDexFilter.js";
import { renderPvpArena } from "./views/pvpArena.js";
import { renderHowToPlay } from "./views/howToPlay.js";
import type { ArenaViewName } from "./views/pvpArena.js";
import { buildArenaEntryBattle } from "./views/arena/model.js";
import { arenaNpcRng, buildArenaNpcs } from "../game/arena/npc.js";
import { buildArenaCandidates } from "../game/arena/matchmaking.js";
import { captureArenaDefense } from "../game/arena/snapshot.js";
import { arenaDefenseHistory, arenaRevengeBlock, markArenaRevenged, recordArenaMatch } from "../game/arena/match.js";
import {
  applyArenaSeasonRollover,
  claimArenaSeasonReward as claimArenaSeasonRewardLocal,
  claimArenaWeeklyReward,
} from "../game/arena/progress.js";
import { runPendingDefenseAttacks } from "../game/arena/defenseSim.js";
import { arenaShopRows, buyArenaShopItem, fulfillArenaShopPurchase } from "../game/arena/shop.js";
import { ARENA_TICKET_MAX_V2 } from "../data/arena/shop.js";
import { arenaTierForRating } from "../data/arena/ranks.js";
import type { ArenaTierId } from "../data/arena/ranks.js";
import type { ArenaDefenseSnapshot, ArenaOpponentEntry } from "../game/arena/types.js";
import {
  arenaSyncAvailable,
  claimArenaWeeklyReward as claimArenaWeeklyRewardRemote,
  ensureArenaProfile,
  fetchArenaOpponents,
  fetchArenaRanking,
  fetchArenaMatchHistory,
  fetchArenaRankingAround,
  fetchArenaState,
  claimArenaSeasonReward,
  purchaseArenaShopItem,
  fetchPendingArenaShopPurchases,
  acknowledgeArenaShopPurchase,
  beginArenaMatch,
  pushArenaDefense,
  settleArenaMatch,
} from "../net/arenaSync.js";
import type { ArenaMatchTicket, ArenaRankingEntry } from "../net/arenaSync.js";
import { arenaAuthUserId, ensureArenaAuth } from "../net/arenaAuth.js";
import {
  ARENA_TEAM_SIZE,
  advanceArenaOpponentSeed,
  applyArenaTicketRegen,
  arenaNextTicketAt,
  getArenaTeam,
  toggleArenaTeamMember,
  tryRefillArenaTickets,
  trySpendArenaTicket,
} from "../game/pvpArena.js";
import { renderMonsters } from "./views/monsters.js";
import { PartyEditMode, renderParty } from "./views/party.js";
import { EMPTY_MONSTER_TRAINING_FILTER, MonsterTrainingFilter, renderMonsterTraining } from "./views/monsterTraining.js";
import { CreateMenu, renderMonsterCreate } from "./views/monsterCreate.js";
import { renderStages } from "./views/stages.js";
import { StageResultInfo, StageResultLevelUp, renderStageResult } from "./views/stageResult.js";
import { renderSummon } from "./views/summon.js";
import { el } from "./dom.js";
import { PwaUpdateController } from "./pwaUpdate.js";
import { ARENA_REROLL_LIMIT } from "../data/pvpArena.js";
import { buyCrystalShopItem, crystalShopRows } from "../game/crystalShop.js";

let appMounted = false;
let pwaRegistration: ServiceWorkerRegistration | null = null;
const pwaUpdate = new PwaUpdateController(
  typeof navigator === "undefined" ? null : navigator.serviceWorker,
  () => { if (appMounted) render(); },
  () => window.location.reload(),
  {
    inspectUpdate: () => ({
      registration: pwaRegistration,
      controller: navigator.serviceWorker?.controller ?? null,
      active: pwaRegistration?.active ?? null,
      waiting: pwaRegistration?.waiting ?? null,
      installing: pwaRegistration?.installing ?? null,
    }),
  },
);

const updateWorker = registerSW({
  immediate: true,
  onNeedRefresh() { pwaUpdate.announce(); },
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    pwaRegistration = registration;
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
  | { kind: "ARENA"; entry: ArenaOpponentEntry };

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
  farmEquipmentOpen: boolean;
  farmEquipmentSelectedIds: string[];
  farmEquipmentDetailId: string | null;
  farmEquipmentSelling: boolean;
  /** ショップで直前に買ったものの案内。次に何か操作したら消す */
  shopNotice: string | null;
  /** まとめ売却の選択モード中か */
  equipmentSelecting: boolean;
  /** モンスターの装備スロットから装備詳細を開いた場合、戻る操作でこのモンスターの画面に戻るための参照 */
  equipmentReturnMonsterId: string | null;
  selectedDungeonFloor: number | null;
  selectedDungeonKind: EquipmentDungeonKind;
  dungeonRun: DungeonRunState | null;
  selectedLevelDungeonTier: LevelDungeonTier | null;
  levelDungeonRun: LevelDungeonRunState | null;
  selectedGoldDungeonFloor: number | null;
  goldDungeonRun: GoldDungeonRunState | null;
  selectedDexEntryId: string | null;
  /** 図鑑の並べ替え。66体を番号だけで並べると目当ての1体まで延々たどることになる */
  dexSortKey: DexSortKey;
  /** 図鑑の絞り込み。並べ替えは順番を変えるだけで、見る量は減らない */
  dexFilter: DexFilter;
  /** 絞り込みの札を開いているか。既定は畳む(開いたままだと一覧が見えない) */
  dexFilterOpen: boolean;
  /* --- アリーナ --- */
  /** 編成を編集中の枠。null なら対戦相手の一覧 */
  /** アリーナの中のどこを見ているか */
  arenaView: ArenaViewName;
  /** 詳細を開いている相手の並び位置。開いていなければ null */
  arenaDetailIndex: number | null;
  /** 検分している1体の位置 */
  arenaUnitIndex: number;
  /** 防衛に登録しようとしている顔ぶれ(まだ焼いていない) */
  arenaDefenseDraftIds: string[];
  /** いま並べている対戦候補。実プレイヤーとNPCが混ざる */
  arenaCandidates: ArenaOpponentEntry[];
  arenaCandidatesLoading: boolean;
  arenaRankingTop: ArenaRankingEntry[];
  arenaRankingAround: ArenaRankingEntry[];
  arenaRankingLoading: boolean;
  /** 自分の全国順位。未接続・未掲載なら null */
  arenaMyRank: number | null;
  /** いま挑んでいる相手。焼いた防衛からしか戦闘を組まない */
  arenaEntry: ArenaOpponentEntry | null;
  /**
   * サーバが発行した1戦。**精算に要る対戦IDと nonce。**
   * 未接続なら null で、その時はローカルの記録だけで進む。
   */
  arenaTicket: ArenaMatchTicket | null;
  /** サーバの戦績を1度引いたか。開くたびに引き直さない */
  arenaHistoryLoaded: boolean;
  /** サーバへ送った攻撃編成。画面もこれから組む(別のステータスで戦わないため) */
  arenaAttackerSnapshot: ArenaDefenseSnapshot | null;
  arenaNotice: string | null;
  /** 期間が変わった時に出す前の期のまとめ報酬。受け取るまで残す */
  monsterTrainingTargetId: string | null;
  monsterTrainingMaterialIds: string[];
  monsterTrainingFilter: MonsterTrainingFilter;
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
  partySelectedSlot: number | null;
  returnContext: DungeonReturnContext | null;
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
  farmEquipmentOpen: false,
  farmEquipmentSelectedIds: [],
  farmEquipmentDetailId: null,
  farmEquipmentSelling: false,
  shopNotice: null,
  equipmentSelecting: false,
  equipmentReturnMonsterId: null,
  selectedDungeonFloor: null,
  selectedDungeonKind: "DEMON",
  dungeonRun: null,
  selectedLevelDungeonTier: null,
  levelDungeonRun: null,
  selectedGoldDungeonFloor: null,
  goldDungeonRun: null,
  selectedDexEntryId: null,
  dexSortKey: "number",
  dexFilter: { ...EMPTY_DEX_FILTER },
  dexFilterOpen: false,
  arenaView: "TOP",
  arenaTicket: null,
  arenaHistoryLoaded: false,
  arenaAttackerSnapshot: null,
  arenaDetailIndex: null,
  arenaUnitIndex: 0,
  arenaDefenseDraftIds: [],
  arenaCandidates: [],
  arenaCandidatesLoading: false,
  arenaRankingTop: [],
  arenaRankingAround: [],
  arenaRankingLoading: false,
  arenaMyRank: null,
  arenaEntry: null,
  arenaNotice: null,
  monsterTrainingTargetId: null,
  monsterTrainingMaterialIds: [],
  monsterTrainingFilter: { ...EMPTY_MONSTER_TRAINING_FILTER },
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
  partySelectedSlot: null,
  returnContext: null,
};

// ゲームセーブとは別のキーから画面だけを復元する。対象が消えていた詳細画面は安全な一覧へ戻す。
{
  const restored = loadNavigationState();
  if (restored) {
    state.screen = restored.screen;
    state.returnContext = restored.returnContext ?? null;
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

  /*
   * アリーナ。挑戦券の自然回復だけを反映する(起動のたびに1度だけ)。
   *
   * **旧アリーナの週次精算(`settleArenaPeriod`)はここから外した。**
   * 新しいシーズン制と二重に走っていて、実測でこうなっていた:
   *
   *   - 旧の週次報酬(💎3,400 / 30万G / 召喚の書8)が**画面に一言も出ずに**入る
   *     (`state.arenaSettlement` はどこにも描画されていなかった)
   *   - `arenaSeasonBestPoints` を今のレートまで潰す。新の週間報酬は
   *     「下がっても取り上げない」ために最高レートで等級を決めているので、
   *     **マスター→プラチナIIへ降格**していた
   *   - `arenaSeasonBattles/Wins` を毎週0に戻す。画面は「今シーズンの戦績」と
   *     出しているのに、実際は週で消えていた
   *
   * 週の区切りも3つ(旧=木曜/新=月曜/ショップ=火曜)に割れていた。
   * 精算はシーズン制の側(`applyArenaSeasonRollover` と週間報酬)に一本化する。
   */
  applyArenaTicketRegen(state.player);
}

const rootCandidate = document.getElementById("app");
if (!rootCandidate) throw new Error("#app root element not found");
const root: HTMLElement = rootCandidate;

/*
 * 横持ちの案内。**このゲームは縦持ち専用。**
 *
 * インストール済みのPWAは manifest で縦に固定されるが、
 * ブラウザで開いた場合は効かない。その時は無理に描かず、縦へ戻すよう伝える。
 * 出す・出さないの判定はCSS(`ui/portraitOnly.css`)が持つので、
 * ここは置くだけ。JSで画面の向きを見張ると、回すたびに描き直しが走る。
 */
document.body.append(
  el("div", { className: "rotate-notice", role: "status" }, [
    el("div", { className: "rotate-notice__icon", "aria-hidden": "true" }, ["📱"]),
    el("div", { className: "rotate-notice__title" }, ["縦向きでお楽しみください"]),
    el("div", { className: "rotate-notice__body" }, [
      "クリエイトモンスターズは縦持ち専用です。端末を縦に戻すと続きから遊べます。",
    ]),
  ]),
);

let disposeCurrentView: (() => void) | null = null;
let farmEquipmentScrollTop = 0;

/** 画面(+サブ状態)ごとのスクロール位置を記憶し、その画面に戻った時に復元する */
const scrollPositions = new Map<string, number>();
let lastRouteKey: string | null = null;

/**
 * 「今どこを見ているか」を決めている値だけを取り出したもの。
 *
 * **戦闘や周回の進行そのものは入れない。** 戻るで巻き戻していいのは
 * 見ている場所であって、進んだ戦いではない。ここに `stageRun` を混ぜると
 * 「戻る」で決着済みの戦闘が生き返る。
 */
interface RouteState {
  screen: ScreenName;
  monsterDetailId: string | null;
  rankUpMode: boolean;
  equipmentDetailId: string | null;
  equipmentPickerContext: EquipmentPickerContext | null;
  equipmentSlotFilter: EquipSlot | null;
  equipmentReturnMonsterId: string | null;
  equipmentSelecting: boolean;
  farmEquipmentOpen: boolean;
  farmEquipmentDetailId: string | null;
  selectedStageId: string | null;
  selectedDifficulty: Difficulty;
  selectedDungeonFloor: number | null;
  selectedDungeonKind: EquipmentDungeonKind;
  selectedDexEntryId: string | null;
  monsterTrainingTargetId: string | null;
  selectedLevelDungeonTier: LevelDungeonTier | null;
  selectedGoldDungeonFloor: number | null;
  createTargetId: string | null;
  createMenu: CreateMenu;
  partyEditMode: PartyEditMode;
  /*
   * アリーナは1つの画面の中でさらに6つに分かれる。**ここに入れ忘れていた。**
   *
   * 巡回をアリーナの中まで広げて分かった不具合が2つある。どちらもこれが原因:
   *
   *   1. 中の画面で「戻る」を押すと、アリーナのトップを飛ばしてホームまで戻る
   *      (トップ→対戦候補で見ている場所が変わっていないことになり、履歴が積まれない)
   *   2. ホームから入り直しても、前に開いた中の画面がそのまま出る
   *      (`navigate` が畳んでいない)
   *
   * 画面の中で行き先が分かれるなら、その行き先も「見ている場所」の一部にする。
   */
  arenaView: ArenaViewName;
  arenaDetailIndex: number | null;
  arenaUnitIndex: number;
}

const ROUTE_FIELDS = [
  "screen", "monsterDetailId", "rankUpMode", "equipmentDetailId", "equipmentPickerContext",
  "equipmentSlotFilter", "equipmentReturnMonsterId", "equipmentSelecting", "farmEquipmentOpen",
  "farmEquipmentDetailId", "selectedStageId", "selectedDifficulty", "selectedDungeonFloor", "selectedDungeonKind",
  "selectedDexEntryId", "monsterTrainingTargetId", "selectedLevelDungeonTier",
  "selectedGoldDungeonFloor", "createTargetId", "createMenu", "partyEditMode",
  "arenaView", "arenaDetailIndex", "arenaUnitIndex",
] as const satisfies readonly (keyof RouteState)[];

function routeState(): RouteState {
  return Object.fromEntries(ROUTE_FIELDS.map((field) => [field, state[field]])) as unknown as RouteState;
}

function routeKey(): string {
  return JSON.stringify(ROUTE_FIELDS.map((field) => state[field]));
}

/**
 * 通ってきた場所。**戻るのはここから取り出す。**
 *
 * `render()` が呼ばれるたびに、見ている場所が変わっていれば1つ積む。
 * 画面遷移の呼び出し側へ手を入れないのは、遷移が数十か所に散らばっていて
 * **1か所でも書き忘れると、そこだけ戻れない画面になる**ため。
 */
const routeHistory: RouteState[] = [];
/** 積み上げの上限。深く潜り続けても、記憶が無限には増えないようにする */
const ROUTE_HISTORY_MAX = 40;
let lastRouteState: RouteState | null = null;
/** 戻っている最中。この間は積まない(戻った先をまた積むと前に進めなくなる) */
let restoringRoute = false;

function canGoBack(): boolean {
  // 戦闘の最中に「戻る」を出さない。抜けた戦いがどう扱われるのかが決まっていない
  if (BATTLE_SCREENS.has(state.screen)) return false;
  /*
   * ホームには出さない。**ここが遊びの入口で、戻る先ではない。**
   * 履歴の有無で決めていた頃は、ホーム→召喚→ホームと下のタブで回ると
   * ホームにも「戻る」が出ていた(依頼主の指摘)。
   */
  if (state.screen === "HOME") return false;
  return routeHistory.length > 0;
}

/** 1つ前に見ていた場所へ戻す */
function goBack(): void {
  const previous = routeHistory.pop();
  if (!previous) return;
  for (const field of ROUTE_FIELDS) {
    (state as unknown as Record<string, unknown>)[field] = previous[field];
  }
  // 場所に紐づく一時的な案内は持ち越さない。前の画面の言葉が残ると嘘になる
  state.shopNotice = null;
  state.createNotice = null;
  state.partyNotice = null;
  state.arenaNotice = null;
  state.towerNotice = null;
  restoringRoute = true;
  render();
  restoringRoute = false;
}

function persistNavigationState(): void {
  saveNavigationState({
    screen: state.screen,
    monsterDetailId: state.monsterDetailId ?? undefined,
    equipmentDetailId: state.equipmentDetailId ?? undefined,
    selectedDexEntryId: state.selectedDexEntryId ?? undefined,
    monsterTrainingTargetId: state.monsterTrainingTargetId ?? undefined,
    createTargetId: state.createTargetId ?? undefined,
    returnContext: state.returnContext ?? undefined,
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
  state.selectedDungeonKind = "DEMON";
  state.selectedLevelDungeonTier = null;
  state.selectedGoldDungeonFloor = null;
  state.selectedDexEntryId = null;
  state.monsterTrainingTargetId = null;
  state.monsterTrainingMaterialIds = [];
  state.autoFarmResult = null;
  state.viewingBackgroundFarmJobId = null;
  /*
   * アリーナは中で6画面に分かれる。**畳んでから入る。**
   * 畳まないと、ホームから入り直しても前に開いた中の画面がそのまま出る
   * (巡回をアリーナの中まで広げて見つかった)。
   */
  state.arenaView = "TOP";
  state.arenaDetailIndex = null;
  state.arenaUnitIndex = 0;
  state.arenaNotice = null;
  // 旧式の戦闘画面連鎖だけを破棄する。保存型ジョブは別画面でも継続する。
  state.farmRun = null;
  // 塔の案内は次の画面へ持ち越さない。**登坂そのもの(trialTowerRun)は消さない**
  // ――あれは控えに残る進みで、画面を移っただけで捨ててはいけない
  state.towerNotice = null;
  state.towerOutcome = null;
  state.towerStopRequested = false;
  render();
}

function openPartyFrom(context: DungeonReturnContext, mode: PartyEditMode): void {
  state.returnContext = keepReturnContext(state.returnContext, context);
  state.partyEditMode = mode;
  state.partySelectedSlot = null;
  state.screen = "PARTY";
  render();
}

function returnFromParty(): void {
  const context = state.returnContext;
  state.returnContext = null;
  if (!context) { navigate("HOME"); return; }
  const restored = restoreDungeonSelection(context);
  state.screen = restored.screen;
  state.selectedStageId = restored.selectedStageId;
  state.selectedDifficulty = restored.selectedDifficulty;
  state.selectedDungeonFloor = restored.selectedDungeonFloor;
  state.selectedDungeonKind = restored.selectedDungeonKind;
  state.selectedGoldDungeonFloor = restored.selectedGoldDungeonFloor;
  state.selectedLevelDungeonTier = restored.selectedLevelDungeonTier;
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
  const owner = findEquippedOwner(state.player, equipmentId);
  if (owner && owner.id !== monsterId) {
    const ownerName = findMonsterById(owner.dexId)?.name ?? owner.dexId;
    if (!window.confirm(`${ownerName}から外してこのモンスターへ装備しますか？`)) return;
  }
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
  if (targets.some((e) => e.locked)) {
    state.equipmentSelectedIds = state.equipmentSelectedIds.filter((id) => !state.player.equipment.find((e) => e.id === id)?.locked);
    playSfx("denied", 0.7);
    render();
    return;
  }
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

  // **費用も同じ呼び出しで引く。** 別々にすると、片方だけ通る道ができる
  const result = applyMonsterCreate(
    target, material, slot, state.player.partyIds, state.player.dungeonPartyIds, state.player);
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
  const transaction = executeMonsterPowerUp(
    state.player.monsters,
    target.id,
    state.monsterTrainingMaterialIds,
    state.player.partyIds,
  );
  if (!transaction.ok) {
    playSfx("denied", 0.7);
    return;
  }

  playSfx("levelUp");
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
      // 同じ相手へもう一度。焼いた防衛を持っているので、そのまま組み直せる
      startArenaMatch(last.entry);
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
      /*
       * **トップではなく、相手の一覧へ戻す。**
       * `navigate` はアリーナの中の行き先を畳むので、そのあとで開き直す。
       * 一覧はここへ来る前に組んであるものをそのまま使う——組み直すと
       * 相手の顔ぶれが変わり、「さっき戦った人にもう一度」ができなくなる。
       */
      navigate("ARENA");
      state.arenaView = "OPPONENTS";
      render();
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
  /*
   * **アリーナに「もう一度」は出さない。**
   *
   * ほかの場所の「もう一度」は同じ階へ挑み直すことで、周回そのものが遊びの形に
   * なっている。アリーナは違う。相手は毎回選ぶもので、同じ人へ挑み直すのは
   * 「選ぶ」を飛ばすだけになる。勝った相手にもう一度挑んで挑戦券を1枚使うのは、
   * ほとんどの場合やりたいことではない。
   *
   * 代わりに「選び直す」を主役にして、押したらすぐ相手の一覧へ行く
   * (依頼主の指定)。同じ相手へ挑み直したい時も、その一覧に並んでいる。
   */
  const isArena = last?.kind === "ARENA";
  /*
   * **アリーナで「もう一度」を出すのは、負けた時だけ**(依頼主の指定)。
   *
   * 勝った相手へもう一度挑んで挑戦券を1枚使うのは、ほとんどの場合
   * やりたいことではない。負けた時は違う——**同じ相手に挑み直したい**のが
   * 素直な流れなので、そこだけ残す。
   */
  const arenaRetry = isArena && state.stageResult?.cleared === false;
  if (last && (!isArena || arenaRetry)) {
    actions.push({
      // アリーナはスタミナではなく挑戦券で回す。⚡0 と出すと「無料で回せる」と読めてしまう
      label: fromAutoFarm
        ? `🔁 もう一度 ×${state.autoFarmCount}`
        : arenaRetry
          ? "🔁 同じ相手にもう一度 (挑戦券1)"
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
  actions.push({
    label: isArena ? "⚔ 相手を選び直す" : "🗺 選び直す",
    /*
     * 主役は1つだけ。勝った時のアリーナには「もう一度」が無いので、
     * ここが主役になる。負けた時は「同じ相手にもう一度」が主役。
     */
    variant: isArena && !arenaRetry ? "primary" : undefined,
    run: backToLastRunList,
  });
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
    const difficulty = job.difficulty ?? "NORMAL";
    let alive = party;
    let hp: Map<string, number> | null = null;
    let waves = 0;
    for (const wave of stage.waves) {
      const setup = setupWaveBattle(alive, hp, wave, state.player.equipment, difficulty);
      const engine = new BattleEngine(setup.playerDefs, setup.enemyDefs, { initialPlayerHp: setup.initialPlayerHp });
      if (engine.run().winner !== "PLAYER") return { won: false, waves, extraGold: waves * stageWaveGold(stage, difficulty) };
      const survivors = extractSurvivors(engine, alive);
      alive = survivors.survivorInstances; hp = survivors.survivorHp; waves += 1;
    }
    return { won: true, waves, extraGold: waves * stageWaveGold(stage, difficulty) };
  }
  const target = job.kind === "EQUIP_DUNGEON"
    ? findDungeonFloorByKey(job.targetId)
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
  if (job.completedRuns >= job.requestedRuns) { finishBackgroundFarm(job, "COMPLETED"); savePlayerState(state.player); refreshBackgroundFarmStatus(); return; }
  if (shouldStopForJstDateChange(job)) { finishBackgroundFarm(job, "DAILY_LIMIT"); savePlayerState(state.player); refreshBackgroundFarmStatus(); return; }
  const party = backgroundParty(job);
  if (party.length !== job.partyIds.length || party.length === 0) { finishBackgroundFarm(job, "NO_PARTY"); savePlayerState(state.player); refreshBackgroundFarmStatus(); return; }
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
    if (blocked) { finishBackgroundFarm(job, blocked); savePlayerState(state.player); refreshBackgroundFarmStatus(); return; }
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
  if (!battle.won) { job.inFlight = false; finishBackgroundFarm(job, "DEFEAT"); savePlayerState(state.player); refreshBackgroundFarmStatus(); return; }
  let reward: ClearRewardResult;
  if (job.kind === "STAGE") reward = applyStageClearRewards(state.player, STAGES.find((s) => s.id === job.targetId)!, battle.waves, party, job.difficulty);
  else if (job.kind === "EQUIP_DUNGEON") reward = applyDungeonClearRewards(state.player, findDungeonFloorByKey(job.targetId)!, party);
  else if (job.kind === "LEVEL_DUNGEON") reward = applyLevelDungeonClearRewards(state.player, LEVEL_DUNGEON_DEFS.find((f) => f.tier === job.targetId)!, party);
  else reward = applyGoldDungeonClearRewards(state.player, GOLD_DUNGEON_FLOORS.find((f) => String(f.floor) === job.targetId)!, party);
  state.player.gold += battle.extraGold;
  mergeReward(job.result, reward, battle.extraGold);
  job.result.cleared += 1; job.completedRuns += 1; job.inFlight = false;
  // 実行にかかったCPU時間で権利を失わない。経過した基準時間を1周ぶんだけ消費する。
  job.lastProcessedAt = Math.min(Date.now(), job.lastProcessedAt + job.referenceRunSeconds * 1000);
  savePlayerState(state.player);
  // 周回の保存・報酬反映は上で完了済み。前景DOMは作り直さず、常駐カードだけ更新する。
  // 召喚演出や入力、スクロールなど画面固有の状態をバックグラウンド処理から守る。
  refreshBackgroundFarmStatus();
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
    pigDrops: reward?.pigDrops,
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
  if (cleared) recordManualBattle(state.player.recentManualClearTimes, manualClearKey("EQUIP_DUNGEON", dungeonFloorKey(floor)), run.manualStartedAt, Date.now());

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
  beginBackgroundFarm({ kind: "EQUIP_DUNGEON", targetId: dungeonFloorKey(floor), targetName: floor.name, requestedRuns: count }, state.player.dungeonPartyIds, isDungeonFloorCleared(state.player, floor.floor, floor.kind));
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

/** 何人並べるか。実プレイヤーが足りない分はNPCで埋める */
const ARENA_CANDIDATE_COUNT = 5;

/**
 * 自分の識別子。
 *
 * **対戦の種を流用しない。** 種は「相手を変える」で進むので、
 * 押すたびに自分のIDが変わってしまい、自分を候補から外す判定も
 * ランキングの自分判定も成立しなくなる。控えに焼いたUUIDを使う。
 */
/**
 * 自分のアリーナID。
 *
 * **繋がっている時は `auth.uid()` が正。** 端末が作ったUUIDは、
 * オフラインで自分を候補から外すためだけの器で、名乗るだけで誰にでもなれる。
 * サーバ側の判定(自分除外・順位表の自分・防衛の持ち主)は
 * すべて `auth.uid()` で行うので、画面もそれに合わせないと
 * 「サーバは他人だと言っているのに、画面では自分」がすれ違う。
 */
function arenaSelfId(): string {
  return arenaAuthUserId() ?? state.player.arenaLocalId;
}

/**
 * サーバに繋ぐ。**アリーナを開いた時に1度だけ。**
 *
 * 順番に意味がある:
 *
 *   1. 匿名ログイン    …… `auth.uid()` が無いと、書き込み系のRPCは全て弾かれる
 *   2. プロフィール    …… 順位表に載るための行。無いと自分だけ表に出ない
 *   3. サーバの状態     …… レート・コイン・挑戦券は**サーバが正**。
 *                          ここで引き寄せないと、画面だけ古い数字を出し続ける
 *
 * どれも失敗してよい。失敗したらオフラインのアリーナとして動く。
 * **`connected` が false の間は、通貨を動かす操作をサーバへ送らない。**
 */
let arenaConnecting: Promise<boolean> | null = null;
type ArenaConnectionStatus = "UNCONFIGURED" | "IDLE" | "CONNECTING" | "ONLINE" | "OFFLINE";
let arenaConnectionStatus: ArenaConnectionStatus = arenaSyncAvailable() ? "IDLE" : "UNCONFIGURED";

async function connectArena(): Promise<boolean> {
  if (!arenaSyncAvailable()) {
    arenaConnectionStatus = "UNCONFIGURED";
    return false;
  }
  if (arenaConnecting) return arenaConnecting;
  arenaConnectionStatus = "CONNECTING";
  arenaConnecting = (async () => {
    const auth = await ensureArenaAuth();
    if (!auth) {
      arenaConnectionStatus = "OFFLINE";
      return false;
    }
    const profile = await ensureArenaProfile(state.player.fighterName || "プレイヤー");
    if (!profile) {
      arenaConnectionStatus = "OFFLINE";
      return false;
    }
    const remote = await fetchArenaState();
    if (!remote) {
      arenaConnectionStatus = "OFFLINE";
      return false;
    }
    applyArenaServerState(remote);
    arenaConnectionStatus = "ONLINE";
    await reconcileArenaShopPurchases();
    return true;
  })().finally(() => { arenaConnecting = null; });
  return arenaConnecting;
}

/**
 * サーバが持っている数字を控えへ写す。
 *
 * **画面の数字はサーバの値に合わせる。** ローカルで進めた値を残すと、
 * 「買ったのに減っていない」「勝ったのに上がっていない」がその場では
 * 起きないまま、次に開いた時にまとめて飛ぶ。ずれは早く潰す。
 */
function applyArenaServerState(remote: Record<string, unknown>): void {
  /*
   * `arena_state()` は入れ子で返る:
   *   { seasonId, profile, standing: { rating, best_rating, ... },
   *     wallet: { coins, tickets, ... } }
   *
   * **平らだと思って読んでいて、1つも取り込めていなかった。**
   * 形が違えば黙って何もしないので、気づく手がかりも出なかった。
   */
  const nested = (group: string, key: string): number | null => {
    const box = remote[group];
    if (typeof box !== "object" || box === null) return null;
    const value = (box as Record<string, unknown>)[key];
    return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
  };

  const rating = nested("standing", "rating");
  const best = nested("standing", "best_rating");
  const coins = nested("wallet", "coins");
  const tickets = nested("wallet", "tickets");
  if (rating !== null) state.player.arenaPoints = Math.max(0, rating);
  if (best !== null) state.player.arenaSeasonBestPoints = Math.max(0, best);
  if (coins !== null) state.player.arenaCoins = Math.max(0, coins);
  if (tickets !== null) state.player.arenaTickets = Math.max(0, tickets);
  savePlayerState(state.player);
}

/** 繋がっている時の残高は**サーバの値が正**。受け取ったら必ず合わせる */
function adoptArenaCoinBalance(remote: Record<string, unknown> | null): void {
  if (!remote) return;
  const balance = remote.coinBalance;
  if (typeof balance === "number" && Number.isFinite(balance)) {
    state.player.arenaCoins = Math.max(0, Math.round(balance));
  }
}

let arenaShopReconciling: Promise<number> | null = null;

/** 購入成立後に通信が切れても、未受取の領収書から安全に再開する。 */
async function reconcileArenaShopPurchases(): Promise<number> {
  if (arenaShopReconciling) return arenaShopReconciling;
  arenaShopReconciling = (async () => {
    const pending = await fetchPendingArenaShopPurchases();
    let fulfilled = 0;
    for (const receipt of pending) {
      const result = fulfillArenaShopPurchase(
        state.player,
        receipt.itemId,
        receipt.purchaseId,
        receipt.quantity,
        receipt.purchasedAt,
      );
      if (!result.ok) continue;
      // **先に控えへ保存する。** 保存後に通信が切れても購入IDが二重付与を止める。
      savePlayerState(state.player);
      if (await acknowledgeArenaShopPurchase(receipt.purchaseId)) fulfilled += result.alreadyFulfilled ? 0 : 1;
    }
    return fulfilled;
  })().finally(() => { arenaShopReconciling = null; });
  return arenaShopReconciling;
}

/**
 * 対戦候補を組み直す。
 *
 * **実プレイヤーを先に、足りない分をNPCで埋める。** 人口が少ない前提なので、
 * 実プレイヤーが0人でも必ず5人並ぶ。未接続なら `fetchArenaOpponents` が
 * 通信せず空を返すので、そのままNPCだけになる。
 */
async function refreshArenaCandidates(): Promise<void> {
  const rating = state.player.arenaPoints;
  const seed = state.player.arenaOpponentSeed;
  const npcs = buildArenaNpcs(rating, seed, ARENA_CANDIDATE_COUNT * 2);
  // まずNPCだけで即座に並べる。通信を待つ間、画面が空にならないようにする
  state.arenaCandidates = buildArenaCandidates([], npcs, {
    count: ARENA_CANDIDATE_COUNT,
    selfId: arenaSelfId(),
    recentIds: state.player.arenaRecentOpponentIds,
  });
  if (!(await connectArena())) return;
  state.arenaCandidatesLoading = true;
  const players = await fetchArenaOpponents(arenaSelfId(), rating, ARENA_CANDIDATE_COUNT);
  state.arenaCandidatesLoading = false;
  // 戻ってくる頃に別の画面へ移っていることがある。その時は捨てる
  if (state.screen !== "ARENA") return;
  state.arenaCandidates = buildArenaCandidates(players, npcs, {
    count: ARENA_CANDIDATE_COUNT,
    selfId: arenaSelfId(),
    recentIds: state.player.arenaRecentOpponentIds,
  });
  render();
}

/**
 * シーズン報酬を受け取る。
 *
 * **繋がっていればサーバが先。** 二重受取はサーバの一意制約
 * (`arena_reward_claims_once`)が物理的に止める。そこが通ってから手元へ配る。
 * 未接続なら手元だけで完結する(オフラインでも遊べる状態を壊さない)。
 */
async function claimArenaSeasonRewardBoth(bestRatingOfEndedSeason: number): Promise<void> {
  let remote: Record<string, unknown> | null = null;
  let verifiedTierId: ArenaTierId | undefined;
  if (await connectArena()) {
    const claimed = await claimArenaSeasonReward();
    if (!claimed) return;
    if (!claimed.ok) return;
    remote = { coinBalance: claimed.coinBalance };
    verifiedTierId = claimed.tierId ?? undefined;
  }
  const result = claimArenaSeasonRewardLocal(
    state.player,
    bestRatingOfEndedSeason,
    Date.now(),
    verifiedTierId,
  );
  adoptArenaCoinBalance(remote);
  savePlayerState(state.player);
  if (!result.ok) return;
  state.arenaNotice = `${result.tierName} のシーズン報酬を受け取りました`;
  render();
}

/**
 * サーバの戦績を控えへ写す。
 *
 * 繋がっている時、防衛の記録を作るのは**攻めてきた相手**であって自分ではない。
 * だから手元では作れない。サーバの `arena_matches` から引いてくる。
 */
async function refreshArenaHistory(): Promise<void> {
  const records = await fetchArenaMatchHistory(arenaSelfId(), ARENA_HISTORY_MAX);
  if (records.length === 0) return;
  state.player.arenaMatchHistory = records.slice(0, ARENA_HISTORY_MAX);
  savePlayerState(state.player);
  render();
}

/** ランキングを引き直す。未接続なら何もしない(嘘の順位を出さないため) */
async function refreshArenaRanking(): Promise<void> {
  if (!(await connectArena())) {
    state.arenaRankingTop = [];
    state.arenaRankingAround = [];
    state.arenaMyRank = null;
    return;
  }
  state.arenaRankingLoading = true;
  render();
  const [top, around] = await Promise.all([
    fetchArenaRanking(100),
    fetchArenaRankingAround(arenaSelfId(), 5),
  ]);
  state.arenaRankingLoading = false;
  state.arenaRankingTop = top;
  state.arenaRankingAround = around;
  state.arenaMyRank = around.find((entry) => entry.userId === arenaSelfId())?.rank ?? null;
  render();
}

function startArenaMatch(entry: ArenaOpponentEntry): void {
  const party = getArenaTeam(state.player, "OFFENSE");
  if (party.length === 0) {
    state.arenaNotice = "攻撃編成を組んでください";
    render();
    return;
  }
  if (entry.defense.units.length === 0) {
    state.arenaNotice = "この相手は防衛編成を登録していません";
    playSfx("denied", 0.7);
    render();
    return;
  }
  // アリーナはスタミナではなく挑戦券で回す。育成の周回と取り合いにしないため
  applyArenaTicketRegen(state.player);
  if (state.player.arenaTickets <= 0) {
    state.arenaNotice = "挑戦券が足りません";
    playSfx("denied", 0.7);
    render();
    return;
  }

  state.arenaNotice = null;
  state.lastRun = { kind: "ARENA", entry };
  state.arenaEntry = entry;
  state.arenaTicket = null;
  state.arenaAttackerSnapshot = null;

  /*
   * **繋がっているなら、始める前にサーバへ1戦を発行してもらう。**
   *
   * 返ってくるのは対戦ID・nonce・**サーバが決めた乱数の種**、そして
   * 相手が実プレイヤーならサーバが持っている防衛編成。
   *
   * ここを待たずに戦闘を始めていた頃は、画面が `Math.random` で戦い、
   * サーバは別の種で戦い直していた。**同じ戦いを2回やっているつもりで、
   * 実際には別の戦いだった。** 勝ったのに負け、が普通に起きる。
   * だから待つ。待つ間は「準備しています」と出す。
   *
   * 発行できなければ(未接続・通信断)ローカルだけで進む。
   * その時は勝敗も手元の計算になる——オフラインで遊べる状態は壊さない。
   */
  if (!arenaSyncAvailable()) {
    trySpendArenaTicket(state.player);
    savePlayerState(state.player);
    state.screen = "ARENA_BATTLE";
    render();
    return;
  }

  state.arenaNotice = "対戦を準備しています…";
  render();

  // 攻撃編成も防衛と同じ形で焼く。**サーバは同じ検分をかける**
  const attackerSnapshot = captureArenaDefense(party, state.player.equipment);

  void (async () => {
    const ticket = (await connectArena())
      ? await beginArenaMatch({
        kind: entry.kind,
        attackerSnapshot,
        opponentId: entry.kind === "PLAYER" ? entry.id : null,
        opponentSeed: entry.kind === "NPC" ? String(state.player.arenaOpponentSeed) : null,
        opponentIndex: entry.kind === "NPC" ? (entry.npcGenerationIndex ?? entry.index) : null,
        opponentCount: entry.kind === "NPC" ? ARENA_CANDIDATE_COUNT * 2 : null,
        opponentName: entry.name,
      })
      : null;

    // 待っている間に別の画面へ移っていることがある。その時は始めない
    if (state.arenaEntry !== entry) return;

    if (ticket) {
      // 挑戦券はサーバが引いた。**手元で二重に引かない**
      state.arenaTicket = ticket;
      state.arenaAttackerSnapshot = attackerSnapshot;
      state.player.arenaTickets = ticket.tickets;
    } else {
      state.arenaNotice = null;
      trySpendArenaTicket(state.player);
    }
    savePlayerState(state.player);
    state.arenaNotice = null;
    state.screen = "ARENA_BATTLE";
    render();
  })();
}

/**
 * 決着を反映する。
 *
 * **画面はレートもコインも触らない。** どちらもいくら動くかは
 * `recordArenaMatch` が決める(`game/arena/match.ts`)。
 * ここがやるのは、その結果を見せることだけ。
 */
function finishArenaMatch(won: boolean): void {
  const entry = state.arenaEntry;
  if (!entry) return;

  const before = arenaTierForRating(state.player.arenaPoints);
  const outcome = recordArenaMatch(state.player, { opponent: entry, won, side: "OFFENSE" });
  const after = arenaTierForRating(outcome.ratingAfter);
  savePlayerState(state.player);

  /*
   * **繋がっていれば、勝敗そのものをサーバに決めてもらう。**
   *
   * 送るのは「この対戦を精算してくれ」だけ。勝敗を送る欄が無い。
   * Edge Function が発行時の種と編成で戦闘を回し直し、そこで出た
   * 勝敗で確定する。同じ入力からは同じ結果しか出ないので、
   * 画面で見た決着と食い違うことはない。
   *
   * 失敗しても進行は止めない。ローカルの記録だけで遊べる状態を保つ。
   */
  void (async () => {
    const ticket = state.arenaTicket;
    state.arenaTicket = null;
    if (!ticket) return;
    const report = await settleArenaMatch(ticket.matchId, ticket.nonce);
    if (!report) return;
    state.player.arenaPoints = report.rating;
    state.player.arenaCoins = report.coinBalance;
    state.player.arenaTickets = report.tickets;
    if (state.player.arenaPoints > state.player.arenaSeasonBestPoints) {
      state.player.arenaSeasonBestPoints = state.player.arenaPoints;
    }
    const record = state.player.arenaMatchHistory.find((item) => item.id === outcome.record.id);
    if (record) {
      // **勝敗もサーバの答えを控える。** 種と編成が同じなので普通は一致するが、
      // 一致しなかった時に手元の言い分だけが残るのはおかしい
      record.won = report.won;
      record.ratingDelta = report.ratingDelta;
      record.ratingAfter = report.rating;
      record.coins = report.coins;
    }
    savePlayerState(state.player);
  })();

  const rankLine = outcome.tierChanged
    ? outcome.ratingAfter > outcome.ratingBefore
      ? `${after.name}へ昇格！`
      : `${after.name}へ降格`
    : null;
  void before;

  /*
   * 結果画面は `goldEarned` などが全部0だと「獲得したものはありません」と出る。
   * アリーナで手に入るのはレートとコインなので、**場所の名前に添えて必ず見せる。**
   * (レートの増減はアリーナ画面へ戻るまで出ない `arenaNotice` にしか無かった)
   */
  const gainLine = `${outcome.record.ratingDelta >= 0 ? "+" : ""}${outcome.record.ratingDelta} レート ・ 🎫+${outcome.record.coins}`;
  state.stageResult = {
    cleared: won,
    stageName: `アリーナ ${entry.name}（${gainLine}）`,
    goldEarned: 0,
    crystalEarned: 0,
    wavesCleared: won ? 1 : 0,
    totalWaves: 1,
    levelUps: [],
    dropDexId: null,
    dropStar: null,
    equipmentDrop: null,
    pigDrop: null,
    summonScrollDropped: false,
    fighterLevelsGained: 0,
  };
  // レートの増減と昇降格は、勝敗そのものと同じくらい見たい情報
  state.arenaNotice = [
    `${outcome.record.ratingDelta >= 0 ? "+" : ""}${outcome.record.ratingDelta} レート（${outcome.ratingAfter}）`,
    `アリーナコイン +${outcome.record.coins}`,
    rankLine,
  ]
    .filter(Boolean)
    .join(" / ");
  state.arenaEntry = null;
  state.arenaCandidates = [];
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
    trialTowerFloor: setup.floor.floor,
  });

  const traitLabel = TOWER_TRAIT_LABEL[setup.floor.trait];
  return renderBattleView({
    engine,
    playerTeam: setup.playerDefs,
    enemyTeam: setup.enemyDefs,
    title: `塔 ${setup.floor.floor}階${traitLabel ? ` ${traitLabel}` : ""}`,
    // 塔は上っていく1つの場所。階ごとに舞台が変わると上っている感じが消える
    venue: "tower",
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
  const entry = state.arenaEntry;
  if (!entry) throw new Error("arenaEntry is not set");

  /*
   * **敵側は焼いた防衛からしか作らない。**
   * 相手の手持ちを今から読み直すと、登録後に本人が装備を外しただけで
   * 相手の画面の編成が崩れる。
   */
  /*
   * **相手はサーバが控えた編成を優先する。**
   * 発行の時点で固定してあるので、待っている間に相手が防衛を替えても
   * この対戦の相手は替わらない。
   */
  const ticket = state.arenaTicket;
  const opponent = ticket?.defenderSnapshot
    ? { ...entry, defense: ticket.defenderSnapshot }
    : entry;
  const setup = buildArenaEntryBattle(
    getArenaTeam(state.player, "OFFENSE"), opponent, state.player.equipment, state.arenaAttackerSnapshot);
  /*
   * **乱数の種もサーバのものを使う。**
   *
   * ここを `Math.random` のままにしていた時は、画面とサーバが
   * 別々の戦いをしていた(同じ戦いを2回やっているつもりで)。
   * 戦闘エンジンは種を渡せば決定的なので、同じ種なら同じ経過になる。
   * 未接続なら種は無い——その時は勝敗も手元の計算なので、食い違いようがない。
   */
  const engine = new BattleEngine(setup.playerDefs, setup.enemyDefs,
    ticket ? { rng: arenaNpcRng(ticket.battleSeed | 0) } : {});

  return renderBattleView({
    engine,
    playerTeam: setup.playerDefs,
    enemyTeam: setup.enemyDefs,
    title: `vs ${entry.name}`,
    // 対人戦は観客のいる闘技場。それ自体がアリーナの空気になっている
    venue: "duel",
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
        run.goldEarned += stageWaveGold(run.stage, run.difficulty);
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

/**
 * 自動周回の進捗。**浮かせない。画面の流れの中に置く。**
 *
 * ここはドラッグとドック(左端へ収納)まで持つ浮遊パネルだった。
 * 実機ではホームの左に幅176pxで貼り付き、収納ボタンのぶん左を40px空けるので
 * 文字の入る幅が130px弱しか残らない。`overflow-wrap:anywhere` と合わさって
 * **「ステ / ージ / 3- / 5 0 / 5周 / 行中」と1〜3文字ずつ折り返していた**。
 * 同時に「お知らせ」のボタンと世界の絵も覆っていた。
 *
 * 浮かせる限り、位置は画面の大きさと無関係な固定値になり、下の何かを必ず覆う。
 * 共通の帯(`.tutorial-bar`)へ寄せる。横一列で、幅は画面いっぱい、
 * 押す的は40px以上、はみ出したら巡回が拾う。
 */
/**
 * 周回の帯を畳んだままにするか。
 *
 * 起動をまたいで残す。周回は何十分も続くので、開くたび畳み直すのでは
 * 畳めるようにした意味が無い。**セーブには入れない**——これは端末ごとの
 * 見た目の好みで、進行ではない。
 */
const FARM_BAR_FOLD_KEY = "crimon.farm-bar.folded.v1";

function farmBarFolded(): boolean {
  try { return localStorage.getItem(FARM_BAR_FOLD_KEY) === "1"; } catch { return false; }
}

function setFarmBarFolded(folded: boolean): void {
  try { localStorage.setItem(FARM_BAR_FOLD_KEY, folded ? "1" : "0"); } catch { /* 見た目の設定はゲームを止めない */ }
}

function buildBackgroundFarmBar(job: BackgroundFarmJob): HTMLElement {
  const running = job.status === "RUNNING";
  const status = running ? "進行中" : job.status === "COMPLETED" ? "完了" : "終了";
  const folded = farmBarFolded();
  const openResult = () => {
    state.autoFarmResult = job.result;
    state.autoFarmTargetName = job.targetName;
    state.viewingBackgroundFarmJobId = job.id;
    state.screen = "AUTO_FARM_RESULT";
    render();
  };
  const toggleFold = () => { setFarmBarFolded(!folded); refreshBackgroundFarmStatus(); };
  const shell = (children: HTMLElement[]) => el("section", {
    className: `tutorial-bar tutorial-bar--farm${running ? "" : " tutorial-bar--farm-done"}${folded ? " tutorial-bar--farm-folded" : ""}`,
    "data-background-farm-bar": "",
    "aria-label": "自動周回の進捗",
  }, children);

  /*
   * 畳んだ姿。**帯ごと1つの的にする。**
   *
   * 中に小さな開くボタンを置く形も試したが、押す的は40pxを下回らせないので
   * 帯の高さが58→50pxまでしか縮まず、畳んだ意味がほとんど無かった。
   * 帯そのものをボタンにすれば、40pxの下限が帯の高さと一致する。
   *
   * **畳んでも消さない。** 周回は何十分も動き続けるので、完全に消せると
   * 「回っていることを忘れた」状態が作れてしまう。
   * 畳んだ姿でも行き先と進み具合(3/10)は残す。
   */
  if (folded) {
    return shell([
      el("button", {
        type: "button",
        className: "tutorial-bar__unfold",
        "aria-label": "自動周回の詳細を開く",
        "aria-expanded": "false",
        onclick: toggleFold,
      }, [
        el("span", { className: "tutorial-bar__unfold-count" }, [`${job.completedRuns}/${job.requestedRuns}`]),
        el("span", { className: "tutorial-bar__unfold-title" }, [`🔁 ${job.targetName}　${status}`]),
        el("span", { className: "tutorial-bar__unfold-chevron", "aria-hidden": "true" }, ["▾"]),
      ]),
    ]);
  }

  return shell([
    el("div", { className: "tutorial-bar__badge" }, [
      el("small", {}, ["周回"]),
      el("strong", {}, [`${job.completedRuns}/${job.requestedRuns}`]),
    ]),
    el("div", { className: "tutorial-bar__text" }, [
      el("div", { className: "tutorial-bar__title" }, [`🔁 ${job.targetName}　${status}`]),
    ]),
    el("div", { className: "tutorial-bar__actions" }, [
      running
        ? el("button", { type: "button", className: "btn btn--ghost", onclick: () => {
          finishBackgroundFarm(job, "STOPPED"); savePlayerState(state.player); refreshBackgroundFarmStatus();
        } }, ["終了"])
        : el("button", { type: "button", className: "btn btn--primary", onclick: openResult }, ["結果"]),
      el("button", {
        type: "button",
        className: "tutorial-bar__fold",
        "aria-label": "自動周回を畳む",
        "aria-expanded": "true",
        onclick: toggleFold,
      }, ["▴"]),
    ]),
    /*
     * 稼ぎは**2段目に丸ごと回す。**
     *
     * 進んだ数は札(3/10)が持っているので、ここには稼ぎだけを出す。
     * それでも1行目に同居させると、行き先と終了ボタンと畳む的で幅を取り合い、
     * 末尾から切り落とされる(実機で「🪙246,000 / 装備15」が「246,…」になった)。
     * 2段目なら幅の取り合いが起きないので、桁が伸びても切れない。
     */
    el("div", { className: "tutorial-bar__cond tutorial-bar__cond--full" }, [
      el("span", {}, [
        `⚡${job.staminaSpent} / EXP ${job.result.totalExp.toLocaleString("ja-JP")}`
        + ` / 🪙${job.result.totalGold.toLocaleString("ja-JP")} / 装備${job.result.equipmentDropCount}`,
      ]),
    ]),
  ]);
}

function goTutorialDestination(destination: TutorialDestination): void {
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
}

/**
 * 初心者ミッションの案内。
 *
 * **浮かせない。画面の流れの中に置く。**
 *
 * 以前はドラッグできる浮遊パネルにしていた。位置は画面の左上に固定なので、
 * モンスター画面の絞り込みと並べ替え、装備画面のボタン、ステージの「次はここ」を
 * 覆って**押せなくしていた**。型もテストも全部通っていた(巡回だけが拾えた)。
 *
 * 浮いている限り、下にある何かを必ず覆う。ドラッグで避けられるのは
 * 「気づいた人」だけで、案内が要る初心者ほど気づけない。だから流し込みへ変えた。
 */
function buildTutorialBar(): HTMLElement | null {
  if (state.screen === "HOME") return null; // ホームは専用の大きな札を持っている
  if (BATTLE_SCREENS.has(state.screen)) return null; // 戦闘中に出す用事は無い
  const mission = nextTutorialMission(state.player);
  if (!mission) return null;
  const complete = canClaimTutorialMission(state.player, mission);
  const missionProgress = tutorialMissionProgress(state.player, mission);
  const progress = `${missionProgress.current} / ${missionProgress.target}`;
  return el("section", {
    className: `tutorial-bar${complete ? " tutorial-bar--ready" : ""}`,
    "data-tutorial-bar": "",
    "aria-label": "初心者ミッション",
  }, [
    el("div", { className: "tutorial-bar__badge" }, [
      el("span", {}, ["STEP"]),
      el("strong", {}, [String(mission.step)]),
    ]),
    el("div", { className: "tutorial-bar__text" }, [
      el("div", { className: "tutorial-bar__title" }, [complete ? `🎯 ${mission.title} 達成！` : mission.title]),
      el("div", { className: "tutorial-bar__cond" }, [
        el("span", {}, [mission.condition]),
        el("span", { className: "tutorial-bar__progress" }, [progress]),
      ]),
    ]),
    el("div", { className: "tutorial-bar__actions" }, [
      el("button", { type: "button", className: "btn btn--ghost", onclick: () => goTutorialDestination(mission.destination) }, ["移動する"]),
      ...(complete ? [el("button", { type: "button", className: "btn btn--primary", onclick: () => {
        if (claimTutorialMission(state.player, mission.id)) { savePlayerState(state.player); playSfx("stageClear"); }
        render();
      } }, ["報酬を受け取る"])] : []),
    ]),
  ]);
}

/** 戦闘中は出さない。戦闘画面は自前の全画面配置なので、帯を差し込む場所が無い */
function buildFarmBar(): HTMLElement | null {
  if (BATTLE_SCREENS.has(state.screen)) return null;
  const job = state.player.backgroundFarmJob;
  return job ? buildBackgroundFarmBar(job) : null;
}

/**
 * 案内と進捗の帯を、画面の一番上へ差し込む。
 * `.screen` を持たない画面(戦闘)へは入れない。
 *
 * **ホームだけは差し込み先が違う。** ホームは `100dvh` を分け合う縦並びで、
 * 一番外の `.crimon-home` の外へ足すと画面からはみ出す。世界の枠と同じ親へ入れて、
 * 高さは `--home-farm-h` で申告する(申告しないと `.home-world` が黙って潰れ、
 * 「試練の塔」が切り落とされて押せなくなる。過去に出している事故)。
 */
function mountTutorialBar(content: HTMLElement): void {
  const bar = buildTutorialBar();
  if (bar) content.prepend(bar);
  const farm = buildFarmBar();
  if (!farm) return;
  const world = content.querySelector(".home-world");
  if (world) world.before(farm); else content.prepend(farm);
}

/** 前景画面には触れず、周回の帯だけを差分更新する。 */
function refreshBackgroundFarmStatus(): void {
  const current = root.querySelector<HTMLElement>("[data-background-farm-bar]");
  const next = buildFarmBar();
  if (next) {
    // まだ出ていない時は次の描画へ任せる。差し込み先を推測しない
    if (current) current.replaceWith(next);
  } else {
    current?.remove();
  }
  // 進捗の数字だけが動くので、既に出ている案内を差し替える。
  // まだ出ていない場合は次の描画に任せる(差し込み先を推測しない)。
  const tutorialCurrent = root.querySelector<HTMLElement>("[data-tutorial-bar]");
  if (!tutorialCurrent) return;
  const tutorialNext = buildTutorialBar();
  if (tutorialNext) tutorialCurrent.replaceWith(tutorialNext);
  else tutorialCurrent.remove();
}

function render(): void {
  if (lastRouteKey !== null) scrollPositions.set(lastRouteKey, window.scrollY);
  /*
   * 通ってきた場所を積むのは**描き始める前**。
   * 描き終えてから積むと、移った当回はまだ履歴が空で、
   * その1回だけ「戻る」が出ない画面になる(実際にそうなった)。
   */
  if (lastRouteState !== null && !restoringRoute && routeKey() !== lastRouteKey) {
    routeHistory.push(lastRouteState);
    if (routeHistory.length > ROUTE_HISTORY_MAX) routeHistory.shift();
    lastRouteState = null;
  }
  farmEquipmentScrollTop = rememberedScrollTop(root.querySelector<HTMLElement>(".farm-equip-sheet__panel"), farmEquipmentScrollTop);

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
        onGoMonsters: () => navigate("MONSTERS"),
        onGoEquipment: () => navigate("EQUIPMENT"),
        onGoMonsterDex: () => navigate("MONSTER_DEX"),
        onGoStages: () => navigate("STAGES"),
        onGoParty: () => navigate("PARTY"),
        onViewPartyMonster: (id) => { state.monsterDetailId = id; state.screen = "MONSTERS"; render(); },
        onGoEquipDungeon: () => navigate("EQUIP_DUNGEON"),
        onGoLevelDungeon: () => navigate("LEVEL_DUNGEON"),
        onGoGoldDungeon: () => navigate("GOLD_DUNGEON"),
        onGoShop: () => navigate("SHOP"),
        onGoArena: () => navigate("ARENA"),
        onGoTrialTower: () => navigate("TRIAL_TOWER"),
        onGoHowToPlay: () => navigate("HOW_TO_PLAY"),
        onGoTutorialDestination: goTutorialDestination,
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
        crystalRows: crystalShopRows(state.player),
        onBuyCrystalItem: (itemId: string) => {
          /*
           * **押す前に必ずたずねる。** 700💎の商品を誤タップで買われるのは
           * 取り返しがつかない。金額と中身を1行ずつ出す。
           */
          const row = crystalShopRows(state.player).find((r) => r.item.id === itemId);
          if (!row) return;
          const ok = window.confirm(
            `${row.item.price.toLocaleString("ja-JP")}ダイヤを使用して\n`
            + `${row.item.name} ×${row.item.kind === "GOLD" ? 1 : row.item.amount}\n`
            + `を購入しますか？`,
          );
          if (!ok) return;
          const result = buyCrystalShopItem(state.player, itemId);
          state.shopNotice = result.ok
            ? `${result.item?.name ?? "商品"}を購入しました`
            : (result.reason ?? "購入できませんでした");
          if (result.ok) { savePlayerState(state.player); playSfx("stageClear"); }
          else playSfx("denied", 0.7);
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
        selectedSlot: state.partySelectedSlot,
        onSelectSlot: (index) => { state.partySelectedSlot = state.partySelectedSlot === index ? null : index; render(); },
        onChooseMonster: (instanceId) => {
          const ids = state.partyEditMode === "DUNGEON" ? state.player.dungeonPartyIds : state.partyEditMode === "TOWER" ? state.player.towerPartyIds : state.player.partyIds;
          const slot = state.partySelectedSlot;
          const next = replacePartySlot(ids, slot, instanceId);
          if (!next) return;
          ids.splice(0, ids.length, ...next);
          state.partySelectedSlot = null;
          savePlayerState(state.player);
          render();
        },
        onComplete: state.returnContext ? returnFromParty : undefined,
        returnLabel: state.returnContext?.label,
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
        onGoParty: () => {
          if (!state.selectedStageId) return;
          const stage = STAGES.find((item) => item.id === state.selectedStageId);
          openPartyFrom(normalStageReturnContext(state.selectedStageId, state.selectedDifficulty, stage?.name ?? "通常ステージ"), "NORMAL");
        },
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
        selectedKind: state.selectedDungeonKind,
        onSelectFloor: (kind, floor) => {
          state.selectedDungeonKind = kind;
          state.selectedDungeonFloor = floor;
          render();
        },
        onStartFloor: startDungeonFloor,
        // 専用の編成画面には絞り込みも並べ替えも無く、同じことを2か所で
        // 別々にやらせていた。編成はすべて編成画面へ集約する
        onGoDungeonParty: () => openPartyFrom({ screen: "EQUIP_DUNGEON", label: `${state.selectedDungeonKind === "BEAST" ? "魔獣" : "魔人"}のダンジョン${state.selectedDungeonFloor ?? ""}F`, selectedDungeonFloor: state.selectedDungeonFloor ?? undefined, selectedDungeonKind: state.selectedDungeonKind }, "DUNGEON"),
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
        onGoParty: () => openPartyFrom({ screen: "LEVEL_DUNGEON", label: "レベルダンジョン", selectedLevelDungeonTier: state.selectedLevelDungeonTier ?? undefined }, "NORMAL"),
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
        onGoParty: () => openPartyFrom({ screen: "GOLD_DUNGEON", label: `ゴールドダンジョン${state.selectedGoldDungeonFloor ?? ""}F`, selectedGoldDungeonFloor: state.selectedGoldDungeonFloor ?? undefined }, "NORMAL"),
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

    case "ARENA": {
      if (arenaConnectionStatus === "IDLE") void connectArena().then(() => render());
      const arenaOnline = arenaConnectionStatus === "ONLINE";
      const arenaOffline = arenaConnectionStatus === "UNCONFIGURED" || arenaConnectionStatus === "OFFLINE";
      /*
       * シーズンが変わっていたら、開いた時に締める。
       * **画面を開く前に必ず通る場所でやる。** 遊んでいる最中に
       * レートが勝手に変わると、何が起きたのか分からない。
       */
      const rollover = applyArenaSeasonRollover(state.player);
      if (rollover.changed) {
        savePlayerState(state.player);
        // 締まったシーズンの報酬を受け取る。**繋がっていればサーバが先**
        void claimArenaSeasonRewardBoth(rollover.ratingBefore);
      }
      /*
       * 留守中に攻められた分をさばく。
       *
       * **繋がっている時はやらない。** 繋がっていれば、攻めてくるのは
       * 本物のプレイヤーで、その結果はサーバの `arena_matches` に積まれる。
       * その上でこちらでもNPCに攻めさせると、**サーバが知らないレートの増減**が
       * 手元だけで起きて、次に開いた時にまとめて飛ぶ。
       *
       * オフラインでだけ、NPCが防衛へ挑んでくる。人口任せにすると
       * 「登録すると攻められるようになります」が嘘になるので。
       */
      if (arenaOffline) {
        const defended = runPendingDefenseAttacks(state.player);
        if (defended.attacks > 0) {
          savePlayerState(state.player);
          state.arenaNotice = `留守中に${defended.attacks}回攻められました（${defended.held}回退けた / `
            + `${defended.ratingDelta >= 0 ? "+" : ""}${defended.ratingDelta} レート）`;
        }
      } else if (arenaOnline && !state.arenaHistoryLoaded) {
        // 繋がっている時の戦績は**サーバの記録が正**。攻めも守りも同じ表から来る
        state.arenaHistoryLoaded = true;
        void refreshArenaHistory();
      }
      if (state.arenaCandidates.length === 0 && !state.arenaCandidatesLoading) void refreshArenaCandidates();
      content = renderPvpArena({
        player: state.player,
        view: state.arenaView,
        notice: state.arenaNotice,
        online: arenaOnline,
        myRank: state.arenaMyRank,
        ticketMax: ARENA_TICKET_MAX_V2,
        nextTicketAt: arenaNextTicketAt(state.player),
        candidates: state.arenaCandidates,
        candidatesLoading: state.arenaCandidatesLoading,
        detailEntry: state.arenaDetailIndex === null ? null : (state.arenaCandidates[state.arenaDetailIndex] ?? null),
        unitIndex: state.arenaUnitIndex,
        ranking: {
          loading: state.arenaRankingLoading,
          top: state.arenaRankingTop,
          around: state.arenaRankingAround,
          myUserId: arenaOnline ? arenaSelfId() : null,
        },
        shopRows: arenaShopRows(state.player),
        history: arenaDefenseHistory(state.player).map((record) => ({
          record,
          block: arenaRevengeBlock(record, state.player.arenaTickets),
        })),
        defenseDraftIds: state.arenaDefenseDraftIds,
        offenseMembers: getArenaTeam(state.player, "OFFENSE"),
        onGo: (view) => {
          state.arenaView = view;
          state.arenaNotice = null;
          if (view !== "OPPONENT_DETAIL") state.arenaDetailIndex = null;
          if (view === "RANKING" && state.arenaRankingTop.length === 0) void refreshArenaRanking();
          if (view === "DEFENSE" && state.arenaDefenseDraftIds.length === 0) {
            // 登録済みの顔ぶれを下敷きにする。ゼロから選び直させない
            state.arenaDefenseDraftIds = [...state.player.arenaDefenseIds];
          }
          render();
        },
        onOpenOpponent: (entry) => {
          state.arenaDetailIndex = entry.index;
          state.arenaUnitIndex = 0;
          state.arenaView = "OPPONENT_DETAIL";
          render();
        },
        onSelectUnit: (index) => {
          state.arenaUnitIndex = index;
          render();
        },
        onChallenge: startArenaMatch,
        rerollsLeft: Math.max(0, ARENA_REROLL_LIMIT - state.player.arenaRerollsSinceBattle),
        rerollLimit: ARENA_REROLL_LIMIT,
        onReroll: () => {
          /*
           * 券は減らさない。並んだ相手がどれも噛み合わない時に
           * 券を捨てて選び直させるのは理不尽なので。
           *
           * **代わりに回数で絞る。** 無制限だと、いちばん弱い相手が
           * 出るまで引き直せてしまう。1戦すれば数え直す。
           */
          if (state.player.arenaRerollsSinceBattle >= ARENA_REROLL_LIMIT) {
            state.arenaNotice = "相手を変えられるのは1戦につき3回までです";
            playSfx("denied", 0.7);
            render();
            return;
          }
          state.player.arenaRerollsSinceBattle += 1;
          advanceArenaOpponentSeed(state.player);
          savePlayerState(state.player);
          state.arenaCandidates = [];
          void refreshArenaCandidates();
          render();
        },
        onRefillTickets: () => {
          const result = tryRefillArenaTickets(state.player);
          state.arenaNotice = result.ok ? "挑戦券を回復しました" : (result.reason ?? "回復できませんでした");
          if (result.ok) savePlayerState(state.player);
          render();
        },
        onClaimWeekly: () => {
          /*
           * **繋がっている時は、先にサーバへ通す。**
           * 二重受取はサーバの一意制約が止める。そこが通ってから配る。
           */
          void (async () => {
            let remote: Record<string, unknown> | null = null;
            let verifiedTierId: ArenaTierId | undefined;
            if (await connectArena()) {
              const claimed = await claimArenaWeeklyRewardRemote();
              if (!claimed || !claimed.ok) {
                state.arenaNotice = claimed?.code === "ALREADY_CLAIMED"
                  ? "今週のランク報酬は受け取り済みです"
                  : "受け取れませんでした（時間をおいて試してください）";
                render();
                return;
              }
              remote = { coinBalance: claimed.coinBalance };
              verifiedTierId = claimed.tierId ?? undefined;
            }
            const result = claimArenaWeeklyReward(state.player, Date.now(), verifiedTierId);
            adoptArenaCoinBalance(remote);
            state.arenaNotice = result.ok
              ? `${result.tierName} の週間報酬を受け取りました`
              : (result.reason ?? "受け取れませんでした");
            if (result.ok) { savePlayerState(state.player); playSfx("stageClear"); }
            render();
          })();
        },
        onToggleOffenseMember: (instanceId) => {
          toggleArenaTeamMember(state.player, "OFFENSE", instanceId);
          savePlayerState(state.player);
          render();
        },
        onToggleDefenseDraft: (instanceId) => {
          const index = state.arenaDefenseDraftIds.indexOf(instanceId);
          if (index >= 0) state.arenaDefenseDraftIds.splice(index, 1);
          else if (state.arenaDefenseDraftIds.length < ARENA_TEAM_SIZE) state.arenaDefenseDraftIds.push(instanceId);
          render();
        },
        onRegisterDefense: () => {
          const members = state.arenaDefenseDraftIds
            .map((id) => state.player.monsters.find((m) => m.id === id))
            .filter((m): m is NonNullable<typeof m> => m !== undefined);
          if (members.length === 0) {
            state.arenaNotice = "防衛編成を選んでください";
            playSfx("denied", 0.7);
            render();
            return;
          }
          /*
           * **登録した瞬間の姿を焼く。** 焼いた後に本人が装備を外しても
           * 売っても、相手の画面の防衛は1バイトも変わらない。
           */
          state.player.arenaDefenseIds = [...state.arenaDefenseDraftIds];
          state.player.arenaDefenseSnapshot = captureArenaDefense(members, state.player.equipment);
          savePlayerState(state.player);
          // 繋がっていれば上げる。失敗しても控えには残っているので進行は止めない
          void pushArenaDefense(state.player.arenaDefenseSnapshot);
          state.arenaNotice = `防衛編成を登録しました（${members.length}体）`;
          playSfx("stageClear");
          render();
        },
        onBuy: (itemId) => {
          /*
           * **繋がっている時は、先にサーバへ通す。**
           *
           * コインは対戦でサーバが決めた値を持っている。購入だけローカルで
           * 引くと、残高が両側で食い違う(サーバは減っていない)。
           * 価格・在庫・上限・残高はサーバが見るので、そこが通ってから配る。
           */
          void (async () => {
            if (await connectArena()) {
              const receipt = await purchaseArenaShopItem(itemId);
              if (!receipt) {
                state.arenaNotice = "購入できませんでした（上限・残高・在庫を確認してください）";
                playSfx("denied", 0.7);
                render();
                return;
              }
              const fulfilled = fulfillArenaShopPurchase(
                state.player,
                receipt.itemId,
                receipt.purchaseId,
                receipt.quantity,
                receipt.purchasedAt,
              );
              if (!fulfilled.ok) {
                state.arenaNotice = "購入は成立しています。受取処理を次回接続時に再開します";
                playSfx("denied", 0.7);
                render();
                return;
              }
              state.player.arenaCoins = receipt.coinBalance;
              // 付与済みIDを保存してからサーバへ受取完了を返す。
              savePlayerState(state.player);
              await acknowledgeArenaShopPurchase(receipt.purchaseId);
              state.arenaNotice = `${fulfilled.item?.name ?? "商品"}を購入しました`;
              playSfx("stageClear");
              render();
              return;
            }
            const result = buyArenaShopItem(state.player, itemId);
            state.arenaNotice = result.ok
              ? `${result.item?.name ?? "商品"}を購入しました`
              : (result.reason ?? "購入できませんでした");
            if (result.ok) { savePlayerState(state.player); playSfx("stageClear"); }
            else playSfx("denied", 0.7);
            render();
          })();
        },
        onRevenge: (record) => {
          if (arenaRevengeBlock(record, state.player.arenaTickets) !== null) {
            playSfx("denied", 0.7);
            return;
          }
          /*
           * **戦う前に印を付ける。** 結果で変えると、負けた時に
           * 何度でも挑み直せてしまう。
           */
          const target = state.arenaCandidates.find((entry) => entry.name === record.opponentName);
          if (!target) {
            // **印を付けずに戻す。** 挑めていないのに1回きりの権利を使わせない
            state.arenaNotice = "相手が見つかりませんでした。対戦候補から挑んでください";
            state.arenaView = "OPPONENTS";
            render();
            return;
          }
          /*
           * **戦う前に印を付ける。** 結果で変えると、負けた時に何度でも挑み直せる。
           * ただし挑めなかった時(編成未設定・挑戦券切れ)は戻す
           * ——挑んでいないのに1回きりの権利が消えるのは、防ぎたい不正とは別の話。
           */
          if (!markArenaRevenged(state.player, record.id)) return;
          const ticketsBefore = state.player.arenaTickets;
          savePlayerState(state.player);
          startArenaMatch(target);
          if (state.screen !== "ARENA_BATTLE") {
            record.revenged = false;
            state.player.arenaTickets = ticketsBefore;
            savePlayerState(state.player);
            render();
          }
        },
        onReloadRanking: () => { void refreshArenaRanking(); },
        onViewMonster: (instanceId) => {
          state.monsterDetailId = instanceId;
          state.screen = "MONSTERS";
          render();
        },
      });
      break;
    }

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
          state.towerOutcome = null;
          openPartyFrom({ screen: "TRIAL_TOWER", label: `試練の塔${nextTowerFloor(state.player)}F` }, "TOWER");
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
        sortKey: state.dexSortKey,
        filter: state.dexFilter,
        filterOpen: state.dexFilterOpen,
        onChangeSort: (key) => {
          state.dexSortKey = key;
          render();
        },
        onChangeFilter: (filter) => {
          state.dexFilter = filter;
          render();
        },
        onToggleFilterOpen: () => {
          state.dexFilterOpen = !state.dexFilterOpen;
          render();
        },
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
        filter: state.monsterTrainingFilter,
        onChangeFilter: (filter) => {
          state.monsterTrainingFilter = filter;
          render();
        },
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
          state.monsterTrainingFilter = { ...EMPTY_MONSTER_TRAINING_FILTER };
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
          // **金額は定数から出す。** 文言に直接書くと、値を変えた時にここだけ古くなる
          const typeCost = TYPE_REINCARNATION_GOLD_COST.toLocaleString("ja-JP");
          if (!window.confirm(`${label}タイプへ転生しますか？\n${MONSTER_TYPE_DESCRIPTIONS[type]}\n費用：${typeCost}G\nレベル・EXPは維持されます。\n能力ポイントはリセットされ、振り直せます。`)) return;
          if (!reincarnateMonsterType(createTarget, type, state.player)) return;
          state.createNotice = `${typeCost}Gでタイプを変更しました（Lv・EXP維持）`;
          savePlayerState(state.player);
          playSfx("levelUp");
          render();
        },
        onSetAbilityPoint: (stat: AllocatableStat, points: number) => {
          if (!setAbilityPoint(createTarget, stat, points)) return;
          savePlayerState(state.player);
          render();
        },
        onConfirmAbilityPoints: () => {
          /*
           * **ここで確定する。** 押すまでは何度でも無料で振り直せて、
           * 押した後は有料のリセットでしか変えられない。
           * 取り返しがつかないので、押す前に必ず1度たずねる。
           */
          const used = usedAbilityPoints(createTarget.development.abilityPoints);
          const cost = ABILITY_POINT_RESET_COST.toLocaleString("ja-JP");
          if (!window.confirm(
            `この配分で確定しますか？\n使用 ${used}pt\n\n確定すると、変えるには ${cost}G のリセットが必要になります。`
          )) return;
          if (!confirmAbilityPoints(createTarget)) return;
          state.createNotice = "能力ポイントの配分を確定しました";
          savePlayerState(state.player);
          playSfx("levelUp");
          render();
        },
        onResetAbilityPoints: () => {
          const resetCost = ABILITY_POINT_RESET_COST.toLocaleString("ja-JP");
          if (!window.confirm(`能力ポイントをリセットしますか？\n能力ポイントがすべて0になります\nもう一度、無料で自由に振り直せます\n費用：${resetCost}ゴールド`)) return;
          if (!resetAbilityPoints(createTarget, state.player)) return;
          state.createNotice = "能力ポイントをリセットしました";
          savePlayerState(state.player);
          render();
        },
        onAwaken: (candidateId) => {
          const candidates = LATENT_ABILITY_CANDIDATES[createTarget.dexId] ?? [];
          const expectedCurrentId = createTarget.development.latentAbilityId;
          const wasReawakening = expectedCurrentId !== null || createTarget.development.latentReselectPending;
          if (expectedCurrentId !== null && !window.confirm("現在の潜在能力を維持したまま再覚醒を確定しますか？\n覚醒オーブ×2 / 100,000G")) return;
          if (!confirmLatentAwakening(createTarget, candidateId, candidates, state.player, expectedCurrentId)) return;
          savePlayerState(state.player);
          state.createNotice = wasReawakening ? "潜在能力を再選択しました" : "潜在能力を覚醒しました";
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
      content = renderAutoFarmResult({
        result,
        targetName: state.autoFarmTargetName,
        actions,
        onViewEquipment: result.earnedEquipmentIds?.length ? () => {
          state.farmEquipmentOpen = true;
          render();
        } : undefined,
      });
      if (state.farmEquipmentOpen) {
        const earnedIds = new Set(result.earnedEquipmentIds ?? []);
        const equipment = state.player.equipment.filter((item) => earnedIds.has(item.id));
        const validIds = new Set(equipment.map((item) => item.id));
        state.farmEquipmentSelectedIds = state.farmEquipmentSelectedIds.filter((id) => validIds.has(id));
        content.append(renderFarmEquipmentResult({
          equipment,
          selectedIds: state.farmEquipmentSelectedIds,
          detailId: state.farmEquipmentDetailId,
          selling: state.farmEquipmentSelling,
          onToggleLock: (id) => {
            const item = state.player.equipment.find((entry) => entry.id === id);
            if (!item || !setEquipmentLocked(state.player, id, !item.locked)) return;
            if (item.locked) state.farmEquipmentSelectedIds = state.farmEquipmentSelectedIds.filter((selectedId) => selectedId !== id);
            savePlayerState(state.player); render();
          },
          onToggleSelected: (id) => {
            const item = state.player.equipment.find((entry) => entry.id === id);
            if (!item || item.locked) return;
            state.farmEquipmentSelectedIds = state.farmEquipmentSelectedIds.includes(id)
              ? state.farmEquipmentSelectedIds.filter((selectedId) => selectedId !== id)
              : [...state.farmEquipmentSelectedIds, id];
            render();
          },
          onDetail: (id) => { state.farmEquipmentDetailId = id; render(); },
          onSell: () => {
            if (state.farmEquipmentSelling) return;
            const targets = state.player.equipment.filter((item) => state.farmEquipmentSelectedIds.includes(item.id));
            if (!targets.length || targets.some((item) => item.locked)) { state.farmEquipmentSelectedIds = []; render(); return; }
            const total = targets.reduce((sum, item) => sum + equipmentSellPrice(item), 0);
            if (!window.confirm(`選択した${targets.length}個の装備を${total.toLocaleString("ja-JP")}ゴールドで売却します。\nこの操作は取り消せません。`)) return;
            // 確認後にも現在の所持品と正式ロック状態を再検証する。
            const ids = targets.map((item) => item.id);
            const current = state.player.equipment.filter((item) => ids.includes(item.id));
            if (current.length !== ids.length || current.some((item) => item.locked)) { state.farmEquipmentSelectedIds = []; render(); return; }
            state.farmEquipmentSelling = true;
            for (const item of current) sellEquipment(state.player, item.id);
            savePlayerState(state.player);
            state.farmEquipmentSelling = false; state.farmEquipmentSelectedIds = []; state.farmEquipmentDetailId = null; render();
          },
          onSelectAll: () => { state.farmEquipmentSelectedIds = sellableEquipmentIds(equipment); render(); },
          onClearSelection: () => { state.farmEquipmentSelectedIds = []; render(); },
          onClose: () => { state.farmEquipmentOpen = false; state.farmEquipmentDetailId = null; render(); },
        }));
      }
      break;
    }
  }

  mountTutorialBar(content);
  root.append(content);
  const farmPanel = root.querySelector<HTMLElement>(".farm-equip-sheet__panel");
  restoreScrollTop(farmPanel, farmEquipmentScrollTop);
  if (pwaUpdate.snapshot.available) {
    const inBattle = BATTLE_SCREENS.has(state.screen);
    const applying = pwaUpdate.snapshot.applying;
    root.append(el("aside", { className: "pwa-update-banner", role: "status" }, [
      el("div", { className: "pwa-update-banner__copy" }, [
        el("strong", {}, ["新しいバージョンがあります"]),
        ...(inBattle ? [el("span", {}, ["戦闘終了後にアップデートできます"])] : []),
        ...(pwaUpdate.snapshot.failed ? [el("span", {}, ["更新できませんでした。もう一度お試しください"])] : []),
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
  if (showNav) root.append(renderBottomNav(state.screen, navigate));
  /*
   * 共通の「戻る」。**自前の見出しを持つ画面には出さない。**
   * 一覧で持つと足し忘れるので、描き上がった中身をそのまま見て決める。
   */
  if (canGoBack() && !content.querySelector(".management-header")) {
    root.append(renderGlobalBackButton({ onBack: goBack }));
    document.body.classList.add("has-global-back");
  } else {
    document.body.classList.remove("has-global-back");
  }
  playBgm(bgmSceneOf(state.screen));

  const newRouteKey = routeKey();
  window.scrollTo(0, scrollPositions.get(newRouteKey) ?? 0);
  lastRouteKey = newRouteKey;
  lastRouteState = routeState();
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
      if (id === null && state.returnContext) {
        state.monsterDetailId = null;
        state.screen = "PARTY";
        render();
        return;
      }
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
    onToggleLock: (monsterId) => {
      const monster = state.player.monsters.find((entry) => entry.id === monsterId);
      if (!monster || !setMonsterLocked(state.player, monsterId, !monster.locked)) return;
      savePlayerState(state.player);
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
      state.monsterTrainingFilter = { ...EMPTY_MONSTER_TRAINING_FILTER };
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
    onToggleLock: (equipmentId) => {
      const item = state.player.equipment.find((entry) => entry.id === equipmentId);
      if (!item || !setEquipmentLocked(state.player, equipmentId, !item.locked)) return;
      if (item.locked) state.equipmentSelectedIds = state.equipmentSelectedIds.filter((id) => id !== equipmentId);
      savePlayerState(state.player);
      render();
    },
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

  /*
   * **繋がっていないと出ない画面を、巡回に見せるための口。**
   *
   * アリーナのランキングは未接続だと表そのものを出さない(行が0の表は
   * 「誰も居ない」に見えるが実際は「分からない」で、意味がまるで違うため)。
   * その結果、巡回は毎回この画面を**行が1つも無い状態**で検査し、
   * 「アリーナ/ランキング 問題なし」と報告し続けていた。
   *
   * 実際には、代表モンスターの絵文字が無い行で名前が22px幅の列へ落ち、
   * 実機で「ド‥」と2文字目で切れていた。行を一度も描いていないので拾えない。
   *
   * 仮の行は**最悪の形**にしてある(名前が上限の12文字、代表が有る行と無い行、
   * 4桁のレート、3桁の戦績)。ここが収まれば実データも収まる。
   */
  const demoRow = (
    rank: number,
    name: string,
    rating: number,
    wins: number,
    losses: number,
    leadDexId: string | null,
  ): ArenaRankingEntry => ({
    rank,
    userId: `dev-${rank}`,
    name,
    iconKey: "",
    rating,
    tierId: "BRONZE_1" as ArenaTierId,
    wins,
    losses,
    leadDexId,
    leadStar: leadDexId ? 6 : null,
  });

  const DEMO_RANKING_ROWS: ArenaRankingEntry[] = [
    // 名前は上限の12文字。代表モンスターが**無い**行(ここが崩れていた)
    demoRow(1, "あいうえおかきくけこさし", 2480, 128, 96, null),
    // 代表モンスターが**有る**行
    demoRow(2, "ドラゴンつかいのさとし", 1224, 14, 0, "dragon_FIRE"),
    demoRow(3, "荒ぶるコボルト軍団長", 1188, 11, 3, null),
  ];

  (window as unknown as Record<string, unknown>).__crimonDev = {
    showDemoRanking() {
      arenaConnectionStatus = "ONLINE";
      state.arenaRankingLoading = false;
      state.arenaRankingTop = DEMO_RANKING_ROWS;
      state.arenaRankingAround = DEMO_RANKING_ROWS;
      state.arenaView = "RANKING";
      render();
    },
  };
}

appMounted = true;
render();
scheduleBackgroundFarm(250);

document.addEventListener("visibilitychange", () => {
  savePlayerState(state.player);
  if (document.visibilityState === "visible") scheduleBackgroundFarm(0);
});
window.addEventListener("pagehide", () => savePlayerState(state.player));
