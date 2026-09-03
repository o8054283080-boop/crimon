/**
 * アリーナの画面が使う「組み立て」だけを集めた場所。**DOMを一切触らない。**
 *
 * ## なぜ描画と分けるのか
 *
 * この案件のテストには DOM が無い(jsdom を入れていない)。そのため
 * 画面のことを確かめようとすると、これまでは**ソースの文字列検査**へ逃げるしかなく、
 * 「その文字が書いてある」ことしか言えなかった。文字が書いてあることと、
 * 未登録の防衛でも落ちないことは別の話で、実際に落ちる方は素通りする。
 *
 * ここに「何を出すか」を全部置き、描画側は**受け取った物を並べるだけ**にする。
 * そうすると、次のような**画面を通さないと分からないこと**が関数呼び出しで確かめられる:
 *
 *   ・防衛が未登録(null)でもトップの組み立てが落ちない
 *   ・未接続のとき順位に嘘(「1位」や「—」)を出さない
 *   ・リベンジできない理由が、全種類ちゃんと日本語になっている
 *   ・NPCの1体から Lv/★/ステータス/装備/能力ポイント/潜在覚醒が全部引ける
 *
 * ## 数字の出どころを画面で作らない
 *
 * レート・コイン・購入上限は `game/arena/*` が決める。ここがやるのは
 * **並べ替えと言い換えだけ**で、加減算はしない(1か所でも足すと、
 * 「画面が言い張れば通る経路」がそこに開く)。
 */
import { ELEMENT_JA } from "../../../core/element.js";
import {
  Equipment,
  SET_LABEL,
  SLOT_LABEL,
  formatStatValue,
} from "../../../core/equipment.js";
import { MonsterDefinition } from "../../../core/monster.js";
import {
  MonsterInstance,
  resolveEquippedItems,
  toBattleDefinition,
} from "../../../core/monsterInstance.js";
import {
  ABILITY_POINT_BUDGETS,
  AllocatableStat,
  MONSTER_TYPE_LABELS,
} from "../../../core/monsterDevelopment.js";
import { STAR_MAX_LEVEL } from "../../../core/rarity.js";
import { findMonsterById } from "../../../data/monsters.js";
import { LATENT_ABILITY_CANDIDATES } from "../../../data/latentAbilities.js";
import { ArenaTier, arenaNextTier, arenaTierForRating } from "../../../data/arena/ranks.js";
import { ArenaShopItem } from "../../../data/arena/shop.js";
import { arenaCompressedSpeed } from "../../../data/pvpArena.js";
import { PlayerState } from "../../../game/playerState.js";
import { ArenaShopRow } from "../../../game/arena/shop.js";
import { arenaPeriodInfo, canClaimArenaWeekly } from "../../../game/arena/progress.js";
import {
  ArenaDefenseSnapshot,
  ArenaMatchRecord,
  ArenaOpponentEntry,
  ArenaRevengeBlock,
  ArenaUnitSnapshot,
} from "../../../game/arena/types.js";
import { snapshotToDefinitions } from "../../../game/arena/snapshot.js";
import { ArenaRankingEntry } from "../../../net/arenaSync.js";

/* ==========================================================================
 * 画面の場所
 * ========================================================================== */

/**
 * アリーナの中の居場所。
 *
 * **浮かせた小窓を作らない**ため、詳細も「別の場所」として持つ。
 * この案件では `position:fixed` / `absolute` の札が押せないボタンを作る事故を
 * 3回出しているので、重ねるのではなく行き先を増やす方を選んでいる。
 */
export type ArenaViewName =
  | "TOP"
  | "OPPONENTS"
  | "OPPONENT_DETAIL"
  | "DEFENSE"
  | "OFFENSE_TEAM"
  | "RANKING"
  | "SHOP"
  | "HISTORY";

/* ==========================================================================
 * 時間と日付
 * ========================================================================== */

/** 残り時間を「2日3時間」「45分」の形にする。秒は読む人には要らない */
export function formatArenaDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "まもなく";
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `${minutes}分`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (hours < 24) return restMinutes === 0 ? `${hours}時間` : `${hours}時間${restMinutes}分`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours === 0 ? `${days}日` : `${days}日${restHours}時間`;
}

