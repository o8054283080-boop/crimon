import { el } from "../dom.js";

export type ScreenName =
  | "HOME"
  | "SUMMON"
  | "MONSTERS"
  | "EQUIPMENT"
  | "PARTY"
  | "STAGES"
  | "BATTLE"
  | "STAGE_RESULT"
  | "EQUIP_DUNGEON"
  | "DUNGEON_BATTLE"
  | "DUNGEON_PARTY"
  | "LEVEL_DUNGEON"
  | "LEVEL_DUNGEON_BATTLE"
  | "MONSTER_DEX"
  | "MONSTER_TRAINING"
  | "AUTO_FARM_RESULT";

const TABS: { screen: ScreenName; icon: string; label: string }[] = [
  { screen: "HOME", icon: "🏠", label: "ホーム" },
  { screen: "SUMMON", icon: "✨", label: "召喚" },
  { screen: "MONSTERS", icon: "📖", label: "モンスター" },
  { screen: "EQUIPMENT", icon: "⚔️", label: "装備" },
  { screen: "PARTY", icon: "🛡", label: "パーティ" },
  { screen: "STAGES", icon: "🗺", label: "ステージ" },
];

export function renderBottomNav(current: ScreenName, onNavigate: (screen: ScreenName) => void): HTMLElement {
  const buttons = TABS.map((tab) =>
    el(
      "button",
      {
        type: "button",
        className: "bottom-nav__btn" + (tab.screen === current ? " bottom-nav__btn--active" : ""),
        onclick: () => onNavigate(tab.screen),
      },
      [el("div", { className: "bottom-nav__icon" }, [tab.icon]), el("div", { className: "bottom-nav__label" }, [tab.label])],
    ),
  );
  return el("nav", { className: "bottom-nav" }, buttons);
}
