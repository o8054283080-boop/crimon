import { MonsterInstance, starLabel } from "../../core/monsterInstance.js";
import { STAR_MAX_LEVEL } from "../../core/rarity.js";
import { findMonsterById } from "../../data/monsters.js";
import { MAX_DUNGEON_PARTY_SIZE, PlayerState } from "../../game/playerState.js";
import { el } from "../dom.js";

export interface DungeonPartyProps {
  player: PlayerState;
  onToggleMember: (instanceId: string) => void;
  onBack: () => void;
}

function card(instance: MonsterInstance, selected: boolean, onClick: () => void): HTMLElement {
  const dex = findMonsterById(instance.dexId);
  const maxLevel = STAR_MAX_LEVEL[instance.star];
  return el(
    "button",
    {
      type: "button",
      className: "monster-card" + (selected ? " monster-card--selected" : ""),
      onclick: onClick,
    },
    [
      el("div", { className: "monster-card__avatar", style: dex ? `background:${dex.color}` : undefined }, []),
      el("div", { className: "monster-card__name" }, [dex ? dex.name : instance.dexId]),
      el("div", { className: "monster-card__meta" }, [`${starLabel(instance.star)} Lv${instance.level}/${maxLevel}`]),
    ],
  );
}

export function renderDungeonParty(props: DungeonPartyProps): HTMLElement {
  const { player, onToggleMember, onBack } = props;
  const cards = player.monsters.map((instance) =>
    card(instance, player.dungeonPartyIds.includes(instance.id), () => onToggleMember(instance.id)),
  );

  return el("div", { className: "screen party-screen" }, [
    el("header", { className: "app-header" }, [
      el("h1", {}, ["ダンジョン専用パーティ編成"]),
      el("p", { className: "app-subtitle" }, [
        `${player.dungeonPartyIds.length} / ${MAX_DUNGEON_PARTY_SIZE} 体編成中(タップで編成/解除)。通常ステージのパーティとは別枠です。`,
      ]),
    ]),
    el("section", { className: "panel" }, [
      player.monsters.length === 0
        ? el("p", { className: "app-subtitle" }, ["モンスターを所持していません。召喚してみましょう。"])
        : el("div", { className: "monster-grid" }, cards),
    ]),
    el("button", { type: "button", className: "btn btn--ghost btn--large", onclick: onBack }, ["◀ 装備ダンジョンに戻る"]),
  ]);
}
