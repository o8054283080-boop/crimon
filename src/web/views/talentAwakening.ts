import "../ui/talentAwakening.css";
import { MonsterInstance, toBattleDefinition } from "../../core/monsterInstance.js";
import type { MonsterDefinition } from "../../core/monster.js";
import type { Skill } from "../../core/skill.js";
import {
  BASIC_TALENTS, BATTLE_TALENTS, SKILL_AWAKENING_POINT_COST, SKILL_AWAKENING_STONE_COST,
  TALENT_POINT_CAP, TALENT_RESET_GOLD_COST, TIER_NUMERALS,
  remainingTalentPoints, talentStatBonus, usedTalentPoints,
  type TalentTier, type TieredTalentDef,
} from "../../core/talents.js";
import { skillTalentCost, type SkillTalentDef } from "../../core/talentSkills.js";
import {
  initialRarityOf, isTalentUnlocked, nextUnlockCostOf, skillAwakeningCandidates, skillTalentCandidates,
  talentPointCapOf, talentsOf, type SkillTalentSlot,
} from "../../game/talents.js";
import { materialCount } from "../../game/awakeningDepths.js";
import type { PlayerState } from "../../game/playerState.js";
import { el } from "../dom.js";

/**
 * 才能覚醒の画面。
 *
 * ## 下の帯は必ず出す
 *
 * 「残り何pt使えるか」と「決定」は、**一覧をどれだけ流しても見える場所**に置く。
 * 才能は上から下まで並ぶので、残りptが上にあると
 * 「取れるかどうか」を見るたびに戻ることになる。
 *
 * **浮かせるのではなく、画面の流れの最後に固定する。**この案件では
 * 浮遊パネルが3回とも下の何かを覆って、押せないボタンを作っている。
 * ここは `position: sticky` で、一覧の上に重ならない形にしてある。
 *
 * ## 取ったものは即座に反映する
 *
 * 「決定」で確定する形にはしていない。取った瞬間に個体へ入り、
 * 残りptと能力の見込みがその場で動く。**取り消しは振り直し**(有料)で、
 * これは能力ポイントの配分と同じ作法。
 */

export interface TalentAwakeningProps {
  player: PlayerState;
  monster: MonsterInstance;
  dex: MonsterDefinition;
  tab: TalentTab;
  onChangeTab: (tab: TalentTab) => void;
  /** スキル才能で今見ている枠(1 = スキル2、2 = スキル3) */
  skillSlot: SkillTalentSlot;
  onChangeSkillSlot: (slot: SkillTalentSlot) => void;
  onUnlockPoint: () => void;
  onTakeBasic: (line: string) => void;
  onTakeBattle: (line: string) => void;
  onTakeSkillTalent: (slot: SkillTalentSlot, id: string) => void;
  onTakeAwakening: (slot: SkillTalentSlot, id: string) => void;
  onReset: () => void;
  onClose: () => void;
}

export type TalentTab = "BASIC" | "BATTLE" | "SKILL";

const TAB_LABEL: Record<TalentTab, string> = { BASIC: "基礎才能", BATTLE: "戦闘才能", SKILL: "スキル才能" };

/* ==========================================================================
 * 上の情報
 * ========================================================================== */

