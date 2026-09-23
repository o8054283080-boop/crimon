import "../ui/accessories.css";
import {
  type Accessory, type AccessoryFamily, type AccessoryRarity, type AccessoryStar,
  ACCESSORY_FAMILIES, ACCESSORY_FAMILY_JA, ACCESSORY_RARITIES, ACCESSORY_RARITY_JA,
  accessoryEnhanceCost, accessorySellPrice, canEnhanceAccessory,
} from "../../core/accessory.js";
import { findMonsterById } from "../../data/monsters.js";
import {
  type AccessoryFilter, type AccessorySortKey, accessoryOwner, findAccessory, sortAndFilterAccessories,
} from "../../game/accessories.js";
import type { PlayerState } from "../../game/playerState.js";
import { el } from "../dom.js";
import { renderAccessoryRow, renderAccessorySummary } from "./accessoryCard.js";

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
  onBack: () => void;
}

const SORTS: { key: AccessorySortKey; label: string }[] = [
  { key: "NEWEST", label: "新しい順" },
  { key: "STAR", label: "★順" },
  { key: "RARITY", label: "レア度順" },
  { key: "LEVEL", label: "Lv順" },
  { key: "MAIN", label: "メイン順" },
];

function monsterName(player: PlayerState, monsterId: string | undefined): string | null {
  if (!monsterId) return null;
  const monster = player.monsters.find((m) => m.id === monsterId);
  if (!monster) return null;
  return `${findMonsterById(monster.dexId)?.name ?? monster.dexId}★${monster.star}`;
}

function chip(label: string, active: boolean, onClick: () => void): HTMLElement {
  return el("button", { type: "button", className: `acc-chip${active ? " acc-chip--active" : ""}`, onclick: onClick }, [label]);
}

function renderFilters(props: AccessoriesProps): HTMLElement[] {
  const f = props.filter;
  const setFilter = (next: Partial<AccessoryFilter>) => props.onChangeFilter({ ...f, ...next });
  return [
    el("div", { className: "acc-filters" }, SORTS.map((s) => chip(s.label, props.sort === s.key, () => props.onChangeSort(s.key)))),
    el("div", { className: "acc-filters" }, [
      chip("全系統", !f.family, () => setFilter({ family: null })),
      ...ACCESSORY_FAMILIES.map((family: AccessoryFamily) =>
        chip(ACCESSORY_FAMILY_JA[family], f.family === family, () => setFilter({ family: f.family === family ? null : family }))),
    ]),
    el("div", { className: "acc-filters" }, [
      chip("全レア", !f.rarity, () => setFilter({ rarity: null })),
      ...ACCESSORY_RARITIES.map((rarity: AccessoryRarity) =>
        chip(ACCESSORY_RARITY_JA[rarity], f.rarity === rarity, () => setFilter({ rarity: f.rarity === rarity ? null : rarity }))),
      ...([4, 5, 6] as AccessoryStar[]).map((star) =>
        chip(`★${star}`, f.star === star, () => setFilter({ star: f.star === star ? null : star }))),
      chip("未装着のみ", f.unequippedOnly === true, () => setFilter({ unequippedOnly: !f.unequippedOnly })),
    ]),
  ];
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
  const selected = props.selectedId ? findAccessory(props.player, props.selectedId) : undefined;
  const pickedName = monsterName(props.player, props.pickFor ?? undefined);
  const pickedMonster = props.pickFor ? props.player.monsters.find((m) => m.id === props.pickFor) : undefined;
  const title = props.pickFor ? `${pickedName ?? ""}のアクセサリー` : "アクセサリー";
  return el("div", { className: "screen accessories-screen" }, [
    el("header", { className: "app-header app-header--row" }, [
      el("button", { type: "button", className: "btn btn--ghost", onclick: props.onBack }, ["◀ 戻る"]),
      el("h1", {}, [title]),
    ]),
    props.notice ? el("p", { className: "acc-note", role: "status" }, [props.notice]) : null,
    props.pickFor && pickedMonster?.accessoryId
      ? el("div", { className: "acc-actions" }, [
        el("button", { type: "button", className: "btn btn--ghost", "data-tour": "accessory-unequip", onclick: props.onUnequipPicked }, ["今のアクセを外す"]),
      ])
      : null,
    selected ? renderDetail(props, selected) : null,
    ...renderFilters(props),
    list.length === 0
      ? el("p", { className: "acc-empty" }, [
        (props.player.accessories ?? []).length === 0
          ? "アクセサリーはまだありません。力の遺跡・守護の遺跡で手に入ります。"
          : "条件に合うアクセサリーはありません。",
      ])
      : el("div", { className: "acc-list" }, list.map((acc) =>
        renderAccessoryRow(acc, {
          selected: acc.id === props.selectedId,
          ownerName: monsterName(props.player, accessoryOwner(props.player, acc.id)?.id),
          onClick: () => props.onSelect(acc.id === props.selectedId ? null : acc.id),
        }))),
  ].filter((n): n is HTMLElement => n !== null));
}
