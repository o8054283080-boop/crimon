import { EQUIP_SLOTS, Equipment, EquipSlot, SET_TYPES, SetType } from "../core/equipment.js";
import type { AutoEquipScope, AutoEquipSettings, AutoEquipStat, AutoEquipType } from "../core/equipmentPreset.js";
import { MonsterInstance, toBattleDefinition } from "../core/monsterInstance.js";
import type { Stats } from "../core/stats.js";
import { findMonsterById } from "../data/monsters.js";
import type { PlayerState } from "./playerState.js";

/**
 * おまかせ装備。
 *
 * ## 何を最大化するのか
 *
 * **装備単体の表示値では決めない。**「その子に着けた後の最終ステータス」で比べる。
 * 攻撃力+8%の腕輪は、素の攻撃が高い子ほど効くし、セットが揃うかどうかでも変わる。
 * 札に書いてある数字を足し合わせても、着けた後の姿にはならない。
 *
 * 評価は `toBattleDefinition` を通す。**ゲームが実際に使っている唯一の計算**で、
 * 星・レベル・タイプ転生・能力ポイント・装備・セット効果・才能覚醒が全部入る。
 * ここで別の簡易式を作ると、画面の数字と戦闘の数字がずれる。
 *
 * ## なぜ総当たりではないのか
 *
 * 6スロット × 各300個なら 300^6 = 7,290億通り。終わらない。
 * かといって「スロットごとに一番強いのを選ぶ」だけでは**セット効果を逃す**
 * (会心2セットで+15%、速度4セットで+12%。バラの最強6個より強いことが多い)。
 *
 * そこで、二段構えにする。
 *
 *   1. **セット構成を先に決める**(4+2 / 2+2+2 / 4+自由 / 2+自由 / 自由)
 *   2. その構成のもとで、スロットごとに見込みのある上位だけを残して組み合わせる
 *
 * セット構成を固定すれば、セット効果は定数になる。残るのは
 * 「各スロットがステータスへいくら足すか」の足し算なので、
 * **スロットごとに独立して良いものを選べる。**
 *
 * 最後は必ず `toBattleDefinition` で正確に測り直してから比べる。
 * 絞り込みは候補を減らすためだけに使い、**順位付けそのものは近似しない。**
 */

/*
 * 条件とプリセットの**形は `core/equipmentPreset.ts` にある。**
 * `MonsterInstance` がプリセットを持つので core 側が知る必要があり、
 * ここへ置いたままだと core → game の向きが生まれて
 * Edge Function 用のビルドが壊れる(理由はあちらに書いた)。
 * 振る舞いと見せ方はこちらに残す。
 */
export type {
  AutoEquipScope,
  AutoEquipSettings,
  AutoEquipStat,
  AutoEquipType,
} from "../core/equipmentPreset.js";

export const AUTO_EQUIP_STATS: readonly AutoEquipStat[] = ["hp", "atk", "def", "spd", "criRate", "criDmg"];

export const AUTO_EQUIP_STAT_LABEL: Readonly<Record<AutoEquipStat, string>> = {
  hp: "HP",
  atk: "攻撃",
  def: "防御",
  spd: "速度",
  criRate: "クリ率",
  criDmg: "クリダメ",
};

/** クリ率・クリダメは割合で持っている。画面と最低条件では%で扱う */
export const AUTO_EQUIP_STAT_IS_PERCENT: Readonly<Record<AutoEquipStat, boolean>> = {
  hp: false, atk: false, def: false, spd: false, criRate: true, criDmg: true,
};

export const AUTO_EQUIP_TYPES: readonly AutoEquipType[] = [
  "hp", "atk", "def", "spd", "criRate", "criDmg", "power", "custom",
];

export const AUTO_EQUIP_TYPE_LABEL: Readonly<Record<AutoEquipType, string>> = {
  hp: "HP最大",
  atk: "攻撃最大",
  def: "防御最大",
  spd: "速度最大",
  criRate: "クリ率最大",
  criDmg: "クリダメ最大",
  power: "総合力重視",
  custom: "カスタム",
};

export const AUTO_EQUIP_SCOPE_LABEL: Readonly<Record<AutoEquipScope, string>> = {
  UNEQUIPPED: "未装備のみ",
  OWN_AND_UNEQUIPPED: "今の装備＋未装備",
  ALL: "他の子の装備も使う",
};

export const AUTO_EQUIP_SCOPE_NOTE: Readonly<Record<AutoEquipScope, string>> = {
  UNEQUIPPED: "誰も着けていない装備だけから組みます(この子の今の装備も外します)",
  OWN_AND_UNEQUIPPED: "この子の今の装備を含めて組み直します",
  ALL: "他の子が着けている装備も候補にします。外す時は確認します",
};

