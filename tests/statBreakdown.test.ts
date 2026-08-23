import { describe, expect, it } from "vitest";
import { applyEquipmentToStats, generateEquipment } from "../src/core/equipment.js";
import { computeEffectiveStats } from "../src/core/rarity.js";
import { EXTRA_STAT_FORMATS, PRIMARY_STAT_FORMATS, Stats, buildStatBreakdown } from "../src/core/stats.js";
import { findMonsterById } from "../src/data/monsters.js";

/**
 * 装備込みの合計値しか出していなかったため、**その数字のうちどれだけが装備のおかげなのか**が
 * 画面から読み取れなかった。装備を組み替える判断はその差分を見てするものなので、
 * 素の値と装備の上昇分を分けて持たせてある。
 */

const BASE: Stats = { hp: 30000, atk: 3500, def: 3500, spd: 200, criRate: 0.6, criDmg: 2.5, resistance: 0.15, accuracy: 0.1 };

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("装備によるステータス上昇分の内訳", () => {
  it("装備を着けていなければ、上昇分は表示されない", () => {
    for (const entry of buildStatBreakdown(BASE, BASE, PRIMARY_STAT_FORMATS)) {
      expect(entry.gain, entry.label).toBeNull();
      expect(entry.base).toBe(entry.total);
    }
  });

  it("**画面に出る数字どうしで「素の値 + 上昇分 = 合計」が必ず成り立つ**", () => {
    // 実数のまま引き算してから丸めると、丸め方の都合で1ずれて見えることがある。
    // 表示に出す整数どうしの差で出すこと
    const withGear: Stats = { ...BASE, hp: 41234.6, atk: 4820.4, def: 3500, spd: 271.5, criRate: 0.874, criDmg: 3.116, resistance: 0.15, accuracy: 0.42 };
    for (const entry of [
      ...buildStatBreakdown(BASE, withGear, PRIMARY_STAT_FORMATS),
      ...buildStatBreakdown(BASE, withGear, EXTRA_STAT_FORMATS),
    ]) {
      const num = (text: string | null) => (text === null ? 0 : Number(text.replace(/[^0-9.-]/g, "")));
      const sign = entry.gain?.startsWith("−") ? -1 : 1;
      expect(num(entry.base) + sign * num(entry.gain), entry.label).toBe(num(entry.total));
    }
  });

  it("クリダメの上昇分に「+」が二重に付かない", () => {
    // クリダメは1.5倍を「+150%」と見せる決まりがあるので、
    // 素の値と同じ書式のまま増減の符号を足すと「++50%」になってしまう
    const withGear: Stats = { ...BASE, criDmg: 3.0 };
    const criDmg = buildStatBreakdown(BASE, withGear, EXTRA_STAT_FORMATS).find((e) => e.key === "criDmg")!;
    expect(criDmg.base).toBe("+150%");
    expect(criDmg.total).toBe("+200%");
    expect(criDmg.gain).toBe("+50%");
  });

  it("実際に装備をフルで着けた時、主要4項目のどれかは必ず上昇分が出る", () => {
    const rng = mulberry32(7);
    const dex = findMonsterById("dragon_FIRE")!;
    const growth = computeEffectiveStats(dex.stats, 6, 60);
    const gear = ([1, 2, 3, 4, 5, 6] as const).map((slot) => generateEquipment({ slot, star: 6, subStatCount: 4, rng }));
    const total = applyEquipmentToStats(growth, gear);

    const entries = buildStatBreakdown(growth, total, PRIMARY_STAT_FORMATS);
    expect(entries.filter((e) => e.gain !== null).length).toBeGreaterThan(0);
  });
});
