import { ELEMENT_JA } from "../../core/element.js";
import { MonsterInstance, starLabel } from "../../core/monsterInstance.js";
import { STAR_MAX_LEVEL } from "../../core/rarity.js";
import {
  ARENA_TICKET_MAX,
  ARENA_TICKET_REFILL_COST,
  ArenaRank,
  arenaPeriodEndAt,
  arenaRankForPoints,
  nextArenaRank,
} from "../../data/pvpArena.js";
import { findMonsterById } from "../../data/monsters.js";
import { PlayerState } from "../../game/playerState.js";
import {
  ARENA_TEAM_SIZE,
  ArenaOpponent,
  ArenaPeriodSettlement,
  arenaNextTicketAt,
  getArenaTeam,
} from "../../game/pvpArena.js";
import { el } from "../dom.js";
import { monsterPower, sortMonsters } from "../../game/monsterSort.js";
import { GEAR_SLOT_TOTAL, equippedCount } from "../monsterFilter.js";
import { buildMonsterCard } from "./monsterCard.js";
import { renderPartySlots } from "./partyCard.js";

/** 編成のどちらを編集しているか。防衛と攻撃は別枠なので、画面の状態としても分ける */
export type ArenaTeamSlot = "DEFENSE" | "OFFENSE";

export interface PvpArenaProps {
  player: PlayerState;
  opponents: readonly ArenaOpponent[];
  /** 編成を編集中ならその枠。null なら対戦相手の一覧を出す */
  editing: ArenaTeamSlot | null;
  notice: string | null;
  /** 期間が変わった時に出す、前の期のまとめ報酬 */
  settlement: ArenaPeriodSettlement | null;
  onEdit: (slot: ArenaTeamSlot | null) => void;
  onToggleMember: (slot: ArenaTeamSlot, instanceId: string) => void;
  onChallenge: (opponent: ArenaOpponent) => void;
  onRefillTickets: () => void;
  onRerollOpponents: () => void;
  onDismissSettlement: () => void;
  onViewDetail: (instanceId: string) => void;
}

/** 残り時間を「2時間30分」の形にする。秒まで出しても読む人には要らない */
function formatRemaining(ms: number): string {
  if (ms <= 0) return "まもなく";
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `${minutes}分`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest === 0 ? `${hours}時間` : `${hours}時間${rest}分`;
  const days = Math.floor(hours / 24);
  return `${days}日${hours % 24}時間`;
}

/** 階級の帯。色は帯ごとに決まっていて、相手の札の縁にも同じ色を使う */
function rankBadge(rank: ArenaRank, extraClass = ""): HTMLElement {
  return el(
    "span",
    { className: `arena-rank ${extraClass}`.trim(), style: `--rank-color:${rank.color}` },
    [rank.name],
  );
}

/**
 * 今の階級と、次の階級までの距離。
 *
 * 点数だけを出しても、それが良い数字なのか分からない。
 * 帯の中のどこに居て、あと何点で上がるのかを一目で見せる。
 */
function renderStanding(player: PlayerState, now: number): HTMLElement {
  const rank = arenaRankForPoints(player.arenaPoints);
  const next = nextArenaRank(rank);
  const span = next ? next.minPoints - rank.minPoints : 1;
  const into = Math.max(0, player.arenaPoints - rank.minPoints);
  const ratio = next ? Math.max(0, Math.min(1, into / span)) : 1;

  const winRate = player.arenaSeasonBattles > 0 ? Math.round((player.arenaSeasonWins / player.arenaSeasonBattles) * 100) : null;

  return el("section", { className: "panel arena-standing", style: `--rank-color:${rank.color}` }, [
    el("div", { className: "arena-standing__head" }, [
      rankBadge(rank, "arena-rank--lg"),
      el("span", { className: "arena-standing__points" }, [`${player.arenaPoints.toLocaleString("ja-JP")} pt`]),
    ]),
    el("div", { className: "arena-standing__track" }, [
      el("div", { className: "arena-standing__fill", style: `width:${(ratio * 100).toFixed(1)}%` }, []),
    ]),
    el("div", { className: "arena-standing__note" }, [
      next ? `${next.name}まで あと ${Math.max(0, next.minPoints - player.arenaPoints)} pt` : "最上位の階級です",
    ]),
    el("div", { className: "arena-standing__stats" }, [
      el("span", {}, [`今期 ${player.arenaSeasonWins}勝 / ${player.arenaSeasonBattles}戦`]),
      winRate !== null ? el("span", {}, [`勝率 ${winRate}%`]) : null,
      el("span", {}, [`今期の最高 ${player.arenaSeasonBestPoints.toLocaleString("ja-JP")} pt`]),
      el("span", {}, [`期間終了まで ${formatRemaining(arenaPeriodEndAt(now) - now)}`]),
    ].filter((n): n is HTMLElement => n !== null)),
  ]);
}

