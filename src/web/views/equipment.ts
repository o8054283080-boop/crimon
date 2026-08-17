import { canEnhanceEquipment, enhanceEquipmentCost, equipmentSellPrice, Equipment, EQUIP_SLOTS, EquipSlot, SET_LABEL, SLOT_LABEL, STAT_LABEL, StatRoll } from "../../core/equipment.js";
import { findMonsterById } from "../../data/monsters.js";
import { findEquippedOwner, PlayerState } from "../../game/playerState.js";
import { el } from "../dom.js";

export interface EquipmentPickerContext {
  monsterId: string;
  slot: EquipSlot;
}

/**
 * 並べ替えの種類。
 *
 * 装備は数十個たまるので、「今その順で見たい理由」が場面ごとに違う。
 * 強い物を探す・売る物を探す・シリーズを揃える、で必要な順序が別なので選べるようにする。
 */
export type EquipmentSortKey = "recommended" | "star" | "level" | "slot" | "set" | "value";

export const EQUIPMENT_SORT_LABEL: Record<EquipmentSortKey, string> = {
  recommended: "おすすめ",
  star: "星の高い順",
  level: "強化の高い順",
  slot: "スロット順",
  set: "シリーズ順",
  value: "売値の高い順",
};

export const EQUIPMENT_SORT_KEYS: EquipmentSortKey[] = ["recommended", "star", "level", "slot", "set", "value"];

export interface EquipmentProps {
  player: PlayerState;
  detailId: string | null;
  pickerContext: EquipmentPickerContext | null;
  slotFilter: EquipSlot | null;
  sortKey: EquipmentSortKey;
  /** 一括売却のために選ばれている装備 */
  selectedIds: string[];
  /** 選択モード中かどうか。通常は札を押すと詳細へ、選択モード中は選択の切り替えになる */
  selecting: boolean;
  onSelectDetail: (id: string | null) => void;
  onEquip: (equipmentId: string, monsterId: string) => void;
  onUnequip: (equipmentId: string) => void;
  onEnhance: (equipmentId: string) => void;
  onSell: (equipmentId: string) => void;
  onCancelPicker: () => void;
  onGoDungeon: () => void;
  onChangeSlotFilter: (slot: EquipSlot | null) => void;
  onChangeSort: (key: EquipmentSortKey) => void;
  onToggleSelecting: () => void;
  onToggleSelected: (equipmentId: string) => void;
  onSelectAllShown: (ids: string[]) => void;
  onClearSelection: () => void;
  onBulkSell: () => void;
}

function formatStatValue(roll: StatRoll): string {
  const isFlat = roll.type === "ATK_FLAT" || roll.type === "DEF_FLAT" || roll.type === "HP_FLAT" || roll.type === "SPD";
  if (isFlat) return `${STAT_LABEL[roll.type]}${roll.value}`;
  return `${STAT_LABEL[roll.type]}${(roll.value * 100).toFixed(1)}%`;
}

function equipmentOwnerName(player: PlayerState, equipment: Equipment): string | null {
  const owner = findEquippedOwner(player, equipment.id);
  if (!owner) return null;
  const dex = findMonsterById(owner.dexId);
  return dex ? dex.name : owner.dexId;
}

function equipmentCard(player: PlayerState, equipment: Equipment, onClick: () => void): HTMLElement {
  const ownerName = equipmentOwnerName(player, equipment);
  const subLines =
    equipment.subStats.length > 0
      ? equipment.subStats.map((s) => el("div", { className: "equip-card__sub-line" }, [formatStatValue(s)]))
      : [el("div", { className: "equip-card__sub-line equip-card__sub-line--empty" }, ["サブステータスなし"])];

  // 等級・シリーズ・強化段階を data 属性で持たせ、色と縁取りはCSS側で当てる。
  // 数十枚を並べる画面なので、文字を読まなくても強さの序列が分かることを優先する
  return el(
    "button",
    {
      type: "button",
      className: "equip-card",
      onclick: onClick,
      "data-star": String(equipment.star),
      "data-set": equipment.set,
      "data-tier": equipment.level >= 12 ? "max" : equipment.level >= 6 ? "mid" : "low",
    },
    [
      el("div", { className: "equip-card__head" }, [
        el("span", { className: "equip-card__slot" }, [SLOT_LABEL[equipment.slot]]),
        el("span", { className: "equip-card__set" }, [SET_LABEL[equipment.set]]),
        el("span", { className: "equip-card__level" }, [`+${equipment.level}`]),
      ]),
      el("div", { className: "equip-card__star" }, ["★".repeat(equipment.star)]),
      el("div", { className: "equip-card__main" }, [formatStatValue(equipment.mainStat)]),
      el("div", { className: "equip-card__subs" }, subLines),
      ownerName
        ? el("div", { className: "equip-card__owner" }, [ownerName])
        : el("div", { className: "equip-card__owner equip-card__owner--free" }, ["未装着"]),
    ],
  );
}

