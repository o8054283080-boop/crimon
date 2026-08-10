import { MonsterInstance, starLabel } from "../../core/monsterInstance.js";
import { computeEffectiveStats, requiredExpForLevel, RANK_UP_SACRIFICE_COUNT, STAR_MAX_LEVEL, canRankUp } from "../../core/rarity.js";
import { findMonsterById } from "../../data/monsters.js";
import { PlayerState } from "../../game/playerState.js";
import { checkRankUp } from "../../game/progression.js";
import { el } from "../dom.js";

export interface MonstersProps {
  player: PlayerState;
  detailId: string | null;
  rankUpMode: boolean;
  selectedSacrificeIds: string[];
  onSelectDetail: (id: string | null) => void;
  onStartRankUp: () => void;
  onToggleSacrifice: (id: string) => void;
  onConfirmRankUp: () => void;
  onCancelRankUp: () => void;
}

function monsterCard(instance: MonsterInstance, onClick: () => void, extra?: { selected?: boolean; disabled?: boolean }): HTMLElement {
  const dex = findMonsterById(instance.dexId);
  const maxLevel = STAR_MAX_LEVEL[instance.star];
  const classes = ["monster-card"];
  if (extra?.selected) classes.push("monster-card--selected");
  if (extra?.disabled) classes.push("monster-card--disabled");

  return el(
    "button",
    {
      type: "button",
      className: classes.join(" "),
      disabled: extra?.disabled,
      onclick: onClick,
    },
    [
      el("div", { className: "monster-card__avatar", style: dex ? `background:${dex.color}` : undefined }, []),
      el("div", { className: "monster-card__name" }, [dex ? dex.name : instance.dexId]),
      el("div", { className: "monster-card__meta" }, [`${starLabel(instance.star)} Lv${instance.level}/${maxLevel}`]),
    ],
  );
}

function renderList(props: MonstersProps): HTMLElement {
  const cards = props.player.monsters.map((instance) => monsterCard(instance, () => props.onSelectDetail(instance.id)));
  return el("div", { className: "screen monsters-screen" }, [
    el("header", { className: "app-header" }, [el("h1", {}, ["所持モンスター"]), el("p", { className: "app-subtitle" }, [`${props.player.monsters.length}体所持中`])]),
    el("section", { className: "panel" }, [el("div", { className: "monster-grid" }, cards)]),
  ]);
}

function renderDetail(props: MonstersProps, instance: MonsterInstance): HTMLElement {
  const dex = findMonsterById(instance.dexId);
  const maxLevel = STAR_MAX_LEVEL[instance.star];
  const effectiveStats = dex ? computeEffectiveStats(dex.stats, instance.star, instance.level) : null;
  const rankReady = canRankUp(instance.star, instance.level);
  const expNeeded = requiredExpForLevel(instance.level);
  const inParty = props.player.partyIds.includes(instance.id);

  const statLines = effectiveStats
    ? [`HP ${effectiveStats.hp}`, `ATK ${effectiveStats.atk}`, `DEF ${effectiveStats.def}`, `SPD ${effectiveStats.spd}`]
    : [];

  return el("div", { className: "screen monsters-screen" }, [
    el("header", { className: "app-header" }, [el("h1", {}, [dex ? dex.name : instance.dexId])]),
    el("section", { className: "panel monster-detail" }, [
      el("div", { className: "monster-detail__avatar", style: dex ? `background:${dex.color}` : undefined }, []),
      el("div", { className: "monster-detail__star" }, [starLabel(instance.star)]),
      el("div", { className: "monster-detail__level" }, [`Lv ${instance.level} / ${maxLevel}`]),
      inParty ? el("div", { className: "role-badge" }, ["編成中"]) : null,
      el("div", { className: "monster-detail__stats" }, statLines.map((line) => el("div", {}, [line]))),
      instance.level < maxLevel
        ? el("div", { className: "monster-detail__exp" }, [`経験値 ${instance.exp} / ${expNeeded}`])
        : el("div", { className: "monster-detail__exp" }, ["経験値 MAX"]),
    ].filter((n): n is HTMLDivElement => n !== null)),
    rankReady
      ? el(
          "button",
          { type: "button", className: "btn btn--primary btn--large", onclick: props.onStartRankUp },
          [`⭐ ランクアップ (素材${RANK_UP_SACRIFICE_COUNT[instance.star]}体必要)`],
        )
      : el("div", { className: "panel rankup-hint" }, [
          instance.star >= 5 ? "最大ランクに到達しています" : `最大レベル(Lv${maxLevel})になるとランクアップできます`,
        ]),
    el("button", { type: "button", className: "btn btn--ghost btn--large", onclick: () => props.onSelectDetail(null) }, ["◀ 一覧に戻る"]),
  ]);
}

function renderRankUp(props: MonstersProps, target: MonsterInstance): HTMLElement {
  const dex = findMonsterById(target.dexId);
  const requiredCount = RANK_UP_SACRIFICE_COUNT[target.star];
  const candidates = props.player.monsters.filter((m) => m.id !== target.id && m.star === target.star && !props.player.partyIds.includes(m.id));

  const check = checkRankUp(
    target,
    props.selectedSacrificeIds.map((id) => props.player.monsters.find((m) => m.id === id)!).filter(Boolean),
    props.player.partyIds,
  );

  const cards = candidates.map((c) =>
    monsterCard(c, () => props.onToggleSacrifice(c.id), { selected: props.selectedSacrificeIds.includes(c.id) }),
  );

  return el("div", { className: "screen monsters-screen" }, [
    el("header", { className: "app-header" }, [el("h1", {}, ["ランクアップ素材選択"])]),
    el("section", { className: "panel" }, [
      el("p", {}, [`対象: ${dex ? dex.name : target.dexId} ${starLabel(target.star)} → ${starLabel((target.star + 1) as 1 | 2 | 3 | 4 | 5)}`]),
      el("p", {}, [`同じ星(${starLabel(target.star)})のモンスターを${requiredCount}体選択してください (${props.selectedSacrificeIds.length}/${requiredCount})`]),
    ]),
    el("section", { className: "panel" }, [
      candidates.length === 0
        ? el("p", { className: "app-subtitle" }, ["素材にできるモンスターがいません"])
        : el("div", { className: "monster-grid" }, cards),
    ]),
    el(
      "button",
      {
        type: "button",
        className: "btn btn--primary btn--large",
        disabled: !check.ok,
        onclick: props.onConfirmRankUp,
      },
      ["⭐ ランクアップ実行"],
    ),
    el("button", { type: "button", className: "btn btn--ghost btn--large", onclick: props.onCancelRankUp }, ["キャンセル"]),
  ]);
}

export function renderMonsters(props: MonstersProps): HTMLElement {
  const target = props.detailId ? props.player.monsters.find((m) => m.id === props.detailId) : undefined;

  if (target && props.rankUpMode) return renderRankUp(props, target);
  if (target) return renderDetail(props, target);
  return renderList(props);
}
