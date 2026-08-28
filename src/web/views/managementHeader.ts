import { el } from "../dom.js";
import { icon } from "../icons.js";

/** iPhone の縦スクロール中も出口を失わない、管理画面共通の小さな見出し。 */
export function managementHeader(title: string, onBack: () => void, meta?: string): HTMLElement {
  return el("header", { className: "management-header" }, [
    el("button", { type: "button", className: "management-header__back", onclick: onBack, ariaLabel: "戻る" }, [
      icon("back", { size: 17 }),
      "戻る",
    ]),
    el("h1", { className: "management-header__title" }, [title]),
    el("span", { className: "management-header__meta" }, [meta ?? ""]),
  ]);
}
