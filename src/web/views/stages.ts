import { ELEMENT_JA } from "../../core/element.js";
import { SET_LABEL } from "../../core/equipment.js";
import { STAGE_STAMINA_COST } from "../../core/fighterLevel.js";
import { DIFFICULTIES, Difficulty, DIFFICULTY_JA, STAGES, Stage } from "../../data/stages.js";
import { MONSTER_TEMPLATES } from "../../data/monsters.js";
import { PlayerState, getParty, isStageCleared } from "../../game/playerState.js";
import { el } from "../dom.js";

export interface StagesProps {
  player: PlayerState;
  selectedStageId: string | null;
  onSelectStage: (id: string | null) => void;
  selectedDifficulty: Difficulty;
  onSelectDifficulty: (difficulty: Difficulty) => void;
  onStartStage: (stage: Stage, difficulty: Difficulty) => void;
  autoFarmCount: number;
  onChangeAutoFarmCount: (count: number) => void;
  onAutoFarm: (stage: Stage, count: number, difficulty: Difficulty) => void;
}

const DIFFICULTY_DESCRIPTION: Record<Difficulty, string> = {
  NORMAL: "標準の強さです。",
  HARD: "敵が強化される代わりに、ドロップする装備の星が上がりやすくなります。",
  HELL: "敵が大幅に強化される代わりに、ドロップする装備の星がさらに上がりやすくなります。",
};

function speciesLabel(templateId: string): string {
  return MONSTER_TEMPLATES.find((t) => t.templateId === templateId)?.baseName ?? templateId;
}

function chapterThemeLabel(stage: Stage): string {
  return `${speciesLabel(stage.rewards.dropTemplateId)} / ${SET_LABEL[stage.rewards.equipmentSet]}シリーズ`;
}

function renderList(props: StagesProps): HTMLElement {
  const chapters = Array.from(new Set(STAGES.map((s) => s.chapter))).sort((a, b) => a - b);

  const chapterSections = chapters.map((chapter) => {
    const stagesInChapter = STAGES.filter((s) => s.chapter === chapter);
    const cards = stagesInChapter.map((stage) => {
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

    return el("section", { className: "panel" }, [
      el("div", { className: "panel-header" }, [
        el("h2", {}, [`チャプター${chapter}`]),
        el("span", { className: "app-subtitle" }, [chapterThemeLabel(stagesInChapter[0])]),
      ]),
      el("div", { className: "stage-list" }, cards),
    ]);
  });

  return el("div", { className: "screen stages-screen" }, [
    el("header", { className: "app-header" }, [el("h1", {}, ["ステージ選択"]), el("p", { className: "app-subtitle" }, ["各ステージは3ウェーブ構成。最終ステージの3ウェーブ目はボス戦です。"])]),
    ...chapterSections,
  ]);
}

function renderDetail(props: StagesProps, stage: Stage): HTMLElement {
  const party = getParty(props.player);
  const hasEnoughStamina = props.player.stamina >= STAGE_STAMINA_COST;
  const canChallenge = party.length > 0 && hasEnoughStamina;

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

  const difficulty = props.selectedDifficulty;
  const difficultyButtons = DIFFICULTIES.map((d) =>
    el(
      "button",
      {
        type: "button",
        className: "btn" + (d === difficulty ? " btn--primary" : " btn--ghost"),
        onclick: () => props.onSelectDifficulty(d),
      },
      [DIFFICULTY_JA[d]],
    ),
  );

  return el("div", { className: "screen stages-screen" }, [
    el("header", { className: "app-header" }, [el("h1", {}, [stage.name])]),
    el("section", { className: "panel" }, [
      el("h2", {}, ["難易度"]),
      el("div", { className: "difficulty-picker" }, difficultyButtons),
      el("p", { className: "app-subtitle" }, [DIFFICULTY_DESCRIPTION[difficulty]]),
    ]),
    el("section", { className: "panel" }, [el("div", { className: "wave-rows" }, waveRows)]),
    el("section", { className: "panel" }, [
      el("h2", {}, ["報酬"]),
      el("p", {}, [`ウェーブクリア毎: 🪙${stage.rewards.waveGold} / モンスター経験値${stage.rewards.waveExp}`]),
      el("p", {}, [`ステージクリアボーナス: 🪙${stage.rewards.clearGold}`]),
      el("p", {}, [`クリアすると${speciesLabel(stage.rewards.dropTemplateId)}や${SET_LABEL[stage.rewards.equipmentSet]}シリーズの装備が出やすくなります。`]),
    ]),
    party.length === 0 ? el("p", { className: "app-subtitle" }, ["パーティが編成されていません。先にパーティを編成してください。"]) : null,
    !hasEnoughStamina ? el("p", { className: "app-subtitle" }, ["スタミナが足りません。"]) : null,
    el(
      "button",
      { type: "button", className: "btn btn--primary btn--large", disabled: !canChallenge, onclick: () => props.onStartStage(stage, difficulty) },
      [`⚔ 挑戦する (⚡${STAGE_STAMINA_COST})`],
    ),
    el("section", { className: "panel auto-farm-panel" }, [
      el("h2", {}, ["🔁 オート周回"]),
      el("p", { className: "app-subtitle" }, ["指定した回数まで自動でウェーブを消化し、スタミナが尽きるか敗北したら中断します。"]),
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
          onclick: () => props.onAutoFarm(stage, props.autoFarmCount, difficulty),
        },
        [`▶ オート周回開始`],
      ),
    ]),
    el("button", { type: "button", className: "btn btn--ghost btn--large", onclick: () => props.onSelectStage(null) }, ["◀ ステージ選択に戻る"]),
  ].filter((n): n is HTMLElement => n !== null));
}

export function renderStages(props: StagesProps): HTMLElement {
  const stage = props.selectedStageId ? STAGES.find((s) => s.id === props.selectedStageId) : undefined;
  if (stage) return renderDetail(props, stage);
  return renderList(props);
}
