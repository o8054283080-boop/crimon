import "../ui/accessories.css";
import {
  type Accessory,
  accessoryEnhanceCost, accessorySellPrice, canEnhanceAccessory,
} from "../../core/accessory.js";
import { findMonsterById } from "../../data/monsters.js";
import {
  type AccessoryFilter, type AccessorySortKey, accessoriesOf, accessoryOwner, findAccessory,
  sellableAccessoryIds, sortAndFilterAccessories, wornAccessoryIds,
} from "../../game/accessories.js";
import type { PlayerState } from "../../game/playerState.js";
import { el } from "../dom.js";
import { icon } from "../icons.js";
import { renderAccessoryRow, renderAccessorySummary } from "./accessoryCard.js";
import { renderAccessoryFilterBar } from "./accessoryFilterBar.js";
import { screenHeader } from "./managementHeader.js";

/**
 * アクセサリーの一覧。**持ち物の確認と、着ける先を選ぶ画面を兼ねる。**
 *
 * `pickFor` があれば「その1体に着けるアクセを選ぶ」画面になる
 * (モンスター詳細のアクセ枠から来た時)。
 */
export interface AccessoriesProps {
  player: PlayerState;
  sort: AccessorySortKey;
  filter: AccessoryFilter;
  selectedId: string | null;
  /** 着ける先のモンスター。無ければ一覧を見るだけ */
  pickFor: string | null;
  notice: string | null;
  onSelect: (id: string | null) => void;
  onChangeSort: (sort: AccessorySortKey) => void;
  onChangeFilter: (filter: AccessoryFilter) => void;
  onEquip: (accessoryId: string) => void;
  onUnequipPicked: () => void;
  onEnhance: (accessoryId: string) => void;
  onSell: (accessoryId: string) => void;
  onToggleLock: (accessoryId: string) => void;
  /** 見出しの直後に出す切り替え(装備画面の中で開いた時だけ) */
  tabs?: HTMLElement;
  /** 絞り込みの札を開いているか(装備の一覧と同じく、既定は畳む) */
  filterOpen: boolean;
  onToggleFilterOpen: () => void;
  /**
   * まとめ売りの選択モード中か。**着ける先を選ぶ画面(`pickFor`)では出さない**
   * ——着けに来た人の前に売却の操作を並べると、押し間違えた時に取り返しがつかない。
   */
  selecting: boolean;
  /** まとめ売りに選ばれているアクセ */
  selectedIds: readonly string[];
  onToggleSelecting: () => void;
  onToggleSelected: (accessoryId: string) => void;
  /** 画面が渡したID(絞り込みで見えていて、売れるもの)だけを選ぶ */
  onSelectAllShown: (ids: string[]) => void;
  onClearSelection: () => void;
  onBulkSell: () => void;
  /** 遺跡へ行く。装備画面の「装備ダンジョン」と同じ位置に置く(無ければ出さない) */
  onGoRuins?: () => void;
}

/*
 * 並べ替えは**装備と同じくネイティブの選択欄**にする。
 * 札を5枚並べていた頃は、それだけで1段を取り、絞り込みの札と同じ見た目で続いていた。
 */
const SORTS: { key: AccessorySortKey; label: string }[] = [
  { key: "NEWEST", label: "新しい順" },
  { key: "STAR", label: "★の高い順" },
  { key: "RARITY", label: "レア度順" },
  { key: "LEVEL", label: "強化順" },
  { key: "MAIN", label: "メインの高い順" },
];

function monsterName(player: PlayerState, monsterId: string | undefined): string | null {
  if (!monsterId) return null;
  const monster = player.monsters.find((m) => m.id === monsterId);
  if (!monster) return null;
  return `${findMonsterById(monster.dexId)?.name ?? monster.dexId}★${monster.star}`;
}

/** 並べ替えの帯。**装備の一覧と同じ部品(`equip-sort`)**で、1段に収める */
function renderSortRow(props: AccessoriesProps): HTMLElement {
  return el("div", { className: "equip-sort acc-sort" }, [
    el("label", { className: "equip-sort__label", htmlFor: "accessory-sort" }, ["並べ替え"]),
    el("div", { className: "equip-sort__control" }, [
      el("select", {
        id: "accessory-sort",
        className: "equip-sort__select",
        value: props.sort,
        ariaLabel: "アクセサリーの並べ替え",
        onchange: (event: Event) => props.onChangeSort((event.currentTarget as HTMLSelectElement).value as AccessorySortKey),
      }, SORTS.map((s) => el("option", { value: s.key, selected: s.key === props.sort }, [s.label]))),
    ]),
  ]);
}

