import { MAX_FIGHTER_LEVEL, requiredExpForFighterLevel } from "../../core/fighterLevel.js";
import {
  getParty,
  LoginBonusResult,
  LOGIN_BONUS_MILESTONE_INTERVAL_DAYS,
  PlayerState,
  STAMINA_REFILL_FULL_COST,
  STAMINA_REFILL_PARTIAL_AMOUNT,
  STAMINA_REFILL_PARTIAL_COST,
} from "../../game/playerState.js";
import { CompensationClaim } from "../../game/compensation.js";
import { ELEMENT_JA } from "../../core/element.js";
import { MonsterInstance } from "../../core/monsterInstance.js";
import { STAR_MAX_LEVEL } from "../../core/rarity.js";
import { findMonsterById } from "../../data/monsters.js";
import { monsterPower } from "../../game/monsterSort.js";
import { withPortrait } from "../three/portrait.js";
import { el } from "../dom.js";
import { icon, IconName } from "../icons.js";
import { AudioSettingsProps, renderAudioSettings } from "./audioSettings.js";

export interface HomeProps {
  player: PlayerState;
  loginBonusResult: LoginBonusResult | null;
  compensationClaims: CompensationClaim[];
  onDismissCompensation: () => void;
  onDismissLoginBonus: () => void;
  onGoSummon: () => void;
  onGoStages: () => void;
  onGoParty: () => void;
  onGoEquipDungeon: () => void;
  onGoLevelDungeon: () => void;
  onGoGoldDungeon: () => void;
  onGoArena: () => void;
  onGoHowToPlay: () => void;
  onGoShop: () => void;
  onRefillStaminaPartial: () => void;
  onRefillStaminaFull: () => void;
  onEditFighterName: () => void;
  audioSettings: AudioSettingsProps;
  onExportSave: () => void;
  onImportSave: (file: File) => void;
}

function renderSaveDataPanel(props: HomeProps): HTMLElement {
  const input = el("input", {
    type: "file",
    accept: "application/json,.json",
    className: "save-data__input",
    onchange: (event: Event) => {
      const target = event.target as HTMLInputElement;
      const file = target.files?.[0];
      if (file) props.onImportSave(file);
      target.value = "";
    },
  }) as HTMLInputElement;

  return el("section", { className: "panel save-data" }, [
    el("div", { className: "panel-header" }, [el("h2", {}, ["データの控え"])]),
    el("p", { className: "save-data__warning" }, [
      "このゲームのデータは、この端末のブラウザの中だけに保存されています。ブラウザの履歴やサイトデータを削除すると、いっしょに消えてしまいます。ときどき書き出して控えを取っておいてください。",
    ]),
    el("div", { className: "save-data__actions" }, [
      el("button", { type: "button", className: "btn btn--primary", onclick: props.onExportSave }, ["⬇ データを書き出す"]),
      el("button", { type: "button", className: "btn btn--ghost", onclick: () => input.click() }, ["⬆ データを読み込む"]),
      input,
    ]),
  ]);
}

/* ==========================================================================
 * 受け取りの帯(ログインボーナス・お詫びの配布)
 *
 * どちらもメニューの**最上段**という一等地に出る。ここが青枠に緑の文字の
 * ままだと、せっかく金と熾火で組んだ画面の頭に、前の世界の紙が1枚
 * 貼られているように見える。それ以前に、緑はこのゲームでは体力の色で、
 * 「もらえた」という意味を運んでいない。
 *
 * 作りは2つとも同じにする:**封蝋(印)+ 中身 + 閉じる**。
 * 貰った量は文中の数字ではなく、アイコンを添えた一行で立てる。
 * ========================================================================== */

interface RewardLine {
  name: IconName;
  amount: string;
  unit: string;
}

/** 貰ったものを1行ずつ。数字を大きく、単位は添える程度に */
function rewardList(lines: RewardLine[]): HTMLElement {
  return el(
    "ul",
    { className: "reward-list" },
    lines.map((line) =>
      el("li", {}, [icon(line.name), el("strong", {}, [line.amount]), el("span", {}, [line.unit])]),
    ),
  );
}

/** 封蝋。金の丸に印を1つ落とす。帯の中で目が最初に止まる場所を作る */
function rewardSeal(name: IconName): HTMLElement {
  return el("div", { className: "reward-banner__seal", "aria-hidden": "true" }, [icon(name)]);
}