/** 挑戦券。回復までの時間と、ダイヤでの回復を1か所にまとめる */
function renderTickets(props: PvpArenaProps, now: number): HTMLElement {
  const { player } = props;
  const nextAt = arenaNextTicketAt(player);
  const full = player.arenaTickets >= ARENA_TICKET_MAX;

  const pips = Array.from({ length: ARENA_TICKET_MAX }, (_, i) =>
    el("span", { className: `arena-tickets__pip ${i < player.arenaTickets ? "is-on" : ""}`.trim() }, []),
  );

  return el("section", { className: "panel arena-tickets" }, [
    el("div", { className: "arena-tickets__row" }, [
      el("span", { className: "arena-tickets__label" }, ["挑戦券"]),
      el("div", { className: "arena-tickets__pips" }, pips),
      el("span", { className: "arena-tickets__count" }, [`${player.arenaTickets} / ${ARENA_TICKET_MAX}`]),
    ]),
    el("div", { className: "arena-tickets__foot" }, [
      el("span", { className: "arena-tickets__timer" }, [
        full ? "満タンです" : nextAt !== null ? `次の1枚まで ${formatRemaining(nextAt - now)}` : "",
      ]),
      el(
        "button",
        {
          type: "button",
          className: "btn btn--ghost btn--small",
          disabled: full || player.crystal < ARENA_TICKET_REFILL_COST,
          onclick: props.onRefillTickets,
        },
        [`💎${ARENA_TICKET_REFILL_COST} で全回復`],
      ),
    ]),
  ]);
}

/** 編成の要約。押すとその枠の編集へ入る */
function renderTeamSummary(props: PvpArenaProps, slot: ArenaTeamSlot): HTMLElement {
  const members = getArenaTeam(props.player, slot);
  const isDefense = slot === "DEFENSE";

  return el("section", { className: "panel arena-team" }, [
    el("div", { className: "arena-team__head" }, [
      el("h2", {}, [isDefense ? "防衛編成" : "攻撃編成"]),
      el(
        "button",
        { type: "button", className: "btn btn--ghost btn--small", onclick: () => props.onEdit(slot) },
        ["編成する"],
      ),
    ]),
    el("p", { className: "arena-team__note" }, [
      isDefense
        ? "他のファイターが挑んできた時に、自動で戦う編成です。手持ちの中で最も硬い並びが向いています。"
        : "こちらから挑む時に使う編成です。ステージ用の編成とは別に組めます。",
    ]),
    members.length === 0
      ? el("p", { className: "app-subtitle" }, ["まだ編成されていません"])
      : renderPartySlots(members, ARENA_TEAM_SIZE),
  ]);
}

/** 相手1人の札。誰と戦うかを、顔ぶれ・階級・作戦の3つで判断できるようにする */
function renderOpponentCard(props: PvpArenaProps, opponent: ArenaOpponent): HTMLElement {
  const canChallenge = props.player.arenaTickets > 0 && getArenaTeam(props.player, "OFFENSE").length > 0;
  const diff = opponent.points - props.player.arenaPoints;

  const units = opponent.units.map((unit) => {
    const dex = findMonsterById(unit.dexId);
    return el("div", { className: "arena-unit" }, [
      el("span", { className: "arena-unit__emoji" }, [dex ? dex.emoji : "❓"]),
      el("span", { className: "arena-unit__meta" }, [
        el("span", { className: "arena-unit__name" }, [dex ? dex.name : unit.dexId]),
        el("span", { className: "arena-unit__sub" }, [`${starLabel(unit.star)} Lv${unit.level}`]),
      ]),
    ]);
  });

  return el("article", { className: "panel arena-opponent", style: `--rank-color:${opponent.rankColor}` }, [
    el("div", { className: "arena-opponent__head" }, [
      el("div", { className: "arena-opponent__ident" }, [
        el("span", { className: "arena-opponent__name" }, [opponent.name]),
        el("span", { className: "arena-opponent__rank" }, [opponent.rankName]),
      ]),
      el("div", { className: "arena-opponent__score" }, [
        el("span", { className: "arena-opponent__points" }, [`${opponent.points.toLocaleString("ja-JP")} pt`]),
        // 格上か格下かは、この一戦で動く点数に直結する。相手を選ぶ判断材料そのもの
        el("span", { className: `arena-opponent__diff ${diff >= 0 ? "is-up" : "is-down"}` }, [
          diff >= 0 ? `格上 +${diff}` : `格下 ${diff}`,
        ]),
      ]),
    ]),
    el("div", { className: "arena-opponent__tags" }, [
      el("span", { className: "cat-chip" }, [opponent.archetypeName]),
      el("span", { className: "cat-chip" }, [opponent.archetypeNote]),
      opponent.rare ? el("span", { className: "cat-chip cat-chip--hot" }, ["高レア軸"]) : null,
    ].filter((n): n is HTMLElement => n !== null)),
    el("div", { className: "arena-opponent__units" }, units),
    el(
      "button",
      {
        type: "button",
        className: "btn btn--primary btn--large",
        disabled: !canChallenge,
        onclick: () => props.onChallenge(opponent),
      },
      ["挑戦する"],
    ),
  ]);
}