export function createDefaultAutoEquipSettings(): AutoEquipSettings {
  return { type: "power", priorities: [], minimums: {}, scope: "OWN_AND_UNEQUIPPED", fixedSlots: [] };
}

/** カスタムで指定できる優先順位の数 */
export const MAX_AUTO_EQUIP_PRIORITIES = 3;

/* ------------------------------------------------------------------ *
 * 評価
 * ------------------------------------------------------------------ */

/**
 * 総合力。
 *
 * **一覧の戦闘力(`monsterPower`)と同じ考え方を使う。**あちらは装備を見ないので
 * そのままでは使えないが、勝手に新しい指標を作ると
 * 「おまかせの言う強さ」と「画面に出る強さ」が別物になる。
 * 骨格(HPを10で割って、攻撃・防御・速度と足す)をそのまま借りて、
 * **装備を着けた後のステータス**に当てる。
 *
 * 会心は倍率の形なので、攻撃力への期待値として乗せる。
 * ここはUIで「戦力値」と名乗らせない——正式な指標ではなく、並べ替えの物差し。
 */
export function autoEquipPowerOf(stats: Stats): number {
  const critical = 1 + stats.criRate * (stats.criDmg - 1);
  return Math.round(stats.hp / 10 + stats.atk * critical + stats.def + stats.spd);
}

function statValue(stats: Stats, key: AutoEquipStat): number {
  return stats[key];
}

/** 最低条件をすべて満たすか */
export function meetsMinimums(stats: Stats, minimums: Partial<Record<AutoEquipStat, number>>): boolean {
  for (const key of AUTO_EQUIP_STATS) {
    const min = minimums[key];
    if (min === undefined) continue;
    if (statValue(stats, key) < min) return false;
  }
  return true;
}

/**
 * 2つの構成を比べる。**同じ入力なら必ず同じ順になる。**
 *
 * カスタムは辞書順。第1優先が同じなら第2優先、それも同じなら第3優先。
 * そこまで並んだら総合力で決める——**引き分けを残すと、実行のたびに
 * 違う構成が出る**ことになり、再現しなくなる。
 */
function compareStats(a: Stats, b: Stats, settings: AutoEquipSettings): number {
  const keys = settings.type === "custom"
    ? settings.priorities.slice(0, MAX_AUTO_EQUIP_PRIORITIES)
    : settings.type === "power" ? [] : [settings.type];
  for (const key of keys) {
    const diff = statValue(a, key) - statValue(b, key);
    if (Math.abs(diff) > 1e-9) return diff;
  }
  return autoEquipPowerOf(a) - autoEquipPowerOf(b);
}

/* ------------------------------------------------------------------ *
 * 候補を集める
 * ------------------------------------------------------------------ */

/** 装備1つがこの探索で使えるか、なぜ使えないか */
interface CandidateContext {
  ownedByOthers: Map<string, MonsterInstance>;
  ownEquipmentIds: Set<string>;
}

function buildContext(state: PlayerState, monster: MonsterInstance): CandidateContext {
  const ownedByOthers = new Map<string, MonsterInstance>();
  for (const other of state.monsters) {
    if (other.id === monster.id) continue;
    for (const id of Object.values(other.equipment)) {
      if (id) ownedByOthers.set(id, other);
    }
  }
  const ownEquipmentIds = new Set<string>();
  for (const id of Object.values(monster.equipment)) if (id) ownEquipmentIds.add(id);
  return { ownedByOthers, ownEquipmentIds };
}

/**
 * 探索に使ってよい装備を集める。
 *
 * **「おまかせ対象外」を付けた装備は、どの範囲でも候補にしない。**
 * ただし固定したスロットは別扱い——固定は「今のまま動かさない」なので、
 * 対象外の装備を着けたまま固定しても、それは維持される(候補として選ぶのではなく、
 * 探索から外して最後に戻す)。
 */
export function collectCandidates(
  state: PlayerState,
  monster: MonsterInstance,
  settings: AutoEquipSettings,
): Map<EquipSlot, Equipment[]> {
  const ctx = buildContext(state, monster);
  const fixed = new Set(settings.fixedSlots);
  const bySlot = new Map<EquipSlot, Equipment[]>();
  for (const slot of EQUIP_SLOTS) bySlot.set(slot, []);

  for (const equipment of state.equipment) {
    if (fixed.has(equipment.slot)) continue;          // 固定スロットは探索しない
    if (equipment.autoExclude) continue;              // おまかせ対象外
    const owner = ctx.ownedByOthers.get(equipment.id);
    if (owner && settings.scope !== "ALL") continue;  // 他の子の装備は ALL の時だけ
    /*
     * **「未装備のみ」は、この子の今の装備も外す。**
     * ここを抜かすと「今の装備＋未装備」と中身が同じになり、
     * 選べるのに何も変わらない札が1つ増えるだけになる。
     */
    if (settings.scope === "UNEQUIPPED" && ctx.ownEquipmentIds.has(equipment.id)) continue;
    bySlot.get(equipment.slot)?.push(equipment);
  }
  return bySlot;
}