function renderCompensationBanner(claims: CompensationClaim[], onDismiss: () => void): HTMLElement {
  const rows: HTMLElement[] = [];
  for (const { compensation } of claims) {
    rows.push(el("p", { className: "compensation__title" }, [compensation.title]));
    rows.push(el("p", { className: "compensation__message" }, [compensation.message]));
    const items: RewardLine[] = [];
    if (compensation.crystal > 0) items.push({ name: "crystal", amount: `+${compensation.crystal.toLocaleString("ja-JP")}`, unit: "ダイヤ" });
    if (compensation.gold > 0) items.push({ name: "coin", amount: `+${compensation.gold.toLocaleString("ja-JP")}`, unit: "ゴールド" });
    if (compensation.summonScrolls > 0) items.push({ name: "scroll", amount: `+${compensation.summonScrolls}`, unit: "召喚の書" });
    if (items.length > 0) rows.push(rewardList(items));
  }
  return el("section", { className: "panel reward-banner compensation" }, [
    rewardSeal("scroll"),
    el("div", { className: "reward-banner__body" }, [el("p", { className: "reward-banner__label" }, ["お詫びの配布"]), ...rows]),
    el("button", { type: "button", className: "btn btn--ghost reward-banner__close", onclick: onDismiss }, ["閉じる"]),
  ]);
}

function renderLoginBonusBanner(result: LoginBonusResult, onDismiss: () => void): HTMLElement {
  const total = result.dailyCrystal + result.milestoneCrystal + result.firstTimeCrystal;
  const isFirst = result.firstTimeCrystal > 0;
  const body: HTMLElement[] = [
    el("p", { className: "reward-banner__label" }, [isFirst ? "はじめまして" : "ログインボーナス"]),
    rewardList([{ name: "crystal", amount: `+${total.toLocaleString("ja-JP")}`, unit: "ダイヤ" }]),
  ];
  if (isFirst) {
    // 何に使えるのかまで書く。数字だけ渡されても、初めての人には多いのか少ないのか分からない
    body.push(
      el("p", { className: "reward-banner__note" }, [
        `開始のお祝いです。召喚の10連が3回ぶん引けます`,
      ]),
    );
  }
  if (result.milestoneCrystal > 0) {
    body.push(
      el("p", { className: "reward-banner__note" }, [
        `${LOGIN_BONUS_MILESTONE_INTERVAL_DAYS}日分ログインで追加ボーナス +${result.milestoneCrystal}`,
      ]),
    );
  }
  return el("section", { className: "panel reward-banner login-bonus-banner" }, [
    rewardSeal("crystal"),
    el("div", { className: "reward-banner__body" }, body),
    el("button", { type: "button", className: "btn btn--ghost reward-banner__close", onclick: onDismiss }, ["閉じる"]),
  ]);
}

/**
 * 上部の身分証。
 *
 * 以前はレベル・EXP・3種の通貨が同じ高さに並んでいて、どれが主でどれが従か
 * 分からなかった。ここでは**レベルを丸で立て、名前を主役に、EXPは帯で見せる**。
 * 数字を読ませるのではなく、伸び具合を目で分かるようにする。
 */
function renderIdentity(
  player: PlayerState,
  onEditFighterName: () => void,
  onOpenSettings: () => void,
  lead: MonsterInstance | undefined,
): HTMLElement {
  const isMax = player.fighterLevel >= MAX_FIGHTER_LEVEL;
  const needed = requiredExpForFighterLevel(player.fighterLevel);
  const ratio = isMax ? 1 : Math.max(0, Math.min(1, player.fighterExp / Math.max(1, needed)));

  return el("section", { className: "home-id" }, [
    // 肖像は円で、金の輪で囲う。ここが画面の中で唯一「自分」を指す場所なので、
    // 一番手の込んだ縁を与える
    el("div", { className: "home-id__crest" }, [
      el("span", { className: "home-id__crestring" }, []),
      // 顔は編成の先頭のモンスター。汎用のアイコンより、自分の手持ちが出る方が「自分」に見える
      withPortrait(el("span", { className: "home-id__crestface" }, []), lead ? findMonsterById(lead.dexId) : undefined, "fill"),
      el("span", { className: "home-id__level" }, [
        el("small", {}, ["Lv"]),
        el("strong", {}, [String(player.fighterLevel)]),
      ]),
    ]),
    el("div", { className: "home-id__body" }, [
      el("div", { className: "home-id__name" }, [
        el("strong", {}, [player.fighterName]),
        el("button", { type: "button", className: "home-id__edit", onclick: onEditFighterName, title: "名前を変える" }, [
          icon("pencil"),
        ]),
        el("button", { type: "button", className: "home-id__edit home-id__gear", onclick: onOpenSettings, title: "設定" }, [
          icon("settings"),
        ]),
      ]),
      el("div", { className: "home-id__exp" }, [
        el("div", { className: "home-id__bar" }, [
          el("i", { style: `width:${(ratio * 100).toFixed(1)}%` }, []),
        ]),
        el("span", {}, [isMax ? "MAX" : `${player.fighterExp} / ${needed}`]),
      ]),
    ]),
  ]);
}

