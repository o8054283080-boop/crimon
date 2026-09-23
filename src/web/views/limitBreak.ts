import "../ui/accessories.css";
import {
  type AbilityPointAllocation, type AllocatableStat, ABILITY_POINT_VALUES,
  LIMIT_BREAK_CORE_COST, LIMIT_POINT_MAX_PLUS, LIMIT_POINT_MINUS_FACTOR, sanitizeLimitPoints,
} from "../../core/monsterDevelopment.js";
import type { MonsterInstance } from "../../core/monsterInstance.js";
import { findMonsterById } from "../../data/monsters.js";
import { limitPointTotals } from "../../game/ancientCraft.js";
import type { PlayerState } from "../../game/playerState.js";
import { el } from "../dom.js";

/**
 * 限界能力付与。**進化核100個で1体ずつ解放する、能力ポイントの外側の配分。**
 *
 * 足した分だけ、どこかを削る。+側の合計は50まで、−側の合計は+側と同じ。
 * +1pt は通常の能力ポイント1ptと同じ伸び、−1pt は**その2倍**減る。
 * 何度でも振り直せる(保存するまでは実際の値は変わらない)。
 */
export interface LimitBreakProps {
  player: PlayerState;
  monster: MonsterInstance;
  draft: AbilityPointAllocation;
  notice: string | null;
  onUnlock: () => void;
  onChange: (stat: AllocatableStat, delta: number) => void;
  onReset: () => void;
  onSave: () => void;
  onBack: () => void;
}

const STATS: { key: AllocatableStat; label: string }[] = [
  { key: "hp", label: "HP" },
  { key: "atk", label: "攻撃力" },
  { key: "def", label: "防御力" },
  { key: "spd", label: "素早さ" },
];

function perPointText(stat: AllocatableStat): string {
  const v = ABILITY_POINT_VALUES[stat];
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  return `+1ptで+${fmt(v)} / −1ptで−${fmt(v * LIMIT_POINT_MINUS_FACTOR)}`;
}

export function renderLimitBreak(props: LimitBreakProps): HTMLElement {
  const dex = findMonsterById(props.monster.dexId);
  const name = `${dex?.name ?? props.monster.dexId}★${props.monster.star}`;
  const unlocked = props.monster.development.limitBreak?.unlocked === true;
  const cores = props.player.evolutionCores ?? 0;
  const header = el("header", { className: "app-header app-header--row" }, [
    el("button", { type: "button", className: "btn btn--ghost", onclick: props.onBack }, ["◀ 戻る"]),
    el("h1", {}, ["限界能力付与"]),
  ]);
  if (!unlocked) {
    const canUnlock = props.monster.star >= 6 && cores >= LIMIT_BREAK_CORE_COST;
    return el("div", { className: "screen limit-screen" }, [
      header,
      el("p", { className: "acc-note" }, [`${name}`]),
      el("p", { className: "acc-note" }, [
        `進化核${LIMIT_BREAK_CORE_COST}個で、この1体の限界能力付与を解放します(★6のみ)。`
        + `解放すると、能力ポイントとは別に最大+${LIMIT_POINT_MAX_PLUS}ptを動かせます。`
        + "足した分と同じだけどこかを削り、削った側は2倍減ります。",
      ]),
      el("p", { className: "acc-note" }, [`進化核 手持ち ${cores.toLocaleString("ja-JP")}個`]),
      props.notice ? el("p", { className: "acc-note", role: "status" }, [props.notice]) : null,
      el("button", {
        type: "button",
        className: "btn btn--primary",
        "data-tour": "limit:unlock",
        disabled: !canUnlock,
        onclick: props.onUnlock,
      }, [props.monster.star < 6 ? "★6で解放できます" : canUnlock ? `解放する(進化核${LIMIT_BREAK_CORE_COST})` : `進化核があと${LIMIT_BREAK_CORE_COST - cores}個`]),
    ].filter((n): n is HTMLElement => n !== null));
  }

  const { plus, minus } = limitPointTotals(props.draft);
  const valid = sanitizeLimitPoints({ unlocked: true, points: props.draft }) !== null;
  const saved = props.monster.development.limitBreak?.points ?? { hp: 0, atk: 0, def: 0, spd: 0 };
  const dirty = STATS.some(({ key }) => saved[key] !== props.draft[key]);
  return el("div", { className: "screen limit-screen" }, [
    header,
    el("p", { className: "acc-note" }, [name]),
    el("div", { className: "limit-rows" }, STATS.map(({ key, label }) => {
      const value = props.draft[key];
      return el("div", { className: "limit-row" }, [
        el("div", { className: "limit-row__name" }, [label, el("small", {}, [perPointText(key)])]),
        el("button", { type: "button", className: "btn btn--ghost", ariaLabel: `${label}を1下げる`, onclick: () => props.onChange(key, -1) }, ["−"]),
        el("span", { className: `limit-row__value${value > 0 ? " limit-row__value--plus" : value < 0 ? " limit-row__value--minus" : ""}` }, [
          value > 0 ? `+${value}` : String(value),
        ]),
        el("button", { type: "button", className: "btn btn--ghost", ariaLabel: `${label}を1上げる`, onclick: () => props.onChange(key, 1) }, ["+"]),
      ]);
    })),
    el("div", { className: `limit-total${valid ? "" : " limit-total--bad"}` }, [
      el("span", {}, [`+側 ${plus} / ${LIMIT_POINT_MAX_PLUS}`]),
      el("span", {}, [`−側 ${minus}`]),
      el("span", {}, [valid ? "保存できます" : "+側と−側を同じにしてください"]),
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
  ].filter((n): n is HTMLElement => n !== null));
}
