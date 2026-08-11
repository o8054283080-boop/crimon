import { BattleEngine, BattleEvent, BattleWinner, ManualChoice, TurnRecord, UnitSnapshot } from "../../battle/engine.js";
import { ActiveEffect } from "../../battle/unit.js";
import { BattleUnit } from "../../battle/unit.js";
import { MonsterDefinition } from "../../core/monster.js";
import { BUFF_STAT_JA, BuffStat, describeSkillEffect } from "../../core/skill.js";
import { el } from "../dom.js";

export interface BattleViewProps {
  engine: BattleEngine;
  playerTeam: MonsterDefinition[];
  enemyTeam: MonsterDefinition[];
  title?: string;
  /** 決着後に表示するボタンのラベル(勝敗によって文言を変えたい場合に使う) */
  resultLabel: (winner: BattleWinner) => string;
  /** 決着後、結果ボタンが押されたら呼ばれる */
  onFinish: (winner: BattleWinner) => void;
}

export interface BattleViewHandle {
  element: HTMLElement;
  dispose: () => void;
}

const SPEED_INTERVAL_MS: Record<string, number> = { "1": 650, "2": 300, "4": 120 };

interface UnitTokenRefs {
  token: HTMLElement;
  avatar: HTMLElement;
  hpFill: HTMLElement;
  hpText: HTMLElement;
  gaugeFill: HTMLElement;
  badges: HTMLElement;
}

const STAT_ICON: Record<BuffStat, string> = { atk: "⚔", def: "🛡", spd: "💨" };

function buildBadge(effect: ActiveEffect): HTMLElement {
  const isBuff = effect.kind === "BUFF";
  const arrow = isBuff ? "↑" : "↓";
  const percent = Math.round(Math.abs(effect.amount) * 100);
  return el(
    "span",
    {
      className: `unit-badge ${isBuff ? "unit-badge--buff" : "unit-badge--debuff"}`,
      title: `${BUFF_STAT_JA[effect.stat]}${arrow}${percent}% (残り${effect.remainingTurns}ターン)`,
    },
    [
      el("span", { className: "unit-badge__icon" }, [`${STAT_ICON[effect.stat]}${arrow}`]),
      el("span", { className: "unit-badge__turns" }, [String(effect.remainingTurns)]),
    ],
  );
}

function buildBadgesRow(snapshot: UnitSnapshot): HTMLElement[] {
  const badges = snapshot.effects.map((e) => buildBadge(e));
  if (snapshot.stunTurns > 0) {
    badges.push(
      el("span", { className: "unit-badge unit-badge--stun", title: `スタン中(残り${snapshot.stunTurns}ターン)` }, [
        el("span", { className: "unit-badge__icon" }, ["💫"]),
        el("span", { className: "unit-badge__turns" }, [String(snapshot.stunTurns)]),
      ]),
    );
  }
  if (snapshot.burnTurns > 0) {
    badges.push(
      el("span", { className: "unit-badge unit-badge--burn", title: `火傷(残り${snapshot.burnTurns}ターン)` }, [
        el("span", { className: "unit-badge__icon" }, ["🔥"]),
        el("span", { className: "unit-badge__turns" }, [String(snapshot.burnTurns)]),
      ]),
    );
  }
  return badges;
}

type PickerState =
  | { phase: "NONE" }
  | { phase: "SKILL"; unit: BattleUnit }
  | { phase: "TARGET"; unit: BattleUnit; skillIndex: 0 | 1 | 2 };

function buildTeamRow(
  team: MonsterDefinition[],
  instanceIdOf: (index: number) => string,
  teamClass: string,
  refs: Map<string, UnitTokenRefs>,
): HTMLElement {
  const tokens = team.map((def, i) => {
    const instanceId = instanceIdOf(i);
    const avatar = el("div", { className: "unit-token__avatar", style: `background:${def.color}` }, [def.emoji]);
    const badges = el("div", { className: "unit-token__badges" });
    const hpFill = el("div", { className: "unit-token__hp-fill" });
    const hpText = el("div", { className: "unit-token__hp-text" }, [`${def.stats.hp}/${def.stats.hp}`]);
    const gaugeFill = el("div", { className: "unit-token__gauge-fill" });
    const token = el("div", { className: `unit-token ${teamClass}` }, [
      el("div", { className: "unit-token__avatar-wrap" }, [avatar]),
      badges,
      el("div", { className: "unit-token__name" }, [def.name]),
      el("div", { className: "unit-token__hp-bar" }, [hpFill]),
      hpText,
      el("div", { className: "unit-token__gauge-bar" }, [gaugeFill]),
    ]);
    refs.set(instanceId, { token, avatar, hpFill, hpText, gaugeFill, badges });
    return token;
  });
  return el("div", { className: `battle-arena__team ${teamClass}s` }, tokens);
}

