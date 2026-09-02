/**
 * アリーナのトップ。
 *
 * **一目で分かるべきもの**を上に固めてある:
 * 現在ランク / 現在レート / 現在順位 / 挑戦券(残数と次の回復) / シーズン終了まで。
 * その下に行き先(対戦・防衛・ランキング・ショップ・防衛履歴)を置く。
 *
 * 順位は**繋がっていない時に数字を出さない**。「—」も出さない
 * ——あれは「順位が付いていない」と読めてしまい、実際とは違う。
 */
import { el } from "../../dom.js";
import { renderPartySlots } from "../partyCard.js";
import { buildArenaTopView } from "./model.js";
import { PvpArenaProps } from "./props.js";

const ARENA_TEAM_SIZE = 4;

function nodes(items: (HTMLElement | null)[]): HTMLElement[] {
  return items.filter((node): node is HTMLElement => node !== null);
}

/** 現在ランク・レート・順位。**この3つは必ず同時に見える** */
function renderStanding(view: ReturnType<typeof buildArenaTopView>): HTMLElement {
  return el("section", { className: "panel ar-standing", style: `--tier:${view.tier.color}` }, [
    el("div", { className: "ar-standing__head" }, [
      el("span", { className: "ar-tier" }, [view.tier.name]),
      el("span", { className: "ar-standing__rating" }, [`${view.rating.toLocaleString("ja-JP")}`]),
      el("span", { className: "ar-standing__unit" }, ["レート"]),
    ]),
    el("div", { className: "ar-track" }, [
      el("div", { className: "ar-track__fill", style: `width:${(view.progress * 100).toFixed(1)}%` }, []),
    ]),
    el("p", { className: "ar-standing__next" }, [
      view.next ? `${view.next.name}まで あと ${view.next.remaining}` : "最上位のランクです",
    ]),
    el("div", { className: `ar-standing__rank${view.standing.online ? "" : " is-local"}` }, [
      el("span", { className: "ar-standing__rank-label" }, ["現在順位"]),
      el("span", { className: "ar-standing__rank-value" }, [view.standing.label]),
      el("span", { className: "ar-standing__rank-note" }, [view.standing.note]),
    ]),
  ]);
}

/** 挑戦券。残数と、次の1枚までの時間を同じ場所に置く */
function renderTickets(props: PvpArenaProps, view: ReturnType<typeof buildArenaTopView>): HTMLElement {
  const pips = Array.from({ length: view.tickets.max }, (_, index) =>
    el("span", { className: `ar-tickets__pip${index < view.tickets.count ? " is-on" : ""}` }, []),
  );
  const full = view.tickets.count >= view.tickets.max;
  return el("section", { className: "panel ar-tickets" }, [
    el("div", { className: "ar-tickets__row" }, [
      el("span", { className: "ar-tickets__label" }, ["挑戦券"]),
      el("span", { className: "ar-tickets__count" }, [`${view.tickets.count} / ${view.tickets.max}`]),
    ]),
    el("div", { className: "ar-tickets__pips" }, pips),
    el("div", { className: "ar-tickets__foot" }, [
      el("span", { className: "ar-tickets__timer" }, [view.tickets.nextText]),
      el(
        "button",
        { type: "button", className: "btn btn--ghost ar-tickets__refill", disabled: full, onclick: props.onRefillTickets },
        ["💎で全回復"],
      ),
    ]),
  ]);
}

/**
 * シーズンと週。**両方出す。**
 *
 * 報酬が週ごととシーズンごとの2段になっているので、片方だけだと
 * 「あと3日で何が締まるのか」が読めない。
 */
