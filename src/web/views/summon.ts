import { ELEMENT_JA } from "../../core/element.js";
import { Star } from "../../core/rarity.js";
import { findMonsterById } from "../../data/monsters.js";
import { SUMMON_COST_SINGLE, SUMMON_COST_TEN, SummonResult } from "../../game/gacha.js";
import { PlayerState } from "../../game/playerState.js";
import { el } from "../dom.js";
import { buildMonsterCard } from "./monsterCard.js";
import "../ui/summon.css";
import {
  buildAltar,
  buildFxStage,
  CHARGE_MS,
  gradeOfResult,
  gradeOfResults,
  OMEN_TEXT,
  rarityLabel,
  SummonGrade,
} from "./summonFx.js";

export interface SummonProps {
  player: PlayerState;
  lastResults: SummonResult[] | null;
  onSummon: (count: number) => void;
  onDismissResults: () => void;
  onUseSummonScroll: () => void;
}

/* ===== 引く前 ============================================================
 * 召喚は周回ゲームの最大の見せ場なので、待機画面から「これから何かが起きる」
 * 空気を作る。祭壇(回る魔法陣と宝珠)を画面の主役に置き、
 * 操作は下端にまとめて、1画面で完結させる。
 */

function costChip(icon: string, amount: number): HTMLElement {
  return el("span", { className: "summon-cta__cost" }, [`${icon} ${amount}`]);
}

function renderIdle(props: SummonProps): HTMLElement {
  const { player, onSummon, onUseSummonScroll } = props;
  const canSingle = player.crystal >= SUMMON_COST_SINGLE;
  const canTen = player.crystal >= SUMMON_COST_TEN;
  const hasScroll = player.summonScrolls > 0;

  const cta = el("div", { className: "summon-cta" }, [
    el(
      "button",
      {
        type: "button",
        className: "summon-cta__btn summon-cta__btn--ten",
        disabled: !canTen,
        onclick: () => onSummon(10),
      },
      [
        el("span", { className: "summon-cta__lead" }, ["10連召喚"]),
        el("span", { className: "summon-cta__sub" }, ["レア確定"]),
        costChip("💎", SUMMON_COST_TEN),
      ],
    ),
    el(
      "button",
      {
        type: "button",
        className: "summon-cta__btn summon-cta__btn--single",
        disabled: !canSingle,
        onclick: () => onSummon(1),
      },
      [el("span", { className: "summon-cta__lead" }, ["1回召喚"]), el("span", { className: "summon-cta__sub" }, ["星3以上確定"]), costChip("💎", SUMMON_COST_SINGLE)],
    ),
    el(
      "button",
      {
        type: "button",
        className: "summon-cta__btn summon-cta__btn--scroll",
        disabled: !hasScroll,
        onclick: onUseSummonScroll,
      },
      [
        el("span", { className: "summon-cta__lead" }, ["召喚の書"]),
        el("span", { className: "summon-cta__sub" }, ["ダイヤ不要"]),
        costChip("📜", player.summonScrolls),
      ],
    ),
  ]);

  return el("div", { className: "screen summon-screen" }, [
    el("div", { className: "summon-top" }, [
      el("h1", { className: "summon-top__title" }, ["召 喚"]),
      el("div", { className: "summon-top__wallet" }, [
        el("span", { className: "summon-wallet" }, [`💎 ${player.crystal}`]),
        el("span", { className: "summon-wallet summon-wallet--scroll" }, [`📜 ${player.summonScrolls}`]),
      ]),
    ]),
    el("div", { className: "summon-stage" }, [
      buildAltar(),
      el("div", { className: "summon-stage__caption" }, [
        el("span", { className: "summon-tag summon-tag--r" }, ["★3 R"]),
        el("span", { className: "summon-tag summon-tag--sr" }, ["★4 SR"]),
        el("span", { className: "summon-tag summon-tag--ssr" }, ["★5 SSR"]),
        el("span", { className: "summon-tag summon-tag--rare" }, ["光/闇 レア枠"]),
      ]),
    ]),
    el("p", { className: "summon-note" }, ["星3以上が確定。光・闇はレア枠で、10連では1体以上のレアが確定します。"]),
    cta,
  ]);
}

/* ===== 出たあと ==========================================================
 * 溜め(魔法陣が収束)→ 閃光 → 出現 の順に見せる。
 * 等級(星とレア枠)で溜めの長さ・色・閃光の強さが変わり、
 * 最高レアのカードだけは最後に一拍おいて、専用の光をまとって出す。
 */

