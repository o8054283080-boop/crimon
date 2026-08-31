import { BattleEngine, BattleEvent, BattleWinner, ManualChoice, TurnRecord, UnitSnapshot } from "../../battle/engine.js";
import { formatHpPair } from "../../core/stats.js";
import { BattleUnit } from "../../battle/unit.js";
import { MonsterDefinition } from "../../core/monster.js";
import { describeSkillLines } from "../../core/skill.js";
import { hitStyleForRole, playHitSfx, playSfx, sfxElementOf } from "../audio/index.js";
import { el } from "../dom.js";
import { BattleStage, StageUnitInit } from "../three/battleStage.js";
import { BattleVenue } from "../three/stageBackdrop.js";
import { withPortrait } from "../three/portrait.js";
import { FloatKind, UnitHudRefs, buildFloatingNumber, buildHudCard, buildStatusChips } from "./battleHud.js";

/** 周回の途中であることを戦闘画面へ伝える */
export interface BattleChainInfo {
  /** 今が何戦目か(1始まり) */
  index: number;
  /** まとめて挑むと決めた総数 */
  total: number;
  /** すでに「この1戦で終える」が押されているか */
  stopped: boolean;
  /** ⏹ が押された。この1戦を終えたら切り上げる */
  onStop: () => void;
  /**
   * ⏹ を長押しした時に出る説明。
   * 周回と塔で**やめる対象が違う**ので、呼ぶ側が言葉を決める
   */
  stopTitle?: string;
}