function renderSlotFilterRow(props: EquipmentProps): HTMLElement {
  const allChip = el(
    "button",
    {
      type: "button",
      className: `slot-filter-chip${props.slotFilter === null ? " slot-filter-chip--active" : ""}`,
      onclick: () => props.onChangeSlotFilter(null),
    },
    ["すべて"],
  );
  const slotChips = EQUIP_SLOTS.map((slot) =>
    el(
      "button",
      {
        type: "button",
        className: `slot-filter-chip${props.slotFilter === slot ? " slot-filter-chip--active" : ""}`,
        onclick: () => props.onChangeSlotFilter(slot),
      },
      [SLOT_LABEL[slot]],
    ),
  );
  return el("div", { className: "slot-filter-row" }, [allChip, ...slotChips]);
}

/** 並べ替えの本体。どの順でも、装着中のものは先に出して事故を防ぐ */
function compareBySort(key: EquipmentSortKey, isEquipped: (e: Equipment) => boolean): (a: Equipment, b: Equipment) => number {
  return (a, b) => {
    switch (key) {
      case "star":
        return b.star - a.star || b.level - a.level || a.slot - b.slot;
      case "level":
        return b.level - a.level || b.star - a.star || a.slot - b.slot;
      case "slot":
        return a.slot - b.slot || b.star - a.star || b.level - a.level;
      case "set":
        return a.set.localeCompare(b.set) || b.star - a.star || b.level - a.level;
      case "value":
        return equipmentSellPrice(b) - equipmentSellPrice(a);
      default:
        // おすすめ: 装着中 → スロット → 星 → 強化。普段使いの並び
        return Number(isEquipped(b)) - Number(isEquipped(a)) || a.slot - b.slot || b.star - a.star || b.level - a.level;
    }
  };
}

function renderSortRow(props: EquipmentProps): HTMLElement {
  return el(
    "div",
    { className: "slot-filter-row sort-row" },
    EQUIPMENT_SORT_KEYS.map((key) =>
      el(
        "button",
        {
          type: "button",
          className: `slot-filter-chip${props.sortKey === key ? " slot-filter-chip--active" : ""}`,
          onclick: () => props.onChangeSort(key),
        },
        [EQUIPMENT_SORT_LABEL[key]],
      ),
    ),
  );
}

/** 一括売却の操作帯。選択モードの時だけ出す */
function renderBulkBar(props: EquipmentProps, shown: Equipment[]): HTMLElement {
  const isEquipped = (e: Equipment) => equipmentOwnerName(props.player, e) !== null;
  // 装着中のものは売れないので、まとめて選ぶ対象からも外す
  const sellable = shown.filter((e) => !isEquipped(e));
  const selected = props.player.equipment.filter((e) => props.selectedIds.includes(e.id));
  const total = selected.reduce((sum, e) => sum + equipmentSellPrice(e), 0);

  return el("div", { className: "bulk-bar" }, [
    el("div", { className: "bulk-bar__row" }, [
      el("button", { type: "button", className: "btn btn--ghost", onclick: () => props.onSelectAllShown(sellable.map((e) => e.id)) }, [
        `表示中をすべて選ぶ (${sellable.length})`,
      ]),
      el("button", { type: "button", className: "btn btn--ghost", onclick: props.onClearSelection }, ["選択を解除"]),
    ]),
    el("div", { className: "bulk-bar__summary" }, [`${selected.length}個を選択中 ・ 売値 🪙${total.toLocaleString()}`]),
    el(
      "button",
      {
        type: "button",
        className: "btn btn--primary btn--large",
        disabled: selected.length === 0,
        onclick: props.onBulkSell,
      },
      [`💰 選択した${selected.length}個を売却する`],
    ),
  ]);
}

