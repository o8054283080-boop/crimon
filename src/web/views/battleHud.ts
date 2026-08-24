/**
 * 戦闘HUDの部品。
 *
 * 以前は battleView.ts の中に「緑のカプセル + 白文字」を直接書いていた。
 * それだと3D側がどれだけ良くなっても、頭上の札だけが**素のHTML**に見える。
 * ここでは札を「金具の付いた銘板」として組み直し、
 *
 *   - 属性の紋章(左の六角のキャップ)
 *   - 星の格(額縁の色 + 金の ★n)
 *   - 名前(省略しない。長い名前は2行へ折る)
 *   - HP(溝に沈めた帯・目盛り・削れた分を追う残像・シールドの覆い)
 *   - ATB(細い金の帯。先端だけが光る)
 *   - 状態異常(形と色の両方で読める丸い印)
 *
 * を1枚の板の上に積む。**情報の階層**(誰か → どれだけ生きているか → 何がかかっているか)が
 * 上から下へ並ぶようにして、目が迷わないようにしている。
 */
import { UnitSnapshot } from "../../battle/engine.js";
import { formatHpPair } from "../../core/stats.js";
import { ActiveEffect } from "../../battle/unit.js";
import { ELEMENT_JA, Element } from "../../core/element.js";
import { MonsterDefinition } from "../../core/monster.js";
import { BUFF_STAT_JA, BuffStat } from "../../core/skill.js";
import { el } from "../dom.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * 24×24 の枠に収めた印を作る。
 *
 * 絵文字はやめた。端末ごとに絵柄も太さも変わるうえ、16px以下だと
 * 「炎」なのか「爆発」なのか判別できない(実際に指摘された)。
 * 塗りの図形なら、18pxまで縮めても輪郭が残る。
 */
function glyph(body: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.innerHTML = body;
  return svg;
}

/* ------------------------------------------------------------------ 属性の紋章 */

/**
 * 属性の印。**色だけに頼らない。**
 * 火と闇は暗い舞台では似た明度になり、色覚特性によっては同じに見える。
 * 炎・雫・稲妻・葉・陽・月と、形そのものを変えている。
 */
const ELEMENT_GLYPH: Record<Element, string> = {
  FIRE: `<path fill="currentColor" d="M12 22.6c4.3 0 7.8-3.2 7.8-7.3 0-4.5-3.9-6.7-5.1-11.2-.2-.8-1.2-1.1-1.7-.4-1.4 1.9-.4 3.9-2 5.7-1.2-.6-1.6-1.9-1.6-3.2 0-.8-.9-1.2-1.4-.6C6.3 7.6 4.2 10.3 4.2 15c0 4.1 3.5 7.6 7.8 7.6z"/>`,
  WATER: `<path fill="currentColor" d="M12 2.4c-.4 0-.8.2-1 .5C8.4 6.3 5.2 10.4 5.2 14.2c0 4.4 3 7.6 6.8 7.6s6.8-3.2 6.8-7.6c0-3.8-3.2-7.9-5.8-11.3-.2-.3-.6-.5-1-.5z"/><path fill="rgba(255,255,255,0.55)" d="M9 12.4c.6 0 1 .5.9 1.1-.2 1.5.3 2.7 1.4 3.4.5.3.6 1 .2 1.4-.3.4-.9.5-1.3.2-1.8-1.1-2.6-3-2.3-5.2.1-.5.5-.9 1.1-.9z"/>`,
  ELECTRIC: `<path fill="currentColor" d="M13.9 2.1 5.5 13.4c-.5.6 0 1.5.8 1.5h3.9l-1.4 6.7c-.2.9 1 1.4 1.6.6l8.3-11.3c.4-.6 0-1.5-.8-1.5h-3.8l1.4-6.7c.2-.9-1-1.4-1.6-.6z"/>`,
  GRASS: `<path fill="currentColor" d="M20.4 3.6c0 9.5-3.8 15-9.4 15-3.7 0-6.2-2.6-6.2-6.1 0-5 5.7-8.9 15.6-8.9z"/><path fill="none" stroke="rgba(0,0,0,0.45)" stroke-width="1.6" stroke-linecap="round" d="M18 6.2C12.4 8.4 8 12.8 5.6 21"/>`,
  LIGHT: `<circle cx="12" cy="12" r="4.4" fill="currentColor"/><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M12 1.6v3.1M12 19.3v3.1M22.4 12h-3.1M4.7 12H1.6M19.3 4.7l-2.2 2.2M6.9 17.1l-2.2 2.2M19.3 19.3l-2.2-2.2M6.9 6.9 4.7 4.7"/>`,
  DARK: `<path fill="currentColor" d="M20.6 14.9A8.8 8.8 0 0 1 9.1 3.4a8.8 8.8 0 1 0 11.5 11.5z"/><circle cx="16.8" cy="6.4" r="1.5" fill="rgba(255,255,255,0.6)"/>`,
};

