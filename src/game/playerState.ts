import { Equipment, EquipSlot, SET_TYPES, canEnhanceEquipment, enhanceEquipment, enhanceEquipmentCost, equipmentSellPrice } from "../core/equipment.js";
import { MAX_FIGHTER_LEVEL, INITIAL_MAX_STAMINA, maxStaminaForFighterLevel, requiredExpForFighterLevel } from "../core/fighterLevel.js";
import { MonsterInstance, createMonsterInstance } from "../core/monsterInstance.js";
import { abilityPointBudget, createDefaultMonsterDevelopment } from "../core/monsterDevelopment.js";
import { Star } from "../core/rarity.js";
import type { ArenaDefenseSnapshot, ArenaMatchRecord } from "./arena/types.js";
import { GOLD_DUNGEON_DAILY_LIMIT } from "../data/goldDungeon.js";
import { LEGACY_LEVEL_DUNGEON_TIERS, LEVEL_DUNGEON_DAILY_LIMIT } from "../data/levelDungeon.js";
import { ARENA_START_POINTS, ARENA_TICKET_MAX } from "../data/pvpArena.js";
import { ARENA_NOT_CLAIMED } from "../data/arena/season.js";

/** アリーナの記録として残す件数。増やし続けると控えが太る */
export const ARENA_HISTORY_MAX = 30;

/**
 * この端末の識別子を作る。
 *
 * **形はUUIDに揃える。** サーバ側の `user_id` は uuid 型なので、
 * `local_1` のような文字列を送ると PostgREST がキャストで落として
 * 400を返す——実プレイヤーが1人も並ばず、順位も常に「未掲載」になる。
 * 認証が入ったらそのユーザIDへ差し替える。
 */
