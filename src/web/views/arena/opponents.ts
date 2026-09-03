/**
 * 対戦候補の一覧と、相手1人の詳細。
 *
 * 候補は実プレイヤーとNPCが混ざる(`buildArenaCandidates`)。
 * **どちらであるかで画面の作りを分けない。** 分けると、将来NPCの比率を
 * 下げた時に画面側も直す羽目になるし、「NPCだけ中身が薄い」も生まれる。
 * 出どころは小さな印1つで示すだけにしてある。
 */
import { el } from "../../dom.js";
import { ArenaOpponentEntry } from "../../../game/arena/types.js";
import { arenaOpponentView } from "./model.js";
import { PvpArenaProps } from "./props.js";
import { renderArenaUnitInspector } from "./unitInspector.js";

function nodes(items: (HTMLElement | null)[]): HTMLElement[] {
  return items.filter((node): node is HTMLElement => node !== null);
}

function backRow(props: PvpArenaProps): HTMLElement {
  return el(
    "button",
    { type: "button", className: "btn btn--ghost btn--large", onclick: () => props.onGo("TOP") },
    ["◀ アリーナに戻る"],
  );
}

/** 候補1人の札。**名前・レート・ランク・編成が札の上で全部見える** */
function renderCandidate(props: PvpArenaProps, entry: ArenaOpponentEntry): HTMLElement {
  const view = arenaOpponentView(entry, props.player.arenaPoints);
  const ready = props.offenseMembers.length > 0 && props.player.arenaTickets > 0 && view.usable;
  const blocked = props.offenseMembers.length === 0
    ? "攻撃編成を組むと挑戦できます"
    : props.player.arenaTickets <= 0
      ? "挑戦券が足りません（時間で回復します）"
      : !view.usable
        ? "この相手の編成は戦える状態ではありません"
        : null;

  return el("article", { className: "panel ar-card", style: `--tier:${view.tier.color}` }, nodes([
    el("div", { className: "ar-card__head" }, [
      el("div", { className: "ar-card__ident" }, [
        el("span", { className: "ar-card__name" }, [view.name]),
        el("span", { className: "ar-card__tier" }, [view.tier.name]),
      ]),
      el("div", { className: "ar-card__score" }, [
        el("span", { className: "ar-card__rating" }, [`${view.rating.toLocaleString("ja-JP")}`]),
        el("span", { className: `ar-card__diff${view.diff >= 0 ? " is-up" : " is-down"}` }, [view.diffText]),
      ]),
    ]),
    el("div", { className: "ar-card__tags" }, nodes([
      el("span", { className: `ar-chip${view.isNpc ? "" : " ar-chip--player"}` }, [view.isNpc ? "NPC" : "プレイヤー"]),
      view.archetypeName ? el("span", { className: "ar-chip" }, [view.archetypeName]) : null,
      view.archetypeNote ? el("span", { className: "ar-chip" }, [view.archetypeNote]) : null,
    ])),
    el(
      "div",
      { className: "ar-card__units" },
      view.units.map((unit) =>
        el("div", { className: "ar-mini", style: `--elem:${unit.color}` }, [
          el("span", { className: "ar-mini__face" }, [unit.emoji]),
          el("span", { className: "ar-mini__meta" }, [
            el("span", { className: "ar-mini__name" }, [unit.name]),
            el("span", { className: "ar-mini__grade" }, [`★${unit.star} Lv${unit.level}`]),
          ]),
        ]),
      ),
    ),
    el("div", { className: "ar-card__actions" }, [
      el(
        "button",
        { type: "button", className: "btn btn--ghost ar-card__inspect", onclick: () => props.onOpenOpponent(entry) },
        ["🔍 編成を詳しく見る"],
      ),
      el(
        "button",
        { type: "button", className: "btn btn--gold ar-card__go", disabled: !ready, onclick: () => props.onChallenge(entry) },
        ["挑戦する"],
      ),
    ]),
    // **押せない理由を必ず添える。** 押せないボタンだけを出すと次にやることが決まらない
    blocked ? el("p", { className: "ar-card__blocked" }, [blocked]) : null,
  ]));
}

