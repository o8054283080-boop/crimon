/**
 * 画面で使うアイコン。
 *
 * それまでは絵文字をそのまま置いていた。絵文字は**端末ごとに絵柄が変わり、
 * 線の太さも大きさも揃わない**。並べた瞬間に「間に合わせ」に見えるし、
 * 「♡装備」のように意味の合わないものが混ざっても気付けない。
 *
 * ここでは全部を同じ規則で描く:
 *
 * - 24×24 の枠に収める
 * - 線幅は 1.75、角と端は丸める
 * - 色は `currentColor`。置いた場所の文字色にそのまま従う
 * - 塗りは使わない(意図して面で見せるものだけ `fill` を書く)
 *
 * この4つが揃っているだけで、並べたときに1つの道具立てに見える。
 */

const NS = "http://www.w3.org/2000/svg";

export type IconName =
  | "adventure"
  | "summon"
  | "party"
  | "equipDungeon"
  | "trainDungeon"
  | "goldDungeon"
  | "settings"
  | "home"
  | "monsters"
  | "equipment"
  | "shop"
  | "map"
  | "crystal"
  | "coin"
  | "stamina"
  | "pencil"
  | "scroll"
  | "info"
  | "chevron";

/**
 * 線で描くもの。`d` は 24×24 の枠に収めた経路。
 * ここに足すときは、必ず既存の線幅・余白と見比べること。
 * 1つだけ太かったり枠いっぱいだったりすると、その1つが浮く。
 */
