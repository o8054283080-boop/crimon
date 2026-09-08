import type { MonsterInstance } from "../core/monsterInstance.js";
import { SKILL_PIG_DEX } from "../data/monsters.js";
import { addMonster, removeMonsters, type PlayerState } from "./playerState.js";

/**
 * モンスターポイント。**余った仲間の出口。**
 *
 * ## なぜ要ったのか
 *
 * ここまで、手持ちのモンスターを減らす道は2つしかなかった。
 *
 *   1. ランクアップの素材 … **同じ星の子**が要る
 *   2. 経験値・スキルの素材 … **育てたい子**が居る時だけ
 *
 * どちらも「使える相手が居る時だけ」で、条件に合わない子は溜まり続ける。
 * 星3を100体持っていても、ランクアップに使えるのは星3を育てる時だけ。
 * **持っているだけで何にもならない子**が増えていく。
 *
 * ここはその出口。まとめて送ると、星の数だけポイントになる。
 *
 * ## 増える一方にならないか
 *
 * 交換品に召喚の書があるので、書 → 召喚 → モンスター → ポイント → 書 が
 * 回る。**この輪が閉じると無限に増える**ので、割に合わない値にしてある。
 *
 *   書1枚 = 1回召喚 = ★3〜5が1体 = 3〜5ポイント
 *   書1枚と交換するのに 30ポイント
 *
 * **7〜8回召喚して、やっと1枚戻る。**輪は閉じない。
 * 10連(250pt)も、10連で得られるのは40ポイント前後なので同じ。
 *
 * ## 育てた子を守る
 *
 * 送るのは取り返しがつかない。守りは3つ。
 *
 *   1. **編成に入っている子は送れない**(通常・ダンジョン・塔・アリーナの全部)
 *   2. **鍵をかけた子は送れない**(既にある `locked`)
 *   3. **押す前に、合計ポイントと星の内訳を見せる**
 *
 * 2番目と3番目は装備の一括売却と同じ考え方。
 * 「押してから知る」ことが無いようにする。
 */

/** 1体を送った時のポイント。**星の数がそのままポイント** */
export function monsterPointsOf(monster: Pick<MonsterInstance, "star">): number {
  return monster.star;
}

/** まとめて送った時の合計 */
export function totalMonsterPoints(monsters: readonly Pick<MonsterInstance, "star">[]): number {
  return monsters.reduce((sum, monster) => sum + monsterPointsOf(monster), 0);
}

/** 交換品の種類。処理の分岐に使うので、値は保存しない(表示と実行の対応だけ) */
export type MonsterPointItemKind = "SUMMON_SCROLL" | "SKILL_PIG";

export interface MonsterPointItem {
  id: string;
  kind: MonsterPointItemKind;
  name: string;
  detail: string;
  icon: string;
  cost: number;
  /** 一度に受け取れる数 */
  amount: number;
}

/**
 * 交換品。
 *
 * 10連(250pt)は1枚ずつ(30pt × 10 = 300pt)より安い。
 * **まとめて交換する意味がある**ようにしてある。
 *
 * スキルピッグはこれまで**試練の塔の70階・90階でしか手に入らなかった。**
 * 塔の値打ちを落とさないよう、750ptと重くしてある
 * (★3なら250体、★5でも150体を送る量)。
 */
export const MONSTER_POINT_ITEMS: readonly MonsterPointItem[] = [
  {
    id: "scroll_1",
    kind: "SUMMON_SCROLL",
    name: "召喚の書 1枚",
    detail: "ダイヤを使わずに1回召喚できます",
    icon: "📜",
    cost: 30,
    amount: 1,
  },
  {
    id: "scroll_10",
    kind: "SUMMON_SCROLL",
    name: "召喚の書 10枚",
    detail: "1枚ずつ交換するより安く済みます",
    icon: "📜",
    cost: 250,
    amount: 10,
  },
  {
    id: "skill_pig",
    kind: "SKILL_PIG",
    name: "スキルピッグ 1体",
    detail: "どの種族にも使えるスキル育成の素材。試練の塔の奥でしか手に入りません",
    icon: "🐽",
    cost: 750,
    amount: 1,
  },
];

export function findMonsterPointItem(itemId: string): MonsterPointItem | undefined {
  return MONSTER_POINT_ITEMS.find((item) => item.id === itemId);
}

/** 手持ちのポイント。旧セーブには無いので0として読む */
export function monsterPointsOwned(state: PlayerState): number {
  return state.monsterPoints ?? 0;
}

/**
 * その子を送れるか。
 *
 * **編成に入っているかどうかは4か所ぜんぶ見る。**通常編成だけを見て
 * 「ダンジョン編成の子が消えた」を起こすと、次に潜る時まで気づけない。
 */
export function canSendMonster(state: PlayerState, monster: MonsterInstance): boolean {
  if (monster.locked) return false;
  if (state.partyIds.includes(monster.id)) return false;
  if (state.dungeonPartyIds?.includes(monster.id)) return false;
  if (state.towerPartyIds?.includes(monster.id)) return false;
  if (state.arenaDefenseIds?.includes(monster.id)) return false;
  if (state.arenaOffenseIds?.includes(monster.id)) return false;
  return true;
}

/** いま送れる子だけを残す */
export function sendableMonsters(state: PlayerState): MonsterInstance[] {
  return state.monsters.filter((monster) => canSendMonster(state, monster));
}

export interface SendMonstersResult {
  /** 実際に送った数 */
  sent: number;
  /** 得たポイント */
  gained: number;
  /** 送った後の手持ちポイント */
  total: number;
}

/**
 * まとめて送る。
 *
 * **送れない子が混ざっていても、そこで止めない。**送れる子だけを送る。
 * 途中で止めると「何体送れたのか分からない」状態になる。
 * 送れる子が1体も無ければ `null`(呼び出し元は何もしない)。
 */
export function sendMonstersForPoints(state: PlayerState, monsterIds: readonly string[]): SendMonstersResult | null {
  const wanted = new Set(monsterIds);
  const targets = state.monsters.filter((monster) => wanted.has(monster.id) && canSendMonster(state, monster));
  if (targets.length === 0) return null;

  const gained = totalMonsterPoints(targets);
  removeMonsters(state, targets.map((monster) => monster.id));
  state.monsterPoints = monsterPointsOwned(state) + gained;
  return { sent: targets.length, gained, total: state.monsterPoints };
}

export interface ExchangeResult {
  item: MonsterPointItem;
  /** 交換した後の残りポイント */
  remaining: number;
}

/**
 * ポイントを交換する。
 *
 * 足りなければ `null` を返して**何も減らさない。**
 * 先に引いてから配る形にすると、配る側で失敗した時にポイントだけが消える。
 */
export function tryExchangeMonsterPoints(state: PlayerState, itemId: string): ExchangeResult | null {
  const item = findMonsterPointItem(itemId);
  if (!item) return null;
  if (monsterPointsOwned(state) < item.cost) return null;

  if (item.kind === "SUMMON_SCROLL") {
    state.summonScrolls += item.amount;
  } else {
    // 塔の報酬と同じ配り方。★1で、属性は順に散らす
    for (let i = 0; i < item.amount; i += 1) {
      addMonster(state, SKILL_PIG_DEX[i % SKILL_PIG_DEX.length].id, 1, 1);
    }
  }
  state.monsterPoints = monsterPointsOwned(state) - item.cost;
  return { item, remaining: state.monsterPoints };
}
