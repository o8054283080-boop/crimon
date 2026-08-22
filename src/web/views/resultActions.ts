/**
 * 結果画面の行き先ボタン。
 *
 * これまで結果画面の出口は「ホームに戻る」1つしかなかった。
 * 同じ場所をもう一度回るには、ホーム → タブ → 一覧をたどって
 * 目当ての場所を探し直す必要があり、**周回のたびに4〜6手**かかっていた。
 *
 * 周回で押すのはほぼ「もう一度」なので、それを主役の位置に置く。
 * 押せない時は、理由をボタンのすぐ下に出す
 * (押せないボタンだけがあって理由が分からない、という状態を作らない)。
 */
import { el } from "../dom.js";

export interface ResultAction {
  label: string;
  /** 押してほしいものを1つだけ primary にする */
  variant?: "primary" | "ghost";
  disabled?: boolean;
  /** 押せない理由。押せない時だけ小さく添える */
  reason?: string;
  run: () => void;
}

export function renderResultActions(actions: readonly ResultAction[]): HTMLElement {
  const blocked = actions.filter((a) => a.disabled && a.reason).map((a) => a.reason);

  return el("div", { className: "result-actions" }, [
    ...(blocked.length > 0 ? [el("p", { className: "result-actions__reason" }, [blocked.join(" / ")])] : []),
    el(
      "div",
      { className: "result-actions__row" },
      actions.map((action) =>
        el(
          "button",
          {
            type: "button",
            className: `btn btn--${action.variant ?? "ghost"} result-actions__btn`,
            disabled: action.disabled,
            onclick: action.run,
          },
          [action.label],
        ),
      ),
    ),
  ]);
}
