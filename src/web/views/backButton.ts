import { el } from "../dom.js";
import { icon } from "../icons.js";

/**
 * どの画面にも出る「1つ前へ戻る」ボタン。
 *
 * ## なぜ画面ごとではなく共通で持つのか
 *
 * 戻る手段は画面ごとに書かれていて、**あるところには無かった。**
 * ダンジョンの一覧、アリーナ、ショップ、召喚には出口が下の並びしかなく、
 * 縦に長い画面では下まで巻かないと戻れない。
 * 「どこから来たか」はアプリ全体が知っている情報なので、
 * 画面に書かせるのではなく、外側が1つ持つ方が漏れない。
 *
 * 文言はどこでも「戻る」で、ホームには出さない(ホームは遊びの入口で、
 * 戻る先ではない)。
 *
 * ## `position: fixed` にしている理由
 *
 * この案件では**浮かせた部品が下の何かを覆う事故を3回出している**
 * (CLAUDE.md)。それでもここを固定にするのは、依頼が
 * 「スクロールしても左上に残る」だからで、`sticky` では
 * 巻物を持たない画面(高さが画面ぴったりの画面)で流れてしまう。
 *
 * 覆う事故を避けるため、**画面の中身の側に逃げ場を空ける**。
 * `body` に `--global-back-h` を出すので、各画面はその分だけ
 * 上に余白を取る(style.css の `.screen` 側で吸わせている)。
 * 自前の見出し(`.management-header`)を持つ画面には出さない
 * ——同じ場所にボタンが2つ並ぶため。
 */
export interface GlobalBackButtonProps {
  /** 押した時に1つ前へ戻る */
  onBack: () => void;
}

/*
 * 文言は**どこでも「戻る」**。
 *
 * 最初は戻り先の名前(「ホーム」「図鑑」)を出していたが、依頼主の指定で
 * 一本化した。画面ごとに幅の違う言葉が入ると、左上のボタンの大きさが
 * 場所によって変わり、目が毎回それを読み直すことになる。
 */
export function renderGlobalBackButton(props: GlobalBackButtonProps): HTMLElement {
  return el("button", {
    type: "button",
    className: "global-back",
    onclick: props.onBack,
    ariaLabel: "1つ前へ戻る",
  }, [
    icon("back", { size: 16 }),
    el("span", { className: "global-back__label" }, ["戻る"]),
  ]);
}
