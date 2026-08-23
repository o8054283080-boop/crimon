import { ELEMENT_JA } from "../../core/element.js";
import { Star } from "../../core/rarity.js";
import { findMonsterById } from "../../data/monsters.js";
import { SUMMON_COST_SINGLE, SUMMON_COST_TEN, SummonResult } from "../../game/gacha.js";
import { PlayerState } from "../../game/playerState.js";
import { el } from "../dom.js";
import { icon, IconName } from "../icons.js";
import { buildMonsterCard } from "./monsterCard.js";
import "../ui/summon.css";
import {
  buildAltar,
  buildFxStage,
  buildSparkles,
  CHARGE_MS,
  CHARGE_STEPS,
  gradeOfResult,
  gradeOfResults,
  rarityLabel,
  SummonGrade,
} from "./summonFx.js";

export interface SummonProps {
  player: PlayerState;
  lastResults: SummonResult[] | null;
  onSummon: (count: number) => void;
  onDismissResults: () => void;
  /** 召喚の書で引く。枚数ぶん消費する */
  onUseSummonScroll: (count: number) => void;
}

/* ===== 引く前 ============================================================
 * 召喚は周回ゲームの最大の見せ場なので、待機画面から「これから何かが起きる」
 * 空気を作る。祭壇(回る魔法陣と宝珠)を画面の主役に置き、
 * 操作は下端にまとめて、1画面で完結させる。
 */

/**
 * 押す場所の作り。
 *
 * 前は4つが同じ高さの矩形で2×2に並んでいて、**10連と1回の差が値段でしか
 * 分からなかった**。ここでは「何で払うか」と「どれだけの重さか」を
 * 見た目の階段にする:
 *
 *   1段目 ダイヤ10連 … 画面でいちばん明るい金の面。高さも一番ある
 *   2段目 ダイヤ1回  … 冷たい鋼の面。金の下に付く
 *   3段目 書の2つ    … 並べて小さく。持っている時だけ意味を持つ
 *
 * 中身の並びも縦積みをやめ、**左に名前・右に値段**の横並びにした。
 * 値段が右端に揃うので、3つを見比べた時に高い安いが一瞬で分かる。
 */
interface CtaOptions {
  className: string;
  lead: string;
  sub: string;
  costIcon: IconName;
  cost: number;
  /** 払えるか。払えない時は値札だけを赤く光らせ、理由を値札の下に出す */
  enough: boolean;
  onClick: () => void;
}

function ctaButton(o: CtaOptions): HTMLElement {
  return el(
    "button",
    {
      type: "button",
      className: `summon-cta__btn ${o.className}`,
      disabled: !o.enough,
      onclick: o.onClick,
    },
    [
      el("span", { className: "summon-cta__text" }, [
        el("span", { className: "summon-cta__lead" }, [o.lead]),
        el("span", { className: "summon-cta__sub" }, [o.sub]),
      ]),
      el("span", { className: "summon-cta__cost" }, [
        icon(o.costIcon),
        el("strong", {}, [o.cost.toLocaleString("ja-JP")]),
      ]),
    ],
  );
}

