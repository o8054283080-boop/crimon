import { starLabel } from "../../core/monsterInstance.js";
import { findMonsterById } from "../../data/monsters.js";
import { SUMMON_COST_SINGLE, SUMMON_COST_TEN, SummonResult } from "../../game/gacha.js";
import { PlayerState } from "../../game/playerState.js";
import { el } from "../dom.js";

export interface SummonProps {
  player: PlayerState;
  lastResults: SummonResult[] | null;
  onSummon: (count: number) => void;
  onDismissResults: () => void;
  onUseSummonScroll: () => void;
}

function resultCard(r: SummonResult): HTMLElement {
  const dex = findMonsterById(r.dexId);
  return el("div", { className: "summon-card" + (r.isRare ? " summon-card--rare" : "") }, [
    el("div", { className: "summon-card__avatar", style: dex ? `background:${dex.color}` : undefined }, []),
    el("div", { className: "summon-card__name" }, [dex ? dex.name : r.dexId]),
    el("div", { className: "summon-card__star" }, [starLabel(r.star)]),
  ]);
}

export function renderSummon(props: SummonProps): HTMLElement {
  const { player, lastResults, onSummon, onDismissResults, onUseSummonScroll } = props;

  if (lastResults) {
    return el("div", { className: "screen summon-screen" }, [
      el("header", { className: "app-header" }, [el("h1", {}, ["召喚結果"])]),
      el("section", { className: "panel" }, [el("div", { className: "summon-results" }, lastResults.map(resultCard))]),
      el("button", { type: "button", className: "btn btn--primary btn--large", onclick: onDismissResults }, ["OK"]),
    ]);
  }

  const canSingle = player.crystal >= SUMMON_COST_SINGLE;
  const canTen = player.crystal >= SUMMON_COST_TEN;

  return el("div", { className: "screen summon-screen" }, [
    el("header", { className: "app-header" }, [el("h1", {}, ["召喚"]), el("p", { className: "app-subtitle" }, ["光・闇属性はレア枠(排出率低め)です"])]),
    el("section", { className: "panel currency-panel" }, [el("div", { className: "currency-chip" }, [el("span", {}, ["💎"]), ` ${player.crystal}`])]),
    el("section", { className: "panel gacha-info" }, [
      el("p", {}, ["通常属性(火・水・電気・草)は排出率が高く、光・闇はレア枠として排出率が低い代わりに高い星でも排出されます。"]),
      el("p", {}, ["10連召喚では、レアが1体も出なかった場合に必ず1体レア(光/闇)が確定します。"]),
    ]),
    el(
      "button",
      { type: "button", className: "btn btn--primary btn--large", disabled: !canSingle, onclick: () => onSummon(1) },
      [`✨ 1回召喚 (${SUMMON_COST_SINGLE}💎)`],
    ),
    el(
      "button",
      { type: "button", className: "btn btn--primary btn--large", disabled: !canTen, onclick: () => onSummon(10) },
      [`✨✨ 10連召喚 (${SUMMON_COST_TEN}💎)`],
    ),
    el(
      "button",
      { type: "button", className: "btn btn--ghost btn--large", disabled: player.summonScrolls <= 0, onclick: onUseSummonScroll },
      [`📜 召喚の書を使う (所持:${player.summonScrolls})`],
    ),
  ]);
}