/**
 * 上の操作帯。**装備の一覧と同じ形**(左に行き先、右にまとめ売り)。
 * 装備とアクセを切り替えても、同じ位置に同じ道具があるようにする。
 */
function renderToolbar(props: AccessoriesProps): HTMLElement {
  const selectButton = el("button", {
    type: "button",
    className: `btn equip-toolbar__select${props.selecting ? " equip-toolbar__select--on" : ""}`,
    "data-tour": "accessory-bulk-toggle",
    "aria-pressed": String(props.selecting),
    onclick: props.onToggleSelecting,
  }, [icon("check"), el("span", {}, [props.selecting ? "選択を終える" : "まとめ売り"])]);
  const goRuins = props.onGoRuins
    ? el("button", { type: "button", className: "btn btn--gold equip-toolbar__go", onclick: props.onGoRuins }, [
      el("span", { className: "acc-toolbar__ring", ariaHidden: "true" }, ["💍"]),
      el("span", {}, ["遺跡へ行く"]),
    ])
    : null;
  return el("div", { className: `equip-toolbar${goRuins ? "" : " acc-toolbar--single"}` },
    ([goRuins, selectButton] as (HTMLElement | null)[]).filter((n): n is HTMLElement => n !== null));
}

/**
 * まとめ売りの操作帯。選択モードの時だけ出す。**装備の一覧と同じ部品(`bulk-bar`)。**
 *
 * 「表示中をすべて選ぶ」は、**絞り込みで見えているもののうち、売れるものだけ。**
 * 全件を選ぶと、絞り込んだ意味が無いうえに見えていないものまで売れてしまう。
 */
function renderBulkBar(props: AccessoriesProps, shown: readonly Accessory[]): HTMLElement {
  const worn = wornAccessoryIds(props.player);
  const sellableShown = sellableAccessoryIds(shown, worn);
  // 合計は「今も売れるもの」だけで数える。選んだ後に鍵を掛けたものは数に入れない
  const picked = accessoriesOf(props.player)
    .filter((acc) => props.selectedIds.includes(acc.id) && acc.locked !== true && !worn.has(acc.id));
  const total = picked.reduce((sum, acc) => sum + accessorySellPrice(acc), 0);
  return el("div", { className: "bulk-bar acc-bulk-bar" }, [
    el("div", { className: "bulk-bar__row" }, [
      el("button", {
        type: "button",
        className: "btn btn--ghost",
        disabled: sellableShown.length === 0,
        onclick: () => props.onSelectAllShown(sellableShown),
      }, [`表示中をすべて選ぶ (${sellableShown.length})`]),
      el("button", { type: "button", className: "btn btn--ghost", onclick: props.onClearSelection }, ["選択を解除"]),
    ]),
    // 売値は**押す前に見せる**。押してから知る金額であってはいけない
    el("div", { className: "bulk-bar__summary" }, [
      `${picked.length}個を選択中`,
      el("span", { className: "bulk-bar__price" }, [icon("coin"), el("strong", {}, [total.toLocaleString("ja-JP")])]),
    ]),
    el("button", {
      type: "button",
      className: "btn btn--danger btn--large bulk-bar__go",
      "data-tour": "accessory-bulk-sell",
      disabled: picked.length === 0,
      onclick: props.onBulkSell,
    }, [icon("tag"), `${picked.length}個を売却　+${total.toLocaleString("ja-JP")}G`]),
  ]);
}

function renderDetail(props: AccessoriesProps, acc: Accessory): HTMLElement {
  const owner = accessoryOwner(props.player, acc.id);
  const ownerName = monsterName(props.player, owner?.id);
  const canEnhance = canEnhanceAccessory(acc);
  const cost = canEnhance ? accessoryEnhanceCost(acc) : 0;
  const picking = props.pickFor !== null;
  const pickedName = monsterName(props.player, props.pickFor ?? undefined);
  const wornByPicked = picking && owner?.id === props.pickFor;
  return el("section", { className: "card acc-detail" }, [
    renderAccessorySummary(acc),
    ownerName ? el("p", { className: "acc-note" }, [`装着中: ${ownerName}`]) : null,
    el("div", { className: "acc-actions" }, [
      picking
        ? el("button", {
          type: "button",
          className: "btn btn--primary",
          "data-tour": "accessory-equip",
          disabled: wornByPicked,
          onclick: () => props.onEquip(acc.id),
        }, [wornByPicked ? "着けています" : `${pickedName ?? "このモンスター"}に着ける`])
        : null,
      el("button", {
        type: "button",
        className: "btn btn--ghost",
        disabled: !canEnhance || props.player.gold < cost,
        onclick: () => props.onEnhance(acc.id),
      }, [canEnhance ? `強化 Lv${acc.level}→${acc.level + 1}(🪙${cost.toLocaleString("ja-JP")})` : "最大Lv"]),
      el("button", {
        type: "button",
        className: "btn btn--ghost",
        onclick: () => props.onToggleLock(acc.id),
      }, [acc.locked ? "🔓 ロック解除" : "🔒 ロック"]),
      el("button", {
        type: "button",
        className: "btn btn--ghost",
        disabled: acc.locked === true || owner !== undefined,
        onclick: () => props.onSell(acc.id),
      }, [`売却(🪙${accessorySellPrice(acc).toLocaleString("ja-JP")})`]),
    ].filter((n) => n !== null) as HTMLElement[]),
    owner !== undefined || acc.locked
      ? el("p", { className: "acc-note" }, [owner !== undefined ? "装着中は売却できません(先に外してください)" : "ロック中は売却できません"])
      : null,
    el("p", { className: "acc-note" }, ["強化はゴールドだけで、失敗しません。Lv5・10・15で弱効果が少し強くなります。"]),
  ].filter((n): n is HTMLElement => n !== null));
}

