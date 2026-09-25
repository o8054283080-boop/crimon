import "../ui/accessories.css";
import {
  type AbilityPointAllocation, type AllocatableStat, ABILITY_POINT_VALUES,
  LIMIT_BREAK_CORE_COST, LIMIT_POINT_MAX_PLUS, LIMIT_POINT_MINUS_FACTOR, LIMIT_POINT_RESET_COST, limitStatValue, sanitizeLimitPoints,
} from "../../core/monsterDevelopment.js";
import type { MonsterInstance } from "../../core/monsterInstance.js";
import { isLimitPointsConfirmed, limitPointTotals } from "../../game/ancientCraft.js";
import { el } from "../dom.js";

/**
 * 限界能力付与。**進化核100個で1体ずつ解放する、能力ポイントの外側の配分。**
 *
 * クリエイトの「能力付与」の中、能力ポイントのすぐ下に置く(依頼主の指定)。
 * 前は単独の画面で、詳細画面のボタンから入っていたが、
 * 能力ポイントと並べた方が「ここに+50ある」と分かる。
 *
 * 足した分だけ、どこかを削る。+側の合計は50まで、−側の合計は+側と同じ。
 * +1pt は通常の能力ポイント1ptと同じ伸び、−1pt は**その2倍**減る。
 * **削った側は赤で出す。**何を失っているかを一目で分かるようにする。
 *
 * 能力ポイントと同じ作り(依頼主の指定):各能力にスライダーを付け(±は微調整用)、
 * 確定するまでは自由、確定後は `LIMIT_POINT_RESET_COST` のリセットでしか変えられない。
 * 前は±ボタンだけで、+50まで振るのに50回押す必要があった。
 */
export interface LimitBreakPanelProps {
  monster: MonsterInstance;
  evolutionCores: number;
  gold: number;
  draft: AbilityPointAllocation;
  notice: string | null;
  onUnlock: () => void;
  /**
   * 1つの能力を動かす。**丸めた後の下書き全体を返す。**描き直さない
   * (スライダーを動かしている最中に画面を作り直すと、指のドラッグが途切れる)。
   */
  onSet: (stat: AllocatableStat, value: number) => AbilityPointAllocation;
  /** 指を離した・±を押した後に、画面を描き直す */
  onCommit: () => void;
  onReset: () => void;
  onSave: () => void;
  /** 確定した配分を有料で0へ戻す */
  onPaidReset: () => void;
}

const STATS: { key: AllocatableStat; label: string }[] = [
  { key: "hp", label: "最大HP" },
  { key: "atk", label: "攻撃力" },
  { key: "def", label: "防御力" },
  { key: "spd", label: "速度" },
];

const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString("ja-JP") : n.toFixed(1));

function perPointText(stat: AllocatableStat): string {
  const v = ABILITY_POINT_VALUES[stat];
  return `+1ptで+${fmt(v)} / −1ptで−${fmt(v * LIMIT_POINT_MINUS_FACTOR)}`;
}

/** その配分で実際に増減する値。速度は小数で持つので、画面では小数1桁まで出す */
function effectText(stat: AllocatableStat, points: number): string {
  if (points === 0) return "±0";
  const value = limitStatValue(points, stat);
  return value > 0 ? `+${fmt(value)}` : `−${fmt(-value)}`;
}

/**
 * スライダーの塗り。**真ん中(0)から、つまみの位置までを塗る。**
 * 素のスライダーは左端(−50)から塗るので、0の能力まで左半分が塗られ、
 * 「少し振ってある」ように見えていた。足した側は緑、削った側は赤(行の色と同じ)。
 */
function paintSlider(slider: HTMLInputElement, value: number): void {
  const at = 50 + (value / LIMIT_POINT_MAX_PLUS) * 50;
  slider.style.setProperty("--limit-from", `${Math.min(50, at)}%`);
  slider.style.setProperty("--limit-to", `${Math.max(50, at)}%`);
  // 確定後(動かせない)は灰色に沈める
  slider.style.setProperty("--limit-fill", slider.disabled ? "rgba(200, 200, 210, 0.45)" : value < 0 ? "#ff6b6b" : "#8ff0a8");
}