/**
 * 記録の時刻。**「3分前」ではなく日時で出す。**
 *
 * 防衛は自分が見ていない時に起きるので、「いつ攻められたか」は
 * 相対時間より絶対時刻の方が役に立つ(寝ている間か、出かけている間か)。
 */
export function formatArenaDateTime(at: number): string {
  if (!Number.isFinite(at) || at <= 0) return "不明";
  const date = new Date(at);
  const two = (value: number) => String(value).padStart(2, "0");
  return `${date.getMonth() + 1}/${date.getDate()} ${two(date.getHours())}:${two(date.getMinutes())}`;
}

/* ==========================================================================
 * 順位。**未接続のときに嘘をつかない**
 * ========================================================================== */

export interface ArenaStandingView {
  /** 全国順位を名乗ってよいか */
  online: boolean;
  /** 大きく出す文字 */
  label: string;
  /** その下の小さい説明 */
  note: string;
}

/**
 * 現在順位の出し方。
 *
 * **未接続で「—」や「1位」を出さない。** 「—」は「順位が付いていない」と
 * 読めてしまい、「1位」は完全な嘘になる。オフラインでは順位という枠自体を
 * 名乗らず、「ローカル」と書いて、何を見ているのかを正直に言う。
 */
export function arenaStandingView(online: boolean, myRank: number | null): ArenaStandingView {
  if (!online) {
    return {
      online: false,
      label: "ローカル",
      note: "この端末の中だけの記録です。全国順位はオンライン接続時に出ます",
    };
  }
  if (myRank === null || !Number.isFinite(myRank) || myRank <= 0) {
    return { online: true, label: "未掲載", note: "1戦するとランキングに載ります" };
  }
  return { online: true, label: `${myRank}位`, note: "全国順位" };
}

/* ==========================================================================
 * リベンジできない理由
 * ========================================================================== */

/**
 * リベンジできない理由の文言。
 *
 * `NOT_DEFENSE` だけ null にしてある。**攻撃の記録に「防衛ではありません」と
 * 出しても情報が無い**(そもそもリベンジの対象として並べない)。
 * 画面は null を「この行にリベンジの枠を作らない」と読む。
 */
export function arenaRevengeReasonText(block: ArenaRevengeBlock): string | null {
  switch (block) {
    case "ALREADY":
      return "リベンジ済み";
    case "WON":
      return "防衛に成功しています";
    case "NO_TICKET":
      return "挑戦券が足りません";
    case "NOT_DEFENSE":
      return null;
    case null:
      return null;
  }
}

/* ==========================================================================
 * 1体ぶんの中身
 *
 * **依頼で特に重い項目。** 上位の相手を「育成のお手本」にできることが目的なので、
 * 見えるべきものを削らない: Lv / ★ / ステータス / 装備(種類・レア・強化値・
 * メインOP・サブOP)/ 能力ポイント / 潜在覚醒。
 * ========================================================================== */

export interface ArenaEquipmentView {
  slotLabel: string;
  setLabel: string;
  star: number;
  /** 強化レベル(0〜15) */
  level: number;
  mainText: string;
  subTexts: string[];
}

export interface ArenaUnitStatLine {
  label: string;
  value: string;
}

export interface ArenaUnitDetailView {
  /** 図鑑に載っている名前。消えた個体でも空にしない */
  name: string;
  emoji: string;
  color: string;
  elementLabel: string;
  star: number;
  level: number;
  maxLevel: number;
  /** タイプ転生。未設定なら null */
  typeLabel: string | null;
  skillLevels: number[];
  /** 装備込みの最終ステータス。図鑑から消えた個体では空になる */
  stats: ArenaUnitStatLine[];
  equipment: ArenaEquipmentView[];
  /** 装備している数(6枠のうち) */
  equippedCount: number;
  /** 能力ポイント。星4未満は上限0なので、その時は割り振り自体が無い */
  abilityPoints: { label: string; value: number }[];
  abilityPointUsed: number;
  abilityPointBudget: number;
  /** 潜在覚醒。未覚醒なら null */
  latent: { name: string; description: string } | null;
  /** 図鑑から引けなかった(データから消えた等)。画面はここを見て断る */
  missing: boolean;
}

