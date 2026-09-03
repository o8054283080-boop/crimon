/**
 * 相手(または自分の防衛)の1体を、**そのまま真似できるところまで**開く画面部品。
 *
 * 依頼で重い項目。「上位の相手を育成のお手本にできること」が目的なので、
 * Lv / ★ / ステータス / 装備6枠(シリーズ・レア・強化値・メインOP・サブOP)/
 * 能力ポイント / 潜在覚醒 を、削らずに出す。
 *
 * ## 浮かせない
 *
 * 4体ぶんを一度に開くと縦に長くなりすぎるので、**上の並びで1体を選び、
 * その下に中身を出す**形にした。重ねた小窓にしなかったのは、この案件で
 * `position:fixed` / `absolute` の札が下のボタンを覆う事故を3回出しているため。
 * 選ぶ並びも中身も、どちらも画面の流れの中にある。
 */
import { el } from "../../dom.js";
import { ArenaUnitSnapshot } from "../../../game/arena/types.js";
import { ArenaUnitDetailView, arenaUnitDetailView } from "./model.js";

function nodes(items: (HTMLElement | null)[]): HTMLElement[] {
  return items.filter((node): node is HTMLElement => node !== null);
}

/** 1体を選ぶ並び。★とLvまで出すのは、押す前に見分けが付くようにするため */
function renderPicker(
  views: ArenaUnitDetailView[],
  selected: number,
  onSelect: (index: number) => void,
): HTMLElement {
  return el(
    "div",
    { className: "ar-picker", role: "tablist" },
    views.map((view, index) =>
      el(
        "button",
        {
          type: "button",
          className: `ar-picker__item${index === selected ? " is-on" : ""}`,
          style: `--elem:${view.color}`,
          onclick: () => onSelect(index),
          ariaPressed: index === selected ? "true" : "false",
        },
        [
          el("span", { className: "ar-picker__face" }, [view.emoji]),
          el("span", { className: "ar-picker__name" }, [view.name]),
          el("span", { className: "ar-picker__grade" }, [`★${view.star} Lv${view.level}`]),
        ],
      ),
    ),
  );
}

function renderStats(view: ArenaUnitDetailView): HTMLElement | null {
  if (view.stats.length === 0) return null;
  return el("div", { className: "ar-block" }, [
    el("h3", { className: "ar-block__title" }, ["ステータス（装備込み）"]),
    el(
      "div",
      { className: "ar-stats" },
      view.stats.map((line) =>
        el("div", { className: "ar-stats__row" }, [
          el("span", { className: "ar-stats__label" }, [line.label]),
          el("span", { className: "ar-stats__value" }, [line.value]),
        ]),
      ),
    ),
  ]);
}

function renderEquipment(view: ArenaUnitDetailView): HTMLElement {
  if (view.equipment.length === 0) {
    return el("div", { className: "ar-block" }, [
      el("h3", { className: "ar-block__title" }, ["装備"]),
      el("p", { className: "ar-empty" }, ["装備なし"]),
    ]);
  }
  return el("div", { className: "ar-block" }, [
    el("h3", { className: "ar-block__title" }, [`装備（${view.equippedCount} / 6）`]),
    el(
      "div",
      { className: "ar-gears" },
      view.equipment.map((item) =>
        el("div", { className: "ar-gear" }, [
          el("div", { className: "ar-gear__head" }, [
            el("span", { className: "ar-gear__slot" }, [item.slotLabel]),
            el("span", { className: "ar-gear__set" }, [`${item.setLabel}シリーズ`]),
            el("span", { className: "ar-gear__star" }, [`★${item.star}`]),
            el("span", { className: "ar-gear__level" }, [`+${item.level}`]),
          ]),
          el("div", { className: "ar-gear__main" }, [item.mainText]),
          el(
            "div",
            { className: "ar-gear__subs" },
            item.subTexts.length > 0
              ? item.subTexts.map((text) => el("span", { className: "ar-gear__sub" }, [text]))
              : [el("span", { className: "ar-gear__sub ar-gear__sub--none" }, ["サブOPなし"])],
          ),
        ]),
      ),
    ),
  ]);
}