export function renderLimitBreakPanel(props: LimitBreakPanelProps): HTMLElement {
  const unlocked = props.monster.development.limitBreak?.unlocked === true;
  const heading = el("h2", {}, [`限界能力付与(+${LIMIT_POINT_MAX_PLUS})`]);
  if (!unlocked) {
    const canUnlock = props.monster.star >= 6 && props.evolutionCores >= LIMIT_BREAK_CORE_COST;
    return el("section", { className: "panel limit-panel" }, ([
      heading,
      el("p", { className: "acc-note" }, [
        `進化核${LIMIT_BREAK_CORE_COST}個で、この1体の限界能力付与を解放します(★6のみ)。`
        + `解放すると、能力ポイントとは別に最大+${LIMIT_POINT_MAX_PLUS}ptを動かせます。`
        + "足した分と同じだけどこかを削り、削った側は2倍減ります。",
      ]),
      el("p", { className: "acc-note" }, [`進化核 手持ち ${props.evolutionCores.toLocaleString("ja-JP")}個`]),
      props.notice ? el("p", { className: "acc-note", role: "status" }, [props.notice]) : null,
      el("button", {
        type: "button",
        className: "btn btn--primary",
        "data-tour": "limit:unlock",
        disabled: !canUnlock,
        onclick: props.onUnlock,
      }, [props.monster.star < 6
        ? "★6で解放できます"
        : canUnlock ? `解放する(進化核${LIMIT_BREAK_CORE_COST})` : `進化核があと${LIMIT_BREAK_CORE_COST - props.evolutionCores}個`]),
    ] as (HTMLElement | null)[]).filter((n): n is HTMLElement => n !== null));
  }

  const saved = props.monster.development.limitBreak?.points ?? { hp: 0, atk: 0, def: 0, spd: 0 };
  const confirmed = isLimitPointsConfirmed(props.monster);
  // 確定後は保存済みの配分を見せる(下書きは使わない)
  let draft = confirmed ? { ...saved } : { ...props.draft };

  /*
   * 動かしている最中は、数字だけを書き換える。
   * 行ごとの「効果・値・スライダー」と、合計の帯と保存ボタンの参照を持っておく。
   */
  const rowRefs = new Map<AllocatableStat, { row: HTMLElement; effect: HTMLElement; value: HTMLElement; slider: HTMLInputElement }>();
  const plusText = el("span", {}, []);
  const minusText = el("span", {}, []);
  const stateText = el("span", {}, []);
  const total = el("div", { className: "limit-total" }, [plusText, minusText, stateText]);
  const saveButton = el("button", {
    type: "button",
    className: "btn btn--primary",
    "data-tour": "limit:save",
    onclick: props.onSave,
  }, ["確定する"]) as HTMLButtonElement;

  const refresh = () => {
    for (const { key } of STATS) {
      const refs = rowRefs.get(key);
      if (!refs) continue;
      const value = draft[key];
      refs.row.className = `limit-row${value > 0 ? " limit-row--plus" : value < 0 ? " limit-row--minus" : ""}`;
      refs.effect.textContent = effectText(key, value);
      refs.value.textContent = value > 0 ? `+${value}` : value < 0 ? `−${-value}` : "0";
      if (Number(refs.slider.value) !== value) refs.slider.value = String(value);
      paintSlider(refs.slider, value);
    }
    const { plus, minus } = limitPointTotals(draft);
    const valid = sanitizeLimitPoints({ unlocked: true, points: draft }) !== null;
    const empty = plus === 0 && minus === 0;
    total.className = `limit-total${valid || confirmed ? "" : " limit-total--bad"}`;
    plusText.textContent = `+側 ${plus} / ${LIMIT_POINT_MAX_PLUS}`;
    minusText.textContent = `−側 ${minus}`;
    minusText.className = minus > 0 ? "limit-total__minus" : "";
    stateText.textContent = confirmed ? "確定済み" : empty ? "未設定" : valid ? "確定できます" : "+側と−側を同じにしてください";
    saveButton.disabled = !valid || empty;
  };

  const rows = STATS.map(({ key, label }) => {
    const effect = el("strong", { className: "limit-row__effect" }, []);
    const value = el("span", { className: "limit-row__value" }, []);
    const step = (delta: number) => { draft = props.onSet(key, draft[key] + delta); refresh(); props.onCommit(); };
    const slider = el("input", {
      type: "range",
      min: String(-LIMIT_POINT_MAX_PLUS),
      max: String(LIMIT_POINT_MAX_PLUS),
      step: "1",
      value: String(draft[key]),
      className: "limit-slider",
      disabled: confirmed,
      "aria-label": `${label}の配分`,
      // 動かしている最中: 丸めて数字だけ直す。上限で止まったらつまみも戻す
      oninput: (event: Event) => { draft = props.onSet(key, Number((event.target as HTMLInputElement).value)); refresh(); },
      // 指を離した時だけ描き直す
      onchange: () => props.onCommit(),
    }, []) as HTMLInputElement;
    const row = el("div", { className: "limit-row" }, [
      el("div", { className: "limit-row__name" }, [
        el("span", {}, [label]),
        effect,
        el("small", {}, [perPointText(key)]),
      ]),
      el("button", { type: "button", className: "btn btn--ghost", disabled: confirmed, "aria-label": `${label}を1下げる`, onclick: () => step(-1) }, ["−"]),
      value,
      el("button", { type: "button", className: "btn btn--ghost", disabled: confirmed, "aria-label": `${label}を1上げる`, onclick: () => step(1) }, ["+"]),
      el("div", { className: "limit-row__slider" }, [slider]),
    ]);
    rowRefs.set(key, { row, effect, value, slider });
    return row;
  });
  refresh();

  const cost = LIMIT_POINT_RESET_COST.toLocaleString("ja-JP");
  return el("section", { className: "panel limit-panel" }, ([
    heading,
    el("p", { className: "acc-note" }, ["能力ポイントとは別の配分です。足した分と同じだけどこかを削り、削った側は2倍減ります。"]),
    // **いま自由に動かせるのか、確定済みなのかを先に言う**(能力ポイントと同じ)
    el("p", { className: confirmed ? "create-notice" : "acc-note" }, [
      confirmed
        ? `この配分で確定しています。変えるには ${cost}G のリセットが要ります`
        : "確定するまでは、何度でも無料で振り直せます",
    ]),
    el("div", { className: "limit-rows" }, rows),
    total,
    props.notice ? el("p", { className: "acc-note", role: "status" }, [props.notice]) : null,
    confirmed
      ? el("button", {
        type: "button",
        className: "btn btn--ghost",
        "data-tour": "limit:reset",
        disabled: props.gold < LIMIT_POINT_RESET_COST,
        onclick: props.onPaidReset,
      }, [`限界能力付与リセット ${cost} GOLD`])
      : el("div", { className: "acc-actions" }, [
        el("button", { type: "button", className: "btn btn--ghost", onclick: props.onReset }, ["0に戻す"]),
        saveButton,
      ]),
  ] as (HTMLElement | null)[]).filter((n): n is HTMLElement => n !== null));
}