function renderPeriod(props: PvpArenaProps, view: ReturnType<typeof buildArenaTopView>): HTMLElement {
  return el("section", { className: "panel ar-period" }, nodes([
    el("div", { className: "ar-period__row" }, [
      el("span", { className: "ar-period__label" }, [`シーズン${view.seasonNumber}`]),
      el("span", { className: "ar-period__value" }, [`終了まで ${view.seasonRemainingText}`]),
    ]),
    el("div", { className: "ar-period__row" }, [
      el("span", { className: "ar-period__label" }, [`第${view.weekOfSeason}週 / 全${view.totalWeeks}週`]),
      el("span", { className: "ar-period__value" }, [`今週の締めまで ${view.weekRemainingText}`]),
    ]),
    el("div", { className: "ar-period__row" }, [
      el("span", { className: "ar-period__label" }, ["今シーズンの戦績"]),
      el("span", { className: "ar-period__value" }, [
        view.winRateText
          ? `${view.wins}勝 / ${view.battles}戦（勝率 ${view.winRateText}）`
          : "まだ戦っていません",
      ]),
    ]),
    // 受け取れる時だけ出す。**画面の流れの中に置く**(浮かせた札にしない)
    view.weeklyClaimable
      ? el(
          "button",
          { type: "button", className: "btn btn--gold btn--large ar-period__claim", onclick: props.onClaimWeekly },
          [`🎁 今週のランク報酬を受け取る（${view.tier.name}）`],
        )
      : el("p", { className: "ar-period__claimed" }, ["今週のランク報酬は受け取り済みです"]),
  ]));
}

/** 行き先。押す前に「そこに何があるか」が分かる一行を添える */
function renderMenu(props: PvpArenaProps, view: ReturnType<typeof buildArenaTopView>): HTMLElement {
  const rows: { view: Parameters<PvpArenaProps["onGo"]>[0]; icon: string; label: string; note: string; tour: string }[] = [
    { view: "OPPONENTS", icon: "⚔️", label: "対戦", note: "挑戦相手を選んで挑む", tour: "arena:opponents" },
    { view: "DEFENSE", icon: "🛡️", label: "防衛", note: view.defense.registered ? `登録済み（${view.defense.capturedText}）` : "未登録。登録すると留守の間に挑まれる", tour: "arena:defense" },
    { view: "RANKING", icon: "🏆", label: "ランキング", note: props.online ? "上位100人と自分の周辺" : "オンライン接続時のみ", tour: "arena:ranking" },
    { view: "SHOP", icon: "🎫", label: "アリーナショップ", note: `所持 ${view.coins.toLocaleString("ja-JP")} コイン`, tour: "arena:shop" },
    { view: "HISTORY", icon: "📜", label: "防衛履歴", note: view.defenseLosses > 0 ? `破られた記録 ${view.defenseLosses} 件` : "攻められた記録とリベンジ", tour: "arena:history" },
  ];
  return el(
    "section",
    { className: "ar-menu" },
    rows.map((row) =>
      el(
        "button",
        { type: "button", className: "ar-menu__item", "data-tour": row.tour, onclick: () => props.onGo(row.view) },
        [
          el("span", { className: "ar-menu__icon" }, [row.icon]),
          el("span", { className: "ar-menu__body" }, [
            el("span", { className: "ar-menu__label" }, [row.label]),
            el("span", { className: "ar-menu__note" }, [row.note]),
          ]),
          el("span", { className: "ar-menu__arrow" }, ["›"]),
        ],
      ),
    ),
  );
}

/** 攻撃編成の要約。ここが空だと1戦も挑めないので、トップに出す */
function renderOffense(props: PvpArenaProps): HTMLElement {
  const members = [...props.offenseMembers];
  return el("section", { className: "panel ar-team" }, nodes([
    el("div", { className: "ar-team__head" }, [
      el("h2", {}, ["攻撃編成"]),
      el(
        "button",
        { type: "button", className: "btn btn--ghost ar-team__edit", onclick: () => props.onGo("OFFENSE_TEAM") },
        ["編成する"],
      ),
    ]),
    members.length === 0
      ? el("p", { className: "ar-empty" }, ["まだ誰も入っていません。編成すると挑戦できます"])
      : renderPartySlots(members, ARENA_TEAM_SIZE),
  ]));
}

export function renderArenaTop(props: PvpArenaProps): HTMLElement {
  const view = buildArenaTopView(props.player, {
    online: props.online,
    myRank: props.myRank,
    ticketMax: props.ticketMax,
    nextTicketAt: props.nextTicketAt,
  });

  return el("div", { className: "screen ar-screen" }, nodes([
    el("header", { className: "app-header" }, [el("h1", {}, ["アリーナ"])]),
    props.notice ? el("p", { className: "panel ar-notice" }, [props.notice]) : null,
    renderStanding(view),
    renderTickets(props, view),
    renderPeriod(props, view),
    renderMenu(props, view),
    renderOffense(props),
  ]));
}
