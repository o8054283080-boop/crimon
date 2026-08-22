import { ELEMENT_JA } from "../../core/element.js";
import { LEVEL_DUNGEON_STAMINA_COST } from "../../core/fighterLevel.js";
import { LEVEL_DUNGEON_DEFS, LEVEL_DUNGEON_TIER_JA, LevelDungeonDef } from "../../data/levelDungeon.js";
import { getParty, PlayerState } from "../../game/playerState.js";
import { el } from "../dom.js";
import { renderAutoFarmPanel } from "./autoFarmPanel.js";

export interface LevelDungeonProps {
  player: PlayerState;
  selectedTier: LevelDungeonDef["tier"] | null;
  onSelectTier: (tier: LevelDungeonDef["tier"] | null) => void;
  onStartTier: (def: LevelDungeonDef) => void;
  onGoParty: () => void;
  autoFarmCount: number;
  onChangeAutoFarmCount: (count: number) => void;
  onAutoFarm: (def: LevelDungeonDef, count: number) => void;
}

function renderList(props: LevelDungeonProps): HTMLElement {
  const cards = LEVEL_DUNGEON_DEFS.map((def) =>
    el(
      "button",
      { type: "button", className: "stage-card", onclick: () => props.onSelectTier(def.tier) },
      [
        el("div", { className: "stage-card__name" }, [LEVEL_DUNGEON_TIER_JA[def.tier]]),
        el("div", { className: "stage-card__meta" }, [`獲得経験値 ${def.expReward} / 経験ピッグ★${def.pigStar}`]),
      ],
    ),
  );

  return el("div", { className: "screen stages-screen" }, [
    el("header", { className: "app-header" }, [
      el("h1", {}, ["レベル上げダンジョン"]),
      el("p", { className: "app-subtitle" }, [
        "モンスターの経験値稼ぎに特化したコンテンツです。通常ステージ・装備ダンジョンより消費スタミナは多いですが、直接もらえる経験値が大きく、クリアするたびに経験値フィード専用の「経験ピッグ」を確定で入手できます。難易度が高いほど経験値・経験ピッグの星ともに大きくなります。",
      ]),
    ]),
    el("section", { className: "panel" }, [el("div", { className: "stage-list" }, cards)]),
  ]);
}

function renderDetail(props: LevelDungeonProps, def: LevelDungeonDef): HTMLElement {
  const party = getParty(props.player);
  const hasEnoughStamina = props.player.stamina >= LEVEL_DUNGEON_STAMINA_COST;
  const canChallenge = party.length > 0 && hasEnoughStamina;

  const enemyTags = def.enemies.map((e) =>
    el("span", { className: "enemy-tag" }, [`${e.templateId}[${ELEMENT_JA[e.element]}]★${e.star}Lv${e.level}`]),
  );

  const blockers = [
    party.length === 0 ? "パーティが編成されていません" : null,
    !hasEnoughStamina ? `スタミナが足りません(⚡${LEVEL_DUNGEON_STAMINA_COST}必要)` : null,
  ].filter((t): t is string => t !== null);

  return el("div", { className: "screen stages-screen" }, [
    el("header", { className: "app-header app-header--row" }, [
      el("h1", {}, [def.name]),
      el("button", { type: "button", className: "btn btn--ghost head-action", onclick: () => props.onSelectTier(null) }, ["◀ 一覧"]),
    ]),

    // 挑戦の入口を先に置く。周回のたびに説明を読み飛ばすスクロールをさせない
    el(
      "section",
      { className: "panel challenge-panel" },
      ([
        blockers.length > 0 ? el("p", { className: "challenge-panel__warn" }, [blockers.join(" / ")]) : null,
        el(
          "button",
          {
            type: "button",
            className: "btn btn--primary btn--large challenge-panel__go",
            disabled: !canChallenge,
            onclick: () => props.onStartTier(def),
          },
          [`⚔ 挑戦する (⚡${LEVEL_DUNGEON_STAMINA_COST})`],
        ),
      ] as (HTMLElement | null)[]).filter((n): n is HTMLElement => n !== null),
    ),

    renderAutoFarmPanel({
      count: props.autoFarmCount,
      onChangeCount: props.onChangeAutoFarmCount,
      staminaCost: LEVEL_DUNGEON_STAMINA_COST,
      stamina: props.player.stamina,
      disabled: !canChallenge,
      onStart: () => props.onAutoFarm(def, props.autoFarmCount),
    }),

    el("section", { className: "panel" }, [
      el("h2", {}, ["出現する敵"]),
      el("div", { className: "wave-row__enemies" }, enemyTags),
    ]),
    el("section", { className: "panel" }, [
      el("h2", {}, ["報酬"]),
      el("p", {}, [`⭐ 獲得経験値: ${def.expReward}`]),
      el("p", {}, [`🐖 経験ピッグ★${def.pigStar}を確定で入手`]),
      el("p", {}, [`🪙 クリア報酬ゴールド: ${def.goldReward}`]),
    ]),
    el("section", { className: "panel" }, [
      el("p", { className: "app-subtitle" }, [`挑戦パーティ(通常パーティと共通): ${party.length}/4体`]),
      el("button", { type: "button", className: "btn btn--ghost", onclick: props.onGoParty }, ["編成を変更する"]),
    ]),
    el("button", { type: "button", className: "btn btn--ghost btn--large", onclick: () => props.onSelectTier(null) }, ["◀ 難易度選択に戻る"]),
  ].filter((n): n is HTMLElement => n !== null));
}

export function renderLevelDungeon(props: LevelDungeonProps): HTMLElement {
  const def = props.selectedTier ? LEVEL_DUNGEON_DEFS.find((d) => d.tier === props.selectedTier) : undefined;
  if (def) return renderDetail(props, def);
  return renderList(props);
}
