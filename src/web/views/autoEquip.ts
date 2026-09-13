import { EQUIP_SLOTS, Equipment, EquipSlot, SET_BONUS_DESCRIPTION, SET_LABEL, SET_TYPES, SetType, STAT_LABEL } from "../../core/equipment.js";
import type { MonsterInstance } from "../../core/monsterInstance.js";
import type { Stats } from "../../core/stats.js";
import { findMonsterById } from "../../data/monsters.js";
import {
  AUTO_EQUIP_SCOPE_LABEL,
  AUTO_EQUIP_SCOPE_NOTE,
  AUTO_EQUIP_STATS,
  AUTO_EQUIP_STAT_IS_PERCENT,
  AUTO_EQUIP_STAT_LABEL,
  AUTO_EQUIP_TYPES,
  AUTO_EQUIP_TYPE_LABEL,
  AutoEquipPlan,
  AutoEquipScope,
  AutoEquipSettings,
  AutoEquipStat,
  AutoEquipType,
  MAX_AUTO_EQUIP_PRIORITIES,
  isFourPieceOnlySet,
  reachableSetCounts,
} from "../../game/autoEquip.js";
import {
  EQUIPMENT_PRESET_SLOTS,
  EquipmentPreset,
  PRESET_NAME_MAX_LENGTH,
  isPresetSaved,
  presetsOf,
} from "../../game/equipmentPreset.js";
import type { PlayerState } from "../../game/playerState.js";
import { el } from "../dom.js";
import { managementHeader } from "./managementHeader.js";
import { stickyActions } from "./stickyActions.js";
import "../ui/autoEquip.css";

/**
 * おまかせ装備とプリセットの画面。
 *
 * ## なぜ浮かせないのか
 *
 * この案件では**浮遊パネルで押せないボタンを3回作っている**(CLAUDE.md)。
 * 設定・プレビュー・確認と段が深いので、浮かせると下のものを必ず覆う。
 * 専用の画面として、**画面の流れの中に置く。**
 *
 * 実行バーも例外にしなかった。最初は `stickyActions` を貼り付けていたが、
 * **画面の頭を見ている間ずっと下端に居座り、裏のプリセットの札を押せなくした**
 * (これで4回目)。いまは `position: static` に戻し、**押す順に並べている。**
 *
 * ## 画面の段
 *
 *   1. 設定 … 何を狙うか、どこから探すか、どの部位を動かさないか
 *   2. 結果 … 変更前 → 変更後を並べ、外れる相手も見せる
 *   3. 確定 … ここで初めて装備が動く
 *
 * **2まで進んでも何も変わらない。**戻れば元のまま。
 */

export interface AutoEquipPreviewRow {
  slot: EquipSlot;
  before: Equipment | undefined;
  after: Equipment | undefined;
}

export interface AutoEquipProps {
  player: PlayerState;
  monster: MonsterInstance;
  settings: AutoEquipSettings;
  /** 計算した結果。まだ計算していなければ null */
  plan: AutoEquipPlan | null;
  /** 計算できなかった理由 */
  error: string | null;
  /** 案内(保存した、適用した、など) */
  notice: string | null;
  /** 詳細設定を開いているか */
  detailOpen: boolean;
  /** 名前を編集しているプリセットの番号 */
  renamingIndex: number | null;
  onBack: () => void;
  onChangeSettings: (settings: AutoEquipSettings) => void;
  onToggleDetail: () => void;
  onSearch: () => void;
  onApply: () => void;
  onDiscardPlan: () => void;
  onSavePreset: (index: number) => void;
  onApplyPreset: (index: number) => void;
  onReoptimizePreset: (index: number) => void;
  onStartRename: (index: number | null) => void;
  onRenamePreset: (index: number, name: string) => void;
}

const STAT_DIGITS: Readonly<Record<AutoEquipStat, number>> = {
  hp: 0, atk: 0, def: 0, spd: 0, criRate: 1, criDmg: 1,
};

/** 画面に出す形。クリ率・クリダメは%へ直す */
export function formatStat(key: AutoEquipStat, value: number): string {
  if (AUTO_EQUIP_STAT_IS_PERCENT[key]) return `${(value * 100).toFixed(STAT_DIGITS[key])}%`;
  return Math.round(value).toLocaleString("ja-JP");
}

