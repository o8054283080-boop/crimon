import { ELEMENT_JA } from "../../core/element.js";
import { STAGES, Stage } from "../../data/stages.js";
import { PlayerState, getParty, isStageCleared } from "../../game/playerState.js";
import { el } from "../dom.js";

export interface StagesProps {
  player: PlayerState;
  selectedStageId: string | null;
  onSelectStage: (id: string | null) => void;
  onStartStage: (stage: Stage) => void;
}

function renderList(props: StagesProps): HTMLElement {
  const cards = STAGES.map((stage) => {
    const cleared = isStageCleared(props.player, stage.id);
    return el(
      "button",
      {
        type: "button",
        className: "stage-card" + (cleared ? " stage-card--cleared" : ""),
        onclick: () => props.onSelectStage(stage.id),
      },
      [
        el("div", { className: "stage-card__name" }, [stage.name]),
        el("div", { className: "stage-card__meta" }, [cleared ? "クリア済み ✅" : "未クリア"]),
      ],
    );
  });

  return el("div", { className: "screen stages-screen" }, [
    el("header", { className: "app-header" }, [el("h1", {}, ["ステージ選択"]), el("p", { className: "app-subtitle" }, ["各ステージは3ウェーブ構成。最終ステージの3ウェーブ目はボス戦です。"])]),
    el("section", { className: "panel" }, [el("div", { className: "stage-list" }, cards)]),
  ]);
}

function renderDetail(props: StagesProps, stage: Stage): HTMLElement {
  const party = getParty(props.player);
  const canChallenge = party.length > 0;

  const waveRows = stage.waves.map((wave) =>
    el("div", { className: "wave-row" }, [
      el("div", { className: "wave-row__title" }, [`ウェーブ ${wave.waveNumber}${wave.isBossWave ? " 【BOSS】" : ""}`]),
      el(
        "div",
        { className: "wave-row__enemies" },
        wave.enemies.map((e) =>
          el("span", { className: "enemy-tag" + (e.isBoss ? " enemy-tag--boss" : "") }, [
            `${e.templateId}[${ELEMENT_JA[e.element]}]★${e.star}Lv${e.level}`,
          ]),
        ),
      ),
    ]),
  );

  return el("div", { className: "screen stages-screen" }, [
    el("header", { className: "app-header" }, [el("h1", {}, [stage.name])]),
    el("section", { className: "panel" }, [el("div", { className: "wave-rows" }, waveRows)]),
    el("section", { className: "panel" }, [
      el("h2", {}, ["報酬"]),
      el("p", {}, [`ウェーブクリア毎: 🪙${stage.rewards.waveGold} / モンスター経験値${stage.rewards.waveExp}`]),
      el("p", {}, [`ステージクリアボーナス: 🪙${stage.rewards.clearGold}`]),
      el("p", {}, [`モンスタードロップ率: ${Math.round(stage.rewards.dropRate * 100)}%`]),
    ]),
    !canChallenge ? el("p", { className: "app-subtitle" }, ["パーティが編成されていません。先にパーティを編成してください。"]) : null,
    el(
      "button",
      { type: "button", className: "btn btn--primary btn--large", disabled: !canChallenge, onclick: () => props.onStartStage(stage) },
      ["⚔ 挑戦する"],
    ),
    el("button", { type: "button", className: "btn btn--ghost btn--large", onclick: () => props.onSelectStage(null) }, ["◀ ステージ選択に戻る"]),
  ].filter((n): n is HTMLElement => n !== null));
}

export function renderStages(props: StagesProps): HTMLElement {
  const stage = props.selectedStageId ? STAGES.find((s) => s.id === props.selectedStageId) : undefined;
  if (stage) return renderDetail(props, stage);
  return renderList(props);
}
