import { MonsterInstance } from "../../core/monsterInstance.js";
import type { PlayerState } from "../../game/playerState.js";
import {
  MONSTER_POINT_ITEMS,
  canSendMonster,
  monsterPointsOwned,
  totalMonsterPoints,
  type MonsterPointItem,
} from "../../game/monsterPoints.js";
import { MONSTER_SORT_KEYS, MONSTER_SORT_LABEL, MonsterSortKey, sortMonsters } from "../../game/monsterSort.js";
import { MonsterFilter, filterMonsters } from "../monsterFilter.js";
import { el } from "../dom.js";
import { icon } from "../icons.js";
import { createIncrementalGrid } from "../incrementalGrid.js";
import { managementHeader } from "./managementHeader.js";
import { monsterCard } from "./monsters.js";
import { renderMonsterFilterBar } from "./monsterFilterBar.js";
import { stickyActions } from "./stickyActions.js";
import "../ui/monsterExchange.css";

/**
 * モンスター交換所。
 *
 * ## なぜ「集める場所」と「使う場所」を同じ画面にするのか
 *
 * 目覚素材の交換所で一度間違えている。あの時は交換所をショップへ置こうとして、
 * **集める場所(深域)から離れた**。使い道を考えるのは、余りを見た瞬間だから、
 * 交換所は余りが並ぶ場所の中に無いと使われない。
 *
 * ここも同じ。**送る操作と交換が1画面に並ぶ。**
 * 送った直後にポイントが増え、その場で交換できる。
 *
 * ## 押す前に見せる
 *
 * 装備の一括売却と同じ約束。**押してから知る**ことが無いようにする。
 *
 *   ・選んだ体数と、得られるポイント
 *   ・★5以上が混ざっているなら、その数を赤で
 *
 * 送るのは取り返しがつかない。守りは3つ重ねてある
 * (編成中は選べない・鍵つきは選べない・押す前に内訳を出す)。
 */

export interface MonsterExchangeProps {
  player: PlayerState;
  /** 送った・交換した結果。**画面の流れの中に出す**(浮かせない) */
  notice: string | null;
  selectedIds: string[];
  filter: MonsterFilter;
  filterOpen: boolean;
  sortKey: MonsterSortKey;
  dense: boolean;
  onBack: () => void;
  onToggleSelect: (monsterId: string) => void;
  onSelectAllShown: (monsterIds: string[]) => void;
  onClearSelection: () => void;
  onSend: () => void;
  onExchange: (itemId: string) => void;
  onChangeFilter: (filter: MonsterFilter) => void;
  onToggleFilterOpen: () => void;
  onChangeSort: (key: MonsterSortKey) => void;
}

/** ★5以上をまとめて送ってしまう事故を防ぐため、混ざっている数を数える */
export function rareCountOf(monsters: readonly MonsterInstance[]): number {
  return monsters.filter((monster) => monster.star >= 5).length;
}

/**
 * 選んだ顔ぶれを「★3×12 ★4×2」の形にする。
 *
 * **合計ポイントだけでは、何を手放すのか分からない。**
 * 数字が合っていても、★5が1体混ざっていることに気づけない。
 */
export function selectionBreakdown(monsters: readonly MonsterInstance[]): string {
  const byStar = new Map<number, number>();
  for (const monster of monsters) byStar.set(monster.star, (byStar.get(monster.star) ?? 0) + 1);
  /*
   * **星は数字で書く。**`starLabel` は「★★★★★」と並べる形なので、
   * 6種類ぶん並ぶとこの1行が横に溢れる。ここは内訳が読めればよい。
   */
  return [...byStar.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([star, count]) => `★${star}×${count}`)
    .join("  ");
}

function renderItemCard(props: MonsterExchangeProps, item: MonsterPointItem): HTMLElement {
  const owned = monsterPointsOwned(props.player);
  const affordable = owned >= item.cost;
  return el("div", { className: "mp-item" }, [
    el("div", { className: "mp-item__icon" }, [item.icon]),
    el("div", { className: "mp-item__body" }, [
      el("div", { className: "mp-item__name" }, [item.name]),
      el("div", { className: "mp-item__detail" }, [item.detail]),
    ]),
    el("div", { className: "mp-item__buy" }, [
      el("div", { className: "mp-item__cost" }, [`${item.cost.toLocaleString("ja-JP")} P`]),
      el("button", {
        type: "button",
        className: "btn btn--primary mp-item__button",
        disabled: !affordable,
        onclick: () => props.onExchange(item.id),
      }, [affordable ? "交換" : `あと${(item.cost - owned).toLocaleString("ja-JP")}`]),
    ]),
  ]);
}