/* ------------------------------------------------------------------ 状態異常の印 */

const STAT_GLYPH: Record<BuffStat, string> = {
  // 剣。上向きの刃と鍔で「攻撃」を示す
  atk: `<path fill="currentColor" d="M12 1.6 15.6 9v12.4H8.4V9L12 1.6z"/><rect x="5.6" y="8.4" width="12.8" height="2.6" rx="1.3" fill="currentColor"/>`,
  // 盾
  def: `<path fill="currentColor" d="M12 1.8 20 4.9v6.6c0 5.1-3.3 8.6-8 10.4-4.7-1.8-8-5.3-8-10.4V4.9l8-3.1z"/>`,
  // 速度線と山形
  spd: `<path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="M2.6 7.6h9.6M2.6 12h6.8M2.6 16.4h9.6"/><path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" d="m15.4 5.6 5.6 6.4-5.6 6.4"/>`,
  // 的
  criRate: `<circle cx="12" cy="12" r="8.6" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="12" cy="12" r="3.4" fill="currentColor"/>`,
  // 炸裂
  criDmg: `<path fill="currentColor" d="m12 1.4 2.5 5.3 5.3-2.1-2.1 5.3 5.3 2.5-5.3 2.5 2.1 5.3-5.3-2.1L12 22.6l-2.5-5.4-5.3 2.1 2.1-5.3L1 11.5l5.3-2.5-2.1-5.3 5.3 2.1L12 1.4z"/>`,
};

/** 印の分類。色と形の両方を切り替えるための束ね */
type ChipTone = "buff" | "debuff" | "stun" | "burn" | "poison" | "shield" | "blind" | "immune";

const CHIP_GLYPH: Record<Exclude<ChipTone, "buff" | "debuff">, string> = {
  // 目を回す渦
  stun: `<path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" d="M20.4 12a8.4 8.4 0 1 1-4.6-7.5"/><path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" d="M12 16.6a4.6 4.6 0 1 0-4.4-6"/>`,
  burn: ELEMENT_GLYPH.FIRE,
  // 毒の雫。中の2つの穴で「炎」と見間違えないようにする
  poison: `<path fill="currentColor" d="M12 2.4c-.4 0-.8.2-1 .5C8.4 6.3 5.2 10.4 5.2 14.2c0 4.4 3 7.6 6.8 7.6s6.8-3.2 6.8-7.6c0-3.8-3.2-7.9-5.8-11.3-.2-.3-.6-.5-1-.5z"/><circle cx="9.7" cy="14" r="1.7" fill="rgba(6,4,14,0.85)"/><circle cx="14.3" cy="14" r="1.7" fill="rgba(6,4,14,0.85)"/><rect x="10.4" y="17" width="3.2" height="2.2" rx="1.1" fill="rgba(6,4,14,0.85)"/>`,
  // 六角の結界。防御バフの「盾」と形で分ける
  shield: `<path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" d="M12 2.2 20.6 7v10L12 21.8 3.4 17V7L12 2.2z"/><path fill="currentColor" opacity="0.55" d="M12 6.4 17 9.2v5.6L12 17.6 7 14.8V9.2L12 6.4z"/>`,
  // 閉じた目に斜線
  blind: `<path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M2.6 12S6.6 5.8 12 5.8 21.4 12 21.4 12 17.4 18.2 12 18.2 2.6 12 2.6 12z"/><circle cx="12" cy="12" r="2.8" fill="currentColor"/><path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" d="M4.4 4.4 19.6 19.6"/>`,
  // 四つ角の輝き
  immune: `<path fill="currentColor" d="M12 1.6 14.2 9l7.4 2.2-7.4 2.2L12 22.4l-2.2-9L2.4 11.2 9.8 9 12 1.6z"/>`,
};

const CHIP_LABEL: Record<ChipTone, string> = {
  buff: "強化",
  debuff: "弱体",
  stun: "スタン",
  burn: "火傷",
  poison: "毒",
  shield: "シールド",
  blind: "暗闇",
  immune: "免疫",
};

/** 印を1つ組む。丸い受け皿・色の環・印・右下のターン数、で4層 */
function buildChip(tone: ChipTone, body: string, turns: string, title: string): HTMLElement {
  const chip = el("span", { className: `unit-chip unit-chip--${tone}`, title }, [
    el("span", { className: "unit-chip__face" }, [glyph(body)]),
  ]);
  if (turns) chip.append(el("span", { className: "unit-chip__turns" }, [turns]));
  return chip;
}

