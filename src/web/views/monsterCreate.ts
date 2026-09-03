import { MonsterInstance, starLabel } from "../../core/monsterInstance.js";
import { Skill, describeSkillLines } from "../../core/skill.js";
import { findMonsterById } from "../../data/monsters.js";
import {
  CREATE_GOLD_COST,
  CREATE_MATERIAL_STAR,
  CreateSlot,
  checkMonsterCreate,
  creatableSkills,
  currentSkillOf,
} from "../../game/monsterCreate.js";
import { MonsterSortKey, sortMonsters } from "../../game/monsterSort.js";
import { el } from "../dom.js";
import { icon } from "../icons.js";
import { withPortrait } from "../three/portrait.js";
import {
  ABILITY_POINT_RESET_COST,
  ABILITY_POINT_VALUES,
  AllocatableStat,
  MONSTER_TYPE_LABELS,
  MONSTER_TYPE_DESCRIPTIONS,
  TYPE_REINCARNATION_GOLD_COST,
  MonsterType,
  abilityPointBudget,
} from "../../core/monsterDevelopment.js";
import {
  abilityPointsConfirmed,
  LATENT_ABILITY_CANDIDATES,
  LATENT_REAWAKENING_GOLD_COST,
  LATENT_REAWAKENING_ORB_COST,
  abilityStatBonuses,

  usedAbilityPoints,
} from "../../game/monsterDevelopment.js";

export type CreateMenu = "SKILL" | "TYPE" | "ABILITY" | "LATENT";

/**
 * クリエイト(スキル合成)の画面。
 *
 * このゲームの名前の由来にあたる仕組みなので、**何と引き換えに何を得るのかを
 * 一度に見せる。**素材は星6まで育てた1体で、しかも消える。
 * 押してから「素材が消えました」と知らせるのでは遅い。
 *
 * 画面は上から
 *   1. 誰を作り替えるのか(対象)といま入っているスキル
 *   2. 何と引き換えるのか(素材)
 *   3. どの枠に何を移すのか(移し替えの中身)
 * の順。3が決まるまで実行のボタンは押せない。
 */

export interface MonsterCreateProps {
  target: MonsterInstance;
  monsters: readonly MonsterInstance[];
  partyIds: readonly string[];
  dungeonPartyIds: readonly string[];
  /** 選んでいる素材。未選択ならnull */
  materialId: string | null;
  /** 選んでいる枠。未選択ならnull */
  slot: CreateSlot | null;
  sortKey: MonsterSortKey;
  onSelectMaterial: (instanceId: string | null) => void;
  onSelectSlot: (slot: CreateSlot) => void;
  onConfirm: () => void;
  onClear: () => void;
  onBack: () => void;
  /** 直前の操作の結果。断った理由もここに出す */
  notice: string | null;
  menu: CreateMenu;
  awakeningOrbs: number;
  gold: number;
  onSelectMenu: (menu: CreateMenu) => void;
  onReincarnate: (type: MonsterType) => void;
  onSetAbilityPoint: (stat: AllocatableStat, points: number) => void;
  onResetAbilityPoints: () => void;
  /** いまの配分で確定する。ここから先は有料でしか変えられない */
  onConfirmAbilityPoints: () => void;
  onAwaken: (candidateId: string) => void;
  reawakenConfirmOpen: boolean;
  onRequestReawaken: () => void;
  onCancelReawaken: () => void;
  onConfirmReawaken: () => void;
}

const SLOT_LABEL: Record<CreateSlot, string> = { 1: "スキル2", 2: "スキル3" };

function isEl(node: HTMLElement | null): node is HTMLElement {
  return node !== null;
}

function skillLines(skill: Skill): HTMLElement[] {
  return describeSkillLines(skill).map((line) => el("li", {}, [line]));
}

