import "../ui/accessories.css";
import { el } from "../dom.js";

/**
 * 装備画面の「装備 / アクセサリー」の切り替え。
 *
 * 下のナビの「装備」から、アクセサリーの一覧(強化・売却・ロック)へも行けるようにする
 * (依頼主の指定)。前はアクセの一覧は遺跡とモンスター詳細からしか開けず、
 * 装備を整理するつもりで「装備」を開いた人には見えなかった。
 */
export type GearTab = "GEAR" | "ACCESSORY";

export function renderGearTabs(active: GearTab, onSelect: (tab: GearTab) => void, counts: { gear: number; accessory: number }): HTMLElement {
  const tab = (key: GearTab, label: string, count: number) => el("button", {
    type: "button",
    className: `gear-tab${key === active ? " gear-tab--active" : ""}`,
    "data-tour": `gear-tab:${key}`,
    "aria-pressed": String(key === active),
    onclick: () => { if (key !== active) onSelect(key); },
  }, [`${label}(${count.toLocaleString("ja-JP")})`]);
  return el("div", { className: "gear-tabs", role: "group", "aria-label": "装備とアクセサリーの切り替え" }, [
    tab("GEAR", "装備", counts.gear),
    tab("ACCESSORY", "アクセサリー", counts.accessory),
  ]);
}