function renderHeader(props: TalentAwakeningProps): HTMLElement {
  const { monster, dex } = props;
  const talents = talentsOf(monster);
  const rarity = initialRarityOf(monster);
  const cap = talentPointCapOf(monster);
  const used = usedTalentPoints(talents, skillTalentCost);
  const remaining = remainingTalentPoints(talents, skillTalentCost);
  const cost = nextUnlockCostOf(monster);
  const canAfford = cost !== null
    && materialCount(props.player, "shards") >= cost.shards
    && materialCount(props.player, "crystals") >= cost.crystals;

  return el("section", { className: "talent-head" }, [
    el("div", { className: "talent-head__top" }, [
      el("div", { className: "talent-head__portrait" }, [dex.emoji]),
      el("div", { className: "talent-head__id" }, [
        el("div", { className: "talent-head__name" }, [dex.name]),
        el("div", { className: "talent-head__meta" }, [
          el("span", { className: "talent-head__star" }, [`★${monster.star}`]),
          el("span", {}, [`Lv${monster.level}`]),
          // **初期★を出す。**pt上限がこれで決まるので、出さないと数字の理由が分からない
          el("span", { className: "talent-head__origin" }, [`初期★${rarity}`]),
        ]),
      ]),
    ]),
    el("div", { className: "talent-head__points" }, [
      pointBox("才能pt", `${talents.unlockedPoints} / ${cap}`, "解放済み"),
      pointBox("使用済み", String(used), ""),
      pointBox("スキル覚醒", `${talents.awakening ? 1 : 0} / 1`, talents.awakening ? "取得済み" : ""),
    ]),
    el("div", { className: "talent-head__unlock" }, [
      cost
        ? el("div", { className: "talent-head__unlock-cost" }, [
            el("span", {}, ["次の1ptに "]),
            el("span", { className: canAfford ? "talent-cost talent-cost--ok" : "talent-cost talent-cost--short" }, [
              `🔹${cost.shards}${cost.crystals > 0 ? ` 💠${cost.crystals}` : ""}`,
            ]),
          ])
        : el("div", { className: "talent-head__unlock-cost" }, ["すべて解放済み"]),
      el(
        "button",
        {
          type: "button",
          className: "btn btn--primary talent-head__unlock-btn",
          disabled: !cost || !canAfford,
          onclick: props.onUnlockPoint,
        },
        ["才能ptを解放"],
      ),
    ]),
    el("div", { className: "talent-head__reset" }, [
      el(
        "button",
        {
          type: "button",
          className: "btn btn--ghost",
          disabled: props.player.gold < TALENT_RESET_GOLD_COST || used === 0,
          onclick: props.onReset,
        },
        [`振り直し (🪙${TALENT_RESET_GOLD_COST.toLocaleString("ja-JP")})`],
      ),
      el("span", { className: "talent-head__reset-note" }, ["解放したptは失いません"]),
    ]),
    el("div", { className: "talent-head__remaining" }, [
      el("span", {}, ["残り才能pt"]),
      el("strong", {}, [String(remaining)]),
    ]),
  ]);
}

function pointBox(label: string, value: string, note: string): HTMLElement {
  return el("div", { className: "talent-point" }, [
    el("div", { className: "talent-point__label" }, [label]),
    el("div", { className: "talent-point__value" }, [value]),
    note ? el("div", { className: "talent-point__note" }, [note]) : null,
  ].filter((n) => n !== null) as HTMLElement[]);
}

/* ==========================================================================
 * 段階制の才能(基礎・戦闘)
 * ========================================================================== */

function renderTieredCard<L extends string>(
  def: TieredTalentDef<L>, tier: TalentTier, remaining: number, onTake: () => void,
): HTMLElement {
  // 段は0〜3。3は「取り切った」ので次が無い
  const next = tier === 0 ? def.steps[0] : tier === 1 ? def.steps[1] : tier === 2 ? def.steps[2] : null;
  const affordable = next !== null && remaining >= next.cost;
  const state = tier >= 3 ? "MAX" : affordable ? "READY" : "SHORT";

  const steps = def.steps.map((step, i) => el(
    "div",
    { className: `talent-step${i < tier ? " talent-step--taken" : ""}` },
    [
      el("span", { className: "talent-step__tier" }, [TIER_NUMERALS[i]]),
      el("span", { className: "talent-step__effect" }, [step.effectLabel]),
      el("span", { className: "talent-step__cost" }, [`${step.cost}pt`]),
    ],
  ));

  return el("article", { className: `talent-card talent-card--${state.toLowerCase()}` }, [
    el("div", { className: "talent-card__head" }, [
      el("h3", { className: "talent-card__name" }, [def.name]),
      el("span", { className: "talent-card__tier" }, [tier > 0 ? TIER_NUMERALS[tier - 1] : "未取得"]),
    ]),
    el("p", { className: "talent-card__desc" }, [def.description.replace(/\*\*/g, "")]),
    el("div", { className: "talent-card__steps" }, steps),
    el(
      "button",
      {
        type: "button",
        className: `btn ${state === "READY" ? "btn--primary" : "btn--ghost"} talent-card__take`,
        disabled: state !== "READY",
        onclick: onTake,
      },
      [
        next === null ? "取得済み(最大)"
          : affordable ? `${TIER_NUMERALS[tier === 0 ? 0 : tier === 1 ? 1 : 2]} を取得 (${next.cost}pt)`
            : `${next.cost}pt 必要`,
      ],
    ),
  ]);
}

/* ==========================================================================
 * スキル才能
 * ========================================================================== */