const ABILITY_LABELS: Record<AllocatableStat, string> = { hp: "HP", atk: "攻撃", def: "防御", spd: "速度" };

function statLines(def: MonsterDefinition): ArenaUnitStatLine[] {
  const stats = def.stats;
  return [
    { label: "HP", value: Math.round(stats.hp).toLocaleString("ja-JP") },
    { label: "攻撃", value: Math.round(stats.atk).toLocaleString("ja-JP") },
    { label: "防御", value: Math.round(stats.def).toLocaleString("ja-JP") },
    { label: "速度", value: String(Math.round(stats.spd)) },
    { label: "クリ率", value: `${Math.round(stats.criRate * 100)}%` },
    { label: "クリダメ", value: `+${Math.round((stats.criDmg - 1) * 100)}%` },
    { label: "効果命中", value: `${Math.round(stats.accuracy * 100)}%` },
    { label: "効果抵抗", value: `${Math.round(stats.resistance * 100)}%` },
  ];
}

function equipmentView(item: Equipment): ArenaEquipmentView {
  return {
    slotLabel: SLOT_LABEL[item.slot] ?? `スロット${item.slot}`,
    setLabel: SET_LABEL[item.set] ?? String(item.set),
    star: item.star,
    level: item.level,
    mainText: formatStatValue(item.mainStat),
    subTexts: (item.subStats ?? []).map(formatStatValue),
  };
}

/** 潜在覚醒のIDから名前を引く。**候補表に無いIDは黙って捨てる**(嘘の名前を作らない) */
export function arenaLatentView(dexId: string, latentId: string | null | undefined): { name: string; description: string } | null {
  if (!latentId) return null;
  const found = (LATENT_ABILITY_CANDIDATES[dexId] ?? []).find((candidate) => candidate.id === latentId);
  return found ? { name: found.name, description: found.description } : null;
}

/**
 * 相手の1体を、そのまま真似できるだけの情報にほどく。
 *
 * **図鑑から引けなくても落とさない。** 1体壊れただけで相手の詳細が丸ごと
 * 開かなくなると、「見ることすらできない相手」が生まれる。
 */
export function arenaUnitDetailView(unit: ArenaUnitSnapshot): ArenaUnitDetailView {
  const instance = unit.instance;
  const equipment = Array.isArray(unit.equipment) ? unit.equipment : [];
  const dex = findMonsterById(instance.dexId);
  const development = instance.development;
  const points = development?.abilityPoints ?? { hp: 0, atk: 0, def: 0, spd: 0 };
  const abilityPoints = (Object.keys(ABILITY_LABELS) as AllocatableStat[]).map((key) => ({
    label: ABILITY_LABELS[key],
    value: Math.max(0, Math.round(points[key] ?? 0)),
  }));

  return {
    name: dex ? dex.name : instance.dexId,
    emoji: dex ? dex.emoji : "❓",
    color: dex ? dex.color : "#8a8397",
    elementLabel: dex ? ELEMENT_JA[dex.element] : "不明",
    star: instance.star,
    level: instance.level,
    maxLevel: STAR_MAX_LEVEL[instance.star] ?? instance.level,
    typeLabel: development?.type ? MONSTER_TYPE_LABELS[development.type] : null,
    skillLevels: Array.isArray(instance.skillLevels) ? [...instance.skillLevels] : [],
    stats: dex ? statLines(toBattleDefinition(instance, dex, equipment)) : [],
    equipment: equipment.map(equipmentView),
    equippedCount: equipment.length,
    abilityPoints,
    abilityPointUsed: abilityPoints.reduce((sum, entry) => sum + entry.value, 0),
    abilityPointBudget: ABILITY_POINT_BUDGETS[instance.star] ?? 0,
    latent: arenaLatentView(instance.dexId, development?.latentAbilityId),
    missing: !dex,
  };
}

/* ==========================================================================
 * 防衛
 * ========================================================================== */

export interface ArenaDefenseView {
  registered: boolean;
  /** 「いつ登録したか」。未登録なら null */
  capturedText: string | null;
  unitCount: number;
  /** 実際に戦える数。0なら登録されていても相手に出ない */
  usableCount: number;
  units: ArenaUnitDetailView[];
}