function currencyChip(name: IconName, value: number, modifier: string, suffix?: string): HTMLElement {
  return el("div", { className: `home-wallet__chip home-wallet__chip--${modifier}` }, [
    icon(name),
    el("strong", {}, [value.toLocaleString("ja-JP")]),
    suffix ? el("span", { className: "home-wallet__suffix" }, [suffix]) : null,
  ].filter((n): n is HTMLElement => n !== null));
}


/* ==========================================================================
 * タイトルの紋章
 *
 * 以前のタイトルは`<span>CREATE</span><strong>MONSTERS</strong>`だけで、
 * **ただの文字**だった。字面を大きくしても紋章にはならない。輪郭も厚みも
 * 無いので背景に沈み、端末のフォントが変われば幅がはみ出して画面外へ出る。
 *
 * ここではロゴをSVGで組む。理由は3つ:
 *
 * - `paint-order="stroke"` で**外周に濃い縁**を回せる。彫った金属に見える
 * - `textLength` で**幅を固定できる**。フォントが何であれ枠から出ない
 * - 角・鉱石・罫を同じ座標系に置ける。文字と飾りがずれない
 *
 * 図柄は「2つの流れが1つの核へ集まる」形。合成してモンスターを作り替える
 * という、このゲームそのものを絵にしている(角にも見えるようにしてある)。
 * ========================================================================== */

const SVG_NS = "http://www.w3.org/2000/svg";

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string>,
  children: SVGElement[] = [],
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  for (const child of children) node.append(child);
  return node;
}

/** 目盛りの環。1本ずつ線を引くより、角度から座標を出した方が数を変えやすい */
function ticks(radius: number, count: number, length: number, width: number, color: string): SVGElement[] {
  const out: SVGElement[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    out.push(
      svg("line", {
        x1: (250 + cos * radius).toFixed(1),
        y1: (250 + sin * radius).toFixed(1),
        x2: (250 + cos * (radius + length)).toFixed(1),
        y2: (250 + sin * (radius + length)).toFixed(1),
        stroke: color,
        "stroke-width": String(width),
      }),
    );
  }
  return out;
}

const GOLD_LINE = "rgba(226,182,110,.42)";
const GOLD_LINE_SOFT = "rgba(226,182,110,.20)";

/**
 * 背後で回る錬成陣。
 *
 * 2枚を**逆向きに、別々の速さで**回す。1枚だと「絵が回っている」だけだが、
 * 速さの違う輪が重なると、止まっていない奥行きに見える。
 */
function arcaneRings(className: string): HTMLElement {
  const outer = svg("svg", { viewBox: "0 0 500 500", class: "arcane-ring arcane-ring--outer", "aria-hidden": "true" }, [
    svg("circle", { cx: "250", cy: "250", r: "236", fill: "none", stroke: GOLD_LINE_SOFT, "stroke-width": "1" }),
    svg("circle", { cx: "250", cy: "250", r: "222", fill: "none", stroke: GOLD_LINE_SOFT, "stroke-width": "1" }),
    ...ticks(206, 60, 9, 1, GOLD_LINE_SOFT),
    ...ticks(202, 12, 17, 2, GOLD_LINE),
    svg("circle", { cx: "250", cy: "250", r: "202", fill: "none", stroke: GOLD_LINE_SOFT, "stroke-width": "1" }),
  ]);
  const inner = svg("svg", { viewBox: "0 0 500 500", class: "arcane-ring arcane-ring--inner", "aria-hidden": "true" }, [
    svg("circle", { cx: "250", cy: "250", r: "168", fill: "none", stroke: GOLD_LINE, "stroke-width": "1.5" }),
    svg("circle", { cx: "250", cy: "250", r: "158", fill: "none", stroke: GOLD_LINE_SOFT, "stroke-width": "1" }),
    ...ticks(158, 24, -8, 1, GOLD_LINE_SOFT),
    svg("path", {
      d: "M250 82 L395 334 L105 334 Z",
      fill: "none",
      stroke: "rgba(150,190,255,.20)",
      "stroke-width": "1.5",
    }),
    svg("path", {
      d: "M250 418 L105 166 L395 166 Z",
      fill: "none",
      stroke: "rgba(150,190,255,.20)",
      "stroke-width": "1.5",
    }),
  ]);
  return el("div", { className, "aria-hidden": "true" }, [outer, inner]);
}

