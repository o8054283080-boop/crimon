import { MonsterDefinition } from "../../core/monster.js";
import { formatExtraStatLines } from "../../core/stats.js";
import { LATENT_ABILITY_CANDIDATES } from "../../data/latentAbilities.js";
import { ALL_DISPLAYABLE_MONSTERS_DEX } from "../../data/monsters.js";
import { el } from "../dom.js";
import { buildMonsterCard } from "./monsterCard.js";
import { renderSkillGrowthRows } from "./skillPanel.js";
import { withPortrait } from "../three/portrait.js";

export interface MonsterDexProps {
  selectedDexId: string | null;
  onSelectEntry: (dexId: string | null) => void;
  onBack: () => void;
}

function dexCard(dex: MonsterDefinition, onClick: () => void): HTMLElement {
  return buildMonsterCard(dex, dex.id, onClick, { caption: dex.role });
}

function renderList(props: MonsterDexProps): HTMLElement {
  const cards = ALL_DISPLAYABLE_MONSTERS_DEX.map((dex) => dexCard(dex, () => props.onSelectEntry(dex.id)));

  return el("div", { className: "screen monsters-screen" }, [
    el("header", { className: "app-header" }, [
      el("h1", {}, ["モンスター図鑑"]),
      el("p", { className: "app-subtitle" }, [`${ALL_DISPLAYABLE_MONSTERS_DEX.length}体掲載中。タップでスキルを確認できます。`]),
    ]),
    el("section", { className: "panel" }, [el("div", { className: "monster-grid" }, cards)]),
    el("button", { type: "button", className: "btn btn--ghost btn--large", onclick: props.onBack }, ["◀ 戻る"]),
  ]);
}

function renderLatentSkillChoices(dex: MonsterDefinition): HTMLElement {
  const candidates = LATENT_ABILITY_CANDIDATES[dex.id] ?? [];
  return el("section", { className: "panel dex-latent" }, [
    el("h2", {}, ["潜在覚醒：スキル1強化"]),
    el("p", { className: "app-subtitle" }, [
      `${dex.skills[0]?.name ?? "スキル1"}は潜在覚醒すると、下の3つから強化先を1つ選べます。`,
    ]),
    el("div", { className: "dex-latent__choices" }, candidates.map((candidate, index) =>
      el("article", { className: "dex-latent__choice" }, [
        el("span", { className: "dex-latent__number" }, [`候補 ${index + 1}`]),
        el("strong", {}, [candidate.name]),
        el("p", {}, [candidate.description]),
      ]),
    )),
  ]);
}

function renderDetail(props: MonsterDexProps, dex: MonsterDefinition): HTMLElement {
  const statLines = [
    `HP ${dex.stats.hp}`,
    `ATK ${dex.stats.atk}`,
    `DEF ${dex.stats.def}`,
    `SPD ${dex.stats.spd}`,
    ...formatExtraStatLines(dex.stats),
  ];

  return el("div", { className: "screen monsters-screen" }, [
    el("header", { className: "app-header" }, [el("h1", {}, [dex.name])]),
    el("section", { className: "panel monster-detail" }, [
      withPortrait(el("div", { className: "monster-detail__avatar", style: `background:${dex.color}` }, [dex.emoji]), dex),
      el("div", { className: "role-badge" }, [dex.role]),
      el("div", { className: "monster-detail__stats" }, statLines.map((line) => el("div", {}, [line]))),
      el("p", { className: "app-subtitle" }, ["基礎ステータス(星・レベル・育成・装備で変化します)"]),
    ]),
    el("section", { className: "panel" }, [
      el("h2", {}, ["スキル"]),
      el("p", { className: "app-subtitle" }, [
        "スキルレベルは1〜5。Lv.2〜4で威力・回復量が少しずつ上昇し、Lv.5に到達するとそれ以上の威力上昇はしない代わりにクールタイムが1ターン短縮され、バフ/デバフ/スタンの継続ターンが1ターン延びます。",
      ]),
      ...renderSkillGrowthRows(dex.skills),
    ]),
    renderLatentSkillChoices(dex),
    el("button", { type: "button", className: "btn btn--ghost btn--large", onclick: () => props.onSelectEntry(null) }, ["◀ 図鑑一覧に戻る"]),
  ]);
}

export function renderMonsterDex(props: MonsterDexProps): HTMLElement {
  const dex = props.selectedDexId ? ALL_DISPLAYABLE_MONSTERS_DEX.find((d) => d.id === props.selectedDexId) : undefined;
  if (dex) return renderDetail(props, dex);
  return renderList(props);
}