/* ------------------------------------------------------------------ *
 * 探索
 * ------------------------------------------------------------------ */

/**
 * ## なぜ「組み合わせを片っ端から試す」のをやめたか
 *
 * 最初はセット構成ごとに上位3件を残して 5^6 = 15,625 通りを回していた。
 * だが**実際のセット構成は443通りあり、上限3万では1構成しか回れていなかった。**
 * 残り442構成は一度も測られないまま「これが最良です」と答えていた
 * (所持150個×6スロットで数えて判明。小さい母集団では起きないので、
 * 総当たりとの一致だけでは見つからなかった)。
 *
 * ## いまの解き方
 *
 * **セット構成とスロットの割り当てが決まれば、あとは1スロットずつ独立に選べる。**
 *
 * ステータスの計算は
 *
 *   HP・攻撃・防御 … 素の値 × (1 + %の合計) + 実数の合計
 *   速度           … (素の値 + 実数の合計) × (1 + セットの%)
 *   会心・命中・抵抗 … 足し算だけ
 *
 * どれも**各スロットの寄与を足すだけ**の形をしている。セット効果は構成が
 * 決まれば定数なので順位に影響しない。だから「そのスロットで一番寄与の大きい物」を
 * 選べば、その構成での最良が**厳密に**決まる。組み合わせを試す必要がない。
 *
 * 443構成 × 割り当て方 の数だけ `toBattleDefinition` を呼んで比べる。
 * **全構成を測れるうえ、前より速い。**
 */

/** 最低条件があって最良が弾かれた時、1スロットで代わりに試す数 */
const FALLBACK_PER_SLOT = 3;

/**
 * 詰め直しに使う、1スロットあたりの持ち駒。
 *
 * 総合力とカスタムは複数のステータスを合成するので、
 * 「寄与の順位が1位のもの」を並べても最良とは限らない。
 * 後から1スロットずつ入れ替えて詰めるために、少し多めに残す。
 */
const REFINE_POOL = 10;

/** 詰め直しを試す割り当ての数。評価の高い順に選ぶ */
const REFINE_TOP_ASSIGNMENTS = 24;

/** 測る回数の上限。1回9μsなので、5万でおよそ0.45秒 */
const MAX_EVALUATIONS = 50000;

/**
 * セット構成の候補。
 *
 * 「どのセットを何個そろえるか」だけを決める。どのスロットに置くかは
 * `slotAssignments` が決める。
 *
 * **所持していない構成は作らない。**6スロットのうち4つ埋められないセットで
 * 「4セット」を狙っても無駄なので、実際に置けるスロット数を数えてから作る。
 */
interface SetPlan {
  /** セット → そろえる個数。空なら「セットを狙わない」 */
  want: Map<SetType, number>;
}

function buildSetPlans(
  bySlot: Map<EquipSlot, Equipment[]>,
  fixedItems: Equipment[],
  wanted: Map<SetType, 2 | 4>,
): SetPlan[] {
  const slotsOf = new Map<SetType, Set<EquipSlot>>();
  for (const type of SET_TYPES) slotsOf.set(type, new Set());
  for (const [slot, items] of bySlot) {
    for (const item of items) slotsOf.get(item.set)?.add(slot);
  }
  const fixedCount = new Map<SetType, number>();
  for (const item of fixedItems) fixedCount.set(item.set, (fixedCount.get(item.set) ?? 0) + 1);

  const reach = (type: SetType): number => (slotsOf.get(type)?.size ?? 0) + (fixedCount.get(type) ?? 0);
  const four = SET_TYPES.filter((t) => reach(t) >= 4);
  const two = SET_TYPES.filter((t) => reach(t) >= 2);

  const plans: SetPlan[] = [{ want: new Map() }];
  for (const a of four) {
    plans.push({ want: new Map([[a, 4]]) });
    for (const b of two) {
      if (b === a) continue;
      plans.push({ want: new Map([[a, 4], [b, 2]]) });
    }
  }
  for (const a of two) {
    plans.push({ want: new Map([[a, 2]]) });
    for (const b of two) {
      if (b <= a) continue;
      plans.push({ want: new Map([[a, 2], [b, 2]]) });
      for (const c of two) {
        if (c <= b) continue;
        plans.push({ want: new Map([[a, 2], [b, 2], [c, 2]]) });
      }
    }
  }

  /*
   * シリーズを名指しされていたら、**そろう構成だけを残す。**
   * 固定した部位が既に持っているぶんも頭数に入れる
   * (速攻を1つ固定していれば、残り3つで4セットになる)。
   */
  if (wanted.size === 0) return plans;
  return plans.filter((plan) => {
    for (const [type, count] of wanted) {
      if ((plan.want.get(type) ?? 0) + (fixedCount.get(type) ?? 0) < count) return false;
    }
    return true;
  });
}