/** 編成の編集。手持ちを並べて、押すと入る/外れる */
function renderEditor(props: PvpArenaProps, slot: ArenaTeamSlot): HTMLElement {
  const selectedIds = slot === "DEFENSE" ? props.player.arenaDefenseIds : props.player.arenaOffenseIds;
  const members = getArenaTeam(props.player, slot);
  // 編成中の面々を先頭へ寄せたいので、この枠に入っている者を「編成中」として渡す
  const sorted = sortMonsters(props.player.monsters, "recommended", { partyIds: selectedIds });

  const cards = sorted.map((instance: MonsterInstance) => {
    const dex = findMonsterById(instance.dexId);
    const selected = selectedIds.includes(instance.id);
    return buildMonsterCard(dex, instance.dexId, () => props.onToggleMember(slot, instance.id), {
      selected,
      // 上限に達していても、入っている本人は押せないと外せなくなる
      disabled: !selected && selectedIds.length >= ARENA_TEAM_SIZE,
      star: instance.star,
      level: instance.level,
      maxLevel: STAR_MAX_LEVEL[instance.star],
      power: monsterPower(instance),
      gearCount: equippedCount(instance),
      gearTotal: GEAR_SLOT_TOTAL,
      badge: selected ? "編成中" : undefined,
      badgeCorner: true,
      onDetail: () => props.onViewDetail(instance.id),
    });
  });

  return el("div", { className: "screen arena-screen" }, [
    el("header", { className: "app-header app-header--row" }, [
      el("h1", {}, [slot === "DEFENSE" ? "防衛編成" : "攻撃編成"]),
      el("span", { className: "head-note" }, [`${selectedIds.length} / ${ARENA_TEAM_SIZE}`]),
    ]),
    el("section", { className: "panel" }, [
      el("p", { className: "arena-team__note" }, [
        slot === "DEFENSE"
          ? "留守を守る編成です。自分では操作できないので、放っておいても仕事をする組み合わせを選んでください。"
          : "挑む時の編成です。相手の作戦を見てから選べます。",
      ]),
      members.length === 0 ? el("p", { className: "app-subtitle" }, ["まだ誰も入っていません"]) : renderPartySlots(members, ARENA_TEAM_SIZE),
    ]),
    el("section", { className: "panel" }, [el("div", { className: "monster-grid" }, cards)]),
    el("button", { type: "button", className: "btn btn--ghost btn--large", onclick: () => props.onEdit(null) }, ["◀ アリーナに戻る"]),
  ]);
}

/** 期間が変わった時のまとめ報酬。受け取るまで他の操作をさせない */
function renderSettlement(props: PvpArenaProps, settlement: ArenaPeriodSettlement): HTMLElement {
  return el("div", { className: "screen arena-screen" }, [
    el("header", { className: "app-header" }, [el("h1", {}, ["今期の結果"])]),
    el("section", { className: "panel arena-settlement" }, [
      el("p", { className: "arena-settlement__rank" }, [settlement.rankName]),
      el("p", { className: "arena-settlement__points" }, [`最高 ${settlement.bestPoints.toLocaleString("ja-JP")} pt`]),
      el("p", { className: "arena-settlement__record" }, [`${settlement.wins}勝 / ${settlement.battles}戦`]),
      el("div", { className: "arena-settlement__rewards" }, [
        el("span", {}, [`💎 ${settlement.crystal.toLocaleString("ja-JP")}`]),
        el("span", {}, [`🪙 ${settlement.gold.toLocaleString("ja-JP")}`]),
        settlement.scrolls > 0 ? el("span", {}, [`📜 ${settlement.scrolls}`]) : null,
      ].filter((n): n is HTMLElement => n !== null)),
    ]),
    el("button", { type: "button", className: "btn btn--primary btn--large", onclick: props.onDismissSettlement }, ["受け取る"]),
  ]);
}

export function renderPvpArena(props: PvpArenaProps): HTMLElement {
  if (props.settlement) return renderSettlement(props, props.settlement);
  if (props.editing) return renderEditor(props, props.editing);

  const now = Date.now();
  const offenseReady = getArenaTeam(props.player, "OFFENSE").length > 0;

  return el("div", { className: "screen arena-screen" }, [
    el("header", { className: "app-header" }, [el("h1", {}, ["アリーナ"])]),
    props.notice ? el("div", { className: "panel arena-notice" }, [props.notice]) : null,
    renderStanding(props.player, now),
    renderTickets(props, now),
    renderTeamSummary(props, "OFFENSE"),
    renderTeamSummary(props, "DEFENSE"),
    el("section", { className: "panel arena-opponents__head" }, [
      el("h2", {}, ["挑戦相手"]),
      el(
        "button",
        { type: "button", className: "btn btn--ghost btn--small", onclick: props.onRerollOpponents },
        ["相手を変える"],
      ),
    ]),
    !offenseReady ? el("div", { className: "panel arena-notice" }, ["攻撃編成を組むと挑戦できます"]) : null,
    ...props.opponents.map((opponent) => renderOpponentCard(props, opponent)),
  ].filter((n): n is HTMLElement => n !== null));
}