/** ロゴ本体。角・核・罫・文字を1つの座標系にまとめる */
function titleEmblem(): SVGSVGElement {
  const defs = svg("defs", {}, [
    svg("linearGradient", { id: "crimonGold", x1: "0", y1: "0", x2: "0", y2: "1" }, [
      svg("stop", { offset: "0", "stop-color": "#fff8e6" }),
      svg("stop", { offset: ".34", "stop-color": "#f6d491" }),
      svg("stop", { offset: ".53", "stop-color": "#c1832b" }),
      svg("stop", { offset: ".63", "stop-color": "#f2cd83" }),
      svg("stop", { offset: "1", "stop-color": "#8a5312" }),
    ]),
    svg("linearGradient", { id: "crimonSheen", x1: "0", y1: "0", x2: "0", y2: "1" }, [
      svg("stop", { offset: "0", "stop-color": "#ffffff", "stop-opacity": ".85" }),
      svg("stop", { offset: ".4", "stop-color": "#ffffff", "stop-opacity": "0" }),
    ]),
    svg("linearGradient", { id: "crimonHorn", x1: "0", y1: "0", x2: "0", y2: "1" }, [
      svg("stop", { offset: "0", "stop-color": "#f0d095" }),
      svg("stop", { offset: ".42", "stop-color": "#b98429" }),
      svg("stop", { offset: "1", "stop-color": "#59340a" }),
    ]),
    svg("linearGradient", { id: "crimonHornDark", x1: "0", y1: "0", x2: "0", y2: "1" }, [
      svg("stop", { offset: "0", "stop-color": "#c8a466" }),
      svg("stop", { offset: ".45", "stop-color": "#8a5c17" }),
      svg("stop", { offset: "1", "stop-color": "#3d2306" }),
    ]),
    svg("radialGradient", { id: "crimonCore", cx: ".5", cy: ".38", r: ".72" }, [
      svg("stop", { offset: "0", "stop-color": "#ffffff" }),
      svg("stop", { offset: ".3", "stop-color": "#b6e3ff" }),
      svg("stop", { offset: ".72", "stop-color": "#4f8ae8" }),
      svg("stop", { offset: "1", "stop-color": "#1b3f9c" }),
    ]),
    svg("radialGradient", { id: "crimonHalo", cx: ".5", cy: ".5", r: ".5" }, [
      svg("stop", { offset: "0", "stop-color": "#9ad4ff", "stop-opacity": ".55" }),
      svg("stop", { offset: ".55", "stop-color": "#5a8bff", "stop-opacity": ".16" }),
      svg("stop", { offset: "1", "stop-color": "#5a8bff", "stop-opacity": "0" }),
    ]),
  ]);

  /*
   * 翼。
   *
   * 最初は左右1枚ずつの塗りだった。1枚だと**平らな凧**にしかならず、
   * 切り欠きを入れても黒い線が浮いているだけだった。
   * ここでは根元から扇形に4枚を重ねる。奥ほど暗くすると、
   * 同じ金色でも面が前後に分かれて厚みが出る。
   */
  const mirror = "translate(640,0) scale(-1,1)";
  const quills: Array<[string, string]> = [
    ["M298 108 C258 102 216 96 172 78 C220 104 264 120 300 126 Z", "url(#crimonHornDark)"],
    ["M298 92 C252 84 202 74 140 52 C198 84 254 104 300 114 Z", "url(#crimonHorn)"],
    ["M298 76 C246 64 186 50 102 24 C174 62 244 88 300 100 Z", "url(#crimonHornDark)"],
    ["M298 58 C240 42 168 24 64 2 C148 42 230 72 300 86 Z", "url(#crimonHorn)"],
  ];
  const wing = (path: string, fill: string, flip: boolean) =>
    svg("path", {
      d: path,
      fill,
      stroke: "#150f0b",
      "stroke-width": "2.5",
      "stroke-linejoin": "round",
      ...(flip ? { transform: mirror } : {}),
    });

  const horns = svg("g", {}, [
    ...quills.flatMap(([d, fill]) => [wing(d, fill, false), wing(d, fill, true)]),
    // 羽の筋。根元から先へ1本ずつ流すと、塗りの面に向きが生まれる
    ...["M292 100 C244 88 196 70 140 44", "M294 116 C252 108 214 94 178 76"].flatMap((d) => [
      svg("path", { d, fill: "none", stroke: "rgba(255,232,190,.28)", "stroke-width": "2", "stroke-linecap": "round" }),
      svg("path", { d, transform: mirror, fill: "none", stroke: "rgba(255,232,190,.28)", "stroke-width": "2", "stroke-linecap": "round" }),
    ]),
  ]);

  /*
   * 核。合成の行き着く先を、画面でいちばん明るい一点にする。
   * **角より後に描く**。角の根元がこの石の裏へ潜り、左右が1つに束ねられる。
   */
  const core = svg("g", {}, [
    svg("circle", { cx: "320", cy: "76", r: "80", fill: "url(#crimonHalo)", class: "title-emblem__halo" }),
    svg("path", { d: "M320 16 L360 76 L320 138 L280 76 Z", fill: "url(#crimonCore)" }),
    svg("path", {
      d: "M320 16 L360 76 L320 138 L280 76 Z",
      fill: "none",
      stroke: "#ffe9bd",
      "stroke-width": "3.5",
      "stroke-linejoin": "round",
    }),
    svg("path", {
      d: "M280 76 H360 M320 16 L302 76 M320 16 L338 76",
      stroke: "rgba(255,255,255,.5)",
      "stroke-width": "1.5",
      fill: "none",
    }),
    // 上面の照り返しと、下半分の落ち込み。面が2つに割れて石らしくなる
    svg("path", { d: "M320 24 L349 68 L320 60 L291 68 Z", fill: "rgba(255,255,255,.42)" }),
    svg("path", { d: "M320 132 L353 82 L320 96 L287 82 Z", fill: "rgba(10,20,60,.4)" }),
  ]);

  const rules = svg("g", { stroke: "rgba(226,182,110,.55)", "stroke-width": "1.6", fill: "none" }, [
    svg("path", { d: "M104 182 H214" }),
    svg("path", { d: "M426 182 H536" }),
    svg("path", { d: "M52 308 H588" }),
    svg("path", { d: "M52 308 l18 -10 M588 308 l-18 -10" }),
  ]);
  const ruleGems = svg("g", { fill: "#e6b86e" }, [
    svg("path", { d: "M222 182 l7 -7 7 7 -7 7 Z" }),
    svg("path", { d: "M404 182 l7 -7 7 7 -7 7 Z" }),
    svg("path", { d: "M320 298 l11 10 -11 10 -11 -10 Z" }),
  ]);

  const wordmark = svg("g", { "text-anchor": "middle" }, [
    svg("text", {
      x: "320",
      y: "192",
      "font-size": "32",
      "font-weight": "800",
      textLength: "128",
      lengthAdjust: "spacingAndGlyphs",
      fill: "#f0dcb6",
      stroke: "#14100a",
      "stroke-width": "6",
      "paint-order": "stroke",
    }),
    svg("text", {
      x: "320",
      y: "276",
      "font-size": "90",
      "font-weight": "900",
      textLength: "540",
      lengthAdjust: "spacingAndGlyphs",
      stroke: "#0a0912",
      "stroke-width": "16",
      "paint-order": "stroke",
      fill: "url(#crimonGold)",
    }),
    svg("text", {
      x: "320",
      y: "276",
      "font-size": "90",
      "font-weight": "900",
      textLength: "540",
      lengthAdjust: "spacingAndGlyphs",
      fill: "url(#crimonSheen)",
    }),
  ]);
  wordmark.children[0].textContent = "CREATE";
  wordmark.children[1].textContent = "MONSTERS";
  wordmark.children[2].textContent = "MONSTERS";

  return svg("svg", {
    viewBox: "0 0 640 332",
    class: "title-emblem",
    role: "img",
    "aria-label": "CREATE MONSTERS",
  }, [defs, horns, core, rules, ruleGems, wordmark]);
}