function buildStatChip(effect: ActiveEffect): HTMLElement {
  const isBuff = effect.kind === "BUFF";
  const percent = Math.round(Math.abs(effect.amount) * 100);
  const tone: ChipTone = isBuff ? "buff" : "debuff";
  const chip = buildChip(
    tone,
    STAT_GLYPH[effect.stat],
    String(effect.remainingTurns),
    `${BUFF_STAT_JA[effect.stat]} ${isBuff ? "+" : "-"}${percent}%(残り${effect.remainingTurns}ターン)`,
  );
  // 上向き/下向きの小さな三角。色を見なくても強化か弱体かが分かる
  chip.append(el("span", { className: "unit-chip__dir" }));
  return chip;
}

/**
 * その瞬間にかかっているものを印の列にする。
 * 5つを超えたら「+n」でまとめる。札の幅より印が長くなると
 * 4体並んだ時に列同士がぶつかって、どれが誰のものか分からなくなる。
 */
export function buildStatusChips(snapshot: UnitSnapshot): HTMLElement[] {
  const chips: HTMLElement[] = [];
  for (const effect of snapshot.effects) chips.push(buildStatChip(effect));
  if (snapshot.stunTurns > 0) {
    chips.unshift(buildChip("stun", CHIP_GLYPH.stun, String(snapshot.stunTurns), `${CHIP_LABEL.stun}(残り${snapshot.stunTurns}ターン)`));
  }
  if (snapshot.burnTurns > 0) {
    chips.push(buildChip("burn", CHIP_GLYPH.burn, String(snapshot.burnTurns), `${CHIP_LABEL.burn}(残り${snapshot.burnTurns}ターン)`));
  }
  if (snapshot.poisonStacks > 0) {
    chips.push(
      buildChip("poison", CHIP_GLYPH.poison, `${snapshot.poisonStacks}`, `毒 ${snapshot.poisonStacks}重(残り${snapshot.poisonTurns}ターン)`),
    );
  }
  if (snapshot.shieldValue > 0) {
    chips.push(
      buildChip("shield", CHIP_GLYPH.shield, String(snapshot.shieldTurns), `シールド ${snapshot.shieldValue}(残り${snapshot.shieldTurns}ターン)`),
    );
  }
  if (snapshot.blindTurns > 0) {
    chips.push(buildChip("blind", CHIP_GLYPH.blind, String(snapshot.blindTurns), `${CHIP_LABEL.blind}(残り${snapshot.blindTurns}ターン)`));
  }
  if (snapshot.immuneTurns > 0) {
    chips.push(buildChip("immune", CHIP_GLYPH.immune, String(snapshot.immuneTurns), `状態異常免疫(残り${snapshot.immuneTurns}ターン)`));
  }

  const LIMIT = 5;
  if (chips.length <= LIMIT) return chips;
  const shown = chips.slice(0, LIMIT - 1);
  shown.push(el("span", { className: "unit-chip unit-chip--more", title: "他にもかかっている効果があります" }, [`+${chips.length - (LIMIT - 1)}`]));
  return shown;
}

/* ------------------------------------------------------------------ 名前の解釈 */

export interface ParsedUnitName {
  /** 種族名だけ。属性・星・レベル・BOSSの飾りを外したもの */
  base: string;
  star: number | null;
  level: number | null;
  boss: boolean;
}

/**
 * 戦闘用の定義名から、札に出す要素を取り出す。
 *
 * 戦闘に渡ってくる名前は `ドラゴン[火]★5 Lv30` や
 * `古代のクリスタル[水]★4 Lv20 【BOSS】` のように、
 * **1本の文字列に4種類の情報が詰め込まれている**。
 * これをそのまま札に出していたので、幅が足りずに
 * 「古代のクリ…」「グリフォン[…」と、肝心の名前だけが削られていた。
 * 分解して、それぞれに合った置き場所(紋章・星・銘板)へ配る。
 */
export function parseUnitName(name: string): ParsedUnitName {
  let text = name;
  const boss = /【BOSS】/.test(text);
  text = text.replace(/【BOSS】/g, "");

  const level = /Lv\s*(\d+)/.exec(text);
  if (level) text = text.replace(level[0], "");

  // `★5` という書き方と `★★★★★` という書き方の両方が使われている
  const starNumber = /★\s*(\d+)/.exec(text);
  let star: number | null = starNumber ? Number(starNumber[1]) : null;
  if (starNumber) {
    text = text.replace(starNumber[0], "");
  } else {
    const starGlyphs = /★+/.exec(text);
    if (starGlyphs) {
      star = starGlyphs[0].length;
      text = text.replace(starGlyphs[0], "");
    }
  }

  // 属性は紋章で出すので、角括弧の飾りは名前から外す
  text = text.replace(/[[［][^\]］]*[\]］]/g, "");

  return { base: text.replace(/\s+/g, " ").trim(), star, level: level ? Number(level[1]) : null, boss };
}

/* ------------------------------------------------------------------ 札そのもの */

