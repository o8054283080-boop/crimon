/**
 * 編成を組む2つの画面。攻撃編成と、防衛の登録。
 *
 * ## 防衛は「いま持っているもの」ではなく「焼いた姿」
 *
 * 防衛は自分が居ない時に戦われる。登録した後で装備を外すのも売るのも普通のことで、
 * そのたびに相手の画面で編成が崩れてはいけない。だから登録は
 * `captureArenaDefense` で**その瞬間を焼く**(`game/arena/snapshot.ts`)。
 * この画面がやるのは「誰を焼くか選ばせて、焼けと伝える」ところまで。
 *
 * ## 未登録でも開けること
 *
 * 未登録は珍しい状態ではなく、**全員が最初に必ず通る**。
 * ここが落ちるとアリーナが誰にも開けなくなるので、
 * 登録済みの節は「あれば出す」に徹する。
 */
import { el } from "../../dom.js";
import { MonsterInstance } from "../../../core/monsterInstance.js";
import { STAR_MAX_LEVEL } from "../../../core/rarity.js";
import { findMonsterById } from "../../../data/monsters.js";
import { monsterPower, sortMonsters } from "../../../game/monsterSort.js";
import { GEAR_SLOT_TOTAL, equippedCount } from "../../monsterFilter.js";
import { buildMonsterCard } from "../monsterCard.js";
import { renderPartySlots } from "../partyCard.js";
import { arenaDefenseView } from "./model.js";
import { PvpArenaProps } from "./props.js";
import { renderArenaUnitInspector } from "./unitInspector.js";
import { ARENA_TEAM_SIZE } from "../../../data/pvpArena.js";


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

/** 手持ちを並べて、押すと入る/外れる。攻撃と防衛で同じ部品を使う */
function renderPicker(
  props: PvpArenaProps,
  selectedIds: readonly string[],
  onToggle: (instanceId: string) => void,
): HTMLElement {
  const sorted = sortMonsters(props.player.monsters, "recommended", { partyIds: [...selectedIds] });
  const cards = sorted.map((instance: MonsterInstance) => {
    const dex = findMonsterById(instance.dexId);
    const selected = selectedIds.includes(instance.id);
    return buildMonsterCard(dex, instance.dexId, () => onToggle(instance.id), {
      selected,
      // 入っている本人まで押せなくすると、上限に達したあと誰も外せなくなる
      disabled: !selected && selectedIds.length >= ARENA_TEAM_SIZE,
      star: instance.star,
      level: instance.level,
      maxLevel: STAR_MAX_LEVEL[instance.star],
      power: monsterPower(instance),
      gearCount: equippedCount(instance),
      gearTotal: GEAR_SLOT_TOTAL,
      badge: selected ? "編成中" : undefined,
      badgeCorner: true,
      onDetail: () => props.onViewMonster(instance.id),
    });
  });
  return el("section", { className: "panel" }, [el("div", { className: "monster-grid" }, cards)]);
}

function membersOf(props: PvpArenaProps, ids: readonly string[]): MonsterInstance[] {
  return ids
    .map((id) => props.player.monsters.find((monster) => monster.id === id))
    .filter((monster): monster is MonsterInstance => monster !== undefined);
}

/* ==========================================================================
 * 攻撃編成
 * ========================================================================== */

export function renderArenaOffenseTeam(props: PvpArenaProps): HTMLElement {
  const selectedIds = props.player.arenaOffenseIds;
  const members = [...props.offenseMembers];
  return el("div", { className: "screen ar-screen" }, nodes([
    el("header", { className: "app-header app-header--row" }, [
      el("h1", {}, ["攻撃編成"]),
      el("span", { className: "head-note" }, [`${selectedIds.length} / ${ARENA_TEAM_SIZE}`]),
    ]),
    el("section", { className: "panel" }, nodes([
      el("p", { className: "ar-note" }, [
        "こちらから挑む時の編成です。相手の編成を見てから選べるので、ステージ用とは別に組めます",
      ]),
      members.length === 0
        ? el("p", { className: "ar-empty" }, ["まだ誰も入っていません"])
        : renderPartySlots(members, ARENA_TEAM_SIZE),
    ])),
    renderPicker(props, selectedIds, props.onToggleOffenseMember),
    backRow(props),
  ]));
}

/* ==========================================================================
 * 防衛の登録
 * ========================================================================== */

export function renderArenaDefense(props: PvpArenaProps): HTMLElement {
  const registered = arenaDefenseView(props.player.arenaDefenseSnapshot);
  const draftIds = props.defenseDraftIds;
  const draftMembers = membersOf(props, draftIds);

  const registeredSection = registered.registered
    ? el("section", { className: "panel ar-registered" }, nodes([
        el("div", { className: "ar-registered__head" }, [
          el("h2", {}, ["登録中の防衛編成"]),
          el("span", { className: "ar-registered__at" }, [`${registered.capturedText} 登録`]),
        ]),
        el("p", { className: "ar-note" }, [
          "登録した瞬間の姿が保存されています。この後に装備を外しても、相手の画面ではこの姿のまま戦います",
        ]),
        registered.usableCount === 0
          ? el("p", { className: "ar-warn" }, ["この編成は戦える状態ではありません。組み直して登録してください"])
          : null,
      ]))
    : el("section", { className: "panel" }, [
        el("h2", {}, ["登録中の防衛編成"]),
        el("p", { className: "ar-empty" }, [
          "まだ登録していません。登録すると、留守の間に挑まれるようになります（登録しなくてもアリーナは遊べます）",
        ]),
      ]);

  return el("div", { className: "screen ar-screen" }, nodes([
    el("header", { className: "app-header app-header--row" }, [
      el("h1", {}, ["防衛"]),
      el("span", { className: "head-note" }, [`${draftIds.length} / ${ARENA_TEAM_SIZE}`]),
    ]),
    props.notice ? el("p", { className: "panel ar-notice" }, [props.notice]) : null,
    registeredSection,
    // 登録済みの中身は、相手を検分するのと同じ部品で見せる
    registered.registered
      ? renderArenaUnitInspector(props.player.arenaDefenseSnapshot?.units ?? [], props.unitIndex, props.onSelectUnit)
      : null,
    el("section", { className: "panel" }, nodes([
      el("h2", {}, ["登録する編成を選ぶ"]),
      el("p", { className: "ar-note" }, [
        "自分では操作できない戦いです。放っておいても仕事をする組み合わせが向いています",
      ]),
      draftMembers.length === 0
        ? el("p", { className: "ar-empty" }, ["まだ誰も選んでいません"])
        : renderPartySlots(draftMembers, ARENA_TEAM_SIZE),
    ])),
    el(
      "button",
      {
        type: "button",
        className: "btn btn--gold btn--large",
        disabled: draftMembers.length === 0,
        onclick: props.onRegisterDefense,
      },
      [registered.registered ? "この編成で登録し直す" : "この編成を防衛に登録する"],
    ),
    draftMembers.length === 0
      ? el("p", { className: "ar-card__blocked" }, ["1体以上選ぶと登録できます"])
      : null,
    renderPicker(props, draftIds, props.onToggleDefenseDraft),
    backRow(props),
  ]));
}