/** 増減の書き方。**どちらへ動いたかが色だけに頼らない**ように符号を付ける */
export function formatDelta(key: AutoEquipStat, before: number, after: number): string {
  const diff = after - before;
  if (Math.abs(diff) < (AUTO_EQUIP_STAT_IS_PERCENT[key] ? 0.0005 : 0.5)) return "±0";
  const sign = diff > 0 ? "+" : "-";
  return `${sign}${formatStat(key, Math.abs(diff))}`;
}

function deltaClass(before: number, after: number): string {
  if (after > before) return " is-up";
  if (after < before) return " is-down";
  return "";
}

function equipmentLabel(equipment: Equipment | undefined): string {
  if (!equipment) return "なし";
  return `${SET_LABEL[equipment.set]} ${STAT_LABEL[equipment.mainStat.type]} +${equipment.level}`;
}

/* ------------------------------------------------------------------ *
 * 設定
 * ------------------------------------------------------------------ */

function renderTypeChips(props: AutoEquipProps): HTMLElement {
  return el("div", { className: "ae-chips" }, AUTO_EQUIP_TYPES.map((type) =>
    el("button", {
      type: "button",
      className: `ae-chip${props.settings.type === type ? " is-active" : ""}`,
      onclick: () => props.onChangeSettings({ ...props.settings, type }),
    }, [AUTO_EQUIP_TYPE_LABEL[type as AutoEquipType]]),
  ));
}

/**
 * 優先順位。**押した順に第1・第2・第3**になる。
 *
 * 番号を別に選ばせる形だと、指を3回動かすことになる。
 * ここは押した順をそのまま順位にして、もう一度押すと外す。
 */
function renderPriorities(props: AutoEquipProps): HTMLElement {
  const { priorities } = props.settings;
  return el("div", { className: "ae-field" }, [
    el("div", { className: "ae-field__label" }, [
      "優先する順番",
      el("span", { className: "ae-field__hint" }, [`押した順に第1〜第${MAX_AUTO_EQUIP_PRIORITIES}優先（もう一度押すと外す）`]),
    ]),
    el("div", { className: "ae-chips" }, AUTO_EQUIP_STATS.map((stat) => {
      const rank = priorities.indexOf(stat);
      const picked = rank >= 0;
      return el("button", {
        type: "button",
        className: `ae-chip${picked ? " is-active" : ""}`,
        disabled: !picked && priorities.length >= MAX_AUTO_EQUIP_PRIORITIES,
        onclick: () => {
          const next = picked
            ? priorities.filter((s) => s !== stat)
            : [...priorities, stat].slice(0, MAX_AUTO_EQUIP_PRIORITIES);
          props.onChangeSettings({ ...props.settings, priorities: next });
        },
      }, [
        picked ? el("span", { className: "ae-chip__rank" }, [`${rank + 1}`]) : null,
        AUTO_EQUIP_STAT_LABEL[stat],
      ].filter((n): n is HTMLElement | string => n !== null));
    })),
  ]);
}

/**
 * 最低条件。
 *
 * **数字を打つ欄は潰さない。**狭い端末で欄が細くなると、
 * 3桁の速度すら見えなくなる。1行に1項目、名前は左・欄は右の形にする。
 */
function renderMinimums(props: AutoEquipProps): HTMLElement {
  return el("div", { className: "ae-field" }, [
    el("div", { className: "ae-field__label" }, [
      "最低条件",
      el("span", { className: "ae-field__hint" }, ["空けると条件なし。満たす構成が無ければ何も変えません"]),
    ]),
    el("div", { className: "ae-minimums" }, AUTO_EQUIP_STATS.map((stat) => {
      const raw = props.settings.minimums[stat];
      const shown = raw === undefined ? "" : AUTO_EQUIP_STAT_IS_PERCENT[stat] ? String(Math.round(raw * 1000) / 10) : String(Math.round(raw));
      const input = el("input", {
        type: "number",
        className: "ae-minimums__input",
        inputMode: "decimal",
        min: "0",
        placeholder: "—",
        value: shown,
        ariaLabel: `${AUTO_EQUIP_STAT_LABEL[stat]}の最低条件`,
      }) as HTMLInputElement;
      input.onchange = () => {
        const next = { ...props.settings.minimums };
        const value = Number(input.value);
        if (!input.value.trim() || !Number.isFinite(value) || value <= 0) delete next[stat];
        else next[stat] = AUTO_EQUIP_STAT_IS_PERCENT[stat] ? value / 100 : value;
        props.onChangeSettings({ ...props.settings, minimums: next });
      };
      return el("label", { className: "ae-minimums__row" }, [
        el("span", { className: "ae-minimums__name" }, [AUTO_EQUIP_STAT_LABEL[stat]]),
        input,
        el("span", { className: "ae-minimums__unit" }, [AUTO_EQUIP_STAT_IS_PERCENT[stat] ? "%" : "以上"]),
      ]);
    })),
  ]);
}