export function describeLatentEffect(candidate: (typeof LATENT_ABILITY_CANDIDATES)[string][number]): string {
  const lines: string[] = [];
  if (candidate.aoeConversion) lines.push(`対象：敵全体、主対象・副対象とも威力${Math.round(candidate.aoeConversion.damageMultiplier * 100)}%`);
  if (candidate.ignoreDefenseRatio) lines.push(`対象：選択した敵、防御力を${Math.round(candidate.ignoreDefenseRatio * 100)}%無視`);
  if (candidate.debuffDamageBonus) lines.push(`対象：選択した敵、弱体効果1個につきダメージ+${Math.round(candidate.debuffDamageBonus.perDebuff * 100)}%（最大${Math.round(candidate.debuffDamageBonus.maxBonus * 100)}%）`);
  for (const effect of candidate.runtimeEffects ?? []) {
    const chance = "chance" in effect ? `${Math.round(effect.chance * 100)}%の確率で` : "確定で";
    if (effect.kind === "DEBUFF") {
      const label: Record<typeof effect.status, string> = {
        HEAL_BLOCK: "回復を阻害", SPD_DOWN: "素早さを低下", ATK_DOWN: "攻撃力を低下", DEF_DOWN: "防御力を低下",
        POISON: "毒を1つ付与", STUN: "行動不能", BUFF_BLOCK: "強化効果を受けられなくする",
      };
      lines.push(`対象：選択した敵、${chance}${effect.duration}ターン${label[effect.status]}`);
    } else if (effect.kind === "STRIP") lines.push(`対象：選択した敵、${chance}強化効果を${effect.count}個解除`);
    else if (effect.kind === "GAUGE_DOWN") lines.push(`対象：選択した敵、${chance}行動ゲージを${Math.round(effect.value * 100)}%減少`);
    else if (effect.kind === "ALLY_GAUGE_UP") lines.push(`対象：味方全体、${chance}行動ゲージを${Math.round(effect.value * 100)}%増加`);
    else if (effect.kind === "DEBUFF_EXTEND") lines.push(`対象：選択した敵、${chance}弱体効果を${effect.duration}ターン延長`);
    else if (effect.kind === "HEAL_CLEANSE") lines.push(`対象：HP割合が最も低い味方、最大HPの${Math.round(effect.value * 100)}%回復＋弱体効果を1個解除`);
    else if (effect.kind === "REGEN") lines.push(`対象：HP割合が最も低い味方、${effect.duration}ターン最大HPの${Math.round(effect.value * 100)}%継続回復`);
    else if (effect.kind === "SHIELD") lines.push(`対象：HP割合が最も低い味方、最大HPの${Math.round(effect.value * 100)}%シールド（${effect.duration}ターン）`);
    else if (effect.kind === "SELF_GAUGE") lines.push(`対象：自身、行動ゲージを${Math.round(effect.value * 100)}%増加`);
    else if (effect.kind === "SELF_HEAL") lines.push(`対象：自身、最大HPの${Math.round(effect.value * 100)}%回復`);
    else if (effect.kind === "LIFESTEAL") lines.push(`対象：自身、与えたダメージの${Math.round(effect.value * 100)}%を回復`);
    else if (effect.kind === "SELF_CLEANSE") lines.push(`対象：自身、弱体効果を${effect.count}個解除`);
    else if (effect.kind === "SELF_SHIELD") lines.push(`対象：自身、最大HPの${Math.round(effect.value * 100)}%シールド（${effect.duration}ターン）`);
    else if (effect.kind === "LOWEST_ALLY_HEAL") lines.push(`対象：HP割合が最も低い味方、最大HPの${Math.round(effect.value * 100)}%回復`);
    else if (effect.kind === "LOWEST_ALLY_GAUGE") lines.push(`対象：HP割合が最も低い味方、行動ゲージを${Math.round(effect.value * 100)}%増加`);
    else if (effect.kind === "LOWEST_ALLY_CLEANSE") lines.push(`対象：HP割合が最も低い味方、弱体効果を${effect.count}個解除`);
    else if (effect.kind === "LOWEST_ALLY_SHIELD") lines.push(`対象：HP割合が最も低い味方、自身の最大HPの${Math.round(effect.value * 100)}%シールド（${effect.duration}ターン）`);
    else if (effect.kind === "LOWEST_ALLY_MITIGATE") lines.push(`対象：HP割合が最も低い味方、${effect.duration}ターン受けるダメージ-${Math.round(effect.value * 100)}%`);
    else if (effect.kind === "LOWEST_ALLY_BUFF") lines.push(`対象：HP割合が最も低い味方、${effect.duration}ターン能力上昇`);
    else if (effect.kind === "ALLY_HEAL") lines.push(`対象：味方全体、最大HPの${Math.round(effect.value * 100)}%回復`);
    else if (effect.kind === "GAUGE_DRAIN_SHARE") lines.push(`対象：自身、減らした行動ゲージの${Math.round(effect.value * 100)}%を吸収`);
    else if (effect.kind === "STEAL_BUFF") lines.push(`対象：選択した敵、強化効果を${effect.count}個奪う`);
  }
  if (candidate.hpMultiplier) lines.push(`自身の最大HP+${Math.round((candidate.hpMultiplier - 1) * 100)}%`);
  if (candidate.defMultiplier) lines.push(`自身の防御力+${Math.round((candidate.defMultiplier - 1) * 100)}%`);
  if (candidate.damageTakenMultiplier) lines.push(`自身が受けるダメージ-${Math.round((1 - candidate.damageTakenMultiplier) * 100)}%`);
  return lines.join(" / ") || candidate.description;
}

