import "./style.css";
import { registerSW } from "virtual:pwa-register";
import { BattleEngine, BattleResult } from "../battle/engine.js";
import { ELEMENTS, Element } from "../core/element.js";
import { MonsterDefinition } from "../core/monster.js";
import { MONSTER_TEMPLATES, findMonster } from "../data/monsters.js";
import { renderTeamBuilder } from "./views/teamBuilder.js";
import { renderBattleView } from "./views/battleView.js";

registerSW({ immediate: true });

function randomElement(): Element {
  return ELEMENTS[Math.floor(Math.random() * ELEMENTS.length)];
}

function randomTeam(): MonsterDefinition[] {
  return MONSTER_TEMPLATES.map((template) => findMonster(template.templateId, randomElement())!);
}

interface AppState {
  view: "BUILD" | "BATTLE";
  playerElements: Record<string, Element>;
  enemyTeam: MonsterDefinition[];
  battleResult: BattleResult | null;
  battlePlayerTeam: MonsterDefinition[];
}

const state: AppState = {
  view: "BUILD",
  playerElements: Object.fromEntries(MONSTER_TEMPLATES.map((t) => [t.templateId, randomElement()])),
  enemyTeam: randomTeam(),
  battleResult: null,
  battlePlayerTeam: [],
};

const rootCandidate = document.getElementById("app");
if (!rootCandidate) throw new Error("#app root element not found");
const root: HTMLElement = rootCandidate;

let disposeCurrentView: (() => void) | null = null;

function getPlayerTeam(): MonsterDefinition[] {
  return MONSTER_TEMPLATES.map((template) => findMonster(template.templateId, state.playerElements[template.templateId])!);
}

function render(): void {
  disposeCurrentView?.();
  disposeCurrentView = null;
  root.innerHTML = "";

  if (state.view === "BUILD") {
    root.append(
      renderTeamBuilder({
        templates: MONSTER_TEMPLATES,
        playerElements: state.playerElements,
        enemyTeam: state.enemyTeam,
        onSelectElement: (templateId, element) => {
          state.playerElements[templateId] = element;
          render();
        },
        onShuffleEnemy: () => {
          state.enemyTeam = randomTeam();
          render();
        },
        onStartBattle: () => {
          const playerTeam = getPlayerTeam();
          const engine = new BattleEngine(playerTeam, state.enemyTeam);
          state.battleResult = engine.run();
          state.battlePlayerTeam = playerTeam;
          state.view = "BATTLE";
          render();
        },
      }),
    );
    return;
  }

  if (state.view === "BATTLE" && state.battleResult) {
    const handle = renderBattleView({
      result: state.battleResult,
      playerTeam: state.battlePlayerTeam,
      enemyTeam: state.enemyTeam,
      onBack: () => {
        state.view = "BUILD";
        state.battleResult = null;
        state.enemyTeam = randomTeam();
        render();
      },
    });
    disposeCurrentView = handle.dispose;
    root.append(handle.element);
  }
}

render();