/** 名前・星・レア度をまとめた銘板。単発の主役カードの下に敷く */
function heroPlate(r: SummonResult, name: string, element: string | null): HTMLElement {
  return el("div", { className: "hero__plate" }, [
    el("div", { className: "hero__rarity" }, [
      el("span", { className: `hero__rank hero__rank--${rarityLabel(r.star).toLowerCase()}` }, [rarityLabel(r.star)]),
      r.isRare ? el("span", { className: "hero__rare-tag" }, ["レア枠"]) : null,
      element ? el("span", { className: "hero__elem" }, [element]) : null,
    ].filter(isEl)),
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

  return el("div", { className: classes.join(" ") }, [
    el("div", { className: "pop__aura" }, []),
    buildMonsterCard(dex, r.dexId, () => {}, { star: r.star as Star }),
    r.star >= 4 ? el("span", { className: "pop__rank" }, [rarityLabel(r.star)]) : null,
  ].filter(isEl));
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
  return el("div", { className: "summon-summary" }, chips);
}

const BANNER_TEXT: Record<SummonGrade, string> = {
  1: "召喚完了",
  2: "レアが出た!",
  3: "SSR級の輝き!!",
  4: "最高レア出現!!!",
};

function renderResult(props: SummonProps): HTMLElement {
  const { player, lastResults, onSummon, onDismissResults } = props;
  const results = lastResults ?? [];
  const grade = gradeOfResults(results);
  const isSingle = results.length === 1;

  // 主役(最高等級の1体)は最後に、一拍おいて出す
  let heroIndex = 0;
  let bestGrade: SummonGrade = 1;
  results.forEach((r, i) => {
    const g = gradeOfResult(r);
    if (g > bestGrade) {
      bestGrade = g;
      heroIndex = i;
    }
  });

  const pops: HTMLElement[] = results.map((r, i) => popCard(r, { hero: isSingle, star: i === heroIndex && bestGrade >= 2 }));

  let body: HTMLElement;
  if (isSingle) {
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

  const actions = el("div", { className: "summon-actions" }, [
    el("button", { type: "button", className: "btn btn--ghost summon-actions__btn", onclick: onDismissResults }, ["閉じる"]),
    el(
      "button",
      {
        type: "button",
        className: "btn btn--primary summon-actions__btn",
        disabled: !canAgain,
        onclick: () => onSummon(results.length >= 10 ? 10 : 1),
      },
      [`もう一度 💎${again}`],
    ),
  ]);

  const omen = el("div", { className: "fx__omen" }, []);
  const banner = el("div", { className: "summon-banner" }, [
    el("span", { className: "summon-banner__text" }, [BANNER_TEXT[grade]]),
  ]);

  const skip = el("button", { type: "button", className: "summon-skip" }, [
    el("span", { className: "summon-skip__pill" }, ["スキップ ▶▶"]),
  ]);

  const root = el("div", { className: `screen summon-screen summon-screen--result g${grade}` }, [
    buildFxStage(),
    omen,
    el("div", { className: "summon-result" }, [banner, el("div", { className: "summon-result__body" }, [body]), summaryChips(results), actions]),
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

/**
 * 溜め → 閃光 → 出現 の時間割を進める。
 * どの時点でも「スキップ」で最終状態へ飛べる(周回するゲームなので必須)。
 */
function startSequence(opts: SequenceOptions): void {
  const { root, skip, omen, pops, heroIndex, grade, isSingle } = opts;
  const charge = CHARGE_MS[grade];
  const omenText = OMEN_TEXT[grade];
  const stagger = isSingle ? 0 : 85;
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

  const revealAll = (): void => {
    for (const p of pops) p.classList.add("is-in");
    pops[heroIndex]?.classList.add("is-lit");
  };

  const finish = (): void => {
    if (done) return;
    done = true;
    for (const t of timers) window.clearTimeout(t);
    timers.length = 0;
    omen.classList.remove("is-on");
    root.classList.remove("phase-charge", "charge-b", "charge-c");
    root.classList.add("phase-burst", "phase-reveal", "phase-done");
    revealAll();
    skip.remove();
  };

  skip.addEventListener("click", finish);

  requestAnimationFrame(() => {
    root.classList.add("phase-charge");
    showOmen(omenText[0]);

    at(charge * 0.42, () => {
      root.classList.add("charge-b");
      if (omenText[1]) showOmen(omenText[1]);
    });
    at(charge * 0.74, () => {
      root.classList.add("charge-c");
      if (omenText[2]) showOmen(omenText[2]);
    });

    at(charge, () => {
      root.classList.remove("phase-charge", "charge-b", "charge-c");
      root.classList.add("phase-burst");
      omen.classList.remove("is-on");
    });

    // 閃光の白がピークを過ぎたところでカードを出す
    at(charge + 150, () => {
      root.classList.add("phase-reveal");
      pops.forEach((p, i) => {
        if (i === heroIndex && !isSingle) return;
        at(i * stagger, () => p.classList.add("is-in"));
      });
      const heroDelay = isSingle ? 0 : pops.length * stagger + 260;
      at(heroDelay, () => {
        root.classList.add("hero-in");
        pops[heroIndex]?.classList.add("is-in", "is-lit");
      });
      at(heroDelay + 500, () => {
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