const STROKE_PATHS: Record<IconName, string[]> = {
  // 交差した剣。冒険へ出る合図
  adventure: ["M12 21 A9 9 0 1 1 12 3 A9 9 0 1 1 12 21", "M15.6 8.4 L10.2 10.2 L8.4 15.6 L13.8 13.8 Z"],
  // 四方に伸びる光。召喚
  summon: ["M10.5 2.5 L12.4 8.6 L18.5 10.5 L12.4 12.4 L10.5 18.5 L8.6 12.4 L2.5 10.5 L8.6 8.6 Z", "M18 14.5 L18.8 16.7 L21 17.5 L18.8 18.3 L18 20.5 L17.2 18.3 L15 17.5 L17.2 16.7 Z"],
  // 三人並び。編成
  party: ["M8 10.5 A2.5 2.5 0 1 1 8 5.5 A2.5 2.5 0 1 1 8 10.5", "M3.5 19 C3.5 15.5 5.5 13.5 8 13.5 C10.5 13.5 12.5 15.5 12.5 19", "M16 10 A2 2 0 1 1 16 6 A2 2 0 1 1 16 10", "M14 13.6 C15 13.2 15.6 13 16.4 13 C18.6 13 20.5 14.8 20.5 18"],
  // 盾に縦線。装備を掘る場所
  equipDungeon: ["M12 3.2 L19.5 6 V12.2 C19.5 16.5 16.3 19.7 12 20.8 C7.7 19.7 4.5 16.5 4.5 12.2 V6 Z", "M8.6 10.6 L12 14 L15.4 10.6"],
  // 右肩上がりの階段。育てる場所
  trainDungeon: ["M6.5 13 L12 7.5 L17.5 13", "M6.5 18.5 L12 13 L17.5 18.5"],
  // 積み上げた貨幣
  goldDungeon: ["M12 8.5 C15.9 8.5 19 7.4 19 6 C19 4.6 15.9 3.5 12 3.5 C8.1 3.5 5 4.6 5 6 C5 7.4 8.1 8.5 12 8.5 Z", "M5 6 V11 C5 12.4 8.1 13.5 12 13.5 C15.9 13.5 19 12.4 19 11 V6", "M5 11 V16 C5 17.4 8.1 18.5 12 18.5 C15.9 18.5 19 17.4 19 16 V11"],
  // 歯車
  settings: ["M4 6.5 H20", "M4 12 H20", "M4 17.5 H20", "M9.5 8.4 A1.9 1.9 0 1 1 9.5 4.6 A1.9 1.9 0 1 1 9.5 8.4", "M15 13.9 A1.9 1.9 0 1 1 15 10.1 A1.9 1.9 0 1 1 15 13.9", "M7.5 19.4 A1.9 1.9 0 1 1 7.5 15.6 A1.9 1.9 0 1 1 7.5 19.4"],
  // 家
  home: ["M4 11 L12 4 L20 11", "M6 10 V19.5 H18 V10", "M10 19.5 V14.5 H14 V19.5"],
  // 開いた図鑑
  monsters: ["M12 6.5 C10.5 5 8.5 4.5 4.5 4.5 V18 C8.5 18 10.5 18.6 12 20", "M12 6.5 C13.5 5 15.5 4.5 19.5 4.5 V18 C15.5 18 13.5 18.6 12 20", "M12 6.5 V20"],
  // 剣
  equipment: ["M12 2.5 L14.2 6.5 V13.5 H9.8 V6.5 Z", "M6.5 13.5 H17.5", "M12 13.5 V18.5", "M10 18.5 H14"],
  // 買い物かご
  shop: ["M4 6 H6.5 L8.5 15.5 H18 L20 8.5 H7", "M9.5 19.5 A1.2 1.2 0 1 1 9.5 17.1 A1.2 1.2 0 1 1 9.5 19.5", "M17 19.5 A1.2 1.2 0 1 1 17 17.1 A1.2 1.2 0 1 1 17 19.5"],
  // 折りたたんだ地図
  map: ["M3.5 6.5 L9 4.5 L15 6.8 L20.5 4.8 V17.5 L15 19.5 L9 17.2 L3.5 19.2 Z", "M9 4.5 V17.2", "M15 6.8 V19.5"],
  // 宝石
  crystal: ["M12 3 L18.5 9 L12 21 L5.5 9 Z", "M5.5 9 H18.5", "M12 3 L9.4 9", "M12 3 L14.6 9"],
  // 硬貨
  coin: ["M12 20 A8 8 0 1 1 12 4 A8 8 0 1 1 12 20", "M12 16.5 A4.5 4.5 0 1 1 12 7.5 A4.5 4.5 0 1 1 12 16.5"],
  // 稲妻
  stamina: ["M13.5 2.5 L5.5 13.5 H11 L10.5 21.5 L18.5 10.5 H13 Z"],
  // 鉛筆
  pencil: ["M4 20 L4.9 16.4 L15.8 5.5 L18.5 8.2 L7.6 19.1 Z", "M14 7.3 L16.7 10"],
  // 巻物。召喚の書
  scroll: ["M7.5 4.5 H17 A2 2 0 0 1 19 6.5 V17.5 A2 2 0 0 1 17 19.5 H7 A2 2 0 0 1 5 17.5 V6.5 A2 2 0 0 1 7 4.5", "M5 8.5 H8.5", "M11 9.5 H16", "M11 13 H16", "M11 16 H14"],
  // 丸に i。詳細を開く合図
  info: ["M12 21 A9 9 0 1 1 12 3 A9 9 0 1 1 12 21", "M12 11 V16.5", "M12 7.4 V8.6"],
  // 山括弧
  chevron: ["M9.5 5.5 L16 12 L9.5 18.5"],
};

/** 面で見せたいものだけ。線と混ぜると輪郭が二重になるので、ここは最小限にする */
const FILLED: Partial<Record<IconName, true>> = { stamina: true, summon: true };

export interface IconOptions {
  /** 24pxを基準にした大きさ。CSS側で決めたいときは指定しない */
  size?: number;
  className?: string;
}

/**
 * アイコンを1つ作る。
 *
 * `el()` は `createElement` を使うためSVGを作れない(HTML名前空間になり、
 * 見た目上は何も描かれない)。ここでは `createElementNS` を使う。
 */
export function icon(name: IconName, options: IconOptions = {}): SVGSVGElement {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("class", ["icon", `icon--${name}`, options.className].filter(Boolean).join(" "));
  if (options.size !== undefined) {
    svg.setAttribute("width", String(options.size));
    svg.setAttribute("height", String(options.size));
  }

  const filled = FILLED[name] === true;
  for (const d of STROKE_PATHS[name]) {
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", d);
    if (filled) {
      path.setAttribute("fill", "currentColor");
    } else {
      path.setAttribute("stroke", "currentColor");
      path.setAttribute("stroke-width", "1.75");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
    }
    svg.append(path);
  }
  return svg;
}