export function renderMonsterExchange(props: MonsterExchangeProps): HTMLElement {
  const owned = monsterPointsOwned(props.player);

  /*
   * **送れない子は最初から並べない。**
   * 並べておいて押した時に断ると、なぜ選べないのかが分からない。
   */
  const sendable = props.player.monsters.filter((monster) => canSendMonster(props.player, monster));
  const context = { partyIds: props.player.partyIds };
  const shown = sortMonsters(filterMonsters(sendable, props.filter, context), props.sortKey, context);

  const selected = props.player.monsters.filter(
    (monster) => props.selectedIds.includes(monster.id) && canSendMonster(props.player, monster),
  );
  const gain = totalMonsterPoints(selected);
  const rare = rareCountOf(selected);

  const grid = createIncrementalGrid({
    memoryKey: "monsterExchange",
    className: `monster-grid${props.dense ? " monster-grid--dense" : ""}`,
    items: shown,
    renderItem: (monster) => monsterCard(monster, () => props.onToggleSelect(monster.id), {
      compact: true,
      dense: props.dense,
      selected: props.selectedIds.includes(monster.id),
      badge: `+${monster.star}P`,
    }),
    moreLabel: (shownCount, total) => `モンスターをさらに表示（${shownCount} / ${total}）`,
  });

  const sendButton = el("button", {
    type: "button",
    className: `btn btn--large mp-send__go${rare > 0 ? " btn--danger" : " btn--primary"}`,
    disabled: selected.length === 0,
    onclick: props.onSend,
  }, [selected.length === 0 ? "送るモンスターを選んでください" : `選んだ${selected.length}体を送る　+${gain}P`]);

  const notice = props.notice
    ? el("p", { className: "shop-notice", role: "status" }, [icon("check"), props.notice])
    : el("span", { className: "shop-notice--none" });

  return el("div", { className: "screen monster-exchange-screen" }, [
    managementHeader("モンスター交換所", props.onBack, `${owned.toLocaleString("ja-JP")} P`),
    notice,

    el("section", { className: "panel mp-shop" }, [
      el("div", { className: "panel-header" }, [el("h2", {}, ["ポイントと交換する"])]),
      el("div", { className: "mp-owned" }, [
        el("span", { className: "mp-owned__label" }, ["所持ポイント"]),
        el("strong", { className: "mp-owned__value" }, [`${owned.toLocaleString("ja-JP")} P`]),
      ]),
      ...MONSTER_POINT_ITEMS.map((item) => renderItemCard(props, item)),
    ]),

    el("section", { className: "panel mp-send" }, [
      el("div", { className: "panel-header" }, [el("h2", {}, ["モンスターを送る"])]),
      el("p", { className: "mp-send__note" }, [
        "送ると、その子の星の数だけポイントになります(★3なら3P)。"
        + "編成に入っている子と、鍵をかけた子は並びません。送った子は戻せません。"
        + "選ぶと、画面の下に「送る」が出ます。",
      ]),
      renderMonsterFilterBar({
        all: sendable,
        shownCount: shown.length,
        filter: props.filter,
        open: props.filterOpen,
        onToggleOpen: props.onToggleFilterOpen,
        onChange: props.onChangeFilter,
      }),
      el("div", { className: "slot-filter-row sort-row" }, MONSTER_SORT_KEYS.map((key) =>
        el("button", {
          type: "button",
          className: `slot-filter-chip${key === props.sortKey ? " slot-filter-chip--active" : ""}`,
          onclick: () => props.onChangeSort(key),
        }, [MONSTER_SORT_LABEL[key]]),
      )),
      el("div", { className: "bulk-bar__row" }, [
        el("button", {
          type: "button",
          className: "btn btn--ghost",
          disabled: shown.length === 0,
          onclick: () => props.onSelectAllShown(shown.map((monster) => monster.id)),
        }, [`表示中をすべて選ぶ (${shown.length})`]),
        el("button", {
          type: "button",
          className: "btn btn--ghost",
          disabled: props.selectedIds.length === 0,
          onclick: props.onClearSelection,
        }, ["選択を解除"]),
      ]),
      shown.length === 0
        ? el("p", { className: "app-subtitle" }, [
          sendable.length === 0
            ? "送れるモンスターがいません。編成から外すか、鍵を外してください。"
            : "条件に当てはまるモンスターがいません。絞り込みを緩めてください。",
        ])
        : grid.element,
      /*
       * **選ぶ前はバーを出さない。**
       *
       * 押せないバーでも画面の下端に貼り付くので、その裏に説明文が入り込む。
       * 実機の360pxで「送った子は戻せません」が丸ごと隠れていた。
       * この案件では「潰れた箱が中身を黙って切り落とす」事故を出しているので、
       * **読ませたい文を覆うくらいなら、まだ要らないバーを出さない。**
       */
      selected.length === 0 ? el("span", { className: "shop-notice--none" }) : stickyActions({
        status: `${selectionBreakdown(selected)}　→　+${gain}P`
          + (rare > 0 ? `　★5以上が${rare}体 含まれています` : ""),
        primary: sendButton,
      }),
    ]),
  ]);
}