export interface BattleViewProps {
  engine: BattleEngine;
  playerTeam: MonsterDefinition[];
  enemyTeam: MonsterDefinition[];
  title?: string;
  /** 決着後に表示するボタンのラベル(勝敗によって文言を変えたい場合に使う) */
  resultLabel: (winner: BattleWinner) => string;
  /** 決着後、結果ボタンが押されたら呼ばれる */
  onFinish: (winner: BattleWinner) => void;
  /** 周回の途中なら渡す。勝った時だけ自動で次の1戦へ送る */
  chain?: BattleChainInfo;
  /**
   * 舞台が決まっている戦いだけ渡す(試練の塔・対人戦)。
   * 省略すると、敵チームで最も多い属性から舞台が決まる。
   */
  venue?: BattleVenue;
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

/**
 * 選んだ再生速度は覚えておき、次の戦闘へ持ち越す。
 *
 * 周回は戦闘画面を続けて何度も開く。戦闘ごとに等倍へ戻ると、
 * **10回まとめて挑むたびに10回押し直す**ことになる。
 * 速度は「その戦闘の設定」ではなく「その人の見たい速さ」なので、覚えておく。
 *
 * 効き幅が大きい。実測(装備ダンジョン5階)で1戦あたり x8 が約37秒、
 * 等倍だとその8倍。10回まわす時にここが戻っていると、丸ごと別の遊びになる。
 * だから起動をまたいでも残す。
 */
const SPEED_STORAGE_KEY = "crimon_battle_speed";

function loadSharedSpeed(): (typeof SPEED_STEPS)[number] {
  try {
    const saved = localStorage.getItem(SPEED_STORAGE_KEY);
    const found = SPEED_STEPS.find((step) => step === saved);
    if (found) return found;
  } catch {
    // 端末の設定で localStorage が塞がれていることがある。速度が無くても遊べる
  }
  return "1";
}

function saveSharedSpeed(value: (typeof SPEED_STEPS)[number]): void {
  try {
    localStorage.setItem(SPEED_STORAGE_KEY, value);
  } catch {
    // 同上。保存できなくても、そのセッションの間は持ち越せている
  }
}

let sharedSpeed: (typeof SPEED_STEPS)[number] = loadSharedSpeed();

/** 勝った後、次の1戦へ送るまでの間。報酬の行を読める程度には置く */
const CHAIN_ADVANCE_MS = 1400;

type PickerState =
  | { phase: "NONE" }
  | { phase: "SKILL"; unit: BattleUnit }
  | { phase: "TARGET"; unit: BattleUnit; skillIndex: 0 | 1 | 2 };

/**
 * 札を本体の頭からどれだけ浮かせるか(拡大前の画素)。
 * 0にすると札の底辺がキャラの頭に食い込み、角と輪郭が混ざって汚くなる。
 */
const HUD_LIFT = 10;

/** 押し上げられた札から本体へ引く線を出す、最短の距離(この長さまでは線を出さない) */
const LEADER_MIN = 18;

/**
 * 札の縮小の下限。
 *
 * 3D側は奥行きに応じて 0.78 まで縮めてくるが、その倍率をそのまま札へ掛けると
 * 10.5pxの名前が8.2pxまで落ちて実機で読めない(巡回の「9px未満」の基準にも触れる)。
 * 奥行きの手掛かりは残したいので、縮小そのものは残したうえで床を作る。
 */
const HUD_MIN_SCALE = 0.88;

export function renderBattleView(props: BattleViewProps): BattleViewHandle {
  const { engine, playerTeam, enemyTeam, title = "バトル", resultLabel, onFinish, chain, venue } = props;

  let mode: "AUTO" | "MANUAL" = "AUTO";
  let userPaused = false;
  let speed: (typeof SPEED_STEPS)[number] = sharedSpeed;
  let finished = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  /** 周回で次の1戦へ送るための待ち。画面を離れる時に必ず止める */
  let chainHandle: ReturnType<typeof setTimeout> | null = null;
  let picker: PickerState = { phase: "NONE" };
  /** 対象選びで今光らせている相手 */
  let selectedTargetId: string | null = null;
  let activeInstanceId: string | null = null;

  const hudRefs = new Map<string, UnitHudRefs>();
  const teamOf = new Map<string, "PLAYER" | "ENEMY">();
  const anchorPositions = new Map<string, { x: number; y: number }>();

  /** 着弾待ちなど、時間差で走る演出。画面を離れる時にまとめて取り消す */
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

  function cancelPending(): void {
    for (const entry of pendingEffects.splice(0, pendingEffects.length)) clearTimeout(entry.handle);
  }

  // --- 3Dステージ ---
  const stageUnits: StageUnitInit[] = [
    ...playerTeam.map((def, i) => ({ instanceId: `P${i + 1}`, def, team: "PLAYER" as const })),
    ...enemyTeam.map((def, i) => ({ instanceId: `E${i + 1}`, def, team: "ENEMY" as const })),
  ];
  for (const unit of stageUnits) teamOf.set(unit.instanceId, unit.team);
  /** 効果音は術者の属性と役割で鳴り方が変わるので、定義を引けるようにしておく */
  const defOf = new Map<string, MonsterDefinition>(stageUnits.map((u) => [u.instanceId, u.def]));

  const stageHost = el("div", { className: "battle-stage" });
  const overlay = el("div", { className: "battle-stage__overlay" });
  const fxLayer = el("div", { className: "battle-stage__fx" });
  stageHost.append(overlay, fxLayer);

  for (const unit of stageUnits) {
    const { card, refs } = buildHudCard(unit.def, unit.team);
    hudRefs.set(unit.instanceId, refs);
    if (unit.team === "ENEMY") {
      card.classList.add("unit-hud--focusable");
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", `${unit.def.name}を集中攻撃ターゲットに指定`);
      card.addEventListener("pointerup", (event) => {
        event.stopPropagation();
        if (picker.phase === "TARGET") return;
        engine.setFocusTarget(unit.instanceId);
        syncFocusTarget();
      });
    }
    overlay.append(card);
  }

  const stage = new BattleStage(stageHost, stageUnits, venue);

  // 3Dの座標に合わせてHUDカードを毎フレーム追従させる
  let overlayFrame: number | null = null;
  /** 重なり回避のために積み上げた、このフレームで確定済みのカード矩形 */
  const placedCards: { left: number; right: number; top: number; bottom: number }[] = [];

  /**
   * HPと行動ゲージの札を、**それぞれの本体の頭の真上**へ置く。
   *
   * ## 画面の端に固定するのをやめた理由
   *
   * 隊列を片側2列の千鳥にしたら、**端の列が画面の左端まで来た。**
   * 390pxの画面に4列(味方2・敵2)を並べると、外側の列は x=4〜118 を占める。
   * 端に置いた札(x=6〜118)とちょうど同じ場所で、
   * どこへ寄せても札が本体を覆う。**両立できない。**
   *
   * 頭の上へ戻す。以前この形をやめたのは、4体が固まった時に札どうしが
   * ぶつかって対応が付かなくなったからだが、千鳥では
   * **隣り合う段が横に72pxずれている**ので、そもそも重なりが浅い。
   *
   * 上へ逃がすのは、下だと隣の本体の顔に掛かるため。
   * 上なら掛かるのは足元で、見た目の損が小さい。
   */
  /**
   * 札の下端と本体の頭のあいだに空ける隙間(px)。
   *
   * 4px → 8px → **16px** と2度上げている。どちらも実機を見た依頼主から
   * 「まだ近い」という指摘を受けての調整。
   *
   * 数字の上では8pxでも重なっていなかったが、**触れていないことと
   * 離れて見えることは違う。** 羽や角や毛先は輪郭がぼけているので、
   * 板の上端ちょうどまで色が残っていなくても近く見える。
   * 待機の漂い(浮遊型で±3px)もここへ食い込む。
   *
   * 上げるぶんは段の間隔(`battleStage.ts` の `RUNG`)から借りている。
   * **片方だけ上げると、ひとつ上の段の本体に札が刺さる。**
   */
  const HUD_HEAD_GAP = 16;
  /** 札が画面の端からはみ出さないよう残す余白(px) */
  const HUD_EDGE = 4;
  /*
   * 札は**本体の真上**に置く。横へ逃がさない。
   *
   * 名前とHPの数字を積んでいた頃(高さ74px)は、上の段の本体に掛かるので
   * 列のずれの向きへ34px逃がしていた。細い帯(33px)にしたことで
   *
   *   本体の頭の上4px から 37px ぶんが札 → 上の段の足元まであと4px
   *
   * となり、**縦で完全に逃げ切れる**ようになった。逃がすのをやめると、
   * 帯がどの本体のものかが真上で読める。
   */

  function syncOverlay(): void {
    overlayFrame = requestAnimationFrame(syncOverlay);
    placedCards.length = 0;

    const viewWidth = overlay.clientWidth || stageHost.clientWidth || 390;

    // 画面の上にいるものから順に置く。ぶつかったら下へ送るので、
    // 上から詰めた方が並び順が本体の並びと一致する
    /*
     * **立ち位置(slotX/slotY)で並べる。**
     * 本体の現在位置で並べると、待機の漂いで並び順が入れ替わった瞬間に
     * 札が飛ぶ。順序も位置も、動かない値から決める。
     */
    const anchors = stage.computeScreenAnchors().sort((a, b) => a.slotY - b.slotY);

    for (const anchor of anchors) {
      const refs = hudRefs.get(anchor.instanceId);
      if (!refs) continue;

      anchorPositions.set(anchor.instanceId, { x: anchor.x, y: anchor.y });
      const scale = Math.max(HUD_MIN_SCALE, anchor.scale);
      const isPlayer = teamOf.get(anchor.instanceId) !== "ENEMY";
      /*
       * 細い帯(HPバーと行動ゲージの2本だけ)。
       * 名前・★・紋章・HPの数字は出さない。**段の間隔に入らない。**
       * 詳しくは style.css の `.unit-hud--slim` の説明を読むこと。
       */
      refs.card.classList.add("unit-hud--slim");
      // 本体の真上に、中央を合わせて置く
      refs.card.style.transform = `translate(-50%, -100%) scale(${scale.toFixed(3)})`;
      refs.card.style.transformOrigin = "center bottom";
      refs.card.style.visibility = anchor.visible ? "visible" : "hidden";

      const width = (refs.card.offsetWidth || 104) * scale;
      const height = (refs.card.offsetHeight || 46) * scale;
      /*
       * 横は本体の真上。ただし**画面の外へ出さない。**
       * 外側の列は画面の端まで来るので、そのまま中央を合わせると
       * 札の左半分が切れて、HPの数字が読めなくなる。
       */
      const anchorX = Math.min(
        viewWidth - HUD_EDGE - width / 2,
        Math.max(HUD_EDGE + width / 2, anchor.slotX),
      );
      const left = anchorX - width / 2;
      const right = anchorX + width / 2;

      /*
       * 縦は**本体の頭のすぐ上**に置き、ぶつかったぶんだけ下へ送る。
       *
       * `anchor.slotY` は本体の絵の上端を指す。
       * そこから隙間ぶん上を札の下端にすると、札は頭に触れない。
       */
      let top = anchor.slotY - height - HUD_HEAD_GAP;
      const overlaps = (candidate: number) =>
        placedCards.find(
          (r) => left < r.right - 2 && right > r.left + 2 && candidate < r.bottom - 2 && candidate + height > r.top + 2,
        );
      for (let guard = 0; guard < 8; guard++) {
        const hit = overlaps(top);
        if (!hit) break;
        top = hit.bottom + 3;
      }
      top = Math.max(2, top);

      placedCards.push({ left, right, top, bottom: top + height });
      refs.card.style.left = `${anchorX}px`;
      // transform が `-100%` なので、指定するのは札の**下端**
      refs.card.style.top = `${top + height}px`;

      // ぶつかって下へ送られた時だけ、本体まで線を引いて対応を示す
      refs.card.classList.remove("unit-hud--lifted");
      refs.leader.style.height = "0px";
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
          const skillLocked = unit.statusEffects.some((effect) => effect.type === "SKILL_LOCK") && idx !== 0;
          const usable = active && remaining === 0 && !skillLocked;
          const classes = ["skill-btn"];
          if (remaining > 0) classes.push("skill-btn--cooling");
          if (!usable) classes.push("skill-btn--idle");

          return el(
            "button",
            {
              type: "button",
              className: classes.join(" "),
              disabled: !usable,
              title: describeSkillLines(skill).join(" / "),
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

  function syncFocusTarget(): void {
    const focused = engine.getFocusTarget();
    for (const [id, refs] of hudRefs) {
      refs.card.classList.toggle("unit-hud--focused", id === focused);
      refs.card.setAttribute("aria-pressed", String(id === focused));
    }
  }

  function applySnapshot(snapshot: UnitSnapshot[], immediate = false): void {
    for (const s of snapshot) {
      const refs = hudRefs.get(s.instanceId);
      if (!refs) continue;
      const ratio = s.maxHp > 0 ? Math.max(0, Math.min(1, s.currentHp / s.maxHp)) : 0;
      refs.hpFill.style.width = `${ratio * 100}%`;
      /*
       * 残量で色を3段に切り替える。緑のままだと「あと少しで落ちる」が
       * 帯の長さでしか伝わらず、4体ぶんを一度に見ている時に見落とす。
       */
      const band = ratio <= 0.25 ? "low" : ratio <= 0.55 ? "mid" : "high";
      refs.plate.setAttribute("data-hp", band);
      // 回復時は追従バーを即座に合わせ、被弾時だけ遅れて追いつかせる
      const previous = Number.parseFloat(refs.hpTrail.style.width) || 100;
      refs.hpTrail.classList.toggle("unit-hud__hp-trail--instant", immediate || ratio * 100 > previous);
      refs.hpTrail.style.width = `${ratio * 100}%`;
      // シールドはHPの上に重ねる。別の帯にすると札が1段高くなる
      const shieldRatio = s.maxHp > 0 ? Math.max(0, Math.min(1, s.shieldValue / s.maxHp)) : 0;
      refs.hpShield.style.width = `${shieldRatio * 100}%`;
      // 現在値だけでは「あと何割か」が読めない。分母まで出す
      refs.hpText.textContent = formatHpPair(s.currentHp, s.maxHp);
      refs.hpText.title = `HP ${s.currentHp} / ${s.maxHp}`;
      refs.gaugeFill.style.width = `${Math.min(100, s.gauge)}%`;
      refs.card.classList.toggle("unit-hud--dead", !s.alive);
      refs.chips.replaceChildren(...buildStatusChips(s));
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
    syncFocusTarget();
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

    const text = event.kind === "DAMAGE" ? `${event.amount}` : event.kind === "HEAL" ? `+${event.amount}` : "MISS";
    /*
     * 通した攻撃と食らった攻撃を色で分ける。
     * どちらも同じ赤で出していたので、乱戦になると
     * 「今の一撃はこちらが痛いのか、相手が痛いのか」が読めなかった。
     */
    const kind: FloatKind =
      event.kind === "DAMAGE"
        ? event.isCrit
          ? "crit"
          : teamOf.get(event.targetId) === "PLAYER"
            ? "damage-taken"
            : "damage"
        : event.kind === "HEAL"
          ? "heal"
          : "resist";

    const popup = buildFloatingNumber(kind, text);
    // 同じ位置に重ならないよう、左右に少しばらけさせる
    popup.style.left = `${position.x + (Math.random() - 0.5) * 34}px`;
    popup.style.top = `${position.y - 22}px`;
    fxLayer.append(popup);
    popup.addEventListener("animationend", () => popup.remove());
    setTimeout(() => popup.remove(), 1600);
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
        // 音も同じ理屈で、攻撃なら術者、自傷なら対象の属性・役割を使う
        const source = defOf.get(isEnemyOfActor ? actorId : event.targetId);
        playHitSfx({
          element: sfxElementOf(source?.element),
          hitStyle: hitStyleForRole(source?.role),
          crit: event.isCrit === true,
          // 全体攻撃は1体ずつ鳴らすと団子になるので、1発あたりを軽くする
          power: aoe ? 0.8 : 1.1,
        });
        break;
      }
      case "HEAL":
        stage.playHeal(event.targetId, aoe);
        playSfx("heal", 0.85);
        break;
      case "DEATH":
        stage.playDeath(event.targetId);
        playSfx("death");
        break;
      case "RESIST":
        stage.playShield(event.targetId);
        playSfx("shield", 0.7);
        break;
    }
    spawnFloatingNumber(event);
  }

  /** ログ行から、VFXでしか表現できない状態変化(バフ/デバフ)を拾う */
  function playStatusVisuals(record: TurnRecord): void {
    for (const line of record.lines) {
      const buffTarget = /\[(?:味方|敵):([A-Z]\d+)\] .* が上昇/.exec(line);
      if (buffTarget) {
        stage.playBuff(buffTarget[1]);
        playSfx("buff", 0.6);
      }
      const debuffTarget = /\[(?:味方|敵):([A-Z]\d+)\] .* が低下/.exec(line);
      if (debuffTarget) {
        stage.playDebuff(debuffTarget[1]);
        playSfx("debuff", 0.6);
      }
      const shieldTarget = /\[(?:味方|敵):([A-Z]\d+)\] .* にシールドが張られた/.exec(line);
      if (shieldTarget) {
        stage.playShield(shieldTarget[1]);
        playSfx("shield", 0.7);
      }
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
    // 手番の合図。味方と敵で高さを変え、誰の番かを音だけで分かるようにする
    playSfx(teamOf.get(record.actorId) === "PLAYER" ? "turnAlly" : "turnEnemy", 0.5);
    if (teamOf.get(record.actorId) === "PLAYER") {
      dockUnit = engine.getUnits().find((u) => u.instanceId === record.actorId) ?? dockUnit;
    }
    appendLines(record.lines);

    const offensive = isOffensiveTurn(record.actorId, record.events);
    const skillIndex = skillIndexOf(record);

    if (offensive) stage.playAttackMotion(record.actorId);
    else stage.playCastMotion(record.actorId);

    // 必殺技は溜めを見せてから撃つ。カメラも寄せて「ここぞ」を作る
    if (skillIndex === 2) {
      stage.playUltimateIntro(record.actorId);
      playSfx("charge", 0.8);
    }

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
    const hit = stage.pickUnitAt(event.clientX, event.clientY);
    if (!hit) return;
    if (picker.phase !== "TARGET") {
      const enemy = engine.getUnits().find((unit) => unit.instanceId === hit && unit.team === "ENEMY" && unit.alive);
      if (enemy) {
        engine.setFocusTarget(hit);
        syncFocusTarget();
      }
      return;
    }
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
    if (winner === "PLAYER") playSfx("victory");
    else if (winner === "ENEMY") playSfx("defeat");
    // 勝った側が小さく跳ねる。引き分けはどちらも跳ねない
    if (winner === "PLAYER" || winner === "ENEMY") stage.playVictoryMotion(winner);
    const text = winner === "PLAYER" ? "🎉 勝利！" : winner === "ENEMY" ? "💀 敗北…" : "🤝 引き分け";
    resultBanner.append(el("div", { className: "result-banner__text" }, [text]));
    finishBtn.textContent = resultLabel(winner);
    finishBtn.classList.remove("battle-controls__finish--hidden");
    finishBtn.onclick = () => {
      if (chainHandle !== null) clearTimeout(chainHandle);
      onFinish(winner);
    };

    /*
     * 周回で勝った時だけ、自分で次の1戦へ送る。
     *
     * 10回まとめて挑んだのに毎回ボタンを押させるのでは、まとめた意味が無い。
     * **負けた時は送らない。**そこで周回は終わりで、何が起きて止まったのかを
     * 見せないまま集計画面へ飛ばすと、負けたこと自体に気づけない。
     */
    if (chain && winner === "PLAYER") {
      chainHandle = setTimeout(() => {
        chainHandle = null;
        onFinish(winner);
      }, CHAIN_ADVANCE_MS);
    }
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
        speed = SPEED_STEPS[(SPEED_STEPS.indexOf(speed) + 1) % SPEED_STEPS.length];
        sharedSpeed = speed;
        saveSharedSpeed(speed);
        speedBtn.textContent = `x${speed}`;
      },
    },
    [`x${speed}`],
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

  /*
   * 周回の進み具合と、その場で切り上げる手段。
   *
   * **周回に入ると、終わるまで戻る手段が無くなる。** 10回と決めて始めた後で
   * 気が変わっても、負けるまで抜けられないのでは操作として成り立たない。
   * 押すと今の1戦だけを見届けて周回を終える(戦闘の途中で成果を捨てさせない)。
   *
   * **短く保つこと。**縦画面(390px)では上帯の幅がぎりぎりで、
   * ここを1文字太らせると場所の名前が「装備ダンジョ…」と削れる。
   */
  const chainBtn = chain
    ? el(
        "button",
        {
          type: "button",
          className: "battle-chain-btn",
          title: chain.stopTitle ?? "この1戦で周回を終える",
          disabled: chain.stopped,
          onclick: () => {
            chain.onStop();
            chainBtn!.textContent = "最後";
            chainBtn!.setAttribute("disabled", "");
          },
        },
        [chain.stopped ? "最後" : `⏹ ${chain.index}/${chain.total}`],
      )
    : null;

  const finishBtn = el(
    "button",
    { type: "button", className: "btn btn--primary battle-controls__finish battle-controls__finish--hidden" },
    ["結果へ進む"],
  );

  // 戦場を画面いっぱいに広げ、情報と操作はその上に重ねる。
  // 別々の帯に分けて縦に積むと戦場が痩せるうえ、目線も分散する。
  const topBar = el("div", { className: "battle-topbar" }, [
    el("div", { className: "battle-topbar__title" }, [title]),
    el("div", { className: "battle-topbar__controls" }, [
      ...(chainBtn ? [chainBtn] : []),
      modeBtn,
      speedBtn,
      playPauseBtn,
    ]),
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

  /*
   * 開幕の状態を札へ写しておく。
   *
   * これまでは定義上の最大HPを一度書くだけで、**最初の手番が解決するまで
   * 一度も同期していなかった。** ウェーブを持ち越して始まる戦闘(前の波で
   * 削れたHPのまま始まる)では、満タンの帯が最初の1手でいきなり落ちる、
   * という嘘の絵になっていた。状態異常の印も同じ理由で出ていなかった。
   */
  applySnapshot(
    engine.getUnits().map((u) => ({
      instanceId: u.instanceId,
      team: u.team,
      currentHp: u.currentHp,
      maxHp: u.maxHp,
      gauge: Math.round(u.gauge),
      alive: u.alive,
      effects: u.effects.map((e) => ({ ...e })),
      statusEffects: u.statusEffects.map((e) => ({ ...e })),
      stunTurns: u.stunTurns,
      burnTurns: u.burnTurns,
      shieldValue: u.shieldValue,
      shieldTurns: u.shieldTurns,
      immuneTurns: u.immuneTurns,
      poisonStacks: u.poisonStacks,
      poisonTurns: u.poisonTurns,
      blindTurns: u.blindTurns,
    })),
    true,
  );

  maybeScheduleTick();

  return {
    element: container,
    dispose: () => {
      stopTimer();
      if (chainHandle !== null) clearTimeout(chainHandle);
      cancelPending();
      if (overlayFrame !== null) cancelAnimationFrame(overlayFrame);
      stage.dispose();
    },
  };
}
