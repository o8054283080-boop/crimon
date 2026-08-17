import { BattleEngine, BattleEvent, BattleWinner, ManualChoice, TurnRecord, UnitSnapshot } from "../../battle/engine.js";
import { ActiveEffect } from "../../battle/unit.js";
import { BattleUnit } from "../../battle/unit.js";
import { MonsterDefinition } from "../../core/monster.js";
import { BUFF_STAT_JA, BuffStat, describeSkillEffect } from "../../core/skill.js";
import { el } from "../dom.js";
import { BattleStage, StageUnitInit } from "../three/battleStage.js";
import { withPortrait } from "../three/portrait.js";

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

/**
 * 再生速度ごとの、1行動あたりの間(ミリ秒)。
 *
 * 以前は 1倍=650 / 2倍=300 / 4倍=120 で、**倍率が名前どおりではなかった**
 * (2倍は実際2.17倍、4倍は5.4倍速)。等倍が速すぎて何が起きたか追えない、
 * という指摘を受けたので、等倍を落としたうえで倍率を名前と一致させた。
 *
 * 等倍を遅くすると最速も遅くなってしまうため、周回用に8倍を足してある。
 * 従来の4倍(120ms)より速い水準を残すことで、速く回したい人の手を止めない。
 */
const SPEED_STEPS = ["1", "2", "4", "8"] as const;
const SPEED_INTERVAL_MS: Record<string, number> = { "1": 1000, "2": 500, "4": 250, "8": 125 };
/** 攻撃モーションを見せてから着弾させるまでの間(再生速度で縮む) */
const IMPACT_DELAY_MS: Record<string, number> = { "1": 320, "2": 160, "4": 80, "8": 40 };

interface UnitHudRefs {
  card: HTMLElement;
  hpFill: HTMLElement;
  /** 減った分を少し遅れて追いかける帯。どれだけ削られたかが目で分かる */
  hpTrail: HTMLElement;
  hpText: HTMLElement;
  gaugeFill: HTMLElement;
  badges: HTMLElement;
}

const STAT_ICON: Record<BuffStat, string> = { atk: "⚔", def: "🛡", spd: "💨", criRate: "🎯", criDmg: "💥" };

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
  if (snapshot.poisonStacks > 0) {
    badges.push(
      el(
        "span",
        {
          className: "unit-badge unit-badge--poison",
          title: `毒 ${snapshot.poisonStacks}スタック(残り${snapshot.poisonTurns}ターン)`,
        },
        [
          el("span", { className: "unit-badge__icon" }, ["☠"]),
          el("span", { className: "unit-badge__turns" }, [`${snapshot.poisonStacks}/${snapshot.poisonTurns}`]),
        ],
      ),
    );
  }
  if (snapshot.shieldValue > 0) {
    badges.push(
      el(
        "span",
        { className: "unit-badge unit-badge--shield", title: `シールド ${snapshot.shieldValue}(残り${snapshot.shieldTurns}ターン)` },
        [el("span", { className: "unit-badge__icon" }, ["🔵"]), el("span", { className: "unit-badge__turns" }, [String(snapshot.shieldTurns)])],
      ),
    );
  }
  if (snapshot.blindTurns > 0) {
    badges.push(
      el("span", { className: "unit-badge unit-badge--blind", title: `暗闇(残り${snapshot.blindTurns}ターン)` }, [
        el("span", { className: "unit-badge__icon" }, ["🌑"]),
        el("span", { className: "unit-badge__turns" }, [String(snapshot.blindTurns)]),
      ]),
    );
  }
  if (snapshot.immuneTurns > 0) {
    badges.push(
      el("span", { className: "unit-badge unit-badge--immune", title: `状態異常免疫(残り${snapshot.immuneTurns}ターン)` }, [
        el("span", { className: "unit-badge__icon" }, ["✨"]),
        el("span", { className: "unit-badge__turns" }, [String(snapshot.immuneTurns)]),
      ]),
    );
  }
  return badges;
}

type PickerState =
  | { phase: "NONE" }
  | { phase: "SKILL"; unit: BattleUnit }
  | { phase: "TARGET"; unit: BattleUnit; skillIndex: 0 | 1 | 2 };

