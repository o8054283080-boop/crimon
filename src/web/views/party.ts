import { MAX_DUNGEON_PARTY_SIZE, PlayerState } from "../../game/playerState.js";
import { MonsterSortKey, sortMonsters } from "../../game/monsterSort.js";
import { MonsterFilter, filterMonsters } from "../monsterFilter.js";
import { el } from "../dom.js";
import { renderMonsterSortRow } from "./monsters.js";
import { renderMonsterFilterBar } from "./monsterFilterBar.js";
import { partyMemberCard, renderPartySlots } from "./partyCard.js";

export type PartyEditMode = "NORMAL" | "DUNGEON";

export interface PartyProps {
  player: PlayerState;
  mode: PartyEditMode;
  onSetMode: (mode: PartyEditMode) => void;
  onToggleParty: (instanceId: string) => void;
  onToggleDungeonMember: (instanceId: string) => void;
  sortKey: MonsterSortKey;
  onChangeSort: (key: MonsterSortKey) => void;
  /** 長押しでそのモンスターの詳細を開く */
  onViewDetail: (instanceId: string) => void;
  /** 強い順に空き枠を埋める。1体ずつ選ぶ手間を無くすための道 */
  onAutoFill: () => void;
  /** 編成を全部外す */
  onClearParty: () => void;
  /** 直前の操作の結果(満員で入らなかった等)。次の操作まで出しておく */
  notice: string | null;
  filter: MonsterFilter;
  filterOpen: boolean;
  onChangeFilter: (filter: MonsterFilter) => void;
  onToggleFilterOpen: () => void;
}

const MAX_PARTY_SIZE = 4;

export function renderParty(props: PartyProps): HTMLElement {
  const { player, mode } = props;
  const isDungeon = mode === "DUNGEON";
  const activeIds = isDungeon ? player.dungeonPartyIds : player.partyIds;
  const maxSize = isDungeon ? MAX_DUNGEON_PARTY_SIZE : MAX_PARTY_SIZE;
  const onToggle = isDungeon ? props.onToggleDungeonMember : props.onToggleParty;
  const activeMembers = activeIds
    .map((id) => player.monsters.find((m) => m.id === id))
    .filter((m): m is NonNullable<typeof m> => m !== undefined);

  // 編成画面では「いま編成しているかどうか」が最優先なので、
  // おすすめ順・絞り込みの基準を表示中の編成(通常/ダンジョン)に合わせる
  const context = { partyIds: activeIds };
  const shown = filterMonsters(player.monsters, props.filter, context);
  const sortedMonsters = sortMonsters(shown, props.sortKey, context);
  const cards = sortedMonsters.map((instance) =>
    partyMemberCard(
      instance,
      activeIds.includes(instance.id),
      () => onToggle(instance.id),
      () => props.onViewDetail(instance.id),
    ),
  );

  return el("div", { className: "screen party-screen" }, [
    el("header", { className: "app-header app-header--row" }, [
      el("h1", {}, ["パーティ編成"]),
      el("span", { className: "head-note" }, [`${activeIds.length} / ${maxSize}`]),
    ]),
    el("section", { className: "panel mode-toggle" }, [
      el(
        "button",
        {
          type: "button",
          className: "mode-toggle__btn" + (!isDungeon ? " mode-toggle__btn--active" : ""),
          onclick: () => props.onSetMode("NORMAL"),
        },
        ["通常パーティ"],
      ),
      el(
        "button",
        {
          type: "button",
          className: "mode-toggle__btn" + (isDungeon ? " mode-toggle__btn--active" : ""),
          onclick: () => props.onSetMode("DUNGEON"),
        },
        ["🏰 装備ダンジョン専用"],
      ),
    ]),
    el("section", { className: "panel" }, [
      // 枠そのものを外すボタンにする。入れ替えのたびに一覧から本人を探し直さない
      renderPartySlots(activeMembers, maxSize, onToggle),
      props.notice ? el("p", { className: "party-notice" }, [props.notice]) : null,
      el("div", { className: "party-actions" }, [
        el(
          "button",
          {
            type: "button",
            className: "btn btn--primary party-actions__btn",
            disabled: player.monsters.length === 0 || activeIds.length >= maxSize,
            onclick: props.onAutoFill,
          },
          ["🪄 おまかせ編成"],
        ),
        el(
          "button",
          {
            type: "button",
            className: "btn btn--ghost party-actions__btn",
            disabled: activeIds.length === 0,
            onclick: props.onClearParty,
          },
          ["🧹 全部外す"],
        ),
      ]),
      el("p", { className: "app-subtitle" }, [
        isDungeon
          ? "装備ダンジョン専用の枠です(通常ステージとは別に覚えます)。枠を押すと外れます。一覧はタップで編成、長押しで詳細。"
          : "枠を押すと外れます。一覧はタップで編成、長押しで詳細。",
      ]),
    ].filter((n): n is HTMLElement => n !== null)),
    el("section", { className: "panel" }, [
      player.monsters.length === 0
        ? el("p", { className: "app-subtitle" }, ["モンスターを所持していません。召喚してみましょう。"])
        : el("div", {}, [
            renderMonsterFilterBar({
              all: player.monsters,
              shownCount: shown.length,
              filter: props.filter,
              open: props.filterOpen,
              onToggleOpen: props.onToggleFilterOpen,
              onChange: props.onChangeFilter,
            }),
            renderMonsterSortRow(props.sortKey, props.onChangeSort),
            cards.length === 0
              ? el("p", { className: "app-subtitle" }, ["条件に当てはまるモンスターがいません。絞り込みを緩めてください。"])
              : el("div", { className: "monster-grid" }, cards),
          ]),
    ]),
  ]);
}