/**
 * 下の稜線。
 *
 * 熾火だけを置いた時は、画面の下3分の1が**ただの茶色い靄**になっていた。
 * 手前に黒い岩の影を1枚入れると、同じ明かりが「稜線の向こうで燃えている
 * 何か」に変わる。奥と手前で2枚重ね、奥の縁だけに火の色を乗せる。
 */
function forgeRidge(): HTMLElement {
  /*
   * 山を3枚重ねる。
   *
   * 2枚だったときは**鋸の歯**に見えていた。峰の高さと間隔をばらしても
   * 直らなかったのは、**傾きが全部同じ**だったから。自然の稜線は
   * 片側が急でもう片側が緩い。ここでは長く登って短く落ちる形にしてある。
   *
   * いちばん奥は淡く青へ寄せる。遠いものほど大気で色が抜けるので、
   * これだけで「遠い」と分かるようになる。
   */
  const distant = "M0 74 L44 58 L62 66 L118 30 L136 52 L190 40 L214 56 L272 22 L292 48 L336 38 L358 54 L390 44 L390 120 L0 120 Z";
  const far = "M0 90 L38 74 L56 82 L102 44 L120 66 L164 56 L186 70 L232 36 L252 62 L296 52 L318 74 L344 50 L370 68 L390 60 L390 120 L0 120 Z";
  const near = "M0 108 L36 96 L60 103 L108 80 L134 99 L176 91 L204 103 L250 84 L286 101 L322 93 L358 105 L390 97 L390 120 L0 120 Z";
  const crest = (d: string) => d.slice(0, d.indexOf(" L390 120"));

  const ridge = svg("svg", { viewBox: "0 0 390 120", preserveAspectRatio: "none", class: "title-ridge__art", "aria-hidden": "true" }, [
    svg("path", { d: distant, fill: "#151228", opacity: "0.75" }),
    svg("path", { d: crest(distant), fill: "none", stroke: "rgba(150,180,255,.28)", "stroke-width": "1" }),
    svg("path", { d: far, fill: "#0a0812" }),
    svg("path", { d: crest(far), fill: "none", stroke: "rgba(255,170,84,.45)", "stroke-width": "1.2" }),
    svg("path", { d: near, fill: "#040309" }),
  ]);
  return el("div", { className: "title-ridge", "aria-hidden": "true" }, [ridge]);
}