function renderIdle(props: SummonProps): HTMLElement {
  const { player, onSummon, onUseSummonScroll } = props;
  const canSingle = player.crystal >= SUMMON_COST_SINGLE;
  const canTen = player.crystal >= SUMMON_COST_TEN;
  const hasScroll = player.summonScrolls > 0;
  const hasScrollTen = player.summonScrolls >= 10;

  const cta = el("div", { className: "summon-cta" }, [
    ctaButton({
      className: "summon-cta__btn--ten",
      lead: "10連召喚",
      sub: "★4以上 1体確定",
      costIcon: "crystal",
      cost: SUMMON_COST_TEN,
      enough: canTen,
      onClick: () => onSummon(10),
    }),
    ctaButton({
      className: "summon-cta__btn--single",
      lead: "1回召喚",
      sub: "★3以上 確定",
      costIcon: "crystal",
      cost: SUMMON_COST_SINGLE,
      enough: canSingle,
      onClick: () => onSummon(1),
    }),
    el("div", { className: "summon-cta__pair" }, [
      ctaButton({
        className: "summon-cta__btn--scroll",
        lead: "書で10連",
        sub: "★4以上 1体確定",
        costIcon: "scroll",
        cost: 10,
        enough: hasScrollTen,
        onClick: () => onUseSummonScroll(10),
      }),
      ctaButton({
        className: "summon-cta__btn--scroll",
        lead: "書で1回",
        sub: "ダイヤ不要",
        costIcon: "scroll",
        cost: 1,
        enough: hasScroll,
        onClick: () => onUseSummonScroll(1),
      }),
    ]),
  ]);

  return el("div", { className: "screen summon-screen" }, [
    el("div", { className: "summon-top" }, [
      el("h1", { className: "summon-top__title" }, ["召　喚"]),
      el("div", { className: "summon-top__wallet" }, [
        el("span", { className: "summon-wallet" }, [icon("crystal"), String(player.crystal.toLocaleString("ja-JP"))]),
        el("span", { className: "summon-wallet summon-wallet--scroll" }, [icon("scroll"), String(player.summonScrolls)]),
      ]),
    ]),
    // 祭壇は「浮いている絵」ではなく「坩堝の上に立っているもの」にする。
    // 台座と、その下から昇る熾火がホームの寒暖対比をこの画面へつなぐ
    el("div", { className: "summon-stage" }, [buildAltar(), el("i", { className: "summon-stage__plinth" }, [])]),
    el("div", { className: "summon-bottom" }, [
      el("div", { className: "summon-rates" }, [
        el("span", { className: "summon-rates__label" }, ["出現"]),
        el("span", { className: "summon-tag summon-tag--r" }, ["★3 R"]),
        el("span", { className: "summon-tag summon-tag--sr" }, ["★4 SR"]),
        el("span", { className: "summon-tag summon-tag--ssr" }, ["★5 SSR"]),
        el("span", { className: "summon-tag summon-tag--rare" }, ["光/闇 レア枠"]),
      ]),
      // 確定の話はボタンの副題が言っている。ここに残すのは**そこに書けない1つ**だけ
      el("p", { className: "summon-note" }, ["光・闇のレア枠は確定枠とは別に抽選されます"]),
      cta,
    ]),
  ]);
}

/* ===== 出たあと ==========================================================
 * 溜め(魔法陣が収束し、青→紫→金→虹と色が上がる)→ 閃光 → 出現 の順に見せる。
 * どこまで色が上がったかがそのまま等級なので、出る前に期待が持てる。
 * 最高等級の1体は最後に一拍おいて、専用の光と粒をまとって出す。
 */

/** 名前・星・レア度をまとめた銘板。単発の主役カードに添える */
function heroPlate(r: SummonResult, name: string, element: string | null): HTMLElement {
  return el("div", { className: "hero__plate" }, [
    el(
      "div",
      { className: "hero__rarity" },
      [
        el("span", { className: `hero__rank hero__rank--${rarityLabel(r.star).toLowerCase()}` }, [rarityLabel(r.star)]),
        r.isRare ? el("span", { className: "hero__rare-tag" }, ["レア枠"]) : null,
        element ? el("span", { className: "hero__elem" }, [element]) : null,
      ].filter(isEl),
    ),
    el("div", { className: "hero__name" }, [name]),
    el("div", { className: "hero__stars" }, ["★".repeat(r.star)]),
  ]);
}

function isEl(node: HTMLElement | null): node is HTMLElement {
  return node !== null;
}

/** 結果1体分のカード。出現アニメの起点になる包みを1枚かぶせる */
function popCard(r: SummonResult, opts: { hero?: boolean; star?: boolean }): HTMLElement {
  const dex = findMonsterById(r.dexId);
  const grade = gradeOfResult(r);
  const classes = ["pop", `pop--g${grade}`];
  if (opts.star) classes.push("pop--star");
  if (opts.hero) classes.push("pop--hero");

  return el(
    "div",
    { className: classes.join(" ") },
    [
      el("i", { className: "pop__aura" }, []),
      el("i", { className: "pop__ring" }, []),
      buildMonsterCard(dex, r.dexId, () => {}, { star: r.star as Star }),
      r.star >= 4 ? el("span", { className: "pop__rank" }, [rarityLabel(r.star)]) : null,
      grade >= 3 ? buildSparkles(opts.hero ? 12 : 6) : null,
    ].filter(isEl),
  );
}