/** 指定されたシリーズが、実際にそろっているか */
function meetsWantedSets(items: Equipment[], wanted: Map<SetType, 2 | 4>): boolean {
  if (wanted.size === 0) return true;
  const counts = new Map<SetType, number>();
  for (const item of items) counts.set(item.set, (counts.get(item.set) ?? 0) + 1);
  for (const [type, count] of wanted) {
    if ((counts.get(type) ?? 0) < count) return false;
  }
  return true;
}

/**
 * 指定を読める形へ整える。
 *
 * **4個でしか効かないシリーズに2を指定させない。**
 * 暴走・崩壊・祝福は2個そろえても何も起きないので、
 * 2を渡されたら4へ引き上げる(黙って無意味な縛りを掛けない)。
 */
const FOUR_PIECE_ONLY_SETS = new Set<SetType>(["RAMPAGE", "COLLAPSE", "BLESSING"]);

export function normalizeWantedSets(raw: Partial<Record<SetType, 2 | 4>> | undefined): Map<SetType, 2 | 4> {
  const wanted = new Map<SetType, 2 | 4>();
  if (!raw || typeof raw !== "object") return wanted;
  for (const type of SET_TYPES) {
    const count = raw[type];
    if (count !== 2 && count !== 4) continue;
    wanted.set(type, FOUR_PIECE_ONLY_SETS.has(type) ? 4 : count);
  }
  return wanted;
}

/**
 * 指定した個数の合計。6枠に収まらない指定は**叶えようがない。**
 *
 * ここを「収まらないなら指定を捨てる」にしていたら、
 * 暴走4+崩壊4(=8枠)が**無指定と同じ結果を返して成功扱い**になった。
 * 黙って願いを捨てて「できました」と言うのがいちばん悪い。**断る。**
 */
export function wantedSetsTotal(wanted: Map<SetType, 2 | 4>): number {
  let total = 0;
  for (const count of wanted.values()) total += count;
  return total;
}

/**
 * いまの条件で、そのシリーズを**何枠に置けるか。**
 *
 * 画面のシリーズ札に出す数。**「所持数」を出してはいけない。**
 * 最初は `state.equipment` を素朴に数えて「所持35」と出していたが、
 * 探す範囲が「今の装備＋未装備」なら他の子が着けている35個は使えない。
 * **押せるのに必ず断られる札**ができていた。
 *
 * 同じシリーズを同じ枠に2つ着けることはできないので、
 * 数えるのは個数ではなく**置ける枠の数**(`buildSetPlans` の数え方と同じ)。
 * 固定した部位が既に着けているぶんも頭数に入れる。
 */
export function reachableSetCounts(
  state: PlayerState,
  monster: MonsterInstance,
  settings: AutoEquipSettings,
): Map<SetType, number> {
  const bySlot = collectCandidates(state, monster, settings);
  const slotsOf = new Map<SetType, Set<EquipSlot>>();
  for (const type of SET_TYPES) slotsOf.set(type, new Set());
  for (const [slot, items] of bySlot) {
    for (const item of items) slotsOf.get(item.set)?.add(slot);
  }
  const byId = new Map(state.equipment.map((e) => [e.id, e] as const));
  const counts = new Map<SetType, number>();
  for (const type of SET_TYPES) counts.set(type, slotsOf.get(type)?.size ?? 0);
  for (const slot of settings.fixedSlots) {
    const item = byId.get(monster.equipment[slot] ?? "");
    if (item) counts.set(item.set, (counts.get(item.set) ?? 0) + 1);
  }
  return counts;
}

/** そのシリーズが4個でしか効かないか。画面で2を押せなくするために使う */
export function isFourPieceOnlySet(type: SetType): boolean {
  return FOUR_PIECE_ONLY_SETS.has(type);
}

/**
 * その構成を、空いているスロットへどう割り当てるか。
 *
 * 「4個セットAを揃える」と決めても、**どの4スロットに置くかで結果が変わる。**
 * 攻撃力%が乗るスロットにセットAの物しか置けなくなるかもしれない。
 * だから割り当て方も全部試す(4+2なら15通り、2+2+2なら90通り)。
 *
 * 固定されたスロットは動かせないので、そこは割り当ての対象にしない。
 */