/** 立ちのぼる火の粉。数は少なく、速さはばらす。揃っていると作り物に見える */
function emberMotes(count: number): HTMLElement {
  const layer = el("div", { className: "title-motes", "aria-hidden": "true" }, []);
  for (let i = 0; i < count; i += 1) {
    const left = 4 + (i * 92) / count + Math.random() * 6;
    layer.append(
      el("i", {
        style: [
          `left:${left.toFixed(1)}%`,
          `animation-duration:${(9 + Math.random() * 11).toFixed(1)}s`,
          `animation-delay:${(-Math.random() * 18).toFixed(1)}s`,
          `--mote-drift:${(Math.random() * 40 - 20).toFixed(0)}px`,
          `--mote-size:${(2 + Math.random() * 2).toFixed(1)}px`,
        ].join(";"),
      }),
    );
  }
  return layer;
}

interface MenuTile {
  name: IconName;
  label: string;
  sub: string;
  onClick: () => void;
}


/**
 * ホームのパーティ札。
 *
 * 以前は絵文字の小さな四角を4つ並べているだけで、**手持ちの主役が
 * 画面の中でいちばん貧相**という状態だった。ここは「自分の4体」を
 * 見せる場所なので、札そのものを主役の大きさにする。
 *
 * 肖像は Three.js で焼いた3Dの絵をそのまま札いっぱいに敷く。描き起こした
 * イラストは持てないが、実際のモンスターが立っている絵はこちらで作れる。
 */
function homePartyCard(instance: MonsterInstance | undefined, onGoParty: () => void): HTMLElement {
  if (!instance) {
    return el("button", { type: "button", className: "hp-card hp-card--empty", onclick: onGoParty }, [
      el("span", { className: "hp-card__plus" }, ["＋"]),
      el("span", { className: "hp-card__emptytext" }, ["編成する"]),
    ]);
  }

  const dex = findMonsterById(instance.dexId);
  const stars = Array.from({ length: instance.star }, () => el("i", {}, []));

  return el(
    "button",
    {
      type: "button",
      className: "hp-card",
      style: dex ? `--el-color:${dex.color}` : undefined,
      onclick: onGoParty,
    },
    [
      withPortrait(el("span", { className: "hp-card__art" }, [dex ? dex.emoji : "❓"]), dex, "fill"),
      el("span", { className: "hp-card__shade" }, []),
      dex
        ? el("span", { className: "hp-card__gem", title: `${ELEMENT_JA[dex.element]}属性` }, [
            el("i", {}, [ELEMENT_JA[dex.element]]),
          ])
        : null,
      // 星は数字ではなく粒で出す。並べた時に格の差が一目で分かる
      el("span", { className: "hp-card__stars" }, stars),
      el("span", { className: "hp-card__level" }, [`Lv.${instance.level}`]),
    ].filter((n): n is HTMLElement => n !== null),
  );
}

/**
 * 総戦力・所持ダイヤ・所持ゴールドと、スタミナ。
 *
 * 「今どれだけ強いか」を出す場所がどこにも無かった。手持ちを鍛えた手応えが
 * 数字で返らないと、育てた甲斐が画面に現れない。
 *
 * スタミナは**ここ1か所にしか出さない。**以前は上部の通貨欄と下部の欄の
 * 2か所にあり、片方だけ見て「回復したのに増えていない」と誤解する余地があった。
 */
function renderVitals(
  player: PlayerState,
  onPartial: () => void,
  onFull: () => void,
  party: readonly MonsterInstance[],
): HTMLElement {
  const power = party.reduce((sum, m) => sum + monsterPower(m), 0);
  const full = player.stamina >= player.maxStamina;
  const ratio = Math.max(0, Math.min(1, player.stamina / Math.max(1, player.maxStamina)));

  const stat = (name: IconName, label: string, value: number): HTMLElement =>
    el("div", { className: "home-stat" }, [
      icon(name),
      el("span", { className: "home-stat__body" }, [
        el("small", {}, [label]),
        el("strong", {}, [value.toLocaleString("ja-JP")]),
      ]),
    ]);

  return el("section", { className: "panel panel--ornate home-vitals" }, [
    el("div", { className: "home-vitals__stats" }, [
      stat("arena", "総戦力", power),
      stat("crystal", "所持ダイヤ", player.crystal),
      stat("coin", "所持ゴールド", player.gold),
    ]),
    el("div", { className: "home-vitals__stamina" }, [
      el("div", { className: "home-stamina" }, [
        icon("stamina"),
        el("span", { className: "home-stamina__body" }, [
          el("small", {}, ["スタミナ"]),
          el("span", { className: "home-stamina__num" }, [
            el("strong", {}, [String(player.stamina)]),
            el("span", {}, [`/ ${player.maxStamina}`]),
          ]),
        ]),
        el("div", { className: "home-stamina__track" }, [el("i", { style: `width:${(ratio * 100).toFixed(1)}%` }, [])]),
      ]),
      el("div", { className: "home-vitals__actions" }, [
        el(
          "button",
          {
            type: "button",
            className: "btn btn--ghost",
            disabled: full || player.crystal < STAMINA_REFILL_PARTIAL_COST,
            onclick: onPartial,
          },
          [icon("crystal"), `${STAMINA_REFILL_PARTIAL_COST} で +${STAMINA_REFILL_PARTIAL_AMOUNT}`],
        ),
        el(
          "button",
          {
            type: "button",
            className: "btn btn--ghost",
            disabled: full || player.crystal < STAMINA_REFILL_FULL_COST,
            onclick: onFull,
          },
          [icon("crystal"), `${STAMINA_REFILL_FULL_COST} で全回復`],
        ),
      ]),
    ]),
  ]);
}


