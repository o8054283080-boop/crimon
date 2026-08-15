import { SummonResult } from "../../game/gacha.js";
import { el } from "../dom.js";

/**
 * 召喚演出の部品置き場。
 *
 * 召喚は「引く前のワクワク → 溜め → 出た瞬間の爆発 → レア度の特別感」で成り立つ。
 * その中でも見た目だけを担う飾り(魔法陣・粒子・閃光)と、
 * 「今回の引きがどれくらい嬉しいのか」を数値化する等級判定をここに集める。
 * summon.ts 側は流れの組み立てに集中できるようにする。
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
  1: 700,
  2: 1250,
  3: 1900,
  4: 2600,
};

/** 溜めの途中で出す煽り文。段階が上がるほど「来るぞ」と分かる */
export const OMEN_TEXT: Record<SummonGrade, string[]> = {
  1: ["召喚陣、起動", "来る"],
  2: ["召喚陣、起動", "光が集まっていく…", "これは…!"],
  3: ["召喚陣、起動", "大きな気配がある…", "空気が張りつめる…!"],
  4: ["召喚陣、起動", "召喚陣が悲鳴を上げている…", "………来る!!"],
};

/** 円周上に等間隔で並べる小物を作る(ルーン文字・光点など) */
function ringItems(className: string, count: number, radius: string, glyphs?: string[]): HTMLElement[] {
  return Array.from({ length: count }, (_, i) => {
    const deg = (360 / count) * i;
    return el(
      "i",
      {
        className,
        style: `--deg:${deg}deg;--r:${radius};--i:${i};--delay:${(i * 0.13).toFixed(2)}s`,
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
    el("div", { className: "altar__glow" }, []),
    el("div", { className: "altar__ring altar__ring--outer" }, []),
    el("div", { className: "altar__ring altar__ring--mid" }, []),
    el("div", { className: "altar__ring altar__ring--inner" }, []),
    el("div", { className: "altar__runes" }, ringItems("altar__rune", 8, "44%", RUNES)),
    el("div", { className: "altar__orb" }, [el("i", { className: "altar__orb-core" }, []), el("i", { className: "altar__orb-spec" }, [])]),
    el("div", { className: "altar__motes" }, Array.from({ length: 14 }, (_, i) => moteAt(i, 14))),
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
 * 手前から 閃光 → 衝撃波 → 光条 → 収束粒子 → 魔法陣 → 暗幕 の順に重なる。
 * どの層をいつ動かすかは CSS 側の phase-* クラスが決める。
 */
export function buildFxStage(): HTMLElement {
  return el("div", { className: "fx" }, [
    el("div", { className: "fx__vignette" }, []),
    el("div", { className: "fx__circle" }, [
      el("i", { className: "fx__circle-a" }, []),
      el("i", { className: "fx__circle-b" }, []),
      el("i", { className: "fx__circle-c" }, []),
    ]),
    el("div", { className: "fx__converge" }, ringItems("fx__spark", 12, "50%")),
    el("div", { className: "fx__beam" }, []),
    el("div", { className: "fx__rays" }, []),
    el("div", { className: "fx__shock" }, []),
    el("div", { className: "fx__burstmotes" }, Array.from({ length: 16 }, (_, i) => burstMote(i))),
    el("div", { className: "fx__flash" }, []),
  ]);
}

/** 出た瞬間に中心から弾ける粒。角度と距離を番号で決める */
function burstMote(i: number): HTMLElement {
  const deg = (360 / 16) * i + (i % 3) * 4;
  const dist = 38 + ((i * 17) % 26);
  const delay = ((i * 11) % 9) / 100;
  return el("i", {
    className: "fx__bmote",
    style: `--deg:${deg}deg;--dist:${dist}%;--delay:${delay.toFixed(2)}s`,
  });
}