export function newArenaLocalId(): string {
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${["8", "9", "a", "b"][Math.floor(Math.random() * 4)]}${hex(3)}-${hex(12)}`;
}

/** アリーナショップの購入回数1件ぶん */
export interface ArenaShopPurchaseRecord {
  itemId: string;
  /** "WEEKLY" / "MONTHLY" / "SEASON" */
  period: string;
  /** その周期の通し番号。番号が変われば数え直す(= 上限がリセットされる) */
  periodKey: number;
  count: number;
}
import {
  ShopEntry,
  SHOP_INITIAL_SLOTS,
  SHOP_MAX_SLOTS,
  buildShopLineup,
  nextSlotUnlockCost,
  rotationKeyAt,
} from "./shop.js";
import { Difficulty } from "../data/stages.js";
import { BackgroundFarmJob } from "./backgroundAutoFarm.js";
import { FALLBACK_REFERENCE_SECONDS, ManualClearTimes } from "./manualClearTimes.js";
import type { EquipmentDungeonKind } from "../data/equipmentDungeon.js";

export interface PlayerState {
  /** 保存型バックグラウンド周回。同時に1件だけ保持する。 */
  backgroundFarmJob: BackgroundFarmJob | null;
  /** 場所・難易度ごとの、直近5回の手動戦闘クリア秒数。 */
  recentManualClearTimes: ManualClearTimes;
  tutorialMissions: { claimedIds: string[]; partyChanged: boolean; createOpened: boolean };
  crystal: number;
  gold: number;
  monsters: MonsterInstance[];
  partyIds: string[];
  clearedStageIds: string[];
  /** クリア済みの装備ダンジョン階層(初回クリア判定・ダイヤ報酬用) */
  clearedDungeonFloors: number[];
  /** クリア済みの魔獣のダンジョン階層。旧セーブでは空配列として扱う。 */
  clearedBeastDungeonFloors?: number[];
  /** クリア済みのレベル上げダンジョン難易度(初回クリア判定・ダイヤ報酬用) */
  clearedLevelDungeonTiers: string[];
  /** クリア済みのゴールドダンジョン階層 */
  clearedGoldDungeonFloors: number[];
  equipment: Equipment[];
  /** 装備ダンジョン専用のパーティ編成(通常ステージのpartyIdsとは別枠、最大5体) */
  dungeonPartyIds: string[];
  /** 召喚の書の所持数。1個消費すると石を使わずに1回分の召喚ができる */
  summonScrolls: number;
  /** ★4以上を保証する正式な召喚書 */
  fourStarSummonScrolls: number;
  /** 光・闇属性かつ★4以上を保証する正式な召喚書 */
  lightDarkFourStarSummonScrolls: number;
  /** ★5を保証する正式な召喚書 */
  fiveStarSummonScrolls: number;
  /** 潜在覚醒で1個消費する素材 */
  awakeningOrbs: number;
  /** 覚醒オーブの達成報酬を受取済みのID。既存報酬の受取印とは分け、後付け報酬も安全に配る */
  claimedAwakeningOrbRewardIds: string[];
  /** プレイヤー(ファイター)自身のレベル。上限50 */
  fighterLevel: number;
  /** 次のファイターレベルまでの累積経験値 */
  fighterExp: number;
  /** 現在のスタミナ */
  stamina: number;
  /** スタミナ上限(ファイターレベルに応じて増える) */
  maxStamina: number;
  /** スタミナの自然回復計算の基準時刻(ミリ秒epoch) */
  lastStaminaUpdateAt: number;
  /** プレイヤーが自由に設定できるファイター名 */
  fighterName: string;
  /** 直近でログインボーナスを受け取った時刻(ミリ秒epoch)。同じ日にはもう受け取れない */
  lastLoginBonusAt: number | null;
  /** ログインボーナスを受け取った日数の累計(10日ごとの追加ボーナス判定に使う) */
  loginBonusClaimCount: number;
  /** ゴールドダンジョンの本日の挑戦回数(1日GOLD_DUNGEON_DAILY_LIMIT回まで) */
  goldDungeonChallengesToday: number;
  /** ゴールドダンジョンの挑戦回数を最後にリセットした時刻(ミリ秒epoch)。日付が変わると回数がリセットされる */
  lastGoldDungeonResetAt: number | null;
  /** レベル上げダンジョンの本日の挑戦回数(1日LEVEL_DUNGEON_DAILY_LIMIT回まで) */
  levelDungeonChallengesToday: number;
  /** レベル上げダンジョンの挑戦回数を最後にリセットした時刻(ミリ秒epoch) */
  lastLevelDungeonResetAt: number | null;
  /** ショップで開放済みの枠数(初期5、ダイヤで最大10まで) */
  shopSlotsUnlocked: number;
  /** 購入済みを記録している品揃えの識別子。品揃えが変わるとリセットする */
  shopRotationKey: number;
  /** 今の品揃えで購入済みの枠の番号 */
  shopPurchasedSlots: number[];
  /** 受け取り済みのお詫び配布のid。重複して配らないために残す */
  claimedCompensationIds: string[];
  /** はじまりの10連を引いたか。1度きりなので使い切りの印として持つ */
  tutorialSummonDone?: boolean;
  /**
   * 装備の速度を半分に見直した調整を、この控えに適用済みか。
   *
   * 装備の数値は**引いた時に確定して控えに残る**ので、生成側の基準値を変えても
   * 既に持っている装備には効かない。これが無いと、前から遊んでいる人だけ
   * 倍の速度装備を持ち続けることになる。
   */
  equipmentSpeedRebalanced?: boolean;

  /* --- アリーナ(対人戦) --- */
  /**
   * 防衛編成。**他プレイヤーが挑んでくる時にAIが動かす編成**なので、
   * 攻撃編成とは別に持つ。同じ編成を使い回せると「攻めに強い＝守りにも強い」に
   * なってしまい、編成を考える楽しみが消える
   */
  arenaDefenseIds: string[];
  /** 攻撃編成。こちらから挑む時に使う */
  arenaOffenseIds: string[];
  /** アリーナ点数。勝てば上がり負ければ下がる。階級はこの値から決まる */
  arenaPoints: number;
  /** 残っている挑戦券 */
  arenaTickets: number;
  /** 挑戦券の自然回復を最後に計算した時刻(ミリ秒epoch) */
  lastArenaTicketUpdateAt: number;
  /** 挑戦相手を選ぶ乱数の種。挑むたびに進めるので、同じ相手が続けて出ない */
  arenaOpponentSeed: number;
  /**
   * 前の対戦から「相手を変える」を使った回数。**1戦するたびに0へ戻る。**
   *
   * 手で変えるのは「並んだ5人がどれも噛み合わない」時のための逃げ道。
   * 無制限だと、いちばん弱い相手が出るまで引き直せてしまう。
   * 日付で区切らないのは、**挑めば数え直せる**方が分かりやすいから
   * (1日で使い切ると、その日はもう並びを変えられなくなる)。
   */
  arenaRerollsSinceBattle: number;

  /* --- ダイヤショップ --- */
  /**
   * 週次・月次の購入回数。**周期の番号ごとに1行**。
   * 番号が変われば数えている行が対象外になり、上限が自動で戻る
   * (リセット用の後片付けを持たない。動かない後始末は必ず腐る)。
   */
  crystalShopPurchases: { itemId: string; period: string; periodKey: number; count: number }[];
  /**
   * 見た中でいちばん新しい周期の番号。**時計を巻き戻されても戻さない。**
   * サーバを通していないので、これが唯一の歯止めになる。
   */
  crystalShopMaxWeekKey?: number;
  crystalShopMaxMonthKey?: number;
  /** 期間報酬を最後に受け取った期の識別子(-1 = まだ一度も精算していない) */
  arenaPeriodKey: number;
  /** 今期の対戦回数 */
  arenaSeasonBattles: number;
  /** 今期の勝利数 */
  arenaSeasonWins: number;
  /** 今期の最高到達点数。期間報酬はこの値で決まる(下がっても取り上げない) */
  arenaSeasonBestPoints: number;
  /*
   * --- 非同期PvPアリーナ(2026-09 刷新) ---
   *
   * **レートは `arenaPoints` をそのまま使う。** 新しい `arenaRating` を足して
   * 移し替えると、いま遊んでいる人の順位が一度リセットされたように見える。
   * 名前が古いだけで意味は同じなので、増やさず流用する。
   *
   * 以下はすべて**未設定でも成立する**形にしてある。古い控えには丸ごと無い。
   */
  /** アリーナ専用通貨。ショップで使う */
  arenaCoins: number;
  /** 防衛パーティを登録した時点の姿。登録後に本人が何をしても壊れない */
  arenaDefenseSnapshot: ArenaDefenseSnapshot | null;
  /** 攻撃と防衛の記録。新しいものが先頭 */
  arenaMatchHistory: ArenaMatchRecord[];
  /** 直近で候補に出した相手。同じ顔ぶれが続かないようにする */
  arenaRecentOpponentIds: string[];
  /** 週間報酬を受け取った週。二重受取はここで弾く(`ARENA_NOT_CLAIMED` = 未受取) */
  arenaWeeklyClaimedWeek: number;
  /** シーズン報酬を受け取ったシーズン番号(`ARENA_NOT_CLAIMED` = 未受取) */
  arenaSeasonClaimedNumber: number;
  /** いま進行中のシーズン番号。ここが変わったらソフトリセットを掛ける */
  arenaSeasonNumber: number;
  /** アリーナショップの購入回数。周期ごとに数える */
  arenaShopPurchases: ArenaShopPurchaseRecord[];
  /**
   * サーバ購入を手元へ付与済みの購入ID。
   * 保存してからサーバへ受取完了を返すことで、通信断でも二重付与しない。
   */
  arenaShopFulfilledPurchaseIds: string[];
  /** 手に入れた見た目の報酬(称号・フレーム・アイコン) */
  arenaCosmetics: string[];
  /**
   * この端末の識別子。
   *
   * **対戦の種(`arenaOpponentSeed`)を流用してはいけない。** 種は
   * 「相手を変える」で進むので、押すたびに自分のIDが変わってしまう。
   * 自分を候補から外す判定も、ランキングの自分判定も、それでは成立しない。
   * 認証が入るまでの仮の識別子で、**一度決めたら変えない**。
   */
  arenaLocalId: string;
  /** 留守中の防衛戦を最後にさばいた時刻。0 なら「今から数え始める」 */
  arenaLastDefenseCheckAt: number;
  /** 今日、防衛で失ったレート。寝ている間に落ち続けないよう上限を掛ける */
  arenaDefenseLossToday: number;
  /** 上の値を数えている日(JSTの日付文字列) */
  arenaDefenseLossDate: string;
  /** 今日、防衛成功で受け取ったアリーナコイン */
  arenaDefenseCoinsToday: number;
  /** 上の値を数えている日(JSTの日付文字列) */
  arenaDefenseCoinDate: string;

  /* --- 試練の塔 --- */
  /** 塔専用の編成。HPを持ち越して登る場所なので、耐久寄りに組み替えられるよう別枠で持つ */
  towerPartyIds: string[];
  /** 越えた階の最高。ここから節(10階ごと)を割り出して再開地点を決める */
  trialTowerBestFloor: number;
  /** 初回到達報酬を渡し済みの階。登り直しで二重に渡さないために残す */
  trialTowerClaimedFloors: number[];
  /** 塔の月間シーズン。端末のタイムゾーンによらないJSTの YYYY-MM */
  trialTowerSeason: string;
  /** 今月の覚醒オーブ報酬を受け取った階 (15 / 30) */
  trialTowerMonthlyOrbClaimedFloors: number[];
  /**
   * 登坂の途中経過。10戦を1度に登り切れるとは限らないので、
   * **アプリを閉じても続きから入れる**ように途中のHPとクールタイムごと控えに残す。
   */
  trialTowerRun: TowerRunSave | null;
}

/** 保存する登坂の途中経過。`src/game/trialTower.ts` の TowerRun と同じ形 */
export interface TowerRunSave {
  floor: number;
  members: { instanceId: string; hp: number; cooldowns: [number, number, number] }[];
}

const STORAGE_KEY = "crimon_save_v1";

/**
 * 試練の塔の編成の最大人数。
 *
 * 装備ダンジョンと同じ5体。塔はHPを持ち越すので、**控えが厚いほど粘れる**。
 * 別の定数にしてあるのは、片方だけを動かしたくなった時に
 * もう片方を巻き込まないため(速度の時に片方だけ触って崩した経緯がある)。
 */
export const MAX_TOWER_PARTY_SIZE = 5;

/** 装備ダンジョン専用パーティの最大人数(通常ステージの4体より1体多い) */
export const MAX_DUNGEON_PARTY_SIZE = 5;

const STARTER_MONSTERS: { templateId: string; element: string }[] = [
  { templateId: "slime", element: "FIRE" },
  { templateId: "wolf", element: "WATER" },
  { templateId: "golem", element: "ELECTRIC" },
  { templateId: "fairy", element: "GRASS" },
];

/** ファイター名の初期値・最大文字数 */
export const DEFAULT_FIGHTER_NAME = "ファイター";
export const FIGHTER_NAME_MAX_LENGTH = 12;

/** UTC時刻をJST (+09:00) にずらし、塔の月間シーズン識別子へ変換する。 */
export function towerSeasonKeyAt(now: Date = new Date()): string {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * JSTの月が変わった時だけ、塔に属する月間データを初期化する。
 * 所持品や育成値などには一切触れない。旧セーブは現在月へ安全に参加させ、
 * 既に到達済みの15/30階を今月もう一度受け取った扱いにして移行時の二重配布を防ぐ。
 */
export function ensureTowerMonthlyState(state: PlayerState, now: Date = new Date()): boolean {
  const season = towerSeasonKeyAt(now);
  if (typeof state.trialTowerSeason !== "string") {
    state.trialTowerSeason = season;
    state.trialTowerMonthlyOrbClaimedFloors = [15, 30].filter((floor) => state.trialTowerBestFloor >= floor);
    return false;
  }
  if (!Array.isArray(state.trialTowerMonthlyOrbClaimedFloors)) state.trialTowerMonthlyOrbClaimedFloors = [];
  if (state.trialTowerSeason === season) return false;

  state.trialTowerSeason = season;
  state.trialTowerBestFloor = 0;
  state.trialTowerClaimedFloors = [];
  state.trialTowerMonthlyOrbClaimedFloors = [];
  state.trialTowerRun = null;
  return true;
}

export function createInitialState(): PlayerState {
  const monsters = STARTER_MONSTERS.map((s) => createMonsterInstance(`${s.templateId}_${s.element}`, 1, 1));
  return {
    backgroundFarmJob: null,
    recentManualClearTimes: {},
    tutorialMissions: { claimedIds: [], partyChanged: false, createOpened: false },
    crystal: 300,
    gold: 500,
    monsters,
    partyIds: monsters.map((m) => m.id),
    clearedStageIds: [],
    clearedDungeonFloors: [],
    clearedBeastDungeonFloors: [],
    clearedLevelDungeonTiers: [],
    clearedGoldDungeonFloors: [],
    equipment: [],
    dungeonPartyIds: [],
    summonScrolls: 0,
    fourStarSummonScrolls: 0,
    lightDarkFourStarSummonScrolls: 0,
    fiveStarSummonScrolls: 0,
    awakeningOrbs: 0,
    claimedAwakeningOrbRewardIds: [],
    fighterLevel: 1,
    fighterExp: 0,
    stamina: INITIAL_MAX_STAMINA,
    maxStamina: INITIAL_MAX_STAMINA,
    lastStaminaUpdateAt: Date.now(),
    fighterName: DEFAULT_FIGHTER_NAME,
    lastLoginBonusAt: null,
    loginBonusClaimCount: 0,
    goldDungeonChallengesToday: 0,
    lastGoldDungeonResetAt: null,
    levelDungeonChallengesToday: 0,
    lastLevelDungeonResetAt: null,
    shopSlotsUnlocked: SHOP_INITIAL_SLOTS,
    shopRotationKey: -1,
    shopPurchasedSlots: [],
    claimedCompensationIds: [],
    tutorialSummonDone: false,
    equipmentSpeedRebalanced: true,
    arenaDefenseIds: [],
    arenaOffenseIds: [],
    arenaPoints: ARENA_START_POINTS,
    arenaTickets: ARENA_TICKET_MAX,
    lastArenaTicketUpdateAt: Date.now(),
    arenaOpponentSeed: 1,
    arenaRerollsSinceBattle: 0,
    crystalShopPurchases: [],
    arenaPeriodKey: -1,
    arenaSeasonBattles: 0,
    arenaSeasonWins: 0,
    arenaSeasonBestPoints: ARENA_START_POINTS,
    arenaCoins: 0,
    arenaDefenseSnapshot: null,
    arenaMatchHistory: [],
    arenaRecentOpponentIds: [],
    arenaWeeklyClaimedWeek: ARENA_NOT_CLAIMED,
    arenaSeasonClaimedNumber: ARENA_NOT_CLAIMED,
    arenaSeasonNumber: 0,
    arenaShopPurchases: [],
    arenaShopFulfilledPurchaseIds: [],
    arenaCosmetics: [],
    arenaLocalId: newArenaLocalId(),
    arenaLastDefenseCheckAt: 0,
    arenaDefenseLossToday: 0,
    arenaDefenseLossDate: "",
    arenaDefenseCoinsToday: 0,
    arenaDefenseCoinDate: "",
    towerPartyIds: [],
    trialTowerBestFloor: 0,
    trialTowerClaimedFloors: [],
    trialTowerSeason: towerSeasonKeyAt(),
    trialTowerMonthlyOrbClaimedFloors: [],
    trialTowerRun: null,
  };
}

/** ファイター名を変更する。空文字や規定文字数超過は無視して元の値を保つ */
export function setFighterName(state: PlayerState, name: string): void {
  const trimmed = name.trim().slice(0, FIGHTER_NAME_MAX_LENGTH);
  if (trimmed.length === 0) return;
  state.fighterName = trimmed;
}

/** 装備IDから決定的にシリーズを割り当てる(旧セーブデータ補完用。読み込むたびに同じ結果になる) */
function deterministicSetFromId(id: string): Equipment["set"] {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % SET_TYPES.length;
  return SET_TYPES[index];
}

/** 旧バージョンのセーブデータ(装備システム・強化レベル・セット・ダンジョン専用パーティ・召喚の書導入前)を読み込んでも壊れないよう不足フィールドを補う */
function normalizeState(state: PlayerState, now: Date = new Date()): PlayerState {
  if (!state.backgroundFarmJob) state.backgroundFarmJob = null;
  if (!state.recentManualClearTimes || typeof state.recentManualClearTimes !== "object") state.recentManualClearTimes = {};
  if (state.backgroundFarmJob && !(state.backgroundFarmJob.referenceRunSeconds > 0)) {
    state.backgroundFarmJob.referenceRunSeconds = FALLBACK_REFERENCE_SECONDS[state.backgroundFarmJob.kind];
    state.backgroundFarmJob.referenceFromManual = false;
  }
  if (state.backgroundFarmJob?.status === "SETTLING") state.backgroundFarmJob.status = "RUNNING";
  if (!state.tutorialMissions || !Array.isArray(state.tutorialMissions.claimedIds)) {
    state.tutorialMissions = { claimedIds: [], partyChanged: false, createOpened: false };
  }
  // ⑦版はミッションIDの命名が異なっていた。旧ID自体は監査用に残しつつ、
  // 受取済み件数を新ロードマップの先頭へ引き継ぎ、同じ序盤報酬を取り直せなくする。
  const canonicalPrefix = "tutorial-step-";
  const legacyClaimCount = state.tutorialMissions.claimedIds.filter((id) => !id.startsWith(canonicalPrefix)).length;
  for (let step = 1; step <= Math.min(10, legacyClaimCount); step += 1) {
    const canonicalId = `${canonicalPrefix}${step}`;
    if (!state.tutorialMissions.claimedIds.includes(canonicalId)) state.tutorialMissions.claimedIds.push(canonicalId);
  }
  state.tutorialMissions.partyChanged = state.tutorialMissions.partyChanged === true;
  state.tutorialMissions.createOpened = state.tutorialMissions.createOpened === true;
  if (!state.equipment) state.equipment = [];
  for (const equipment of state.equipment) {
    if (typeof equipment.level !== "number") equipment.level = 0;
    if (!equipment.set) equipment.set = deterministicSetFromId(equipment.id);
    equipment.locked = equipment.locked === true;
  }
  if (state.backgroundFarmJob?.result && !Array.isArray(state.backgroundFarmJob.result.earnedEquipmentIds)) {
    state.backgroundFarmJob.result.earnedEquipmentIds = [];
  }
  for (const monster of state.monsters) {
    monster.locked = monster.locked === true;
    if (!monster.equipment) monster.equipment = {};
    if (!monster.skillLevels) monster.skillLevels = [1, 1, 1];
    // クリエイト拡張前の個体は「未転生・未振り分け・未覚醒」として安全に補完する。
    // 補正値を推測して付けないため、既存個体の強さは変わらない。
    if (!monster.development) monster.development = createDefaultMonsterDevelopment();
    else {
      const defaults = createDefaultMonsterDevelopment();
      const allocation = monster.development.abilityPoints ?? defaults.abilityPoints;
      const mergedAllocation = { ...defaults.abilityPoints, ...allocation };
      const valid = Object.values(mergedAllocation).every((value) => Number.isInteger(value) && value >= 0)
        && Object.values(mergedAllocation).reduce((sum, value) => sum + value, 0) <= abilityPointBudget(monster.star);
      monster.development.abilityPoints = valid ? mergedAllocation : defaults.abilityPoints;
      if (typeof monster.development.latentAbilityId !== "string") monster.development.latentAbilityId = null;
      // 旧セーブには再選択待ちが無い。明示的なtrueだけを支払い済みとして引き継ぐ。
      monster.development.latentReselectPending = monster.development.latentReselectPending === true;
      // 壊れた控えで選択済みと待機中が同居した場合は、選択済みの潜在を優先する。
      if (monster.development.latentAbilityId !== null) monster.development.latentReselectPending = false;
      if (!(monster.development.type === null || ["ATTACK", "HP", "DEFENSE", "SUPPORT", "DISRUPT", "BALANCE"].includes(monster.development.type))) {
        monster.development.type = null;
      }
      /*
       * 能力配分の「確定」の印。
       *
       * **印を知らない旧セーブは、既に振ってあれば確定済みとして読む。**
       * ここを未確定にしてしまうと、前から遊んでいる人だけが
       * 有料リセットを回り道できる場所が残る(これを塞ぐのが今回の目的)。
       * 1点も振っていない個体は、当然そのまま無料で配れる。
       */
      if (typeof monster.development.abilityPointsConfirmed !== "boolean") {
        const used = Object.values(monster.development.abilityPoints).reduce((sum, value) => sum + value, 0);
        monster.development.abilityPointsConfirmed = used > 0;
      }
    }
  }
  if (!state.dungeonPartyIds) state.dungeonPartyIds = [];
  if (!state.clearedDungeonFloors) state.clearedDungeonFloors = [];
  if (!state.clearedBeastDungeonFloors) state.clearedBeastDungeonFloors = [];
  if (!state.clearedLevelDungeonTiers) state.clearedLevelDungeonTiers = [];
  if (!state.clearedGoldDungeonFloors) state.clearedGoldDungeonFloors = [];
  if (typeof state.summonScrolls !== "number") state.summonScrolls = 0;
  if (typeof state.fourStarSummonScrolls !== "number") state.fourStarSummonScrolls = 0;
  if (typeof state.lightDarkFourStarSummonScrolls !== "number") state.lightDarkFourStarSummonScrolls = 0;
  if (typeof state.fiveStarSummonScrolls !== "number") state.fiveStarSummonScrolls = 0;
  if (typeof state.awakeningOrbs !== "number") state.awakeningOrbs = 0;
  if (!Array.isArray(state.claimedAwakeningOrbRewardIds)) {
    state.claimedAwakeningOrbRewardIds = [];
    // ⑧-4A以前に条件を満たした控えにも、追加分を一度だけ追給する。
    const retroactiveIds: string[] = [];
    if (state.tutorialMissions.claimedIds.includes("tutorial-step-26")) retroactiveIds.push("tutorial-step-26");
    if (state.tutorialMissions.claimedIds.includes("tutorial-step-30")) retroactiveIds.push("tutorial-step-30");
    if (state.clearedDungeonFloors.some((floor) => floor >= 10)) retroactiveIds.push("equipment-dungeon-floor-10");
    if (state.trialTowerBestFloor >= 15) retroactiveIds.push("trial-tower-floor-15");
    if (state.trialTowerBestFloor >= 30) retroactiveIds.push("trial-tower-floor-30");
    state.awakeningOrbs += retroactiveIds.length;
    state.claimedAwakeningOrbRewardIds.push(...retroactiveIds);
  }
  if (typeof state.fighterLevel !== "number" || !Number.isFinite(state.fighterLevel)) state.fighterLevel = 1;
  state.fighterLevel = Math.max(1, Math.min(MAX_FIGHTER_LEVEL, Math.floor(state.fighterLevel)));
  if (typeof state.fighterExp !== "number" || !Number.isFinite(state.fighterExp) || state.fighterExp < 0) state.fighterExp = 0;
  if (state.fighterLevel >= MAX_FIGHTER_LEVEL) state.fighterExp = 0;
  state.maxStamina = maxStaminaForFighterLevel(state.fighterLevel);
  if (typeof state.stamina !== "number" || !Number.isFinite(state.stamina)) state.stamina = state.maxStamina;
  state.stamina = Math.max(0, state.stamina);
  if (typeof state.lastStaminaUpdateAt !== "number") state.lastStaminaUpdateAt = Date.now();
  if (typeof state.fighterName !== "string" || state.fighterName.length === 0) state.fighterName = DEFAULT_FIGHTER_NAME;
  if (typeof state.lastLoginBonusAt !== "number") state.lastLoginBonusAt = null;
  if (typeof state.loginBonusClaimCount !== "number") state.loginBonusClaimCount = 0;
  if (typeof state.goldDungeonChallengesToday !== "number") state.goldDungeonChallengesToday = 0;
  if (typeof state.lastGoldDungeonResetAt !== "number") state.lastGoldDungeonResetAt = null;
  if (typeof state.levelDungeonChallengesToday !== "number") state.levelDungeonChallengesToday = 0;
  if (typeof state.lastLevelDungeonResetAt !== "number") state.lastLevelDungeonResetAt = null;
  /*
   * レベル上げダンジョンが3段階(初級/中級/上級)から5階へ変わった。
   * **読み替えないと、前から遊んでいる人のクリア済みが全部消える。**
   */
  state.clearedLevelDungeonTiers = state.clearedLevelDungeonTiers.map((tier) => LEGACY_LEVEL_DUNGEON_TIERS[tier] ?? tier);
  if (typeof state.shopSlotsUnlocked !== "number") state.shopSlotsUnlocked = SHOP_INITIAL_SLOTS;
  state.shopSlotsUnlocked = Math.max(SHOP_INITIAL_SLOTS, Math.min(SHOP_MAX_SLOTS, state.shopSlotsUnlocked));
  if (typeof state.shopRotationKey !== "number") state.shopRotationKey = -1;
  if (!Array.isArray(state.shopPurchasedSlots)) state.shopPurchasedSlots = [];
  if (!Array.isArray(state.claimedCompensationIds)) state.claimedCompensationIds = [];
  // 古い控えには無い。既に遊んでいる人にも1回だけ引かせる(印が無い＝未使用)
  if (typeof state.tutorialSummonDone !== "boolean") state.tutorialSummonDone = false;

  /*
   * 装備の速度を半分に見直した調整の後追い。
   *
   * 速度は手番の数に直結するので、装備で素の速度を覆せてしまうと
   * モンスターごとの速さという個性が消える。生成側の基準値は半分にしたが、
   * **既に持っている装備は控えに数値が焼かれている**ので、ここで揃える。
   * 一度だけ走らせる(印が無い控えだけが対象)。
   */
  if (!state.equipmentSpeedRebalanced) {
    for (const equipment of state.equipment) {
      if (equipment.mainStat.type === "SPD") {
        equipment.mainStat.value = Math.max(1, Math.round(equipment.mainStat.value / 2));
      }
      for (const sub of equipment.subStats) {
        if (sub.type === "SPD") sub.value = Math.max(1, Math.round(sub.value / 2));
      }
    }
    state.equipmentSpeedRebalanced = true;
  }

  // アリーナ。古い控えには丸ごと無いので、初参加と同じ状態から始める
  if (!Array.isArray(state.arenaDefenseIds)) state.arenaDefenseIds = [];
  if (!Array.isArray(state.arenaOffenseIds)) state.arenaOffenseIds = [];
  if (typeof state.arenaPoints !== "number") state.arenaPoints = ARENA_START_POINTS;
  if (typeof state.arenaTickets !== "number") state.arenaTickets = ARENA_TICKET_MAX;
  if (typeof state.lastArenaTicketUpdateAt !== "number") state.lastArenaTicketUpdateAt = Date.now();
  // 種が0のままだと相手の抽選が動かない(0に何を掛けても0のため)
  if (typeof state.arenaOpponentSeed !== "number" || state.arenaOpponentSeed <= 0) state.arenaOpponentSeed = 1;
  // 前から遊んでいる人の控えには無い。**0から数え始める**(いきなり使い切らせない)
  if (typeof state.arenaRerollsSinceBattle !== "number" || state.arenaRerollsSinceBattle < 0) {
    state.arenaRerollsSinceBattle = 0;
  }
  /*
   * ダイヤショップ。**前から遊んでいる人の控えには無い。**
   * 無い時は空から始める(いきなり買えなくしない)。周期の控えは
   * `undefined` のままでよい——`effectivePeriodKey` が今の番号を使う。
   */
  if (!Array.isArray(state.crystalShopPurchases)) state.crystalShopPurchases = [];
  state.crystalShopPurchases = state.crystalShopPurchases.filter((entry) =>
    entry && typeof entry.itemId === "string"
    && typeof entry.periodKey === "number" && Number.isFinite(entry.periodKey)
    && typeof entry.count === "number" && entry.count > 0);
  if (typeof state.crystalShopMaxWeekKey !== "number" || !Number.isFinite(state.crystalShopMaxWeekKey)) {
    state.crystalShopMaxWeekKey = undefined;
  }
  if (typeof state.crystalShopMaxMonthKey !== "number" || !Number.isFinite(state.crystalShopMaxMonthKey)) {
    state.crystalShopMaxMonthKey = undefined;
  }
  if (typeof state.arenaPeriodKey !== "number") state.arenaPeriodKey = -1;
  if (typeof state.arenaSeasonBattles !== "number") state.arenaSeasonBattles = 0;
  if (typeof state.arenaSeasonWins !== "number") state.arenaSeasonWins = 0;
  if (typeof state.arenaSeasonBestPoints !== "number") state.arenaSeasonBestPoints = state.arenaPoints;
  /*
   * 刷新ぶん。**古い控えには丸ごと無い**ので、初参加と同じ状態から始める。
   * 型が違う値が入っていた場合も既定へ戻す(壊れた控えでアリーナが開けなくなる方が痛い)。
   */
  if (typeof state.arenaCoins !== "number" || !Number.isFinite(state.arenaCoins) || state.arenaCoins < 0) state.arenaCoins = 0;
  if (!state.arenaDefenseSnapshot || !Array.isArray(state.arenaDefenseSnapshot.units)) state.arenaDefenseSnapshot = null;
  if (!Array.isArray(state.arenaMatchHistory)) state.arenaMatchHistory = [];
  if (state.arenaMatchHistory.length > ARENA_HISTORY_MAX) state.arenaMatchHistory.length = ARENA_HISTORY_MAX;
  if (!Array.isArray(state.arenaRecentOpponentIds)) state.arenaRecentOpponentIds = [];
  if (typeof state.arenaWeeklyClaimedWeek !== "number") state.arenaWeeklyClaimedWeek = ARENA_NOT_CLAIMED;
  if (typeof state.arenaSeasonClaimedNumber !== "number") state.arenaSeasonClaimedNumber = ARENA_NOT_CLAIMED;
  if (typeof state.arenaSeasonNumber !== "number") state.arenaSeasonNumber = 0;
  if (!Array.isArray(state.arenaShopPurchases)) state.arenaShopPurchases = [];
  if (!Array.isArray(state.arenaShopFulfilledPurchaseIds)) state.arenaShopFulfilledPurchaseIds = [];
  state.arenaShopFulfilledPurchaseIds = state.arenaShopFulfilledPurchaseIds
    .filter((id): id is string => typeof id === "string" && id.length > 0)
    .slice(-500);
  if (!Array.isArray(state.arenaCosmetics)) state.arenaCosmetics = [];
  if (typeof state.arenaLocalId !== "string" || state.arenaLocalId.length < 8) state.arenaLocalId = newArenaLocalId();
  if (typeof state.arenaLastDefenseCheckAt !== "number") state.arenaLastDefenseCheckAt = 0;
  if (typeof state.arenaDefenseLossToday !== "number") state.arenaDefenseLossToday = 0;
  if (typeof state.arenaDefenseLossDate !== "string") state.arenaDefenseLossDate = "";
  if (typeof state.arenaDefenseCoinsToday !== "number") state.arenaDefenseCoinsToday = 0;
  if (typeof state.arenaDefenseCoinDate !== "string") state.arenaDefenseCoinDate = "";

  if (!Array.isArray(state.towerPartyIds)) state.towerPartyIds = [];
  if (typeof state.trialTowerBestFloor !== "number") state.trialTowerBestFloor = 0;
  if (!Array.isArray(state.trialTowerClaimedFloors)) state.trialTowerClaimedFloors = [];
  if (!state.trialTowerRun || !Array.isArray(state.trialTowerRun.members)) state.trialTowerRun = null;
  ensureTowerMonthlyState(state, now);

  // 手放したモンスターが編成に残っていると、対戦の準備で必ず落ちる
  const owned = new Set(state.monsters.map((m) => m.id));
  state.arenaDefenseIds = state.arenaDefenseIds.filter((id) => owned.has(id));
  state.arenaOffenseIds = state.arenaOffenseIds.filter((id) => owned.has(id));
  state.towerPartyIds = state.towerPartyIds.filter((id) => owned.has(id));
  /*
   * 登坂の途中で素材にされた仲間がいると、その階の並びが崩れる。
   * **1体でも欠けたら登坂ごと捨てる。**残った顔ぶれで続けさせると、
   * 「4体で登り始めたのに3体になっている」という説明のつかない状態になる。
   */
  if (state.trialTowerRun && state.trialTowerRun.members.some((m) => !owned.has(m.instanceId))) {
    state.trialTowerRun = null;
  }
  return state;
}

/** 所持モンスターの保護状態を更新する。装備ロックと同じく個体へ保存する。 */
export function setMonsterLocked(state: PlayerState, monsterId: string, locked: boolean): boolean {
  const monster = state.monsters.find((entry) => entry.id === monsterId);
  if (!monster) return false;
  monster.locked = locked;
  return true;
}

/**
 * 外から読み込んだ状態(控えファイルなど)を、今の版で扱える形に整える。
 * 古い版で書き出した控えには新しい項目が入っていないので、必ずここを通すこと。
 */
export function normalizeLoadedState(state: PlayerState, now: Date = new Date()): PlayerState {
  return normalizeState(state, now);
}

export function loadPlayerState(): PlayerState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw) as PlayerState;
    if (!parsed.monsters || parsed.monsters.length === 0) return createInitialState();
    return normalizeState(parsed);
  } catch {
    return createInitialState();
  }
}

export function savePlayerState(state: PlayerState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function addMonster(state: PlayerState, dexId: string, star: Star, level = 1): MonsterInstance {
  const instance = createMonsterInstance(dexId, star, level);
  state.monsters.push(instance);
  return instance;
}

export function removeMonsters(state: PlayerState, instanceIds: readonly string[]): void {
  const locked = new Set(state.backgroundFarmJob?.status === "RUNNING" ? state.backgroundFarmJob.partyIds : []);
  const idSet = new Set(instanceIds.filter((id) => !locked.has(id)));
  state.monsters = state.monsters.filter((m) => !idSet.has(m.id));
  state.partyIds = state.partyIds.filter((id) => !idSet.has(id));
  state.dungeonPartyIds = state.dungeonPartyIds.filter((id) => !idSet.has(id));
}

export function getParty(state: PlayerState): MonsterInstance[] {
  return state.partyIds
    .map((id) => state.monsters.find((m) => m.id === id))
    .filter((m): m is MonsterInstance => m !== undefined);
}

export function getDungeonParty(state: PlayerState): MonsterInstance[] {
  return state.dungeonPartyIds
    .map((id) => state.monsters.find((m) => m.id === id))
    .filter((m): m is MonsterInstance => m !== undefined);
}

/** 装備ダンジョン専用パーティにモンスターを追加/除外する(最大5体まで) */
export function toggleDungeonPartyMember(state: PlayerState, instanceId: string): void {
  const idx = state.dungeonPartyIds.indexOf(instanceId);
  if (idx >= 0) {
    state.dungeonPartyIds.splice(idx, 1);
    return;
  }
  if (state.dungeonPartyIds.length >= MAX_DUNGEON_PARTY_SIZE) return;
  state.dungeonPartyIds.push(instanceId);
}

export function toggleTowerPartyMember(state: PlayerState, instanceId: string): void {
  const idx = state.towerPartyIds.indexOf(instanceId);
  if (idx >= 0) {
    state.towerPartyIds.splice(idx, 1);
    return;
  }
  if (state.towerPartyIds.length >= MAX_TOWER_PARTY_SIZE) return;
  state.towerPartyIds.push(instanceId);
}

/**
 * クリア済み判定用のキーを作る。ノーマルは既存セーブとの後方互換のため素のstageIdのまま扱い、
 * ハード/ヘルだけ難易度サフィックスを付けて別枠のクリア扱いにする。
 */
function stageClearKey(stageId: string, difficulty: Difficulty): string {
  return difficulty === "NORMAL" ? stageId : `${stageId}::${difficulty}`;
}

export function isStageCleared(state: PlayerState, stageId: string, difficulty: Difficulty = "NORMAL"): boolean {
  return state.clearedStageIds.includes(stageClearKey(stageId, difficulty));
}

export function markStageCleared(state: PlayerState, stageId: string, difficulty: Difficulty = "NORMAL"): void {
  const key = stageClearKey(stageId, difficulty);
  if (!state.clearedStageIds.includes(key)) {
    state.clearedStageIds.push(key);
  }
}

export function isDungeonFloorCleared(state: PlayerState, floor: number, kind: EquipmentDungeonKind = "DEMON"): boolean {
  return (kind === "BEAST" ? (state.clearedBeastDungeonFloors ?? []) : state.clearedDungeonFloors).includes(floor);
}

export function markDungeonFloorCleared(state: PlayerState, floor: number, kind: EquipmentDungeonKind = "DEMON"): void {
  const cleared = kind === "BEAST" ? (state.clearedBeastDungeonFloors ??= []) : state.clearedDungeonFloors;
  if (!cleared.includes(floor)) {
    cleared.push(floor);
  }
}

export function isLevelDungeonTierCleared(state: PlayerState, tier: string): boolean {
  return state.clearedLevelDungeonTiers.includes(tier);
}

export function markLevelDungeonTierCleared(state: PlayerState, tier: string): void {
  if (!state.clearedLevelDungeonTiers.includes(tier)) {
    state.clearedLevelDungeonTiers.push(tier);
  }
}

/** 初回クリアなら200ダイヤ確定。2回目以降は低確率(3%)で50ダイヤがもらえる */
export const FIRST_CLEAR_CRYSTAL_REWARD = 200;
export const REPEAT_CLEAR_CRYSTAL_CHANCE = 0.03;
export const REPEAT_CLEAR_CRYSTAL_REWARD = 50;

export function addEquipment(state: PlayerState, equipment: Equipment): void {
  state.equipment.push(equipment);
}

/** 装備がどこかのモンスターに装着中かどうか */
export function isEquipmentEquipped(state: PlayerState, equipmentId: string): boolean {
  return state.monsters.some((m) => Object.values(m.equipment).includes(equipmentId));
}

export function findEquippedOwner(state: PlayerState, equipmentId: string): MonsterInstance | undefined {
  return state.monsters.find((m) => Object.values(m.equipment).includes(equipmentId));
}

/** 装備をモンスターのスロットに装着する。スロット不一致・所持外は失敗しfalseを返す */
export function equipToMonster(state: PlayerState, monsterId: string, equipmentId: string): boolean {
  const monster = state.monsters.find((m) => m.id === monsterId);
  const equipment = state.equipment.find((e) => e.id === equipmentId);
  if (!monster || !equipment) return false;

  // 他のモンスターに装着中なら先に外す
  for (const other of state.monsters) {
    if (other.id === monster.id) continue;
    const slot = (Object.entries(other.equipment) as [string, string][]).find(([, id]) => id === equipmentId)?.[0];
    if (slot) delete other.equipment[Number(slot) as EquipSlot];
  }

  monster.equipment[equipment.slot] = equipment.id;
  return true;
}

export function unequipFromMonster(state: PlayerState, monsterId: string, slot: EquipSlot): void {
  const monster = state.monsters.find((m) => m.id === monsterId);
  if (!monster) return;
  delete monster.equipment[slot];
}

export function getEquipmentById(state: PlayerState, equipmentId: string): Equipment | undefined {
  return state.equipment.find((e) => e.id === equipmentId);
}

export interface EnhanceResult {
  ok: boolean;
  reason?: string;
}

/** 所持ゴールドを消費して装備を1レベル強化する */
export function tryEnhanceEquipment(state: PlayerState, equipmentId: string, rng?: () => number): EnhanceResult {
  const equipment = state.equipment.find((e) => e.id === equipmentId);
  if (!equipment) return { ok: false, reason: "装備が見つかりません" };
  if (!canEnhanceEquipment(equipment)) return { ok: false, reason: "最大強化レベルに達しています" };

  const cost = enhanceEquipmentCost(equipment);
  if (state.gold < cost) return { ok: false, reason: "ゴールドが足りません" };

  state.gold -= cost;
  enhanceEquipment(equipment, rng);
  return { ok: true };
}

/** スタミナが1回復するまでの実時間(分)。時間経過で自然回復する */
export const STAMINA_REGEN_INTERVAL_MINUTES = 3;

/**
 * 最後に計算した時刻からの経過時間に応じてスタミナを自然回復させる。
 * 消費したぶんの時間だけ基準時刻を進める(端数の経過時間は次回に持ち越す)。
 */
export function applyPassiveStaminaRegen(state: PlayerState, now: number = Date.now()): void {
  if (state.stamina >= state.maxStamina) {
    state.lastStaminaUpdateAt = now;
    return;
  }
  const intervalMs = STAMINA_REGEN_INTERVAL_MINUTES * 60_000;
  const elapsedTicks = Math.floor((now - state.lastStaminaUpdateAt) / intervalMs);
  if (elapsedTicks <= 0) return;

  const gained = Math.min(elapsedTicks, state.maxStamina - state.stamina);
  state.stamina += gained;
  state.lastStaminaUpdateAt += elapsedTicks * intervalMs;
}

export interface StaminaSpendResult {
  ok: boolean;
  reason?: string;
}

/** スタミナが足りていれば消費する(挑戦開始時に呼ぶ)。呼ぶ前に自然回復を反映する */
export function trySpendStamina(state: PlayerState, cost: number): StaminaSpendResult {
  applyPassiveStaminaRegen(state);
  if (state.stamina < cost) return { ok: false, reason: "スタミナが足りません" };
  state.stamina -= cost;
  return { ok: true };
}

/** ダイヤ50でスタミナ100回復。配布と同じく現在上限を超えて保持できる */
export const STAMINA_REFILL_PARTIAL_COST = 50;
export const STAMINA_REFILL_PARTIAL_AMOUNT = 100;
/** ダイヤ200でスタミナ全回復 */
export const STAMINA_REFILL_FULL_COST = 200;

export interface StaminaRefillResult {
  ok: boolean;
  reason?: string;
}

/** ダイヤを消費してスタミナを100回復する。呼ぶ前に自然回復を反映する */
export function tryRefillStaminaPartial(state: PlayerState): StaminaRefillResult {
  applyPassiveStaminaRegen(state);
  if (state.crystal < STAMINA_REFILL_PARTIAL_COST) return { ok: false, reason: "ダイヤが足りません" };
  state.crystal -= STAMINA_REFILL_PARTIAL_COST;
  state.stamina += STAMINA_REFILL_PARTIAL_AMOUNT;
  return { ok: true };
}

/** ダイヤを消費してスタミナを全回復する。呼ぶ前に自然回復を反映する */
export function tryRefillStaminaFull(state: PlayerState): StaminaRefillResult {
  applyPassiveStaminaRegen(state);
  if (state.stamina >= state.maxStamina) return { ok: false, reason: "スタミナは既に満タンです" };
  if (state.crystal < STAMINA_REFILL_FULL_COST) return { ok: false, reason: "ダイヤが足りません" };
  state.crystal -= STAMINA_REFILL_FULL_COST;
  state.stamina = state.maxStamina;
  return { ok: true };
}

export interface FighterExpResult {
  levelsGained: number;
}

/** ファイターレベルが1上がるごとにもらえるダイヤ */
export const FIGHTER_LEVEL_UP_CRYSTAL_REWARD = 300;

/**
 * ファイター経験値を加算し、可能な限りレベルアップさせる。
 * レベルアップのたびにスタミナ上限が上がり、スタミナは全回復し、ダイヤも獲得する。
 */
export function addFighterExp(state: PlayerState, exp: number): FighterExpResult {
  if (state.fighterLevel >= MAX_FIGHTER_LEVEL || exp <= 0) return { levelsGained: 0 };

  const staminaBefore = state.stamina;
  state.fighterExp += exp;
  let levelsGained = 0;
  while (state.fighterLevel < MAX_FIGHTER_LEVEL && state.fighterExp >= requiredExpForFighterLevel(state.fighterLevel)) {
    state.fighterExp -= requiredExpForFighterLevel(state.fighterLevel);
    state.fighterLevel += 1;
    state.maxStamina = maxStaminaForFighterLevel(state.fighterLevel);
    state.stamina = state.maxStamina;
    levelsGained += 1;
  }
  if (state.fighterLevel >= MAX_FIGHTER_LEVEL) {
    state.fighterLevel = MAX_FIGHTER_LEVEL;
    state.fighterExp = 0;
  }
  if (levelsGained > 0) {
    state.stamina = Math.max(state.stamina, staminaBefore);
    state.crystal += FIGHTER_LEVEL_UP_CRYSTAL_REWARD * levelsGained;
  }
  return { levelsGained };
}

/** 毎日のログインボーナス(ダイヤ200)。10日分(累計)受け取るごとに追加でダイヤ1000がもらえる */
export const LOGIN_BONUS_DAILY_CRYSTAL = 200;
/**
 * 初回だけの開始祝い。
 *
 * 始めたばかりの手持ちは星1が4体で、ステージ1-1でも危うい。
 * そこから毎日200ずつ貯めて900の10連に届くまで4日かかるのでは、
 * **最初の日に「引く」という体験がまったく無い。**
 * 10連を3回分ぶん渡して、初日に手持ちを組めるようにする。
 */
export const LOGIN_BONUS_FIRST_TIME_CRYSTAL = 3000;
export const LOGIN_BONUS_MILESTONE_CRYSTAL = 1000;
export const LOGIN_BONUS_MILESTONE_INTERVAL_DAYS = 10;

export interface LoginBonusResult {
  claimed: boolean;
  dailyCrystal: number;
  milestoneCrystal: number;
  /** 初回だけの開始祝い。2日目以降は0 */
  firstTimeCrystal: number;
  claimCount: number;
}

/**
 * まだその日のログインボーナスを受け取っていなければ付与する(カレンダー日の変わり目で判定)。
 * 受け取った累計日数が10の倍数に達するたびに追加でダイヤ1000が付与される。
 */
export function claimDailyLoginBonus(state: PlayerState, now: number = Date.now()): LoginBonusResult {
  const alreadyClaimedToday = state.lastLoginBonusAt !== null && new Date(state.lastLoginBonusAt).toDateString() === new Date(now).toDateString();
  if (alreadyClaimedToday) {
    return { claimed: false, dailyCrystal: 0, milestoneCrystal: 0, firstTimeCrystal: 0, claimCount: state.loginBonusClaimCount };
  }

  state.lastLoginBonusAt = now;
  state.loginBonusClaimCount += 1;
  const milestoneCrystal = state.loginBonusClaimCount % LOGIN_BONUS_MILESTONE_INTERVAL_DAYS === 0 ? LOGIN_BONUS_MILESTONE_CRYSTAL : 0;
  // 初回だけの開始祝い。10日目の節目と重なっても両方渡す(初日は1日目なので実際には重ならない)
  const firstTimeCrystal = state.loginBonusClaimCount === 1 ? LOGIN_BONUS_FIRST_TIME_CRYSTAL : 0;
  state.crystal += LOGIN_BONUS_DAILY_CRYSTAL + milestoneCrystal + firstTimeCrystal;

  return {
    claimed: true,
    dailyCrystal: LOGIN_BONUS_DAILY_CRYSTAL,
    milestoneCrystal,
    firstTimeCrystal,
    claimCount: state.loginBonusClaimCount,
  };
}

export function addSummonScrolls(state: PlayerState, count = 1): void {
  state.summonScrolls += count;
}

/** 召喚の書を1個消費できるなら消費してtrueを返す(石を使わずに1回分の召喚権を得る) */
export function tryUseSummonScroll(state: PlayerState): boolean {
  return trySpendSummonScrolls(state, 1);
}

/**
 * 召喚の書をまとめて消費する。足りなければ**1枚も減らさずに**falseを返す。
 * 中途半端に減らすと、引けないのに手持ちだけ消える事故になる。
 */
export function trySpendSummonScrolls(state: PlayerState, count: number): boolean {
  if (count <= 0 || state.summonScrolls < count) return false;
  state.summonScrolls -= count;
  return true;
}

/** 日付が変わっていたらゴールドダンジョンの本日の挑戦回数をリセットする(カレンダー日の変わり目で判定) */
function resetGoldDungeonChallengesIfNewDay(state: PlayerState, now: number): void {
  const isNewDay =
    state.lastGoldDungeonResetAt === null || new Date(state.lastGoldDungeonResetAt).toDateString() !== new Date(now).toDateString();
  if (isNewDay) {
    state.goldDungeonChallengesToday = 0;
    state.lastGoldDungeonResetAt = now;
  }
}

/** ゴールドダンジョンの本日の残り挑戦回数 */
export function goldDungeonChallengesRemaining(state: PlayerState, now: number = Date.now()): number {
  resetGoldDungeonChallengesIfNewDay(state, now);
  return Math.max(0, GOLD_DUNGEON_DAILY_LIMIT - state.goldDungeonChallengesToday);
}

export interface GoldDungeonChallengeResult {
  ok: boolean;
  reason?: string;
}

/** ゴールドダンジョンへの挑戦権を1回消費する(スタミナとは別に、1日GOLD_DUNGEON_DAILY_LIMIT回までの制限を課す) */
export function trySpendGoldDungeonChallenge(state: PlayerState, now: number = Date.now()): GoldDungeonChallengeResult {
  resetGoldDungeonChallengesIfNewDay(state, now);
  if (state.goldDungeonChallengesToday >= GOLD_DUNGEON_DAILY_LIMIT) {
    return { ok: false, reason: "本日のゴールドダンジョン挑戦回数の上限に達しています" };
  }
  state.goldDungeonChallengesToday += 1;
  return { ok: true };
}

/** 日付が変わっていたらレベル上げダンジョンの本日の挑戦回数をリセットする */
function resetLevelDungeonChallengesIfNewDay(state: PlayerState, now: number): void {
  const isNewDay =
    state.lastLevelDungeonResetAt === null || new Date(state.lastLevelDungeonResetAt).toDateString() !== new Date(now).toDateString();
  if (isNewDay) {
    state.levelDungeonChallengesToday = 0;
    state.lastLevelDungeonResetAt = now;
  }
}

/** レベル上げダンジョンの本日の残り挑戦回数 */
export function levelDungeonChallengesRemaining(state: PlayerState, now: number = Date.now()): number {
  resetLevelDungeonChallengesIfNewDay(state, now);
  return Math.max(0, LEVEL_DUNGEON_DAILY_LIMIT - state.levelDungeonChallengesToday);
}

/** レベル上げダンジョンへの挑戦権を1回消費する(スタミナとは別枠の1日の上限) */
export function trySpendLevelDungeonChallenge(state: PlayerState, now: number = Date.now()): GoldDungeonChallengeResult {
  resetLevelDungeonChallengesIfNewDay(state, now);
  if (state.levelDungeonChallengesToday >= LEVEL_DUNGEON_DAILY_LIMIT) {
    return { ok: false, reason: "本日のレベル上げダンジョン挑戦回数の上限に達しています" };
  }
  state.levelDungeonChallengesToday += 1;
  return { ok: true };
}

export interface SellEquipmentResult {
  ok: boolean;
  reason?: string;
  goldEarned: number;
}

export function setEquipmentLocked(state: PlayerState, equipmentId: string, locked: boolean): boolean {
  const equipment = state.equipment.find((e) => e.id === equipmentId);
  if (!equipment) return false;
  equipment.locked = locked;
  return true;
}

/** 装備を売却してゴールドを得る。装着中の装備は先に外す必要がある */
export function sellEquipment(state: PlayerState, equipmentId: string): SellEquipmentResult {
  const equipment = state.equipment.find((e) => e.id === equipmentId);
  if (!equipment) return { ok: false, reason: "装備が見つかりません", goldEarned: 0 };
  if (equipment.locked) return { ok: false, reason: "ロック中の装備は売却できません", goldEarned: 0 };
  if (isEquipmentEquipped(state, equipmentId)) {
    return { ok: false, reason: "装着中の装備は売却できません(先に外してください)", goldEarned: 0 };
  }

  const goldEarned = equipmentSellPrice(equipment);
  state.equipment = state.equipment.filter((e) => e.id !== equipmentId);
  state.gold += goldEarned;
  return { ok: true, goldEarned };
}

// ---------------------------------------------------------------- ショップ

export interface ShopView {
  entries: ShopEntry[];
  /** 開いている枠の数 */
  slots: number;
  /** 今の品揃えで購入済みの枠の番号 */
  purchasedSlots: number[];
  /** 次の入れ替え時刻(ミリ秒epoch) */
  nextRotationAt: number;
  /** 次の枠を開けるのに要るダイヤ。もう開けられないなら null */
  nextSlotCost: number | null;
}

/**
 * 今のショップを取り出す。
 *
 * 品揃えは時刻から決定的に作るので保存しない。保存するのは
 * 「どの品揃えの、どの枠を買ったか」だけで、時間帯が変わったら購入済みを流す。
 */
export function getShop(state: PlayerState, now = Date.now()): ShopView {
  const key = rotationKeyAt(now);
  if (state.shopRotationKey !== key) {
    state.shopRotationKey = key;
    state.shopPurchasedSlots = [];
  }
  const lineup = buildShopLineup(now, state.fighterLevel, state.shopSlotsUnlocked);
  return {
    entries: lineup.entries,
    slots: state.shopSlotsUnlocked,
    purchasedSlots: [...state.shopPurchasedSlots],
    nextRotationAt: lineup.nextRotationAt,
    nextSlotCost: nextSlotUnlockCost(state.shopSlotsUnlocked),
  };
}

export interface ShopPurchaseResult {
  ok: boolean;
  reason?: string;
  /** 買ったものの説明(結果表示用) */
  label?: string;
}

/** ショップの1枠を買う。ゴールドを払って中身を所持品へ入れる */
export function buyShopEntry(state: PlayerState, slotIndex: number, now = Date.now()): ShopPurchaseResult {
  const shop = getShop(state, now);
  const entry = shop.entries[slotIndex];
  if (!entry) return { ok: false, reason: "その枠は開いていません" };
  if (state.shopPurchasedSlots.includes(slotIndex)) return { ok: false, reason: "すでに購入済みです" };
  if (state.gold < entry.price) return { ok: false, reason: "ゴールドが足りません" };

  state.gold -= entry.price;
  state.shopPurchasedSlots.push(slotIndex);

  switch (entry.kind) {
    case "EQUIPMENT":
      addEquipment(state, entry.equipment);
      return { ok: true, label: `星${entry.equipment.star}の装備を購入しました` };
    case "MONSTER": {
      addMonster(state, entry.dexId, entry.star);
      return { ok: true, label: `星${entry.star}のモンスターを購入しました` };
    }
    case "SCROLL":
      addSummonScrolls(state, entry.count);
      return { ok: true, label: `召喚の書を${entry.count}個購入しました` };
  }
}

/** ダイヤを払ってショップの枠を1つ増やす */
export function unlockShopSlot(state: PlayerState): { ok: boolean; reason?: string } {
  const cost = nextSlotUnlockCost(state.shopSlotsUnlocked);
  if (cost === null) return { ok: false, reason: "これ以上は開放できません" };
  if (state.crystal < cost) return { ok: false, reason: "ダイヤが足りません" };
  state.crystal -= cost;
  state.shopSlotsUnlocked += 1;
  return { ok: true };
}