/**
 * 防衛の要約。**null(未登録)を必ず受け取れること。**
 *
 * 未登録は珍しい状態ではなく、**全員が最初に必ず通る状態**なので、
 * ここが落ちるとアリーナが誰にも開けなくなる。
 */
export function arenaDefenseView(snapshot: ArenaDefenseSnapshot | null | undefined): ArenaDefenseView {
  const units = snapshot && Array.isArray(snapshot.units) ? snapshot.units : [];
  return {
    registered: units.length > 0,
    capturedText: snapshot && snapshot.capturedAt > 0 ? formatArenaDateTime(snapshot.capturedAt) : null,
    unitCount: units.length,
    usableCount: snapshot ? snapshotToDefinitions({ ...snapshot, units }).length : 0,
    units: units.map(arenaUnitDetailView),
  };
}

/* ==========================================================================
 * 対戦候補
 * ========================================================================== */

export interface ArenaOpponentView {
  index: number;
  id: string;
  name: string;
  isNpc: boolean;
  rating: number;
  tier: ArenaTier;
  archetypeName: string | null;
  archetypeNote: string | null;
  /** 自分との差。正なら格上 */
  diff: number;
  diffText: string;
  units: { name: string; emoji: string; color: string; star: number; level: number }[];
  /** 戦える編成か。0体なら挑戦させない */
  usable: boolean;
}

export function arenaOpponentView(entry: ArenaOpponentEntry, myRating: number): ArenaOpponentView {
  const units = Array.isArray(entry.defense?.units) ? entry.defense.units : [];
  const diff = entry.rating - myRating;
  return {
    index: entry.index,
    id: entry.id,
    name: entry.name,
    isNpc: entry.kind === "NPC",
    rating: entry.rating,
    tier: arenaTierForRating(entry.rating),
    archetypeName: entry.archetypeName ?? null,
    archetypeNote: entry.archetypeNote ?? null,
    diff,
    diffText: diff >= 0 ? `格上 +${diff}` : `格下 ${diff}`,
    units: units.map((unit) => {
      const dex = findMonsterById(unit.instance.dexId);
      return {
        name: dex ? dex.name : unit.instance.dexId,
        emoji: dex ? dex.emoji : "❓",
        color: dex ? dex.color : "#8a8397",
        star: unit.instance.star,
        level: unit.instance.level,
      };
    }),
    usable: units.length > 0 && snapshotToDefinitions(entry.defense).length > 0,
  };
}

/* ==========================================================================
 * ランキング
 * ========================================================================== */

export interface ArenaRankingView {
  online: boolean;
  /** 出せない時の理由。出せるなら null */
  unavailableText: string | null;
  top: ArenaRankingEntry[];
  around: ArenaRankingEntry[];
  /** 自分の順位(周辺の行から引く)。無ければ null */
  myRank: number | null;
}

/**
 * ランキングの組み立て。
 *
 * **空の表を出さない。** 行が0のランキングは「誰も居ない」ように見えるが、
 * 実際には「繋がっていないので分からない」であって、意味がまるで違う。
 * 出せない時は理由を書いて、表そのものを出さない。
 *
 * NPCはここに一切現れない(`fetchArenaRanking` が実プレイヤーだけを返す)。
 * 画面側でNPCを混ぜないこと——順位は実在の人だけのものにする。
 */
export function arenaRankingView(input: {
  online: boolean;
  loading: boolean;
  top: readonly ArenaRankingEntry[];
  around: readonly ArenaRankingEntry[];
  myUserId: string | null;
}): ArenaRankingView {
  if (!input.online) {
    return {
      online: false,
      unavailableText: "ランキングはオンライン接続時のみ表示できます",
      top: [],
      around: [],
      myRank: null,
    };
  }
  if (input.loading) {
    return { online: true, unavailableText: "読み込み中…", top: [], around: [], myRank: null };
  }
  const top = [...input.top];
  const around = [...input.around];
  if (top.length === 0 && around.length === 0) {
    return {
      online: true,
      unavailableText: "まだ誰もランキングに載っていません",
      top: [],
      around: [],
      myRank: null,
    };
  }
  const mine = input.myUserId
    ? [...around, ...top].find((entry) => entry.userId === input.myUserId) ?? null
    : null;
  return { online: true, unavailableText: null, top, around, myRank: mine ? mine.rank : null };
}

