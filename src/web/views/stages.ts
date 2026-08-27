import { ELEMENT_COLOR, ELEMENT_JA } from "../../core/element.js";
import { SET_LABEL } from "../../core/equipment.js";
import { STAGE_STAMINA_COST } from "../../core/fighterLevel.js";
import { DIFFICULTIES, Difficulty, DIFFICULTY_JA, STAGES, Stage, Wave, WaveEnemy } from "../../data/stages.js";
import { MONSTER_TEMPLATES } from "../../data/monsters.js";
import { PlayerState, getParty, isStageCleared } from "../../game/playerState.js";
import { el } from "../dom.js";
import { renderAutoFarmPanel } from "./autoFarmPanel.js";
import { referenceRunTime } from "../../game/manualClearTimes.js";
import "../ui/catalog.css";

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

const DIFFICULTY_ICON: Record<Difficulty, string> = { NORMAL: "🌿", HARD: "🔥", HELL: "💀" };

/**
 * チャプターを「行き先」として見せるための雰囲気づけ。
 * 色と情景名だけの表示用データで、ドロップ内容や強さはステージデータ側が持つ。
 */
interface ChapterLook {
  /** 情景の名前。チャプター番号だけでは行き先の想像がつかないため添える */
  title: string;
  /** 帯・枠に使う主色 */
  color: string;
  /** 帯の奥に敷く副色 */
  color2: string;
  /** 帯の背景に薄く敷く絵文字 */
  scenery: string;
}

const CHAPTER_LOOKS: Record<number, ChapterLook> = {
  1: { title: "はじまりの草原", color: "#3fd39a", color2: "#12694f", scenery: "🌿" },
  2: { title: "月夜の荒野", color: "#7b8cf6", color2: "#2b3286", scenery: "🌙" },
  3: { title: "灼けた岩窟", color: "#f0a03c", color2: "#8a4110", scenery: "🪨" },
  4: { title: "星屑の花園", color: "#c96ae0", color2: "#6a1b7a", scenery: "✨" },
};

const FALLBACK_LOOK: ChapterLook = { title: "未知の領域", color: "#8f9ec6", color2: "#333a5c", scenery: "❔" };

function chapterLook(chapter: number): ChapterLook {
  return CHAPTER_LOOKS[chapter] ?? FALLBACK_LOOK;
}

function template(templateId: string) {
  return MONSTER_TEMPLATES.find((t) => t.templateId === templateId);
}

function speciesLabel(templateId: string): string {
  return template(templateId)?.baseName ?? templateId;
}

function speciesEmoji(templateId: string): string {
  return template(templateId)?.emoji ?? "❔";
}

/** 数値を3桁区切りにする(報酬の桁を読み取りやすくするため) */
function num(value: number): string {
  return value.toLocaleString("ja-JP");
}

/** 進捗バー。0〜1の割合を受け取る */
function progressBar(ratio: number, className = ""): HTMLElement {
  const clamped = Math.max(0, Math.min(1, ratio));
  return el("span", { className: `cat-bar ${className}`.trim() }, [
    el("span", { className: "cat-bar__fill", style: `width:${(clamped * 100).toFixed(1)}%` }),
  ]);
}

function chip(text: string, className = ""): HTMLElement {
  return el("span", { className: `cat-chip ${className}`.trim() }, [text]);
}

/* ===== ステージ一覧 ================================================== */

/** そのチャプターに出てくる敵の星とレベルの幅。行き先の手強さを1行で伝えるために使う */
function chapterThreat(stages: Stage[]): { minStar: number; maxStar: number; minLevel: number; maxLevel: number } {
  const enemies = stages.flatMap((s) => s.waves.flatMap((w) => w.enemies));
  return {
    minStar: Math.min(...enemies.map((e) => e.star)),
    maxStar: Math.max(...enemies.map((e) => e.star)),
    minLevel: Math.min(...enemies.map((e) => e.level)),
    maxLevel: Math.max(...enemies.map((e) => e.level)),
  };
}

/** 難易度ごとのクリア状況を小さな点3つで表す。どこまで踏破したかが一覧のまま分かる */
function difficultyPips(props: StagesProps, stage: Stage): HTMLElement {
  return el(
    "span",
    { className: "stage-tile__pips" },
    DIFFICULTIES.map((d) =>
      el("span", {
        className: `stage-pip stage-pip--${d.toLowerCase()}` + (isStageCleared(props.player, stage.id, d) ? " stage-pip--on" : ""),
        title: `${DIFFICULTY_JA[d]}${isStageCleared(props.player, stage.id, d) ? "クリア済み" : "未クリア"}`,
      }),
    ),
  );
}

