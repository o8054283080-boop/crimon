import { Equipment, EquipSlot, STAT_LABEL, StatRoll } from "../../core/equipment.js";
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
  onSelectDetail: (id: string | null) => void;
  onEquip: (equipmentId: string, monsterId: string) => void;
  onUnequip: (equipmentId: string) => void;
  onCancelPicker: () => void;
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
  return el(
    "button",
    { type: "button", className: "equip-card", onclick: onClick },
    [
      el("div", { className: "equip-card__slot" }, [`S${equipment.slot}`]),
      el("div", { className: "equip-card__star" }, ["★".repeat(equipment.star)]),
      el("div", { className: "equip-card__main" }, [formatStatValue(equipment.mainStat)]),
      el("div", { className: "equip-card__subs" }, [`サブ${equipment.subStats.length}個`]),
      ownerName ? el("div", { className: "equip-card__owner" }, [`装着中: ${ownerName}`]) : el("div", { className: "equip-card__owner equip-card__owner--free" }, ["未装着"]),
    ],
  );
}

function renderList(props: EquipmentProps): HTMLElement {
  const items = props.pickerContext
    ? props.player.equipment.filter((e) => e.slot === props.pickerContext!.slot)
    : props.player.equipment;

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
      : null,
    el("section", { className: "panel" }, [
      items.length === 0
        ? el("p", { className: "app-subtitle" }, ["該当する装備がありません。ステージクリアでドロップします。"])
        : el("div", { className: "equip-grid" }, cards),
    ]),
  ].filter((n): n is HTMLElement => n !== null));
}

function renderDetail(props: EquipmentProps, equipment: Equipment): HTMLElement {
  const ownerName = equipmentOwnerName(props.player, equipment);

  return el("div", { className: "screen equipment-screen" }, [
    el("header", { className: "app-header" }, [el("h1", {}, [`スロット${equipment.slot}の装備`])]),
    el("section", { className: "panel equip-detail" }, [
      el("div", { className: "equip-detail__star" }, ["★".repeat(equipment.star)]),
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
    ownerName
      ? el("button", { type: "button", className: "btn btn--primary btn--large", onclick: () => props.onUnequip(equipment.id) }, ["外す"])
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
