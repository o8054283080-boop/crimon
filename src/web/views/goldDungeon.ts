import { ELEMENT_COLOR, ELEMENT_JA } from "../../core/element.js";
import { GOLD_DUNGEON_STAMINA_COST } from "../../core/fighterLevel.js";
import { GOLD_DUNGEON_DAILY_LIMIT, GOLD_DUNGEON_FLOORS, GoldDungeonFloor } from "../../data/goldDungeon.js";
import { getParty, goldDungeonChallengesRemaining, PlayerState } from "../../game/playerState.js";
import { el } from "../dom.js";
import { renderAutoFarmPanel } from "./autoFarmPanel.js";
import { referenceRunTime } from "../../game/manualClearTimes.js";
import { renderDungeonIntro, renderFloorGrid } from "./dungeonList.js";

export interface GoldDungeonProps {
  player: PlayerState;
  selectedFloor: number | null;
  onSelectFloor: (floor: number | null) => void;
  onStartFloor: (floor: GoldDungeonFloor) => void;
  onGoParty: () => void;
  autoFarmCount: number;
  onChangeAutoFarmCount: (count: number) => void;
  onAutoFarm: (floor: GoldDungeonFloor, count: number) => void;
}

function renderList(props: GoldDungeonProps): HTMLElement {
  const remaining = goldDungeonChallengesRemaining(props.player);

  const tiles = GOLD_DUNGEON_FLOORS.map((floor) => {
    const element = floor.enemies[0].element;
    return {
      badge: `${floor.floor}F`,
      title: `🪙${floor.goldReward.toLocaleString("ja-JP")}`,
      color: ELEMENT_COLOR[element],
      chips: [`敵 ${ELEMENT_JA[element]}`, `★${floor.enemies[0].star} Lv${floor.enemies[0].level}`],
      onClick: () => props.onSelectFloor(floor.floor),
    };
  });

  return el("div", { className: "screen stages-screen" }, [
    el("header", { className: "app-header app-header--row" }, [
      el("h1", {}, ["ゴールドダンジョン"]),
      el("span", { className: "head-note" }, [`残り ${remaining}/${GOLD_DUNGEON_DAILY_LIMIT}回`]),
    ]),
    renderDungeonIntro(
      "ゴールド稼ぎ専用です。装備もダイヤも出ませんが、その分クリア報酬のゴールドが桁違いに大きくなっています。",
      [`⚡${GOLD_DUNGEON_STAMINA_COST}/回`, `1日${GOLD_DUNGEON_DAILY_LIMIT}回まで(日付で回復)`],
      remaining === 0 ? "⚠ 本日の挑戦回数を使い切りました。日付が変わると回復します。" : undefined,
    ),
    renderFloorGrid(tiles),
  ]);
}

function renderDetail(props: GoldDungeonProps, floor: GoldDungeonFloor): HTMLElement {
  const party = getParty(props.player);
  const remaining = goldDungeonChallengesRemaining(props.player);
  const hasEnoughStamina = props.player.stamina >= GOLD_DUNGEON_STAMINA_COST;
  const hasChallengesLeft = remaining > 0;
  const canChallenge = party.length > 0 && hasEnoughStamina && hasChallengesLeft;

  const enemyTags = floor.enemies.map((e) =>
    el("span", { className: "enemy-tag" }, [`${e.templateId}[${ELEMENT_JA[e.element]}]★${e.star}Lv${e.level}`]),
  );

  const blockers = [
    party.length === 0 ? "パーティが編成されていません" : null,
    !hasEnoughStamina ? `スタミナが足りません(⚡${GOLD_DUNGEON_STAMINA_COST}必要)` : null,
    !hasChallengesLeft ? "本日の挑戦回数の上限に達しています" : null,
  ].filter((t): t is string => t !== null);

  return el("div", { className: "screen stages-screen" }, [
    el("header", { className: "app-header app-header--row" }, [
      el("h1", {}, [floor.name]),
      el("button", { type: "button", className: "btn btn--ghost head-action", onclick: () => props.onSelectFloor(null) }, ["◀ 階層"]),
    ]),

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
            onclick: () => props.onStartFloor(floor),
          },
          [`⚔ 挑戦する (⚡${GOLD_DUNGEON_STAMINA_COST})`],
        ),
      ] as (HTMLElement | null)[]).filter((n): n is HTMLElement => n !== null),
    ),

    props.player.clearedGoldDungeonFloors.includes(floor.floor) ? renderAutoFarmPanel({
      ...(() => { const timing = referenceRunTime(props.player.recentManualClearTimes, "GOLD_DUNGEON", String(floor.floor)); return { referenceRunSeconds: timing.seconds, referenceFromManual: timing.fromManual, recentManualClearTimes: timing.recent }; })(),
      count: props.autoFarmCount,
      onChangeCount: props.onChangeAutoFarmCount,
      staminaCost: GOLD_DUNGEON_STAMINA_COST,
      stamina: props.player.stamina,
      // 1日の残り回数で頭打ちになる。「最大」が実際に回せる数になるよう渡す
      hardLimit: remaining,
      hardLimitNote: `本日の残り挑戦回数: ${remaining}/${GOLD_DUNGEON_DAILY_LIMIT}回`,
      disabled: !canChallenge,
      onStart: () => props.onAutoFarm(floor, props.autoFarmCount),
    }) : el("p", { className: "app-subtitle" }, ["バックグラウンド周回は、この階を一度クリアすると解放されます。"]),

    el("section", { className: "panel" }, [
      el("h2", {}, ["出現する敵"]),
      el("div", { className: "wave-row__enemies" }, enemyTags),
    ]),
    el("section", { className: "panel" }, [
      el("h2", {}, ["報酬"]),
      el("p", {}, [`🪙 クリア報酬ゴールド: ${floor.goldReward}`]),
    ]),
    el("section", { className: "panel" }, [
      el("p", {}, [`本日の残り挑戦回数: ${remaining}/${GOLD_DUNGEON_DAILY_LIMIT}回`]),
      el("p", { className: "app-subtitle" }, [`挑戦パーティ(通常パーティと共通): ${party.length}/4体`]),
      el("button", { type: "button", className: "btn btn--ghost", onclick: props.onGoParty }, ["編成を変更する"]),
    ]),
    el("button", { type: "button", className: "btn btn--ghost btn--large", onclick: () => props.onSelectFloor(null) }, ["◀ 階層選択に戻る"]),
  ].filter((n): n is HTMLElement => n !== null));
}

export function renderGoldDungeon(props: GoldDungeonProps): HTMLElement {
  const floor = props.selectedFloor !== null ? GOLD_DUNGEON_FLOORS.find((f) => f.floor === props.selectedFloor) : undefined;
  if (floor) return renderDetail(props, floor);
  return renderList(props);
}
