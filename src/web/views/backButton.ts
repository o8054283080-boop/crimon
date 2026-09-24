import { el } from "../dom.js";
import { icon } from "../icons.js";

/**
 * 「‹ 戻る」。**どの画面でもこの1つだけを使う。**
 *
 * ## 前は5通りあった
 *
 * 左上に浮いた丸い「戻る」(`position: fixed`)、管理画面の帯の「戻る」、
 * モンスター詳細の「‹ 戻る」、見出しの右の「戻る」「閉じる」、
 * 遺跡やダンジョンの「◀ 階層選択に戻る」「◀ 階層」。
 * 画面が変わるたびに戻り口を探し直すことになり、1画面に2つ出ている所もあった
 * (クリエイトは浮いた「戻る」と見出しの「戻る」が同時に出て、
 * 浮いた方が案内帯の上に重なっていた)。
 *
 * ## いまの決まり
 *
 * - 置き場所は**見出し帯(`screenHeader`)の左端だけ。**
 *   見出し帯は画面の流れの一番上にあり、巻くと上に貼り付く(`sticky`)。
 *   **浮かせない**——浮かせた部品はこの案件で3回、下の何かを覆っている
 * - 文言はどこでも「戻る」。行き先の名前を入れると、ボタンの幅が画面ごとに変わる
 * - 画面が「1つ上」を知っている時(階の詳細 → 階の一覧など)はその画面が渡す。
 *   知らない時は外側(`main.ts`)が履歴で1つ前へ戻す
 */
export function renderBackButton(onBack: () => void, ariaLabel = "1つ前へ戻る"): HTMLElement {
  return el("button", {
    type: "button",
    className: "screen-head__back",
    // 巡回(tools/tour.mjs)はこれを押して階層の外へ出る。文言では探させない
    "data-tour": "back",
    onclick: onBack,
    ariaLabel,
  }, [
    icon("back", { size: 16 }),
    el("span", { className: "screen-head__back-label" }, ["戻る"]),
  ]);
}
