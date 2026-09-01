import { el } from "../dom.js";

/**
 * 画面の下に貼り付く実行バー。
 *
 * ## なぜ要るのか
 *
 * ランクアップも強化も、**素材の一覧が数十枚ある画面の一番下**に
 * 実行ボタンが置かれていた。素材は上の方で選び終わっているのに、
 * 押すためだけに一覧を最後まで巻き下ろすことになる。
 * 選び直すと、また上へ戻って、また下まで降りる。
 *
 * ## 覆わないための約束
 *
 * この案件では**浮かせた部品が下の何かを覆う事故を3回出している**
 * (CLAUDE.md)。ここで守っているのは2つ。
 *
 * 1. `fixed` ではなく `sticky` にする。**画面の流れの中に居場所がある**ので、
 *    一番下まで巻けば元の位置へ収まり、最後の行と重ならない
 * 2. 一覧の下に、バーの高さぶんの余白を置く(`.sticky-actions__spacer`)。
 *    最後の1枚がバーの裏に入り込まないようにする
 *
 * ## 進み具合をここに出す理由
 *
 * 「あと何体選べばよいか」は上の説明文にしか無かった。
 * 押せない理由が画面の外にあると、押せないボタンを見ても何が足りないのか
 * 分からない。**押す場所のすぐ隣に置く。**
 */
export interface StickyActionsProps {
  /** 進み具合や、押せない理由。省略すると行ごと出さない */
  status?: string | null;
  /** 主となる行動。押せない時は disabled にしておくこと */
  primary: HTMLElement;
}

export function stickyActions(props: StickyActionsProps): HTMLElement {
  return el("div", { className: "sticky-actions" }, [
    props.status ? el("p", { className: "sticky-actions__status" }, [props.status]) : null,
    props.primary,
  ].filter((node): node is HTMLElement => node !== null));
}
