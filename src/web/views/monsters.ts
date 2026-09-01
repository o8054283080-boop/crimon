import { ELEMENT_JA } from "../../core/element.js";
import { applyEquipmentToStats, EQUIP_SLOTS, EquipSlot, getActiveSetBonuses, SET_BONUS_DESCRIPTION, SET_LABEL, STAT_LABEL } from "../../core/equipment.js";
import { MonsterInstance, isSkillMaxLevel, resolveEquippedItems, starLabel } from "../../core/monsterInstance.js";
import { computeEffectiveStats, requiredExpForLevel, RANK_UP_SACRIFICE_COUNT, STAR_MAX_LEVEL, canRankUp } from "../../core/rarity.js";
import { EXTRA_STAT_FORMATS, PRIMARY_STAT_FORMATS, buildStatBreakdown } from "../../core/stats.js";
import { findMonsterById } from "../../data/monsters.js";
import { PlayerState } from "../../game/playerState.js";
import { checkRankUp } from "../../game/progression.js";
import { MaterialMonsterSort, sortMaterialMonsters } from "../../game/materialMonsterSort.js";
import { el } from "../dom.js";
import { MONSTER_SORT_KEYS, MONSTER_SORT_LABEL, MonsterSortKey, monsterPower, sortMonsters } from "../../game/monsterSort.js";
import { GEAR_SLOT_TOTAL, MonsterFilter, equippedCount, filterMonsters } from "../monsterFilter.js";
import { renderMonsterFilterBar } from "./monsterFilterBar.js";
import { buildMonsterCard } from "./monsterCard.js";
import { renderPartySlots } from "./partyCard.js";
import { icon } from "../icons.js";
import { CreateSlot, currentSkillOf, describeCreatedSkill } from "../../game/monsterCreate.js";
import { renderSkillRows } from "./skillPanel.js";
import { withPortrait } from "../three/portrait.js";
import { managementHeader } from "./managementHeader.js";
import { stickyActions } from "./stickyActions.js";
import { computeLeveledSkill, describeSkillLines, MAX_SKILL_LEVEL } from "../../core/skill.js";
import { LATENT_ABILITY_CANDIDATES } from "../../data/latentAbilities.js";
import "../ui/monsterDetail.css";

