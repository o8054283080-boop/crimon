import { MonsterInstance, starLabel } from "../../core/monsterInstance.js";
import { STAR_MAX_LEVEL } from "../../core/rarity.js";
import { findMonsterById } from "../../data/monsters.js";
import { PlayerState } from "../../game/playerState.js";
import { el } from "../dom.js";

export interface PartyProps {
  player: PlayerState;
  onToggleParty: (instanceId: string) => void;
}

const MAX_PARTY_SIZE = 4;

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

export function renderParty(props: PartyProps): HTMLElement {
  const { player, onToggleParty } = props;
  const cards = player.monsters.map((instance) =>
    card(instance, player.partyIds.includes(instance.id), () => onToggleParty(instance.id)),
  );

  return el("div", { className: "screen party-screen" }, [
    el("header", { className: "app-header" }, [
      el("h1", {}, ["パーティ編成"]),
      el("p", { className: "app-subtitle" }, [`${player.partyIds.length} / ${MAX_PARTY_SIZE} 体編成中(タップで編成/解除)`]),
    ]),
    el("section", { className: "panel" }, [
      player.monsters.length === 0
        ? el("p", { className: "app-subtitle" }, ["モンスターを所持していません。召喚してみましょう。"])
        : el("div", { className: "monster-grid" }, cards),
    ]),
  ]);
}