export function renderAccessories(props: AccessoriesProps): HTMLElement {
  const list = sortAndFilterAccessories(props.player, props.sort, props.filter);
  const all = accessoriesOf(props.player);
  const selecting = props.selecting && props.pickFor === null;
  // まとめ売りで選んでいる間は詳細を出さない(札を押す意味が「選ぶ」に変わっているため)
  const selected = !selecting && props.selectedId ? findAccessory(props.player, props.selectedId) : undefined;
  const pickedName = monsterName(props.player, props.pickFor ?? undefined);
  const pickedMonster = props.pickFor ? props.player.monsters.find((m) => m.id === props.pickFor) : undefined;
  const title = props.pickFor ? `${pickedName ?? ""}のアクセサリー` : "アクセサリー";
  const worn = wornAccessoryIds(props.player);
  return el("div", { className: `screen accessories-screen${selecting ? " accessories-screen--selecting" : ""}` }, [
    /*
     * 装備画面の中で開いた時は、**装備側と同じ見出し**(「所持装備 / ○個」)にそろえる。
     * 切り替えるたびに見出しの形が変わると、別の画面へ飛んだように見える。
     */
    props.tabs
      // 見出しは**持っている数**(タブと同じ数)。絞った後の数は絞り込みの帯が言う
      ? screenHeader("所持アクセサリー", { meta: `${all.length}個` })
      // 装備の枠を選び直す時(「スロット1を変更 / 名前」)と同じ形にそろえる
      : screenHeader(props.pickFor ? "アクセを変更" : title, props.pickFor && pickedName ? { meta: pickedName } : {}),
    props.tabs ?? null,
    props.notice ? el("p", { className: "acc-note", role: "status" }, [props.notice]) : null,
    props.pickFor && pickedMonster?.accessoryId
      ? el("div", { className: "acc-actions" }, [
        el("button", { type: "button", className: "btn btn--ghost", "data-tour": "accessory-unequip", onclick: props.onUnequipPicked }, ["今のアクセを外す"]),
      ])
      : null,
    props.pickFor === null ? renderToolbar(props) : null,
    selected ? renderDetail(props, selected) : null,
    // 絞り込みは**流れの中**に置く。浮かせると下の札を覆って押せなくする
    renderAccessoryFilterBar({
      all,
      shownCount: list.length,
      filter: props.filter,
      open: props.filterOpen,
      onToggleOpen: props.onToggleFilterOpen,
      onChange: props.onChangeFilter,
    }),
    renderSortRow(props),
    selecting ? renderBulkBar(props, list) : null,
    list.length === 0
      ? el("p", { className: "acc-empty" }, [
        all.length === 0
          ? "アクセサリーはまだありません。力の遺跡・守護の遺跡で手に入ります。"
          : "条件に合うアクセサリーはありません。",
      ])
      : el("div", { className: "acc-list" }, list.map((acc) => {
        const blocked = acc.locked === true || worn.has(acc.id);
        return renderAccessoryRow(acc, {
          selected: !selecting && acc.id === props.selectedId,
          ownerName: monsterName(props.player, accessoryOwner(props.player, acc.id)?.id),
          bulk: selecting ? (blocked ? "BLOCKED" : props.selectedIds.includes(acc.id) ? "PICKED" : "FREE") : undefined,
          onClick: () => {
            if (!selecting) {
              props.onSelect(acc.id === props.selectedId ? null : acc.id);
              return;
            }
            // ロック中・装着中は売れないので、選ぶことそのものをさせない
            if (!blocked) props.onToggleSelected(acc.id);
          },
        });
      })),
  ].filter((n): n is HTMLElement => n !== null));
}