export interface MonstersProps {
  player: PlayerState;
  detailId: string | null;
  rankUpMode: boolean;
  selectedSacrificeIds: string[];
  onSelectDetail: (id: string | null) => void;
  onStartRankUp: () => void;
  onToggleLock: (monsterId: string) => void;
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
  extra?: { compact?: boolean; selected?: boolean; disabled?: boolean; bonus?: boolean; onLongPress?: () => void; badge?: string },
): HTMLElement {
  const dex = findMonsterById(instance.dexId);
  return buildMonsterCard(dex, instance.dexId, onClick, {
    compact: extra?.compact,
    selected: extra?.selected,
    disabled: extra?.disabled,
    bonus: extra?.bonus,
    onLongPress: extra?.onLongPress,
    // 長押しは見えない操作なので、同じ詳細へ丸ボタンからも辿れるようにする
    onDetail: extra?.onLongPress,
    star: instance.star,
    level: instance.level,
    maxLevel: extra?.compact ? undefined : STAR_MAX_LEVEL[instance.star],
    // 所持一覧では識別情報だけに絞る。他の選択画面では従来の判断材料を保つ。
    power: extra?.compact ? undefined : monsterPower(instance),
    gearCount: extra?.compact ? undefined : equippedCount(instance),
    gearTotal: extra?.compact ? undefined : GEAR_SLOT_TOTAL,
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
  const cards = sortedMonsters.map((instance) => {
    const card = monsterCard(instance, () => props.onSelectDetail(instance.id), {
      compact: true,
      badge: props.player.partyIds.includes(instance.id) ? "編成中" : undefined,
    });
    card.classList.toggle("monster-list-card--locked", instance.locked === true);
    card.append(renderMonsterListLock(instance, props.onToggleLock));
    return card;
  });

  return el("div", { className: "screen monsters-screen" }, [
    // 見出しと図鑑への入口を1行にまとめる。縦画面では上の帯が厚いほど
    // 「モンスターが1体も見えないまま画面が終わる」ため
    el("header", { className: "app-header app-header--row" }, [
      el("h1", {}, ["所持モンスター"]),
      el("button", { type: "button", className: "btn btn--ghost head-action", onclick: props.onGoMonsterDex }, ["📖 図鑑"]),
    ]),
    el("section", { className: "panel monsters-list-panel" }, [
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

/** 所持一覧専用の鍵。カードの詳細遷移とは独立した操作として扱う。 */
export function renderMonsterListLock(instance: MonsterInstance, onToggleLock: (monsterId: string) => void): HTMLButtonElement {
  const view = monsterListLockView(instance);
  return el(
    "button",
    {
      type: "button",
      className: `monster-list-card__lock${view.locked ? " is-locked" : ""}`,
      title: view.title,
      ariaLabel: view.label,
      "aria-pressed": String(view.locked),
      onclick: (event: MouseEvent) => handleMonsterListLockClick(event, instance.id, onToggleLock),
    },
    [el("span", { className: "monster-list-card__lock-glyph", "aria-hidden": "true" }, [view.glyph])],
  );
}

export function monsterListLockView(instance: Pick<MonsterInstance, "locked">): { locked: boolean; label: string; title: string; glyph: string } {
  const locked = instance.locked === true;
  return {
    locked,
    label: locked ? "モンスターのロックを解除" : "モンスターをロック",
    title: locked ? "ロック中" : "未ロック",
    glyph: locked ? "🔒" : "🔓",
  };
}

export function handleMonsterListLockClick(event: Pick<Event, "preventDefault" | "stopPropagation">, monsterId: string, onToggleLock: (monsterId: string) => void): void {
  event.preventDefault();
  event.stopPropagation();
  onToggleLock(monsterId);
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
          onclick: () => props.onSelectSlot(instance.id, slot),
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
  // 何を見て強さを判断すればよいのかが伝わらない。
  // どちらも「素の値 / 装備で増えた分 / 合計」の内訳付きで出す
  const primaryStats = growthStats && effectiveStats ? buildStatBreakdown(growthStats, effectiveStats, PRIMARY_STAT_FORMATS) : [];
  const secondaryStats = growthStats && effectiveStats ? buildStatBreakdown(growthStats, effectiveStats, EXTRA_STAT_FORMATS) : [];
  const gearedSlots = equippedItems.length;

  const expRatio = instance.level < maxLevel && expNeeded > 0 ? Math.min(100, Math.max(0, instance.exp / expNeeded * 100)) : 100;
  const skills = dex?.skills.map((skill, index) => index === 0 ? skill : currentSkillOf(instance, index as CreateSlot) ?? skill) ?? [];
  const latentId = instance.development?.latentAbilityId ?? null;
  const latent = latentId ? LATENT_ABILITY_CANDIDATES[instance.dexId]?.find((candidate) => candidate.id === latentId) : undefined;
  const activeSets = getActiveSetBonuses(equippedItems);

  return el("div", { className: "screen monsters-screen monster-detail-screen" }, [
    el("header", { className: "monster-detail-head" }, [
      el("button", { type: "button", className: "monster-detail-head__back", onclick: () => props.onSelectDetail(null), ariaLabel: "所持モンスター一覧へ戻る" }, [icon("back", { size: 17 }), "戻る"]),
      el("h1", {}, [dex?.name ?? instance.dexId ?? "名称未設定"]),
      el("button", {
        type: "button", className: `monster-detail-head__lock${instance.locked ? " is-locked" : ""}`,
        onclick: (event: MouseEvent) => { event.stopPropagation(); props.onToggleLock(instance.id); },
        ariaLabel: instance.locked ? "モンスターのロックを解除" : "モンスターをロック", title: instance.locked ? "ロック中" : "未ロック",
      }, [icon("lock", { size: 19 })]),
    ]),
    el("main", { className: "monster-detail-layout" }, [
    el("section", { className: "monster-detail monster-detail-summary", "data-star": String(instance.star) }, [
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
          el("span", { className: "monster-detail__meta" }, [
            dex ? el("span", { className: "monster-detail__role" }, [dex.role || "役割未設定"]) : null,
            inParty ? el("span", { className: "role-badge" }, ["編成中"]) : null,
            instance.createdSkill ? el("span", { className: "create-mark" }, ["クリエイト済"]) : null,
          ].filter((n): n is HTMLElement => n !== null)),
          el("strong", { className: "monster-detail__power" }, [`戦闘力 ${monsterPower(instance).toLocaleString()}`]),
          el("div", { className: "monster-detail__exp-compact" }, [
            el("span", {}, [instance.level < maxLevel ? `${instance.exp} / ${expNeeded}` : "経験値 MAX"]),
            el("span", { className: "monster-detail__exp-track" }, [el("span", { style: `width:${expRatio}%` }, [])]),
          ]),
        ].filter((n): n is HTMLElement => n !== null)),
      ]),
      el(
        "div",
        { className: "monster-detail__stats" },
        primaryStats.map((entry) =>
          el("div", { className: "stat-tile" }, [
            el("span", { className: "stat-tile__label" }, [entry.label]),
            el("span", { className: "stat-tile__value" }, [entry.total]),
            // 合計だけ出すと、その数字のどこまでが装備のおかげなのかが分からない。
            // 装備を組み替える判断はこの差分を見てするもの
            entry.gain
              ? el("span", { className: "stat-tile__breakdown" }, [
                  el("span", { className: "stat-tile__base" }, [entry.base]),
                  el("span", { className: "stat-tile__gain" }, [entry.gain]),
                ])
              : null,
          ].filter((n): n is HTMLElement => n !== null)),
        ),
      ),
      el(
        "div",
        { className: "monster-detail__substats" },
        secondaryStats.map((entry) =>
          el("span", {}, [
            `${entry.label} ${entry.total}`,
            entry.gain ? el("span", { className: "stat-tile__gain" }, [entry.gain]) : null,
          ].filter((n): n is string | HTMLElement => n !== null)),
        ),
      ),
      el("div", { className: "monster-detail__gear-note" }, [gearedSlots ? `装備補正：${gearedSlots}枠（緑字）` : "装備補正：なし"]),
    ]),
    el("section", { className: "monster-detail-section monster-detail-skills" }, [
      el("h2", {}, ["スキル", el("small", {}, ["タップで完全説明"])]),
      el("div", { className: "monster-detail-skills__grid" }, skills.length ? skills.map((skill, index) => {
        const level = instance.skillLevels?.[index] ?? 1;
        const leveled = computeLeveledSkill(skill, level);
        const effects = describeSkillLines(leveled);
        return el("details", { className: "monster-skill-compact" }, [
          el("summary", {}, [
            el("span", { className: "monster-skill-compact__slot" }, [`S${index + 1}`]),
            el("strong", {}, [skill.name || "名称未設定"]),
            el("span", { className: "monster-skill-compact__level" }, [`Lv${level}/${MAX_SKILL_LEVEL} · ${leveled.cooldownTurns ? `CT${leveled.cooldownTurns}` : "CTなし"}`]),
            el("span", { className: "monster-skill-compact__effect" }, [effects.length ? effects.join(" / ") : "効果データなし"]),
          ]),
          el("div", { className: "monster-skill-compact__full" }, [
            el("p", {}, [skill.description || "説明未登録"]), el("p", {}, [effects.length ? effects.join(" / ") : "効果データなし"]),
          ]),
        ]);
      }) : [el("p", { className: "monster-detail-empty" }, ["スキル未設定"])]),
    ]),
    el("section", { className: "monster-detail-section monster-detail-latent" }, [
      el("h2", {}, ["◆ 潜在覚醒"]),
      latent ? el("div", {}, [el("strong", {}, [latent.name || "名称未設定"]), el("span", {}, [latent.description || "説明未登録"])])
        : el("span", { className: "monster-detail-empty" }, [latentId ? "潜在覚醒：未設定" : "🔒 未解放"]),
    ]),
    el("section", { className: "monster-detail-section monster-detail-equipment" }, [
      el("h2", {}, ["装備"]), renderSlotGrid(props, instance),
      activeSets.length ? el("p", { className: "monster-detail-equipment__sets" }, [activeSets.flatMap((bonus) => {
        const description = SET_BONUS_DESCRIPTION[bonus.set];
        return [`${SET_LABEL[bonus.set]}：${description.two}${bonus.fourActive ? ` / ${description.four}` : ""}`];
      }).join("　")]) : null,
    ].filter((node): node is HTMLElement => node !== null)),
    el("section", { className: "monster-detail-actions" }, [
      el("button", { type: "button", className: "btn btn--ghost", onclick: () => props.onGoMonsterTraining(instance.id) }, ["強化"]),
      el("button", { type: "button", className: "btn btn--ghost", onclick: () => props.onGoCreate(instance.id) }, [instance.createdSkill ? "クリエイトし直す" : "クリエイト"]),
      rankReady ? el("button", { type: "button", className: "btn btn--primary", onclick: props.onStartRankUp }, [`ランクアップ（素材${RANK_UP_SACRIFICE_COUNT[instance.star]}体）`]) : null,
      el("button", { type: "button", className: "btn btn--ghost", onclick: () => props.onSelectSlot(instance.id, 1) }, ["装備変更"]),
      el("small", { className: "monster-detail-actions__hint" }, [rankReady ? "ランクアップ可能" : instance.star >= 6 ? "最大ランク到達" : `ランクアップ：Lv${maxLevel}で解放`]),
    ].filter((n): n is HTMLElement => n !== null)),
    ]),
  ].filter((n): n is HTMLElement => n !== null));
}

let rankUpMaterialSort: Extract<MaterialMonsterSort, "DEFAULT" | "REINCARNATION_PIG_FIRST"> = "DEFAULT";
/**
 * ランクアップの素材選びで使う並べ替えの軸。
 *
 * **所持一覧と同じ軸をそのまま出す。** 素材を選ぶ時に見たいものは
 * 一覧を見る時と変わらない(弱い順に処分したい・種族で揃えたい・
 * 引いたばかりの子を避けたい)。ここだけ別の言葉にすると、
 * 同じことをするのに2つの操作を覚えることになる。
 *
 * 画面を離れたら「おすすめ」へ戻す(`renderMonsters` の末尾)。
 * 素材選びは一度きりの作業なので、前回の軸を持ち越す意味がない。
 */
let rankUpSortKey: MonsterSortKey = "recommended";

function renderRankUp(props: MonstersProps, target: MonsterInstance): HTMLElement {
  const dex = findMonsterById(target.dexId);
  const requiredCount = RANK_UP_SACRIFICE_COUNT[target.star];
  const candidates = props.player.monsters.filter((m) => m.id !== target.id && m.star === target.star && !props.player.partyIds.includes(m.id));

  const sacrifices = props.selectedSacrificeIds
    .map((id) => props.player.monsters.find((m) => m.id === id))
    .filter((m): m is MonsterInstance => m !== undefined);
  const check = checkRankUp(target, sacrifices, props.player.partyIds);

  // 軸で並べてから、転生ピッグだけを先頭へ寄せる。
  // 逆にすると寄せた並びを軸が壊すので、順番は入れ替えられない
  const buildCards = (): HTMLElement[] => sortMaterialMonsters(
    sortMonsters(candidates, rankUpSortKey, { partyIds: props.player.partyIds }),
    rankUpMaterialSort,
  ).map((c) =>
    // 素材選びの最中こそ「この子は誰だったか」を確かめたい。長押しで詳細へ送る
    monsterCard(c, () => props.onToggleSacrifice(c.id), {
      selected: props.selectedSacrificeIds.includes(c.id),
      onLongPress: () => props.onSelectDetail(c.id),
    }),
  );
  const grid = el("div", { className: "monster-grid" }, buildCards());

  /*
   * 札は作り直さず、押された時に印だけ付け替える。
   * 画面ごと描き直すと、選んだ素材と巻物の位置が毎回先頭へ戻ってしまう。
   */
  const sortButtons = MONSTER_SORT_KEYS.map((key) => {
    const button = el("button", {
      type: "button",
      className: `slot-filter-chip${rankUpSortKey === key ? " slot-filter-chip--active" : ""}`,
    }, [MONSTER_SORT_LABEL[key]]) as HTMLButtonElement;
    button.onclick = () => {
      rankUpSortKey = key;
      for (const [i, other] of sortButtons.entries()) {
        other.classList.toggle("slot-filter-chip--active", MONSTER_SORT_KEYS[i] === key);
      }
      grid.replaceChildren(...buildCards());
    };
    return button;
  });

  const normalSortButton = el("button", {
    type: "button",
    className: `slot-filter-chip${rankUpMaterialSort === "DEFAULT" ? " slot-filter-chip--active" : ""}`,
  }, ["通常"]) as HTMLButtonElement;
  const reincarnationSortButton = el("button", {
    type: "button",
    className: `slot-filter-chip${rankUpMaterialSort === "REINCARNATION_PIG_FIRST" ? " slot-filter-chip--active" : ""}`,
  }, ["転生ピッグ優先"]) as HTMLButtonElement;
  const applyMaterialSort = (sort: typeof rankUpMaterialSort): void => {
    rankUpMaterialSort = sort;
    normalSortButton.classList.toggle("slot-filter-chip--active", sort === "DEFAULT");
    reincarnationSortButton.classList.toggle("slot-filter-chip--active", sort === "REINCARNATION_PIG_FIRST");
    grid.replaceChildren(...buildCards());
  };
  normalSortButton.onclick = () => applyMaterialSort("DEFAULT");
  reincarnationSortButton.onclick = () => applyMaterialSort("REINCARNATION_PIG_FIRST");

  return el("div", { className: "screen monsters-screen" }, [
    managementHeader("ランクアップ", props.onCancelRankUp, dex ? dex.name : target.dexId),
    el("section", { className: "panel" }, [
      el("p", {}, [`対象: ${dex ? dex.name : target.dexId} ${starLabel(target.star)} → ${starLabel((target.star + 1) as 1 | 2 | 3 | 4 | 5)}`]),
      el("p", {}, [`同じ星(${starLabel(target.star)})のモンスターを${requiredCount}体選択してください (${props.selectedSacrificeIds.length}/${requiredCount})`]),
      /*
       * **選んだ顔ぶれをここに並べる。**
       * 数だけ出しても「誰を選んだか」は分からず、確かめるには一覧を探し直すしかなかった。
       * 必要な数だけ枠を出すので、あと何体かも同時に分かる。押せば外せる。
       */
      el("div", { className: "picked-row" }, [
        el("span", { className: "picked-row__label" }, ["選んだ素材(押すと外せます)"]),
        renderPartySlots(sacrifices, requiredCount, props.onToggleSacrifice),
      ]),
    ]),
    el("section", { className: "panel" }, [
      el("div", { className: "mfilter__group" }, [
        el("span", { className: "mfilter__label" }, ["並び順"]),
        el("div", { className: "mfilter__chips" }, sortButtons),
      ]),
      el("div", { className: "mfilter__group" }, [
        el("span", { className: "mfilter__label" }, ["素材"]),
        el("div", { className: "mfilter__chips" }, [normalSortButton, reincarnationSortButton]),
      ]),
      candidates.length === 0
        ? el("p", { className: "app-subtitle" }, ["素材にできるモンスターがいません"])
        : grid,
      el("div", { className: "sticky-actions__spacer" }, []),
    ]),
    /*
     * 実行は下に貼り付ける。素材は一覧の上の方で選び終わっているのに、
     * 押すためだけに数十枚を巻き下ろすことになっていた。
     */
    stickyActions({
      status: check.ok
        ? `素材 ${props.selectedSacrificeIds.length}/${requiredCount} 体`
        : check.reason ?? `あと ${Math.max(0, requiredCount - props.selectedSacrificeIds.length)} 体選んでください`,
      primary: el(
        "button",
        {
          type: "button",
          className: "btn btn--primary btn--large",
          disabled: !check.ok,
          onclick: props.onConfirmRankUp,
        },
        ["⭐ ランクアップ実行"],
      ),
    }),
    el("button", { type: "button", className: "btn btn--ghost btn--large", onclick: props.onCancelRankUp }, ["キャンセル"]),
  ]);
}

export function renderMonsters(props: MonstersProps): HTMLElement {
  const target = props.detailId ? props.player.monsters.find((m) => m.id === props.detailId) : undefined;

  if (target && props.rankUpMode) return renderRankUp(props, target);
  rankUpMaterialSort = "DEFAULT";
  rankUpSortKey = "recommended";
  if (target) return renderDetail(props, target);
  return renderList(props);
}
