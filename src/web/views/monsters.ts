import { ELEMENT_JA } from "../../core/element.js";
import { applyEquipmentToStats, EQUIP_SLOTS, EquipSlot, getActiveSetBonuses, SET_BONUS_DESCRIPTION, SET_LABEL, STAT_LABEL } from "../../core/equipment.js";
import { MonsterInstance, isSkillMaxLevel, resolveEquippedItems, starLabel } from "../../core/monsterInstance.js";
import { computeEffectiveStats, requiredExpForLevel, RANK_UP_SACRIFICE_COUNT, STAR_MAX_LEVEL, canRankUp } from "../../core/rarity.js";
import { formatExtraStatLines } from "../../core/stats.js";
import { findMonsterById } from "../../data/monsters.js";
import { PlayerState } from "../../game/playerState.js";
import { checkRankUp } from "../../game/progression.js";
import { el } from "../dom.js";
import { MONSTER_SORT_KEYS, MONSTER_SORT_LABEL, MonsterSortKey, monsterPower, sortMonsters } from "../../game/monsterSort.js";
import { GEAR_SLOT_TOTAL, MonsterFilter, equippedCount, filterMonsters } from "../monsterFilter.js";
import { renderMonsterFilterBar } from "./monsterFilterBar.js";
import { buildMonsterCard } from "./monsterCard.js";
import { icon } from "../icons.js";
import { CreateSlot, currentSkillOf, describeCreatedSkill } from "../../game/monsterCreate.js";
import { renderSkillRows } from "./skillPanel.js";
import { withPortrait } from "../three/portrait.js";

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
  onViewEquippedSlot: (equipmentId: string, monsterId: string) => void;
  onGoMonsterTraining: (monsterId: string) => void;
  /** クリエイト(スキル合成)の画面へ */
  onGoCreate: (monsterId: string) => void;
  onGoMonsterDex: () => void;
  sortKey: MonsterSortKey;
  onChangeSort: (key: MonsterSortKey) => void;
  filter: MonsterFilter;
  filterOpen: boolean;
  onChangeFilter: (filter: MonsterFilter) => void;
  onToggleFilterOpen: () => void;
}

export function monsterCard(
  instance: MonsterInstance,
  onClick: () => void,
  extra?: { selected?: boolean; disabled?: boolean; bonus?: boolean; onLongPress?: () => void; badge?: string },
): HTMLElement {
  const dex = findMonsterById(instance.dexId);
  return buildMonsterCard(dex, instance.dexId, onClick, {
    selected: extra?.selected,
    disabled: extra?.disabled,
    bonus: extra?.bonus,
    onLongPress: extra?.onLongPress,
    // 長押しは見えない操作なので、同じ詳細へ丸ボタンからも辿れるようにする
    onDetail: extra?.onLongPress,
    star: instance.star,
    level: instance.level,
    maxLevel: STAR_MAX_LEVEL[instance.star],
    // 「誰を入れるか」を一覧のまま決められるよう、総合力と装備の埋まり具合を出す
    power: monsterPower(instance),
    gearCount: equippedCount(instance),
    gearTotal: GEAR_SLOT_TOTAL,
    badge: extra?.badge,
    badgeCorner: extra?.badge !== undefined,
    // 移し替え済みだと一目で分かるように。**同じ種族でも中身が違う**ので、
    // 印が無いと編成の時にどれが作り替えた個体か見分けが付かない
    created: instance.createdSkill !== undefined,
  });
}

/** 並べ替えの切り替え。押した軸がそのまま並びに出るので、選択中を強調する */
export function renderMonsterSortRow(current: MonsterSortKey, onChange: (key: MonsterSortKey) => void): HTMLElement {
  return el(
    "div",
    // 装備の並べ替えと同じ見た目にする。画面ごとに操作の形が違うと迷う
    { className: "slot-filter-row sort-row" },
    MONSTER_SORT_KEYS.map((key) =>
      el(
        "button",
        {
          type: "button",
          className: `slot-filter-chip${key === current ? " slot-filter-chip--active" : ""}`,
          onclick: () => onChange(key),
        },
        [MONSTER_SORT_LABEL[key]],
      ),
    ),
  );
}

