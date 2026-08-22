/**
 * ダンジョンの階層一覧。
 *
 * 3つのダンジョンはどれも、長い説明文の下に文字だけの行が縦に並んでいた。
 * 縦画面では説明だけで200px近くを使い、行はそれぞれ高さが違い、
 * 「装備ダンジョン 3 階」のように名前が途中で折れていた。
 * 同じ一覧でも、ステージ選択(章のカード)とは別のゲームのように見える。
 *
 * ここでは3つとも同じ形の札にする。**どの階が何をくれるのかを、
 * 読むのではなく見て分かる**ようにするのが目的。
 */
import { el } from "../dom.js";

export interface FloorTileSpec {
  /** 札の左上に出す短い見出し(「1F」「初級」など) */
  badge: string;
  /** 札の主題。1行で収まる長さにすること */
  title: string;
  /** 縁と帯に使う色。属性色を渡すと弱点が色で分かる */
  color?: string;
  /** 小さな札。2〜3個まで(それ以上は詰まって読めない) */
  chips: string[];
  onClick: () => void;
}

const DEFAULT_COLOR = "#7b8cf6";

function tile(spec: FloorTileSpec): HTMLElement {
  return el(
    "button",
    {
      type: "button",
      className: "floor-tile",
      style: `--fl:${spec.color ?? DEFAULT_COLOR}`,
      onclick: spec.onClick,
    },
    [
      el("span", { className: "floor-tile__badge" }, [spec.badge]),
      el("span", { className: "floor-tile__title" }, [spec.title]),
      el(
        "span",
        { className: "floor-tile__chips" },
        spec.chips.map((text) => el("span", { className: "floor-tile__chip" }, [text])),
      ),
    ],
  );
}

export function renderFloorGrid(specs: readonly FloorTileSpec[]): HTMLElement {
  return el("div", { className: "floor-grid" }, specs.map(tile));
}

/**
 * 一覧の上に置く要約。
 *
 * 説明文を段落で積むと、肝心の行き先が画面の外に出る。
 * 1行の要約と、注意を引くべきことだけを短い札にして横に並べる。
 */
export function renderDungeonIntro(summary: string, chips: readonly string[], warning?: string): HTMLElement {
  const children: (HTMLElement | null)[] = [
    el("p", { className: "dungeon-intro__summary" }, [summary]),
    chips.length > 0
      ? el(
          "div",
          { className: "dungeon-intro__chips" },
          chips.map((text) => el("span", { className: "cat-chip" }, [text])),
        )
      : null,
    warning ? el("p", { className: "dungeon-intro__warn" }, [warning]) : null,
  ];
  return el("section", { className: "panel dungeon-intro" }, children.filter((n): n is HTMLElement => n !== null));
}
