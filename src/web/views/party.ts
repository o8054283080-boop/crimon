import { MAX_DUNGEON_PARTY_SIZE, PlayerState } from "../../game/playerState.js";
import { MonsterSortKey, sortMonsters } from "../../game/monsterSort.js";
import { MonsterFilter, filterMonsters } from "../monsterFilter.js";
import { el } from "../dom.js";
import { icon } from "../icons.js";
import { renderMonsterSortRow } from "./monsters.js";
import { renderMonsterFilterBar } from "./monsterFilterBar.js";
import { partyMemberCard, renderPartySlots } from "./partyCard.js";
import { findMonsterById } from "../../data/monsters.js";

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

/**
 * 編成の枠は3つある。**同じ編成を使い回せない**のは意図したもので、
 * 場所ごとに組み替えるのがこのゲームの考える所そのものだから。
 *
 * 札のラベルは短く保つこと。縦画面(390px)に3つ並ぶので、
 * 説明を足すと文字が切れて、切れた文字はあるだけ無駄になる。
 */
interface ModeSpec {
  mode: PartyEditMode;
  label: string;
  iconName: Parameters<typeof icon>[0] | null;
  maxSize: number;
  /** その枠でしか成り立たない決まりごと。操作の説明は書かない */
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

  // 編成画面では「いま編成しているかどうか」が最優先なので、
  // おすすめ順・絞り込みの基準を表示中の編成(通常/ダンジョン)に合わせる
  const context = { partyIds: activeIds };
  const shown = filterMonsters(player.monsters, props.filter, context);
  const sortedMonsters = sortMonsters(shown, props.sortKey, context);
  const cards = sortedMonsters.map((instance) =>
    partyMemberCard(
      instance,
      activeIds.includes(instance.id),
      () => props.selectedSlot === null ? onToggle(instance.id) : props.onChooseMonster(instance.id),
      () => props.onViewDetail(instance.id),
    ),
  );

  return el("div", { className: "screen party-screen" }, [
    el("header", { className: "app-header app-header--row" }, [
      el("h1", {}, ["パーティ編成"]),
      props.onComplete ? el("button", { type: "button", className: "btn btn--ghost", onclick: props.onComplete }, [`← ${props.returnLabel ?? "戻る"}`]) : el("span", { className: "head-note" }, [`${activeIds.length} / ${maxSize}`]),
    ]),
    el(
      "section",
      { className: "panel mode-toggle" },
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
        el("span", {}, [props.selectedSlot === null ? "交換する枠をタップ" : `枠${props.selectedSlot + 1}の交換相手を選択`]),
      ]),
      // 枠そのものを外すボタンにする。入れ替えのたびに一覧から本人を探し直さない
      el("div", { className: "party-swap-slots" }, Array.from({ length: maxSize }, (_, index) => {
        const member = activeMembers[index];
        return el("button", { type: "button", className: `party-swap-slot${props.selectedSlot === index ? " is-selected" : ""}`, onclick: () => props.onSelectSlot(index) }, [member ? (findMonsterById(member.dexId)?.name ?? member.dexId) : "＋ 空き枠", el("small", {}, [member ? "交換する" : "追加する"])]);
      })),
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
            className: "btn btn--ghost party-actions__btn",
            disabled: activeIds.length === 0,
            onclick: props.onClearParty,
          },
          ["全部外す"],
        ),
      ]),
      // **操作の説明文は置かない。**「枠を押すと外れます。一覧はタップで編成、
      // 長押しで詳細。」と書かないと使えないなら、その操作は見つかっていない。
      // 枠には✕、カードには詳細の丸ボタンを出して、見れば分かる形にした。
      // ここに残すのは、操作ではなく**知りようのない決まりごと**だけ
      spec.note ? el("p", { className: "app-subtitle" }, [spec.note]) : null,
    ].filter(Boolean) as HTMLElement[]),
    el("section", { className: "panel party-roster" }, [
      el("h2", { className: "party-roster__title" }, ["所持モンスター"]),
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
