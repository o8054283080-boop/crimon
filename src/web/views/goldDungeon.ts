import { ELEMENT_JA } from "../../core/element.js";
import { GOLD_DUNGEON_STAMINA_COST } from "../../core/fighterLevel.js";
import { GOLD_DUNGEON_DAILY_LIMIT, GOLD_DUNGEON_FLOORS, GoldDungeonFloor } from "../../data/goldDungeon.js";
import { getParty, goldDungeonChallengesRemaining, PlayerState } from "../../game/playerState.js";
import { el } from "../dom.js";

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

  const cards = GOLD_DUNGEON_FLOORS.map((floor) =>
    el(
      "button",
      { type: "button", className: "stage-card", onclick: () => props.onSelectFloor(floor.floor) },
      [
        el("div", { className: "stage-card__name" }, [floor.name]),
        el("div", { className: "stage-card__meta" }, [`🪙 クリア報酬ゴールド ${floor.goldReward}`]),
      ],
    ),
  );

  return el("div", { className: "screen stages-screen" }, [
    el("header", { className: "app-header" }, [
      el("h1", {}, ["ゴールドダンジョン"]),
      el("p", { className: "app-subtitle" }, [
        "大量のゴールドが手に入る専用コンテンツです。装備ドロップやダイヤ報酬はありませんが、その分クリア報酬のゴールドが大幅に大きくなっています。1日に挑戦できる回数は全階層合計3回までで、日付が変わるとリセットされます。",
      ]),
      el("p", {}, [`本日の残り挑戦回数: ${remaining}/${GOLD_DUNGEON_DAILY_LIMIT}回`]),
    ]),
    el("section", { className: "panel" }, [el("div", { className: "stage-list" }, cards)]),
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

  return el("div", { className: "screen stages-screen" }, [
    el("header", { className: "app-header" }, [el("h1", {}, [floor.name])]),
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
    party.length === 0 ? el("p", { className: "app-subtitle" }, ["パーティが編成されていません。先に編成してください。"]) : null,
    !hasEnoughStamina ? el("p", { className: "app-subtitle" }, ["スタミナが足りません。"]) : null,
    !hasChallengesLeft ? el("p", { className: "app-subtitle" }, ["本日の挑戦回数の上限に達しています。"]) : null,
    el(
      "button",
      { type: "button", className: "btn btn--primary btn--large", disabled: !canChallenge, onclick: () => props.onStartFloor(floor) },
      [`⚔ 挑戦する (⚡${GOLD_DUNGEON_STAMINA_COST})`],
    ),
    el("section", { className: "panel auto-farm-panel" }, [
      el("h2", {}, ["🔁 オート周回"]),
      el("p", { className: "app-subtitle" }, ["指定した回数まで自動で挑戦し、スタミナ切れ・敗北・本日の挑戦回数上限のいずれかに達したら中断します。"]),
      el("div", { className: "auto-farm-count-row" }, [
        el("input", {
          type: "number",
          min: "1",
          max: "999",
          value: String(props.autoFarmCount),
          className: "auto-farm-count-input",
          oninput: (e: Event) => {
            const value = Math.max(1, Math.min(999, Number((e.target as HTMLInputElement).value) || 1));
            props.onChangeAutoFarmCount(value);
          },
        }),
        el("span", {}, ["回"]),
      ]),
      el(
        "button",
        {
          type: "button",
          className: "btn btn--primary btn--large",
          disabled: !canChallenge,
          onclick: () => props.onAutoFarm(floor, props.autoFarmCount),
        },
        [`▶ オート周回開始`],
      ),
    ]),
    el("button", { type: "button", className: "btn btn--ghost btn--large", onclick: () => props.onSelectFloor(null) }, ["◀ 階層選択に戻る"]),
  ].filter((n): n is HTMLElement => n !== null));
}

export function renderGoldDungeon(props: GoldDungeonProps): HTMLElement {
  const floor = props.selectedFloor !== null ? GOLD_DUNGEON_FLOORS.find((f) => f.floor === props.selectedFloor) : undefined;
  if (floor) return renderDetail(props, floor);
  return renderList(props);
}
