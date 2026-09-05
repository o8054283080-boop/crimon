import { MAX_DUNGEON_PARTY_SIZE, PlayerState } from "../../game/playerState.js";
import { MonsterSortKey, sortMonsters } from "../../game/monsterSort.js";
import { MonsterFilter, filterMonsters } from "../monsterFilter.js";
import { el } from "../dom.js";
import { icon } from "../icons.js";
import { createIncrementalGrid } from "../incrementalGrid.js";
import { withPortrait } from "../three/portrait.js";
import { renderMonsterSortRow } from "./monsters.js";
import { renderMonsterFilterBar } from "./monsterFilterBar.js";
import { partyMemberCard } from "./partyCard.js";
import { findMonsterById } from "../../data/monsters.js";
import "../ui/party.css";

export type PartyEditMode = "NORMAL" | "DUNGEON" | "TOWER";

export interface PartyProps {
  player: PlayerState;
  mode: PartyEditMode;
  onSetMode: (mode: PartyEditMode) => void;
  onToggleParty: (instanceId: string) => void;
  onToggleDungeonMember: (instanceId: string) => void;
  onToggleTowerMember: (instanceId: string) => void;
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
  selectedSlot: number | null;
  onSelectSlot: (index: number) => void;
  onChooseMonster: (instanceId: string) => void;
  onComplete?: () => void;
  returnLabel?: string;
}

const MAX_PARTY_SIZE = 4;

interface ModeSpec {
  mode: PartyEditMode;
  label: string;
  iconName: Parameters<typeof icon>[0] | null;
  maxSize: number;
  note: string | null;
}

const MODE_SPECS: ModeSpec[] = [
  { mode: "NORMAL", label: "通常", iconName: null, maxSize: MAX_PARTY_SIZE, note: null },
  {
    mode: "DUNGEON",
    label: "装備ダンジョン",
    iconName: "equipDungeon",
    maxSize: MAX_DUNGEON_PARTY_SIZE,
    note: "この枠は装備ダンジョン専用です。通常ステージの編成とは別に覚えます。",
  },
  {
    mode: "TOWER",
    label: "試練の塔",
    iconName: "tower",
    maxSize: MAX_DUNGEON_PARTY_SIZE,
    note: "塔はHPとクールタイムを持ち越します。倒れた仲間は節まで戻りません。",
  },
];

