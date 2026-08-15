import { SummonResult } from "../../game/gacha.js";
import { el } from "../dom.js";

/**
 * 召喚演出の部品置き場。
 *
 * 召喚は「引く前のワクワク → 溜め → 出た瞬間の爆発 → レア度の特別感」で成り立つ。
 * その中でも見た目だけを担う飾り(魔法陣・粒子・閃光)と、
 * 「今回の引きがどれくらい嬉しいのか」を数値化する等級判定をここに集める。
 * summon.ts 側は流れの組み立てに集中できるようにする。
 *
 * 位置決めは CSS 側で長さ(vmin など)から計算する。
 * ここから渡すのは角度と遅延だけにして、画面サイズが変わっても崩れないようにする。
 */

/** 演出の派手さの段階。1=さっと出る、4=最大級の溜めと閃光 */
export type SummonGrade = 1 | 2 | 3 | 4;

/** 星とレア枠(光/闇)から、その1体の等級を出す */
export function gradeOfResult(r: SummonResult): SummonGrade {
  if (r.star >= 5) return r.isRare ? 4 : 3;
  if (r.star === 4) return r.isRare ? 3 : 2;
  return r.isRare ? 2 : 1;
}

/** 引いた結果全体の等級。一番良い1体で決まる(10連は最高レアが主役) */
export function gradeOfResults(results: SummonResult[]): SummonGrade {
  return results.reduce<SummonGrade>((best, r) => {
    const g = gradeOfResult(r);
    return g > best ? g : best;
  }, 1);
}

/** 星からレア度の呼び名。星4=SR、星5=SSR という本編の定義に合わせる */
export function rarityLabel(star: number): string {
  if (star >= 5) return "SSR";
  if (star === 4) return "SR";
  return "R";
}

/** 溜めの長さ(ms)。低レアはさっと、高レアはたっぷり溜める */
export const CHARGE_MS: Record<SummonGrade, number> = {
  1: 620,
  2: 1300,
  3: 2050,
  4: 2900,
};

/**
 * 溜めの段階。
 *
 * このゲームの召喚で一番効くのは「溜めの色がどこまで上がるか」で当たりが読めること。
 * 青 → 紫 → 金 → 虹 と段階が進み、進んだところで止まった色がそのまま等級になる。
 * 低レアは青のまま一瞬で終わり、最高レアだけが虹まで到達する。
 */
export interface ChargeStep {
  /** 溜め全体を1とした時の開始位置 */
  at: number;
  /** 付けるクラス(色と激しさが上がる) */
  cls: string;
  /** その段階で出す煽り文 */
  text: string;
}

export const CHARGE_STEPS: Record<SummonGrade, ChargeStep[]> = {
  1: [{ at: 0, cls: "charge-a", text: "召喚陣、起動" }],
  2: [
    { at: 0, cls: "charge-a", text: "召喚陣、起動" },
    { at: 0.44, cls: "charge-b", text: "紫の光が集まっていく…" },
  ],
  3: [
    { at: 0, cls: "charge-a", text: "召喚陣、起動" },
    { at: 0.32, cls: "charge-b", text: "紫の光が集まっていく…" },
    { at: 0.64, cls: "charge-c", text: "金色だ…! 大物が来る…!" },
  ],
  4: [
    { at: 0, cls: "charge-a", text: "召喚陣、起動" },
    { at: 0.26, cls: "charge-b", text: "紫の光が集まっていく…" },
    { at: 0.5, cls: "charge-c", text: "金色だ…! 大物が来る…!" },
    { at: 0.78, cls: "charge-d", text: "虹だ ………来るぞ!!" },
  ],
};

/** 円周上に等間隔で並べる小物を作る(ルーン文字・光点など) */
function ringItems(className: string, count: number, glyphs?: string[]): HTMLElement[] {
  return Array.from({ length: count }, (_, i) => {
    const deg = (360 / count) * i;
    return el(
      "i",
      {
        className,
        style: `--deg:${deg}deg;--i:${i};--delay:${((i % 6) * 0.11).toFixed(2)}s`,
      },
      glyphs ? [glyphs[i % glyphs.length]] : [],
    );
  });
}

const RUNES = ["✦", "✧", "◈", "❖", "✶", "⟡", "✥", "❉"];

