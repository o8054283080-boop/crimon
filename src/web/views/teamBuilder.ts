import { ELEMENTS, ELEMENT_COLOR, ELEMENT_JA, Element } from "../../core/element.js";
import { MonsterDefinition, MonsterTemplate, createMonsterVariant } from "../../core/monster.js";
import { el } from "../dom.js";

export interface TeamBuilderProps {
  templates: MonsterTemplate[];
  playerElements: Record<string, Element>;
  enemyTeam: MonsterDefinition[];
  onSelectElement: (templateId: string, element: Element) => void;
  onShuffleEnemy: () => void;
  onStartBattle: () => void;
}

function monsterRow(template: MonsterTemplate, currentElement: Element, onSelectElement: TeamBuilderProps["onSelectElement"]): HTMLElement {
  const variant = createMonsterVariant(template, currentElement);

  const swatches = ELEMENTS.map((element) =>
    el(
      "button",
      {
        type: "button",
        className: "swatch" + (element === currentElement ? " swatch--active" : ""),
        title: ELEMENT_JA[element],
        style: `background:${ELEMENT_COLOR[element]}`,
        onclick: () => onSelectElement(template.templateId, element),
      },
      [],
    ),
  );

  return el("div", { className: "monster-row" }, [
    el("div", { className: "monster-row__avatar", style: `background:${ELEMENT_COLOR[currentElement]}` }),
    el("div", { className: "monster-row__info" }, [
      el("div", { className: "monster-row__name" }, [
        `${template.baseName}[${ELEMENT_JA[currentElement]}] `,
        el("span", { className: "role-badge" }, [template.role]),
      ]),
      el("div", { className: "monster-row__stats" }, [
        `HP${variant.stats.hp} / ATK${variant.stats.atk} / DEF${variant.stats.def} / SPD${variant.stats.spd}`,
      ]),
    ]),
    el("div", { className: "swatch-row" }, swatches),
  ]);
}

export function renderTeamBuilder(props: TeamBuilderProps): HTMLElement {
  const { templates, playerElements, enemyTeam, onSelectElement, onShuffleEnemy, onStartBattle } = props;

  const rows = templates.map((template) => monsterRow(template, playerElements[template.templateId], onSelectElement));

  const enemyChips = enemyTeam.map((m) =>
    el("div", { className: "enemy-chip" }, [
      el("span", { className: "enemy-chip__dot", style: `background:${m.color}` }, []),
      `${m.name} (${m.role})`,
    ]),
  );

  return el("div", { className: "screen team-builder" }, [
    el("header", { className: "app-header" }, [
      el("h1", {}, ["Crimon"]),
      el("p", { className: "app-subtitle" }, ["4vs4 モンスターバトル - チーム編成"]),
    ]),
    el("section", { className: "panel" }, [el("h2", {}, ["味方チーム(属性をタップで変更)"]), el("div", { className: "monster-rows" }, rows)]),
    el("section", { className: "panel" }, [
      el("div", { className: "panel-header" }, [
        el("h2", {}, ["敵チーム"]),
        el("button", { type: "button", className: "btn btn--ghost", onclick: onShuffleEnemy }, ["🎲 シャッフル"]),
      ]),
      el("div", { className: "enemy-preview" }, enemyChips),
    ]),
    el("button", { type: "button", className: "btn btn--primary btn--large", onclick: onStartBattle }, ["⚔ バトル開始"]),
  ]);
}