export function renderBattleView(props: BattleViewProps): BattleViewHandle {
  const { engine, playerTeam, enemyTeam, title = "バトル", resultLabel, onFinish } = props;

  let mode: "AUTO" | "MANUAL" = "AUTO";
  let userPaused = false;
  let speed = "1";
  let finished = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  let picker: PickerState = { phase: "NONE" };
  let activeInstanceId: string | null = null;

  const unitRefs = new Map<string, UnitTokenRefs>();
  const defByInstanceId = new Map<string, MonsterDefinition>();
  enemyTeam.forEach((def, i) => defByInstanceId.set(`E${i + 1}`, def));
  playerTeam.forEach((def, i) => defByInstanceId.set(`P${i + 1}`, def));

  const enemyRow = buildTeamRow(enemyTeam, (i) => `E${i + 1}`, "unit-token--enemy", unitRefs);
  const playerRow = buildTeamRow(playerTeam, (i) => `P${i + 1}`, "unit-token--player", unitRefs);

  const actionPanelEl = el("div", { className: "action-panel-slot" });
  const logEl = el("div", { className: "battle-log" });
  const resultBanner = el("div", { className: "result-banner result-banner--hidden" });

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
      refs.badges.replaceChildren(...buildBadgesRow(s));
    }
  }

  const LOG_LINE_RULES: { match: RegExp; className: string }[] = [
    { match: /会心の一撃/, className: "battle-log__line--crit" },
    { match: /は倒れた/, className: "battle-log__line--death" },
    { match: /ダメージ/, className: "battle-log__line--damage" },
    { match: /HPが .+ 回復/, className: "battle-log__line--heal" },
    { match: /が上昇/, className: "battle-log__line--buff" },
    { match: /が低下/, className: "battle-log__line--debuff" },
    { match: /スタンした|スタン中で/, className: "battle-log__line--stun" },
    { match: /火傷/, className: "battle-log__line--burn" },
    { match: /抵抗した/, className: "battle-log__line--resist" },
  ];

  function appendLines(lines: string[]): void {
    for (const line of lines) {
      const isSkillLine = !line.startsWith(" ");
      const extra = LOG_LINE_RULES.find((rule) => rule.match.test(line))?.className;
      const className = ["battle-log__line", isSkillLine ? "battle-log__line--skill" : null, extra ?? null]
        .filter((c): c is string => c !== null)
        .join(" ");
      logEl.append(el("div", { className }, [line]));
    }
    logEl.scrollTop = logEl.scrollHeight;
  }

  function spawnFloatingNumber(event: BattleEvent): void {
    if (event.kind === "DEATH") return;
    const refs = unitRefs.get(event.targetId);
    if (!refs) return;

    if (event.kind === "DAMAGE") {
      refs.avatar.classList.remove("unit-token__avatar--hit");
      // 強制再フローさせて同じアニメーションを連続でも再生できるようにする
      void refs.avatar.offsetWidth;
      refs.avatar.classList.add("unit-token__avatar--hit");
    }

    const text = event.kind === "DAMAGE" ? `-${event.amount}` : event.kind === "HEAL" ? `+${event.amount}` : "MISS";
    const kindClass =
      event.kind === "DAMAGE"
        ? event.isCrit
          ? "floating-number--crit"
          : "floating-number--damage"
        : event.kind === "HEAL"
          ? "floating-number--heal"
          : "floating-number--resist";

    const popup = el("div", { className: `floating-number ${kindClass}` }, [event.isCrit ? `${text}!` : text]);
    refs.token.append(popup);
    popup.addEventListener("animationend", () => popup.remove());
    setTimeout(() => popup.remove(), 1200);
  }

  function applyRecord(record: TurnRecord): void {
    setActive(record.actorId);
    appendLines(record.lines);
    applySnapshot(record.snapshot);
    for (const event of record.events) spawnFloatingNumber(event);
  }

  function getTargetCandidates(unit: BattleUnit, skill: MonsterDefinition["skills"][number]): BattleUnit[] {
    const allUnits = engine.getUnits();
    if (skill.target === "SINGLE_ENEMY") return allUnits.filter((u) => u.team !== unit.team && u.alive);
    if (skill.target === "SINGLE_ALLY") return allUnits.filter((u) => u.team === unit.team && u.alive);
    return [];
  }

  function renderActionPanel(): void {
    actionPanelEl.innerHTML = "";
    if (picker.phase === "SKILL") {
      const unit = picker.unit;
      const def = unit.def;
      actionPanelEl.append(
        el("div", { className: "action-panel" }, [
          el("div", { className: "action-panel__title" }, [`${def.name} の番です。スキルを選んでください`]),
          el(
            "div",
            { className: "action-panel__skills" },
            def.skills.map((skill, i) => {
              const idx = i as 0 | 1 | 2;
              const onCooldown = unit.cooldowns[idx] > 0;
              const effectText = skill.effects.map((e) => describeSkillEffect(e)).join(" / ");
              return el(
                "button",
                {
                  type: "button",
                  className: "action-skill-btn" + (onCooldown ? " action-skill-btn--disabled" : ""),
                  disabled: onCooldown,
                  onclick: () => handleSkillPicked(unit, idx, skill),
                },
                [
                  el("div", { className: "action-skill-btn__name" }, [
                    skill.name,
                    onCooldown
                      ? ` (CT残り${unit.cooldowns[idx]})`
                      : skill.cooldownTurns > 0
                        ? ` (CT ${skill.cooldownTurns}ターン)`
                        : "",
                  ]),
                  el("div", { className: "action-skill-btn__meta" }, [effectText]),
                ],
              );
            }),
          ),
        ]),
      );
    } else if (picker.phase === "TARGET") {
      const { unit, skillIndex } = picker;
      const skill = unit.def.skills[skillIndex];
      const candidates = getTargetCandidates(unit, skill);
      actionPanelEl.append(
        el("div", { className: "action-panel" }, [
          el("div", { className: "action-panel__title" }, [`「${skill.name}」の対象を選んでください`]),
          el(
            "div",
            { className: "action-panel__targets" },
            candidates.map((t) =>
              el(
                "button",
                { type: "button", className: "action-target-btn", onclick: () => handleTargetPicked(unit, skillIndex, t.instanceId) },
                [
                  el("span", { className: "action-target-btn__avatar", style: `background:${t.def.color}` }, [t.def.emoji]),
                  el("span", { className: "action-target-btn__name" }, [t.def.name]),
                  el("span", { className: "action-target-btn__hp" }, [`${t.currentHp}/${t.maxHp}`]),
                ],
              ),
            ),
          ),
          el(
            "button",
            {
              type: "button",
              className: "btn btn--ghost",
              onclick: () => {
                picker = { phase: "SKILL", unit };
                renderActionPanel();
              },
            },
            ["◀ スキル選び直し"],
          ),
        ]),
      );
    }
  }

  function handleSkillPicked(unit: BattleUnit, skillIndex: 0 | 1 | 2, skill: MonsterDefinition["skills"][number]): void {
    if (skill.target === "SINGLE_ENEMY" || skill.target === "SINGLE_ALLY") {
      picker = { phase: "TARGET", unit, skillIndex };
      renderActionPanel();
    } else {
      submitChoice(unit, { skillIndex });
    }
  }

  function handleTargetPicked(unit: BattleUnit, skillIndex: 0 | 1 | 2, targetId: string): void {
    submitChoice(unit, { skillIndex, targetId });
  }

  function submitChoice(unit: BattleUnit, choice: ManualChoice): void {
    const record = engine.resolveTurn(unit, choice);
    picker = { phase: "NONE" };
    renderActionPanel();
    applyRecord(record);
    maybeScheduleTick();
  }

  function showResult(winner: BattleWinner): void {
    finished = true;
    userPaused = true;
    stopTimer();
    setActive(null);
    picker = { phase: "NONE" };
    renderActionPanel();
    resultBanner.classList.remove("result-banner--hidden");
    resultBanner.textContent = "";
    const text = winner === "PLAYER" ? "🎉 勝利！" : winner === "ENEMY" ? "💀 敗北…" : "🤝 引き分け";
    resultBanner.append(el("div", { className: "result-banner__text" }, [text]));
    finishBtn.textContent = resultLabel(winner);
    finishBtn.classList.remove("battle-controls__finish--hidden");
    finishBtn.onclick = () => onFinish(winner);
  }

  function tick(): void {
    if (finished) return;
    const winner = engine.getWinner();
    if (winner) {
      showResult(winner);
      return;
    }
    const actor = engine.getNextActor();
    if (!actor) {
      showResult(engine.getWinner() ?? "DRAW");
      return;
    }
    if (mode === "MANUAL" && actor.team === "PLAYER" && actor.stunTurns === 0) {
      picker = { phase: "SKILL", unit: actor };
      renderActionPanel();
      return;
    }
    const record = engine.resolveTurn(actor);
    applyRecord(record);
  }

  function stopTimer(): void {
    if (timeoutHandle !== null) {
      clearTimeout(timeoutHandle);
      timeoutHandle = null;
    }
  }

  function maybeScheduleTick(): void {
    if (finished || userPaused || picker.phase !== "NONE" || timeoutHandle !== null) return;
    timeoutHandle = setTimeout(() => {
      timeoutHandle = null;
      tick();
      maybeScheduleTick();
    }, SPEED_INTERVAL_MS[speed]);
  }

  function skipToEnd(): void {
    userPaused = true;
    stopTimer();
    picker = { phase: "NONE" };
    renderActionPanel();
    let lastRecord: TurnRecord | null = null;
    let guard = 0;
    while (!finished && guard < 10000) {
      guard += 1;
      const winner = engine.getWinner();
      if (winner) break;
      const actor = engine.getNextActor();
      if (!actor) break;
      const record = engine.resolveTurn(actor);
      appendLines(record.lines);
      lastRecord = record;
    }
    if (lastRecord) {
      setActive(lastRecord.actorId);
      applySnapshot(lastRecord.snapshot);
    }
    showResult(engine.getWinner() ?? "DRAW");
  }

  const playPauseBtn = el(
    "button",
    {
      type: "button",
      className: "btn btn--ghost",
      onclick: () => {
        if (finished) return;
        userPaused = !userPaused;
        playPauseBtn.textContent = userPaused ? "▶ 再生" : "⏸ 一時停止";
        if (!userPaused) maybeScheduleTick();
        else stopTimer();
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
      },
    },
    ["x1"],
  );

  const modeBtn = el(
    "button",
    {
      type: "button",
      className: "btn btn--ghost",
      onclick: () => {
        if (finished) return;
        mode = mode === "AUTO" ? "MANUAL" : "AUTO";
        modeBtn.textContent = mode === "AUTO" ? "🤖 オート" : "✋ 手動";
        if (mode === "AUTO" && picker.phase !== "NONE") {
          // 手動待ちだった行動をAIに任せて続行する
          const pendingUnit = picker.unit;
          picker = { phase: "NONE" };
          renderActionPanel();
          const record = engine.resolveTurn(pendingUnit);
          applyRecord(record);
        }
        maybeScheduleTick();
      },
    },
    ["🤖 オート"],
  );

  const skipBtn = el("button", { type: "button", className: "btn btn--ghost", onclick: skipToEnd }, ["⏭ 結果までスキップ"]);

  const finishBtn = el(
    "button",
    { type: "button", className: "btn btn--primary battle-controls__finish battle-controls__finish--hidden" },
    ["結果へ進む"],
  );

  const battleArena = el("div", { className: "battle-arena" }, [enemyRow, playerRow]);

  const container = el("div", { className: "screen battle-view" }, [
    el("header", { className: "app-header" }, [el("h1", {}, [title])]),
    battleArena,
    actionPanelEl,
    el("div", { className: "battle-controls" }, [modeBtn, playPauseBtn, speedBtn, skipBtn]),
    resultBanner,
    finishBtn,
    el("section", { className: "panel battle-log-panel" }, [el("h2", {}, ["バトルログ"]), logEl]),
  ]);

  maybeScheduleTick();

  return {
    element: container,
    dispose: () => {
      stopTimer();
    },
  };
}