function renderScope(props: AutoEquipProps): HTMLElement {
  const scopes: AutoEquipScope[] = ["UNEQUIPPED", "OWN_AND_UNEQUIPPED", "ALL"];
  return el("div", { className: "ae-field" }, [
    el("div", { className: "ae-field__label" }, ["装備を探す範囲"]),
    el("div", { className: "ae-chips" }, scopes.map((scope) =>
      el("button", {
        type: "button",
        className: `ae-chip${props.settings.scope === scope ? " is-active" : ""}`,
        onclick: () => props.onChangeSettings({ ...props.settings, scope }),
      }, [AUTO_EQUIP_SCOPE_LABEL[scope]]),
    )),
    el("p", { className: "ae-note" }, [AUTO_EQUIP_SCOPE_NOTE[props.settings.scope]]),
  ]);
}

/**
 * 固定する部位。
 *
 * **売却防止の鍵とは別物。**あちらは「手放したくない」、こちらは
 * 「おまかせで動かしたくない」。同じ意味にすると、鍵をかけた強い装備が
 * おまかせに一切出てこなくなる。
 */
function renderFixedSlots(props: AutoEquipProps): HTMLElement {
  const byId = new Map(props.player.equipment.map((e) => [e.id, e] as const));
  return el("div", { className: "ae-field" }, [
    el("div", { className: "ae-field__label" }, [
      "動かさない部位",
      el("span", { className: "ae-field__hint" }, ["選んだ部位は、いまの装備のままにします"]),
    ]),
    el("div", { className: "ae-slots" }, EQUIP_SLOTS.map((slot) => {
      const fixed = props.settings.fixedSlots.includes(slot);
      const worn = byId.get(props.monster.equipment[slot] ?? "");
      return el("button", {
        type: "button",
        className: `ae-slot${fixed ? " is-fixed" : ""}`,
        "aria-pressed": String(fixed),
        onclick: () => {
          const next = fixed
            ? props.settings.fixedSlots.filter((s) => s !== slot)
            : [...props.settings.fixedSlots, slot];
          props.onChangeSettings({ ...props.settings, fixedSlots: next });
        },
      }, [
        el("span", { className: "ae-slot__no" }, [`S${slot}`]),
        el("span", { className: "ae-slot__item" }, [worn ? SET_LABEL[worn.set] : "空き"]),
        el("span", { className: "ae-slot__pin" }, [fixed ? "固定中" : "自由"]),
      ]);
    })),
  ]);
}

/**
 * そろえるシリーズ。
 *
 * ## なぜ「狙い」と別に要るのか
 *
 * おまかせはステータスの数字で比べる。だが**セット効果の半分は数字に出ない。**
 * 暴走の追加ターンも、崩壊の防御無視も、加護のシールドも、
 * 効くのは戦闘中の挙動(`CombatModifiers`)だけで、HPにも攻撃にも1も乗らない。
 * つまり**放っておくと、この5つは永遠に選ばれない。**
 *
 * 「揃うほど加点」という重みにしなかったのは、
 * **追加ターン15%が攻撃何ポイントぶんか、決める根拠が無い**から。
 * 点数を捏造する代わりに、人が名指しして縛る。
 *
 * ## 押せないものは押させない
 *
 * 持っていないシリーズ、枠が足りないシリーズ、
 * 2個では何も起きないシリーズ——どれも押せた瞬間に
 * 「見つかりません」を出すだけの札になる。**先に塞ぐ。**
 */
