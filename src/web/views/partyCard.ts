import { MonsterInstance, starLabel } from "../../core/monsterInstance.js";
import { STAR_MAX_LEVEL } from "../../core/rarity.js";
import { findMonsterById } from "../../data/monsters.js";
import { el } from "../dom.js";

/** パーティ編成画面用のモンスターカード。編成中(selected)の場合は「✅ 編成中」バッジを表示する */
export function partyMemberCard(instance: MonsterInstance, selected: boolean, onClick: () => void): HTMLElement {
  const dex = findMonsterById(instance.dexId);
  const maxLevel = STAR_MAX_LEVEL[instance.star];
  const children: (HTMLElement | null)[] = [
    el("div", { className: "monster-card__avatar", style: dex ? `background:${dex.color}` : undefined }, [dex ? dex.emoji : "❓"]),
    el("div", { className: "monster-card__name" }, [dex ? dex.name : instance.dexId]),
    el("div", { className: "monster-card__meta" }, [`${starLabel(instance.star)} Lv${instance.level}/${maxLevel}`]),
    selected ? el("div", { className: "monster-card__badge" }, ["✅ 編成中"]) : null,
  ];
  return el(
    "button",
    { type: "button", className: "monster-card" + (selected ? " monster-card--selected" : ""), onclick: onClick },
    children.filter((n): n is HTMLElement => n !== null),
  );
}

/** 現在編成中のメンバーを、ホーム画面などと同じスロット表示で一覧できるサマリー */
export function renderPartySlots(members: readonly MonsterInstance[], slotCount: number): HTMLElement {
  const slots = Array.from({ length: slotCount }, (_, i) => {
    const instance = members[i];
    if (!instance) {
      return el("div", { className: "party-slot party-slot--empty" }, ["+"]);
    }
    const dex = findMonsterById(instance.dexId);
    return el("div", { className: "party-slot", style: dex ? `background:${dex.color}` : undefined }, [
      el("span", { className: "party-slot__emoji" }, [dex ? dex.emoji : "❓"]),
      el("span", { className: "party-slot__star" }, [starLabel(instance.star)]),
    ]);
  });
  return el("div", { className: "party-slots", style: `grid-template-columns: repeat(${slotCount}, 1fr)` }, slots);
}