function renderList(props: MonstersProps): HTMLElement {
  const context = { partyIds: props.player.partyIds };
  const shown = filterMonsters(props.player.monsters, props.filter, context);
  const sortedMonsters = sortMonsters(shown, props.sortKey, context);
  const cards = sortedMonsters.map((instance) =>
    monsterCard(instance, () => props.onSelectDetail(instance.id), {
      badge: props.player.partyIds.includes(instance.id) ? "編成中" : undefined,
    }),
  );

  return el("div", { className: "screen monsters-screen" }, [
    // 見出しと図鑑への入口を1行にまとめる。縦画面では上の帯が厚いほど
    // 「モンスターが1体も見えないまま画面が終わる」ため
    el("header", { className: "app-header app-header--row" }, [
      el("h1", {}, ["所持モンスター"]),
      el("button", { type: "button", className: "btn btn--ghost head-action", onclick: props.onGoMonsterDex }, ["📖 図鑑"]),
    ]),
    el("section", { className: "panel" }, [
      renderMonsterFilterBar({
        all: props.player.monsters,
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
  ]);
}

function renderSlotGrid(props: MonstersProps, instance: MonsterInstance): HTMLElement {
  const boxes = EQUIP_SLOTS.map((slot) => {
    const equipmentId = instance.equipment[slot];
    const equipment = equipmentId ? props.player.equipment.find((e) => e.id === equipmentId) : undefined;

    if (equipment) {
      // 一覧のカードと同じ data 属性を持たせ、同じ色の規則で読めるようにする。
      // 装備画面と詳細画面で見え方が違うと、同じ物だと気付けない
      return el(
        "button",
        {
          type: "button",
          className: "equip-slot equip-slot--filled",
          onclick: () => props.onViewEquippedSlot(equipment.id, instance.id),
          "data-star": String(equipment.star),
          "data-set": equipment.set,
          "data-tier": equipment.level >= 12 ? "max" : equipment.level >= 6 ? "mid" : "low",
        },
        [
          el("div", { className: "equip-slot__head" }, [
            el("span", { className: "equip-slot__label" }, [`S${slot}`]),
            el("span", { className: "equip-slot__level" }, [`+${equipment.level}`]),
          ]),
          el("div", { className: "equip-slot__star" }, ["★".repeat(equipment.star)]),
          el("div", { className: "equip-slot__stat" }, [STAT_LABEL[equipment.mainStat.type]]),
          el("div", { className: "equip-slot__set" }, [SET_LABEL[equipment.set]]),
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

function renderSkillPanel(
  dex: ReturnType<typeof findMonsterById>,
  instance: MonsterInstance,
  onGoMonsterTraining: () => void,
  onGoCreate: () => void,
): HTMLElement | null {
  if (!dex) return null;

  // 移し替え済みの枠は、元のスキルではなく移した側を出す。
  // ここが元のままだと、戦闘で出る技と説明が食い違う
  const shown = dex.skills.map((skill, i) => (i === 0 ? skill : currentSkillOf(instance, i as CreateSlot) ?? skill));

  return el("section", { className: "panel" }, [
    el("div", { className: "panel-header" }, [
      el("h2", {}, ["スキル"]),
      instance.createdSkill ? el("span", { className: "create-mark" }, [icon("summon", { size: 12 }), "クリエイト済み"]) : null,
    ].filter((n): n is HTMLElement => n !== null)),
    ...renderSkillRows(shown as typeof dex.skills, instance.skillLevels),
    instance.createdSkill
      ? el("p", { className: "app-subtitle" }, [describeCreatedSkill(instance.createdSkill)])
      : null,
    isSkillMaxLevel(instance) ? el("p", { className: "app-subtitle" }, ["スキルはすべて最大レベルです"]) : null,
    el("div", { className: "skill-panel__actions" }, [
      el("button", { type: "button", className: "btn btn--ghost", onclick: onGoMonsterTraining }, ["モンスター強化"]),
      el("button", { type: "button", className: "btn btn--ghost", onclick: onGoCreate }, [
        icon("summon", { size: 14 }),
        instance.createdSkill ? "クリエイトし直す" : "クリエイト",
      ]),
    ]),
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

  // 主要4項目と、それ以外を分ける。全部を同じ大きさで並べると、
  // 何を見て強さを判断すればよいのかが伝わらない
  const primaryStats: [string, string][] = effectiveStats
    ? [
        ["HP", String(effectiveStats.hp)],
        ["攻撃力", String(effectiveStats.atk)],
        ["防御力", String(effectiveStats.def)],
        ["速度", String(effectiveStats.spd)],
      ]
    : [];
  const secondaryStats = effectiveStats ? formatExtraStatLines(effectiveStats) : [];

  return el("div", { className: "screen monsters-screen" }, [
    el("header", { className: "app-header" }, [el("h1", {}, [dex ? dex.name : instance.dexId])]),
    el("section", { className: "panel monster-detail", "data-star": String(instance.star) }, [
      // 集めたものを眺める画面なので、肖像を主役の大きさで出す
      el("div", { className: "monster-detail__hero" }, [
        withPortrait(
          el("div", { className: "monster-detail__avatar", style: dex ? `background:${dex.color}` : undefined }, [dex ? dex.emoji : "❓"]),
          dex,
        ),
        el("div", { className: "monster-detail__ident" }, [
          dex ? el("span", { className: "monster-detail__element" }, [ELEMENT_JA[dex.element]]) : null,
          el("span", { className: "monster-detail__star" }, [starLabel(instance.star)]),
          el("span", { className: "monster-detail__level" }, [`Lv ${instance.level} / ${maxLevel}`]),
          dex ? el("span", { className: "monster-detail__role" }, [dex.role]) : null,
          inParty ? el("span", { className: "role-badge" }, ["編成中"]) : null,
        ].filter((n): n is HTMLElement => n !== null)),
      ]),
      el(
        "div",
        { className: "monster-detail__stats" },
        primaryStats.map(([label, value]) =>
          el("div", { className: "stat-tile" }, [
            el("span", { className: "stat-tile__label" }, [label]),
            el("span", { className: "stat-tile__value" }, [value]),
          ]),
        ),
      ),
      el("div", { className: "monster-detail__substats" }, secondaryStats.map((line) => el("span", {}, [line]))),
      instance.level < maxLevel
        ? el("div", { className: "monster-detail__exp" }, [`経験値 ${instance.exp} / ${expNeeded}`])
        : el("div", { className: "monster-detail__exp" }, ["経験値 MAX"]),
    ]),
    renderSkillPanel(dex, instance, () => props.onGoMonsterTraining(instance.id), () => props.onGoCreate(instance.id)),
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
    // 素材選びの最中こそ「この子は誰だったか」を確かめたい。長押しで詳細へ送る
    monsterCard(c, () => props.onToggleSacrifice(c.id), {
      selected: props.selectedSacrificeIds.includes(c.id),
      onLongPress: () => props.onSelectDetail(c.id),
    }),
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
