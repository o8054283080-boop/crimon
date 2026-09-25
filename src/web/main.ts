import "./style.css";
import "./crimon-visual-system.css";
import "./home-pop-design.css";
import "./mobile-ux.css";
import "./ui/tutorialBar.css";
import "./ui/arena.css";
import "./ui/portraitOnly.css";
import "./ui/monsterList.css";
import "./ui/crystalShop.css";
import "./ui/cloudRecoveryWarning.css";
// タイトルの絵は、既存の装飾用の指定を上書きする。**必ず後に読むこと**
import "./ui/titleCover.css";
import { getAudioSettings, initAudio, playBgm, playSfx, updateAudioSettings } from "./audio/index.js";
import { BATTLE_SCREENS, bgmSceneOf } from "./audio/bgmScene.js";
import { registerSW } from "virtual:pwa-register";
import { BattleEngine } from "../battle/engine.js";
import { EQUIP_SLOTS, enhanceEquipment as enhanceEquipmentForDev, equipmentSellPrice, EquipSlot, generateEquipment, SET_TYPES, type Equipment } from "../core/equipment.js";
import { DUNGEON_STAMINA_COST, GOLD_DUNGEON_STAMINA_COST, LEVEL_DUNGEON_STAMINA_COST, STAGE_STAMINA_COST } from "../core/fighterLevel.js";
import { MonsterInstance } from "../core/monsterInstance.js";
import { DungeonFloor, EquipmentDungeonKind, dungeonFloorKey, findDungeonFloorByKey } from "../data/equipmentDungeon.js";
import { GoldDungeonFloor, GOLD_DUNGEON_FLOORS } from "../data/goldDungeon.js";
import { AWAKENING_DEPTH_FLOORS, AwakeningDepthFloor, findAwakeningDepthFloor } from "../data/awakeningDepths.js";
import {
  exchangeMaterial, grantAwakeningDepthReward, isAwakeningDepthUnlocked,
} from "../game/awakeningDepths.js";
import {
  reconcileSkillTalents, resetTalents, takeBasicTalent, takeBattleTalent, takeSkillAwakening,
  takeSkillTalent, unlockTalentPoint, type SkillTalentSlot,
} from "../game/talents.js";
import { renderAwakeningDepths } from "./views/awakeningDepths.js";
import { type TalentTab } from "./views/talentAwakening.js";
import { LevelDungeonDef, LevelDungeonTier, LEVEL_DUNGEON_DEFS } from "../data/levelDungeon.js";
import { Difficulty, DIFFICULTY_JA, Stage, STAGES, stageWaveGold } from "../data/stages.js";
import { summonTutorial, SUMMON_COST_SINGLE, SUMMON_COST_TEN, SummonResult, summonMany, SpecialSummonScroll, SPECIAL_SCROLL_FIELD, useSpecialSummonScroll } from "../game/gacha.js";
import { setupDungeonBattle } from "../game/dungeonRunner.js";
import { recordCollabFarmRun } from "../game/missions.js";
import { COLLAB_SCROLL_FIELD, CollabSummonScroll, summonCollabMany, useCollabSummonScroll } from "../game/collabGacha.js";
import { isCollabEventOpen } from "../game/collabMissions.js";
import { AutoFarmResult, AutoFarmStopReason, emptyResult, farmBlockReason, mergeReward } from "../game/autoFarm.js";
import {
  BackgroundFarmJob,
  MAX_OFFLINE_FARM_MS,
  availableBackgroundRuns,
  createBackgroundFarmJob,
  dismissFinishedBackgroundFarm,
  finishBackgroundFarm,
  parseRequestedRuns,
  shouldStopForJstDateChange,
  staminaPotionBudgetOf,
  staminaPotionsNeeded,
} from "../game/backgroundAutoFarm.js";
import { manualClearKey, recordManualBattle, referenceRunTime } from "../game/manualClearTimes.js";
import { SHOP_MAX_SLOTS, SHOP_ROTATION_MS, buildShopLineup, rotationKeyAt } from "../game/shop.js";
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
  type TowerMode,
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
  ABILITY_POINT_RESET_COST, AllocatableStat, MONSTER_TYPE_DESCRIPTIONS, MONSTER_TYPE_LABELS, MonsterType,
  createDefaultMonsterDevelopment } from "../core/monsterDevelopment.js";
import {
  ARENA_HISTORY_MAX,
  claimDailyLoginBonus,
  FIGHTER_NAME_MAX_LENGTH,
  LoginBonusResult,
  PlayerState,
  addEquipment,
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
  startupSaveOrigin,
  normalizeLoadedState,
  removeMonsters,
  savePlayerState,
  lastSaveFailure,
  recordStorageEstimate,
  type SaveFailure,
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
  staminaPotionsOwned,
  staminaPotionFarmBudgetOf,
  tryUseStaminaPotion,
  STAMINA_POTION_AMOUNT,
  STAMINA_POTION_UNLIMITED_BUDGET,
  trySpendSummonScrolls,
  unlockShopSlot,
  goldDungeonChallengesRemaining,
  isStageCleared,
  isDungeonFloorCleared,
  isLevelDungeonTierCleared,
} from "../game/playerState.js";
import { MonsterSortKey, monsterPower } from "../game/monsterSort.js";
import { findMonsterById } from "../data/monsters.js";
import { resolveAccessory, toBattleDefinition } from "../core/monsterInstance.js";
import type { Stats } from "../core/stats.js";
import { EMPTY_MONSTER_FILTER, MonsterFilter } from "./monsterFilter.js";
import { forgetShownCounts } from "./incrementalGrid.js";
import { renderAutoEquip } from "./views/autoEquip.js";
import {
  applyAutoEquipPlan,
  createDefaultAutoEquipSettings,
  currentStatsOf,
  reachableSetCounts,
  planAutoEquip,
  type AutoEquipPlan,
  type AutoEquipSettings,
} from "../game/autoEquip.js";
import {
  capturePreset,
  isPresetSaved,
  normalizeAutoEquipSettings,
  presetsOf,
  resolvePreset,
  writePreset,
  PRESET_NAME_MAX_LENGTH,
} from "../game/equipmentPreset.js";
import { renderMonsterExchange } from "./views/monsterExchange.js";
import { renderMonsterStorage } from "./views/monsterStorage.js";
import { depositMonsters, exchangeStoredMonstersForPoints, withdrawMonsters } from "../game/monsterStorage.js";
import { sendMonstersForPoints, tryExchangeMonsterPoints } from "../game/monsterPoints.js";
import { crimShardsOwned, useCrimShard } from "../game/crim.js";
import { loadMonsterListDense, saveMonsterListDense } from "./monsterListDensity.js";
import { applyRankUp, checkRankUp } from "../game/progression.js";
import { extractSurvivors, setupWaveBattle } from "../game/stageRunner.js";
import { renderBottomNav, ScreenName } from "./views/bottomNav.js";
import { renderGiftBox, type GiftTab } from "./views/giftBox.js";
import { GIFT_DEFINITIONS } from "../data/gifts.js";
import { claimAllGifts, claimGift, unclaimedGiftCount, type GiftClaimAllResult, type GiftClaimResult } from "../game/gift.js";
import { renderShop } from "./views/shop.js";
import { describeSaveFile, parseSaveFile, saveFileName, serializeSaveFile } from "../game/saveFile.js";
import { CompensationClaim, claimCompensations, isFirstLaunch } from "../game/compensation.js";
import { markAllNoticesRead } from "./noticeUi.js";
import { attachScreenBack, screenHeader } from "./views/managementHeader.js";
import { renderAutoFarmResult } from "./views/autoFarmResult.js";
import { renderFarmEquipmentResult } from "./views/farmEquipmentResult.js";
import { renderFarmAccessoryResult } from "./views/farmAccessoryResult.js";
import { RankingTab, renderRankings } from "./views/rankings.js";
import { loadNavigationState, saveNavigationState } from "./navigationState.js";
import { DungeonReturnContext, keepReturnContext, normalStageReturnContext, rememberedScrollTop, replacePartySlot, restoreDungeonSelection, restoreScrollTop, sellableEquipmentIds } from "./uxHelpers.js";
import { ResultAction } from "./views/resultActions.js";
import { BattleChainInfo, BattleViewHandle, renderBattleView } from "./views/battleView.js";
import { EquipmentPickerContext, EquipmentProps, EquipmentSortKey, applyEquipmentOrder, renderEquipment, visibleEquipment } from "./views/equipment.js";
import { EMPTY_EQUIPMENT_FILTER, EquipmentFilter } from "./equipmentFilter.js";
import { loadEquipmentListDense, saveEquipmentListDense } from "./equipmentListDensity.js";
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
import {
  ARENA_CANDIDATE_TOTAL, ARENA_NPC_GENERATE_COUNT, ARENA_PLAYER_SLOTS, buildArenaCandidates, orderArenaPlayerPicks,
} from "../game/arena/matchmaking.js";
import { captureArenaDefense } from "../game/arena/snapshot.js";
import { arenaDefenseHistory, arenaRevengeBlock, markArenaRevenged, mergeArenaHistory, recordArenaMatch } from "../game/arena/match.js";
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
  fetchArenaOpponentPool,
  fetchArenaOpponentsByIds,
  fetchArenaRanking,
  fetchArenaMatchHistory,
  fetchArenaRankingAround,
  fetchArenaState,
  claimArenaSeasonReward,
  purchaseArenaShopItem,
  fetchPendingArenaShopPurchases,
  acknowledgeArenaShopPurchase,
  beginArenaMatch,
  refillArenaTicketsRemote,
  arenaRefusalText,
  pushArenaDefense,
  settleArenaMatch,
} from "../net/arenaSync.js";
import type { ArenaMatchTicket, ArenaRankingEntry } from "../net/arenaSync.js";
import { arenaAuthUserId, ensureArenaAuth } from "../net/arenaAuth.js";
import { fetchPersonalGifts, markPersonalGiftClaimed } from "../net/personalGifts.js";
import {
  fetchTrialTowerRanking,
  fetchTrialTowerSelf,
  submitTrialTowerProgress,
} from "../net/trialTowerSync.js";
import type { TrialTowerRankingEntry } from "../net/trialTowerSync.js";
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
import { renderSummon, type SummonMethod, type SummonTab } from "./views/summon.js";
import { el } from "./dom.js";
import { PwaUpdateController } from "./pwaUpdate.js";
import { ARENA_BATTLE_OPTIONS, ARENA_REROLL_LIMIT } from "../data/pvpArena.js";
import { buyCrystalShopItem, crystalShopRows } from "../game/crystalShop.js";
import type { Accessory } from "../core/accessory.js";
import type { Equipment as CraftedEquipment } from "../core/equipment.js";
import { type AbilityPointAllocation, LIMIT_POINT_RESET_COST } from "../core/monsterDevelopment.js";
import { findRuinFloorByLocationId, ruinLocationId, type RuinFloor, type RuinKind } from "../data/ruins.js";
import { grantRuinReward, isRuinFloorCleared, isRuinFloorUnlocked, type RuinReward } from "../game/ruins.js";
import {
  type AccessoryFilter, type AccessorySortKey, equipAccessory, sellAccessory, setAccessoryLocked,
  tryEnhanceAccessory, unequipAccessory, findAccessory, EMPTY_ACCESSORY_FILTER, accessoriesOf,
  accessoryOwner, bulkSellAccessories, sellableAccessoryIds, wornAccessoryIds,
} from "../game/accessories.js";
import { clampLimitDraft, craftAccessory, craftEquipment, resetLimitPoints, setLimitPoints, unlockLimitBreak } from "../game/ancientCraft.js";
import { accessorySellPrice, accessoryTitle, describeSpecial, generateAccessory as generateAccessoryForDev } from "../core/accessory.js";
import { renderRuins } from "./views/ruins.js";
import { type AccessoriesProps, renderAccessories } from "./views/accessories.js";
import { type GearTab, renderGearTabs } from "./views/gearTabs.js";
import { renderAncientCraft } from "./views/ancientCraft.js";

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
  carrySkyStacks?: Map<string, number>;
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

/** 目覚の深域の1戦。ゴールドダンジョンと同じく、持ち越しは無い */
interface AwakeningDepthRunState {
  floor: AwakeningDepthFloor;
  partyInstances: MonsterInstance[];
  manualStartedAt: number;
}

/** 遺跡の1戦。深域と同じ形 */
interface RuinRunState {
  floor: RuinFloor;
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
  | { kind: "AWAKENING_DEPTH"; floor: AwakeningDepthFloor }
  | { kind: "RUINS"; floor: RuinFloor }
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
  /** プレゼントボックスのタブ */
  giftTab: GiftTab;
  /** 直前の受け取りの結果。押した後に一度だけ出す */
  giftResult: GiftClaimResult | GiftClaimAllResult | null;
  personalGifts: import("../game/gift.js").GiftDefinition[];
  personalGiftsLoaded: boolean;
  player: PlayerState;
  summonResults: SummonResult[] | null;
  /** 直前に何で引いたか。結果画面の「もう一度」を同じ手段で繰り返すために覚える */
  lastSummonMethod: SummonMethod | null;
  /** 召喚画面で通常とコラボのどちらを見ているか。**保存はしない**(起動時は通常) */
  summonTab: SummonTab;
  monsterDetailId: string | null;
  rankUpMode: boolean;
  rankUpSacrificeIds: string[];
  /** おまかせ装備の画面。どの子を触っているか */
  autoEquipMonsterId: string | null;
  autoEquipSettings: AutoEquipSettings;
  /** 計算した結果。**確定するまで装備は動かない** */
  autoEquipPlan: AutoEquipPlan | null;
  autoEquipError: string | null;
  autoEquipNotice: string | null;
  autoEquipDetailOpen: boolean;
  autoEquipRenamingIndex: number | null;
  /** モンスター交換所で、送るために選ばれている子 */
  monsterExchangeIds: string[];
  monsterExchangeFilter: MonsterFilter;
  monsterExchangeFilterOpen: boolean;
  monsterExchangeSortKey: MonsterSortKey;
  monsterStorageNotice: string | null;
  selectedStageId: string | null;
  selectedDifficulty: Difficulty;
  stageRun: StageRunState | null;
  stageResult: StageResultInfo | null;
  equipmentDetailId: string | null;
  equipmentPickerContext: EquipmentPickerContext | null;
  equipmentSlotFilter: EquipSlot | null;
  equipmentSortKey: EquipmentSortKey;
  /** 所持装備の一覧を簡易表示にしているか。端末の見た目設定として保存する */
  equipmentListDense: boolean;
  /** 所持装備の絞り込み条件。所持一覧で使う(装備を選びに来た時は当てない) */
  equipmentFilter: EquipmentFilter;
  /**
   * 装備を選ぶ画面(picker)専用の絞り込み。
   *
   * **所持装備の一覧とは別に持つ。**共有すると、一覧で
   * 「速攻シリーズだけ」に絞ったままモンスターの枠を開いた時、
   * 何も出ないのに理由が分からない、という詰まり方をする。
   */
  equipmentPickerFilter: EquipmentFilter;
  equipmentPickerFilterOpen: boolean;
  /** 絞り込みの札を開いているか */
  equipmentFilterOpen: boolean;
  /**
   * 一覧の並びを画面に居る間だけ固定するID列。
   *
   * **強化しても札が動かないようにするためだけの控え。**
   * 「おすすめ順」は強化値を見て並ぶので、装備を選ぶ画面で `+1` を押すと
   * その札が前へ飛び、続けて `+2` を押そうとするとそこには別の装備が居た。
   * `null` なら次の描画で組み直す。画面を移る・並び順を変える・
   * 絞り込みを変える・装備を選びに入る、のいずれかで `null` に戻す。
   */
  equipmentOrder: string[] | null;
  /** 所持モンスターの並べ替えの軸 */
  monsterSortKey: MonsterSortKey;
  /** 所持モンスターの絞り込み条件。所持一覧と編成画面で共有する(同じ探し方で通す) */
  monsterFilter: MonsterFilter;
  /** 絞り込みの札を開いているか */
  monsterFilterOpen: boolean;
  /** 所持・強化素材・ランクアップ素材で共有する簡易表示 */
  monsterListDense: boolean;
  /** まとめて売却するために選ばれている装備 */
  equipmentSelectedIds: string[];
  farmEquipmentOpen: boolean;
  farmEquipmentSelectedIds: string[];
  farmEquipmentDetailId: string | null;
  farmEquipmentSelling: boolean;
  /**
   * 獲得装備のシート専用の絞り込み。
   *
   * **所持装備の一覧とは別に持つ。**共有すると、一覧を「★6だけ」に
   * 絞ったまま周回を終えた人が、今回の装備が1個も出ないシートを見ることになる
   * (装備を選ぶ画面で同じ理由から分けてある)。
   */
  farmEquipmentFilter: EquipmentFilter;
  farmEquipmentFilterOpen: boolean;
  /** ショップで直前に買ったものの案内。次に何か操作したら消す */
  shopNotice: string | null;
  monsterExchangeNotice: string | null;
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
  /* --- 目覚の深域と才能覚醒 --- */
  selectedAwakeningDepthFloor: number | null;
  awakeningDepthRun: AwakeningDepthRunState | null;
  /* --- 遺跡・アクセサリー・カケラ製作・限界能力付与 --- */
  ruinKind: RuinKind;
  selectedRuinFloor: number | null;
  ruinRun: RuinRunState | null;
  accessorySort: AccessorySortKey;
  /** アクセの一覧の絞り込み。装備の一覧と同じく、画面を出入りしても残す */
  accessoryFilter: AccessoryFilter;
  accessoryFilterOpen: boolean;
  /**
   * 着ける先を選ぶ画面(`accessoryPickFor`)専用の絞り込み。**開くたびに白紙へ戻す。**
   * 一覧と共有すると、一覧で「★6だけ」に絞ったままモンスターのアクセ枠を開いた人が、
   * 理由の分からない空の一覧を見ることになる(装備の枠を選ぶ画面と同じ理由)。
   */
  accessoryPickFilter: AccessoryFilter;
  accessoryPickFilterOpen: boolean;
  /** アクセのまとめ売りの選択モード中か */
  accessorySelecting: boolean;
  accessorySelectedIds: string[];
  /**
   * 「今回獲得したアクセサリー」のシート。
   *
   * `farmAccessorySource` は**どの結果について開いたか**(結果そのものへの参照)。
   * 次の結果画面へ移った時に、前の結果のシートが開いたまま残らないようにする。
   * 参照は履歴(RouteState)には入れない——JSONにすると結果が丸ごと入る。
   */
  farmAccessoryOpen: boolean;
  farmAccessorySource: AutoFarmResult | StageResultInfo | null;
  farmAccessorySelectedIds: string[];
  farmAccessoryDetailId: string | null;
  farmAccessorySelling: boolean;
  /** シート専用の絞り込み。**開くたびに白紙へ戻す**(前の条件で今回の分が1個も見えない、を起こさない) */
  farmAccessoryFilter: AccessoryFilter;
  farmAccessoryFilterOpen: boolean;
  selectedAccessoryId: string | null;
  /** 着ける先のモンスター(モンスター詳細のアクセ枠から来た時) */
  accessoryPickFor: string | null;
  accessoryNotice: string | null;
  craftLastAccessory: Accessory | null;
  craftLastEquipment: CraftedEquipment | null;
  craftNotice: string | null;
  limitTargetId: string | null;
  limitDraft: AbilityPointAllocation;
  limitNotice: string | null;
  /** 装備画面で「装備」と「アクセサリー」のどちらを見ているか */
  equipmentTab: GearTab;
  /** 才能覚醒を開いている個体 */
  talentTargetId: string | null;
  /** 才能覚醒のタブ */
  talentTab: TalentTab;
  /** スキル才能で見ている枠(1 = スキル2、2 = スキル3) */
  talentSkillSlot: SkillTalentSlot;
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
  /**
   * ショップの棚を、この時刻の品揃えとして出す。null なら今の時刻。
   *
   * **DEVの口と巡回のためだけにある。**棚は1時間ごとに入れ替わり、
   * スタミナポーションや才能覚醒の素材は毎回並ぶわけではないので、
   * そのままでは「たまたま並ばなかった棚」を検査して問題なしと報告してしまう
   * (行が1つも無いランキングを検査し続けたのと同じ穴)。
   */
  devShopNow: number | null;
  /** 周回の途中。null なら単発の挑戦 */
  farmRun: FarmRun | null;
  /* --- 試練の塔 --- */
  towerMode: TowerMode;
  /** 塔の画面に出す案内(スタミナ切れ・編成が空など)。次の操作まで残す */
  towerNotice: string | null;
  /** 直前の階の決着。塔の画面へ戻った理由と、受け取った報酬を伝える */
  towerOutcome: TowerOutcome | null;
  /** 戦闘画面の ⏹ が押された。今の階を終えたら登坂を止める */
  towerStopRequested: boolean;
  towerPanel: "NONE" | "ENEMY_INFO" | "RANKING" | "REWARDS";
  /** 敵情報で選んだ階。未到達の階も一覧から確認できる。 */
  towerEnemyInfoFloor: number;
  /** ホームから開く順位の一覧で、いまどちらを見ているか */
  rankingTab: RankingTab;
  towerRankingEntries: TrialTowerRankingEntry[];
  towerRankingSelf: TrialTowerRankingEntry | null;
  towerRankingLoading: boolean;
  towerRankingError: boolean;
  /** 通信につながっていないだけ。障害(`towerRankingError`)とは分けて出す */
  towerRankingOffline: boolean;
  /**
   * **歴代最高をサーバへ送れていない。**
   *
   * これまで送るきっかけは2つだけで(階を登った瞬間と、ランキングを開いた時)、
   * **どちらも失敗を誰にも伝えなかった**(`void syncTrialTowerBest()`)。
   * 一度こけると、ランキングを開くまで二度と追いつかない。
   * 塔で遊んでいてもランキングを見ない人は、**登った記録が永久に届かない。**
   *
   * 実際、99階まで登った方のサーバ側が69階で止まっていた。
   */
  towerSyncPending: Record<TowerMode, number>;
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
  /**
   * モンスター詳細を**どこから開いたか**。閉じた時にそこへ帰すためだけに使う。
   *
   * 詳細は「所持モンスター」画面(`MONSTERS`)の中にしか無いので、
   * 編成画面から詳細を見ると `screen` を `MONSTERS` へ移すしかない。
   * その結果、**閉じると編成ではなく所持一覧に立っていた。**
   * 編成の途中で1体調べただけなのに、選びかけの画面から放り出される。
   *
   * `returnContext` とは別物。あちらは「ダンジョンから編成へ来た」経路で、
   * 編成を終える時に元のダンジョンへ帰すためのもの。ここは詳細の1階層だけを見る。
   */
  monsterDetailReturn: MonsterDetailReturn | null;
}