function stageTile(props: StagesProps, stage: Stage, isNext: boolean): HTMLElement {
  const cleared = isStageCleared(props.player, stage.id);
  const isBossStage = stage.waves.some((w) => w.isBossWave);

  const classes = ["stage-tile"];
  if (cleared) classes.push("stage-tile--cleared");
  if (isNext) classes.push("stage-tile--next");
  if (isBossStage) classes.push("stage-tile--boss");

  return el(
    "button",
    {
      type: "button",
      className: classes.join(" "),
      title: `${stage.name}${isBossStage ? "(ボス)" : ""}`,
      onclick: () => props.onSelectStage(stage.id),
    },
    [
      el("span", { className: "stage-tile__no" }, [String(stage.stageNumber)]),
      isBossStage ? el("span", { className: "stage-tile__boss" }, ["👑"]) : null,
      cleared ? el("span", { className: "stage-tile__clear" }, ["✓"]) : null,
      isNext ? el("span", { className: "stage-tile__now" }, ["NOW"]) : null,
      difficultyPips(props, stage),
    ].filter(isElement),
  );
}

function chapterSection(props: StagesProps, chapter: number, stagesInChapter: Stage[], nextStageId: string | null): HTMLElement {
  const look = chapterLook(chapter);
  const clearedCount = stagesInChapter.filter((s) => isStageCleared(props.player, s.id)).length;
  const threat = chapterThreat(stagesInChapter);
  const rewards = stagesInChapter[0].rewards;
  const goldRange = `${num(stagesInChapter[0].rewards.clearGold)}〜${num(stagesInChapter[stagesInChapter.length - 1].rewards.clearGold)}`;
  const complete = clearedCount === stagesInChapter.length;

  return el(
    "section",
    {
      className: "chapter-card" + (complete ? " chapter-card--complete" : ""),
      style: `--ch:${look.color};--ch2:${look.color2}`,
    },
    [
      el("div", { className: "chapter-card__banner" }, [
        el("span", { className: "chapter-card__scenery" }, [look.scenery]),
        el("div", { className: "chapter-card__head" }, [
          el("span", { className: "chapter-card__no" }, [`CHAPTER ${chapter}`]),
          el("span", { className: "chapter-card__title" }, [look.title]),
        ]),
        el("div", { className: "chapter-card__progress" }, [
          progressBar(clearedCount / stagesInChapter.length, "cat-bar--chapter"),
          el("span", { className: "chapter-card__count" }, [complete ? "踏破" : `${clearedCount}/${stagesInChapter.length}`]),
        ]),
        el("div", { className: "chapter-card__facts" }, [
          chip(`⚡${STAGE_STAMINA_COST}/回`, "cat-chip--stamina"),
          chip(`敵 ★${threat.minStar}〜${threat.maxStar} Lv${threat.minLevel}〜${threat.maxLevel}`, "cat-chip--threat"),
          chip(`🪙${goldRange}`, "cat-chip--gold"),
          chip(`${speciesEmoji(rewards.dropTemplateId)}${speciesLabel(rewards.dropTemplateId)}`, "cat-chip--drop"),
          chip(`⚒${SET_LABEL[rewards.equipmentSet]}`, "cat-chip--drop"),
        ]),
      ]),
      el(
        "div",
        { className: "stage-rail" },
        stagesInChapter.map((stage) => stageTile(props, stage, stage.id === nextStageId)),
      ),
    ],
  );
}

/**
 * 再開の入口。
 *
 * 次に挑む場所は光らせてあったが、そこまで指でたどる必要があった。
 * 章が増えるほど遠くなるので、一覧の先頭から1手で入れるようにする。
 */
function resumeButton(props: StagesProps, stage: Stage): HTMLElement {
  const cleared = isStageCleared(props.player, stage.id);
  return el(
    "button",
    { type: "button", className: "stages-resume", onclick: () => props.onSelectStage(stage.id) },
    [
      el("span", { className: "stages-resume__icon" }, [cleared ? "🔁" : "▶"]),
      el("span", { className: "stages-resume__body" }, [
        el("span", { className: "stages-resume__label" }, [cleared ? "つづきから" : "次はここ"]),
        el("span", { className: "stages-resume__name" }, [stage.name]),
      ]),
      el("span", { className: "stages-resume__arrow" }, ["›"]),
    ],
  );
}