function renderSkillTab(props: TalentAwakeningProps, battleDef: MonsterDefinition): HTMLElement {
  const talents = talentsOf(props.monster);
  const remaining = remainingTalentPoints(talents, skillTalentCost);
  const slot = props.skillSlot;
  const skill: Skill = battleDef.skills[slot];
  const taken = new Set(talents.skill[slot]);
  const candidates = skillTalentCandidates(skill);
  const awakenings = skillAwakeningCandidates(skill);
  const stones = materialCount(props.player, "stones");

  const slotTabs = el("div", { className: "talent-slot-tabs" }, ([1, 2] as const).map((s) => el(
    "button",
    {
      type: "button",
      className: `talent-slot-tab${s === slot ? " talent-slot-tab--active" : ""}`,
      onclick: () => props.onChangeSkillSlot(s),
    },
    [`スキル${s + 1}`],
  )));

  const cards = candidates.map((def) => renderSkillCard(def, {
    taken: taken.has(def.id),
    remaining,
    onTake: () => props.onTakeSkillTalent(slot, def.id),
  }));

  /*
   * スキル覚醒。**0/1を大きく見せる。**
   * 1体に1つしか取れないので、「まだ取っていない」ことが
   * ひと目で分かる必要がある。
   */
  const awakeningTaken = talents.awakening;
  const awakeningCards = awakenings.map((def) => {
    const isThis = awakeningTaken?.id === def.id && awakeningTaken.slot === slot;
    const locked = awakeningTaken !== null && !isThis;
    return renderSkillCard(def, {
      taken: isThis,
      locked,
      remaining,
      stones,
      onTake: () => props.onTakeAwakening(slot, def.id),
    });
  });

  return el("div", { className: "talent-list" }, [
    slotTabs,
    el("div", { className: "talent-skill-name" }, [
      el("span", { className: "talent-skill-name__label" }, ["今の技"]),
      el("strong", {}, [skill.name]),
    ]),
    ...(cards.length > 0 ? cards : [el("p", { className: "talent-empty" }, ["この技に付けられる才能はありません"])]),
    el("div", { className: "talent-awaken-head" }, [
      el("h3", {}, ["スキル覚醒"]),
      el("span", { className: "talent-awaken-count" }, [`${awakeningTaken ? 1 : 0} / 1`]),
    ]),
    el("p", { className: "talent-awaken-note" }, [
      `1体につき1つだけ。${SKILL_AWAKENING_POINT_COST}pt と 🌟${SKILL_AWAKENING_STONE_COST} を使います`,
    ]),
    ...(awakeningCards.length > 0
      ? awakeningCards
      : [el("p", { className: "talent-empty" }, ["この技に付けられるスキル覚醒はありません"])]),
  ]);
}

function renderSkillCard(
  def: SkillTalentDef,
  opts: { taken: boolean; locked?: boolean; remaining: number; stones?: number; onTake: () => void },
): HTMLElement {
  const needStones = def.awakening ? SKILL_AWAKENING_STONE_COST : 0;
  const enoughStones = needStones === 0 || (opts.stones ?? 0) >= needStones;
  const enoughPoints = opts.remaining >= def.cost;
  const state = opts.taken ? "taken" : opts.locked ? "locked" : enoughPoints && enoughStones ? "ready" : "short";

  return el("article", { className: `talent-card talent-card--${state}${def.awakening ? " talent-card--awaken" : ""}` }, [
    el("div", { className: "talent-card__head" }, [
      el("h3", { className: "talent-card__name" }, [def.name]),
      el("span", { className: "talent-card__cost" }, [
        `${def.cost}pt${needStones > 0 ? ` / 🌟${needStones}` : ""}`,
      ]),
    ]),
    el("div", { className: "talent-card__effect" }, [def.effectLabel]),
    el("p", { className: "talent-card__desc" }, [def.description.replace(/\*\*/g, "")]),
    el(
      "button",
      {
        type: "button",
        className: `btn ${state === "ready" ? "btn--primary" : "btn--ghost"} talent-card__take`,
        disabled: state !== "ready",
        onclick: opts.onTake,
      },
      [
        state === "taken" ? "取得済み"
          : state === "locked" ? "他のスキル覚醒を取得済み"
            : !enoughPoints ? `${def.cost}pt 必要`
              : !enoughStones ? `目覚の奇石が ${needStones} 必要`
                : "取得する",
      ],
    ),
  ]);
}