function latentChoices(props: MonsterCreateProps, candidates: (typeof LATENT_ABILITY_CANDIDATES)[string]): HTMLElement {
  const reselecting = props.target.development.latentReselectPending;
  return el("div", { className: "create-choices latent-choices" }, candidates.map((candidate) =>
    el("article", { className: "create-choice latent-choice" }, [
      el("strong", { className: "latent-choice__name" }, [candidate.name]),
      el("span", { className: "latent-choice__description" }, [candidate.description]),
      el("small", { className: "latent-choice__effect" }, [`効果: ${describeLatentEffect(candidate)}`]),
      el("button", {
        type: "button",
        className: "btn btn--primary latent-choice__select",
        disabled: candidate.id === props.target.development.latentAbilityId || (props.target.development.latentAbilityId ? (props.awakeningOrbs < LATENT_REAWAKENING_ORB_COST || props.gold < LATENT_REAWAKENING_GOLD_COST) : !reselecting && props.awakeningOrbs < 1),
        onclick: () => props.onAwaken(candidate.id),
      }, ["選択"]),
    ]),
  ));
}

/** スキル1つの札。移し替えの前後を並べて比べるために使う */
function skillCard(skill: Skill, opts: { heading: string; tone?: "from" | "to" }): HTMLElement {
  return el("div", { className: `create-skill create-skill--${opts.tone ?? "plain"}` }, [
    el("span", { className: "create-skill__heading" }, [opts.heading]),
    el("span", { className: "create-skill__name" }, [skill.name]),
    el("span", { className: "create-skill__ct" }, [skill.cooldownTurns > 0 ? `CT${skill.cooldownTurns}` : "常時"]),
    el("ul", { className: "create-skill__effects" }, skillLines(skill)),
  ]);
}

function monsterFace(instance: MonsterInstance, extraClass = ""): HTMLElement {
  const dex = findMonsterById(instance.dexId);
  return el(
    "div",
    { className: `create-face ${extraClass}`.trim(), style: dex ? `background:${dex.color}` : undefined },
    [
      withPortrait(el("span", { className: "create-face__emoji" }, [dex ? dex.emoji : "❓"]), dex, "fill"),
      el("span", { className: "create-face__foot" }, [
        el("span", { className: "create-face__star" }, [starLabel(instance.star)]),
        el("span", { className: "create-face__lv" }, [`Lv${instance.level}`]),
      ]),
    ],
  );
}