function slotAssignments(
  plan: SetPlan,
  freeSlots: EquipSlot[],
  hasSetInSlot: (slot: EquipSlot, type: SetType) => boolean,
  limit: number,
): (Map<EquipSlot, SetType | null>)[] {
  const wants = [...plan.want.entries()];
  const results: Map<EquipSlot, SetType | null>[] = [];
  const current = new Map<EquipSlot, SetType | null>();

  const walk = (wantIndex: number, remaining: EquipSlot[]): void => {
    if (results.length >= limit) return;
    if (wantIndex === wants.length) {
      const assignment = new Map(current);
      for (const slot of remaining) assignment.set(slot, null);   // 残りは自由
      results.push(assignment);
      return;
    }
    const [type, count] = wants[wantIndex];
    // そのセットを置けるスロットだけを対象にする
    const usable = remaining.filter((slot) => hasSetInSlot(slot, type));
    if (usable.length < count) return;

    const choose = (start: number, picked: EquipSlot[]): void => {
      if (results.length >= limit) return;
      if (picked.length === count) {
        for (const slot of picked) current.set(slot, type);
        walk(wantIndex + 1, remaining.filter((slot) => !picked.includes(slot)));
        for (const slot of picked) current.delete(slot);
        return;
      }
      for (let i = start; i < usable.length; i += 1) {
        choose(i + 1, [...picked, usable[i]]);
      }
    };
    choose(0, []);
  };
  walk(0, freeSlots);
  return results;
}

interface SlotRanking {
  /** 寄与の大きい順(全体) */
  best: Equipment[];
  /** セット → そのセットの中で寄与の大きい順 */
  bySet: Map<SetType, Equipment[]>;
}

/**
 * スロットごとの順位を**1回だけ**作る。
 *
 * 寄与の測り方はセット構成に依らないので、構成ごとに並べ替え直す必要はない。
 */
function rankSlots(
  bySlot: Map<EquipSlot, Equipment[]>,
  baseStats: Stats,
  settings: AutoEquipSettings,
): Map<EquipSlot, SlotRanking> {
  const ranking = new Map<EquipSlot, SlotRanking>();
  for (const slot of EQUIP_SLOTS) {
    const items = bySlot.get(slot) ?? [];
    const scored = items
      .map((item) => ({ item, score: contributionOf(item, baseStats, settings) }))
      .sort((a, b) => b.score - a.score)
      .map((s) => s.item);
    const bySet = new Map<SetType, Equipment[]>();
    for (const item of scored) {
      const list = bySet.get(item.set);
      if (list) { if (list.length < REFINE_POOL) list.push(item); }
      else bySet.set(item.set, [item]);
    }
    ranking.set(slot, { best: scored.slice(0, REFINE_POOL), bySet });
  }
  return ranking;
}

/**
 * その装備がステータスへどれだけ足すか。
 *
 * **単一の目的なら、この順位がそのまま厳密な最良を指す。**
 * 計算の形が「素の値 × (1 + %の合計) + 実数の合計」なので、
 * `素の値 × その装備の% + その装備の実数` が寄与そのものになる。
 * セット効果は構成が決まれば定数なので、順位には影響しない。
 *
 * 総合力とカスタムは複数のステータスを見るので、ここは目安になる。
 * **順位を最終決定に使わないための歯止め**として、最後は必ず
 * `toBattleDefinition` の結果で比べる。
 */
function contributionOf(item: Equipment, base: Stats, settings: AutoEquipSettings): number {
  const keys: AutoEquipStat[] = settings.type === "custom"
    ? (settings.priorities.length > 0 ? settings.priorities.slice(0, MAX_AUTO_EQUIP_PRIORITIES) : [...AUTO_EQUIP_STATS])
    : settings.type === "power" ? [...AUTO_EQUIP_STATS] : [settings.type];

  /*
   * **総合力は式に合わせて重みを付ける。**
   * ただ足し合わせると、HP(万の桁)が攻撃(千の桁)を押しつぶして
   * 「HPだけ高い構成」が選ばれる。総合力の式
   * (HP/10 + 攻撃×会心期待値 + 防御 + 速度)と同じ比率で見る。
   */
  const powerWeight = settings.type === "power" ? powerWeights(base) : null;

  let score = 0;
  const rolls = [item.mainStat, ...item.subStats];
  for (const roll of rolls) {
    for (const [i, key] of keys.entries()) {
      const raw = rollContribution(roll.type, roll.value, key, base);
      // 第1優先ほど重く見る。単一目的ならキーが1つなので重みは効かない
      score += powerWeight ? raw * powerWeight[key] : raw / (i + 1);
    }
  }
  // 同点なら育っている方を選ぶ(見た目の納得感のため。順位そのものは変えない)
  return score + item.level * 1e-6;
}

/**
 * 総合力を出す時の、ステータスごとの重み。
 *
 * `autoEquipPowerOf` の式そのままにする。会心は攻撃力に掛かるので、
 * **攻撃力を通した寄与**として換算する(クリ率1%の価値は、その子の攻撃力と
 * クリダメの高さで決まる)。
 */
function powerWeights(base: Stats): Record<AutoEquipStat, number> {
  return {
    hp: 0.1,
    atk: 1 + base.criRate * (base.criDmg - 1),
    def: 1,
    spd: 1,
    // rollContribution が1000倍して返すので、ここで戻しつつ攻撃力へ換算する
    criRate: (base.atk * (base.criDmg - 1)) / 1000,
    criDmg: (base.atk * base.criRate) / 1000,
  };
}