/** 3Dキャラの頭上に重ねる、名前/HP/ATBのHUDカードを作る */
function buildHudCard(def: MonsterDefinition, teamClass: string): { card: HTMLElement; refs: UnitHudRefs } {
  const badges = el("div", { className: "unit-hud__badges" });
  const hpTrail = el("div", { className: "unit-hud__hp-trail" });
  const hpFill = el("div", { className: "unit-hud__hp-fill" });
  const hpText = el("div", { className: "unit-hud__hp-text" }, [`${def.stats.hp}`]);
  const gaugeFill = el("div", { className: "unit-hud__gauge-fill" });
  const card = el("div", { className: `unit-hud ${teamClass}` }, [
    badges,
    el("div", { className: "unit-hud__name" }, [def.name]),
    // 追従バーは実バーの背面に置く。削られた瞬間だけ赤い帯として覗く
    el("div", { className: "unit-hud__hp" }, [hpTrail, hpFill, hpText]),
    el("div", { className: "unit-hud__gauge" }, [gaugeFill]),
  ]);
  card.style.setProperty("--unit-color", def.color);
  return { card, refs: { card, hpFill, hpTrail, hpText, gaugeFill, badges } };
}

export function renderBattleView(props: BattleViewProps): BattleViewHandle {
  const { engine, playerTeam, enemyTeam, title = "バトル", resultLabel, onFinish } = props;

  let mode: "AUTO" | "MANUAL" = "AUTO";
  let userPaused = false;
  let speed = "1";
  let finished = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  let picker: PickerState = { phase: "NONE" };
  /** 対象選びで今光らせている相手 */
  let selectedTargetId: string | null = null;
  let activeInstanceId: string | null = null;

  const hudRefs = new Map<string, UnitHudRefs>();
  const teamOf = new Map<string, "PLAYER" | "ENEMY">();
  const anchorPositions = new Map<string, { x: number; y: number }>();

  /** 着弾待ちなど、時間差で走る演出。スキップ時は即座に実行して整合を保つ */
  const pendingEffects: { handle: ReturnType<typeof setTimeout>; run: () => void }[] = [];

  function later(run: () => void, ms: number): void {
    if (ms <= 0 || finished) {
      run();
      return;
    }
    const entry = {
      handle: setTimeout(() => {
        const index = pendingEffects.indexOf(entry);
        if (index >= 0) pendingEffects.splice(index, 1);
        run();
      }, ms),
      run,
    };
    pendingEffects.push(entry);
  }

  function flushPending(): void {
    const entries = pendingEffects.splice(0, pendingEffects.length);
    for (const entry of entries) {
      clearTimeout(entry.handle);
      entry.run();
    }
  }

  function cancelPending(): void {
    for (const entry of pendingEffects.splice(0, pendingEffects.length)) clearTimeout(entry.handle);
  }

  // --- 3Dステージ ---
  const stageUnits: StageUnitInit[] = [
    ...playerTeam.map((def, i) => ({ instanceId: `P${i + 1}`, def, team: "PLAYER" as const })),
    ...enemyTeam.map((def, i) => ({ instanceId: `E${i + 1}`, def, team: "ENEMY" as const })),
  ];
  for (const unit of stageUnits) teamOf.set(unit.instanceId, unit.team);

  const stageHost = el("div", { className: "battle-stage" });
  const overlay = el("div", { className: "battle-stage__overlay" });
  const fxLayer = el("div", { className: "battle-stage__fx" });
  stageHost.append(overlay, fxLayer);

  for (const unit of stageUnits) {
    const { card, refs } = buildHudCard(unit.def, unit.team === "PLAYER" ? "unit-hud--player" : "unit-hud--enemy");
    hudRefs.set(unit.instanceId, refs);
    overlay.append(card);
  }

  const stage = new BattleStage(stageHost, stageUnits);

  // 3Dの座標に合わせてHUDカードを毎フレーム追従させる
  let overlayFrame: number | null = null;
  /** 重なり回避のために積み上げた、このフレームで確定済みのカード矩形 */
  const placedCards: { left: number; right: number; top: number; bottom: number }[] = [];

  function syncOverlay(): void {
    overlayFrame = requestAnimationFrame(syncOverlay);
    placedCards.length = 0;

    // 奥(画面の上)にいるユニットから先に置く。手前のカードは
    // ぶつかったら上へ逃がすので、奥のものを基準にした方が動きが小さい
    const anchors = stage.computeScreenAnchors().sort((a, b) => a.y - b.y);

    for (const anchor of anchors) {
      const refs = hudRefs.get(anchor.instanceId);
      if (!refs) continue;

      anchorPositions.set(anchor.instanceId, { x: anchor.x, y: anchor.y });
      refs.card.style.transform = `translate(-50%, -100%) scale(${anchor.scale.toFixed(3)})`;
      refs.card.style.visibility = anchor.visible ? "visible" : "hidden";

      // カードは translate(-50%,-100%) で配置されるので、
      // アンカーの真上・左右中央に矩形が来る
      const width = (refs.card.offsetWidth || 76) * anchor.scale;
      const height = (refs.card.offsetHeight || 42) * anchor.scale;
      let top = anchor.y - height;

      // 既に置いたカードと重なる間、少しずつ逃がす。
      // 隣り合うユニットの名前とHPが潰れて読めなくなるのを防ぐ。
      // 上に空きが無くなったら下側へ回す(上端で潰し合うのを避ける)
      const left = anchor.x - width / 2;
      const right = anchor.x + width / 2;
      const overlaps = (candidate: number) =>
        placedCards.find(
          (r) => left < r.right - 2 && right > r.left + 2 && candidate < r.bottom - 2 && candidate + height > r.top + 2,
        );

      for (let guard = 0; guard < 8; guard++) {
        const hit = overlaps(top);
        if (!hit) break;
        const above = hit.top - height - 2;
        if (above >= 2) {
          top = above;
        } else {
          // 上が詰まっているので、ぶつかった相手の下へ回す
          top = hit.bottom + 2;
        }
      }
      top = Math.max(2, top);

      placedCards.push({ left, right, top, bottom: top + height });
      refs.card.style.left = `${anchor.x}px`;
      refs.card.style.top = `${top + height}px`;
    }
  }
  overlayFrame = requestAnimationFrame(syncOverlay);

  const actionPanelEl = el("div", { className: "action-panel-slot" });
  const skillDock = el("div", { className: "skill-dock" });

  /** スキルドックに出す対象。手番待ちならその者、そうでなければ直前に動いた味方 */
  let dockUnit: BattleUnit | null = null;

  /**
   * 画面下のスキルドックを描き直す。
   *
   * 手番が来ていない時も、直前に動いた味方のスキルとクールタイムを
   * 出したままにする。押せる時だけ現れる作りだと、そのたびに
   * 画面の高さが変わって戦場が揺れてしまう。
   */
  function renderSkillDock(): void {
    const unit = picker.phase === "SKILL" ? picker.unit : dockUnit;
    if (!unit) {
      skillDock.replaceChildren();
      skillDock.classList.remove("skill-dock--active");
      return;
    }

    const active = picker.phase === "SKILL";
    skillDock.classList.toggle("skill-dock--active", active);

    skillDock.replaceChildren(
      el("div", { className: "skill-dock__owner" }, [unit.def.name]),
      el(
        "div",
        { className: "skill-dock__row" },
        unit.def.skills.map((skill, i) => {
          const idx = i as 0 | 1 | 2;
          const remaining = unit.cooldowns[idx];
          const usable = active && remaining === 0;
          const classes = ["skill-btn"];
          if (remaining > 0) classes.push("skill-btn--cooling");
          if (!usable) classes.push("skill-btn--idle");

          return el(
            "button",
            {
              type: "button",
              className: classes.join(" "),
              disabled: !usable,
              title: skill.effects.map((e) => describeSkillEffect(e)).join(" / "),
              onclick: () => {
                if (usable) handleSkillPicked(unit, idx, skill);
              },
            },
            [
              el("span", { className: "skill-btn__face", style: `--elem:${unit.def.color}` }, [
                el("span", { className: "skill-btn__index" }, [String(idx + 1)]),
                remaining > 0 ? el("span", { className: "skill-btn__cool" }, [String(remaining)]) : null,
              ].filter((n): n is HTMLElement => n !== null)),
              el("span", { className: "skill-btn__name" }, [skill.name]),
            ],
          );
        }),
      ),
    );
  }
  const logEl = el("div", { className: "battle-log" });
  const resultBanner = el("div", { className: "result-banner result-banner--hidden" });

  function setActive(instanceId: string | null): void {
    if (activeInstanceId) hudRefs.get(activeInstanceId)?.card.classList.remove("unit-hud--active");
    activeInstanceId = instanceId;
    if (activeInstanceId) hudRefs.get(activeInstanceId)?.card.classList.add("unit-hud--active");
    stage.focusOn(instanceId);
  }

  function applySnapshot(snapshot: UnitSnapshot[]): void {
    for (const s of snapshot) {
      const refs = hudRefs.get(s.instanceId);
      if (!refs) continue;
      const ratio = s.maxHp > 0 ? Math.max(0, Math.min(1, s.currentHp / s.maxHp)) : 0;
      refs.hpFill.style.width = `${ratio * 100}%`;
      refs.hpFill.classList.toggle("unit-hud__hp-fill--low", ratio <= 0.3);
      // 回復時は追従バーを即座に合わせ、被弾時だけ遅れて追いつかせる
      const previous = Number.parseFloat(refs.hpTrail.style.width) || 100;
      refs.hpTrail.classList.toggle("unit-hud__hp-trail--instant", ratio * 100 > previous);
      refs.hpTrail.style.width = `${ratio * 100}%`;
      refs.hpText.textContent = String(s.currentHp);
      refs.gaugeFill.style.width = `${Math.min(100, s.gauge)}%`;
      refs.card.classList.toggle("unit-hud--dead", !s.alive);
      refs.badges.replaceChildren(...buildBadgesRow(s));
      stage.syncUnitState(s.instanceId, ratio, s.alive, {
        poison: s.poisonStacks > 0,
        burn: s.burnTurns > 0,
        shield: s.shieldValue > 0,
        immune: s.immuneTurns > 0,
        stun: s.stunTurns > 0,
        // 継続回復は専用フィールドを持たないため、バフ枠と同じ扱いにする
        regen: false,
        buff: s.effects.some((e) => e.kind === "BUFF"),
        debuff: s.effects.some((e) => e.kind === "DEBUFF"),
      });
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
    const position = anchorPositions.get(event.targetId);
    if (!position) return;

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
    // 同じ位置に重ならないよう、左右に少しばらけさせる
    popup.style.left = `${position.x + (Math.random() - 0.5) * 36}px`;
    popup.style.top = `${position.y - 18}px`;
    fxLayer.append(popup);
    popup.addEventListener("animationend", () => popup.remove());
    setTimeout(() => popup.remove(), 1400);
  }

  /** イベント列から、術者が「殴った」のか「唱えた」のかを判定する */
  function isOffensiveTurn(actorId: string, events: BattleEvent[]): boolean {
    const actorTeam = teamOf.get(actorId);
    return events.some((e) => e.kind === "DAMAGE" && teamOf.get(e.targetId) !== actorTeam);
  }

  /** 1件のイベントに対応する3D演出を再生する */
  function playEventVisual(actorId: string, event: BattleEvent, aoe: boolean): void {
    switch (event.kind) {
      case "DAMAGE": {
        const actorTeam = teamOf.get(actorId);
        const isEnemyOfActor = teamOf.get(event.targetId) !== actorTeam;
        // 敵への攻撃は攻撃側の属性で、火傷や毒などの自傷は対象側の属性で弾ける
        stage.playDamage(event.targetId, event.isCrit === true, isEnemyOfActor ? actorId : undefined, aoe);
        break;
      }
      case "HEAL":
        stage.playHeal(event.targetId, aoe);
        break;
      case "DEATH":
        stage.playDeath(event.targetId);
        break;
      case "RESIST":
        stage.playShield(event.targetId);
        break;
    }
    spawnFloatingNumber(event);
  }

  /** ログ行から、VFXでしか表現できない状態変化(バフ/デバフ)を拾う */
  function playStatusVisuals(record: TurnRecord): void {
    for (const line of record.lines) {
      const buffTarget = /\[(?:味方|敵):([A-Z]\d+)\] .* が上昇/.exec(line);
      if (buffTarget) stage.playBuff(buffTarget[1]);
      const debuffTarget = /\[(?:味方|敵):([A-Z]\d+)\] .* が低下/.exec(line);
      if (debuffTarget) stage.playDebuff(debuffTarget[1]);
      const shieldTarget = /\[(?:味方|敵):([A-Z]\d+)\] .* にシールドが張られた/.exec(line);
      if (shieldTarget) stage.playShield(shieldTarget[1]);
    }
  }

  /**
   * その手番で使われたスキルの番号を、ログの見出し行から割り出す。
   * エンジンは「〇〇 の「スキル名」！」という行を必ず先頭に出すので、
   * 名前を行動者の3つのスキルと突き合わせれば番号が分かる。
   * 番号が分かると、必殺技(3番目)だけ演出を別格にできる。
   */
  function skillIndexOf(record: TurnRecord): 0 | 1 | 2 {
    const headline = record.lines.find((line) => !line.startsWith(" "));
    const name = headline ? /「(.+?)」/.exec(headline)?.[1] : undefined;
    if (!name) return 0;
    const actor = engine.getUnits().find((u) => u.instanceId === record.actorId);
    const index = actor?.def.skills.findIndex((skill) => skill.name === name) ?? -1;
    return index === 1 || index === 2 ? index : 0;
  }

  function applyRecord(record: TurnRecord): void {
    setActive(record.actorId);
    if (teamOf.get(record.actorId) === "PLAYER") {
      dockUnit = engine.getUnits().find((u) => u.instanceId === record.actorId) ?? dockUnit;
    }
    appendLines(record.lines);

    const offensive = isOffensiveTurn(record.actorId, record.events);
    const skillIndex = skillIndexOf(record);

    if (offensive) stage.playAttackMotion(record.actorId);
    else stage.playCastMotion(record.actorId);

    // 必殺技は溜めを見せてから撃つ。カメラも寄せて「ここぞ」を作る
    if (skillIndex === 2) stage.playUltimateIntro(record.actorId);

    // 踏み込みモーションを見せてから着弾させる
    const base = offensive ? IMPACT_DELAY_MS[speed] : Math.round(IMPACT_DELAY_MS[speed] * 0.6);
    const delay = skillIndex === 2 ? Math.round(base * 1.6) : base;

    later(() => {
      applySnapshot(record.snapshot);
      playStatusVisuals(record);
      // 複数のユニットが影響を受けていれば全体技とみなし、演出の規模を上げる
      const affected = new Set(record.events.filter((e) => e.kind !== "DEATH").map((e) => e.targetId));
      const aoe = affected.size >= 2;
      if (skillIndex === 2) stage.playUltimateBurst(record.actorId, aoe);
      for (const event of record.events) playEventVisual(record.actorId, event, aoe);
    }, delay);
  }

  function getTargetCandidates(unit: BattleUnit, skill: MonsterDefinition["skills"][number]): BattleUnit[] {
    const allUnits = engine.getUnits();
    if (skill.target === "SINGLE_ENEMY") return allUnits.filter((u) => u.team !== unit.team && u.alive);
    if (skill.target === "SINGLE_ALLY") return allUnits.filter((u) => u.team === unit.team && u.alive);
    return [];
  }

  function renderActionPanel(): void {
    renderSkillDock();
    actionPanelEl.innerHTML = "";
    if (picker.phase === "TARGET") {
      const { unit, skillIndex } = picker;
      const skill = unit.def.skills[skillIndex];
      const candidates = getTargetCandidates(unit, skill);
      // 選んでいた相手が倒れていたら選び直させる
      if (selectedTargetId && !candidates.some((t) => t.instanceId === selectedTargetId)) selectedTargetId = null;
      // 迷わせないよう、最初の1体をあらかじめ選んでおく
      if (!selectedTargetId && candidates.length > 0) selectedTargetId = candidates[0].instanceId;
      stage.setTargetedUnit(selectedTargetId);

      const chosen = candidates.find((t) => t.instanceId === selectedTargetId);
      actionPanelEl.append(
        el("div", { className: "action-panel action-panel--target" }, [
          el("div", { className: "action-panel__title" }, [`「${skill.name}」の対象を選んでください`]),
          el("div", { className: "action-panel__hint" }, ["敵をタップして選び、決定で発動します"]),
          chosen
            ? el("div", { className: "action-panel__chosen" }, [
                el("span", { className: "action-panel__chosen-name" }, [chosen.def.name]),
                el("span", { className: "action-panel__chosen-hp" }, [`${chosen.currentHp}/${chosen.maxHp}`]),
              ])
            : el("div", { className: "action-panel__chosen" }, ["対象が選ばれていません"]),
          el("div", { className: "action-panel__row" }, [
            el(
              "button",
              {
                type: "button",
                className: "btn btn--ghost",
                onclick: () => {
                  picker = { phase: "SKILL", unit };
                  selectedTargetId = null;
                  stage.setTargetedUnit(null);
                  renderActionPanel();
                },
              },
              ["◀ スキル選び直し"],
            ),
            el(
              "button",
              {
                type: "button",
                className: "btn btn--primary",
                disabled: !chosen,
                onclick: () => {
                  if (!selectedTargetId) return;
                  const id = selectedTargetId;
                  selectedTargetId = null;
                  stage.setTargetedUnit(null);
                  handleTargetPicked(unit, skillIndex, id);
                },
              },
              ["決定"],
            ),
          ]),
        ]),
      );
    } else {
      // 対象選びを抜けたら光を消す。消し忘れると戦闘中ずっと光り続ける
      if (selectedTargetId !== null) {
        selectedTargetId = null;
        stage.setTargetedUnit(null);
      }
    }
  }

  /**
   * 3Dの本体をタップして対象を選ぶ。
   * 文字の一覧は画面を覆ってしまい、どれがどの敵か結び付かないので、
   * 本体そのものを叩ける方が分かりやすい。
   * 選ばれた相手は足元の紋様が警告色に変わって脈打つ。
   */
  function handleStageTap(event: PointerEvent): void {
    if (picker.phase !== "TARGET") return;
    const hit = stage.pickUnitAt(event.clientX, event.clientY);
    if (!hit) return;
    const { unit, skillIndex } = picker;
    const candidates = getTargetCandidates(unit, unit.def.skills[skillIndex]);
    if (!candidates.some((t) => t.instanceId === hit)) return;
    selectedTargetId = hit;
    renderActionPanel();
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
    // 決着後はスキルを選べないので、ドックごと下げる。
    // 残したままだと、画面下に重なって報酬のボタンを覆い、
    // 横画面では報酬を受け取れなくなる(実際にその不具合を出した)
    skillDock.classList.add("skill-dock--finished");
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
    cancelPending();
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
      className: "battle-icon-btn battle-icon-btn--play",
      title: "一時停止",
      onclick: () => {
        if (finished) return;
        userPaused = !userPaused;
        playPauseBtn.textContent = userPaused ? "▶" : "⏸";
        playPauseBtn.setAttribute("title", userPaused ? "再生" : "一時停止");
        if (!userPaused) maybeScheduleTick();
        else stopTimer();
      },
    },
    ["⏸"],
  );

  const speedBtn = el(
    "button",
    {
      type: "button",
      className: "battle-speed-btn",
      title: "再生速度",
      onclick: () => {
        speed = SPEED_STEPS[(SPEED_STEPS.indexOf(speed as (typeof SPEED_STEPS)[number]) + 1) % SPEED_STEPS.length];
        speedBtn.textContent = `x${speed}`;
      },
    },
    ["x1"],
  );

  const modeBtn = el(
    "button",
    {
      type: "button",
      className: "battle-icon-btn",
      title: "オート",
      onclick: () => {
        if (finished) return;
        mode = mode === "AUTO" ? "MANUAL" : "AUTO";
        modeBtn.textContent = mode === "AUTO" ? "🤖" : "✋";
        modeBtn.setAttribute("title", mode === "AUTO" ? "オート" : "手動");
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
    ["🤖"],
  );

  const skipBtn = el(
    "button",
    { type: "button", className: "battle-icon-btn", title: "結果までスキップ", onclick: skipToEnd },
    ["⏭"],
  );

  const finishBtn = el(
    "button",
    { type: "button", className: "btn btn--primary battle-controls__finish battle-controls__finish--hidden" },
    ["結果へ進む"],
  );

  // 戦場を画面いっぱいに広げ、情報と操作はその上に重ねる。
  // 別々の帯に分けて縦に積むと戦場が痩せるうえ、目線も分散する。
  const topBar = el("div", { className: "battle-topbar" }, [
    el("div", { className: "battle-topbar__title" }, [title]),
    el("div", { className: "battle-topbar__controls" }, [modeBtn, speedBtn, playPauseBtn, skipBtn]),
  ]);

  const logStrip = el("div", { className: "battle-logstrip" }, [logEl]);

  // 3Dの本体を叩いて対象を選べるようにする。
  // 回り込みの指の滑りと区別するため、ほとんど動かなかった時だけ選択とみなす
  let tapStartX = 0;
  let tapStartY = 0;
  stage.element.addEventListener("pointerdown", (event) => {
    tapStartX = event.clientX;
    tapStartY = event.clientY;
  });
  stage.element.addEventListener("pointerup", (event) => {
    const moved = Math.hypot(event.clientX - tapStartX, event.clientY - tapStartY);
    if (moved > 12) return;
    handleStageTap(event);
  });

  stageHost.append(topBar, actionPanelEl, skillDock, logStrip);

  const container = el("div", { className: "screen battle-view" }, [stageHost, resultBanner, finishBtn]);

  maybeScheduleTick();

  return {
    element: container,
    dispose: () => {
      stopTimer();
      cancelPending();
      if (overlayFrame !== null) cancelAnimationFrame(overlayFrame);
      stage.dispose();
    },
  };
}