function renderWantedSets(props: AutoEquipProps): HTMLElement {
  const wanted = props.settings.wantedSets ?? {};
  /*
   * **所持数ではなく「置ける枠の数」を出す。**
   * 素朴に所持数を数えていた時、探す範囲が「今の装備＋未装備」でも
   * 他の子が着けているぶんまで数えて「所持35」と出ていた。
   * 押せるのに必ず「そろえられません」と断られる札になっていた。
   */
  const owned = reachableSetCounts(props.player, props.monster, props.settings);
  const total = SET_TYPES.reduce((sum, type) => sum + (wanted[type] ?? 0), 0);
  const room = EQUIP_SLOTS.length - total;

  const nodes: (HTMLElement | null)[] = [
    el("div", { className: "ae-field__label" }, [
      "そろえるシリーズ",
      el("span", { className: "ae-field__hint" }, [
        "押すと 4セット → 2セット → 指定なし と変わります。"
        + "数字は、いまの探す範囲でそのシリーズを置ける枠の数です。"
        + "暴走・崩壊・祝福・加護・免疫の効果はステータスに出ないので、"
        + "ここで指定しないと選ばれません",
      ]),
    ]),
    el("div", { className: "ae-sets" }, SET_TYPES.map((type) => {
      const count = wanted[type];
      const have = owned.get(type) ?? 0;
      const fourOnly = isFourPieceOnlySet(type);
      // いま選んでいるぶんを戻したうえで、どれだけ枠が空くか
      const roomForNext = room + (count ?? 0);
      const canTake = (n: 2 | 4): boolean => have >= n && roomForNext >= n;
      /*
       * **「4は無理でも2なら入る」を塞がない。**
       * ここを `4 が入らないなら押せない` にしていたら、
       * 暴走4セットを選んだ後、残り2枠あるのに会心が押せなくなった。
       * 押せる条件は「いちばん小さい指定が入るか」で見る
       * (暴走・崩壊・祝福は2個では何も起きないので、最小が4)。
       */
      const smallest: 2 | 4 = fourOnly ? 4 : 2;
      const disabled = count === undefined && !canTake(smallest);
      return el("button", {
        type: "button",
        className: `ae-set${count ? " is-active" : ""}`,
        disabled,
        "aria-pressed": String(Boolean(count)),
        /*
         * **押せない理由を、押せない札自身に持たせる。**
         * 理由は2つある(置ける枠が足りない / 他の指定で枠を使い切った)。
         * 祝福を6枠持っていても、暴走4を選んだ後は残り2枠で押せない。
         * 「6枠あるのに押せない」だけ見せると、壊れているようにしか見えない。
         */
        title: disabled
          ? have < smallest
            ? `いまの探す範囲では、${SET_LABEL[type]}を${have}枠にしか置けません(${smallest}枠から効きます)`
            : `残りが${roomForNext}枠しかありません(${SET_LABEL[type]}は${smallest}枠から効きます)`
          : SET_BONUS_DESCRIPTION[type].four,
        onclick: () => {
          const nextWanted = { ...wanted };
          /*
           * 4セット → 2セット → 指定なし と回す。
           * 未選択から押した時は、**入るなら4から**(そちらが強い)。
           */
          let value: 2 | 4 | undefined;
          if (count === 4) value = fourOnly ? undefined : 2;
          else if (count === 2) value = undefined;
          else value = canTake(4) ? 4 : fourOnly ? undefined : 2;
          if (value === 2 && !canTake(2)) value = undefined;
          if (value === undefined) delete nextWanted[type];
          else nextWanted[type] = value;
          props.onChangeSettings({ ...props.settings, wantedSets: nextWanted });
        },
      }, [
        el("span", { className: "ae-set__name" }, [SET_LABEL[type]]),
        el("span", { className: "ae-set__count" }, [count ? `${count}セット` : have > 0 ? `${have}枠` : "なし"]),
      ]);
    })),
    total > 0
      ? el("p", { className: "ae-note" }, [
        `6枠のうち ${total} 枠をシリーズで埋めます。`
        + (total >= EQUIP_SLOTS.length ? "残りの枠はありません。" : `残り ${EQUIP_SLOTS.length - total} 枠は自由に選びます。`)
        + "シリーズを縛るぶん、ステータスは下がることがあります",
      ])
      : null,
  ];
  return el("div", { className: "ae-field" }, nodes.filter((n): n is HTMLElement => n !== null));
}

/* ------------------------------------------------------------------ *
 * 結果
 * ------------------------------------------------------------------ */