/** 詳細を閉じた時の帰り先。画面だけでなく、その画面の「どこを見ていたか」まで戻す */
type MonsterDetailReturn =
  | { kind: "PARTY"; mode: PartyEditMode }
  | { kind: "ARENA"; view: ArenaViewName }
  | { kind: "HOME" };

const state: AppState = {
  screen: "HOME",
  giftTab: "OPEN",
  giftResult: null,
  personalGifts: [],
  personalGiftsLoaded: false,
  player: loadPlayerState(),
  summonResults: null,
  lastSummonMethod: null,
  summonTab: "NORMAL",
  monsterDetailId: null,
  rankUpMode: false,
  rankUpSacrificeIds: [],
  autoEquipMonsterId: null,
  autoEquipSettings: createDefaultAutoEquipSettings(),
  autoEquipPlan: null,
  autoEquipError: null,
  autoEquipNotice: null,
  autoEquipDetailOpen: false,
  autoEquipRenamingIndex: null,
  monsterExchangeIds: [],
  monsterExchangeFilter: { ...EMPTY_MONSTER_FILTER },
  monsterExchangeFilterOpen: false,
  monsterExchangeSortKey: "recommended",
  monsterStorageNotice: null,
  selectedStageId: null,
  selectedDifficulty: "NORMAL",
  stageRun: null,
  stageResult: null,
  equipmentDetailId: null,
  equipmentPickerContext: null,
  equipmentSlotFilter: null,
  equipmentSortKey: "recommended",
  equipmentListDense: loadEquipmentListDense(),
  equipmentFilter: { ...EMPTY_EQUIPMENT_FILTER },
  equipmentFilterOpen: false,
  equipmentPickerFilter: { ...EMPTY_EQUIPMENT_FILTER },
  equipmentPickerFilterOpen: false,
  equipmentOrder: null,
  monsterSortKey: "recommended",
  monsterFilter: { ...EMPTY_MONSTER_FILTER },
  monsterFilterOpen: false,
  monsterListDense: loadMonsterListDense(),
  equipmentSelectedIds: [],
  farmEquipmentOpen: false,
  farmEquipmentSelectedIds: [],
  farmEquipmentDetailId: null,
  farmEquipmentSelling: false,
  farmEquipmentFilter: { ...EMPTY_EQUIPMENT_FILTER },
  farmEquipmentFilterOpen: false,
  shopNotice: null,
  monsterExchangeNotice: null,
  equipmentSelecting: false,
  equipmentReturnMonsterId: null,
  selectedDungeonFloor: null,
  selectedDungeonKind: "DEMON",
  dungeonRun: null,
  selectedLevelDungeonTier: null,
  levelDungeonRun: null,
  selectedGoldDungeonFloor: null,
  goldDungeonRun: null,
  selectedAwakeningDepthFloor: null,
  awakeningDepthRun: null,
  ruinKind: "POWER",
  selectedRuinFloor: null,
  ruinRun: null,
  accessorySort: "NEWEST",
  accessoryFilter: { ...EMPTY_ACCESSORY_FILTER },
  accessoryFilterOpen: false,
  accessoryPickFilter: { ...EMPTY_ACCESSORY_FILTER },
  accessoryPickFilterOpen: false,
  accessorySelecting: false,
  accessorySelectedIds: [],
  farmAccessoryOpen: false,
  farmAccessorySource: null,
  farmAccessorySelectedIds: [],
  farmAccessoryDetailId: null,
  farmAccessorySelling: false,
  farmAccessoryFilter: { ...EMPTY_ACCESSORY_FILTER },
  farmAccessoryFilterOpen: false,
  selectedAccessoryId: null,
  accessoryPickFor: null,
  accessoryNotice: null,
  craftLastAccessory: null,
  craftLastEquipment: null,
  craftNotice: null,
  limitTargetId: null,
  limitDraft: { hp: 0, atk: 0, def: 0, spd: 0 },
  limitNotice: null,
  equipmentTab: "GEAR",
  talentTargetId: null,
  talentTab: "BASIC",
  talentSkillSlot: 1,
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
  devShopNow: null,
  farmRun: null,
  towerNotice: null,
  towerMode: "NORMAL",
  towerOutcome: null,
  towerStopRequested: false,
  towerPanel: "NONE",
  towerEnemyInfoFloor: 60,
  rankingTab: "ARENA",
  towerRankingEntries: [],
  towerRankingSelf: null,
  towerRankingLoading: false,
  towerRankingError: false,
  towerRankingOffline: false,
  towerSyncPending: { NORMAL: 0, HARD: 0 },
  autoFarmResult: null,
  autoFarmTargetName: "",
  viewingBackgroundFarmJobId: null,
  loginBonusResult: null,
  compensationClaims: [],
  lastRun: null,
  partyNotice: null,
  partySelectedSlot: null,
  returnContext: null,
  monsterDetailReturn: null,
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

  // **ログインボーナスより先に聞く。**受け取った瞬間に「はじめて」ではなくなる
  // 「はじめて」は**保存データが最初から無かったか**で見る(`startupSaveOrigin`)
  const firstLaunch = isFirstLaunch(state.player, startupSaveOrigin());
  const loginBonus = claimDailyLoginBonus(state.player);
  if (loginBonus.claimed) {
    state.loginBonusResult = loginBonus;
    savePlayerState(state.player);
  }
  // お詫びの配布。期間中に一度開けば自動で受け取れる(重複はしない)
  // 始めたばかりの人には、始める前のお知らせを札にしない(`ClaimCompensationsOptions`)
  const claimedBefore = state.player.claimedCompensationIds.length;
  const claims = claimCompensations(state.player, new Date(), { firstLaunch });
  if (claims.length > 0) state.compensationClaims = claims;
  // 札が0枚でも印は付いている(モノの無いお知らせ)。数で見て保存する
  if (state.player.claimedCompensationIds.length !== claimedBefore) savePlayerState(state.player);
  // 左の「お知らせ」の赤い印も同じ。始める前の更新履歴を「未読 9+」と数えない
  if (firstLaunch) markAllNoticesRead();

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
  /* 遺跡・アクセ・限界付与。戻った時に同じ遺跡・同じ階・同じ着け先・同じ個体を開き直す */
  ruinKind: RuinKind;
  selectedRuinFloor: number | null;
  accessoryPickFor: string | null;
  limitTargetId: string | null;
  /** 装備画面の「装備 / アクセサリー」。戻った時に同じ側を開く */
  equipmentTab: GearTab;
  monsterDetailId: string | null;
  rankUpMode: boolean;
  equipmentDetailId: string | null;
  equipmentPickerContext: EquipmentPickerContext | null;
  equipmentSlotFilter: EquipSlot | null;
  equipmentReturnMonsterId: string | null;
  equipmentSelecting: boolean;
  farmEquipmentOpen: boolean;
  farmEquipmentDetailId: string | null;
  /** アクセのまとめ売り・獲得のシート。装備と同じく「見ている場所」の一部にする */
  accessorySelecting: boolean;
  farmAccessoryOpen: boolean;
  farmAccessoryDetailId: string | null;
  selectedStageId: string | null;
  selectedDifficulty: Difficulty;
  selectedDungeonFloor: number | null;
  selectedDungeonKind: EquipmentDungeonKind;
  selectedDexEntryId: string | null;
  monsterTrainingTargetId: string | null;
  selectedLevelDungeonTier: LevelDungeonTier | null;
  selectedGoldDungeonFloor: number | null;
  selectedAwakeningDepthFloor: number | null;
  talentTargetId: string | null;
  talentTab: TalentTab;
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
  "selectedGoldDungeonFloor", "selectedAwakeningDepthFloor", "talentTargetId", "talentTab",
  "createTargetId", "createMenu", "partyEditMode",
  "arenaView", "arenaDetailIndex", "arenaUnitIndex",
  "ruinKind", "selectedRuinFloor", "accessoryPickFor", "limitTargetId", "equipmentTab",
  "accessorySelecting", "farmAccessoryOpen", "farmAccessoryDetailId",
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

/**
 * その戦闘画面が描ける状態か(進行中の戦いが控えにあるか)。
 *
 * **戦闘画面ごとに見る場所が違う。**塔だけは控えがプレイヤー側にあり
 * (階をまたいで持ち越すため)、ほかは画面の状態に持っている。
 */
function hasBattleRun(screen: ScreenName): boolean {
  switch (screen) {
    case "BATTLE": return state.stageRun !== null;
    case "DUNGEON_BATTLE": return state.dungeonRun !== null;
    case "LEVEL_DUNGEON_BATTLE": return state.levelDungeonRun !== null;
    case "GOLD_DUNGEON_BATTLE": return state.goldDungeonRun !== null;
    case "AWAKENING_DEPTH_BATTLE": return state.awakeningDepthRun !== null;
    case "RUINS_BATTLE": return state.ruinRun !== null;
    case "TOWER_BATTLE": return (state.towerMode === "HARD" ? state.player.trialTowerHardRun : state.player.trialTowerRun) != null;
    case "ARENA_BATTLE": return state.arenaEntry !== null;
    default: return true;
  }
}

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
  /*
   * 詳細の帰り先も持ち越さない。**これは「見ている場所」ではなく片道の控え**なので
   * `RouteState` には入れていない。履歴で巻き戻した先に古い控えが残ると、
   * 後から無関係な詳細を閉じた人が編成へ飛ばされる。
   */
  state.monsterDetailReturn = null;
  // 場所に紐づく一時的な案内は持ち越さない。前の画面の言葉が残ると嘘になる
  state.shopNotice = null;
  state.monsterExchangeNotice = null;
  /*
   * おまかせの結果は**その場限り。**持ち越すと、別の子の画面で
   * 前の子の「変更後」が出たまま確定できてしまう。
   */
  state.autoEquipPlan = null;
  state.autoEquipError = null;
  state.autoEquipNotice = null;
  state.autoEquipRenamingIndex = null;
  state.monsterStorageNotice = null;
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
  /*
   * 「さらに表示」で増やした件数は**画面を移ったら忘れる。**
   *
   * 同じ画面の中では覚えたまま(ロックしても素材に選んでも巻き戻らない)。
   * だが別の場所から入り直した時にまで何百件も並べると、
   * 速さのために段階描画を入れた意味が無くなる。
   */
  forgetShownCounts();
  state.monsterDetailId = null;
  /*
   * 詳細の帰り先は**その1回きり**。ここで捨てないと、
   * 編成から詳細を開いた人が下のタブで別の画面へ移った後、
   * 無関係な詳細を閉じた時にまで編成へ飛ばされる。
   */
  state.monsterDetailReturn = null;
  state.rankUpMode = false;
  state.rankUpSacrificeIds = [];
  state.selectedStageId = null;
  state.selectedDifficulty = "NORMAL";
  state.summonResults = null;
  state.lastSummonMethod = null;
  state.equipmentDetailId = null;
  state.equipmentPickerContext = null;
  state.equipmentSlotFilter = null;
  // 固定していた並びは画面をまたいで持ち越さない。入り直せば今の状態で並ぶ
  state.equipmentOrder = null;
  state.equipmentReturnMonsterId = null;
  state.selectedDungeonFloor = null;
  state.selectedDungeonKind = "DEMON";
  state.selectedLevelDungeonTier = null;
  state.selectedGoldDungeonFloor = null;
  state.selectedRuinFloor = null;
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
  state.towerPanel = "NONE";
  state.towerEnemyInfoFloor = 60;
  render();
}

function openPartyFrom(context: DungeonReturnContext, mode: PartyEditMode): void {
  state.returnContext = keepReturnContext(state.returnContext, context);
  state.partyEditMode = mode;
  state.partySelectedSlot = null;
  state.screen = "PARTY";
  render();
}

/**
 * 編成の途中で1体だけ詳細を開く。**帰り先を控えてから移る。**
 *
 * 詳細は所持モンスター画面の中にしか無いので `screen` は動かさざるを得ない。
 * 控えを取らずに移していたせいで、閉じた人は所持一覧に立たされていた。
 */
function openMonsterDetail(instanceId: string, from: MonsterDetailReturn): void {
  state.monsterDetailReturn = from;
  state.monsterDetailId = instanceId;
  state.rankUpMode = false;
  state.rankUpSacrificeIds = [];
  state.screen = "MONSTERS";
  render();
}

/**
 * 詳細を閉じる。控えがあれば元の画面へ、無ければ所持一覧に留まる。
 *
 * 帰り先は画面名だけでなく「その画面のどこを見ていたか」まで戻す。
 * 通常・ダンジョン・塔の編成は別々の枠なので `mode` を、
 * アリーナは攻撃編成と防衛登録で別画面なので `view` を復元しないと、
 * **帰れてはいるが別の編成が開いている**という直しそこないになる。
 *
 * @returns 控えを使って帰ったら true
 */
function returnFromMonsterDetail(): boolean {
  const from = state.monsterDetailReturn;
  if (!from) return false;
  state.monsterDetailReturn = null;
  state.monsterDetailId = null;
  state.rankUpMode = false;
  state.rankUpSacrificeIds = [];
  if (from.kind === "PARTY") {
    state.partyEditMode = from.mode;
    state.partySelectedSlot = null;
    state.screen = "PARTY";
  } else if (from.kind === "ARENA") {
    state.arenaView = from.view;
    state.screen = "ARENA";
  } else {
    state.screen = "HOME";
  }
  render();
  return true;
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
  if (context.ruinKind) state.ruinKind = context.ruinKind;
  if (context.selectedRuinFloor !== undefined) state.selectedRuinFloor = context.selectedRuinFloor;
  render();
}

function handleSelectSlot(monsterId: string, slot: EquipSlot): void {
  state.equipmentPickerContext = { monsterId, slot };
  // 装備を選びに来た。並びはこの枠に着く物だけで組み直す
  state.equipmentOrder = null;
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
  const added = results.map((r) => addMonster(state.player, r.dexId, r.star));
  // 保存できないなら引けなかったことにする(理由は handleUseSummonScroll のコメント)
  if (!savePlayerState(state.player)) {
    removeMonsters(state.player, added.map((m) => m.id));
    state.player.crystal += cost;
    playSfx("denied", 0.7);
    render();
    return;
  }
  state.summonResults = results;
  state.lastSummonMethod = { kind: "CRYSTAL", count };
  playSummonSfx(results);
  render();
}

/**
 * コラボピックアップ召喚。
 *
 * **通常召喚とまったく同じ値段・同じ天井**で、★4・★5を引いた時だけ
 * コラボの顔ぶれから出る目が混じる(`summonCollabMany`)。
 * 保存できなかった時に引けなかったことにする作りも通常召喚と同じ。
 */
function handleCollabSummon(count: number): void {
  const cost = count >= 10 ? SUMMON_COST_TEN : SUMMON_COST_SINGLE * count;
  if (state.player.crystal < cost) {
    playSfx("denied", 0.7);
    return;
  }
  state.player.crystal -= cost;
  const results = summonCollabMany(count);
  const added = results.map((r) => addMonster(state.player, r.dexId, r.star));
  if (!savePlayerState(state.player)) {
    removeMonsters(state.player, added.map((m) => m.id));
    state.player.crystal += cost;
    playSfx("denied", 0.7);
    render();
    return;
  }
  state.summonResults = results;
  state.lastSummonMethod = { kind: "COLLAB_CRYSTAL", count };
  playSummonSfx(results);
  render();
}

/**
 * コラボピックアップ召喚を、**通常の召喚の書で引く**(依頼主の指定)。
 *
 * ダイヤを貯めていない人がコラボを一度も引けない、という形にしない。
 * 消費するのは通常の書で、出る中身だけがコラボ側の抽選になる。
 */
function handleCollabSummonScroll(count: number): void {
  if (!trySpendSummonScrolls(state.player, count)) {
    playSfx("denied", 0.7);
    return;
  }
  const results = summonCollabMany(count);
  const added = results.map((r) => addMonster(state.player, r.dexId, r.star));
  // 保存できないなら引けなかったことにする(理由は handleUseSummonScroll のコメント)
  if (!savePlayerState(state.player)) {
    removeMonsters(state.player, added.map((m) => m.id));
    state.player.summonScrolls += count;
    playSfx("denied", 0.7);
    render();
    return;
  }
  state.summonResults = results;
  state.lastSummonMethod = { kind: "COLLAB_SCROLL", count };
  playSummonSfx(results);
  render();
}

/**
 * コラボ限定召喚書で引く。
 *
 * 所持の確認・抽選・消費は `useCollabSummonScroll` が1操作でやる
 * (**0枚では引けず、連打しても残数が負にならない**)。
 * ここが持つのは、保存できなかった時に巻き戻す役目だけ。
 */
function handleUseCollabSummonScroll(type: CollabSummonScroll): void {
  const before = state.player.monsters.length;
  const result = useCollabSummonScroll(state.player, type);
  if (!result) { playSfx("denied", 0.7); return; }
  if (!savePlayerState(state.player)) {
    removeMonsters(state.player, state.player.monsters.slice(before).map((m) => m.id));
    const field = COLLAB_SCROLL_FIELD[type];
    state.player[field] = (state.player[field] ?? 0) + 1;
    playSfx("denied", 0.7);
    render();
    return;
  }
  state.summonResults = [result];
  state.lastSummonMethod = { kind: "COLLAB_SPECIAL", type };
  playSummonSfx([result]);
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
  const added = results.map((r) => addMonster(state.player, r.dexId, r.star));
  // 保存できないなら引けなかったことにする。1度きりの権利を空振りで失わせない
  if (!savePlayerState(state.player)) {
    removeMonsters(state.player, added.map((m) => m.id));
    state.player.tutorialSummonDone = false;
    playSfx("denied", 0.7);
    render();
    return;
  }
  state.summonResults = results;
  // はじまりの10連は1度きり。**「もう一度」はダイヤへ落とす**ので手段を残さない
  state.lastSummonMethod = null;
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
  const added = results.map((r) => addMonster(state.player, r.dexId, r.star));
  if (!savePlayerState(state.player)) {
    /*
     * **保存できないなら、無かったことにする。**
     * ここを素通りさせると、書だけ減って見えるのに再起動で戻る、という
     * 実際に報告された状態になる(演出も出ないまま)。引けなかったことにして、
     * 画面には `buildSaveFailureBar` の警告が出る。
     */
    removeMonsters(state.player, added.map((m) => m.id));
    state.player.summonScrolls += count;
    playSfx("denied", 0.7);
    render();
    return;
  }
  state.summonResults = results;
  state.lastSummonMethod = { kind: "SCROLL", count };
  playSummonSfx(results);
  render();
}

/**
 * 特別召喚書で引く。
 *
 * **ここだけ保存の成否を見ていなかった。**他の召喚(ダイヤ・書・はじまりの10連)は
 * 失敗したら引かなかったことにしているのに、この経路だけ素通りしていた。
 * 結果画面から「もう一度」で連打できるようになったので、同じ形へ揃える。
 */
function handleUseSpecialSummonScroll(type: SpecialSummonScroll): void {
  const before = state.player.monsters.length;
  const result = useSpecialSummonScroll(state.player, type);
  if (!result) { playSfx("denied", 0.7); return; }
  if (!savePlayerState(state.player)) {
    removeMonsters(state.player, state.player.monsters.slice(before).map((m) => m.id));
    state.player[SPECIAL_SCROLL_FIELD[type]] += 1;
    playSfx("denied", 0.7);
    render();
    return;
  }
  state.summonResults = [result];
  state.lastSummonMethod = { kind: "SPECIAL", type };
  playSummonSfx([result]);
  render();
}

/* ------------------------------------------------------------------ *
 * おまかせ装備とプリセット
 * ------------------------------------------------------------------ */

/**
 * 条件で探す。**ここでは装備を動かさない。**
 *
 * 結果を画面へ置くだけ。人が「この装備に変更」を押して初めて着け替える。
 */
function handleAutoEquipSearch(monsterId: string, settings: AutoEquipSettings): void {
  const outcome = planAutoEquip(state.player, monsterId, settings);
  if (!outcome.ok) {
    state.autoEquipPlan = null;
    state.autoEquipError = outcome.reason;
    state.autoEquipNotice = null;
    playSfx("denied", 0.7);
    render();
    return;
  }
  state.autoEquipPlan = outcome.plan;
  state.autoEquipError = null;
  state.autoEquipNotice = null;
  render();
}

/**
 * 計画を着ける。
 *
 * **保存できなければ、着けなかったことにする。**召喚で同じ事故を出している
 * (画面の上では変わっているのに、再起動すると戻る)。
 * 装備は他の子からも外すので、巻き戻しは**全モンスターぶん**取る。
 */
