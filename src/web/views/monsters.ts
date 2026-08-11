import { applyEquipmentToStats, EQUIP_SLOTS, EquipSlot, getActiveSetBonuses, SET_BONUS_DESCRIPTION, SET_LABEL, STAT_LABEL } from "../../core/equipment.js";
import { MonsterInstance, isSkillMaxLevel, resolveEquippedItems, starLabel } from "../../core/monsterInstance.js";
import { computeEffectiveStats, requiredExpForLevel, RANK_UP_SACRIFICE_COUNT, STAR_MAX_LEVEL, canRankUp } from "../../core/rarity.js";
import { formatExtraStatLines } from "../../core/stats.js";
import { findMonsterById } from "../../data/monsters.js";
import { PlayerState } from "../../game/playerState.js";
import { checkRankUp } from "../../game/progression.js";
import { el } from "../dom.js";
import { renderSkillRows } from "./skillPanel.js";

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
  onSelectSlot: (monsterId: string, slot: EquipSlot) => void;
  onViewEquippedSlot: (equipmentId: string) => void;
  onGoMonsterTraining: (monsterId: string) => void;
  onGoMonsterDex: () => void;
}

export function monsterCard(
  instance: MonsterInstance,
  onClick: () => void,
  extra?: { selected?: boolean; disabled?: boolean; bonus?: boolean },
): HTMLElement {
  const dex = findMonsterById(instance.dexId);
  const maxLevel = STAR_MAX_LEVEL[instance.star];
  const classes = ["monster-card"];
  if (extra?.selected) classes.push("monster-card--selected");
  if (extra?.disabled) classes.push("monster-card--disabled");
  if (extra?.bonus) classes.push("monster-card--bonus");

  return el(
    "button",
    {
      type: "button",
      className: classes.join(" "),
      disabled: extra?.disabled,
      onclick: onClick,
    },
    [
      extra?.bonus ? el("div", { className: "monster-card__bonus-badge" }, ["★"]) : null,
      el("div", { className: "monster-card__avatar", style: dex ? `background:${dex.color}` : undefined }, [dex ? dex.emoji : "❓"]),
      el("div", { className: "monster-card__name" }, [dex ? dex.name : instance.dexId]),
      el("div", { className: "monster-card__meta" }, [`${starLabel(instance.star)} Lv${instance.level}/${maxLevel}`]),
    ].filter((n): n is HTMLDivElement => n !== null),
  );
}

function renderList(props: MonstersProps): HTMLElement {
  const cards = props.player.monsters.map((instance) => monsterCard(instance, () => props.onSelectDetail(instance.id)));
  return el("div", { className: "screen monsters-screen" }, [
    el("header", { className: "app-header" }, [el("h1", {}, ["所持モンスター"]), el("p", { className: "app-subtitle" }, [`${props.player.monsters.length}体所持中`])]),
    el("section", { className: "panel" }, [
      el("button", { type: "button", className: "btn btn--ghost btn--large", onclick: props.onGoMonsterDex }, ["📖 モンスター図鑑を見る"]),
    ]),
    el("section", { className: "panel" }, [el("div", { className: "monster-grid" }, cards)]),
  ]);
}

function renderSlotGrid(props: MonstersProps, instance: MonsterInstance): HTMLElement {
  const boxes = EQUIP_SLOTS.map((slot) => {
    const equipmentId = instance.equipment[slot];
    const equipment = equipmentId ? props.player.equipment.find((e) => e.id === equipmentId) : undefined;

    if (equipment) {
      return el(
        "button",
        {
          type: "button",
          className: "equip-slot equip-slot--filled",
          onclick: () => props.onViewEquippedSlot(equipment.id),
        },
        [
          el("div", { className: "equip-slot__label" }, [`S${slot}${equipment.level > 0 ? ` +${equipment.level}` : ""}`]),
          el("div", { className: "equip-slot__star" }, ["★".repeat(equipment.star)]),
          el("div", { className: "equip-slot__stat" }, [STAT_LABEL[equipment.mainStat.type]]),
        ],
      );
    }

    return el(
      "button",
      { type: "button", className: "equip-slot equip-slot--empty", onclick: () => props.onSelectSlot(instance.id, slot) },
      [el("div", { className: "equip-slot__label" }, [`S${slot}`]), el("div", { className: "equip-slot__plus" }, ["+"])],
    );
  });

  return el("div", { className: "equip-slot-grid" }, boxes);
}