function renderDevelopment(view: ArenaUnitDetailView): HTMLElement {
  const rows: (HTMLElement | null)[] = [
    el("h3", { className: "ar-block__title" }, ["育成"]),
    el("div", { className: "ar-facts" }, [
      el("span", { className: "ar-fact" }, [`${view.elementLabel}属性`]),
      el("span", { className: "ar-fact" }, [`★${view.star} Lv${view.level} / ${view.maxLevel}`]),
      view.typeLabel ? el("span", { className: "ar-fact" }, [`${view.typeLabel}タイプ`]) : null,
      view.skillLevels.length > 0
        ? el("span", { className: "ar-fact" }, [`スキルLv ${view.skillLevels.join(" / ")}`])
        : null,
    ].filter((node): node is HTMLElement => node !== null)),
    // 能力ポイントは星4から。上限0の個体に「0 / 0」と出しても読む意味が無い
    view.abilityPointBudget > 0
      ? el("div", { className: "ar-points" }, [
          el("span", { className: "ar-points__label" }, [
            `能力ポイント ${view.abilityPointUsed} / ${view.abilityPointBudget}`,
          ]),
          el(
            "span",
            { className: "ar-points__list" },
            view.abilityPoints.map((point) =>
              el("span", { className: "ar-points__item" }, [`${point.label} ${point.value}`]),
            ),
          ),
        ])
      : null,
    view.latent
      ? el("div", { className: "ar-latent" }, [
          el("span", { className: "ar-latent__name" }, [`潜在覚醒：${view.latent.name}`]),
          el("span", { className: "ar-latent__desc" }, [view.latent.description]),
        ])
      : el("p", { className: "ar-empty" }, ["潜在覚醒なし"]),
  ];
  return el("div", { className: "ar-block" }, nodes(rows));
}

/** 1体ぶんの中身。**「見えない項目」を作らない** */
export function renderArenaUnitDetail(view: ArenaUnitDetailView): HTMLElement {
  if (view.missing) {
    return el("section", { className: "panel ar-unit" }, [
      el("p", { className: "ar-empty" }, ["この個体は図鑑から引けませんでした（データが更新されています）"]),
    ]);
  }
  return el("section", { className: "panel ar-unit", style: `--elem:${view.color}` }, nodes([
    el("div", { className: "ar-unit__head" }, [
      el("span", { className: "ar-unit__face" }, [view.emoji]),
      el("div", { className: "ar-unit__ident" }, [
        el("span", { className: "ar-unit__name" }, [view.name]),
        el("span", { className: "ar-unit__grade" }, [`★${view.star} Lv${view.level}`]),
      ]),
    ]),
    renderDevelopment(view),
    renderStats(view),
    renderEquipment(view),
  ]));
}

/**
 * 顔ぶれ全部を検分できる部品。1体を選ぶ並び + 選んだ1体の中身。
 *
 * 実プレイヤーの防衛もNPCも `ArenaUnitSnapshot` で同じ形なので、
 * **同じ部品で見せる**。どちらであるかで見せ方を変えないことが、
 * 「NPCだけ中身が薄い」を作らない一番簡単な方法になる。
 */
export function renderArenaUnitInspector(
  units: readonly ArenaUnitSnapshot[],
  selectedIndex: number,
  onSelect: (index: number) => void,
): HTMLElement {
  if (units.length === 0) {
    return el("section", { className: "panel" }, [el("p", { className: "ar-empty" }, ["編成が空です"])]);
  }
  const views = units.map(arenaUnitDetailView);
  const index = Math.max(0, Math.min(views.length - 1, selectedIndex));
  return el("div", { className: "ar-inspector" }, [
    renderPicker(views, index, onSelect),
    renderArenaUnitDetail(views[index]),
  ]);
}
