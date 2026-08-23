import { MonsterInstance, starLabel } from "../../core/monsterInstance.js";
import { Skill, describeSkillEffect } from "../../core/skill.js";
import { findMonsterById } from "../../data/monsters.js";
import {
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
}

const SLOT_LABEL: Record<CreateSlot, string> = { 1: "スキル2", 2: "スキル3" };

function isEl(node: HTMLElement | null): node is HTMLElement {
  return node !== null;
}

function skillLines(skill: Skill): HTMLElement[] {
  return skill.effects.map((effect) => el("li", {}, [describeSkillEffect(effect)]));
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

  return el("div", { className: "screen create-screen" }, [
    el("header", { className: "app-header app-header--row" }, [
      el("h1", {}, ["クリエイト"]),
      el("button", { type: "button", className: "btn btn--ghost", onclick: props.onBack }, ["戻る"]),
    ]),

    el("section", { className: "panel create-target" }, [
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
          disabled: !ready,
          onclick: props.onConfirm,
        },
        [ready ? "この内容でクリエイトする" : "素材と枠を選んでください"],
      ),
    ]),
  ].filter(isEl));
}