/* ==========================================================================
 * 下の固定帯
 * ========================================================================== */

function renderFooter(props: TalentAwakeningProps, battleDef: MonsterDefinition): HTMLElement {
  const talents = talentsOf(props.monster);
  const remaining = remainingTalentPoints(talents, skillTalentCost);
  const bonus = talentStatBonus(talents);
  /*
   * 才能で今どれだけ伸びているか。
   * **「取得後」ではなく「今」を出す。**取った瞬間に反映される作りなので、
   * 見込みを別に出すと、どちらが本物か分からなくなる。
   */
  const lines = [
    bonus.atkPercent > 0 ? `攻撃 +${Math.round(bonus.atkPercent * 100)}%` : null,
    bonus.hpPercent > 0 ? `HP +${Math.round(bonus.hpPercent * 100)}%` : null,
    bonus.defPercent > 0 ? `防御 +${Math.round(bonus.defPercent * 100)}%` : null,
    bonus.spdFlat > 0 ? `速度 +${bonus.spdFlat}` : null,
  ].filter((v): v is string => v !== null);

  return el("div", { className: "talent-footer" }, [
    el("div", { className: "talent-footer__stats" }, [
      el("div", { className: "talent-footer__stat-line" }, [
        lines.length > 0 ? lines.join(" / ") : "才能による上昇はまだありません",
      ]),
      el("div", { className: "talent-footer__preview" }, [
        `HP ${battleDef.stats.hp.toLocaleString("ja-JP")} / 攻撃 ${battleDef.stats.atk.toLocaleString("ja-JP")} / 速度 ${battleDef.stats.spd}`,
      ]),
    ]),
    el("div", { className: "talent-footer__actions" }, [
      el("div", { className: "talent-footer__remaining" }, [
        el("span", {}, ["残りpt"]),
        el("strong", {}, [String(remaining)]),
      ]),
      el("button", { type: "button", className: "btn btn--primary talent-footer__close", onclick: props.onClose }, ["決定"]),
    ]),
  ]);
}

/* ==========================================================================
 * 画面
 * ========================================================================== */

export function renderTalentAwakening(props: TalentAwakeningProps): HTMLElement {
  const { monster, dex } = props;

  if (!isTalentUnlocked(monster)) {
    return el("div", { className: "screen talent-screen" }, [
      el("header", { className: "app-header app-header--row" }, [el("h1", {}, ["才能覚醒"])]),
      el("section", { className: "card talent-locked" }, [
        el("p", {}, [`${dex.name} は★${monster.star}です。才能覚醒は★6で解放されます。`]),
        el("p", { className: "talent-locked__note" }, [
          `解放されると、初期★${initialRarityOf(monster)}のこの子は最大 ${TALENT_POINT_CAP[initialRarityOf(monster)]}pt まで才能を配れます。`
          + "素材(目覚の欠片・結晶)は★6になる前から目覚の深域で集めておけます。",
        ]),
      ]),
    ]);
  }

  const battleDef = toBattleDefinition(monster, dex);
  const talents = talentsOf(monster);
  const remaining = remainingTalentPoints(talents, skillTalentCost);

  const tabs = el("div", { className: "talent-tabs" }, (["BASIC", "BATTLE", "SKILL"] as const).map((tab) => el(
    "button",
    {
      type: "button",
      className: `talent-tab${tab === props.tab ? " talent-tab--active" : ""}`,
      onclick: () => props.onChangeTab(tab),
    },
    [TAB_LABEL[tab]],
  )));

  const body = props.tab === "BASIC"
    ? el("div", { className: "talent-list" }, BASIC_TALENTS.map((def) => renderTieredCard(
        def, talents.basic[def.line] ?? 0, remaining, () => props.onTakeBasic(def.line),
      )))
    : props.tab === "BATTLE"
      ? el("div", { className: "talent-list" }, BATTLE_TALENTS.map((def) => renderTieredCard(
          def, talents.battle[def.line] ?? 0, remaining, () => props.onTakeBattle(def.line),
        )))
      : renderSkillTab(props, battleDef);

  return el("div", { className: "screen talent-screen" }, [
    el("header", { className: "app-header app-header--row" }, [el("h1", {}, ["才能覚醒"])]),
    renderHeader(props),
    tabs,
    body,
    renderFooter(props, battleDef),
  ]);
}