export function renderParty(props: PartyProps): HTMLElement {
  const { player, mode } = props;
  const spec = MODE_SPECS.find((s) => s.mode === mode) ?? MODE_SPECS[0];
  const activeIds =
    mode === "DUNGEON" ? player.dungeonPartyIds : mode === "TOWER" ? player.towerPartyIds : player.partyIds;
  const activeIdSet = new Set(activeIds);
  const maxSize = spec.maxSize;
  const onToggle =
    mode === "DUNGEON"
      ? props.onToggleDungeonMember
      : mode === "TOWER"
        ? props.onToggleTowerMember
        : props.onToggleParty;
  const activeMembers = activeIds
    .map((id) => player.monsters.find((m) => m.id === id))
    .filter((m): m is NonNullable<typeof m> => m !== undefined);

  const context = { partyIds: activeIds };
  const shown = filterMonsters(player.monsters, props.filter, context);
  const sortedMonsters = sortMonsters(shown, props.sortKey, context);
  // 編成中の個体は一覧の先頭へまとめる。明示した並び順は各グループ内でそのまま保つ。
  const orderedMonsters = [
    ...sortedMonsters.filter((monster) => activeIdSet.has(monster.id)),
    ...sortedMonsters.filter((monster) => !activeIdSet.has(monster.id)),
  ];

  const rosterGrid = createIncrementalGrid({
    className: "monster-grid party-monster-grid",
    items: orderedMonsters,
    renderItem: (instance) =>
      partyMemberCard(
        instance,
        activeIdSet.has(instance.id),
        () => {
          if (props.selectedSlot !== null) {
            props.onChooseMonster(instance.id);
            return;
          }
          const activeIndex = activeIds.indexOf(instance.id);
          // 編成中カードのタップで即解除しない。まずその枠を交換対象にする。
          if (activeIndex >= 0) {
            props.onSelectSlot(activeIndex);
            return;
          }
          // 空きがある時の追加は従来どおり1タップで行える。
          onToggle(instance.id);
        },
        () => props.onViewDetail(instance.id),
      ),
    moreLabel: (rendered, total) => `さらに表示（${rendered} / ${total}）`,
  });

  const selectedMember = props.selectedSlot === null ? undefined : activeMembers[props.selectedSlot];
  const selectedDex = selectedMember ? findMonsterById(selectedMember.dexId) : undefined;

  const partySlots = el(
    "div",
    { className: "party-edit-slots", style: `grid-template-columns: repeat(${maxSize}, minmax(0, 1fr))` },
    Array.from({ length: maxSize }, (_, index) => {
      const member = activeMembers[index];
      const dex = member ? findMonsterById(member.dexId) : undefined;
      const selected = props.selectedSlot === index;
      const slotClass = `party-edit-slot${member ? " is-filled" : " is-empty"}${selected ? " is-selected" : ""}`;
      const selectButton = el(
        "button",
        {
          type: "button",
          className: "party-edit-slot__select",
          onclick: () => props.onSelectSlot(index),
          "aria-pressed": selected ? "true" : "false",
          title: member ? `${dex?.name ?? member.dexId}を交換` : `${index + 1}枠目に追加`,
        },
        member
          ? [
              withPortrait(el("span", { className: "party-edit-slot__portrait" }, [dex?.emoji ?? "❓"]), dex, "fill"),
              el("span", { className: "party-edit-slot__name" }, [dex?.name ?? member.dexId]),
              el("span", { className: "party-edit-slot__meta" }, [`★${member.star} · Lv${member.level}`]),
              el("span", { className: "party-edit-slot__action" }, [selected ? "選択中" : "交換"]),
            ]
          : [
              el("span", { className: "party-edit-slot__empty-mark", "aria-hidden": "true" }, ["＋"]),
              el("span", { className: "party-edit-slot__name" }, [`枠${index + 1}`]),
              el("span", { className: "party-edit-slot__action" }, [selected ? "選択中" : "追加"]),
            ],
      );

      return el("div", { className: slotClass }, [
        selectButton,
        member
          ? el(
              "button",
              {
                type: "button",
                className: "party-edit-slot__remove",
                title: `${dex?.name ?? member.dexId}を編成から外す`,
                "aria-label": `${dex?.name ?? member.dexId}を編成から外す`,
                onclick: () => onToggle(member.id),
              },
              ["×"],
            )
          : null,
      ].filter(Boolean) as HTMLElement[]);
    }),
  );

  return el("div", { className: "screen party-screen" }, [
    el("header", { className: "app-header app-header--row" }, [
      el("h1", {}, ["パーティ編成"]),
      props.onComplete
        ? el("button", { type: "button", className: "btn btn--ghost", onclick: props.onComplete }, [`← ${props.returnLabel ?? "戻る"}`])
        : el("span", { className: "head-note" }, [`${activeIds.length} / ${maxSize}`]),
    ]),
    el(
      "section",
      { className: "panel mode-toggle party-mode-toggle" },
      MODE_SPECS.map((s) =>
        el(
          "button",
          {
            type: "button",
            className: "mode-toggle__btn" + (s.mode === mode ? " mode-toggle__btn--active" : ""),
            onclick: () => props.onSetMode(s.mode),
          },
          [...(s.iconName ? [icon(s.iconName, { size: 15 })] : []), s.label],
        ),
      ),
    ),
    el("section", { className: "panel party-current" }, [
      el("div", { className: "party-current__head" }, [
        el("strong", {}, ["現在のパーティ"]),
        el("span", {}, [props.selectedSlot === null ? "交換する枠を選択" : `枠${props.selectedSlot + 1}を選択中`]),
      ]),
      partySlots,
      props.selectedSlot !== null
        ? el("div", { className: "party-selection-guide", role: "status" }, [
            el("span", { className: "party-selection-guide__label" }, [
              selectedMember ? `${selectedDex?.name ?? selectedMember.dexId}を交換` : `空き枠${props.selectedSlot + 1}に追加`,
            ]),
            el("strong", {}, ["↓ 下のモンスターを選択"]),
          ])
        : null,
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
          [icon("summon", { size: 15 }), "おまかせ編成"],
        ),
        el(
          "button",
          {
            type: "button",
            className: "btn btn--ghost party-actions__btn party-actions__clear",
            disabled: activeIds.length === 0,
            onclick: props.onClearParty,
          },
          ["全部外す"],
        ),
      ]),
      spec.note ? el("p", { className: "app-subtitle" }, [spec.note]) : null,
    ].filter(Boolean) as HTMLElement[]),
    el("section", { className: "panel party-roster" }, [
      el("div", { className: "party-roster__head" }, [
        el("h2", { className: "party-roster__title" }, ["所持モンスター"]),
        el("span", { className: "party-roster__count" }, [`${shown.length}体`]),
      ]),
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
            props.selectedSlot !== null
              ? el("p", { className: "party-roster__instruction" }, [`枠${props.selectedSlot + 1}の交換相手を選んでください`])
              : el("p", { className: "party-roster__instruction is-muted" }, ["編成中のモンスターは先頭に表示されます"]),
            orderedMonsters.length === 0
              ? el("p", { className: "app-subtitle" }, ["条件に当てはまるモンスターがいません。絞り込みを緩めてください。"])
              : rosterGrid.element,
          ]),
    ]),
  ]);
}
