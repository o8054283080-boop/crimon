import "../ui/accessories.css";
import {
  type AbilityPointAllocation, type AllocatableStat, ABILITY_POINT_VALUES,
  LIMIT_BREAK_CORE_COST, LIMIT_POINT_MAX_PLUS, LIMIT_POINT_MINUS_FACTOR, limitStatValue, sanitizeLimitPoints,
} from "../../core/monsterDevelopment.js";
import type { MonsterInstance } from "../../core/monsterInstance.js";
import { limitPointTotals } from "../../game/ancientCraft.js";
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
 * 何度でも振り直せる(保存するまでは実際の値は変わらない)。
 */
export interface LimitBreakPanelProps {
  monster: MonsterInstance;
  evolutionCores: number;
  draft: AbilityPointAllocation;
  notice: string | null;
  onUnlock: () => void;
  onChange: (stat: AllocatableStat, delta: number) => void;
  onReset: () => void;
  onSave: () => void;
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

  const { plus, minus } = limitPointTotals(props.draft);
  const valid = sanitizeLimitPoints({ unlocked: true, points: props.draft }) !== null;
  const saved = props.monster.development.limitBreak?.points ?? { hp: 0, atk: 0, def: 0, spd: 0 };
  const dirty = STATS.some(({ key }) => saved[key] !== props.draft[key]);
  return el("section", { className: "panel limit-panel" }, ([
    heading,
    el("p", { className: "acc-note" }, ["能力ポイントとは別の配分です。足した分と同じだけどこかを削り、削った側は2倍減ります。"]),
    el("div", { className: "limit-rows" }, STATS.map(({ key, label }) => {
      const value = props.draft[key];
      const tone = value > 0 ? " limit-row--plus" : value < 0 ? " limit-row--minus" : "";
      return el("div", { className: `limit-row${tone}` }, [
        el("div", { className: "limit-row__name" }, [
          el("span", {}, [label]),
          el("strong", { className: "limit-row__effect" }, [effectText(key, value)]),
          el("small", {}, [perPointText(key)]),
        ]),
        el("button", { type: "button", className: "btn btn--ghost", "aria-label": `${label}を1下げる`, onclick: () => props.onChange(key, -1) }, ["−"]),
        el("span", { className: "limit-row__value" }, [value > 0 ? `+${value}` : value < 0 ? `−${-value}` : "0"]),
        el("button", { type: "button", className: "btn btn--ghost", "aria-label": `${label}を1上げる`, onclick: () => props.onChange(key, 1) }, ["+"]),
      ]);
    })),
    el("div", { className: `limit-total${valid ? "" : " limit-total--bad"}` }, [
      el("span", {}, [`+側 ${plus} / ${LIMIT_POINT_MAX_PLUS}`]),
      el("span", { className: minus > 0 ? "limit-total__minus" : "" }, [`−側 ${minus}`]),
      el("span", {}, [valid ? (dirty ? "保存できます" : "保存済み") : "+側と−側を同じにしてください"]),
    ]),
    props.notice ? el("p", { className: "acc-note", role: "status" }, [props.notice]) : null,
    el("div", { className: "acc-actions" }, [
      el("button", { type: "button", className: "btn btn--ghost", onclick: props.onReset }, ["0に戻す"]),
      el("button", {
        type: "button",
        className: "btn btn--primary",
        "data-tour": "limit:save",
        disabled: !valid || !dirty,
        onclick: props.onSave,
      }, ["保存する"]),
    ]),
  ] as (HTMLElement | null)[]).filter((n): n is HTMLElement => n !== null));
}
