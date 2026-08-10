import { MonsterDefinition } from "../../core/monster.js";
import { MONSTER_TEMPLATES_DEX } from "../../data/monsters.js";
import { el } from "../dom.js";
import { renderSkillRows } from "./skillPanel.js";

export interface MonsterDexProps {
  selectedDexId: string | null;
  onSelectEntry: (dexId: string | null) => void;
  onBack: () => void;
}

function dexCard(dex: MonsterDefinition, onClick: () => void): HTMLElement {
  return el(
    "button",
    { type: "button", className: "monster-card", onclick: onClick },
    [
      el("div", { className: "monster-card__avatar", style: `background:${dex.color}` }, []),
      el("div", { className: "monster-card__name" }, [dex.name]),
      el("div", { className: "monster-card__meta" }, [dex.role]),
    ],
  );
}

function renderList(props: MonsterDexProps): HTMLElement {
  const cards = MONSTER_TEMPLATES_DEX.map((dex) => dexCard(dex, () => props.onSelectEntry(dex.id)));

  return el("div", { className: "screen monsters-screen" }, [
    el("header", { className: "app-header" }, [
      el("h1", {}, ["モンスター図鑑"]),
      el("p", { className: "app-subtitle" }, [`${MONSTER_TEMPLATES_DEX.length}体掲載中。タップでスキルを確認できます。`]),
    ]),
    el("section", { className: "panel" }, [el("div", { className: "monster-grid" }, cards)]),
    el("button", { type: "button", className: "btn btn--ghost btn--large", onclick: props.onBack }, ["◀ 戻る"]),
  ]);
}

function renderDetail(props: MonsterDexProps, dex: MonsterDefinition): HTMLElement {
  const statLines = [`HP ${dex.stats.hp}`, `ATK ${dex.stats.atk}`, `DEF ${dex.stats.def}`, `SPD ${dex.stats.spd}`];

  return el("div", { className: "screen monsters-screen" }, [
    el("header", { className: "app-header" }, [el("h1", {}, [dex.name])]),
    el("section", { className: "panel monster-detail" }, [
      el("div", { className: "monster-detail__avatar", style: `background:${dex.color}` }, []),
      el("div", { className: "role-badge" }, [dex.role]),
      el("div", { className: "monster-detail__stats" }, statLines.map((line) => el("div", {}, [line]))),
      el("p", { className: "app-subtitle" }, ["星1・レベル1時点の基礎ステータスです(育成・装備で変化します)"]),
    ]),
    el("section", { className: "panel" }, [el("h2", {}, ["スキル"]), ...renderSkillRows(dex.skills)]),
    el("button", { type: "button", className: "btn btn--ghost btn--large", onclick: () => props.onSelectEntry(null) }, ["◀ 図鑑一覧に戻る"]),
  ]);
}

export function renderMonsterDex(props: MonsterDexProps): HTMLElement {
  const dex = props.selectedDexId ? MONSTER_TEMPLATES_DEX.find((d) => d.id === props.selectedDexId) : undefined;
  if (dex) return renderDetail(props, dex);
  return renderList(props);
}