function renderList(props: StagesProps): HTMLElement {
  const chapters = Array.from(new Set(STAGES.map((s) => s.chapter))).sort((a, b) => a - b);
  const clearedTotal = STAGES.filter((s) => isStageCleared(props.player, s.id)).length;
  // 「次はここ」を1つだけ光らせて、再開位置が一目で分かるようにする
  const nextStage = STAGES.find((s) => !isStageCleared(props.player, s.id));
  // 全部踏破していても周回先は要るので、最後のステージへ送る
  const resumeStage = nextStage ?? STAGES[STAGES.length - 1];

  return el("div", { className: "screen stages-screen" }, [
    el("header", { className: "stages-head" }, [
      el("div", { className: "stages-head__row" }, [
        el("h1", { className: "stages-head__title" }, ["ステージ選択"]),
        el("span", { className: "stages-head__stamina" }, [`⚡${props.player.stamina}/${props.player.maxStamina}`]),
      ]),
      el("div", { className: "stages-head__progress" }, [
        progressBar(clearedTotal / STAGES.length, "cat-bar--total"),
        el("span", { className: "stages-head__count" }, [`${clearedTotal}/${STAGES.length}`]),
      ]),
      el("div", { className: "stages-head__legend" }, [
        el("span", {}, ["難易度クリア:"]),
        ...DIFFICULTIES.map((d) =>
          el("span", { className: "stages-head__legend-item" }, [
            el("span", { className: `stage-pip stage-pip--${d.toLowerCase()} stage-pip--on` }),
            el("span", {}, [DIFFICULTY_JA[d]]),
          ]),
        ),
      ]),
    ]),
    resumeButton(props, resumeStage),
    ...chapters.map((chapter) =>
      chapterSection(
        props,
        chapter,
        STAGES.filter((s) => s.chapter === chapter),
        nextStage ? nextStage.id : null,
      ),
    ),
  ]);
}

/* ===== ステージ詳細 ================================================== */

function enemyChip(enemy: WaveEnemy): HTMLElement {
  return el(
    "div",
    {
      className: "enemy-chip" + (enemy.isBoss ? " enemy-chip--boss" : ""),
      style: `--elem:${ELEMENT_COLOR[enemy.element]}`,
    },
    [
      el("span", { className: "enemy-chip__icon" }, [speciesEmoji(enemy.templateId)]),
      el("span", { className: "enemy-chip__body" }, [
        el("span", { className: "enemy-chip__name" }, [
          enemy.isBoss ? "👑" : "",
          speciesLabel(enemy.templateId),
          el("span", { className: "enemy-chip__elem" }, [ELEMENT_JA[enemy.element]]),
        ]),
        el("span", { className: "enemy-chip__meta" }, [`★${enemy.star} · Lv${enemy.level}`]),
      ]),
    ],
  );
}

function waveCard(wave: Wave): HTMLElement {
  return el("div", { className: "wave-card" + (wave.isBossWave ? " wave-card--boss" : "") }, [
    el("div", { className: "wave-card__head" }, [
      el("span", { className: "wave-card__no" }, [`WAVE ${wave.waveNumber}`]),
      wave.isBossWave ? el("span", { className: "wave-card__boss" }, ["👑 BOSS"]) : null,
      el("span", { className: "wave-card__count" }, [`敵${wave.enemies.length}体`]),
    ].filter(isElement)),
    el("div", { className: "wave-card__enemies" }, wave.enemies.map(enemyChip)),
  ]);
}

function difficultyPicker(props: StagesProps, stage: Stage): HTMLElement {
  return el(
    "div",
    { className: "diff-seg" },
    DIFFICULTIES.map((d) => {
      const active = d === props.selectedDifficulty;
      const cleared = isStageCleared(props.player, stage.id, d);
      return el(
        "button",
        {
          type: "button",
          className: `diff-seg__btn diff-seg__btn--${d.toLowerCase()}` + (active ? " diff-seg__btn--active" : ""),
          onclick: () => props.onSelectDifficulty(d),
        },
        [
          el("span", { className: "diff-seg__icon" }, [DIFFICULTY_ICON[d]]),
          el("span", { className: "diff-seg__name" }, [DIFFICULTY_JA[d]]),
          el("span", { className: "diff-seg__state" }, [cleared ? "✓ クリア" : "未クリア"]),
        ],
      );
    }),
  );
}

function rewardTile(icon: string, label: string, value: string, className = ""): HTMLElement {
  return el("div", { className: `reward-tile ${className}`.trim() }, [
    el("span", { className: "reward-tile__icon" }, [icon]),
    el("span", { className: "reward-tile__label" }, [label]),
    el("span", { className: "reward-tile__value" }, [value]),
  ]);
}