export interface UnitHudRefs {
  card: HTMLElement;
  plate: HTMLElement;
  hpFill: HTMLElement;
  /** 減った分を少し遅れて追いかける帯。どれだけ削られたかが目で分かる */
  hpTrail: HTMLElement;
  /** HPの上に重なるシールドの覆い */
  hpShield: HTMLElement;
  hpText: HTMLElement;
  gaugeFill: HTMLElement;
  chips: HTMLElement;
  /** 札が押し上げられた時に、本体まで引く細い線 */
  leader: HTMLElement;
}

/** 星の数を、額縁の等級(既存のレア度の色彩と同じ規則)へ写す */
function rankOf(star: number | null): string {
  if (star === null) return "none";
  if (star >= 6) return "6";
  if (star === 5) return "5";
  if (star === 4) return "4";
  if (star === 3) return "3";
  return "low";
}

/** 3Dキャラの頭上に重ねる、名前/HP/ATBのHUD札を作る */
export function buildHudCard(def: MonsterDefinition, team: "PLAYER" | "ENEMY"): { card: HTMLElement; refs: UnitHudRefs } {
  const parsed = parseUnitName(def.name);
  const element = def.element as Element;

  const chips = el("div", { className: "unit-hud__chips" });

  const crest = el("span", { className: "unit-hud__crest", title: `${ELEMENT_JA[element]}属性` }, [
    el("span", { className: "unit-hud__crest-face" }, [glyph(ELEMENT_GLYPH[element])]),
  ]);

  const head = el("div", { className: "unit-hud__head" }, [
    el("span", { className: "unit-hud__name" }, [parsed.base || def.name]),
  ]);
  if (parsed.star !== null) {
    head.append(
      el("span", { className: "unit-hud__rank", title: `★${parsed.star}` }, [
        el("span", { className: "unit-hud__rank-star" }, ["★"]),
        el("span", { className: "unit-hud__rank-num" }, [String(parsed.star)]),
      ]),
    );
  }

  const hpTrail = el("div", { className: "unit-hud__hp-trail" });
  const hpFill = el("div", { className: "unit-hud__hp-fill" });
  const hpShield = el("div", { className: "unit-hud__hp-shield" });
  const hpText = el("div", { className: "unit-hud__hp-text" }, [formatHpPair(def.stats.hp, def.stats.hp)]);
  const gaugeFill = el("div", { className: "unit-hud__gauge-fill" });

  const plate = el("div", { className: "unit-hud__plate" }, [
    crest,
    el("div", { className: "unit-hud__col" }, [
      head,
      // 追従バーは実バーの背面に置く。削られた瞬間だけ赤い帯として覗く
      el("div", { className: "unit-hud__hp" }, [
        hpTrail,
        hpFill,
        hpShield,
        el("div", { className: "unit-hud__hp-ticks" }),
        el("div", { className: "unit-hud__hp-gloss" }),
        hpText,
      ]),
      el("div", { className: "unit-hud__gauge" }, [gaugeFill]),
    ]),
  ]);

  const leader = el("div", { className: "unit-hud__leader" });

  const teamClass = team === "PLAYER" ? "unit-hud--player" : "unit-hud--enemy";
  const card = el(
    "div",
    { className: `unit-hud ${teamClass}`, "data-rank": rankOf(parsed.star), "data-element": element },
    [chips, plate, leader],
  );
  if (parsed.boss) {
    card.classList.add("unit-hud--boss");
    plate.prepend(el("span", { className: "unit-hud__boss" }, ["BOSS"]));
  }
  card.style.setProperty("--unit-color", def.color);

  return { card, refs: { card, plate, hpFill, hpTrail, hpShield, hpText, gaugeFill, chips, leader } };
}

/* ------------------------------------------------------------------ 飛び出す数字 */

export type FloatKind = "damage" | "damage-taken" | "crit" | "heal" | "resist";

/**
 * ダメージ/回復の数字を組む。
 *
 * 「重みが無い」と言われたので、3つの手当てを入れた。
 *   1. 芯の文字と、その後ろに置く**縁取り専用の複製**を分ける。
 *      1枚に縁取りを掛けるだけだと、太くするほど字が潰れる
 *   2. 会心は金のグラデーションで塗り、後ろに衝撃の輪を1枚敷く
 *   3. 自軍の被弾は赤、敵に通したダメージは白熱色。
 *      **どちらが痛いのか**が色だけで分かる
 */
export function buildFloatingNumber(kind: FloatKind, text: string): HTMLElement {
  const node = el("div", { className: `floating-number floating-number--${kind}` });
  if (kind === "crit") {
    node.append(el("span", { className: "floating-number__burst" }));
    node.append(el("span", { className: "floating-number__tag" }, ["CRITICAL"]));
  }
  node.append(el("span", { className: "floating-number__text", "data-text": text }, [text]));
  return node;
}
