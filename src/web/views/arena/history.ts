/**
 * 防衛履歴とリベンジ。
 *
 * 防衛は**自分が見ていない時に起きる**。だからここは「何が起きていたか」を
 * 後から読む場所で、相手・勝敗・日時・レート変動をそのまま並べる。
 *
 * リベンジできるかを画面で判断しない。`arenaRevengeBlock` が返した理由を
 * そのまま日本語にするだけにしてある(`NOT_DEFENSE` は攻撃の記録なので
 * そもそもここに並ばず、文言も出さない)。
 */
import { el } from "../../dom.js";
import { arenaHistoryRowView } from "./model.js";
import { PvpArenaProps } from "./props.js";

function nodes(items: (HTMLElement | null)[]): HTMLElement[] {
  return items.filter((node): node is HTMLElement => node !== null);
}

export function renderArenaHistory(props: PvpArenaProps): HTMLElement {
  const rows = props.history.map((input) => arenaHistoryRowView(input.record, input.block));

  return el("div", { className: "screen ar-screen" }, nodes([
    el("header", { className: "app-header" }, [el("h1", {}, ["防衛履歴"])]),
    props.notice ? el("p", { className: "panel ar-notice" }, [props.notice]) : null,
    el("p", { className: "panel ar-note" }, [
      "登録した防衛編成が挑まれた記録です。破られた相手には1回だけリベンジできます",
    ]),
    rows.length === 0
      ? el("p", { className: "panel ar-empty" }, ["まだ攻められた記録はありません"])
      : null,
    ...rows.map((row) =>
      el("section", { className: `panel ar-hist${row.record.won ? " is-win" : " is-lose"}` }, nodes([
        el("div", { className: "ar-hist__head" }, [
          el("span", { className: "ar-hist__name" }, [row.record.opponentName]),
          el("span", { className: "ar-hist__result" }, [row.resultText]),
        ]),
        el("div", { className: "ar-hist__meta" }, [
          el("span", {}, [row.whenText]),
          el("span", {}, [`相手レート ${row.record.opponentRating.toLocaleString("ja-JP")}`]),
          el("span", { className: `ar-hist__delta${row.record.ratingDelta >= 0 ? " is-up" : " is-down"}` }, [
            `レート ${row.deltaText}（${row.record.ratingAfter.toLocaleString("ja-JP")}）`,
          ]),
        ]),
        el(
          "button",
          {
            type: "button",
            className: "btn btn--primary ar-hist__revenge",
            disabled: !row.canRevenge,
            onclick: () => props.onRevenge(row.record),
          },
          ["⚔️ リベンジする"],
        ),
        row.blockedReason ? el("p", { className: "ar-card__blocked" }, [row.blockedReason]) : null,
      ])),
    ),
    el("button", { type: "button", className: "btn btn--ghost btn--large", onclick: () => props.onGo("TOP") }, ["◀ アリーナに戻る"]),
  ]));
}