function summaryChips(results: SummonResult[]): HTMLElement {
  const counts = new Map<string, number>();
  for (const r of results) {
    const key = rarityLabel(r.star);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const order = ["SSR", "SR", "R"];
  const rareCount = results.filter((r) => r.isRare).length;
  const chips = order
    .filter((k) => counts.has(k))
    .map((k) => el("span", { className: `sum-chip sum-chip--${k.toLowerCase()}` }, [`${k} ×${counts.get(k)}`]));
  if (rareCount > 0) chips.push(el("span", { className: "sum-chip sum-chip--rare" }, [`レア枠 ×${rareCount}`]));
  // 色の付いた札が宙に浮いているだけでは「何の数字か」が読み取れない。
  // 金の罫を持つ銘板に嵌めて、引きの内訳だと言い切る
  return el("div", { className: "summon-summary" }, [
    el("span", { className: "summon-summary__label" }, [`${results.length}体の内訳`]),
    el("div", { className: "summon-summary__chips" }, chips),
  ]);
}

/**
 * 出た瞬間の見出し。
 * 同じ等級でも「星が高い」のか「レア枠(光/闇)を引いた」のかで嬉しさの理由が違うので、
 * 主役の1体を見て言い分ける。
 */
function bannerText(best: SummonResult | undefined, grade: SummonGrade): string {
  if (!best || grade === 1) return "召喚完了";
  const rank = rarityLabel(best.star);
  if (grade === 4) return `虹級! ${rank} レア枠!!!`;
  if (best.isRare) return grade === 3 ? `レア枠の${rank}!!` : "レア枠が出た!";
  return grade === 3 ? `${rank}出現!!` : `${rank}が出た!`;
}

function renderResult(props: SummonProps): HTMLElement {
  const { player, lastResults, onSummon, onDismissResults } = props;
  const results = lastResults ?? [];
  const grade = gradeOfResults(results);
  const isSingle = results.length <= 1;

  // 主役(最高等級の1体)は最後に、一拍おいて出す。
  // 10連では並びの最後に置き直して、右下でトリを飾らせる。
  let bestIndex = 0;
  let bestGrade: SummonGrade = 1;
  results.forEach((r, i) => {
    const g = gradeOfResult(r);
    if (g > bestGrade) {
      bestGrade = g;
      bestIndex = i;
    }
  });
  const ordered = isSingle ? results : [...results.filter((_, i) => i !== bestIndex), results[bestIndex]];
  const heroIndex = ordered.length - 1;

  const pops: HTMLElement[] = ordered.map((r, i) =>
    popCard(r, { hero: isSingle, star: i === heroIndex && bestGrade >= 2 }),
  );

  let body: HTMLElement;
  if (isSingle && results.length === 1) {
    const r = results[0];
    const dex = findMonsterById(r.dexId);
    body = el("div", { className: "hero" }, [
      el("div", { className: "hero__card" }, [pops[0]]),
      heroPlate(r, dex ? dex.name : r.dexId, dex ? `${ELEMENT_JA[dex.element]}属性` : null),
    ]);
  } else {
    body = el("div", { className: "grid10" }, pops);
  }

  const again = results.length >= 10 ? SUMMON_COST_TEN : SUMMON_COST_SINGLE;
  const canAgain = player.crystal >= again;

  // 周回する遊びなので、次に押されるのはほぼ必ず「もう一度」。
  // 前は「閉じる」と同じ幅・同じ高さで並んでいて、**次の一手が読めなかった**。
  // 金の面を大きく取り、閉じるは脇へ寄せる。値段の💎も絵文字をやめて図に直す
  const actions = el("div", { className: "summon-actions" }, [
    el("button", { type: "button", className: "btn btn--ghost summon-actions__close", onclick: onDismissResults }, ["閉じる"]),
    el(
      "button",
      {
        type: "button",
        className: "btn btn--gold summon-actions__again",
        disabled: !canAgain,
        onclick: () => onSummon(results.length >= 10 ? 10 : 1),
      },
      [
        el("span", { className: "summon-actions__again-lead" }, [results.length >= 10 ? "もう10連" : "もう一度"]),
        el("span", { className: "summon-actions__again-cost" }, [icon("crystal"), el("strong", {}, [again.toLocaleString("ja-JP")])]),
      ],
    ),
  ]);

  const omen = el("div", { className: "fx__omen" }, []);
  const banner = el("div", { className: "summon-banner" }, [
    el("span", { className: "summon-banner__text" }, [bannerText(results[bestIndex], grade)]),
  ]);

  // ▶ は端末によって色付きの絵文字で描かれる。同じ一式の線で描いた山括弧に直す
  const skip = el("button", { type: "button", className: "summon-skip", ariaLabel: "演出をスキップ" }, [
    el("span", { className: "summon-skip__pill" }, ["スキップ", icon("chevron"), icon("chevron")]),
  ]);

  const root = el("div", { className: `screen summon-screen summon-screen--result g${grade}` }, [
    buildFxStage(),
    omen,
    el("div", { className: "summon-result" }, [
      banner,
      // 引きの内訳はカードの真下に置く。離すと「何が出たか」と結び付かない。
      // ただし1体だけの時は「1体の内訳 R×1」という**数える意味のない表**に
      // なるので出さない。銘板が名前も星もレア度も既に言っている
      el(
        "div",
        { className: "summon-result__body" },
        results.length > 1 ? [body, summaryChips(results)] : [body],
      ),
      actions,
    ]),
    skip,
  ]);

  startSequence({ root, skip, omen, pops, heroIndex, grade, isSingle });
  return root;
}

interface SequenceOptions {
  root: HTMLElement;
  skip: HTMLElement;
  omen: HTMLElement;
  pops: HTMLElement[];
  heroIndex: number;
  grade: SummonGrade;
  isSingle: boolean;
}

const CHARGE_CLASSES = ["phase-charge", "charge-a", "charge-b", "charge-c", "charge-d"];

/**
 * 溜め → 閃光 → 出現 の時間割を進める。
 * どの時点でも画面のどこかを押せば最終状態へ飛べる(周回するゲームなので必須)。
 */
function startSequence(opts: SequenceOptions): void {
  const { root, skip, omen, pops, heroIndex, grade, isSingle } = opts;
  const charge = CHARGE_MS[grade];
  const steps = CHARGE_STEPS[grade];
  const stagger = isSingle ? 0 : 80;
  const timers: number[] = [];
  let done = false;

  const at = (ms: number, fn: () => void): void => {
    timers.push(window.setTimeout(fn, ms));
  };

  const showOmen = (text: string): void => {
    omen.textContent = text;
    omen.classList.remove("is-on");
    // 一度クラスを外して再度付け直し、同じアニメを繰り返し走らせる
    void omen.offsetWidth;
    omen.classList.add("is-on");
  };

  const finish = (): void => {
    if (done) return;
    done = true;
    for (const t of timers) window.clearTimeout(t);
    timers.length = 0;
    omen.classList.remove("is-on");
    root.classList.remove(...CHARGE_CLASSES);
    root.classList.add("phase-burst", "phase-reveal", "phase-done");
    for (const p of pops) p.classList.add("is-in");
    pops[heroIndex]?.classList.add("is-lit");
    skip.remove();
  };

  skip.addEventListener("click", finish);

  requestAnimationFrame(() => {
    root.classList.add("phase-charge");
    for (const step of steps) {
      at(charge * step.at, () => {
        root.classList.add(step.cls);
        showOmen(step.text);
      });
    }

    // --- 閃光 ---
    at(charge, () => {
      root.classList.remove(...CHARGE_CLASSES);
      root.classList.add("phase-burst");
      omen.classList.remove("is-on");
    });

    // --- 出現(白がピークを過ぎたところでカードを出す)---
    at(charge + 140, () => {
      root.classList.add("phase-reveal");
      pops.forEach((p, i) => {
        if (i === heroIndex && !isSingle) return;
        at(i * stagger, () => p.classList.add("is-in"));
      });
      const heroDelay = isSingle ? 0 : (pops.length - 1) * stagger + 320;
      at(heroDelay, () => {
        root.classList.add("hero-in");
        pops[heroIndex]?.classList.add("is-in", "is-lit");
      });
      at(heroDelay + 420, () => {
        if (done) return;
        done = true;
        root.classList.add("phase-done");
        skip.remove();
      });
    });
  });
}

export function renderSummon(props: SummonProps): HTMLElement {
  return props.lastResults ? renderResult(props) : renderIdle(props);
}