export function renderArenaOpponents(props: PvpArenaProps): HTMLElement {
  const list = [...props.candidates];
  return el("div", { className: "screen ar-screen" }, nodes([
    el("header", { className: "app-header app-header--row" }, [
      el("h1", {}, ["対戦"]),
      el("span", { className: "head-note" }, [`挑戦券 ${props.player.arenaTickets} / ${props.ticketMax}`]),
    ]),
    props.notice ? el("p", { className: "panel ar-notice" }, [props.notice]) : null,
    el("section", { className: "panel ar-listhead" }, nodes([
      el("p", { className: "ar-listhead__note" }, [
        props.online
          ? "近いレートの相手を並べています。実プレイヤーが足りない分はNPCで埋まります"
          : "オフラインのため、いまはNPCだけが並びます",
      ]),
      el(
        "button",
        { type: "button", className: "btn btn--ghost ar-listhead__reroll", onclick: props.onReroll },
        ["🔄 相手を変える（挑戦券は減りません）"],
      ),
    ])),
    props.candidatesLoading
      ? el("p", { className: "panel ar-empty" }, ["相手を探しています…"])
      : list.length === 0
        ? el("p", { className: "panel ar-empty" }, ["挑戦できる相手が見つかりませんでした。「相手を変える」でもう一度探せます"])
        : null,
    ...list.map((entry) => renderCandidate(props, entry)),
    backRow(props),
  ]));
}

/** 相手1人の詳細。**1体ずつ、育成をそのまま真似できるところまで開く** */
export function renderArenaOpponentDetail(props: PvpArenaProps): HTMLElement {
  const entry = props.detailEntry;
  if (!entry) {
    return el("div", { className: "screen ar-screen" }, [
      el("header", { className: "app-header" }, [el("h1", {}, ["相手の編成"])]),
      el("p", { className: "panel ar-empty" }, ["相手が選ばれていません"]),
      backRow(props),
    ]);
  }
  const view = arenaOpponentView(entry, props.player.arenaPoints);
  const ready = props.offenseMembers.length > 0 && props.player.arenaTickets > 0 && view.usable;

  return el("div", { className: "screen ar-screen" }, nodes([
    el("header", { className: "app-header app-header--row" }, [
      el("h1", {}, [view.name]),
      el("span", { className: "head-note" }, [`${view.tier.name} ${view.rating.toLocaleString("ja-JP")}`]),
    ]),
    el("section", { className: "panel ar-detailhead", style: `--tier:${view.tier.color}` }, nodes([
      el("div", { className: "ar-card__tags" }, nodes([
        el("span", { className: `ar-chip${view.isNpc ? "" : " ar-chip--player"}` }, [view.isNpc ? "NPC" : "プレイヤー"]),
        view.archetypeName ? el("span", { className: "ar-chip" }, [view.archetypeName]) : null,
        view.archetypeNote ? el("span", { className: "ar-chip" }, [view.archetypeNote]) : null,
      ])),
      el("p", { className: "ar-detailhead__note" }, [
        "1体ずつ、ステータス・装備・能力ポイント・潜在覚醒まで確認できます。強い相手の作り方はそのまま真似できます",
      ]),
    ])),
    renderArenaUnitInspector(entry.defense.units, props.unitIndex, props.onSelectUnit),
    el(
      "button",
      { type: "button", className: "btn btn--gold btn--large", disabled: !ready, onclick: () => props.onChallenge(entry) },
      ["この相手に挑戦する"],
    ),
    el(
      "button",
      { type: "button", className: "btn btn--ghost btn--large", onclick: () => props.onGo("OPPONENTS") },
      ["◀ 相手の一覧へ"],
    ),
  ]));
}