/* ==========================================================================
 * ショップ
 * ========================================================================== */

export interface ArenaShopRowView {
  item: ArenaShopItem;
  priceText: string;
  periodText: string;
  remaining: number;
  remainingText: string;
  disabled: boolean;
  /** 押せない理由。押せるなら null。**押せないことだけを見せない** */
  disabledReason: string | null;
}

/**
 * 棚の1行。
 *
 * **押せない理由を必ず添える。** 上限なのかコイン不足なのかで、
 * 次にやること(来週まで待つ / 戦ってコインを貯める)がまるで違う。
 */
export function arenaShopRowView(row: ArenaShopRow, coins: number): ArenaShopRowView {
  const period = row.item.period === "WEEKLY" ? "週" : row.item.period === "MONTHLY" ? "月" : "シーズン";
  const soldOut = row.remaining <= 0;
  const poor = coins < row.item.price;
  return {
    item: row.item,
    priceText: `🎫 ${row.item.price.toLocaleString("ja-JP")}`,
    periodText: `${period}${row.item.limit}回まで`,
    remaining: row.remaining,
    remainingText: soldOut ? `今${period}のぶんは売り切れ` : `残り ${row.remaining} / ${row.item.limit}`,
    disabled: soldOut || poor,
    disabledReason: soldOut
      ? `今${period}の上限に達しています`
      : poor
        ? `アリーナコインが ${(row.item.price - coins).toLocaleString("ja-JP")} 足りません`
        : null,
  };
}

/* ==========================================================================
 * トップ
 * ========================================================================== */

export interface ArenaTopView {
  rating: number;
  tier: ArenaTier;
  /** 次のランクまで。最上位なら null */
  next: { name: string; remaining: number } | null;
  /** 帯の中でどこまで進んだか(0〜1) */
  progress: number;
  standing: ArenaStandingView;
  tickets: { count: number; max: number; nextText: string };
  coins: number;
  seasonNumber: number;
  seasonRemainingText: string;
  weekOfSeason: number;
  totalWeeks: number;
  weekRemainingText: string;
  weeklyClaimable: boolean;
  battles: number;
  wins: number;
  winRateText: string | null;
  defense: ArenaDefenseView;
  /** 未読ではなく「まだ見ていない防衛戦」の数。0なら出さない */
  defenseLosses: number;
}

function safeNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * トップに出すものを1回でまとめる。
 *
 * **控えの項目が欠けていても落ちない。** 読み込み時の整形で埋まる想定だが、
 * そこを前提にすると「整形を通らない経路が1つでもあれば全員がアリーナを開けない」。
 * `game/arena/match.ts` が同じ考え方で書かれているので、画面側も揃える。
 */
export function buildArenaTopView(
  player: PlayerState,
  options: {
    now?: number;
    online: boolean;
    myRank: number | null;
    ticketMax: number;
    nextTicketAt: number | null;
  },
): ArenaTopView {
  const now = options.now ?? Date.now();
  const rating = Math.max(0, safeNumber(player.arenaPoints));
  const tier = arenaTierForRating(rating);
  const next = arenaNextTier(rating);
  const span = next ? next.tier.minRating - tier.minRating : 1;
  const into = Math.max(0, rating - tier.minRating);
  const period = arenaPeriodInfo(now);
  const battles = Math.max(0, safeNumber(player.arenaSeasonBattles));
  const wins = Math.max(0, safeNumber(player.arenaSeasonWins));
  const history = Array.isArray(player.arenaMatchHistory) ? player.arenaMatchHistory : [];
  const tickets = Math.max(0, safeNumber(player.arenaTickets));

  return {
    rating,
    tier,
    next: next ? { name: next.tier.name, remaining: next.remaining } : null,
    progress: next ? Math.max(0, Math.min(1, into / Math.max(1, span))) : 1,
    standing: arenaStandingView(options.online, options.myRank),
    tickets: {
      count: tickets,
      max: options.ticketMax,
      nextText:
        tickets >= options.ticketMax
          ? "満タンです"
          : options.nextTicketAt !== null
            ? `次の1枚まで ${formatArenaDuration(options.nextTicketAt - now)}`
            : "回復待ち",
    },
    coins: Math.max(0, safeNumber(player.arenaCoins)),
    seasonNumber: period.seasonNumber,
    seasonRemainingText: formatArenaDuration(period.seasonRemainingMs),
    weekOfSeason: period.weekOfSeason,
    totalWeeks: period.totalWeeks,
    weekRemainingText: formatArenaDuration(period.weekRemainingMs),
    weeklyClaimable: canClaimArenaWeekly(player, now),
    battles,
    wins,
    winRateText: battles > 0 ? `${Math.round((wins / battles) * 100)}%` : null,
    defense: arenaDefenseView(player.arenaDefenseSnapshot),
    defenseLosses: history.filter((record) => record.side === "DEFENSE" && !record.won).length,
  };
}

