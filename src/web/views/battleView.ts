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
/** 行動順プレビューに表示する人数(現在行動中を含む) */
const TURN_PREVIEW_COUNT = 6;

interface UnitTokenRefs {
  token: HTMLElement;
  hpFill: HTMLElement;
  hpText: HTMLElement;
  gaugeFill: HTMLElement;
}

function buildTeamRow(
  team: MonsterDefinition[],
  instanceIdOf: (index: number) => string,
  teamClass: string,
  refs: Map<string, UnitTokenRefs>,
): HTMLElement {
  const tokens = team.map((def, i) => {
    const instanceId = instanceIdOf(i);
    const hpFill = el("div", { className: "unit-token__hp-fill" });
    const hpText = el("div", { className: "unit-token__hp-text" }, [`${def.stats.hp}/${def.stats.hp}`]);
    const gaugeFill = el("div", { className: "unit-token__gauge-fill" });
    const token = el("div", { className: `unit-token ${teamClass}` }, [
      el("div", { className: "unit-token__avatar", style: `background:${def.color}` }, [def.emoji]),
      el("div", { className: "unit-token__name" }, [def.name]),
      el("div", { className: "unit-token__hp-bar" }, [hpFill]),
      hpText,
      el("div", { className: "unit-token__gauge-bar" }, [gaugeFill]),
    ]);
    refs.set(instanceId, { token, hpFill, hpText, gaugeFill });
    return token;
  });
  return el("div", { className: `battle-arena__team ${teamClass}s` }, tokens);
}

export function renderBattleView(props: BattleViewProps): BattleViewHandle {
  const { result, playerTeam, enemyTeam, onBack, backLabel = "◀ 編成に戻る", title = "バトル観戦" } = props;

  let index = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let speed = "1";
  let activeInstanceId: string | null = null;

  const unitRefs = new Map<string, UnitTokenRefs>();
  const defByInstanceId = new Map<string, MonsterDefinition>();
  enemyTeam.forEach((def, i) => defByInstanceId.set(`E${i + 1}`, def));
  playerTeam.forEach((def, i) => defByInstanceId.set(`P${i + 1}`, def));

  const enemyRow = buildTeamRow(enemyTeam, (i) => `E${i + 1}`, "unit-token--enemy", unitRefs);
  const playerRow = buildTeamRow(playerTeam, (i) => `P${i + 1}`, "unit-token--player", unitRefs);

  const turnOrderEl = el("div", { className: "turn-order" });
  const logEl = el("div", { className: "battle-log" });
  const resultBanner = el("div", { className: "result-banner result-banner--hidden" });

  function renderTurnOrder(fromIndex: number): void {
    turnOrderEl.innerHTML = "";
    const upcoming = result.turns.slice(fromIndex, fromIndex + TURN_PREVIEW_COUNT);
    upcoming.forEach((record, i) => {
      const def = defByInstanceId.get(record.actorId);
      const isPlayer = record.actorId.startsWith("P");
      const teamClass = isPlayer ? "turn-order__token--player" : "turn-order__token--enemy";
      const activeClass = i === 0 ? " turn-order__token--active" : "";
      turnOrderEl.append(el("div", { className: `turn-order__token ${teamClass}${activeClass}` }, [def ? def.emoji : "?"]));
    });
  }

  function setActive(instanceId: string | null): void {
    if (activeInstanceId) unitRefs.get(activeInstanceId)?.token.classList.remove("unit-token--active");
    activeInstanceId = instanceId;
    if (activeInstanceId) unitRefs.get(activeInstanceId)?.token.classList.add("unit-token--active");
  }

  function applySnapshot(snapshot: UnitSnapshot[]): void {
    for (const s of snapshot) {
      const refs = unitRefs.get(s.instanceId);
      if (!refs) continue;
      const ratio = s.maxHp > 0 ? Math.max(0, Math.min(1, s.currentHp / s.maxHp)) : 0;
      refs.hpFill.style.width = `${ratio * 100}%`;
      refs.hpFill.classList.toggle("unit-token__hp-fill--low", ratio <= 0.3);
      refs.hpText.textContent = `${s.currentHp}/${s.maxHp}`;
      refs.gaugeFill.style.width = `${Math.min(100, s.gauge)}%`;
      refs.token.classList.toggle("unit-token--dead", !s.alive);
    }
  }

  function appendLines(lines: string[]): void {
    for (const line of lines) {
      logEl.append(el("div", { className: "battle-log__line" }, [line]));
    }
    logEl.scrollTop = logEl.scrollHeight;
  }

  function showResult(): void {
    setActive(null);
    resultBanner.classList.remove("result-banner--hidden");
    resultBanner.textContent = "";
    const text = result.winner === "PLAYER" ? "🎉 勝利！" : result.winner === "ENEMY" ? "💀 敗北…" : "🤝 引き分け";
    resultBanner.append(el("div", { className: "result-banner__text" }, [text]));
  }

  function stepOnce(): boolean {
    if (index >= result.turns.length) return false;
    const record = result.turns[index];
    renderTurnOrder(index);
    setActive(record.actorId);
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

  const battleArena = el("div", { className: "battle-arena" }, [turnOrderEl, enemyRow, playerRow]);

  const container = el("div", { className: "screen battle-view" }, [
    el("header", { className: "app-header" }, [el("h1", {}, [title])]),
    battleArena,
    el("div", { className: "battle-controls" }, [playPauseBtn, speedBtn, skipBtn, backBtn]),
    resultBanner,
    el("section", { className: "panel battle-log-panel" }, [el("h2", {}, ["バトルログ"]), logEl]),
  ]);

  renderTurnOrder(0);
  play();

  return { element: container, dispose: stop };
}