function handleAutoEquipApply(): void {
  const plan = state.autoEquipPlan;
  const monsterId = state.autoEquipMonsterId;
  if (!plan || !monsterId) return;

  const before = state.player.monsters.map((m) => ({ id: m.id, equipment: { ...m.equipment } }));
  applyAutoEquipPlan(state.player, monsterId, plan.assignment);
  if (!savePlayerState(state.player)) {
    for (const snapshot of before) {
      const monster = state.player.monsters.find((m) => m.id === snapshot.id);
      if (monster) monster.equipment = snapshot.equipment;
    }
    playSfx("denied", 0.7);
    render();
    return;
  }
  playSfx("levelUp");
  state.autoEquipPlan = null;
  state.autoEquipError = null;
  state.autoEquipNotice = "装備を変更しました";
  render();
}

/** いまの装備と、いまの条件を枠へ焼く */
function handleSavePreset(monsterId: string, index: number): void {
  const monster = state.player.monsters.find((m) => m.id === monsterId);
  if (!monster) return;
  writePreset(monster, index, capturePreset(monster, index, state.autoEquipSettings));
  if (!savePlayerState(state.player)) {
    playSfx("denied", 0.7);
    render();
    return;
  }
  playSfx("stageClear");
  state.autoEquipRenamingIndex = null;
  state.autoEquipNotice = `${presetsOf(monster)[index].name} に保存しました`;
  render();
}

/**
 * 保存した装備をそのまま着ける。
 *
 * **売られた装備があっても落とさない。**残っているものだけを着けて、
 * 欠けた数を伝える。他の子が着けている装備は、確認の画面へ回す。
 */
function handleApplyPreset(monsterId: string, index: number): void {
  const monster = state.player.monsters.find((m) => m.id === monsterId);
  if (!monster) return;
  const preset = presetsOf(monster)[index];
  if (!isPresetSaved(preset)) return;

  const resolved = resolvePreset(state.player, monster, preset, (m) => findMonsterById(m.dexId)?.name ?? m.dexId);
  const stats = currentStatsOf(state.player, monster);
  if (!stats) return;

  /*
   * **そのまま着けず、いったんプレビューへ回す。**
   * 他の子から外れる場合があるので、確認の形を
   * おまかせと同じにする(誰の何が外れるか見てから決める)。
   */
  const after = previewStatsOf(monster, resolved.available);
  if (!after) return;
  state.autoEquipPlan = {
    assignment: resolved.available,
    before: stats,
    after,
    stolen: resolved.stolen.map((entry) => ({
      monsterId: entry.monsterId,
      monsterName: entry.monsterName,
      equipmentId: entry.equipmentId,
      slot: entry.slot,
    })),
    // 比べてはいない。保存した組み合わせを読んだだけ
    evaluated: 0,
  };
  state.autoEquipError = null;
  state.autoEquipNotice = resolved.missing > 0
    ? `保存されていた装備のうち ${resolved.missing} 個が見つかりません。残っているぶんだけ着けます（組み直すこともできます）`
    : `${preset.name} の装備を読み込みました。下で確かめてから確定してください`;
  render();
}

/** 保存した条件で、いまの持ち物から探し直す */
function handleReoptimizePreset(monsterId: string, index: number): void {
  const monster = state.player.monsters.find((m) => m.id === monsterId);
  if (!monster) return;
  const preset = presetsOf(monster)[index];
  if (!isPresetSaved(preset)) return;
  state.autoEquipSettings = normalizeAutoEquipSettings(preset.settings);
  handleAutoEquipSearch(monsterId, state.autoEquipSettings);
  if (state.autoEquipPlan) state.autoEquipNotice = `${preset.name} の条件で組み直しました`;
  render();
}

function handleRenamePreset(monsterId: string, index: number, name: string): void {
  const monster = state.player.monsters.find((m) => m.id === monsterId);
  if (!monster) return;
  const trimmed = name.trim().slice(0, PRESET_NAME_MAX_LENGTH);
  const presets = presetsOf(monster);
  const preset = presets[index];
  writePreset(monster, index, { ...preset, name: trimmed || preset.name });
  savePlayerState(state.player);
  state.autoEquipRenamingIndex = null;
  render();
}