/**
 * 素材の候補。
 *
 * **選べないものも理由付きで出す。**一覧から消してしまうと、
 * 「あの子はどこへ行った」と手持ちを探し直すことになる。
 */
function renderMaterialList(props: MonsterCreateProps): HTMLElement {
  const candidates = sortMonsters(
    props.monsters.filter((m) => m.id !== props.target.id),
    props.sortKey,
    { partyIds: props.partyIds },
  );

  if (candidates.length === 0) {
    return el("p", { className: "app-subtitle" }, ["ほかにモンスターがいません。"]);
  }

  const cards = candidates.map((instance) => {
    const dex = findMonsterById(instance.dexId);
    const check = checkMonsterCreate(props.target, instance, props.partyIds, props.dungeonPartyIds);
    const selected = props.materialId === instance.id;

    return el(
      "button",
      {
        type: "button",
        className: `create-candidate${selected ? " create-candidate--on" : ""}${check.ok ? "" : " create-candidate--off"}`,
        disabled: !check.ok,
        title: check.ok ? undefined : check.reason,
        onclick: () => props.onSelectMaterial(selected ? null : instance.id),
      },
      [
        monsterFace(instance, "create-face--small"),
        el("span", { className: "create-candidate__name" }, [dex ? dex.name : instance.dexId]),
        check.ok
          ? null
          : el("span", { className: "create-candidate__why" }, [check.reason ?? "選べません"]),
      ].filter(isEl),
    );
  });

  return el("div", { className: "create-candidates" }, cards);
}

/** 移し替えの中身。どの枠が、何から何に変わるのかを並べて見せる */
function renderSwap(props: MonsterCreateProps, material: MonsterInstance): HTMLElement {
  const offers = creatableSkills(material);

  const choices = offers.map(({ slot, skill }) => {
    const current = currentSkillOf(props.target, slot);
    const same = current?.id === skill.id;
    const on = props.slot === slot;
    return el(
      "button",
      {
        type: "button",
        className: `create-choice${on ? " create-choice--on" : ""}`,
        disabled: same,
        title: same ? "同じスキルなので、移し替える意味がありません" : undefined,
        onclick: () => props.onSelectSlot(slot),
      },
      [
        el("span", { className: "create-choice__slot" }, [SLOT_LABEL[slot]]),
        el("span", { className: "create-choice__arrow" }, [current ? `${current.name} → ${skill.name}` : skill.name]),
        same ? el("span", { className: "create-choice__same" }, ["同じスキル"]) : null,
      ].filter(isEl),
    );
  });

  const chosen = props.slot !== null ? offers.find((o) => o.slot === props.slot) : undefined;
  const before = props.slot !== null ? currentSkillOf(props.target, props.slot) : undefined;

  const rows: (HTMLElement | null)[] = [
    el("h2", {}, ["どの枠を移し替えるか"]),
    el("div", { className: "create-choices" }, choices),
    chosen && before
      ? el("div", { className: "create-compare" }, [
          skillCard(before, { heading: "いま", tone: "from" }),
          el("div", { className: "create-compare__arrow" }, [icon("chevron")]),
          skillCard(chosen.skill, { heading: "移し替え後", tone: "to" }),
        ])
      : null,
  ];
  return el("section", { className: "panel create-swap" }, rows.filter(isEl));
}