function renderDetail(props: StagesProps, stage: Stage): HTMLElement {
  const look = chapterLook(stage.chapter);
  const party = getParty(props.player);
  const hasEnoughStamina = props.player.stamina >= STAGE_STAMINA_COST;
  const canChallenge = party.length > 0 && hasEnoughStamina;
  const isBossStage = stage.waves.some((w) => w.isBossWave);
  const cleared = isStageCleared(props.player, stage.id, props.selectedDifficulty);

  const blockers = [
    party.length === 0 ? "パーティが編成されていません" : null,
    !hasEnoughStamina ? `スタミナが足りません(⚡${STAGE_STAMINA_COST}必要)` : null,
  ].filter((t): t is string => t !== null);

  return el("div", { className: "screen stages-screen stage-detail-screen", style: `--ch:${look.color};--ch2:${look.color2}` }, [
    el("header", { className: "stage-hero" }, [
      el("span", { className: "stage-hero__scenery" }, [look.scenery]),
      el(
        "button",
        { type: "button", className: "stage-hero__back", onclick: () => props.onSelectStage(null) },
        ["◀"],
      ),
      el("div", { className: "stage-hero__chapter" }, [`CHAPTER ${stage.chapter} · ${look.title}`]),
      el("h1", { className: "stage-hero__name" }, [stage.name]),
      el("div", { className: "stage-hero__tags" }, [
        chip(`⚡${STAGE_STAMINA_COST}`, "cat-chip--stamina"),
        chip(`${stage.waves.length}ウェーブ`),
        isBossStage ? chip("👑 ボス戦あり", "cat-chip--boss") : null,
        cleared ? chip("✓ クリア済み", "cat-chip--cleared") : null,
      ].filter(isElement)),
    ]),

    el("section", { className: "panel" }, [
      el("h2", {}, ["難易度"]),
      difficultyPicker(props, stage),
      el("p", { className: "app-subtitle" }, [DIFFICULTY_DESCRIPTION[props.selectedDifficulty]]),
    ]),

    el(
      "section",
      { className: "panel challenge-panel" },
      [
        blockers.length > 0 ? el("p", { className: "challenge-panel__warn" }, [blockers.join(" / ")]) : null,
        el(
          "button",
          {
            type: "button",
            className: "btn btn--primary btn--large challenge-panel__go",
            disabled: !canChallenge,
            onclick: () => props.onStartStage(stage, props.selectedDifficulty),
          },
          [`⚔ ${DIFFICULTY_JA[props.selectedDifficulty]}に挑戦する (⚡${STAGE_STAMINA_COST})`],
        ),
      ].filter((node) => node !== null),
    ),

    cleared ? renderAutoFarmPanel({
      ...(() => { const timing = referenceRunTime(props.player.recentManualClearTimes, "STAGE", stage.id, props.selectedDifficulty); return { referenceRunSeconds: timing.seconds, referenceFromManual: timing.fromManual, recentManualClearTimes: timing.recent }; })(),
      count: props.autoFarmCount,
      onChangeCount: props.onChangeAutoFarmCount,
      staminaCost: STAGE_STAMINA_COST,
      stamina: props.player.stamina,
      disabled: !canChallenge,
      onStart: () => props.onAutoFarm(stage, props.autoFarmCount, props.selectedDifficulty),
    }) : el("p", { className: "app-subtitle" }, ["バックグラウンド周回は、この難易度を一度クリアすると解放されます。"]),

    el("section", { className: "panel" }, [
      el("h2", {}, ["出現する敵"]),
      el("div", { className: "wave-list" }, stage.waves.map(waveCard)),
      el("p", { className: "app-subtitle" }, ["表示はノーマル時の編成です。難易度を上げると敵はさらに強くなります。"]),
    ]),

    el("section", { className: "panel" }, [
      el("h2", {}, ["報酬"]),
      el("div", { className: "reward-grid" }, [
        rewardTile("🪙", "ウェーブ毎", num(stage.rewards.waveGold), "reward-tile--gold"),
        rewardTile("✨", "経験値/体", num(stage.rewards.waveExp), "reward-tile--exp"),
        rewardTile("🏆", "クリア報酬", num(stage.rewards.clearGold), "reward-tile--gold"),
      ]),
      el("div", { className: "reward-drops" }, [
        el("span", { className: "reward-drops__label" }, ["ドロップ"]),
        el("span", { className: "reward-drops__item" }, [
          `${speciesEmoji(stage.rewards.dropTemplateId)} ${speciesLabel(stage.rewards.dropTemplateId)}`,
        ]),
        el("span", { className: "reward-drops__item" }, [`⚒ ${SET_LABEL[stage.rewards.equipmentSet]}シリーズ装備`]),
      ]),
    ]),

    el("button", { type: "button", className: "btn btn--ghost btn--large", onclick: () => props.onSelectStage(null) }, ["◀ ステージ選択に戻る"]),
  ]);
}

function isElement(node: HTMLElement | null): node is HTMLElement {
  return node !== null;
}

export function renderStages(props: StagesProps): HTMLElement {
  const stage = props.selectedStageId ? STAGES.find((s) => s.id === props.selectedStageId) : undefined;
  if (stage) return renderDetail(props, stage);
  return renderList(props);
}