/* ==========================================================================
 * 防衛履歴
 * ========================================================================== */

export interface ArenaHistoryRowView {
  record: ArenaMatchRecord;
  whenText: string;
  resultText: string;
  deltaText: string;
  /** リベンジできるか */
  canRevenge: boolean;
  /** できない理由。出さない場合は null */
  blockedReason: string | null;
}

export function arenaHistoryRowView(
  record: ArenaMatchRecord,
  block: ArenaRevengeBlock,
): ArenaHistoryRowView {
  return {
    record,
    whenText: formatArenaDateTime(record.at),
    resultText: record.won ? "防衛成功" : "防衛失敗",
    deltaText: `${record.ratingDelta >= 0 ? "+" : ""}${record.ratingDelta}`,
    canRevenge: block === null,
    blockedReason: arenaRevengeReasonText(block),
  };
}

/* ==========================================================================
 * 戦闘の組み立て
 * ========================================================================== */

export interface ArenaBattleSetupV2 {
  playerDefs: MonsterDefinition[];
  enemyDefs: MonsterDefinition[];
}

/** アリーナの速度圧縮。**両陣営に同じ式で掛ける**(片方だけだと単なる有利不利になる) */
function withArenaSpeed(def: MonsterDefinition): MonsterDefinition {
  return { ...def, stats: { ...def.stats, spd: arenaCompressedSpeed(def.stats.spd) } };
}

/**
 * 焼いた防衛と自分の攻撃編成から、1戦ぶんを組む。
 *
 * 敵側は**スナップショットからしか作らない**(`snapshotToDefinitions`)。
 * 相手の手持ちを今から読み直すと、登録後に本人が装備を外しただけで
 * 相手の画面の編成が崩れる。
 */
export function buildArenaEntryBattle(
  offenseInstances: readonly MonsterInstance[],
  entry: ArenaOpponentEntry,
  allEquipment: readonly Equipment[],
  /**
   * サーバへ送った攻撃編成。
   *
   * **渡されたらこちらを使う。** 手持ちから組み直すのと同じ結果になるはずだが、
   * 「はず」で済ませると、装備の解決が1か所でも違った時に
   * **画面とサーバで別のステータスで戦う。** サーバが検分して控えたのは
   * この焼き付けなので、画面もこれから組む。
   */
  attackerSnapshot?: ArenaDefenseSnapshot | null,
): ArenaBattleSetupV2 {
  if (attackerSnapshot && attackerSnapshot.units.length > 0) {
    return {
      playerDefs: snapshotToDefinitions(attackerSnapshot).map(withArenaSpeed),
      enemyDefs: snapshotToDefinitions(entry.defense).map(withArenaSpeed),
    };
  }
  const playerDefs: MonsterDefinition[] = [];
  for (const instance of offenseInstances) {
    const dex = findMonsterById(instance.dexId);
    if (!dex) continue;
    playerDefs.push(
      withArenaSpeed(toBattleDefinition(instance, dex, resolveEquippedItems(instance, allEquipment as Equipment[]))),
    );
  }
  return { playerDefs, enemyDefs: snapshotToDefinitions(entry.defense).map(withArenaSpeed) };
}