/** 変更前 → 変更後。**押す前に見せる**のがこの画面の肝 */
function renderPreview(props: AutoEquipProps, plan: AutoEquipPlan): HTMLElement {
  const byId = new Map(props.player.equipment.map((e) => [e.id, e] as const));
  const rows: AutoEquipPreviewRow[] = EQUIP_SLOTS.map((slot) => ({
    slot,
    before: byId.get(props.monster.equipment[slot] ?? ""),
    after: byId.get(plan.assignment[slot] ?? ""),
  }));
  const changed = rows.filter((row) => row.before?.id !== row.after?.id);

  return el("section", { className: "panel ae-preview" }, [
    el("div", { className: "panel-header" }, [el("h2", {}, ["この装備に変えると"])]),

    el("div", { className: "ae-stats" }, AUTO_EQUIP_STATS.map((stat) => {
      const before = plan.before[stat as keyof Stats] as number;
      const after = plan.after[stat as keyof Stats] as number;
      return el("div", { className: `ae-stats__row${deltaClass(before, after)}` }, [
        el("span", { className: "ae-stats__name" }, [AUTO_EQUIP_STAT_LABEL[stat]]),
        el("span", { className: "ae-stats__before" }, [formatStat(stat, before)]),
        el("span", { className: "ae-stats__arrow" }, ["→"]),
        el("span", { className: "ae-stats__after" }, [formatStat(stat, after)]),
        el("span", { className: "ae-stats__delta" }, [formatDelta(stat, before, after)]),
      ]);
    })),

    (changed.length === 0
      ? el("p", { className: "ae-note" }, ["いまの装備がすでに最良でした。変えるところはありません。"])
      : el("div", { className: "ae-slotdiff" }, changed.map((row) =>
        el("div", { className: "ae-slotdiff__row" }, [
          el("span", { className: "ae-slotdiff__no" }, [`S${row.slot}`]),
          el("span", { className: "ae-slotdiff__before" }, [equipmentLabel(row.before)]),
          el("span", { className: "ae-slotdiff__arrow" }, ["→"]),
          el("span", { className: "ae-slotdiff__after" }, [equipmentLabel(row.after)]),
        ]),
      ))) as HTMLElement,

    /*
     * **他の子から外す時は、必ず名前を出す。**
     * 誰の何が外れるか分からないまま確定させない。
     */
    plan.stolen.length > 0
      ? el("div", { className: "ae-warning", role: "alert" }, [
        el("div", { className: "ae-warning__title" }, ["ほかの子が着けている装備を使います"]),
        el("ul", { className: "ae-warning__list" }, plan.stolen.map((entry) => {
          const item = byId.get(entry.equipmentId);
          return el("li", {}, [`${entry.monsterName}：${equipmentLabel(item)}（S${entry.slot}）`]);
        })),
      ])
      : null,
  ].filter((n): n is HTMLElement => n !== null));
}

/* ------------------------------------------------------------------ *
 * プリセット
 * ------------------------------------------------------------------ */

function presetSummary(preset: EquipmentPreset): string {
  if (!isPresetSaved(preset)) return "未保存";
  const count = Object.values(preset.assignment).filter(Boolean).length;
  const type = AUTO_EQUIP_TYPE_LABEL[preset.settings.type];
  return `装備${count}個・${type}`;
}

function renderPresets(props: AutoEquipProps): HTMLElement {
  const presets = presetsOf(props.monster);
  return el("section", { className: "panel ae-presets" }, [
    el("div", { className: "panel-header" }, [el("h2", {}, ["プリセット"])]),
    el("p", { className: "ae-note" }, [
      "いまの装備とおまかせの条件を、3つまで覚えておけます。"
      + "呼び出す時に「この装備に戻す」と「今の持ち物で組み直す」を選べます。",
    ]),
    ...presets.map((preset, index) => {
      const saved = isPresetSaved(preset);
      const renaming = props.renamingIndex === index;
      return el("div", { className: `ae-preset${saved ? " is-saved" : ""}` }, [
        el("div", { className: "ae-preset__head" }, [
          renaming
            ? (() => {
              const input = el("input", {
                type: "text",
                className: "ae-preset__rename",
                value: preset.name,
                maxLength: PRESET_NAME_MAX_LENGTH,
                ariaLabel: "プリセットの名前",
              }) as HTMLInputElement;
              input.onchange = () => props.onRenamePreset(index, input.value);
              input.onblur = () => props.onRenamePreset(index, input.value);
              return input;
            })()
            : el("button", {
              type: "button",
              className: "ae-preset__name",
              onclick: () => props.onStartRename(index),
              title: "名前を変える",
            }, [preset.name, el("span", { className: "ae-preset__pencil" }, ["✎"])]),
          el("span", { className: "ae-preset__summary" }, [presetSummary(preset)]),
        ]),
        el("div", { className: "ae-preset__actions" }, [
          el("button", {
            type: "button", className: "btn btn--ghost ae-preset__btn",
            onclick: () => props.onSavePreset(index),
          }, ["いまの装備を保存"]),
          el("button", {
            type: "button", className: "btn btn--ghost ae-preset__btn",
            disabled: !saved,
            onclick: () => props.onApplyPreset(index),
          }, ["この装備に戻す"]),
          el("button", {
            type: "button", className: "btn btn--ghost ae-preset__btn",
            disabled: !saved,
            onclick: () => props.onReoptimizePreset(index),
          }, ["今の持ち物で組み直す"]),
        ]),
      ]);
    }),
  ]);
}

