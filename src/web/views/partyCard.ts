import { MonsterInstance, starLabel } from "../../core/monsterInstance.js";
import { STAR_MAX_LEVEL } from "../../core/rarity.js";
import { findMonsterById } from "../../data/monsters.js";
import { monsterPower } from "../../game/monsterSort.js";
import { GEAR_SLOT_TOTAL, equippedCount } from "../monsterFilter.js";
import { el } from "../dom.js";
import { buildMonsterCard } from "./monsterCard.js";
import { withPortrait } from "../three/portrait.js";

/** パーティ編成画面用のモンスターカード。編成中(selected)の場合は「✅ 編成中」バッジを表示する */
export function partyMemberCard(
  instance: MonsterInstance,
  selected: boolean,
  onClick: () => void,
  onLongPress?: () => void,
): HTMLElement {
  const dex = findMonsterById(instance.dexId);
  return buildMonsterCard(dex, instance.dexId, onClick, {
    selected,
    onLongPress,
    star: instance.star,
    level: instance.level,
    maxLevel: STAR_MAX_LEVEL[instance.star],
    // 誰を入れるかは総合力と装備の埋まり具合で決まる。編成画面でこそ要る
    power: monsterPower(instance),
    gearCount: equippedCount(instance),
    gearTotal: GEAR_SLOT_TOTAL,
    badge: selected ? "編成中" : undefined,
    // 中央に出すとレベルの表示を覆ってしまうため、角に寄せる
    badgeCorner: true,
    // 長押しは見えない。同じ詳細へ、目に見える入口も置く
    onDetail: onLongPress,
  });
}

/**
 * 現在編成中のメンバーを、ホーム画面などと同じスロット表示で一覧できるサマリー。
 *
 * `onRemove` を渡すとスロット自体が外すボタンになる。
 * これが無かった頃は、入れ替えるのに**一覧の中から本人を探し直して**
 * もう一度押す必要があり、手持ちが増えるほど遠くなっていた。
 */
export function renderPartySlots(
  members: readonly MonsterInstance[],
  slotCount: number,
  onRemove?: (instanceId: string) => void,
): HTMLElement {
  const slots = Array.from({ length: slotCount }, (_, i) => {
    const instance = members[i];
    if (!instance) {
      return el("div", { className: "party-slot party-slot--empty" }, ["+"]);
    }
    const dex = findMonsterById(instance.dexId);
    const children = [
      withPortrait(el("span", { className: "party-slot__emoji" }, [dex ? dex.emoji : "❓"]), dex, "fill"),
      // 星だけでは育ち具合が分からない。★6のLv1と★6のLv60が同じ見た目になっていた
      el("span", { className: "party-slot__foot" }, [
        el("span", { className: "party-slot__star" }, [starLabel(instance.star)]),
        el("span", { className: "party-slot__lv" }, [`Lv${instance.level}`]),
      ]),
      onRemove ? el("span", { className: "party-slot__remove" }, ["✕"]) : null,
    ].filter((n): n is HTMLElement => n !== null);

    if (!onRemove) {
      return el("div", { className: "party-slot", style: dex ? `background:${dex.color}` : undefined }, children);
    }
    return el(
      "button",
      {
        type: "button",
        className: "party-slot party-slot--removable",
        style: dex ? `background:${dex.color}` : undefined,
        title: `${dex ? dex.name : instance.dexId}を編成から外す`,
        onclick: () => onRemove(instance.id),
      },
      children,
    );
  });
  return el("div", { className: "party-slots", style: `grid-template-columns: repeat(${slotCount}, 1fr)` }, slots);
}
