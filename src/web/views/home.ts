import { findMonsterById } from "../../data/monsters.js";
import { starLabel } from "../../core/monsterInstance.js";
import { getParty, PlayerState } from "../../game/playerState.js";
import { el } from "../dom.js";

export interface HomeProps {
  player: PlayerState;
  onGoSummon: () => void;
  onGoStages: () => void;
  onGoParty: () => void;
  onGoEquipDungeon: () => void;
}

export function renderHome(props: HomeProps): HTMLElement {
  const { player, onGoSummon, onGoStages, onGoParty, onGoEquipDungeon } = props;
  const party = getParty(player);

  const partySlots = Array.from({ length: 4 }, (_, i) => {
    const instance = party[i];
    if (!instance) {
      return el("div", { className: "party-slot party-slot--empty" }, ["+"]);
    }
    const dex = findMonsterById(instance.dexId);
    return el("div", { className: "party-slot", style: dex ? `background:${dex.color}` : undefined }, [
      el("span", { className: "party-slot__star" }, [starLabel(instance.star)]),
    ]);
  });

  return el("div", { className: "screen home-screen" }, [
    el("header", { className: "app-header" }, [el("h1", {}, ["Crimon"]), el("p", { className: "app-subtitle" }, ["周回してモンスターを育てよう"])]),
    el("section", { className: "panel currency-panel" }, [
      el("div", { className: "currency-chip" }, [el("span", {}, ["💎"]), ` ${player.crystal}`]),
      el("div", { className: "currency-chip" }, [el("span", {}, ["🪙"]), ` ${player.gold}`]),
    ]),
    el("section", { className: "panel" }, [
      el("div", { className: "panel-header" }, [el("h2", {}, ["現在のパーティ"]), el("button", { type: "button", className: "btn btn--ghost", onclick: onGoParty }, ["編成へ"])]),
      el("div", { className: "party-slots" }, partySlots),
    ]),
    el("button", { type: "button", className: "btn btn--primary btn--large", onclick: onGoStages }, ["🗺 ステージに挑戦する"]),
    el("button", { type: "button", className: "btn btn--ghost btn--large", onclick: onGoSummon }, ["✨ モンスターを召喚する"]),
    el("button", { type: "button", className: "btn btn--ghost btn--large", onclick: onGoEquipDungeon }, ["🏰 装備ダンジョンに挑戦する"]),
  ]);
}