/* ------------------------------------------------------------------ *
 * 画面
 * ------------------------------------------------------------------ */

export function renderAutoEquip(props: AutoEquipProps): HTMLElement {
  const dex = findMonsterById(props.monster.dexId);
  const isCustom = props.settings.type === "custom";
  const plan = props.plan;

  const settingsPanel = el("section", { className: "panel ae-settings" }, [
    el("div", { className: "panel-header" }, [el("h2", {}, ["何を狙うか"])]),
    renderTypeChips(props),
    isCustom ? renderPriorities(props) : null,

    /*
     * **設定を1画面に全部出さない。**項目が多いので、
     * まず「何を狙うか」だけを見せて、細かい条件は開いた人にだけ出す。
     */
    el("button", {
      type: "button",
      className: `ae-disclosure${props.detailOpen ? " is-open" : ""}`,
      "aria-expanded": String(props.detailOpen),
      onclick: props.onToggleDetail,
    }, [
      el("span", {}, ["詳しい条件"]),
      el("span", { className: "ae-disclosure__mark" }, [props.detailOpen ? "▲" : "▼"]),
    ]),
    props.detailOpen
      ? el("div", { className: "ae-detail" }, [
        isCustom ? renderMinimums(props) : null,
        renderWantedSets(props),
        renderScope(props),
        renderFixedSlots(props),
      ].filter((n): n is HTMLElement => n !== null))
      : null,
  ].filter((n): n is HTMLElement => n !== null));

  const searchButton = el("button", {
    type: "button",
    className: "btn btn--primary btn--large ae-run",
    onclick: props.onSearch,
  }, [plan ? "条件を変えて探し直す" : "この条件で探す"]);

  return el("div", { className: "screen auto-equip-screen" }, [
    managementHeader("おまかせ装備", props.onBack, dex ? dex.name : props.monster.dexId),

    props.notice
      ? el("p", { className: "shop-notice", role: "status" }, [props.notice])
      : el("span", { className: "shop-notice--none" }),

    /*
     * 断った理由は**結果の場所に出す。**設定の中に埋めると、
     * 探したのに何も起きていないように見える。
     */
    props.error
      ? el("div", { className: "ae-error", role: "alert" }, [
        el("strong", {}, [props.error]),
        el("span", {}, ["条件を緩めるか、装備を増やしてからもう一度お試しください。装備は変えていません。"]),
      ])
      : null,

    settingsPanel,

    /*
     * 実行バーは**貼り付けない**(`.auto-equip-screen` で `position: static` に戻す)。
     *
     * 貼り付けていた時、画面の頭を見ている間バーはずっと下端に居座り、
     * その裏のプリセットの札が押せなくなっていた
     * (巡回が「いまの装備を保存の手前に ae-run」で拾った。
     * この案件で**浮かせた部品が下を覆う事故は4回目**)。
     *
     * 代わりに**押す順に並べる。**設定のすぐ下に「探す」、
     * 結果を見た下に「この装備に変更」。どちらも覆わない。
     */
    plan ? null : stickyActions({ status: null, primary: searchButton }),

    plan ? renderPreview(props, plan) : null,
    plan
      ? stickyActions({
        // 探した時だけ通り数を出す。プリセットを読んだ時は 0 が入っている
        status: plan.evaluated > 0
          ? `${plan.evaluated.toLocaleString("ja-JP")} 通りを比べました`
          : "保存した装備を読み込みました",
        primary: el("div", { className: "ae-confirm" }, [
          el("button", { type: "button", className: "btn btn--ghost ae-confirm__cancel", onclick: props.onDiscardPlan }, ["やめる"]),
          el("button", { type: "button", className: "btn btn--primary btn--large ae-confirm__go", onclick: props.onApply }, ["この装備に変更"]),
        ]),
      })
      : null,
    plan ? el("div", { className: "ae-research" }, [searchButton]) : null,

    renderPresets(props),
  ].filter((n): n is HTMLElement => n !== null));
}