/** その割り当てを着けた時の最終ステータス(実際には着けない) */
function previewStatsOf(monster: MonsterInstance, assignment: Partial<Record<EquipSlot, string>>): Stats | null {
  const dex = findMonsterById(monster.dexId);
  if (!dex) return null;
  const byId = new Map(state.player.equipment.map((e) => [e.id, e] as const));
  const items = Object.values(assignment)
    .map((id) => (id ? byId.get(id) : undefined))
    .filter((e): e is Equipment => e !== undefined);
  return toBattleDefinition(monster, dex, items, resolveAccessory(monster, state.player.accessories)).stats;
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
 * まとめて送る。
 *
 * **保存できなければ、送らなかったことにする。**召喚と同じ形。
 * ここで保存の失敗を素通しすると、画面の上では消えているのに
 * 再起動すると戻ってくる(しかもポイントは消えている)状態を作る。
 */
function handleSendMonstersForPoints(): void {
  const before = structuredClone(state.player.monsters);
  const beforePoints = state.player.monsterPoints ?? 0;
  const result = sendMonstersForPoints(state.player, state.monsterExchangeIds);
  if (!result) {
    playSfx("denied", 0.7);
    return;
  }
  if (!savePlayerState(state.player)) {
    state.player.monsters = before;
    state.player.monsterPoints = beforePoints;
    playSfx("denied", 0.7);
    render();
    return;
  }
  playSfx("stageClear");
  state.monsterExchangeIds = [];
  state.monsterExchangeNotice = `${result.sent}体を送って ${result.gained}P を受け取りました（所持 ${result.total}P）`;
  render();
}

/** ポイントを交換する。足りない時は何も減らさない(`tryExchangeMonsterPoints` が守る) */
function askMonsterStorageQuantity(action: string, max: number): number | null {
  const raw = window.prompt(`${action}体数を入力してください（1〜${max}）`, String(max));
  if (raw === null) return null;
  const count = Math.floor(Number(raw));
  if (!Number.isFinite(count) || count < 1 || count > max) {
    window.alert(`1〜${max}の範囲で入力してください。`);
    return null;
  }
  return count;
}

function handleExchangeMonsterPoints(itemId: string): void {
  const beforeMonsters = structuredClone(state.player.monsters);
  const beforePoints = state.player.monsterPoints ?? 0;
  const beforeScrolls = state.player.summonScrolls;
  const result = tryExchangeMonsterPoints(state.player, itemId);
  if (!result) {
    playSfx("denied", 0.7);
    return;
  }
  if (!savePlayerState(state.player)) {
    state.player.monsters = beforeMonsters;
    state.player.monsterPoints = beforePoints;
    state.player.summonScrolls = beforeScrolls;
    playSfx("denied", 0.7);
    render();
    return;
  }
  playSfx("stageClear");
  state.monsterExchangeNotice = `${result.item.name}と交換しました（残り ${result.remaining}P）`;
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

/**
 * クリムの宝珠のかけらを1個使う。
 *
 * **画面を離れない。**スキルが1つ上がるだけなので、その場で数字が動くのが
 * いちばん分かりやすい。上がったスキルの番号も出す——
 * どれが上がるかはランダム(スキルピッグと同じ)なので、
 * 結果が見えないと「押したのに何も起きていない」ように見える。
 */
function handleUseCrimShard(targetId: string): void {
  const target = state.player.monsters.find((monster) => monster.id === targetId);
  if (!target) return;
  /*
   * **保存できて初めて使ったことにする。**召喚と同じ扱い。
   * ここを素通りさせると、かけらだけ減って見えるのに再起動で戻る
   * (実際に召喚で報告された症状と同じ形)。
   */
  const skillsBefore = [...target.skillLevels] as [number, number, number];
  const shardsBefore = crimShardsOwned(state.player);
  const result = useCrimShard(state.player, targetId);
  if (!result.ok) {
    playSfx("denied", 0.7);
    return;
  }
  if (!savePlayerState(state.player)) {
    target.skillLevels = skillsBefore;
    state.player.crimShards = shardsBefore;
    playSfx("denied", 0.7);
    render();
    return;
  }
  playSfx("levelUp");
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
  if (state.player.trialTowerRun || state.player.trialTowerHardRun) {
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
    // 深域は階ごとに消費が違う(6〜15)ので、階から引く
    case "AWAKENING_DEPTH":
      return last.floor.stamina;
    // 遺跡も階ごとに消費が違う(8〜12)
    case "RUINS":
      return last.floor.stamina;
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
  const party = usesDungeonParty(last) ? getDungeonParty(state.player) : getParty(state.player);
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
    /*
     * **ここが抜けていた。**深域を足した時、消費スタミナ(`lastRunStaminaCost`)と
     * 押せない理由(`retryBlockedReason`)には足したのに、
     * *始める*側だけ漏れていた。押しても何も起きないボタンになっていた。
     * 戻り値が無い switch なので、型チェックは漏れを教えてくれない。
     */
    case "AWAKENING_DEPTH":
      startAwakeningDepthFloor(last.floor);
      break;
    case "RUINS":
      startRuinFloor(last.floor);
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
    case "AWAKENING_DEPTH":
      navigate("AWAKENING_DEPTH");
      break;
    case "RUINS":
      navigate("RUINS");
      state.ruinKind = last.floor.kind;
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

/**
 * 1周ぶんのスタミナ。
 *
 * **`if` の連ねだったので、深域が最後の `return` へ落ちていた。**
 * 深域を周回すると、ゴールドダンジョンのスタミナが引かれていた。
 * `switch` に書き換えて、種類が増えた時に**型チェックが漏れを教える**ようにする
 * (戻り値のある関数なので、網羅していないと `number` を返せず落ちる)。
 */
function backgroundFarmCost(job: BackgroundFarmJob): number {
  switch (job.kind) {
    case "STAGE": return STAGE_STAMINA_COST;
    case "EQUIP_DUNGEON": return DUNGEON_STAMINA_COST;
    case "LEVEL_DUNGEON": return LEVEL_DUNGEON_STAMINA_COST;
    case "GOLD_DUNGEON": return GOLD_DUNGEON_STAMINA_COST;
    // 深域は階ごとに消費が違う形で作ってあるので、階から引く
    case "AWAKENING_DEPTH": return findAwakeningDepthFloor(Number(job.targetId))?.stamina ?? AWAKENING_DEPTH_FALLBACK_STAMINA;
    // 遺跡は場所IDから階を引く。見つからない時は最も重い階の値で止まる側へ倒す
    case "RUINS": return findRuinFloorByLocationId(job.targetId)?.stamina ?? RUINS_FALLBACK_STAMINA;
  }
}

/** 階が見つからない時のスタミナ。いまは全階10で揃えてある */
const AWAKENING_DEPTH_FALLBACK_STAMINA = 10;
const RUINS_FALLBACK_STAMINA = 12;

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
    let skyStacks = new Map<string, number>();
    let waves = 0;
    for (const wave of stage.waves) {
      const setup = setupWaveBattle(alive, hp, wave, state.player.equipment, difficulty, state.player.accessories);
      const engine = new BattleEngine(setup.playerDefs, setup.enemyDefs, { initialPlayerHp: setup.initialPlayerHp, initialSkyStacks: alive.map(m => skyStacks.get(m.id) ?? 0) });
      if (engine.run().winner !== "PLAYER") return { won: false, waves, extraGold: waves * stageWaveGold(stage, difficulty) };
      const survivors = extractSurvivors(engine, alive);
      alive = survivors.survivorInstances; hp = survivors.survivorHp; skyStacks = survivors.survivorSkyStacks; waves += 1;
    }
    return { won: true, waves, extraGold: waves * stageWaveGold(stage, difficulty) };
  }
  /*
   * **深域がここから漏れていた。**
   *
   * 三項の最後が「それ以外はゴールドダンジョン」だったので、深域を周回すると
   * **同じ階番号のゴールドダンジョンと戦っていた**(見つからない階は全敗扱い)。
   * 種類を1つずつ書き、当てはまらないものは黙って別の場所へ落とさない。
   */
  if (job.kind === "RUINS") {
    const floor = findRuinFloorByLocationId(job.targetId);
    if (!floor) return { won: false, waves: 0, extraGold: 0 };
    const setup = setupDungeonBattle(party, floor, state.player.equipment, state.player.accessories);
    return { won: new BattleEngine(setup.playerDefs, setup.enemyDefs).run().winner === "PLAYER", waves: 1, extraGold: 0 };
  }
  const target = job.kind === "EQUIP_DUNGEON"
    ? findDungeonFloorByKey(job.targetId)
    : job.kind === "LEVEL_DUNGEON"
      ? LEVEL_DUNGEON_DEFS.find((f) => f.tier === job.targetId)
      : job.kind === "GOLD_DUNGEON"
        ? GOLD_DUNGEON_FLOORS.find((f) => String(f.floor) === job.targetId)
        : findAwakeningDepthFloor(Number(job.targetId));
  if (!target) return { won: false, waves: 0, extraGold: 0 };
  const setup = setupDungeonBattle(party, target, state.player.equipment, state.player.accessories);
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
    /*
     * **1周ごとに、最新のスタミナを見てから判断する。**
     *
     * 自動周回中でも他のダンジョンへ入れるようになったので、
     * ここへ来るまでにプレイヤーがスタミナを使っていることがある。
     * 先に何周ぶんかまとめて払う作りにはしない——払った後で手動戦闘に
     * 使われたら、どちらかがマイナスになる。
     *
     * `applyPassiveStaminaRegen` は `trySpendStamina` の中で呼ばれるが、
     * **判断の前にも一度通す。**回復済みなら足りる、という場面で
     * 「スタミナ不足」と言って止まってしまう。
     */
    applyPassiveStaminaRegen(state.player);
    /*
     * ポーションの自動使用。**足りない時だけ、必要な分だけ。**
     * ダイヤには一切手を付けない(依頼主の指定)。
     */
    /*
     * **決めた数までしか使わない。**残りは手元に残る。
     * 予算を使い切ったら、次からは普通にスタミナ切れで止まる。
     */
    const budgetLeft = staminaPotionBudgetOf(job, STAMINA_POTION_UNLIMITED_BUDGET) - (job.staminaPotionsUsed ?? 0);
    if (budgetLeft > 0 && state.player.stamina < cost) {
      const use = staminaPotionsNeeded(
        state.player.stamina, cost, staminaPotionsOwned(state.player), STAMINA_POTION_AMOUNT, budgetLeft,
      );
      for (let i = 0; i < use; i += 1) {
        if (!tryUseStaminaPotion(state.player).ok) break;
        job.staminaPotionsUsed = (job.staminaPotionsUsed ?? 0) + 1;
      }
    }
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
  else if (job.kind === "AWAKENING_DEPTH") {
    /*
     * **深域もここから漏れていた。**最後の `else` がゴールドダンジョンだったので、
     * 階番号が重なる1〜5階では**ゴールドの報酬**が入り、6階以上では
     * 階が見つからず `!` で潰した undefined が渡って落ちていた。
     */
    const floor = findAwakeningDepthFloor(Number(job.targetId));
    if (!floor) { job.inFlight = false; finishBackgroundFarm(job, "DEFEAT"); savePlayerState(state.player); refreshBackgroundFarmStatus(); return; }
    const materials = grantAwakeningDepthReward(state.player, floor, party);
    // 素材はゴールドや経験値と別の枠。周回の結果へそのまま積む
    job.result.awakeningShards = (job.result.awakeningShards ?? 0) + materials.shards;
    job.result.awakeningCrystals = (job.result.awakeningCrystals ?? 0) + materials.crystals;
    job.result.awakeningStones = (job.result.awakeningStones ?? 0) + materials.stones;
    // ゴールドと経験値は `mergeReward` が他の場所と同じ欄へ積む(手で挑んだ時と同じ額)
    reward = materials;
  } else if (job.kind === "RUINS") {
    /*
     * 遺跡。アクセ・進化核・カケラと副ドロップ、ゴールドと経験値(手で挑んだ時と同じ)。
     * 集計は `mergeReward` がアクセ・核・カケラの欄へ積む。
     */
    const floor = findRuinFloorByLocationId(job.targetId);
    if (!floor) { job.inFlight = false; finishBackgroundFarm(job, "DEFEAT"); savePlayerState(state.player); refreshBackgroundFarmStatus(); return; }
    reward = grantRuinReward(state.player, floor, party);
  } else reward = applyGoldDungeonClearRewards(state.player, GOLD_DUNGEON_FLOORS.find((f) => String(f.floor) === job.targetId)!, party);
  state.player.gold += battle.extraGold;
  mergeReward(job.result, reward, battle.extraGold);
  job.result.cleared += 1; job.completedRuns += 1; job.inFlight = false;
  // コラボミッションの「自動周回を30周」。**1周おわるたびに1つ**
  recordCollabFarmRun(state.player);
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
  state.player.backgroundFarmJob = createBackgroundFarmJob({
    ...input, requestedRuns: count, partyIds,
    referenceRunSeconds: timing.seconds, referenceFromManual: timing.fromManual,
    // 始めた時点の設定で固定する。途中で変えて、既に進んだぶんの扱いが変わらないように
    staminaPotionBudget: staminaPotionFarmBudgetOf(state.player),
  });
  savePlayerState(state.player);
  state.screen = "HOME";
  render(); scheduleBackgroundFarm();
}

/**
 * 1回の周回で使ってよいポーションの数を決める。**0なら使わない。**
 *
 * **起動をまたいで残す。**再生速度と同じで、周回のたびに入れ直すものではない。
 * 進行中のジョブには**効かない**(始めた時の設定で回りきる)。
 */
function setStaminaPotionFarmBudget(next: number): void {
  state.player.staminaPotionFarmBudget = Math.max(0, Math.floor(next));
  savePlayerState(state.player);
  render();
}

/** いまの手持ちで、その場所へもう1回挑めるか(判定そのものは autoFarm.ts) */
function farmBlockReasonFor(last: LastRun): AutoFarmStopReason | null {
  const party = usesDungeonParty(last) ? getDungeonParty(state.player) : getParty(state.player);
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

/* ==========================================================================
 * 目覚の深域
 * ========================================================================== */

function startAwakeningDepthFloor(floor: AwakeningDepthFloor): void {
  const party = getParty(state.player);
  if (party.length === 0) return;
  if (!isAwakeningDepthUnlocked(state.player, floor.floor)) { playSfx("denied", 0.7); return; }
  if (!trySpendStamina(state.player, floor.stamina).ok) {
    playSfx("denied", 0.7);
    return;
  }
  savePlayerState(state.player);
  state.lastRun = { kind: "AWAKENING_DEPTH", floor };
  state.awakeningDepthRun = { floor, partyInstances: party, manualStartedAt: Date.now() };
  state.screen = "AWAKENING_DEPTH_BATTLE";
  render();
}

function finishAwakeningDepth(cleared: boolean): void {
  const run = state.awakeningDepthRun;
  if (!run) return;
  const floor = run.floor;
  if (cleared) {
    recordManualBattle(
      state.player.recentManualClearTimes,
      manualClearKey("AWAKENING_DEPTH", String(floor.floor)),
      run.manualStartedAt, Date.now(),
    );
  }
  /*
   * 素材は**勝った時だけ。**負けても消費したスタミナは戻らないが、
   * それは他のダンジョンと同じ扱い。
   */
  const reward = cleared ? grantAwakeningDepthReward(state.player, floor, run.partyInstances) : null;
  savePlayerState(state.player);
  state.awakeningDepthRun = null;

  const materialLines = reward
    ? [
        reward.shards > 0 ? `目覚の欠片 ×${reward.shards}` : null,
        reward.crystals > 0 ? `目覚の結晶 ×${reward.crystals}` : null,
        reward.stones > 0 ? `目覚の奇石 ×${reward.stones}` : null,
      ].filter((v): v is string => v !== null)
    : [];

  state.stageResult = {
    cleared,
    stageName: floor.name + (reward?.firstClear ? "(初回クリア)" : ""),
    goldEarned: reward?.goldEarned ?? 0,
    crystalEarned: 0,
    wavesCleared: cleared ? 1 : 0,
    totalWaves: 1,
    levelUps: reward?.levelUps ?? [],
    expAwards: reward?.expAwards ?? [],
    dropDexId: null,
    dropStar: null,
    equipmentDrop: null,
    fighterLevelsGained: reward?.fighterLevelsGained ?? 0,
    extraLines: materialLines,
  };
  enterStageResult();
}

function handleAutoFarmAwakeningDepth(floor: AwakeningDepthFloor, count: number): void {
  beginBackgroundFarm(
    { kind: "AWAKENING_DEPTH", targetId: String(floor.floor), targetName: floor.name, requestedRuns: count },
    state.player.partyIds,
    (state.player.clearedAwakeningDepthFloors ?? []).includes(floor.floor),
  );
}

function renderCurrentAwakeningDepthBattle(): BattleViewHandle {
  const run = state.awakeningDepthRun;
  if (!run) throw new Error("awakeningDepthRun is not set");

  const setup = setupDungeonBattle(run.partyInstances, run.floor, state.player.equipment, state.player.accessories);
  const engine = new BattleEngine(setup.playerDefs, setup.enemyDefs);

  return renderBattleView({
    engine,
    playerTeam: setup.playerDefs,
    enemyTeam: setup.enemyDefs,
    title: `深域 ${run.floor.floor}階`,
    resultLabel: (winner) => (winner === "PLAYER" ? "🎁 報酬を受け取る" : "深域に戻る"),
    onFinish: (winner) => finishAwakeningDepth(winner === "PLAYER"),
    chain: battleChainInfo(),
  });
}

/* ==========================================================================
 * 力の遺跡・守護の遺跡
 * ========================================================================== */

/**
 * ダンジョン編成(最大5体)で戦う場所か。**装備ダンジョンと遺跡。**
 * 遺跡は装備ダンジョンと同じ格の周回場所なので、同じ編成を使う(依頼主の指定)。
 */
function usesDungeonParty(last: LastRun): boolean {
  return last.kind === "EQUIP_DUNGEON" || last.kind === "RUINS";
}

function startRuinFloor(floor: RuinFloor): void {
  const party = getDungeonParty(state.player);
  if (party.length === 0) return;
  if (!isRuinFloorUnlocked(state.player, floor.kind, floor.floor)) { playSfx("denied", 0.7); return; }
  if (!trySpendStamina(state.player, floor.stamina).ok) {
    playSfx("denied", 0.7);
    return;
  }
  savePlayerState(state.player);
  state.lastRun = { kind: "RUINS", floor };
  state.ruinRun = { floor, partyInstances: party, manualStartedAt: Date.now() };
  state.screen = "RUINS_BATTLE";
  render();
}

/**
 * 1勝ぶんの報酬を結果画面の行にする。**1行に1つ**(結果画面は「名前 ×数」を札にする)。
 * 召喚の書・ピッグは結果画面が元から出すので、ここでは重ねない。確率の数字は出さない。
 */
function ruinRewardLines(reward: RuinReward): string[] {
  const acc = reward.accessoryDrop;
  return [
    accessoryTitle(acc),
    ...acc.specials.map((roll) => `特殊 ${describeSpecial(roll)}`),
    `進化核 ×${reward.evolutionCores}`,
    `古代のカケラ ×${reward.ancientShards}`,
  ];
}

function finishRuin(cleared: boolean): void {
  const run = state.ruinRun;
  if (!run) return;
  const floor = run.floor;
  if (cleared) {
    recordManualBattle(
      state.player.recentManualClearTimes,
      manualClearKey("RUINS", ruinLocationId(floor.kind, floor.floor)),
      run.manualStartedAt, Date.now(),
    );
  }
  // 報酬は**勝った時だけ**。負けても消費したスタミナは戻らない(他のダンジョンと同じ)
  const reward = cleared ? grantRuinReward(state.player, floor, run.partyInstances) : null;
  savePlayerState(state.player);
  state.ruinRun = null;
  state.stageResult = {
    cleared,
    stageName: floor.name + (reward?.firstClear ? "(初回クリア)" : ""),
    goldEarned: reward?.goldEarned ?? 0,
    crystalEarned: 0,
    wavesCleared: cleared ? 1 : 0,
    totalWaves: 1,
    levelUps: reward?.levelUps ?? [],
    expAwards: reward?.expAwards ?? [],
    fighterLevelsGained: reward?.fighterLevelsGained ?? 0,
    dropDexId: null,
    dropStar: null,
    equipmentDrop: null,
    pigDrop: reward?.pigDrop ?? null,
    summonScrollDropped: reward?.summonScrollDropped ?? false,
    extraLines: reward ? ruinRewardLines(reward) : [],
    // 「獲得したアクセサリーを見る」のシートを開くためだけのID(既に所持品へ入っている)
    earnedAccessoryIds: reward ? [reward.accessoryDrop.id] : [],
  };
  enterStageResult();
}

function handleAutoFarmRuin(floor: RuinFloor, count: number): void {
  beginBackgroundFarm(
    { kind: "RUINS", targetId: ruinLocationId(floor.kind, floor.floor), targetName: floor.name, requestedRuns: count },
    state.player.dungeonPartyIds,
    // 周回は**一度クリアした階だけ。**勝てるか分からない階でスタミナだけが消えるのを防ぐ
    isRuinFloorCleared(state.player, floor.kind, floor.floor),
  );
}

function renderCurrentRuinBattle(): BattleViewHandle {
  const run = state.ruinRun;
  if (!run) throw new Error("ruinRun is not set");
  const setup = setupDungeonBattle(run.partyInstances, run.floor, state.player.equipment, state.player.accessories);
  const engine = new BattleEngine(setup.playerDefs, setup.enemyDefs);
  return renderBattleView({
    engine,
    playerTeam: setup.playerDefs,
    enemyTeam: setup.enemyDefs,
    title: run.floor.name,
    resultLabel: (winner) => (winner === "PLAYER" ? "🎁 報酬を受け取る" : "遺跡に戻る"),
    onFinish: (winner) => finishRuin(winner === "PLAYER"),
    chain: battleChainInfo(),
  });
}

/* ==========================================================================
 * アクセサリー・カケラ製作・限界能力付与の画面遷移
 * ========================================================================== */

function openAccessories(pickFor: string | null): void {
  state.accessoryPickFor = pickFor;
  state.selectedAccessoryId = null;
  state.accessoryNotice = null;
  // まとめ売りの選択は持ち越さない。着ける先を選ぶ画面では出しもしない
  state.accessorySelecting = false;
  state.accessorySelectedIds = [];
  if (pickFor !== null) {
    state.accessoryPickFilter = { ...EMPTY_ACCESSORY_FILTER };
    state.accessoryPickFilterOpen = false;
  }
  state.screen = "ACCESSORIES";
  render();
}

/**
 * アクセ一覧を閉じる。**戻り先は共通の履歴に任せる**(画面上の「戻る」と同じ道)。
 * 履歴が無い時だけホームへ。
 */
/**
 * 「今回獲得したアクセサリー」のシートを開く。**開くたびに条件と選択を白紙へ戻す。**
 * 前の結果で「★6だけ」に絞ったまま残っていると、今回の分が1個も見えないシートになる。
 */
function openFarmAccessorySheet(source: AutoFarmResult | StageResultInfo): void {
  state.farmAccessoryOpen = true;
  state.farmAccessorySource = source;
  state.farmAccessorySelectedIds = [];
  state.farmAccessoryDetailId = null;
  state.farmAccessorySelling = false;
  state.farmAccessoryFilter = { ...EMPTY_ACCESSORY_FILTER };
  state.farmAccessoryFilterOpen = false;
  // 巻物の位置は装備のシートと同じ控えを使う。開き直したら先頭から
  farmEquipmentScrollTop = 0;
  render();
}

function closeFarmAccessorySheet(): void {
  state.farmAccessoryOpen = false;
  state.farmAccessoryDetailId = null;
  state.farmAccessorySelectedIds = [];
  render();
}

/**
 * シートを描く。**開いた時の結果と、いま出している結果が同じ時だけ。**
 * 中身は所持品に残っている今回のアクセだけ(売った・消えたものは出さない)。
 */
function renderFarmAccessorySheetFor(source: AutoFarmResult | StageResultInfo, earnedIds: readonly string[]): HTMLElement | null {
  if (!state.farmAccessoryOpen) return null;
  if (state.farmAccessorySource !== source) {
    state.farmAccessoryOpen = false;
    state.farmAccessoryDetailId = null;
    return null;
  }
  const earned = new Set(earnedIds);
  const accessories = accessoriesOf(state.player).filter((acc) => earned.has(acc.id));
  const worn = wornAccessoryIds(state.player);
  const sellable = new Set(sellableAccessoryIds(accessories, worn));
  state.farmAccessorySelectedIds = state.farmAccessorySelectedIds.filter((id) => sellable.has(id));
  if (state.farmAccessoryDetailId && !accessories.some((acc) => acc.id === state.farmAccessoryDetailId)) state.farmAccessoryDetailId = null;
  const ownerName = (accessoryId: string): string | null => {
    const owner = accessoryOwner(state.player, accessoryId);
    if (!owner) return null;
    return `${findMonsterById(owner.dexId)?.name ?? owner.dexId}★${owner.star}`;
  };
  return renderFarmAccessoryResult({
    accessories,
    wornIds: worn,
    ownerName,
    selectedIds: state.farmAccessorySelectedIds,
    detailId: state.farmAccessoryDetailId,
    selling: state.farmAccessorySelling,
    filter: state.farmAccessoryFilter,
    filterOpen: state.farmAccessoryFilterOpen,
    onChangeFilter: (filter) => { state.farmAccessoryFilter = filter; render(); },
    onToggleFilterOpen: () => { state.farmAccessoryFilterOpen = !state.farmAccessoryFilterOpen; render(); },
    onToggleLock: (id) => {
      const acc = findAccessory(state.player, id);
      if (!acc || !earned.has(id)) return;
      setAccessoryLocked(state.player, id, !acc.locked);
      if (acc.locked) state.farmAccessorySelectedIds = state.farmAccessorySelectedIds.filter((selectedId) => selectedId !== id);
      savePlayerState(state.player);
      render();
    },
    onToggleSelected: (id) => {
      if (!sellable.has(id)) return;
      state.farmAccessorySelectedIds = state.farmAccessorySelectedIds.includes(id)
        ? state.farmAccessorySelectedIds.filter((selectedId) => selectedId !== id)
        : [...state.farmAccessorySelectedIds, id];
      render();
    },
    onDetail: (id) => { state.farmAccessoryDetailId = id; render(); },
    onSell: () => {
      if (state.farmAccessorySelling) return;
      const currentWorn = wornAccessoryIds(state.player);
      const targets = accessoriesOf(state.player)
        .filter((acc) => earned.has(acc.id) && state.farmAccessorySelectedIds.includes(acc.id));
      if (!targets.length || targets.some((acc) => acc.locked || currentWorn.has(acc.id))) {
        state.farmAccessorySelectedIds = [];
        render();
        return;
      }
      const total = targets.reduce((sum, acc) => sum + accessorySellPrice(acc), 0);
      if (!window.confirm(`選択した${targets.length}個のアクセサリーを${total.toLocaleString("ja-JP")}ゴールドで売却します。\nこの操作は取り消せません。`)) return;
      // 確認の後にも、今の所持品・ロック・装着を見直す(`bulkSellAccessories` が1個でも駄目なら丸ごと断る)
      state.farmAccessorySelling = true;
      const result = bulkSellAccessories(state.player, targets.map((acc) => acc.id));
      state.farmAccessorySelling = false;
      if (result.ok) savePlayerState(state.player);
      else playSfx("denied", 0.7);
      state.farmAccessorySelectedIds = [];
      state.farmAccessoryDetailId = null;
      render();
    },
    // 画面が渡したID(絞り込みで見えていて売れるもの)だけを選ぶ
    onSelectAllShown: (ids) => {
      state.farmAccessorySelectedIds = ids.filter((id) => sellable.has(id));
      render();
    },
    onClearSelection: () => { state.farmAccessorySelectedIds = []; render(); },
    onClose: closeFarmAccessorySheet,
  });
}

function closeAccessories(): void {
  state.selectedAccessoryId = null;
  state.accessoryNotice = null;
  if (canGoBack()) goBack();
  else navigate("HOME");
}

function openCraft(): void {
  state.craftNotice = null;
  state.craftLastAccessory = null;
  state.craftLastEquipment = null;
  state.screen = "ANCIENT_CRAFT";
  render();
}

/**
 * 限界能力付与を開く。**クリエイトの「能力付与」の中にある**(能力ポイントのすぐ下)。
 * 単独の画面だった頃の入口(開発用の窓口)もここを通す。
 */
function openLimitBreak(monsterId: string): void {
  const monster = state.player.monsters.find((m) => m.id === monsterId);
  if (!monster) return;
  syncLimitDraft(monster, true);
  state.createTargetId = monsterId;
  state.createMaterialId = null;
  state.createSlot = null;
  state.createNotice = null;
  state.createMenu = "ABILITY";
  state.screen = "MONSTER_CREATE";
  render();
}

/**
 * 限界配分の下書きを、いま見ている1体の保存値へ合わせる。
 * **別の1体へ移った時だけ**読み直す(同じ1体の下書きは、保存前でも消さない)。
 */
function syncLimitDraft(monster: MonsterInstance, force = false): void {
  if (!force && state.limitTargetId === monster.id) return;
  state.limitTargetId = monster.id;
  state.limitDraft = { ...(monster.development.limitBreak?.points ?? { hp: 0, atk: 0, def: 0, spd: 0 }) };
  state.limitNotice = null;
}

/* ==========================================================================
 * 才能覚醒
 * ========================================================================== */

/*
 * **才能覚醒への専用の入口は持たない。**
 *
 * 才能を付ける先はスキル2・3で、その中身を入れ替えるのはクリエイト。
 * 入口を別に持つと同じものを2か所で触ることになるので、
 * クリエイト(`MONSTER_CREATE` の「才能覚醒」の欄)に一本化してある。
 */

/**
 * 才能覚醒の操作をまとめて受ける。
 *
 * **継承で技が変わっていた時の後始末を、毎回ここで通す。**
 * 画面を開くたびに確かめる形にすると、開かない限り
 * 不適合な才能がptを取り続けることになる。
 */
function withTalentTarget(run: (monster: MonsterInstance) => { ok: boolean; reason?: string }): void {
  const monster = state.player.monsters.find((m) => m.id === state.createTargetId);
  if (!monster) return;
  const result = run(monster);
  // **押せない時は音で返す。**理由はボタン側の文言が既に語っている
  if (!result.ok) playSfx("denied", 0.7);
  savePlayerState(state.player);
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

  const setup = setupDungeonBattle(run.partyInstances, run.floor, state.player.equipment, state.player.accessories);
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

  const setup = setupDungeonBattle(run.partyInstances, run.def, state.player.equipment, state.player.accessories);
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
 * 対戦候補を組み直す。**10枠 = 実プレイヤー3 + NPC7。**
 *
 * 実プレイヤーは**レート差に関係なく**、近い・中くらい・遠いを1人ずつ選ぶ
 * (`orderArenaPlayerPicks`)。前は自分の ±300 に居る人だけだったので、
 * 人口が少ないと実プレイヤーが1人も並ばなかった。
 * 実プレイヤーが3人に満たない時だけ、その分もNPCで埋める。
 * 未接続なら通信せずにNPCだけで並べる(オフラインでも遊べる状態を壊さない)。
 */
async function refreshArenaCandidates(): Promise<void> {
  const rating = state.player.arenaPoints;
  const seed = state.player.arenaOpponentSeed;
  // NPCは10人ぶん作る。**サーバもこの数で作り直して相手を特定する**(`ARENA_NPC_GENERATE_COUNT`)
  const npcs = buildArenaNpcs(rating, seed, ARENA_NPC_GENERATE_COUNT);
  const options = {
    count: ARENA_CANDIDATE_TOTAL,
    selfId: arenaSelfId(),
    recentIds: state.player.arenaRecentOpponentIds,
    maxPlayers: ARENA_PLAYER_SLOTS,
    keepPlayerOrder: true,
  };
  // まずNPCだけで即座に並べる。通信を待つ間、画面が空にならないようにする
  state.arenaCandidates = buildArenaCandidates([], npcs, options);
  if (!(await connectArena())) return;
  state.arenaCandidatesLoading = true;
  // 1. 全員のID・レートだけを軽く取り、近・中・遠から選ぶ順番を決める
  const pool = await fetchArenaOpponentPool(arenaSelfId());
  const order = orderArenaPlayerPicks(pool, {
    selfId: arenaSelfId(),
    myRating: rating,
    seed,
    recentIds: state.player.arenaRecentOpponentIds,
    slots: ARENA_PLAYER_SLOTS,
  });
  // 2. 選んだ人(と控え)の防衛編成だけを取る。壊れていた人は落ち、控えが繰り上がる
  const players = await fetchArenaOpponentsByIds(order);
  state.arenaCandidatesLoading = false;
  // 戻ってくる頃に別の画面へ移っていることがある。その時は捨てる
  if (state.screen !== "ARENA") return;
  state.arenaCandidates = buildArenaCandidates(players, npcs, options);
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
  /*
   * **上書きせず、合わせる。**
   *
   * 以前はここで丸ごと置き換えていたので、繋がっていない間に積んだ記録
   * (留守中にNPCへ攻められた分)が、一度オンラインになった瞬間に
   * 全部消えて保存されていた。サーバはその戦いを知らないので、二度と戻らない。
   */
  state.player.arenaMatchHistory = mergeArenaHistory(state.player.arenaMatchHistory, records);
  savePlayerState(state.player);
  render();
}

/** ランキングを引き直す。未接続なら何もしない(嘘の順位を出さないため) */
/**
 * ホームから順位の一覧を開く。
 *
 * **開いた札のぶんだけ取りに行く。**両方いきなり呼ぶと、
 * 塔しか見ない人にもアリーナの通信が走る。
 */
function openRankings(tab: RankingTab): void {
  state.rankingTab = tab;
  navigate("RANKINGS");
  if (tab === "ARENA") void refreshArenaRanking();
  else void refreshTrialTowerRanking();
}

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

function startArenaMatch(entry: ArenaOpponentEntry, onRefused?: () => void): boolean {
  const party = getArenaTeam(state.player, "OFFENSE");
  if (party.length === 0) {
    state.arenaNotice = "攻撃編成を組んでください";
    render();
    return false;
  }
  if (entry.defense.units.length === 0) {
    state.arenaNotice = "この相手は防衛編成を登録していません";
    playSfx("denied", 0.7);
    render();
    return false;
  }
  // アリーナはスタミナではなく挑戦券で回す。育成の周回と取り合いにしないため
  applyArenaTicketRegen(state.player);
  if (state.player.arenaTickets <= 0) {
    state.arenaNotice = "挑戦券が足りません";
    playSfx("denied", 0.7);
    render();
    return false;
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
   * サーバまで届かなければ(未設定・通信断)ローカルだけで進む。
   * その時は勝敗も手元の計算になる——オフラインで遊べる状態は壊さない。
   *
   * **届いたうえで断られた時は、進まない。**
   * サーバから見てその対戦は存在しないので、手元で戦わせると
   * 券だけが手元で引かれ、次に残高を写した瞬間に元へ戻る。
   * プレイヤーには「挑戦券が減らない」「何度でも挑める」ように見え、
   * レートとコインだけが手元で動いて、戦績はどこにも残らない。
   * 断られたら止めて、理由を見せる。
   */
  if (!arenaSyncAvailable()) {
    trySpendArenaTicket(state.player);
    savePlayerState(state.player);
    state.screen = "ARENA_BATTLE";
    render();
    return true;
  }

  state.arenaNotice = "対戦を準備しています…";
  render();

  // 攻撃編成も防衛と同じ形で焼く。**サーバは同じ検分をかける**
  const attackerSnapshot = captureArenaDefense(party, state.player.equipment, Date.now(), state.player.accessories ?? []);

  void (async () => {
    const connected = await connectArena();
    const result = connected
      ? await beginArenaMatch({
        kind: entry.kind,
        attackerSnapshot,
        opponentId: entry.kind === "PLAYER" ? entry.id : null,
        opponentSeed: entry.kind === "NPC" ? String(state.player.arenaOpponentSeed) : null,
        opponentIndex: entry.kind === "NPC" ? (entry.npcGenerationIndex ?? entry.index) : null,
        opponentCount: entry.kind === "NPC" ? ARENA_NPC_GENERATE_COUNT : null,
        opponentName: entry.name,
      })
      : ({ ok: false, reached: false, reason: null } as const);

    // 待っている間に別の画面へ移っていることがある。その時は始めない
    if (state.arenaEntry !== entry) return;

    if (result.ok) {
      // 挑戦券はサーバが引いた。**手元で二重に引かない**
      state.arenaTicket = result.ticket;
      state.arenaAttackerSnapshot = attackerSnapshot;
      state.player.arenaTickets = result.ticket.tickets;
    } else if (result.reached) {
      /*
       * **サーバに断られた。ここで止める。**
       * 券は引かない(引いても次の同期で戻り、減らないように見えるだけ)。
       * 理由は必ず画面へ出す。黙って手元で戦わせていた頃は、
       * 何が起きているのかプレイヤーにも、報告を受けた側にも分からなかった。
       */
      state.arenaEntry = null;
      state.lastRun = null;
      // 図鑑IDで弾かれた時は、モンスター名まで出す。
      // **どの1体が原因か分からないと、外して挑み直すこともできない**
      state.arenaNotice = arenaRefusalText(
        result.reason,
        (dexId) => findMonsterById(dexId)?.name ?? null,
      );
      // 呼んだ側が先に付けた印(リベンジの1回きりの権利など)を戻させる
      onRefused?.();
      playSfx("denied", 0.7);
      render();
      return;
    } else {
      // サーバまで届かなかった。手元だけで進む
      trySpendArenaTicket(state.player);
    }
    savePlayerState(state.player);
    state.arenaNotice = null;
    state.screen = "ARENA_BATTLE";
    render();
  })();
  return true;
}

/**
 * 決着を反映する。
 *
 * **画面はレートもコインも触らない。** どちらもいくら動くかは
 * `recordArenaMatch` が決める(`game/arena/match.ts`)。
 * ここがやるのは、その結果を見せることだけ。
 */
async function finishArenaMatch(won: boolean): Promise<void> {
  const entry = state.arenaEntry;
  if (!entry) return;

  const outcome = recordArenaMatch(state.player, { opponent: entry, won, side: "OFFENSE" });
  savePlayerState(state.player);

  /*
   * オンライン戦は、結果画面を出す前にサーバ精算を待つ。
   * ここを待たずにローカル予測値を見せると、数秒後にサーバ確定値へ
   * 差し替わり「勝ったのに下がった」ように見える原因になる。
   */
  const ticket = state.arenaTicket;
  state.arenaTicket = null;
  let ratingBefore = outcome.ratingBefore;
  let ratingAfter = outcome.ratingAfter;
  let ratingDelta = outcome.record.ratingDelta;
  let coins = outcome.record.coins;
  let finalWon = won;

  if (ticket) {
    const report = await settleArenaMatch(ticket.matchId, ticket.nonce);
    if (report) {
      ratingBefore = report.ratingBefore;
      ratingAfter = report.rating;
      ratingDelta = report.ratingDelta;
      coins = report.coins;
      finalWon = report.won;

      // サーバ確定値を即座に手元へ同期してから結果画面を描く。
      state.player.arenaPoints = report.rating;
      state.player.arenaCoins = report.coinBalance;
      state.player.arenaTickets = report.tickets;
      if (report.rating > state.player.arenaSeasonBestPoints) {
        state.player.arenaSeasonBestPoints = report.rating;
      }
      const record = state.player.arenaMatchHistory.find((item) => item.id === outcome.record.id);
      if (record) {
        record.won = report.won;
        record.ratingDelta = report.ratingDelta;
        record.ratingAfter = report.rating;
        record.coins = report.coins;
      }
      savePlayerState(state.player);
    }
  }

  const beforeTier = arenaTierForRating(ratingBefore);
  const afterTier = arenaTierForRating(ratingAfter);
  const rankLine = beforeTier.id !== afterTier.id
    ? ratingAfter > ratingBefore ? `${afterTier.name}へ昇格！` : `${afterTier.name}へ降格`
    : null;
  const signedDelta = `${ratingDelta >= 0 ? "+" : ""}${ratingDelta}`;

  state.stageResult = {
    cleared: finalWon,
    stageName: `アリーナ ${entry.name}`,
    goldEarned: 0,
    crystalEarned: 0,
    wavesCleared: finalWon ? 1 : 0,
    totalWaves: 1,
    levelUps: [],
    dropDexId: null,
    dropStar: null,
    equipmentDrop: null,
    pigDrop: null,
    summonScrollDropped: false,
    fighterLevelsGained: 0,
    extraLines: [
      `レート　${ratingBefore.toLocaleString("ja-JP")} → ${ratingAfter.toLocaleString("ja-JP")}（${signedDelta}）`,
      `アリーナコイン +${coins}`,
      ...(rankLine ? [rankLine] : []),
    ],
  };
  state.arenaNotice = `${signedDelta} レート（${ratingAfter}） / アリーナコイン +${coins}${rankLine ? ` / ${rankLine}` : ""}`;
  state.arenaEntry = null;
  state.arenaCandidates = [];
  enterStageResult();
}

/* ============================================================
 * 試練の塔
 * ============================================================ */

/** Arena と同じ匿名認証・プロフィールを使って塔の同期入口を整える。 */
let trialTowerProfileName: string | null = null;
async function connectTrialTower(): Promise<boolean> {
  if (!arenaSyncAvailable()) return false;
  const auth = await ensureArenaAuth();
  if (!auth) return false;
  const name = state.player.fighterName || "プレイヤー";
  if (trialTowerProfileName === name) return true;
  if ((await ensureArenaProfile(name)) === null) return false;
  trialTowerProfileName = name;
  return true;
}

/**
 * ローカルの歴代最高を送る。失敗しても塔・報酬・セーブには一切触れない。
 *
 * **ただし、失敗を黙って捨てない。**
 *
 * これまでは `void syncTrialTowerBest()` で投げっぱなしだった。送るきっかけは
 * 2つだけ(階を登った瞬間と、ランキングを開いた時)で、一度こけると
 * ランキングを開くまで二度と追いつかない。**塔で遊んでいてもランキングを
 * 見ない人は、登った記録が永久に届かない。**
 * 実際、99階まで登った方のサーバ側が69階で止まっていた。
 *
 * 送れなかった階を覚えておき、塔の画面でそう伝える。
 *
 * 呼び出し元には**描画の途中**(`render()` の中)も含まれるので、
 *
 *   - 届いた階を覚えて、同じ階を何度も送らない
 *   - 走っている最中は重ねない
 *   - 失敗した時の再試行は間隔を空ける
 *
 * の3つで、描き直しのたびに通信が走るのを止めている。
 */
const TOWER_SYNC_RETRY_MS = 30_000;
const towerSyncSentFloor: Record<TowerMode, number> = { NORMAL: 0, HARD: 0 };
const towerSyncRunning: Record<TowerMode, boolean> = { NORMAL: false, HARD: false };
const towerSyncLastAttemptAt: Record<TowerMode, number> = { NORMAL: 0, HARD: 0 };

async function syncTrialTowerBest(mode: TowerMode, force = false): Promise<boolean> {
  const best = mode === "HARD"
    ? state.player.trialTowerHardLifetimeBestFloor
    : state.player.trialTowerLifetimeBestFloor;
  if (best < 1) return false;
  /*
   * **同期の口が無い環境では、何も言わない。**
   * ここで pending を立てると、ランキングそのものが無い環境で
   * 「送れていません」とだけ出る(送り先が無いだけで、失敗ではない)。
   */
  if (!arenaSyncAvailable()) return false;
  if (towerSyncSentFloor[mode] >= best) return true;
  if (towerSyncRunning[mode]) return false;
  if (!force && Date.now() - towerSyncLastAttemptAt[mode] < TOWER_SYNC_RETRY_MS) return false;

  towerSyncRunning[mode] = true;
  towerSyncLastAttemptAt[mode] = Date.now();
  let ok = false;
  try {
    ok = (await connectTrialTower()) && (await submitTrialTowerProgress(best, mode)) !== null;
  } finally {
    towerSyncRunning[mode] = false;
  }
  if (ok) towerSyncSentFloor[mode] = best;
  const pending = ok ? 0 : best;
  if (state.towerSyncPending[mode] !== pending) {
    state.towerSyncPending[mode] = pending;
    render();
  }
  return ok;
}

async function refreshTrialTowerRanking(): Promise<void> {
  const mode = state.towerMode;
  state.towerRankingLoading = true;
  state.towerRankingError = false;
  state.towerRankingOffline = false;
  render();

  const connected = await connectTrialTower();
  // 前回の通信断で送れなかった自己ベストも、ランキングを開いた時に追いつかせる。
  if (connected) await syncTrialTowerBest(mode, true);
  const [ranking, self] = await Promise.all([
    fetchTrialTowerRanking(50, mode),
    fetchTrialTowerSelf(arenaAuthUserId(), mode),
  ]);
  // 通信中に難易度を切り替えた場合、前のモードの順位を新しいタブへ表示しない。
  if (state.towerMode !== mode) return;
  state.towerRankingEntries = ranking.entries;
  state.towerRankingSelf = self;
  state.towerRankingLoading = false;
  /*
   * **繋がっていないだけの人に「取得できませんでした」と出さない。**
   * `connectTrialTower()` が false を返すのは通信そのものが使えない時なので、
   * そちらは案内、実際に取りに行って失敗した時だけ障害として出す
   */
  state.towerRankingOffline = !connected;
  state.towerRankingError = connected && !ranking.ok;
  render();
}

/**
 * 次の階へ挑む(登坂の開始も継続もここ)。
 *
 * 塔の1階ぶんは、他のコンテンツと同じ「1戦」だが、**戦闘の入り口で
 * 持ち越しを渡す**点だけが違う。持ち越しの計算は `src/game/trialTower.ts` が持ち、
 * ここは画面遷移とスタミナだけを見る。
 */
function startTowerFloor(): void {
  const mode = state.towerMode;
  const blocked = towerBlockReason(state.player, mode);
  if (blocked) {
    state.towerNotice = blocked;
    playSfx("denied", 0.7);
    render();
    return;
  }
  const currentRun = mode === "HARD" ? state.player.trialTowerHardRun : state.player.trialTowerRun;
  const run = currentRun ?? beginTowerRun(state.player, mode);
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
  const run = setup.mode === "HARD" ? state.player.trialTowerHardRun : state.player.trialTowerRun;
  if (!run) return;
  const clearedFloor = run.floor;

  const outcome = applyTowerFloorResult(state.player, run, setup, engine, cleared);
  savePlayerState(state.player);
  // 新記録は待たせない(再試行の間隔を飛ばして、その場で送る)
  if (outcome.lifetimeBestUpdated) void syncTrialTowerBest(setup.mode, true);

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
  const run = state.towerMode === "HARD" ? state.player.trialTowerHardRun : state.player.trialTowerRun;
  if (!run) throw new Error("trialTowerRun is not set");
  const setup = setupTowerBattle(state.player, run);
  if (!setup) throw new Error("試練の塔の編成を組めません");

  const engine = new BattleEngine(setup.playerDefs, setup.enemyDefs, {
    initialPlayerHp: setup.initialPlayerHp,
    initialCooldowns: setup.initialCooldowns,
    trialTowerFloor: setup.floor.floor,
    trialTowerHardMultipliers: setup.hardMultipliers,
  });

  const traitLabel = TOWER_TRAIT_LABEL[setup.floor.trait];
  return renderBattleView({
    engine,
    playerTeam: setup.playerDefs,
    enemyTeam: setup.enemyDefs,
    title: `塔 ${setup.mode === "HARD" ? "HARD " : ""}${setup.floor.floor}階${traitLabel ? ` ${traitLabel}` : ""}`,
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
    getArenaTeam(state.player, "OFFENSE"), opponent, state.player.equipment, state.arenaAttackerSnapshot, state.player.accessories);
  /*
   * **乱数の種もサーバのものを使う。**
   *
   * ここを `Math.random` のままにしていた時は、画面とサーバが
   * 別々の戦いをしていた(同じ戦いを2回やっているつもりで)。
   * 戦闘エンジンは種を渡せば決定的なので、同じ種なら同じ経過になる。
   * 未接続なら種は無い——その時は勝敗も手元の計算なので、食い違いようがない。
   */
  const engine = new BattleEngine(setup.playerDefs, setup.enemyDefs,
    ticket ? { ...ARENA_BATTLE_OPTIONS, rng: arenaNpcRng(ticket.battleSeed | 0) } : { ...ARENA_BATTLE_OPTIONS });

  return renderBattleView({
    engine,
    playerTeam: setup.playerDefs,
    enemyTeam: setup.enemyDefs,
    title: `vs ${entry.name}`,
    // 対人戦は観客のいる闘技場。それ自体がアリーナの空気になっている
    venue: "duel",
    resultLabel: (winner) => (winner === "PLAYER" ? "🏆 結果を見る" : "アリーナに戻る"),
    onFinish: (winner) => { void finishArenaMatch(winner === "PLAYER"); },
    /*
     * **対人戦だけは諦められない。**
     *
     * 勝敗はサーバが同じ種で戦闘を再現して決める。こちらで負けにしても
     * 向こうは勝ちのまま進むので、画面とサーバが別の結末を持つことになる。
     * 対人戦は4対4で必ず決着が付き、長引く戦いにもならない。
     */
    canSurrender: false,
  });
}

function renderCurrentGoldDungeonBattle(): BattleViewHandle {
  const run = state.goldDungeonRun;
  if (!run) throw new Error("goldDungeonRun is not set");

  const setup = setupDungeonBattle(run.partyInstances, run.floor, state.player.equipment, state.player.accessories);
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
  const setup = setupWaveBattle(run.currentPartyInstances, run.carryHp, wave, state.player.equipment, run.difficulty, state.player.accessories);
  const engine = new BattleEngine(setup.playerDefs, setup.enemyDefs, { initialPlayerHp: setup.initialPlayerHp, initialSkyStacks: run.currentPartyInstances.map(m => run.carrySkyStacks?.get(m.id) ?? 0) });
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
        const { survivorInstances, survivorHp, survivorSkyStacks } = extractSurvivors(engine, run.currentPartyInstances);
        run.goldEarned += stageWaveGold(run.stage, run.difficulty);
        run.wavesCleared += 1;
        run.carryHp = survivorHp;
        run.carrySkyStacks = survivorSkyStacks;
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
        `⚡${job.staminaSpent}`
        // 使った時だけ出す。0個を常に並べると、上の行の幅を無駄に取る
        + (job.staminaPotionsUsed ? `(🧪${job.staminaPotionsUsed})` : "")
        + ` / EXP ${job.result.totalExp.toLocaleString("ja-JP")}`
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
/**
 * ブラウザに「いくら使っていて、いくらまで使えるか」を聞く。
 *
 * **非同期なので、失敗した瞬間には間に合わない。**取れたら書き足して描き直す。
 * 1回で足りる——失敗が続く間、同じ数字を何度も聞く必要はない。
 * 対応していないブラウザや拒否された時は、数字なしの文面のままでよい。
 */
let storageEstimateRequested = false;

function requestStorageEstimate(): void {
  if (storageEstimateRequested) return;
  storageEstimateRequested = true;
  const storage = navigator.storage;
  if (!storage?.estimate) return;
  storage.estimate().then((estimate) => {
    // usage は localStorage を数えないことがある。**欠けていても quota だけで足りる**
    if (estimate.quota === undefined) return;
    recordStorageEstimate(estimate.usage ?? 0, estimate.quota);
    render();
  }).catch(() => {
    // 取れなくても案内は出せる。ここで失敗を重ねない
  });
}

/** 1MBに満たない時にMB表記だと「0.0MB」になって、かえって何も伝わらない */
function formatBytes(bytes: number): string {
  if (bytes <= 0) return "不明";
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

/**
 * これ未満のセーブで保存に失敗したなら、**原因はアプリのデータ量ではない。**
 *
 * ブラウザが1つのサイトへ許す量はふつう5MB前後ある。実際に報告された端末では
 * **882KB**で失敗していた。iOS Safari は端末の空き容量が少ないと
 * 割り当てそのものを絞るので、こうなる。
 *
 * ここで見分けないと「装備やモンスターを整理してください」と案内してしまい、
 * **整理しても直らない**人を延々と走らせることになる。
 */
const SAVE_SIZE_LIKELY_FINE = 2 * 1024 * 1024;

/**
 * これだけ許されているなら、**入らない理由は容量ではない。**
 * 空き容量が理由で絞られている端末は、ここまでの数字を出さない。
 */
const ROOMY_QUOTA = 50 * 1024 * 1024;

/**
 * 「一杯」の文面。
 *
 * **一杯には3種類ある。**どれも同じ `QuotaExceededError` になるので、
 * 例外の形では見分けられない。数字で切り分ける。
 *
 *   1. 端末の空き容量が無くて、割り当てそのものが小さい
 *      → 実際の報告では**セーブ882KB**で失敗していた。普通は5MB前後使えるので、
 *        これは「アプリのデータが多い」ではない。整理を案内しても直らない
 *   2. アプリのデータが本当に多い
 *   3. 容量とは無関係(プライベートモード、サイトデータの拒否)
 *      → 割り当てに余裕があるのに失敗しているならこれ
 *
 * 見分けずに「装備やモンスターを整理してください」と書くと、
 * 1と3の人を**直らない作業へ延々と走らせる**ことになる。
 *
 * ## 使用量は出さない
 *
 * `navigator.storage.estimate()` の `usage` は**localStorage を数えないことがある。**
 * 実機(Chromium)で quota は 958.6MB と返るのに usage は 0 だった。
 * 「使用 不明」と出しても読む人には何も伝わらないし、
 * **その 0 を割り算に使えば判定ごと嘘になる。**使うのは quota と実際のセーブだけ。
 */
function quotaDetail(failure: SaveFailure): string {
  const write = "直す前に、下の「⬇ 控えを書き出す」で控えを取ってください。";
  const mine = failure.bytes > 0 ? `いまのセーブは ${formatBytes(failure.bytes)}。` : "";
  const quota = failure.storage && failure.storage.quota > 0 ? failure.storage.quota : 0;

  // 許されている量に余裕があるのに書けない = 容量の話ではない
  if (quota >= ROOMY_QUOTA) {
    return `${mine}この端末はこのサイトへ ${formatBytes(quota)} まで許しているので、`
      + `容量が足りないわけではありません。プライベートブラウズや、`
      + `サイトのデータを保存しない設定になっていないか確かめてください。${write}`;
  }
  if (quota > 0) {
    return `${mine}この端末がこのサイトへ許す量が ${formatBytes(quota)} まで狭まっています。`
      + `端末の空き容量が少ないと、この「許す量」自体が小さくなります。`
      + `写真やアプリを整理して空きを作ってください。${write}`;
  }

  // 量が聞けなかった時は、セーブの大きさだけで見分ける
  if (failure.bytes > 0 && failure.bytes < SAVE_SIZE_LIKELY_FINE) {
    return `${mine}この大きさで入らないのは、端末の空き容量が少ないか、`
      + `サイトのデータを保存しない設定になっているためです。`
      + `装備やモンスターを整理しても直りません。${write}`;
  }
  return `${mine}端末の空き容量が少ないか、装備・モンスターが増えすぎています。`
    + `端末の空きを作るか、使わない装備・モンスターを整理してください。${write}`;
}

/**
 * セーブに失敗している時の警告。
 *
 * **黙って消えるのがいちばん悪い。**保存領域が一杯だと
 * `localStorage.setItem` が例外を投げる。以前はそれが呼び出し元まで抜けて
 * 操作の途中で全部飛んでいた(召喚が演出も出さずに止まり、書だけ減って見えて、
 * 再起動すると戻る)。例外は `savePlayerState` で止めたので、
 * あとは**起きたことを伝える**役目がここ。
 *
 * 戦闘中は出さない。手が離せない場面で読ませても操作できない。
 */
function buildSaveFailureBar(): HTMLElement | null {
  const failure = lastSaveFailure();
  if (!failure) return null;
  if (BATTLE_SCREENS.has(state.screen)) return null;
  if (!failure.storage) requestStorageEstimate();
  const detail = failure.quotaExceeded ? quotaDetail(failure)
    : "この端末に書き込めませんでした。プライベートモードや、サイトのデータを保存しない設定になっていないか確かめてください。モンスターや装備が多い場合は、使わないものを整理すると改善することがあります。";
  return el("section", {
    className: "tutorial-bar tutorial-bar--danger",
    "data-save-failure-bar": "",
    role: "alert",
    "aria-label": "セーブに失敗しています",
  }, [
    el("div", { className: "tutorial-bar__badge" }, [el("strong", {}, ["⚠"])]),
    el("div", { className: "tutorial-bar__text" }, [
      el("div", { className: "tutorial-bar__title" }, ["データを保存できていません"]),
      el("div", { className: "tutorial-bar__cond" }, [
        el("span", {}, [`${detail} モンスターや装備が増えすぎている場合は、使わないものを整理してください。このまま閉じると、いま遊んだぶんは戻ります。`]),
      ]),
      // 控えを取る的をその場に置く。ホームまで戻る道中で失われるのが困る
      el("button", {
        type: "button",
        className: "btn btn--primary tutorial-bar__save-act",
        onclick: handleExportSave,
      }, ["⬇ 控えを書き出す"]),
    ]),
  ]);
}

function mountTutorialBar(content: HTMLElement): void {
  /*
   * 帯は**見出し帯の下**へ入れる。見出しより上に入れていた頃は、
   * 画面によって「案内 → 見出し」と「見出し → 案内」が入れ替わっていた
   * (詳細と管理画面だけ見出しが案内の下にあった)。
   */
  const head = content.querySelector<HTMLElement>(":scope > [data-screen-head]");
  const putTop = (node: HTMLElement) => {
    if (head) head.after(node); else content.prepend(node);
  };
  const bar = buildTutorialBar();
  if (bar) putTop(bar);
  // 保存の警告は案内より上。**遊び方より先に知らせる**
  const saveBar = buildSaveFailureBar();
  if (saveBar) putTop(saveBar);
  const farm = buildFarmBar();
  if (!farm) return;
  const world = content.querySelector(".home-world");
  if (world) world.before(farm); else putTop(farm);
}

/**
 * 見出し帯の左端へ「戻る」を入れる。**戻るはこの1か所からしか出ない。**
 *
 * 画面が自分で行き先を渡した帯(階の詳細 → 階の一覧など)には足さない。
 * 帯を持たない画面(ホーム・戦闘・結果)には出さない。
 * 前は `position: fixed` の浮いた「戻る」をここで足していて、
 * 自前の戻り口を持つ画面と2つ並び、巻くと案内帯の上に重なっていた。
 */
function mountScreenBack(content: HTMLElement): void {
  if (!canGoBack()) return;
  let head = content.querySelector<HTMLElement>(":scope > [data-screen-head]");
  /*
   * 帯を持たない画面(戦闘の結果・周回の結果)にも、前は浮いた「戻る」が出ていた。
   * 帯へ移したせいで**そこだけ出口が消えない**よう、題だけの帯を足して同じ所に置く。
   */
  if (!head && content.classList.contains("screen")) {
    head = screenHeader(FALLBACK_HEAD_TITLES[state.screen] ?? "");
    content.prepend(head);
  }
  if (head) attachScreenBack(head, goBack);
}

/**
 * 自前の見出しを持たない画面に足す帯の題。
 * 結果画面は中央に大きな「勝利 / 周回結果」を持っているので、帯の題は空にする(2つ並べない)
 */
const FALLBACK_HEAD_TITLES: Partial<Record<ScreenName, string>> = {};

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

/**
 * 画面を描く。**ここが投げても、画面を空のままにしない。**
 *
 * `renderScreen()` は `root.innerHTML = ""` で一度まっさらにしてから
 * 中身を組み立てる。その途中で例外が出ると、消したまま何も入らない
 * ——**真っ黒で、押せるものが1つも無い画面**になる。
 * 実際にそうなった: 結果画面から「戻る」を押すと、戻り先が終わったばかりの
 * 戦闘画面で、進行中の戦い(`stageRun`)がもう無いために投げていた。
 *
 * 投げる原因は塞いだが、塞いだのは「その1つ」でしかない。画面の組み立ては
 * 数十か所に散らばっていて、どこか1つが投げれば同じ詰み方をする。
 * だから**出口側でも受け止める。**受け止めたらホームへ落とす。
 */
function render(): void {
  try {
    renderScreen();
    renderFailed = false;
    return;
  } catch (error) {
    console.error("画面を描けませんでした", error);
    if (renderFailed) {
      // ホームでも投げた。これ以上やり直しても同じなので、
      // せめて「読み込み直す」だけは押せる形にして止まる。
      renderFailed = false;
      root.innerHTML = "";
      // ここだけは見た目をCSSに頼らない。CSSが配られていない事故でも
      // 「読み込み直す」が読めて押せる必要がある
      root.append(el("div", {
        className: "render-fallback",
        style: "display:grid;gap:14px;justify-items:center;padding:48px 20px;color:#e8e6f0;font-size:15px;text-align:center",
      }, [
        el("p", { style: "margin:0" }, ["画面を表示できませんでした。"]),
        el("button", {
          type: "button",
          className: "btn btn--primary",
          style: "padding:12px 28px;border-radius:10px;border:1px solid #9c7b40;background:#2a2140;color:#f4e9c8;font-size:15px",
          onclick: () => window.location.reload(),
        }, ["読み込み直す"]),
      ]));
      return;
    }
    renderFailed = true;
  }
  // 戻り先の履歴も捨てる。壊れた場所へ「戻る」で入り直せてしまう
  routeHistory.length = 0;
  lastRouteState = null;
  navigate("HOME");
}

/** 直前の描画が例外で終わったか。ホームへ落とす処理が輪にならないよう見張る */
let renderFailed = false;

function renderScreen(): void {
  if (lastRouteKey !== null) scrollPositions.set(lastRouteKey, window.scrollY);
  /*
   * 通ってきた場所を積むのは**描き始める前**。
   * 描き終えてから積むと、移った当回はまだ履歴が空で、
   * その1回だけ「戻る」が出ない画面になる(実際にそうなった)。
   */
  if (lastRouteState !== null && !restoringRoute && routeKey() !== lastRouteKey) {
    /*
     * **戦闘は「戻る先」にしない。**
     *
     * 戦っている最中に「戻る」を出さない決まりは `canGoBack()` に入れてあったが、
     * *積む*側が同じ扱いをしていなかった。そのせいで結果画面の「戻る」が
     * 終わったばかりの戦闘を指し、進行中の戦い(`stageRun` など)がもう無い所へ
     * 入って例外になり、画面が真っ黒のまま操作できなくなっていた。
     * 決着した戦いは戻れる場所ではないので、履歴に残さない。
     */
    if (!BATTLE_SCREENS.has(lastRouteState.screen)) routeHistory.push(lastRouteState);
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

  /*
   * 戦闘画面は**進行中の戦いが控えにある時だけ**描ける。
   * 無い所へ入ると、戦闘の組み立てが例外を投げて画面が空のまま残る。
   * 履歴からも保存された画面からもここへ来られるので、入口で1回だけ見る。
   */
  if (BATTLE_SCREENS.has(state.screen) && !hasBattleRun(state.screen)) {
    navigate("HOME");
    return;
  }

  let content: HTMLElement;
  let showNav = true;

  switch (state.screen) {
    case "HOME":
      // 個別配布もホームに入った時点で取得し、赤バッジへ反映する。
      if (!state.personalGiftsLoaded) {
        state.personalGiftsLoaded = true;
        void fetchPersonalGifts().then((gifts) => { state.personalGifts = gifts; if (state.screen === "HOME") render(); });
      }
      content = renderHome({
        player: state.player,
        loginBonusResult: state.loginBonusResult,
        compensationClaims: state.compensationClaims,
        giftCount: unclaimedGiftCount([...GIFT_DEFINITIONS, ...state.personalGifts], state.player),
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
        onGoRankings: () => { openRankings(state.rankingTab); },
        onGoStages: () => navigate("STAGES"),
        onGoParty: () => navigate("PARTY"),
        onViewPartyMonster: (id) => { openMonsterDetail(id, { kind: "HOME" }); },
        onGoEquipDungeon: () => navigate("EQUIP_DUNGEON"),
        onGoLevelDungeon: () => navigate("LEVEL_DUNGEON"),
        onGoGoldDungeon: () => navigate("GOLD_DUNGEON"),
        onGoAwakeningDepth: () => navigate("AWAKENING_DEPTH"),
        onGoRuins: () => navigate("RUINS"),
        onGoShop: () => navigate("SHOP"),
        onGoArena: () => navigate("ARENA"),
        onGoTrialTower: () => navigate("TRIAL_TOWER"),
        onGoHowToPlay: () => navigate("HOW_TO_PLAY"),
        onGoGiftBox: () => {
          // 開き直すたびに前回の結果が残らないよう、入る時に消す
          state.giftTab = "OPEN";
          state.giftResult = null;
          navigate("GIFT_BOX");
        },
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
        onUseStaminaPotion: () => {
          if (!tryUseStaminaPotion(state.player).ok) { playSfx("denied", 0.7); return; }
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

    case "EQUIPMENT": {
      /*
       * 「装備 / アクセサリー」の切り替え(依頼主の指定)。
       * 着ける装備を選んでいる最中と、1つの装備の詳細を見ている時は装備側のまま。
       */
      const gearTabs = renderGearTabs(state.equipmentTab, (tab) => {
        state.equipmentTab = tab;
        state.selectedAccessoryId = null;
        state.accessoryNotice = null;
        // 見えていない側の選択で売ってしまわないよう、切り替えたら選び直しにする
        state.accessorySelecting = false;
        state.accessorySelectedIds = [];
        render();
      }, { gear: state.player.equipment.length, accessory: (state.player.accessories ?? []).length });
      const browsingGear = !state.equipmentPickerContext && !state.equipmentDetailId;
      content = browsingGear && state.equipmentTab === "ACCESSORY"
        ? renderAccessories({ ...accessoriesScreenProps(null), tabs: gearTabs, onGoRuins: () => navigate("RUINS") })
        : renderEquipmentScreen(gearTabs);
      break;
    }

    case "SHOP":
      content = renderShop({
        player: state.player,
        shop: getShop(state.player, state.devShopNow ?? undefined),
        notice: state.shopNotice,
        onBuy: (slotIndex) => {
          const result = buyShopEntry(state.player, slotIndex, state.devShopNow ?? undefined);
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
        // 長押しは編成を変えずに詳細だけを見たい時の操作。所持一覧の詳細へ送る。
        // **閉じたら編成へ帰す。**編成の途中で1体調べただけなので、
        // 選びかけの画面から所持一覧へ放り出さない
        onViewDetail: (instanceId) => {
          openMonsterDetail(instanceId, { kind: "PARTY", mode: state.partyEditMode });
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
        onChangeStaminaPotionBudget: setStaminaPotionFarmBudget,
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
        onChangeStaminaPotionBudget: setStaminaPotionFarmBudget,
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
        onChangeStaminaPotionBudget: setStaminaPotionFarmBudget,
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
        onChangeStaminaPotionBudget: setStaminaPotionFarmBudget,
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

    case "AWAKENING_DEPTH":
      content = renderAwakeningDepths({
        player: state.player,
        selectedFloor: state.selectedAwakeningDepthFloor,
        onSelectFloor: (floor) => {
          state.selectedAwakeningDepthFloor = floor;
          render();
        },
        onStartFloor: startAwakeningDepthFloor,
        onGoParty: () => openPartyFrom({
          screen: "AWAKENING_DEPTH",
          label: `目覚の深域${state.selectedAwakeningDepthFloor ?? ""}F`,
          selectedAwakeningDepthFloor: state.selectedAwakeningDepthFloor ?? undefined,
        }, "NORMAL"),
        onExchange: (id) => {
          const result = exchangeMaterial(state.player, id);
          if (!result.ok) playSfx("denied", 0.7);
          else savePlayerState(state.player);
          render();
        },
        autoFarmCount: state.autoFarmCount,
        onChangeStaminaPotionBudget: setStaminaPotionFarmBudget,
        onChangeAutoFarmCount: (count) => {
          state.autoFarmCount = count;
          render();
        },
        onAutoFarm: handleAutoFarmAwakeningDepth,
      });
      break;

    case "AWAKENING_DEPTH_BATTLE": {
      showNav = false;
      const handle = renderCurrentAwakeningDepthBattle();
      disposeCurrentView = handle.dispose;
      content = handle.element;
      break;
    }

    case "RUINS":
      content = renderRuins({
        player: state.player,
        kind: state.ruinKind,
        selectedFloor: state.selectedRuinFloor,
        onSelectKind: (kind) => {
          state.ruinKind = kind;
          state.selectedRuinFloor = null;
          render();
        },
        onSelectFloor: (floor) => {
          state.selectedRuinFloor = floor;
          render();
        },
        onStartFloor: startRuinFloor,
        onGoParty: () => openPartyFrom({
          screen: "RUINS",
          label: `${state.ruinKind === "POWER" ? "力" : "守護"}の遺跡${state.selectedRuinFloor ?? ""}F`,
          ruinKind: state.ruinKind,
          selectedRuinFloor: state.selectedRuinFloor ?? undefined,
        }, "DUNGEON"),
        onGoAccessories: () => openAccessories(null),
        onGoCraft: openCraft,
        autoFarmCount: state.autoFarmCount,
        onChangeStaminaPotionBudget: setStaminaPotionFarmBudget,
        onChangeAutoFarmCount: (count) => {
          state.autoFarmCount = count;
          render();
        },
        onAutoFarm: handleAutoFarmRuin,
      });
      break;

    case "RUINS_BATTLE": {
      showNav = false;
      const handle = renderCurrentRuinBattle();
      disposeCurrentView = handle.dispose;
      content = handle.element;
      break;
    }

    case "ACCESSORIES":
      content = renderAccessories(accessoriesScreenProps());
      break;

    case "ANCIENT_CRAFT":
      content = renderAncientCraft({
        player: state.player,
        lastAccessory: state.craftLastAccessory,
        lastEquipment: state.craftLastEquipment,
        notice: state.craftNotice,
        onCraftAccessory: (family) => {
          const result = craftAccessory(state.player, family);
          if (!result.ok) { state.craftNotice = result.reason; playSfx("denied", 0.7); render(); return; }
          savePlayerState(state.player);
          state.craftLastAccessory = result.item;
          state.craftLastEquipment = null;
          state.craftNotice = "アクセサリーを作りました";
          render();
        },
        onCraftEquipment: (set) => {
          const result = craftEquipment(state.player, set);
          if (!result.ok) { state.craftNotice = result.reason; playSfx("denied", 0.7); render(); return; }
          savePlayerState(state.player);
          state.craftLastEquipment = result.item;
          state.craftLastAccessory = null;
          state.craftNotice = "装備を作りました";
          render();
        },
        onGoAccessories: () => openAccessories(null),
      });
      break;

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
          /*
           * **防衛履歴は開くたびに取り直す。**
           *
           * 攻められるのはこちらが見ていない時なので、アプリを開いたままだと
           * 起動時に1度引いたきり、その後どれだけ攻められても画面は変わらない。
           * レートの方は繋いだ時にサーバの値へ合わせるので、
           * **レートだけ下がって、理由が履歴に出ない**という食い違いになる。
           */
          if (view === "HISTORY") state.arenaHistoryLoaded = false;
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
          void (async () => {
            applyArenaTicketRegen(state.player);
            if (state.player.arenaTickets >= ARENA_TICKET_MAX) {
              state.arenaNotice = "挑戦券は満タンです"; render(); return;
            }
            if (state.player.crystal < ARENA_TICKET_REFILL_COST) {
              state.arenaNotice = "ダイヤが足りません"; render(); return;
            }
            if (arenaSyncAvailable()) {
              if (!(await connectArena())) {
                state.arenaNotice = "通信できないためダイヤ回復を中止しました（ダイヤは消費していません）"; render(); return;
              }
              const remote = await refillArenaTicketsRemote();
              if (!remote.ok) {
                state.arenaNotice = "挑戦券を回復できませんでした（ダイヤは消費していません）"; render(); return;
              }
              // サーバ券の回復成功を確認してから初めてダイヤを消費する。
              state.player.crystal -= ARENA_TICKET_REFILL_COST;
              state.player.arenaTickets = remote.tickets ?? ARENA_TICKET_MAX;
              state.player.lastArenaTicketUpdateAt = Date.now();
              savePlayerState(state.player);
              state.arenaNotice = "挑戦券を回復しました";
              render();
              return;
            }
            const result = tryRefillArenaTickets(state.player);
            state.arenaNotice = result.ok ? "挑戦券を回復しました" : (result.reason ?? "回復できませんでした");
            if (result.ok) savePlayerState(state.player);
            render();
          })();
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
          state.player.arenaDefenseSnapshot = captureArenaDefense(members, state.player.equipment, Date.now(), state.player.accessories ?? []);
          // **新しい姿はまだ届いていない。**古い「届いた」を残すと嘘になる
          delete state.player.arenaDefenseSyncedAt;
          savePlayerState(state.player);
          state.arenaNotice = "防衛編成をサーバへ登録しています…";
          render();

          /*
           * **結果を見せる。**
           *
           * 以前は `void` で投げっぱなしにして、その場で
           * 「防衛編成を登録しました」と出していた。サーバに上がっていなくても
           * 同じ文が出るので、**本人は登録できたつもりのまま相手として
           * 誰にも並ばない**(依頼主の指摘)。しかも理由が無いので手の打ちようがない。
           *
           * 手元の控えは既に保存してあるので、失敗しても進行は止まらない。
           * 伝えるのは「いま相手として並んでいるかどうか」と、その理由。
           */
          void (async () => {
            const snapshot = state.player.arenaDefenseSnapshot;
            if (!snapshot) return;
            await connectArena();
            const result = await pushArenaDefense(snapshot);
            // 待っている間に組み直していたら、古い結果は捨てる
            if (state.player.arenaDefenseSnapshot !== snapshot) return;

            if (result.ok) {
              state.player.arenaDefenseSyncedAt = Date.now();
              savePlayerState(state.player);
              state.arenaNotice = `防衛編成を登録しました（${members.length}体）`;
              playSfx("stageClear");
            } else if (result.reason) {
              // 断られた。**編成を直さないと、繋がっていても永久に通らない**
              state.arenaNotice = `サーバが防衛編成を受け付けませんでした。いまは相手として並びません。${
                arenaRefusalText(result.reason, (dexId) => findMonsterById(dexId)?.name ?? null)
              }`;
              playSfx("denied", 0.7);
            } else {
              // 届かなかった。**繋がれば同じ編成のまま通る**
              state.arenaNotice = "サーバへ届きませんでした。編成は手元に残っていますが、"
                + "いまは相手として並びません。通信できる時にもう一度登録してください";
              playSfx("denied", 0.7);
            }
            render();
          })();
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
           * ただし挑めなかった時(編成未設定・挑戦券切れ・サーバに断られた)は戻す
           * ——挑んでいないのに1回きりの権利が消えるのは、防ぎたい不正とは別の話。
           */
          if (!markArenaRevenged(state.player, record.id)) return;
          const ticketsBefore = state.player.arenaTickets;
          savePlayerState(state.player);
          /*
           * **`state.screen` を見て判定しない。**
           * 繋がっている時の `startArenaMatch` は、サーバへ1戦を発行してもらってから
           * 画面を切り替える。呼んだ直後はまだ切り替わっていないので、
           * 画面で見ると**毎回「挑めなかった」**になり、印も券も戻っていた。
           * 挑めたかどうかは戻り値で、断られたかどうかは `onRefused` で受け取る。
           */
          const rollback = () => {
            record.revenged = false;
            state.player.arenaTickets = ticketsBefore;
            savePlayerState(state.player);
          };
          if (!startArenaMatch(target, rollback)) {
            rollback();
            render();
          }
        },
        onReloadRanking: () => { void refreshArenaRanking(); },
        // 攻撃編成・防衛登録から調べた1体。閉じたらその編成画面へ帰す
        onViewMonster: (instanceId) => {
          openMonsterDetail(instanceId, { kind: "ARENA", view: state.arenaView });
        },
      });
      break;
    }

    case "TRIAL_TOWER": {
      if (ensureTowerMonthlyState(state.player)) savePlayerState(state.player);
      /*
       * **塔の画面を開くたびに、歴代最高を送り直す。**
       *
       * これまで送るきっかけは「階を登った瞬間」と「ランキングを開いた時」の
       * 2つだけだった。前者は失敗しても黙って終わり、後者は**ランキングを
       * 開かない人には一生訪れない。**塔で遊んでいるのに記録が届かない。
       *
       * ここなら、塔で遊ぶ人は必ず通る。同じ階の再送はサーバ側が弾く
       * (`trial_tower_submit_progress` は低い階では更新しない)ので、
       * 何度送っても害は無い。
       */
      const mode = state.towerMode;
      const hardUnlocked = state.player.trialTowerLifetimeBestFloor >= TOWER_FLOOR_COUNT;
      if (mode === "HARD" && !hardUnlocked) state.towerMode = "NORMAL";
      const activeMode = state.towerMode;
      void syncTrialTowerBest(activeMode);
      const blockedReason = towerBlockReason(state.player, activeMode);
      const bestFloor = activeMode === "HARD" ? state.player.trialTowerHardBestFloor : state.player.trialTowerBestFloor;
      const claimedFloors = activeMode === "HARD" ? state.player.trialTowerHardClaimedFloors : state.player.trialTowerClaimedFloors;
      content = renderTrialTower({
        mode: activeMode,
        hardUnlocked,
        bestFloor,
        nextFloor: nextTowerFloor(state.player, activeMode),
        run: describeTowerRun(state.player, activeMode),
        party: getTowerParty(state.player),
        player: state.player,
        claimedFloors,
        /*
         * 挑めない理由(`blockedReason`)はボタンの脇に必ず出る。
         * 案内がそれと同じことを言っている時は**上の帯に出さない**。
         * スタミナ切れで「上の帯」と「ボタンの赤字」に同じ文が2つ並んでいた
         */
        notice: state.towerNotice === blockedReason ? null : state.towerNotice,
        syncPendingFloor: state.towerSyncPending[activeMode],
        outcome: state.towerOutcome,
        blockedReason,
        panel: state.towerPanel,
        enemyInfoFloor: state.towerEnemyInfoFloor,
        rankingEntries: state.towerRankingEntries,
        rankingSelf: state.towerRankingSelf,
        rankingLoading: state.towerRankingLoading,
        rankingError: state.towerRankingError,
        rankingOffline: state.towerRankingOffline,
        onOpenEnemyInfo: (floor) => {
          state.towerEnemyInfoFloor = floor;
          state.towerPanel = "ENEMY_INFO";
          render();
        },
        onOpenRewards: () => {
          state.towerPanel = "REWARDS";
          render();
        },
        onOpenRanking: () => {
          state.towerPanel = "RANKING";
          void refreshTrialTowerRanking();
        },
        onReloadRanking: () => { void refreshTrialTowerRanking(); },
        onClosePanel: () => {
          state.towerPanel = "NONE";
          render();
        },
        onEditParty: () => {
          state.towerOutcome = null;
          openPartyFrom({ screen: "TRIAL_TOWER", label: `試練の塔${activeMode} ${nextTowerFloor(state.player, activeMode)}F` }, "TOWER");
        },
        onChallenge: () => {
          state.towerOutcome = null;
          startTowerFloor();
        },
        onAbandon: () => {
          abandonTowerRun(state.player, activeMode);
          savePlayerState(state.player);
          state.towerOutcome = null;
          state.towerNotice = "登坂をやめました。次は節から登り直しになります。";
          render();
        },
        onDismissOutcome: () => {
          state.towerOutcome = null;
          render();
        },
        onChangeMode: (nextMode) => {
          if (nextMode === "HARD" && !hardUnlocked) {
            state.towerNotice = "HARDはNORMAL 100階クリア後に解放されます。";
            playSfx("denied", 0.7);
            render();
            return;
          }
          state.towerMode = nextMode;
          state.towerNotice = null;
          state.towerOutcome = null;
          state.towerPanel = "NONE";
          state.towerRankingEntries = [];
          state.towerRankingSelf = null;
          state.towerRankingLoading = false;
          state.towerRankingError = false;
          state.towerRankingOffline = false;
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

    /*
     * ホームから開く順位の一覧。**アリーナと試練の塔を1か所で見る。**
     * どちらの順位も前からあったが、それぞれの画面の奥にしか入口が無く、
     * ホームの「ランキング」は押せないまま置いてあった(依頼主の指摘)。
     */
    case "RANKINGS":
      // 開いた時に繋ぎに行く。アリーナ側は「繋がっているか」で表の出し方が変わる
      if (arenaConnectionStatus === "IDLE") void connectArena().then(() => render());
      content = renderRankings({
        tab: state.rankingTab,
        onSelectTab: (tab) => { openRankings(tab); },
        arena: {
          online: arenaConnectionStatus === "ONLINE",
          loading: state.arenaRankingLoading,
          top: state.arenaRankingTop,
          around: state.arenaRankingAround,
          myUserId: arenaSelfId(),
          myRank: state.arenaMyRank,
        },
        tower: {
          loading: state.towerRankingLoading,
          offline: state.towerRankingOffline,
          error: state.towerRankingError,
          entries: state.towerRankingEntries,
          self: state.towerRankingSelf,
          // 手元の記録。**繋がっていなくてもこれは出せる**
          myBestFloor: state.player.trialTowerLifetimeBestFloor,
        },
        onReload: () => { openRankings(state.rankingTab); },
      });
      break;

    case "GIFT_BOX": {
      if (!state.personalGiftsLoaded) {
        state.personalGiftsLoaded = true;
        void fetchPersonalGifts().then((gifts) => { state.personalGifts = gifts; if (state.screen === "GIFT_BOX") render(); });
      }
      const allGifts = [...GIFT_DEFINITIONS, ...state.personalGifts];
      content = renderGiftBox({
        gifts: allGifts,
        player: state.player,
        tab: state.giftTab,
        lastResult: state.giftResult,
        onChangeTab: (tab) => { state.giftTab = tab; state.giftResult = null; render(); },
        onClaim: (giftId) => {
          /*
           * **保存できて初めて受け取ったことにする。**
           * `claimGift` に保存を渡しておくと、失敗した時に所持品も受取の印も
           * まとめて元へ戻る。片方だけ残ることがない。
           */
          state.giftResult = claimGift(allGifts, state.player, giftId, { save: savePlayerState });
          if (state.giftResult.ok && giftId.startsWith("personal:")) {
            void markPersonalGiftClaimed(giftId).then((ok) => {
              if (ok) state.personalGifts = state.personalGifts.filter((g) => g.giftId !== giftId);
            });
          }
          render();
        },
        onClaimAll: () => {
          state.giftResult = claimAllGifts(allGifts, state.player, { save: savePlayerState });
          for (const entry of state.giftResult.claimed) {
            if (entry.gift.giftId.startsWith("personal:")) void markPersonalGiftClaimed(entry.gift.giftId);
          }
          render();
        },
      });
      break;
    }

    case "ARENA_BATTLE": {
      showNav = false;
      const handle = renderCurrentArenaBattle();
      disposeCurrentView = handle.dispose;
      content = handle.element;
      break;
    }

    case "AUTO_EQUIP": {
      const target = state.player.monsters.find((m) => m.id === state.autoEquipMonsterId);
      // navigate は中で描き直す。**break ではなく return**——
      // break で抜けると content を持たないまま下へ落ち、二重に描いてしまう
      if (!target) { navigate("MONSTERS"); return; }
      content = renderAutoEquip({
        player: state.player,
        monster: target,
        settings: state.autoEquipSettings,
        plan: state.autoEquipPlan,
        error: state.autoEquipError,
        notice: state.autoEquipNotice,
        detailOpen: state.autoEquipDetailOpen,
        renamingIndex: state.autoEquipRenamingIndex,
        onBack: () => {
          // 詳細へ戻す。おまかせは「その子を見ている最中」の操作
          state.screen = "MONSTERS";
          state.monsterDetailId = target.id;
          state.autoEquipPlan = null;
          state.autoEquipError = null;
          state.autoEquipNotice = null;
          render();
        },
        onChangeSettings: (settings) => {
          state.autoEquipSettings = settings;
          // 条件を変えたら、前の結果は古い。**出したままにしない**
          state.autoEquipPlan = null;
          state.autoEquipError = null;
          render();
        },
        onToggleDetail: () => { state.autoEquipDetailOpen = !state.autoEquipDetailOpen; render(); },
        onSearch: () => handleAutoEquipSearch(target.id, state.autoEquipSettings),
        onApply: handleAutoEquipApply,
        onDiscardPlan: () => {
          state.autoEquipPlan = null;
          state.autoEquipNotice = "変更をやめました。装備はそのままです";
          render();
        },
        onSavePreset: (index) => handleSavePreset(target.id, index),
        onApplyPreset: (index) => handleApplyPreset(target.id, index),
        onReoptimizePreset: (index) => handleReoptimizePreset(target.id, index),
        onStartRename: (index) => { state.autoEquipRenamingIndex = index; render(); },
        onRenamePreset: (index, name) => handleRenamePreset(target.id, index, name),
      });
      break;
    }

    case "MONSTER_EXCHANGE":
      content = renderMonsterExchange({
        player: state.player,
        notice: state.monsterExchangeNotice,
        selectedIds: state.monsterExchangeIds,
        filter: state.monsterExchangeFilter,
        filterOpen: state.monsterExchangeFilterOpen,
        sortKey: state.monsterExchangeSortKey,
        dense: state.monsterListDense,
        onBack: () => navigate("MONSTERS"),
        onToggleSelect: (monsterId) => {
          const index = state.monsterExchangeIds.indexOf(monsterId);
          if (index >= 0) state.monsterExchangeIds.splice(index, 1);
          else state.monsterExchangeIds.push(monsterId);
          render();
        },
        onSelectAllShown: (monsterIds) => {
          // 既に選んだものは残す。絞り込みを変えながら足していけるようにする
          const already = new Set(state.monsterExchangeIds);
          for (const id of monsterIds) if (!already.has(id)) state.monsterExchangeIds.push(id);
          render();
        },
        onClearSelection: () => {
          state.monsterExchangeIds = [];
          render();
        },
        onSend: handleSendMonstersForPoints,
        onExchange: handleExchangeMonsterPoints,
        onChangeFilter: (filter) => {
          state.monsterExchangeFilter = filter;
          render();
        },
        onToggleFilterOpen: () => {
          state.monsterExchangeFilterOpen = !state.monsterExchangeFilterOpen;
          render();
        },
        onChangeSort: (key) => {
          state.monsterExchangeSortKey = key;
          render();
        },
      });
      break;

    case "MONSTER_STORAGE":
      content = renderMonsterStorage({
        player: state.player,
        notice: state.monsterStorageNotice,
        onBack: () => navigate("MONSTERS"),
        onDeposit: (dexId, star, max) => {
          const count = askMonsterStorageQuantity("預ける", max);
          if (count === null) return;
          const beforeMonsters = structuredClone(state.player.monsters);
          const beforeStorage = structuredClone(state.player.monsterStorage);
          const moved = depositMonsters(state.player, dexId, star, count);
          if (moved === 0 || !savePlayerState(state.player)) {
            state.player.monsters = beforeMonsters;
            state.player.monsterStorage = beforeStorage;
            playSfx("denied", 0.7);
          } else {
            state.monsterStorageNotice = `${moved}体を保管所へ預けました。`;
            playSfx("select");
          }
          render();
        },
        onWithdraw: (dexId, star, max) => {
          const count = askMonsterStorageQuantity("取り出す", max);
          if (count === null) return;
          const beforeMonsters = structuredClone(state.player.monsters);
          const beforeStorage = structuredClone(state.player.monsterStorage);
          const moved = withdrawMonsters(state.player, dexId, star, count);
          if (moved === 0 || !savePlayerState(state.player)) {
            state.player.monsters = beforeMonsters;
            state.player.monsterStorage = beforeStorage;
            playSfx("denied", 0.7);
          } else {
            state.monsterStorageNotice = `${moved}体を所持モンスターへ取り出しました。`;
            playSfx("select");
          }
          render();
        },
        onExchangePoints: (dexId, star, max) => {
          const count = askMonsterStorageQuantity("ポイントに変える", max);
          if (count === null) return;
          const gain = count * star;
          if (!window.confirm(`★${star} Lv1 を ${count}体送り、${gain}Pに変えます。\n送ったモンスターは戻せません。よろしいですか？`)) return;
          const beforeStorage = structuredClone(state.player.monsterStorage);
          const beforePoints = state.player.monsterPoints ?? 0;
          const result = exchangeStoredMonstersForPoints(state.player, dexId, star, count);
          if (!result || !savePlayerState(state.player)) {
            state.player.monsterStorage = beforeStorage;
            state.player.monsterPoints = beforePoints;
            playSfx("denied", 0.7);
          } else {
            state.monsterStorageNotice = `${result.sent}体を送って ${result.gained}P を受け取りました（所持 ${result.total}P）`;
            playSfx("stageClear");
          }
          render();
        },
      });
      break;

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
        dense: state.monsterListDense,
        onToggleDense: handleToggleMonsterListDense,
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
        onUseCrimShard: () => handleUseCrimShard(state.monsterTrainingTargetId!),
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
      const createDex = findMonsterById(createTarget.dexId);
      if (!createDex) { navigate("MONSTERS"); return; }
      // 限界能力付与の下書き。別の1体へ移った時だけ保存値から読み直す
      syncLimitDraft(createTarget);
      /*
       * **開くたびに、継承で不適合になった才能を外してptを戻す。**
       * 開かない限り直らない形にすると、クリエイトで技を替えた個体が
       * 効かない才能にptを取られたまま放置される。
       * 同じ画面の中で技を替えられるようになったので、なおさらここで通す。
       */
      const reconciled = reconcileSkillTalents(createTarget, toBattleDefinition(createTarget, createDex).skills);
      if (reconciled.removed.length > 0) savePlayerState(state.player);
      content = renderMonsterCreate({
        target: createTarget,
        monsters: state.player.monsters,
        talent: {
          player: state.player,
          monster: createTarget,
          dex: createDex,
          tab: state.talentTab,
          onChangeTab: (tab) => { state.talentTab = tab; render(); },
          skillSlot: state.talentSkillSlot,
          onChangeSkillSlot: (slot) => { state.talentSkillSlot = slot; render(); },
          onUnlockPoint: () => withTalentTarget((m) => unlockTalentPoint(state.player, m)),
          onTakeBasic: (line) => withTalentTarget((m) => takeBasicTalent(m, line as never)),
          onTakeBattle: (line) => withTalentTarget((m) => takeBattleTalent(m, line as never)),
          onTakeSkillTalent: (slot, id) => withTalentTarget((m) => {
            const skill = toBattleDefinition(m, findMonsterById(m.dexId)!).skills[slot];
            return takeSkillTalent(m, slot, id, skill);
          }),
          onTakeAwakening: (slot, id) => withTalentTarget((m) => {
            const skill = toBattleDefinition(m, findMonsterById(m.dexId)!).skills[slot];
            return takeSkillAwakening(state.player, m, slot, id, skill);
          }),
          onReset: () => withTalentTarget((m) => resetTalents(state.player, m)),
          onClose: () => goBack(),
        },
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
        limitBreak: {
          evolutionCores: state.player.evolutionCores ?? 0,
          draft: state.limitDraft,
          notice: state.limitNotice,
          onUnlock: () => {
            const result = unlockLimitBreak(state.player, createTarget.id);
            if (!result.ok) { state.limitNotice = result.reason; playSfx("denied", 0.7); render(); return; }
            savePlayerState(state.player);
            state.limitDraft = { hp: 0, atk: 0, def: 0, spd: 0 };
            state.limitNotice = "限界能力付与を解放しました";
            render();
          },
          gold: state.player.gold,
          // 動かしている最中は描き直さない(ドラッグが途切れる)。丸めた下書きを返すだけ
          onSet: (stat, value) => {
            state.limitDraft = clampLimitDraft(state.limitDraft, stat, value);
            state.limitNotice = null;
            return state.limitDraft;
          },
          onCommit: () => render(),
          onReset: () => { state.limitDraft = { hp: 0, atk: 0, def: 0, spd: 0 }; state.limitNotice = null; render(); },
          onSave: () => {
            /*
             * **ここで確定する。**能力ポイントと同じく、押した後は有料のリセットでしか変えられない。
             * 取り返しがつかないので、押す前に必ず1度たずねる。
             */
            const cost = LIMIT_POINT_RESET_COST.toLocaleString("ja-JP");
            if (!window.confirm(`限界能力付与をこの配分で確定しますか？\n\n確定すると、変えるには ${cost}G のリセットが必要になります。`)) return;
            const result = setLimitPoints(state.player, createTarget.id, state.limitDraft);
            if (!result.ok) { state.limitNotice = result.reason; playSfx("denied", 0.7); render(); return; }
            savePlayerState(state.player);
            state.limitNotice = "限界能力付与の配分を確定しました";
            playSfx("levelUp");
            render();
          },
          onPaidReset: () => {
            const cost = LIMIT_POINT_RESET_COST.toLocaleString("ja-JP");
            if (!window.confirm(`限界能力付与をリセットしますか？\n配分がすべて0になります\nもう一度、無料で自由に振り直せます\n費用：${cost}ゴールド`)) return;
            const result = resetLimitPoints(state.player, createTarget.id);
            if (!result.ok) { state.limitNotice = result.reason; playSfx("denied", 0.7); render(); return; }
            savePlayerState(state.player);
            state.limitDraft = { hp: 0, atk: 0, def: 0, spd: 0 };
            state.limitNotice = "限界能力付与をリセットしました";
            render();
          },
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
      content = renderStageResult({
        info,
        actions: buildResultActions(false),
        onViewAccessories: info.earnedAccessoryIds?.length ? () => openFarmAccessorySheet(info) : undefined,
      });
      {
        const sheet = renderFarmAccessorySheetFor(info, info.earnedAccessoryIds ?? []);
        if (sheet) content.append(sheet);
      }
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
          /*
           * **開くたびに条件を白紙へ戻す。**
           * 前の周回で「★6だけ」に絞ったまま残っていると、次に開いた人は
           * 今回の装備が1個も出ないシートを見ることになる。
           */
          state.farmEquipmentFilter = { ...EMPTY_EQUIPMENT_FILTER };
          state.farmEquipmentFilterOpen = false;
          render();
        } : undefined,
        onViewAccessories: result.earnedAccessoryIds?.length ? () => openFarmAccessorySheet(result) : undefined,
      });
      {
        const sheet = renderFarmAccessorySheetFor(result, result.earnedAccessoryIds ?? []);
        if (sheet) content.append(sheet);
      }
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
          filter: state.farmEquipmentFilter,
          filterOpen: state.farmEquipmentFilterOpen,
          onChangeFilter: (filter) => { state.farmEquipmentFilter = filter; render(); },
          onToggleFilterOpen: () => { state.farmEquipmentFilterOpen = !state.farmEquipmentFilterOpen; render(); },
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
          /*
           * **画面が渡してきたIDだけを選ぶ。**
           * 以前はここで全件から選び直していたので、絞り込みを足した今は
           * 「表示中をすべて選ぶ」が絞り込みを無視して**見えていないものまで選ぶ。**
           */
          onSelectAll: (ids) => {
            const valid = new Set(sellableEquipmentIds(equipment));
            state.farmEquipmentSelectedIds = ids.filter((id) => valid.has(id));
            render();
          },
          onClearSelection: () => { state.farmEquipmentSelectedIds = []; render(); },
          onClose: () => { state.farmEquipmentOpen = false; state.farmEquipmentDetailId = null; render(); },
        }));
      }
      break;
    }
  }

  mountScreenBack(content);
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
  playBgm(bgmSceneOf(state.screen));

  const newRouteKey = routeKey();
  window.scrollTo(0, scrollPositions.get(newRouteKey) ?? 0);
  lastRouteKey = newRouteKey;
  lastRouteState = routeState();
}

function renderSummonScreen(): HTMLElement {
  return renderSummon({
    player: state.player,
    lastResults: state.summonResults,
    lastMethod: state.lastSummonMethod,
    onSummon: handleSummon,
    onDismissResults: () => {
      state.summonResults = null;
      render();
    },
    onUseSummonScroll: handleUseSummonScroll,
    onUseSpecialSummonScroll: handleUseSpecialSummonScroll,
    onTutorialSummon: handleTutorialSummon,
    // **開催中だけ渡す。**期間外は undefined なので入口ごと画面に出ない
    ...(isCollabEventOpen() ? {
      onCollabSummon: handleCollabSummon,
      onUseCollabSummonScroll: handleUseCollabSummonScroll,
      onCollabSummonScroll: handleCollabSummonScroll,
      tab: state.summonTab,
      onChangeTab: (tab: SummonTab) => {
        state.summonTab = tab;
        render();
      },
    } : {}),
  });
}

function renderMonstersScreen(): HTMLElement {
  return renderMonsters({
    player: state.player,
    detailId: state.monsterDetailId,
    rankUpMode: state.rankUpMode,
    selectedSacrificeIds: state.rankUpSacrificeIds,
    onSelectDetail: (id) => {
      // 編成やホームから開いた1体。控えた画面へそのまま帰す
      if (id === null && returnFromMonsterDetail()) return;
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
    onGoExchange: () => {
      // 選択は持ち越さない。前に開いた時の選択が残っていると、そのまま送ってしまう
      state.monsterExchangeIds = [];
      state.screen = "MONSTER_EXCHANGE";
      render();
    },
    onGoAutoEquip: (monsterId) => {
      state.autoEquipMonsterId = monsterId;
      // 前の子の結果を持ち越さない
      state.autoEquipPlan = null;
      state.autoEquipError = null;
      state.autoEquipNotice = null;
      state.autoEquipRenamingIndex = null;
      state.screen = "AUTO_EQUIP";
      render();
    },
    onGoStorage: () => {
      state.monsterStorageNotice = null;
      state.screen = "MONSTER_STORAGE";
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
    dense: state.monsterListDense,
    onToggleDense: handleToggleMonsterListDense,
    onOpenAccessorySlot: (monsterId) => openAccessories(monsterId),
  });
}

function handleToggleMonsterListDense(): void {
  state.monsterListDense = !state.monsterListDense;
  saveMonsterListDense(state.monsterListDense);
  render();
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

/**
 * アクセ一覧の組み立て。**アクセ一覧画面と、装備画面の「アクセサリー」タブで共有する。**
 * 着ける先(`accessoryPickFor`)があるのはアクセ一覧画面の時だけ。
 */
function accessoriesScreenProps(pickFor: string | null = state.accessoryPickFor): AccessoriesProps {
  /*
   * **着ける先は引数で受け取る。**装備画面の「アクセサリー」は着ける先なし(`null`)で開く。
   *
   * 前は `state.accessoryPickFor` を直に見ていた。この値は、モンスター詳細の
   * アクセ枠から着ける先を選んだ時に入り、**その後どこでも消されない。**
   * そのため一度でも着ける先を選んだ人は、装備画面で `pickFor: null` を渡しても
   * 中では「着ける先を選んでいる最中」と判定され、**「まとめ売り」を押しても
   * 選択モードに入らなかった**(依頼主の実機で発覚)。絞り込みも、着ける先用の条件が使われていた。
   */
  const picking = pickFor !== null;
  return {
    player: state.player,
    sort: state.accessorySort,
    filter: picking ? state.accessoryPickFilter : state.accessoryFilter,
    filterOpen: picking ? state.accessoryPickFilterOpen : state.accessoryFilterOpen,
    selectedId: state.selectedAccessoryId,
    pickFor,
    notice: state.accessoryNotice,
    onSelect: (id) => {
      state.selectedAccessoryId = id;
      state.accessoryNotice = null;
      render();
    },
    onChangeSort: (sort) => { state.accessorySort = sort; render(); },
    onChangeFilter: (filter) => {
      if (picking) state.accessoryPickFilter = filter;
      else state.accessoryFilter = filter;
      render();
    },
    onToggleFilterOpen: () => {
      if (picking) state.accessoryPickFilterOpen = !state.accessoryPickFilterOpen;
      else state.accessoryFilterOpen = !state.accessoryFilterOpen;
      render();
    },
    selecting: state.accessorySelecting && !picking,
    selectedIds: state.accessorySelectedIds,
    onToggleSelecting: () => {
      state.accessorySelecting = !state.accessorySelecting;
      state.selectedAccessoryId = null;
      state.accessoryNotice = null;
      if (!state.accessorySelecting) state.accessorySelectedIds = [];
      render();
    },
    onToggleSelected: (accessoryId) => {
      const acc = findAccessory(state.player, accessoryId);
      // ロック中・装着中は売れないので選ばせない(画面側でも弾いてある)
      if (!acc || acc.locked || accessoryOwner(state.player, accessoryId)) return;
      state.accessorySelectedIds = state.accessorySelectedIds.includes(accessoryId)
        ? state.accessorySelectedIds.filter((id) => id !== accessoryId)
        : [...state.accessorySelectedIds, accessoryId];
      render();
    },
    /*
     * **画面が渡してきたIDだけを選ぶ**(絞り込みで見えているもの)。
     * ここでも売れるものだけに絞り直す。
     */
    onSelectAllShown: (ids) => {
      const valid = new Set(sellableAccessoryIds(accessoriesOf(state.player), wornAccessoryIds(state.player)));
      state.accessorySelectedIds = ids.filter((id) => valid.has(id));
      render();
    },
    onClearSelection: () => { state.accessorySelectedIds = []; render(); },
    onBulkSell: handleBulkSellAccessories,
    onEquip: (accessoryId) => {
      if (!pickFor) return;
      const result = equipAccessory(state.player, pickFor, accessoryId);
      if (!result.ok) { state.accessoryNotice = result.reason; playSfx("denied", 0.7); render(); return; }
      savePlayerState(state.player);
      closeAccessories();
    },
    onUnequipPicked: () => {
      if (!pickFor) return;
      unequipAccessory(state.player, pickFor);
      savePlayerState(state.player);
      state.accessoryNotice = "アクセサリーを外しました";
      render();
    },
    onEnhance: (accessoryId) => {
      const result = tryEnhanceAccessory(state.player, accessoryId);
      if (!result.ok) { state.accessoryNotice = result.reason ?? null; playSfx("denied", 0.7); render(); return; }
      savePlayerState(state.player);
      // Lv5・10・15 に届いた時は、どの特殊効果が伸びたかを添える(強化した実感を1行で出す)
      const acc = findAccessory(state.player, accessoryId);
      const grown = (result.grownSpecials ?? []).map((id) => {
        const roll = acc?.specials.find((r) => r.id === id);
        return roll ? `「${describeSpecial(roll)}」` : "";
      }).filter(Boolean);
      state.accessoryNotice = `Lv${result.level}になりました(🪙${result.cost.toLocaleString("ja-JP")})`
        + (grown.length > 0 ? `。特殊効果 ${grown.join("")} が強くなりました` : "");
      render();
    },
    onSell: (accessoryId) => {
      const acc = findAccessory(state.player, accessoryId);
      if (!acc) return;
      if (!window.confirm(`${accessoryTitle(acc)} を売却しますか?`)) return;
      const result = sellAccessory(state.player, accessoryId);
      if (!result.ok) { state.accessoryNotice = result.reason ?? null; playSfx("denied", 0.7); render(); return; }
      savePlayerState(state.player);
      state.selectedAccessoryId = null;
      state.accessoryNotice = `売却しました(🪙${result.goldEarned.toLocaleString("ja-JP")})`;
      render();
    },
    onToggleLock: (accessoryId) => {
      const acc = findAccessory(state.player, accessoryId);
      if (!acc) return;
      setAccessoryLocked(state.player, accessoryId, !acc.locked);
      // 鍵を掛けたものは売れない。選ばれていたら外す
      if (acc.locked) state.accessorySelectedIds = state.accessorySelectedIds.filter((id) => id !== accessoryId);
      savePlayerState(state.player);
      render();
    },
  };
}

/**
 * 選んだアクセをまとめて売る(アクセの一覧から)。
 *
 * 取り消せないので、**何個いくらで売れるかを確認の文面に必ず出す。**
 * 確認の**後に**ロックと装着を見直す(`bulkSellAccessories`)。
 * 1個でも売れないものが混ざっていたら1個も売らず、選び直してもらう。
 */
function handleBulkSellAccessories(): void {
  const worn = wornAccessoryIds(state.player);
  const targets = accessoriesOf(state.player).filter((acc) => state.accessorySelectedIds.includes(acc.id));
  if (targets.length === 0) return;
  if (targets.some((acc) => acc.locked || worn.has(acc.id))) {
    const valid = new Set(sellableAccessoryIds(targets, worn));
    state.accessorySelectedIds = state.accessorySelectedIds.filter((id) => valid.has(id));
    state.accessoryNotice = "ロック中・装着中のアクセサリーを選択から外しました";
    playSfx("denied", 0.7);
    render();
    return;
  }
  const total = targets.reduce((sum, acc) => sum + accessorySellPrice(acc), 0);
  if (!window.confirm(`選択した${targets.length}個のアクセサリーを${total.toLocaleString("ja-JP")}ゴールドで売却します。\nこの操作は取り消せません。`)) return;
  const result = bulkSellAccessories(state.player, targets.map((acc) => acc.id));
  if (!result.ok) {
    state.accessorySelectedIds = [];
    state.accessoryNotice = `${result.reason ?? "売却できませんでした"}。選び直してください`;
    playSfx("denied", 0.7);
    render();
    return;
  }
  savePlayerState(state.player);
  state.accessorySelectedIds = [];
  state.selectedAccessoryId = null;
  state.accessoryNotice = `${result.sold}個を売却しました(🪙${result.goldEarned.toLocaleString("ja-JP")})`;
  render();
}

function renderEquipmentScreen(tabs?: HTMLElement): HTMLElement {
  const props: EquipmentProps = {
    tabs,
    player: state.player,
    detailId: state.equipmentDetailId,
    pickerContext: state.equipmentPickerContext,
    slotFilter: state.equipmentSlotFilter,
    dense: state.equipmentListDense,
    onToggleDense: () => {
      state.equipmentListDense = !state.equipmentListDense;
      saveEquipmentListDense(state.equipmentListDense);
      render();
    },
    /*
     * 絞り込みは**画面ごとに別の物を渡す。**
     * 装備を選ぶ画面(picker)と所持装備の一覧で条件を共有すると、
     * 一覧で絞ったままモンスターの枠を開いた時に「何も出ない」が起きる。
     */
    filter: state.equipmentPickerContext ? state.equipmentPickerFilter : state.equipmentFilter,
    filterOpen: state.equipmentPickerContext ? state.equipmentPickerFilterOpen : state.equipmentFilterOpen,
    onChangeFilter: (filter) => {
      if (state.equipmentPickerContext) state.equipmentPickerFilter = filter;
      else state.equipmentFilter = filter;
      // 条件が変われば見えるものが変わる。並びも組み直す
      state.equipmentOrder = null;
      render();
    },
    onToggleFilterOpen: () => {
      if (state.equipmentPickerContext) {
        state.equipmentPickerFilterOpen = !state.equipmentPickerFilterOpen;
      } else {
        state.equipmentFilterOpen = !state.equipmentFilterOpen;
      }
      render();
    },
    orderIds: state.equipmentOrder,
    onChangeSlotFilter: (slot) => {
      state.equipmentSlotFilter = slot;
      state.equipmentOrder = null;
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
      // 並べ替えを選び直したのだから、固定していた並びは捨てる
      state.equipmentOrder = null;
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
    onToggleAutoExclude: (equipmentId) => {
      const item = state.player.equipment.find((e) => e.id === equipmentId);
      if (!item) return;
      item.autoExclude = !item.autoExclude;
      if (!savePlayerState(state.player)) {
        item.autoExclude = !item.autoExclude;
        playSfx("denied", 0.7);
      }
      render();
    },
    onToggleLock: (equipmentId) => {
      const item = state.player.equipment.find((entry) => entry.id === equipmentId);
      if (!item || !setEquipmentLocked(state.player, equipmentId, !item.locked)) return;
      if (item.locked) state.equipmentSelectedIds = state.equipmentSelectedIds.filter((id) => id !== equipmentId);
      savePlayerState(state.player);
      render();
    },
  };

  /*
   * 並びを固定する。**強化した札をその場に留めるための唯一の場所。**
   *
   * 描く前にここで一度だけ決めて控える。控えが無ければ今の並びをそのまま採り、
   * あれば「今見えているもの」をその順に並べ直して控えを更新する
   * (売った装備は消え、増えた装備は末尾に付く)。
   * 控えを捨てる場所は `navigate` と、並び順・絞り込み・枠を変えた時。
   */
  const shown = applyEquipmentOrder(visibleEquipment(props), state.equipmentOrder);
  state.equipmentOrder = shown.map((item) => item.id);
  return renderEquipment({ ...props, orderIds: state.equipmentOrder });
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
    /*
     * **アクセ・遺跡・製作・限界付与の中身を巡回と実機確認に見せるための口。**
     * 初期セーブはアクセ0個・素材0・遺跡未クリアなので、そのまま開くと
     * 空の一覧と「未開放」だけを検査することになる。
     */
    seedAccessoryContent() {
      const rng = Math.random;
      const families = ["ATTACK", "DURABILITY", "SUPPORT", "DISRUPT"] as const;
      const rarities = ["HERO", "LEGEND", "EPIC"] as const;
      for (const family of families) for (const rarity of rarities) {
        const acc = generateAccessoryForDev({ star: rarity === "EPIC" ? 6 : rarity === "LEGEND" ? 5 : 4, rarity, family, rng });
        acc.level = rarity === "EPIC" ? 15 : rarity === "LEGEND" ? 10 : 1;
        (state.player.accessories ??= []).push(acc);
      }
      const lead = getParty(state.player)[0] ?? state.player.monsters[0];
      if (lead) {
        lead.star = 6;
        lead.level = 60;
        lead.accessoryId = state.player.accessories![state.player.accessories!.length - 1].id;
      }
      state.player.ancientShards = 320;
      state.player.evolutionCores = 250;
      state.player.clearedPowerRuinFloors = [1, 2, 3, 4, 5];
      state.player.clearedGuardianRuinFloors = [1, 2, 3, 4, 5];
      savePlayerState(state.player);
      render();
    },
    /** 実機確認用: 編成を★6 Lv60・★6+15装備にして、遺跡の低層を勝てる状態にする */
    strongPartyForDev() {
      // 遺跡・装備ダンジョンはダンジョン編成で戦う。未編成なら通常の編成を写す
      if (state.player.dungeonPartyIds.length === 0) state.player.dungeonPartyIds = [...state.player.partyIds];
      for (const monster of getDungeonParty(state.player)) {
        monster.star = 6;
        monster.level = 60;
        monster.skillLevels = [5, 5, 5];
        for (const slot of EQUIP_SLOTS) {
          const item = generateEquipment({ star: 6, slot, subStatCount: 4 });
          while (item.level < 15) enhanceEquipmentForDev(item);
          state.player.equipment.push(item);
          monster.equipment[slot] = item.id;
        }
      }
      state.player.stamina = Math.max(state.player.stamina, 500);
      savePlayerState(state.player);
      render();
    },
    /** 実機確認用: 編成を★1 Lv1・装備なしにする(負けたら周回が止まるかを見る) */
    weakPartyForDev() {
      for (const monster of getDungeonParty(state.player)) {
        monster.star = 1;
        monster.level = 1;
        monster.equipment = {};
        monster.accessoryId = null;
      }
      savePlayerState(state.player);
      render();
    },
    /** 編成の先頭の詳細を開く(アクセ枠の実タップ確認用) */
    openLeadDetailForDev() {
      const lead = getParty(state.player)[0] ?? state.player.monsters[0];
      if (!lead) return;
      navigate("MONSTERS");
      state.monsterDetailId = lead.id;
      render();
    },
    /** 遺跡を開く。`floor` を渡せばその階の詳細 */
    openRuins(kind: RuinKind = "POWER", floor: number | null = null) {
      navigate("RUINS");
      state.ruinKind = kind;
      state.selectedRuinFloor = floor;
      render();
    },
    /** アクセ一覧。`pick` なら先頭の編成メンバーに着ける画面、`select` なら先頭のアクセを選んだ状態 */
    openAccessoriesForDev(pick = false, select = false) {
      navigate(pick ? "MONSTERS" : "RUINS");
      const lead = getParty(state.player)[0] ?? state.player.monsters[0];
      openAccessories(pick && lead ? lead.id : null);
      if (select) state.selectedAccessoryId = state.player.accessories?.at(-1)?.id ?? null;
      render();
    },
    /** 装備画面の「アクセサリー」側を開く(巡回用) */
    openGearAccessoryTabForDev() {
      navigate("EQUIPMENT");
      state.equipmentPickerContext = null;
      state.equipmentDetailId = null;
      state.equipmentTab = "ACCESSORY";
      render();
    },
    openCraftForDev() {
      navigate("RUINS");
      openCraft();
    },
    /**
     * @param unlock false = 未解放 / true = 解放済みで**配分中**(未確定。スライダーと±が動く)
     *               / "confirmed" = 確定済み(有料のリセットが出る)
     */
    openLimitBreakForDev(unlock: boolean | "confirmed" = false) {
      const lead = getParty(state.player)[0] ?? state.player.monsters[0];
      if (!lead) return;
      lead.star = 6;
      if (unlock) {
        lead.development.limitBreak = { unlocked: true, points: unlock === "confirmed" ? { hp: -10, atk: 10, def: 0, spd: 0 } : { hp: 0, atk: 0, def: 0, spd: 0 } };
      }
      navigate("MONSTERS");
      state.monsterDetailId = lead.id;
      openLimitBreak(lead.id);
      if (unlock === true) {
        state.limitDraft = { hp: -10, atk: 10, def: 0, spd: 0 };
        render();
      }
    },
    /*
     * **才能覚醒の中身を巡回に見せるための口。**
     *
     * この画面は★6でしか開かない。初期セーブには★6が居ないので、
     * 巡回はいつまでも「★6で解放されます」の案内だけを検査し、
     * 才能の札や下の帯を一度も見ないことになる。
     * (アリーナのランキングで**行が1つも無い画面**を検査し続け、
     * 名前の切れを見逃したのと同じ穴。)
     */
    openCreateMenu(menu: CreateMenu = "TALENT") {
      const monster = state.player.monsters.find((m) => m.star === 6) ?? state.player.monsters[0];
      if (!monster) return;
      // 才能覚醒もタイプ転生も★6でしか中身が出ない
      monster.star = 6;
      state.createTargetId = monster.id;
      state.createMenu = menu;
      state.createNotice = null;
      state.talentTab = "BASIC";
      state.talentSkillSlot = 1;
      navigate("MONSTER_CREATE");
      render();
    },
    /*
     * **才能覚醒を取った状態の詳細を巡回に見せるための口。**
     *
     * 詳細の「◆ 才能覚醒」は、取っていなければ1行の案内で終わる。
     * 初期セーブは★6が居ないので、そのまま開くと
     * 「★6で解放」だけを検査して、**取った後に伸びる行を一度も見ない。**
     * (行が1つも無いランキングを検査し続けたのと同じ穴。)
     */
    openMonsterDetailWithTalents() {
      const monster = state.player.monsters.find((m) => m.star === 6) ?? state.player.monsters[0];
      if (!monster) return;
      monster.star = 6;
      monster.development = {
        ...(monster.development ?? createDefaultMonsterDevelopment()),
        talents: {
          schemaVersion: 1,
          unlockedPoints: 20,
          // **いちばん行が伸びる形**を出す。基礎3・戦闘2・スキル両枠・覚醒
          basic: { atk: 3, criDmg: 2, spd: 1 },
          battle: { damageDealt: 3, debuffChance: 1 },
          skill: { 1: ["atk_power1", "atk_crit"], 2: ["heal_boost1"] },
          awakening: { slot: 1, id: "awk_atk_strip" },
        },
      };
      state.monsterDetailReturn = null;
      state.monsterDetailId = monster.id;
      state.rankUpMode = false;
      state.screen = "MONSTERS";
      render();
    },
    /*
     * **ポーションを持った状態を巡回に見せるための口。**
     *
     * 初期セーブは0個・自動使用OFFなので、そのまま開くと
     * 「所持 🧪0個」の1行しか検査されない。数が2桁になった時の
     * 折り返しも、ONにした時に「最大」の札が伸びた姿も見ないままになる
     * (行が1つも無いランキングを検査し続けたのと同じ穴)。
     */
    grantStaminaPotions(count = 3, budget = 3) {
      state.player.staminaPotions = count;
      state.player.staminaPotionFarmBudget = budget;
      savePlayerState(state.player);
      render();
    },
    /*
     * **スタミナポーションが並ぶ棚を巡回に見せるための口。**
     *
     * 棚は1時間ごとに入れ替わり、ポーションは毎回並ぶわけではない。
     * そのままでは「たまたま並ばなかった棚」を検査して問題なしと報告する
     * ことになるので、並ぶ時間帯を探してからその棚を出す。
     */
    showShopWithStaminaPotion() {
      state.player.fighterLevel = Math.max(state.player.fighterLevel, 30);
      state.player.shopSlotsUnlocked = SHOP_MAX_SLOTS;
      state.player.gold = Math.max(state.player.gold, 5_000_000);
      const base = rotationKeyAt(Date.now());
      for (let i = 0; i < 400; i += 1) {
        const at = (base + i) * SHOP_ROTATION_MS;
        const lineup = buildShopLineup(at, state.player.fighterLevel, SHOP_MAX_SLOTS);
        if (lineup.entries.some((entry) => entry.kind === "STAMINA_POTION")) {
          state.devShopNow = at;
          break;
        }
      }
      navigate("SHOP");
      render();
    },
    /*
     * **記録が届いていない知らせを巡回に見せるための口。**
     *
     * 通信が途切れていないと出ない知らせなので、そのままでは
     * 一度も検査されない。しかもこの知らせは**案内(スタミナ切れなど)と
     * 同じ場所に出る**ので、2つ出た時の重なりが見たい所そのもの。
     * 案内も一緒に立てて、並んだ姿を撮らせる。
     */
    showTowerSyncPending(floor = 99) {
      state.player.trialTowerLifetimeBestFloor = Math.max(state.player.trialTowerLifetimeBestFloor, floor);
      navigate("TRIAL_TOWER");
      // `navigate` が案内を畳むので、必ずその後で立てる
      state.towerSyncPending[state.towerMode] = floor;
      state.towerNotice = "確認用の案内です。ここに2つ目の知らせが並びます。";
      render();
    },
    showDemoRanking() {
      arenaConnectionStatus = "ONLINE";
      state.arenaRankingLoading = false;
      state.arenaRankingTop = DEMO_RANKING_ROWS;
      state.arenaRankingAround = DEMO_RANKING_ROWS;
      state.arenaView = "RANKING";
      render();
    },
    /*
     * **おまかせ装備を巡回に見せるための口。**
     *
     * 初期セーブには装備が1個も無い。そのまま開くと
     * 「候補になる装備がありません」の一文だけが出て、
     * 変更前→変更後の行も、部位ごとの入れ替えも、他の子から外す警告も、
     * 実行バーも**一度も検査されない**
     * (アリーナのランキングで行が1つも無い画面を検査し続け、
     * 名前の切れを見逃したのと同じ穴)。
     *
     * `withPlan` を立てると、探し終えた状態まで進める。
     */
    openAutoEquip(withPlan = false, withSets = false) {
      const monster = state.player.monsters[0];
      if (!monster) return;
      monster.star = 6;
      monster.level = 60;
      // 6枠ぶんを2周ぶん配る。1個しか無いと「選びようがない」画面になる
      for (let round = 0; round < 2; round += 1) {
        for (const slot of EQUIP_SLOTS) {
          const item = generateEquipment({ slot, star: 6, subStatCount: 4 });
          addEquipment(state.player, item);
          if (round === 0) equipToMonster(state.player, monster.id, item.id);
        }
      }
      state.autoEquipMonsterId = monster.id;
      state.autoEquipSettings = createDefaultAutoEquipSettings();
      state.autoEquipPlan = null;
      state.autoEquipError = null;
      state.autoEquipNotice = null;
      state.autoEquipRenamingIndex = null;
      state.autoEquipDetailOpen = true;
      state.screen = "AUTO_EQUIP";
      /*
       * シリーズ札は**選んだ状態も見せる。**選ぶまでは全部同じ形なので、
       * 「4セット」と出ている札の幅も、残り枠の案内文も一度も測られない。
       */
      if (withSets) {
        const reach = reachableSetCounts(state.player, monster, state.autoEquipSettings);
        const pick = SET_TYPES.filter((type) => (reach.get(type) ?? 0) >= 4).slice(0, 1);
        if (pick.length > 0) state.autoEquipSettings = { ...state.autoEquipSettings, wantedSets: { [pick[0]]: 4 } };
      }
      if (withPlan) {
        // 保存済みの枠も見せる。空の3枠だけでは札の中身が検査されない
        writePreset(monster, 0, capturePreset(monster, 0, state.autoEquipSettings, "アリーナ"));
        handleAutoEquipSearch(monster.id, state.autoEquipSettings);
        return;
      }
      render();
    },
    /*
     * **周回結果の「獲得装備」のシートを巡回に見せるための口。**
     *
     * 周回を回さないと開けない画面なので、これまで一度も検査されていなかった。
     * シートは `position:fixed` で下から出て、中に絞り込み・一覧・操作帯が入る
     * ——**いちばん崩れやすい形**をしている。
     */
    openFarmEquipmentSheet(withFilter = false) {
      const result = emptyResult();
      result.attempts = 10;
      result.cleared = 10;
      // 12個。絞り込みの札が何種類も出て、絞った後も残る程度の数にする
      for (let i = 0; i < 12; i += 1) {
        const item = generateEquipment({
          slot: ((i % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6,
          star: ((i % 3) + 4) as 4 | 5 | 6,
          subStatCount: (i % 5) as 0 | 1 | 2 | 3 | 4,
        });
        addEquipment(state.player, item);
        (result.earnedEquipmentIds ??= []).push(item.id);
        result.equipmentDropCount += 1;
      }
      state.autoFarmResult = result;
      state.autoFarmTargetName = "装備ダンジョン 5階";
      state.screen = "AUTO_FARM_RESULT";
      state.farmEquipmentOpen = true;
      state.farmEquipmentFilter = { ...EMPTY_EQUIPMENT_FILTER };
      // 条件の札を開いた姿も見せる。畳んだままだと中の札が一度も測られない
      state.farmEquipmentFilterOpen = withFilter;
      render();
    },
    /*
     * **遺跡の周回結果と「今回獲得したアクセサリー」のシートを巡回に見せるための口。**
     * 周回を回さないと開けない画面なので、ここから中身を作って開く。
     */
    openRuinFarmResult(withSheet = false, withFilter = false) {
      const result = emptyResult();
      result.attempts = 10;
      result.cleared = 10;
      const rng = Math.random;
      const families = ["ATTACK", "DURABILITY", "SUPPORT", "DISRUPT"] as const;
      const rarities = ["HERO", "LEGEND", "EPIC"] as const;
      for (let i = 0; i < 10; i += 1) {
        const rarity = rarities[i % 3];
        const acc = generateAccessoryForDev({ star: rarity === "EPIC" ? 6 : rarity === "LEGEND" ? 5 : 4, rarity, family: families[i % 4], rng });
        (state.player.accessories ??= []).push(acc);
        (result.earnedAccessoryIds ??= []).push(acc.id);
        result.accessoryDropCount = (result.accessoryDropCount ?? 0) + 1;
      }
      // 1個は鍵を掛けておく(選べない札の見え方も検査に載せる)
      const first = findAccessory(state.player, result.earnedAccessoryIds![0]);
      if (first) first.locked = true;
      result.evolutionCores = 30;
      result.ancientShards = 40;
      savePlayerState(state.player);
      state.autoFarmResult = result;
      state.autoFarmTargetName = "力の遺跡 3階";
      state.screen = "AUTO_FARM_RESULT";
      state.farmAccessoryOpen = false;
      if (withSheet) {
        openFarmAccessorySheet(result);
        state.farmAccessoryFilterOpen = withFilter;
      }
      render();
    },
    /** 1戦の遺跡の結果(アクセ1個)。`withSheet` なら獲得のシートまで開く */
    openRuinStageResultForDev(withSheet = false) {
      const acc = generateAccessoryForDev({ star: 6, rarity: "EPIC", family: "ATTACK", rng: Math.random });
      (state.player.accessories ??= []).push(acc);
      savePlayerState(state.player);
      state.stageResult = {
        cleared: true,
        stageName: "力の遺跡 3階",
        goldEarned: 0,
        crystalEarned: 0,
        wavesCleared: 1,
        totalWaves: 1,
        levelUps: [],
        dropDexId: null,
        dropStar: null,
        equipmentDrop: null,
        extraLines: [accessoryTitle(acc), ...acc.specials.map((roll) => `特殊 ${describeSpecial(roll)}`), "進化核 ×3", "古代のカケラ ×4"],
        earnedAccessoryIds: [acc.id],
      };
      state.screen = "STAGE_RESULT";
      state.farmAccessoryOpen = false;
      if (withSheet) openFarmAccessorySheet(state.stageResult);
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
window.addEventListener("pagehide", () => savePlayerState(state.player));import { ARENA_TICKET_MAX, ARENA_TICKET_REFILL_COST } from "../data/pvpArena.js";