function renderList(props: EquipmentProps): HTMLElement {
  const isEquipped = (e: Equipment) => equipmentOwnerName(props.player, e) !== null;
  const items = props.pickerContext
    ? props.player.equipment.filter((e) => e.slot === props.pickerContext!.slot)
    : props.player.equipment
        .filter((e) => props.slotFilter === null || e.slot === props.slotFilter)
        .slice()
        .sort(compareBySort(props.sortKey, isEquipped));

  const selecting = props.selecting && !props.pickerContext;

  const cards = items.map((eq) => {
    const card = equipmentCard(props.player, eq, () => {
      if (props.pickerContext) {
        props.onEquip(eq.id, props.pickerContext.monsterId);
      } else if (selecting) {
        // 装着中は売れないので、選択そのものをさせない
        if (!isEquipped(eq)) props.onToggleSelected(eq.id);
      } else {
        props.onSelectDetail(eq.id);
      }
    });
    if (selecting) {
      card.classList.add("equip-card--selectable");
      if (isEquipped(eq)) card.classList.add("equip-card--locked");
      if (props.selectedIds.includes(eq.id)) card.classList.add("equip-card--selected");
    }
    return card;
  });

  return el("div", { className: "screen equipment-screen" }, [
    el("header", { className: "app-header" }, [
      el("h1", {}, [props.pickerContext ? `スロット${props.pickerContext.slot}の装備を選択` : "所持装備"]),
      el("p", { className: "app-subtitle" }, [`${items.length}個`]),
    ]),
    props.pickerContext
      ? el("button", { type: "button", className: "btn btn--ghost btn--large", onclick: props.onCancelPicker }, ["◀ キャンセル"])
      : el("button", { type: "button", className: "btn btn--primary btn--large", onclick: props.onGoDungeon }, ["🏰 装備ダンジョンに挑戦する"]),
    props.pickerContext ? null : renderSlotFilterRow(props),
    props.pickerContext ? null : renderSortRow(props),
    props.pickerContext
      ? null
      : el(
          "button",
          { type: "button", className: `btn ${selecting ? "btn--primary" : "btn--ghost"}`, onclick: props.onToggleSelecting },
          [selecting ? "✓ 選択を終える" : "☑ まとめて売却する"],
        ),
    selecting ? renderBulkBar(props, items) : null,
    el("section", { className: "panel" }, [
      items.length === 0
        ? el("p", { className: "app-subtitle" }, ["該当する装備がありません。ステージクリアでドロップします。"])
        : el("div", { className: "equip-grid" }, cards),
    ]),
  ].filter((n): n is HTMLElement => n !== null));
}

function renderDetail(props: EquipmentProps, equipment: Equipment): HTMLElement {
  const ownerName = equipmentOwnerName(props.player, equipment);
  const canEnhance = canEnhanceEquipment(equipment);
  const cost = enhanceEquipmentCost(equipment);
  const canAfford = props.player.gold >= cost;
  const sellPrice = equipmentSellPrice(equipment);
  const isEquipped = ownerName !== null;

  return el("div", { className: "screen equipment-screen" }, [
    el("header", { className: "app-header" }, [el("h1", {}, [`スロット${equipment.slot}の装備`])]),
    el("section", { className: "panel equip-detail" }, [
      el("div", { className: "equip-detail__star" }, ["★".repeat(equipment.star)]),
      el("div", { className: "equip-detail__set" }, [`${SET_LABEL[equipment.set]}シリーズ`]),
      el("div", { className: "equip-detail__level" }, [`強化 +${equipment.level} / 15`]),
      el("div", { className: "equip-detail__main" }, [`メイン: ${formatStatValue(equipment.mainStat)}`]),
      equipment.subStats.length > 0
        ? el(
            "div",
            { className: "equip-detail__subs" },
            equipment.subStats.map((s) => el("div", {}, [`サブ: ${formatStatValue(s)}`])),
          )
        : el("p", { className: "app-subtitle" }, ["サブステータスなし"]),
      ownerName ? el("p", {}, [`装着中: ${ownerName}`]) : el("p", { className: "app-subtitle" }, ["未装着"]),
    ]),
    canEnhance
      ? el(
          "button",
          {
            type: "button",
            className: "btn btn--primary btn--large",
            disabled: !canAfford,
            onclick: () => props.onEnhance(equipment.id),
          },
          [`⬆ 強化する (🪙${cost})`],
        )
      : el("div", { className: "panel rankup-hint" }, ["最大強化レベルに到達しています"]),
    ownerName
      ? el("button", { type: "button", className: "btn btn--ghost btn--large", onclick: () => props.onUnequip(equipment.id) }, ["外す"])
      : null,
    isEquipped ? el("p", { className: "app-subtitle" }, ["装着中の装備は売却できません(先に外してください)"]) : null,
    el(
      "button",
      { type: "button", className: "btn btn--ghost btn--large", disabled: isEquipped, onclick: () => props.onSell(equipment.id) },
      [`💰 売却する (🪙${sellPrice})`],
    ),
    el("button", { type: "button", className: "btn btn--ghost btn--large", onclick: () => props.onSelectDetail(null) }, ["◀ 一覧に戻る"]),
  ].filter((n): n is HTMLElement => n !== null));
}

export function renderEquipment(props: EquipmentProps): HTMLElement {
  if (props.pickerContext) return renderList(props);
  const target = props.detailId ? props.player.equipment.find((e) => e.id === props.detailId) : undefined;
  if (target) return renderDetail(props, target);
  return renderList(props);
}