/**
 * 節の見出し。
 *
 * 見出しごとに板を敷くと、画面が「札の列」になる。
 * 背景の上に**刻印だけ**を置いて、囲わずに区切る。
 */
function sectionMark(text: string, action?: HTMLElement): HTMLElement {
  return el("div", { className: "home-mark" }, [
    el("span", { className: "home-mark__lozenge" }, []),
    el("span", { className: "home-mark__text" }, [text]),
    el("span", { className: "home-mark__rule" }, []),
    action ?? null,
  ].filter((n): n is HTMLElement => n !== null));
}

function renderMenuTile(tile: MenuTile): HTMLElement {
  // data-tour は巡回(tools/tour.mjs)の目印。文言ではなくここを見てもらう
  return el("button", { type: "button", className: "home-tile", "data-tour": `tile:${tile.name}`, onclick: tile.onClick }, [
    el("span", { className: "home-tile__icon" }, [icon(tile.name)]),
    el("span", { className: "home-tile__label" }, [tile.label]),
    el("span", { className: "home-tile__sub" }, [tile.sub]),
  ]);
}

export function renderHome(props: HomeProps): HTMLElement {
  const {
    player,
    loginBonusResult,
    onDismissLoginBonus,
    onGoSummon,
    onGoStages,
    onGoParty,
    onGoEquipDungeon,
    onGoLevelDungeon,
    onGoGoldDungeon,
    onGoArena,
    onGoHowToPlay,
    onGoShop,
    onRefillStaminaPartial,
    onRefillStaminaFull,
    onEditFighterName,
  } = props;
  const party = getParty(player);
  const hasStarted = sessionStorage.getItem("crimon.started") === "1";

  /**
   * 設定は普段いらないものなので、ホームに出しっぱなしにしない。
   * 音量つまみとデータの書き出しが常に見えていると、
   * 遊ぶための導線と同じ重さで並んでしまう。
   */
  const settingsSheet = el("div", { className: "home-sheet", hidden: true }, [
    el("div", { className: "home-sheet__scrim", onclick: () => closeSettings() }, []),
    el("div", { className: "home-sheet__panel" }, [
      el("div", { className: "home-sheet__head" }, [
        el("strong", {}, ["設定"]),
        el("button", { type: "button", className: "btn btn--ghost", onclick: () => closeSettings() }, ["閉じる"]),
      ]),
      renderAudioSettings(props.audioSettings),
      renderSaveDataPanel(props),
      el("p", { className: "build-id" }, [`版 ${__BUILD_ID__}`]),
    ]),
  ]);
  const closeSettings = () => {
    settingsSheet.hidden = true;
  };
  const openSettings = () => {
    settingsSheet.hidden = false;
  };

  /**
   * 5個を3列に並べると最後の行が欠けて、意味のない空白が残っていた。
   * 数を合わせるより、**性質でまとめた方が探しやすい**。
   * 「増やす」と「鍛える」に分けると、それぞれ2個と3個でちょうど収まる。
   */
  const gather: MenuTile[] = [
    { name: "summon", label: "召喚", sub: "新しい仲間", onClick: onGoSummon },
    { name: "shop", label: "ショップ", sub: "1時間ごとに更新", onClick: onGoShop },
  ];
  const dungeons: MenuTile[] = [
    { name: "equipDungeon", label: "装備", sub: "ダンジョン", onClick: onGoEquipDungeon },
    { name: "trainDungeon", label: "育成", sub: "ダンジョン", onClick: onGoLevelDungeon },
    { name: "goldDungeon", label: "ゴールド", sub: "ダンジョン", onClick: onGoGoldDungeon },
  ];
  // 対人は「増やす」でも「鍛える」でもない、腕を試す場所。行を分けて独立させる
  const compete: MenuTile[] = [
    { name: "arena", label: "アリーナ", sub: "対人戦", onClick: onGoArena },
    // 迷った時の行き先。奥にしまうと、いちばん要る人が見つけられない
    { name: "info", label: "遊び方", sub: "はじめての方へ", onClick: onGoHowToPlay },
  ];

  const menu = el("div", { className: `home-menu ${hasStarted ? "home-menu--visible" : "home-menu--hidden"}` }, [
    // タイトルと同じ世界の続きにする。背景だけ別物だと、STARTで別のゲームに移ったように見える
    arcaneRings("home-menu__rings"),
    props.compensationClaims.length > 0 ? renderCompensationBanner(props.compensationClaims, props.onDismissCompensation) : null,
    loginBonusResult ? renderLoginBonusBanner(loginBonusResult, onDismissLoginBonus) : null,
    // 1. プレイヤー情報。板を敷かず、背景の絵の上に直接置く
    el("div", { className: "home-crown" }, [
      renderIdentity(player, onEditFighterName, openSettings, party[0]),
      el("section", { className: "home-wallet" }, [
        currencyChip("crystal", player.crystal, "crystal"),
        currencyChip("coin", player.gold, "gold"),
        currencyChip("stamina", player.stamina, "stamina", `/ ${player.maxStamina}`),
      ]),
    ]),
    // 2. 現在のパーティ。最も装飾を厚くする面
    el("section", { className: "home-party panel--ornate" }, [
      sectionMark(
        "CURRENT PARTY",
        el("button", { type: "button", className: "btn-frame", onclick: onGoParty }, ["編成"]),
      ),
      el(
        "div",
        { className: "home-party-grid" },
        Array.from({ length: 4 }, (_, i) => homePartyCard(party[i], onGoParty)),
      ),
    ]),
    // 一番行く場所なので、一番大きい面を与える。横長の帯では他のタイルに埋もれる
    el("button", { type: "button", className: "home-adventure", onclick: onGoStages }, [
      el("span", { className: "home-adventure__sky", "aria-hidden": "true" }, []),
      el("span", { className: "home-adventure__ridge", "aria-hidden": "true" }, []),
      el("span", { className: "home-adventure__haze", "aria-hidden": "true" }, []),
      el("span", { className: "home-adventure__text" }, [
        el("strong", {}, ["ADVENTURE"]),
        el("small", {}, ["冒険に出る"]),
      ]),
      el("span", { className: "home-adventure__arrow" }, [icon("chevron")]),
    ]),
    // 4. スタミナと所持。冒険のすぐ下に置く(出かける前に見る数字なので)
    renderVitals(player, onRefillStaminaPartial, onRefillStaminaFull, party),
    // 5. 召喚とショップ。絵を持つ2枚
    el("section", { className: "home-group" }, [
      sectionMark("コンテンツ"),
      el("div", { className: "home-feature-grid" }, gather.map(renderMenuTile)),
    ]),
    // 6. その他。**ここは小さく畳む。**全部を目立たせると何も目立たない
    el("section", { className: "home-group" }, [
      el("div", { className: "home-minor-grid" }, [...dungeons, ...compete].map(renderMenuTile)),
    ]),
    settingsSheet,
  ].filter((n): n is HTMLElement => n !== null));

  if (hasStarted) return el("div", { className: "screen home-screen home-screen--menu-only" }, [menu]);

  /**
   * タイトル画面。
   *
   * 背景は**層で作る**。1枚の平面に文字を置くと、どれだけ色を凝っても
   * 「壁紙の前の文字」にしかならない。奥から順に、坩堝の熾火 → 回る錬成陣 →
   * 火の粉 → 粒(ざらつき)→ 隅の落ち込み、と重ねて、その手前に紋章を置く。
   */
  const titleScreen = el("section", { className: "title-screen" }, [
    el("div", { className: "title-screen__forge", "aria-hidden": "true" }, []),
    arcaneRings("title-screen__rings"),
    emberMotes(14),
    forgeRidge(),
    el("div", { className: "title-screen__grain", "aria-hidden": "true" }, []),
    el("div", { className: "title-screen__vignette", "aria-hidden": "true" }, []),
    el("div", { className: "title-screen__logo" }, [
      titleEmblem(),
      el("p", { className: "title-screen__jp" }, ["クリエイトモンスターズ"]),
    ]),
    el("button", { type: "button", className: "title-start", onclick: () => {
      sessionStorage.setItem("crimon.started", "1");
      titleScreen.classList.add("title-screen--leaving");
      menu.classList.remove("home-menu--hidden");
      menu.classList.add("home-menu--visible");
      window.scrollTo({ top: 0 });
      window.setTimeout(() => titleScreen.remove(), 320);
    } }, [el("span", {}, ["START"])]),
    el("p", { className: "title-screen__hint" }, ["MONSTER BATTLE ADVENTURE"]),
  ]);

  return el("div", { className: "screen home-screen" }, [titleScreen, menu]);
}
