import { canEnhanceEquipment, enhanceEquipmentCost, Equipment, EQUIP_SLOTS, EquipSlot, SET_LABEL, SLOT_LABEL, STAT_LABEL, StatRoll } from "../../core/equipment.js";
import { findMonsterById } from "../../data/monsters.js";
import { findEquippedOwner, PlayerState } from "../../game/playerState.js";
import { el } from "../dom.js";

export interface EquipmentPickerContext {
  monsterId: string;
  slot: EquipSlot;
}

export interface EquipmentProps {
  player: PlayerState;
  detailId: string | null;
  pickerContext: EquipmentPickerContext | null;
  slotFilter: EquipSlot | null;
  onSelectDetail: (id: string | null) => void;
  onEquip: (equipmentId: string, monsterId: string) => void;
  onUnequip: (equipmentId: string) => void;
  onEnhance: (equipmentId: string) => void;
  onCancelPicker: () => void;
  onGoDungeon: () => void;
  onChangeSlotFilter: (slot: EquipSlot | null) => void;
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
      ? equipment.subStats.map((s) => el("div", { className: "equip-card__sub-line" }, [`・${formatStatValue(s)}`]))
      : [el("div", { className: "equip-card__sub-line equip-card__sub-line--empty" }, ["サブステータスなし"])];

  return el(
    "button",
    { type: "button", className: "equip-card", onclick: onClick },
    [
      el("div", { className: "equip-card__slot" }, [`${SLOT_LABEL[equipment.slot]}${equipment.level > 0 ? ` +${equipment.level}` : ""}`]),
      el("div", { className: "equip-card__star" }, ["★".repeat(equipment.star)]),
      el("div", { className: "equip-card__set" }, [SET_LABEL[equipment.set]]),
      el("div", { className: "equip-card__main" }, [`メイン: ${formatStatValue(equipment.mainStat)}`]),
      el("div", { className: "equip-card__subs" }, subLines),
      ownerName ? el("div", { className: "equip-card__owner" }, [`装着中: ${ownerName}`]) : el("div", { className: "equip-card__owner equip-card__owner--free" }, ["未装着"]),
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

function renderList(props: EquipmentProps): HTMLElement {
  const items = props.pickerContext
    ? props.player.equipment.filter((e) => e.slot === props.pickerContext!.slot)
    : props.player.equipment
        .filter((e) => props.slotFilter === null || e.slot === props.slotFilter)
        .slice()
        .sort((a, b) => a.slot - b.slot || b.star - a.star || b.level - a.level);

  const cards = items.map((eq) =>
    equipmentCard(props.player, eq, () => {
      if (props.pickerContext) {
        props.onEquip(eq.id, props.pickerContext.monsterId);
      } else {
        props.onSelectDetail(eq.id);
      }
    }),
  );

  return el("div", { className: "screen equipment-screen" }, [
    el("header", { className: "app-header" }, [
      el("h1", {}, [props.pickerContext ? `スロット${props.pickerContext.slot}の装備を選択` : "所持装備"]),
      el("p", { className: "app-subtitle" }, [`${items.length}個`]),
    ]),
    props.pickerContext
      ? el("button", { type: "button", className: "btn btn--ghost btn--large", onclick: props.onCancelPicker }, ["◀ キャンセル"])
      : el("button", { type: "button", className: "btn btn--primary btn--large", onclick: props.onGoDungeon }, ["🏰 装備ダンジョンに挑戦する"]),
    props.pickerContext ? null : renderSlotFilterRow(props),
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
    el("button", { type: "button", className: "btn btn--ghost btn--large", onclick: () => props.onSelectDetail(null) }, ["◀ 一覧に戻る"]),
  ].filter((n): n is HTMLElement => n !== null));
}

export function renderEquipment(props: EquipmentProps): HTMLElement {
  if (props.pickerContext) return renderList(props);
  const target = props.detailId ? props.player.equipment.find((e) => e.id === props.detailId) : undefined;
  if (target) return renderDetail(props, target);
  return renderList(props);
}