/**
 * ステータス1つに対する、ロール1つの寄与。
 *
 * 割合は素の値に掛け、実数はそのまま足す——**実際の計算と同じ形**にする。
 * 会心は0〜1の割合で桁が違うので、他と比べられる大きさへ寄せる
 * (総合力・カスタムで足し合わせる時のため。単一目的では順位が変わらない)。
 */
function rollContribution(type: string, value: number, key: AutoEquipStat, base: Stats): number {
  switch (key) {
    case "hp": return type === "HP_PERCENT" ? base.hp * value : type === "HP_FLAT" ? value : 0;
    case "atk": return type === "ATK_PERCENT" ? base.atk * value : type === "ATK_FLAT" ? value : 0;
    case "def": return type === "DEF_PERCENT" ? base.def * value : type === "DEF_FLAT" ? value : 0;
    case "spd": return type === "SPD" ? value : 0;
    case "criRate": return type === "CRIT_RATE" ? value * 1000 : 0;
    case "criDmg": return type === "CRIT_DMG" ? value * 1000 : 0;
    default: return 0;
  }
}

/** 割り当てに従って、各スロットの n 番目に良い物を取る(n=0 が最良) */
function pickForAssignment(
  ranking: Map<EquipSlot, SlotRanking>,
  assignment: Map<EquipSlot, SetType | null>,
  depth: number,
): Equipment[] {
  const items: Equipment[] = [];
  for (const [slot, type] of assignment) {
    const rank = ranking.get(slot);
    if (!rank) continue;
    const list = type === null ? rank.best : (rank.bySet.get(type) ?? []);
    const item = list[Math.min(depth, list.length - 1)];
    if (item) items.push(item);
  }
  return items;
}

export interface AutoEquipStolen {
  monsterId: string;
  monsterName: string;
  equipmentId: string;
  slot: EquipSlot;
}

export interface AutoEquipPlan {
  /** スロット → 装備ID。固定スロットは今のまま入っている */
  assignment: Partial<Record<EquipSlot, string>>;
  before: Stats;
  after: Stats;
  /** 他の子から外すことになる装備 */
  stolen: AutoEquipStolen[];
  /**
   * 何通り測ったか(重さの目安として画面に出す)。
   *
   * **0 は「探していない」。**プリセットの「この装備に戻す」は
   * 保存した組み合わせを読むだけで比べていないので、0 を入れて
   * 「1 通りを比べました」と嘘をつかないようにする。
   */
  evaluated: number;
}

export type AutoEquipOutcome =
  | { ok: true; plan: AutoEquipPlan }
  | { ok: false; reason: string };

/**
 * おまかせ装備を計算する。**この関数は状態を一切変えない。**
 *
 * 返すのは「こうなります」という計画だけ。実際に着せ替えるのは
 * 画面がプレビューを見せて、人が確定を押してから(`applyAutoEquipPlan`)。
 */