/**
 * 召喚の祭壇(引く前の画面の主役)。
 * 二重の魔法陣がゆっくり逆回転し、中心の宝珠が呼吸するように光る。
 * 「まだ何も起きていないが、いつでも起こせる」状態を見せる。
 */
export function buildAltar(): HTMLElement {
  return el("div", { className: "altar" }, [
    el("i", { className: "altar__halo" }, []),
    el("i", { className: "altar__ring altar__ring--outer" }, []),
    el("i", { className: "altar__ring altar__ring--mid" }, []),
    el("i", { className: "altar__ring altar__ring--inner" }, []),
    el("div", { className: "altar__runes" }, ringItems("altar__rune", 8, RUNES)),
    el("div", { className: "altar__orb" }, [
      el("i", { className: "altar__orb-core" }, []),
      el("i", { className: "altar__orb-spec" }, []),
    ]),
    el("div", { className: "altar__motes" }, Array.from({ length: 16 }, (_, i) => moteAt(i, 16))),
  ]);
}

/** 立ちのぼる光の粒。位置と速さは番号から決めるので、毎回同じ見た目になる */
function moteAt(i: number, total: number): HTMLElement {
  const x = ((i * 37) % 100) + 0.5;
  const dur = 3.2 + ((i * 13) % 22) / 10;
  const delay = ((i * 29) % (total * 10)) / (total * 3);
  const size = 3 + ((i * 7) % 4);
  return el("i", {
    className: "mote",
    style: `left:${x.toFixed(1)}%;--dur:${dur.toFixed(1)}s;--delay:${delay.toFixed(2)}s;--size:${size}px`,
  });
}

/**
 * 結果画面の背面で走る演出レイヤ一式。
 * 奥から 暗幕 → 光条 → 魔法陣 → 収束粒子 → 光柱 → 衝撃波 → 飛散粒子 → 閃光 の順に重なる。
 * どの層をいつ動かすかは CSS 側の phase-* / charge-* クラスが決める。
 */
export function buildFxStage(): HTMLElement {
  return el("div", { className: "fx" }, [
    el("i", { className: "fx__backdrop" }, []),
    el("div", { className: "fx__rays" }, [el("i", {}, [])]),
    el("div", { className: "fx__circle" }, [
      // 光の玉は一番奥。魔法陣の線がその上に重なって初めて「陣」に見える
      el("i", { className: "fx__circle-core" }, []),
      el("i", { className: "fx__circle-a" }, []),
      el("i", { className: "fx__circle-b" }, []),
      el("i", { className: "fx__circle-c" }, []),
    ]),
    el("div", { className: "fx__converge" }, ringItems("fx__spark", 14)),
    el("i", { className: "fx__beam" }, []),
    el("i", { className: "fx__shock" }, []),
    el("i", { className: "fx__shock fx__shock--b" }, []),
    el("div", { className: "fx__burst" }, Array.from({ length: 18 }, (_, i) => burstMote(i))),
    el("i", { className: "fx__flash" }, []),
  ]);
}

/** 出た瞬間に中心から弾ける粒。角度と距離を番号で決める */
function burstMote(i: number): HTMLElement {
  const deg = (360 / 18) * i + (i % 3) * 5;
  const dist = 30 + ((i * 17) % 34);
  const delay = ((i * 11) % 9) / 100;
  const size = 5 + ((i * 5) % 5);
  return el("i", {
    className: "fx__bmote",
    style: `--deg:${deg}deg;--dist:${dist}vmin;--delay:${delay.toFixed(2)}s;--size:${size}px`,
  });
}

/**
 * 主役カードの周りを漂う光の粒。
 * 高レアのカードだけに付けて、「同じカードでもこれは別格」と分からせる。
 */
export function buildSparkles(count: number): HTMLElement {
  return el(
    "div",
    { className: "sparks" },
    Array.from({ length: count }, (_, i) => {
      const x = ((i * 53) % 108) - 4;
      const y = ((i * 31) % 112) - 6;
      const dur = 1.8 + ((i * 7) % 14) / 10;
      const delay = ((i * 17) % 20) / 10;
      const size = 4 + ((i * 3) % 4);
      return el("i", {
        className: "sparks__i",
        style: `left:${x}%;top:${y}%;--dur:${dur.toFixed(1)}s;--delay:${delay.toFixed(1)}s;--size:${size}px`,
      });
    }),
  );
}
