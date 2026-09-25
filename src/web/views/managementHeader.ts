import { el } from "../dom.js";
import { renderBackButton } from "./backButton.js";
import "../ui/screenHead.css";

/**
 * 画面の見出し帯。**アプリのどの画面も、一番上はこの1本。**
 *
 * ```
 * [‹ 戻る] 題(金・左寄せ)            [補足 / 小さなボタン1つ]
 * ```
 *
 * ## なぜ1つにまとめたのか
 *
 * 見出しは画面ごとに作られていて、同じアプリなのに形が6通りあった
 * (中央の特大の題字、左の小さな題、題と右のボタン、帯の中の中央の題、
 * 詳細だけの「‹ 戻る」、題が絵の中にある召喚)。戻るも5通りあった
 * (`backButton.ts`)。画面が変わるたびに、どこに何があるかを読み直すことになる。
 *
 * ## 決まり
 *
 * - **戻るは左端に1つだけ。**画面の中に2つ目の戻り口(「◀ 階層選択に戻る」
 *   「閉じる」)を置かない。行き先が違うなら `onBack` で渡す
 * - **題は左寄せの金。**長い題(「スライム[火]★6のアクセサリー」)は2行まで折る
 * - 右端には**数(残り回数・所持数)か、小さなボタン1つ**だけ
 * - 帯は画面の流れの一番上。巻くと上に貼り付く(`sticky`)。案内帯はこの下
 *
 * `onBack` を渡さなければ、外側(`main.ts`)が「戻れる時だけ」履歴で戻す
 * ボタンを差し込む。タブの根の画面(召喚・ショップ)に戻り先が無い時は出ない。
 */
export interface ScreenHeaderOptions {
  /** 右端の補足(残り回数・所持数など)。短い文字だけ */
  meta?: string;
  /** 右端の小さなボタン。**1つまで**(並べると題が潰れる) */
  action?: HTMLElement | null;
  /** 題の下の1行 */
  sub?: string;
  /** この画面が「1つ上」を知っている時だけ渡す */
  onBack?: () => void;
  /** 読み上げ用の戻り先の説明 */
  backLabel?: string;
  /** 帯へ足すクラス(画面ごとの目印) */
  className?: string;
}

export function screenHeader(title: string, options: ScreenHeaderOptions = {}): HTMLElement {
  const side: HTMLElement[] = [];
  if (options.meta) side.push(el("span", { className: "screen-head__meta" }, [options.meta]));
  if (options.action) side.push(options.action);
  return el("header", {
    className: `screen-head${options.className ? ` ${options.className}` : ""}`,
    "data-screen-head": "",
  }, [
    ...(options.onBack ? [renderBackButton(options.onBack, options.backLabel)] : []),
    el("div", { className: "screen-head__titles" }, [
      el("h1", { className: "screen-head__title" }, titleParts(title)),
      ...(options.sub ? [el("p", { className: "screen-head__sub" }, [options.sub])] : []),
    ]),
    ...(side.length > 0 ? [el("div", { className: "screen-head__side" }, side)] : []),
  ]);
}

/**
 * 題の最後の語(「1階」「NORMAL」)を割らない塊にする。
 * 2行に折れる時、「魔人のダンジョン 1 / 階」と数字と単位が分かれていた。
 */
function titleParts(title: string): (string | HTMLElement)[] {
  const at = title.lastIndexOf(" ");
  if (at <= 0) return [title];
  return [title.slice(0, at + 1), el("span", { className: "screen-head__keep" }, [title.slice(at + 1)])];
}

/**
 * 外側から戻るを差し込む。**既に戻るを持つ帯には足さない**(2つ並べない)。
 * @returns 差し込んだか
 */
export function attachScreenBack(header: HTMLElement, onBack: () => void): boolean {
  if (header.querySelector(".screen-head__back")) return false;
  header.prepend(renderBackButton(onBack));
  return true;
}

/** 右端に置く小さなボタン。見出しの中の押しものは、どの画面でもこの形 */
export function screenHeadAction(label: string, onClick: () => void, extra: { className?: string; ariaLabel?: string; dataTour?: string } = {}): HTMLElement {
  return el("button", {
    type: "button",
    className: `screen-head__action${extra.className ? ` ${extra.className}` : ""}`,
    onclick: onClick,
    ...(extra.ariaLabel ? { ariaLabel: extra.ariaLabel } : {}),
    ...(extra.dataTour ? { "data-tour": extra.dataTour } : {}),
  }, [label]);
}

/**
 * 管理画面(強化・おまかせ装備・交換所など)の見出し。**中身は `screenHeader` と同じ。**
 * 呼び出し側を書き換えずに済むよう、前の形の引数のまま残してある。
 */
export function managementHeader(title: string, onBack: () => void, meta?: string): HTMLElement {
  return screenHeader(title, { onBack, meta, className: "management-header" });
}