export function planAutoEquip(
  state: PlayerState,
  monsterId: string,
  settings: AutoEquipSettings,
): AutoEquipOutcome {
  const monster = state.monsters.find((m) => m.id === monsterId);
  if (!monster) return { ok: false, reason: "モンスターが見つかりません" };
  const dex = findMonsterById(monster.dexId);
  if (!dex) return { ok: false, reason: "モンスターの図鑑データが見つかりません" };

  const byId = new Map(state.equipment.map((e) => [e.id, e] as const));
  const bySlot = collectCandidates(state, monster, settings);

  /*
   * 動かさないスロット。
   *
   * 人が固定した部位に加えて、**候補が1つも無い部位も動かさない。**
   * ここを入れ忘れると、おまかせ対象外を付けた装備が
   * 「候補に入らない」ではなく **「外される」** ことになる
   * (対象外は「触るな」の意味であって、「捨てろ」ではない)。
   * 「未装備のみ」で替えが無い部位も同じで、黙って裸にしてはいけない。
   */
  const fixed = new Set(settings.fixedSlots);
  for (const slot of EQUIP_SLOTS) {
    if ((bySlot.get(slot)?.length ?? 0) === 0) fixed.add(slot);
  }

  const fixedItems: Equipment[] = [];
  const fixedAssignment: Partial<Record<EquipSlot, string>> = {};
  for (const slot of EQUIP_SLOTS) {
    if (!fixed.has(slot)) continue;
    const id = monster.equipment[slot];
    const item = id ? byId.get(id) : undefined;
    if (item) { fixedItems.push(item); fixedAssignment[slot] = item.id; }
  }

  const currentItems = EQUIP_SLOTS
    .map((slot) => monster.equipment[slot])
    .map((id) => (id ? byId.get(id) : undefined))
    .filter((e): e is Equipment => e !== undefined);
  const before = toBattleDefinition(monster, dex, currentItems).stats;
  const baseStats = toBattleDefinition(monster, dex, []).stats;

  const wantedSets = normalizeWantedSets(settings.wantedSets);
  if (wantedSetsTotal(wantedSets) > EQUIP_SLOTS.length) {
    return { ok: false, reason: `シリーズの指定が合計${wantedSetsTotal(wantedSets)}個で、${EQUIP_SLOTS.length}枠に入りません` };
  }
  const plans = buildSetPlans(bySlot, fixedItems, wantedSets);
  const ranking = rankSlots(bySlot, baseStats, settings);

  const freeSlots = EQUIP_SLOTS.filter((slot) => !fixed.has(slot) && (bySlot.get(slot)?.length ?? 0) > 0);
  const hasSetInSlot = (slot: EquipSlot, type: SetType): boolean =>
    (ranking.get(slot)?.bySet.get(type)?.length ?? 0) > 0;

  let best: { stats: Stats; items: Equipment[] } | null = null;
  let evaluated = 0;
  let sawAny = false;
  const hasMinimums = Object.keys(settings.minimums).length > 0;

  /**
   * ひとつ測る。**最後の比較は必ずここで**——絞り込みは候補を減らすためだけで、
   * 順位はゲーム本体の計算(`toBattleDefinition`)が決める。
   */
  const evaluate = (picked: Equipment[]): Stats | null => {
    const items = [...fixedItems, ...picked];
    /*
     * **指定されたシリーズは、ここでも実際に数える。**
     * 構成の絞り込みだけに任せると、詰め直しが1枠を別シリーズへ
     * 入れ替えた時に黙って崩れる(そちらの方がステータスは上がるので、
     * 放っておくと必ずそうなる)。約束したものは最後に数えて守る。
     */
    if (!meetsWantedSets(items, wantedSets)) return null;
    const stats = toBattleDefinition(monster, dex, items).stats;
    evaluated += 1;
    sawAny = true;
    if (!meetsMinimums(stats, settings.minimums)) return null;
    if (!best || compareStats(stats, best.stats, settings) > 0) best = { stats, items: [...items] };
    return stats;
  };

  /*
   * 割り当ての数は構成によって大きく違う(4+2で15通り、2+2+2で90通り)。
   * 全部足すと数万になるので、**構成ごとに上限を配って**、
   * 一部の構成だけが枠を食い尽くさないようにする。
   * 最初の版はこれが無くて、443構成のうち1つしか測れていなかった。
   */
  const perPlanLimit = Math.max(4, Math.floor(MAX_EVALUATIONS / Math.max(1, plans.length)));

  /*
   * **単一のステータスを狙う時は、最良の1つで厳密に決まる。**
   * 総合力とカスタムは複数を合成するので、寄与の順位がそのまま答えとは限らない。
   * 最低条件がある時も、最良が弾かれることがある。
   */
  const needsDeeper = hasMinimums || settings.type === "power" || settings.type === "custom";

  // 詰め直しの入口にする割り当てを、評価の高い順に少しだけ覚えておく
  const seeds: { score: number; items: Equipment[]; assignment: Map<EquipSlot, SetType | null> }[] = [];

  for (const plan of plans) {
    if (evaluated >= MAX_EVALUATIONS) break;
    const assignments = slotAssignments(plan, freeSlots, hasSetInSlot, perPlanLimit);
    for (const assignment of assignments) {
      if (evaluated >= MAX_EVALUATIONS) break;
      // 各スロットで一番寄与の大きい物。単一目的ならこれがその割り当ての厳密な最良
      const picked = pickForAssignment(ranking, assignment, 0);
      const stats = evaluate(picked);
      /*
       * 最低条件があると、最良が弾かれることがある。
       * その時だけ、2番手・3番手も試す(条件を満たす構成を探すため)。
       */
      /*
       * 単一のステータスを狙う時は、最良の1つで**厳密**に決まる。
       * だが総合力とカスタムは複数を合成するので、寄与の順位が
       * そのまま答えとは限らない。**その時だけ2番手・3番手も試す。**
       * (最低条件がある時も、最良が弾かれることがあるので同じ扱い)
       */
      if (needsDeeper) {
        if (stats) {
          seeds.push({ score: autoEquipPowerOf(stats), items: picked, assignment });
          if (seeds.length > REFINE_TOP_ASSIGNMENTS * 4) {
            seeds.sort((a, b) => b.score - a.score);
            seeds.length = REFINE_TOP_ASSIGNMENTS;
          }
        }
        for (let depth = 1; depth < FALLBACK_PER_SLOT; depth += 1) {
          if (evaluated >= MAX_EVALUATIONS) break;
          evaluate(pickForAssignment(ranking, assignment, depth));
        }
      }
    }
  }

  /*
   * 総合力とカスタムの詰め直し。
   *
   * **寄与の順位だけでは届かない。**総合力は HP/10 + 攻撃×会心 + 防御 + 速度 の
   * 合成なので、「各スロットで寄与1位」を並べた構成が最良とは限らない
   * (実測で総当たりより最大1.5%低い答えを出していた)。
   *
   * そこで、見込みのある割り当てから始めて**1スロットずつ入れ替える。**
   * 入れ替えるたびに本物の計算で測り、良くなれば採る。改善が止まったら次へ。
   * 近似で済ませず、最後まで実測で決める。
   */
  if (needsDeeper && seeds.length > 0) {
    seeds.sort((a, b) => b.score - a.score);
    for (const seed of seeds.slice(0, REFINE_TOP_ASSIGNMENTS)) {
      if (evaluated >= MAX_EVALUATIONS) break;
      let current = [...seed.items];
      let currentStats = toBattleDefinition(monster, dex, [...fixedItems, ...current]).stats;
      evaluated += 1;
      for (let round = 0; round < 3; round += 1) {
        let improved = false;
        for (const [slot, type] of seed.assignment) {
          if (evaluated >= MAX_EVALUATIONS) break;
          const rank = ranking.get(slot);
          if (!rank) continue;
          const pool = type === null ? rank.best : (rank.bySet.get(type) ?? []);
          for (const candidate of pool) {
            if (evaluated >= MAX_EVALUATIONS) break;
            if (current.some((item) => item.id === candidate.id)) continue;
            const trial = current.filter((item) => item.slot !== slot).concat(candidate);
            const stats = evaluate(trial);
            if (!stats) continue;
            if (compareStats(stats, currentStats, settings) > 0) {
              current = trial;
              currentStats = stats;
              improved = true;
            }
          }
        }
        if (!improved) break;
      }
    }
  }

  if (!best) {
    return {
      ok: false,
      reason: wantedSets.size > 0 && !sawAny
        ? "指定したシリーズをそろえられません"
        : sawAny || Object.keys(settings.minimums).length > 0
          ? "指定条件を満たす装備構成がありません"
          : "使える装備がありません",
    };
  }

  const chosen: { stats: Stats; items: Equipment[] } = best;
  const assignment: Partial<Record<EquipSlot, string>> = { ...fixedAssignment };
  for (const item of chosen.items) assignment[item.slot] = item.id;

  // 他の子から外すことになるものを数える
  const ctx = buildContext(state, monster);
  const stolen: AutoEquipStolen[] = [];
  for (const item of chosen.items) {
    const owner = ctx.ownedByOthers.get(item.id);
    if (!owner) continue;
    const ownerDex = findMonsterById(owner.dexId);
    stolen.push({
      monsterId: owner.id,
      monsterName: ownerDex ? ownerDex.name : owner.dexId,
      equipmentId: item.id,
      slot: item.slot,
    });
  }

  return { ok: true, plan: { assignment, before, after: chosen.stats, stolen, evaluated } };
}