export function renderMonsterCreate(props: MonsterCreateProps): HTMLElement {
  const { target } = props;
  const targetDex = findMonsterById(target.dexId);
  const material = props.materialId ? props.monsters.find((m) => m.id === props.materialId) : undefined;
  const ready = material !== undefined && props.slot !== null;
  const goldShort = props.gold < CREATE_GOLD_COST;

  const menuItems: { id: CreateMenu; label: string }[] = [
    { id: "SKILL", label: "スキル継承" }, { id: "TYPE", label: "タイプ転生" },
    { id: "ABILITY", label: "能力付与" }, { id: "LATENT", label: "潜在覚醒" },
  ];
  const shared = [
    el("header", { className: "app-header app-header--row" }, [
      el("h1", {}, ["クリエイト"]),
      el("button", { type: "button", className: "btn btn--ghost", onclick: props.onBack }, ["戻る"]),
    ]),
    el("nav", { className: "create-menu", "aria-label": "クリエイトメニュー" }, menuItems.map((item) =>
      el("button", { type: "button", className: `btn ${props.menu === item.id ? "btn--primary" : "btn--ghost"}`, onclick: () => props.onSelectMenu(item.id) }, [item.label]),
    )),
    el("section", { className: "panel create-target" }, [monsterFace(target), el("strong", {}, [targetDex ? targetDex.name : target.dexId])]),
  ];

  if (props.menu === "TYPE") {
    return el("div", { className: "screen create-screen" }, [...shared,
      el("section", { className: "panel" }, [
        el("h2", {}, ["タイプ転生"]),
        el("p", { className: "app-subtitle" }, [`現在: ${target.development.type ? MONSTER_TYPE_LABELS[target.development.type] : "未転生"} / Lv${target.level}`]),
        el("p", {}, [`★6限定・費用 ${TYPE_REINCARNATION_GOLD_COST.toLocaleString()}G。レベル・EXPは維持されます。能力ポイントはリセットされ、100ptを振り直せます。`]),
        el("div", { className: "create-menu" }, (Object.keys(MONSTER_TYPE_LABELS) as MonsterType[]).map((type) =>
          el("button", { type: "button", className: "btn btn--ghost", disabled: target.star !== 6 || target.development.type === type || props.gold < TYPE_REINCARNATION_GOLD_COST, onclick: () => props.onReincarnate(type) }, [
            `${MONSTER_TYPE_LABELS[type]}: ${MONSTER_TYPE_DESCRIPTIONS[type]}`,
          ]),
        )),
      ]), props.notice ? el("p", { className: "create-notice" }, [props.notice]) : null].filter(isEl));
  }
  if (props.menu === "ABILITY") {
    const used = usedAbilityPoints(target.development.abilityPoints);
    const budget = abilityPointBudget(target.star);
    const bonuses = abilityStatBonuses(target.development.abilityPoints);
    const confirmed = abilityPointsConfirmed(target);
    const labels: Record<AllocatableStat, string> = { hp: "最大HP", atk: "攻撃力", def: "防御力", spd: "速度" };
    return el("div", { className: "screen create-screen" }, [...shared, el("section", { className: "panel" }, ([
      el("h2", {}, ["能力付与"]),
      el("p", { className: "create-points" }, [`★${target.star}　使用 ${used} / ${budget}　残り ${budget - used}pt`]),
      budget === 0 ? el("p", { className: "create-notice" }, ["能力ポイントは★4から解放されます"]) : null,
      /*
       * **いま自由に動かせるのか、それとも確定済みなのかを先に言う。**
       * スライダーが動かない理由を、動かしてから探させない。
       */
      budget > 0
        ? el("p", { className: confirmed ? "create-notice" : "create-points" }, [
          confirmed
            ? `この配分で確定しています。変えるには ${ABILITY_POINT_RESET_COST.toLocaleString("ja-JP")}G のリセットが要ります`
            : "確定するまでは、何度でも無料で振り直せます",
        ])
        : null,
      ...((Object.keys(labels) as AllocatableStat[]).map((stat) => el("label", { className: "create-allocation" }, [
        el("span", {}, [`${labels[stat]}: ${target.development.abilityPoints[stat]}pt → +${bonuses[stat]} (1pt = +${ABILITY_POINT_VALUES[stat]})`]),
        el("input", {
          type: "range",
          min: "0",
          max: String(budget),
          disabled: budget === 0 || confirmed,
          value: String(target.development.abilityPoints[stat]),
          oninput: (event: Event) => props.onSetAbilityPoint(stat, Number((event.target as HTMLInputElement).value)),
        }, []),
      ]))),
      // 確定していない時だけ出す。1点も振っていなければ押させない
      !confirmed && budget > 0
        ? el("button", {
          type: "button",
          className: "btn btn--primary",
          disabled: used === 0,
          onclick: props.onConfirmAbilityPoints,
        }, ["この配分で確定する"])
        : null,
      confirmed && budget > 0
        ? el("button", {
          type: "button",
          className: "btn btn--ghost",
          disabled: used === 0 || props.gold < ABILITY_POINT_RESET_COST,
          onclick: props.onResetAbilityPoints,
        }, [`能力ポイントリセット ${ABILITY_POINT_RESET_COST.toLocaleString("ja-JP")} GOLD`])
        : null,
    ] as (HTMLElement | null)[]).filter(isEl))]);
  }
  if (props.menu === "LATENT") {
    const candidates = LATENT_ABILITY_CANDIDATES[target.dexId] ?? [];
    const selected = candidates.find((candidate) => candidate.id === target.development.latentAbilityId);
    const reselecting = target.development.latentReselectPending;
    const orbShortage = props.awakeningOrbs < LATENT_REAWAKENING_ORB_COST;
    const goldShortage = props.gold < LATENT_REAWAKENING_GOLD_COST;
    return el("div", { className: "screen create-screen" }, [...shared, el("section", { className: "panel" }, [
      el("h2", {}, ["潜在覚醒"]), el("p", {}, [`所持　覚醒オーブ ${props.awakeningOrbs}個 / ${props.gold.toLocaleString()}G`]),
      el("p", { className: "app-subtitle" }, ["主な入手先: 初心者ミッション / 装備ダンジョン10階 初回 / 試練の塔15階・30階 初回"]),
      reselecting ? el("div", { className: "latent-reselect" }, [
        el("p", { className: "create-notice" }, ["再覚醒済み", el("strong", {}, ["潜在能力を選び直してください"])]),
        el("p", { className: "app-subtitle" }, ["再覚醒済み・候補を選択してください（追加コストはかかりません）"]),
        latentChoices(props, candidates),
      ].filter(isEl)) : target.development.latentAbilityId ? el("div", { className: "latent-awakened" }, [
        el("div", { className: "create-notice" }, selected
          ? [el("strong", {}, [`覚醒済み: ${selected.name}`]), el("span", {}, [selected.description]), el("small", {}, [`効果: ${describeLatentEffect(selected)}`])]
          : [`覚醒済み: ${target.development.latentAbilityId}`]),
        el("div", { className: "latent-reawaken-cost" }, [
          el("strong", {}, ["必要"]),
          el("span", { className: orbShortage ? "latent-cost--short" : "" }, [`覚醒オーブ ×${LATENT_REAWAKENING_ORB_COST}（所持 ${props.awakeningOrbs}）${orbShortage ? "・不足" : ""}`]),
          el("span", { className: goldShortage ? "latent-cost--short" : "" }, [`${LATENT_REAWAKENING_GOLD_COST.toLocaleString()}G（所持 ${props.gold.toLocaleString()}G）${goldShortage ? "・不足" : ""}`]),
        ]),
        el("p", { className: "app-subtitle" }, ["新しい候補を選ぶと確認後に再覚醒します。現在能力は確定まで維持されます。"]),
        latentChoices(props, candidates),
      ]) : candidates.length === 3 ? el("div", {}, [
        el("p", { className: "create-notice" }, ["未覚醒：覚醒オーブ1個で潜在覚醒"]),
        latentChoices(props, candidates),
      ]) :
      el("p", { className: "app-subtitle" }, ["潜在能力候補は準備中です（スキル1強化・3候補を登録予定）。"]),
    ]), props.reawakenConfirmOpen ? el("div", { className: "latent-confirm-backdrop", role: "presentation" }, [
      el("section", { className: "panel latent-confirm", role: "dialog", "aria-modal": "true", "aria-labelledby": "latent-confirm-title" }, [
        el("h2", { id: "latent-confirm-title" }, ["潜在能力を再覚醒しますか？"]),
        el("p", {}, [`現在の潜在：${selected?.name ?? target.development.latentAbilityId ?? "なし"}`]),
        el("div", { className: "latent-reawaken-cost" }, [el("strong", {}, ["必要："]), el("span", {}, [`覚醒オーブ ×${LATENT_REAWAKENING_ORB_COST}`]), el("span", {}, [`${LATENT_REAWAKENING_GOLD_COST.toLocaleString()}G`])]),
        el("p", {}, ["再覚醒すると現在の潜在能力を解除し、同じ3候補から選び直します。"]),
        el("div", { className: "latent-confirm__actions" }, [
          el("button", { type: "button", className: "btn btn--ghost", onclick: props.onCancelReawaken }, ["キャンセル"]),
          el("button", { type: "button", className: "btn btn--primary", onclick: props.onConfirmReawaken }, ["再覚醒"]),
        ]),
      ]),
    ]) : null].filter(isEl));
  }

  return el("div", { className: "screen create-screen" }, [...shared,
    el("section", { className: "panel create-target create-target--skill" }, [
      monsterFace(target),
      el("div", { className: "create-target__body" }, [
        el("strong", {}, [targetDex ? targetDex.name : target.dexId]),
        el("span", { className: "create-target__note" }, [
          `星${CREATE_MATERIAL_STAR}まで育てた別のモンスターを合成すると、そのスキル2か3をこの子へ移せます。`,
        ]),
        target.createdSkill
          ? el("div", { className: "create-target__has" }, [
              el("span", { className: "create-mark" }, [icon("summon", { size: 12 }), "移し替え済み"]),
              el("button", { type: "button", className: "btn btn--ghost", onclick: props.onClear }, ["元に戻す"]),
            ])
          : null,
      ].filter(isEl)),
    ]),

    // 取り返しがつかないので、失う側を先に、はっきり書く
    el("section", { className: "panel create-cost" }, [
      el("h2", {}, ["何と引き換えるか"]),
      el("p", { className: "create-cost__warn" }, [
        `素材にしたモンスターは**消滅します**。星${CREATE_MATERIAL_STAR}であること、どちらの編成にも入っていないことが条件です。`.replace(/\*\*/g, ""),
      ]),
      el("p", { className: "create-cost__warn create-cost__warn--sub" }, [
        "移し替えを持てるのは1体につき1つだけです。別のモンスターを合成すると、前の移し替えは失われます。",
      ]),
      /*
       * **払う額を、押す前に見せる。**
       * ここが無いと、素材とスキルを選び終えて最後の一押しをした時に初めて
       * 「ゴールドが足りません」と言われる。失う側だけ先に書いて、
       * 要る側を書かないのは案内として片手落ちだった。
       */
      el("p", { className: goldShort ? "create-cost__warn create-cost__warn--sub latent-cost--short" : "create-cost__warn create-cost__warn--sub" }, [
        `費用は移し替え1回につき ${CREATE_GOLD_COST.toLocaleString("ja-JP")}G です（所持 ${props.gold.toLocaleString("ja-JP")}G）${goldShort ? "・不足" : ""}`,
      ]),
      renderMaterialList(props),
    ]),

    material ? renderSwap(props, material) : null,

    props.notice ? el("p", { className: "create-notice" }, [props.notice]) : null,

    el("div", { className: "create-actions" }, [
      el(
        "button",
        {
          type: "button",
          className: "btn btn--primary create-actions__go",
          disabled: !ready || goldShort,
          onclick: props.onConfirm,
        },
        // 足りない時は**何が足りないか**を出す。ただ灰色になるだけでは理由が分からない
        [!ready ? "素材と枠を選んでください" : goldShort ? `ゴールドが足りません（${CREATE_GOLD_COST.toLocaleString("ja-JP")}G 必要）` : "この内容でクリエイトする"],
      ),
    ]),
  ].filter(isEl));
}
