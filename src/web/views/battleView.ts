import { BattleResult, UnitSnapshot } from "../../battle/engine.js";
import { MonsterDefinition } from "../../core/monster.js";
import { el } from "../dom.js";

export interface BattleViewProps {
  result: BattleResult;
  playerTeam: MonsterDefinition[];
  enemyTeam: MonsterDefinition[];
  onBack: () => void;
  backLabel?: string;
  title?: string;
}

export interface BattleViewHandle {
  element: HTMLElement;
  dispose: () => void;
}

const SPEED_INTERVAL_MS: Record<string, number> = { "1": 650, "2": 300, "4": 120 };

interface UnitCardRefs {
  card: HTMLElement;
  hpFill: HTMLElement;
  hpText: HTMLElement;
  gaugeFill: HTMLElement;
}

function buildTeamPanel(
  team: MonsterDefinition[],
  instanceIdOf: (index: number) => string,
  refs: Map<string, UnitCardRefs>,
): HTMLElement {
  const cards = team.map((def, i) => {
    const instanceId = instanceIdOf(i);
    const hpFill = el("div", { className: "hp-bar__fill" });
    const hpText = el("div", { className: "unit-card__hp-text" }, [`${def.stats.hp}/${def.stats.hp}`]);
    const gaugeFill = el("div", { className: "gauge-bar__fill" });
    const card = el("div", { className: "unit-card" }, [
      el("div", { className: "unit-card__avatar", style: `background:${def.color}` }),
      el("div", { className: "unit-card__body" }, [
        el("div", { className: "unit-card__name" }, [def.name]),
        el("div", { className: "hp-bar" }, [hpFill]),
        hpText,
        el("div", { className: "gauge-bar" }, [gaugeFill]),
      ]),
    ]);
    refs.set(instanceId, { card, hpFill, hpText, gaugeFill });
    return card;
  });
  return el("div", { className: "team-panel" }, cards);
}

export function renderBattleView(props: BattleViewProps): BattleViewHandle {
  const { result, playerTeam, enemyTeam, onBack, backLabel = "◀ 編成に戻る", title = "バトル観戦" } = props;

  let index = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let speed = "1";

  const unitRefs = new Map<string, UnitCardRefs>();
  const enemyPanel = buildTeamPanel(enemyTeam, (i) => `E${i + 1}`, unitRefs);
  const playerPanel = buildTeamPanel(playerTeam, (i) => `P${i + 1}`, unitRefs);

  const logEl = el("div", { className: "battle-log" });
  const resultBanner = el("div", { className: "result-banner result-banner--hidden" });

  function applySnapshot(snapshot: UnitSnapshot[]): void {
    for (const s of snapshot) {
      const refs = unitRefs.get(s.instanceId);
      if (!refs) continue;
      const ratio = s.maxHp > 0 ? Math.max(0, Math.min(1, s.currentHp / s.maxHp)) : 0;
      refs.hpFill.style.width = `${ratio * 100}%`;
      refs.hpFill.classList.toggle("hp-bar__fill--low", ratio <= 0.3);
      refs.hpText.textContent = `${s.currentHp}/${s.maxHp}`;
      refs.gaugeFill.style.width = `${Math.min(100, s.gauge)}%`;
      refs.card.classList.toggle("unit-card--dead", !s.alive);
    }
  }

  function appendLines(lines: string[]): void {
    for (const line of lines) {
      logEl.append(el("div", { className: "battle-log__line" }, [line]));
    }
    logEl.scrollTop = logEl.scrollHeight;
  }

  function showResult(): void {
    resultBanner.classList.remove("result-banner--hidden");
    resultBanner.textContent = "";
    const text = result.winner === "PLAYER" ? "🎉 勝利！" : result.winner === "ENEMY" ? "💀 敗北…" : "🤝 引き分け";
    resultBanner.append(el("div", { className: "result-banner__text" }, [text]));
  }

  function stepOnce(): boolean {
    if (index >= result.turns.length) return false;
    const record = result.turns[index];
    appendLines(record.lines);
    applySnapshot(record.snapshot);
    index += 1;
    return true;
  }

  function stop(): void {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  function play(): void {
    stop();
    timer = setInterval(() => {
      if (!stepOnce()) {
        stop();
        showResult();
        playPauseBtn.textContent = "▶ 再生";
      }
    }, SPEED_INTERVAL_MS[speed]);
    playPauseBtn.textContent = "⏸ 一時停止";
  }

  const playPauseBtn = el(
    "button",
    {
      type: "button",
      className: "btn btn--ghost",
      onclick: () => {
        if (timer !== null) {
          stop();
          playPauseBtn.textContent = "▶ 再生";
        } else if (index < result.turns.length) {
          play();
        }
      },
    },
    ["⏸ 一時停止"],
  );

  const speedBtn = el(
    "button",
    {
      type: "button",
      className: "btn btn--ghost",
      onclick: () => {
        speed = speed === "1" ? "2" : speed === "2" ? "4" : "1";
        speedBtn.textContent = `x${speed}`;
        if (timer !== null) play();
      },
    },
    ["x1"],
  );

  const skipBtn = el(
    "button",
    {
      type: "button",
      className: "btn btn--ghost",
      onclick: () => {
        stop();
        while (stepOnce()) {
          /* fast forward to the end */
        }
        showResult();
        playPauseBtn.textContent = "▶ 再生";
      },
    },
    ["⏭ 結果までスキップ"],
  );

  const backBtn = el(
    "button",
    {
      type: "button",
      className: "btn btn--primary",
      onclick: () => {
        stop();
        onBack();
      },
    },
    [backLabel],
  );

  const container = el("div", { className: "screen battle-view" }, [
    el("header", { className: "app-header" }, [el("h1", {}, [title])]),
    el("section", { className: "panel" }, [el("h2", {}, ["敵チーム"]), enemyPanel]),
    el("section", { className: "panel" }, [el("h2", {}, ["味方チーム"]), playerPanel]),
    el("div", { className: "battle-controls" }, [playPauseBtn, speedBtn, skipBtn, backBtn]),
    resultBanner,
    el("section", { className: "panel" }, [el("h2", {}, ["バトルログ"]), logEl]),
  ]);

  play();

  return { element: container, dispose: stop };
}