/**
 * 計画を実際に着せる。
 *
 * **人が確定を押してから呼ぶこと。**`equipToMonster` が他の子から自動で外すので、
 * 呼ぶ前に `plan.stolen` を見せて確認を取る責任は呼び出し側にある。
 */
export function applyAutoEquipPlan(
  state: PlayerState,
  monsterId: string,
  assignment: Partial<Record<EquipSlot, string>>,
): boolean {
  const monster = state.monsters.find((m) => m.id === monsterId);
  if (!monster) return false;
  const byId = new Map(state.equipment.map((e) => [e.id, e] as const));

  for (const slot of EQUIP_SLOTS) {
    const wanted = assignment[slot];
    if (!wanted) {
      delete monster.equipment[slot];
      continue;
    }
    const item = byId.get(wanted);
    if (!item || item.slot !== slot) { delete monster.equipment[slot]; continue; }
    // 他の子が着けていれば外す(この時点で確認は済んでいる)
    for (const other of state.monsters) {
      if (other.id === monster.id) continue;
      for (const [s, id] of Object.entries(other.equipment) as [string, string][]) {
        if (id === wanted) delete other.equipment[Number(s) as EquipSlot];
      }
    }
    monster.equipment[slot] = wanted;
  }
  return true;
}

/** 今の装備での最終ステータス。プレビューの「変更前」に使う */
export function currentStatsOf(state: PlayerState, monster: MonsterInstance): Stats | null {
  const dex = findMonsterById(monster.dexId);
  if (!dex) return null;
  const byId = new Map(state.equipment.map((e) => [e.id, e] as const));
  const items = EQUIP_SLOTS
    .map((slot) => monster.equipment[slot])
    .map((id) => (id ? byId.get(id) : undefined))
    .filter((e): e is Equipment => e !== undefined);
  return toBattleDefinition(monster, dex, items).stats;
}