function renderSkillPanel(dex: ReturnType<typeof findMonsterById>, instance: MonsterInstance, onGoMonsterTraining: () => void): HTMLElement | null {
  if (!dex) return null;

  return el("section", { className: "panel" }, [
    el("h2", {}, ["スキル"]),
    ...renderSkillRows(dex.skills, instance.skillLevels),
    isSkillMaxLevel(instance) ? el("p", { className: "app-subtitle" }, ["スキルはすべて最大レベルです"]) : null,
    el("button", { type: "button", className: "btn btn--ghost", onclick: onGoMonsterTraining }, ["💪 モンスター強化"]),
  ].filter((n): n is HTMLElement => n !== null));
}

function renderSetBonusPanel(equippedItems: ReturnType<typeof resolveEquippedItems>): HTMLElement | null {
  const active = getActiveSetBonuses(equippedItems);
  if (active.length === 0) return null;

  const rows = active.flatMap((bonus) => {
    const desc = SET_BONUS_DESCRIPTION[bonus.set];
    const lines = [el("div", { className: "set-bonus-row" }, [`${SET_LABEL[bonus.set]}(${bonus.count}) 2セット: ${desc.two}`])];
    if (bonus.fourActive) {
      lines.push(el("div", { className: "set-bonus-row" }, [`${SET_LABEL[bonus.set]}(${bonus.count}) 4セット: ${desc.four}`]));
    }
    return lines;
  });

  return el("section", { className: "panel" }, [el("h2", {}, ["発動中のセット効果"]), ...rows]);
}

function renderDetail(props: MonstersProps, instance: MonsterInstance): HTMLElement {
  const dex = findMonsterById(instance.dexId);
  const maxLevel = STAR_MAX_LEVEL[instance.star];
  const growthStats = dex ? computeEffectiveStats(dex.stats, instance.star, instance.level) : null;
  const equippedItems = resolveEquippedItems(instance, props.player.equipment);
  const effectiveStats = growthStats ? applyEquipmentToStats(growthStats, equippedItems) : null;
  const rankReady = canRankUp(instance.star, instance.level);
  const expNeeded = requiredExpForLevel(instance.level);
  const inParty = props.player.partyIds.includes(instance.id);

  const statLines = effectiveStats
    ? [
        `HP ${effectiveStats.hp}`,
        `ATK ${effectiveStats.atk}`,
        `DEF ${effectiveStats.def}`,
        `SPD ${effectiveStats.spd}`,
        ...formatExtraStatLines(effectiveStats),
      ]
    : [];

  return el("div", { className: "screen monsters-screen" }, [
    el("header", { className: "app-header" }, [el("h1", {}, [dex ? dex.name : instance.dexId])]),
    el("section", { className: "panel monster-detail" }, [
      el("div", { className: "monster-detail__avatar", style: dex ? `background:${dex.color}` : undefined }, [dex ? dex.emoji : "❓"]),
      el("div", { className: "monster-detail__star" }, [starLabel(instance.star)]),
      el("div", { className: "monster-detail__level" }, [`Lv ${instance.level} / ${maxLevel}`]),
      inParty ? el("div", { className: "role-badge" }, ["編成中"]) : null,
      el("div", { className: "monster-detail__stats" }, statLines.map((line) => el("div", {}, [line]))),
      instance.level < maxLevel
        ? el("div", { className: "monster-detail__exp" }, [`経験値 ${instance.exp} / ${expNeeded}`])
        : el("div", { className: "monster-detail__exp" }, ["経験値 MAX"]),
    ].filter((n): n is HTMLDivElement => n !== null)),
    renderSkillPanel(dex, instance, () => props.onGoMonsterTraining(instance.id)),
    el("section", { className: "panel" }, [el("h2", {}, ["装備"]), renderSlotGrid(props, instance)]),
    renderSetBonusPanel(equippedItems),
    rankReady
      ? el(
          "button",
          { type: "button", className: "btn btn--primary btn--large", onclick: props.onStartRankUp },
          [`⭐ ランクアップ (素材${RANK_UP_SACRIFICE_COUNT[instance.star]}体必要)`],
        )
      : el("div", { className: "panel rankup-hint" }, [
          instance.star >= 6 ? "最大ランクに到達しています" : `最大レベル(Lv${maxLevel})になるとランクアップできます`,
        ]),
    el("button", { type: "button", className: "btn btn--ghost btn--large", onclick: () => props.onSelectDetail(null) }, ["◀ 一覧に戻る"]),
  ].filter((n): n is HTMLElement => n !== null));
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
