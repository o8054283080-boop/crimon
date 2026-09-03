import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  EQUIP_MAX_LEVEL,
  EQUIP_SLOTS,
  EQUIP_STARS,
  EquipStar,
  SET_TYPES,
  SLOT_MAIN_STAT_OPTIONS,
  STAT_TYPES,
  StatType,
  enhanceEquipment,
  generateEquipment,
} from "../src/core/equipment.js";
import { MONSTER_DEX } from "../src/data/monsters.js";
import { LATENT_ABILITY_CANDIDATES } from "../src/data/latentAbilities.js";
import { STAR_MAX_LEVEL, STARS } from "../src/core/rarity.js";
import { ABILITY_POINT_BUDGETS } from "../src/core/monsterDevelopment.js";

/*
 * サーバが防衛編成を検分するための「ゲーム定義」。
 *
 * ## ここで守りたいこと
 *
 * 検分の表は `tools/exportArenaCatalog.mts` が生成する。生成物なので
 * 中身の正しさは**2方向から**確かめないと意味がない:
 *
 *   1. **本物の装備を弾かないこと。** 上限が低すぎると、
 *      正しく引いて正しく強化した装備が「不正」になる。
 *      実際に大量に生成して、1つも超えないことを見る
 *   2. **抜けが無いこと。** 図鑑・潜在覚醒・メインOPの候補が
 *      1件でも落ちていると、その組み合わせの人だけ登録できなくなる
 *
 * 上限が高すぎることは、ここでは咎めない。**弾き過ぎる方が害が大きい**
 * (遊べなくなる) ので、上限は「起こりうる最大」に置いてある。
 */

const MIGRATIONS = fileURLToPath(new URL("../supabase/migrations", import.meta.url));

/** いちばん新しい照合表を読む */
function latestCatalogSql(): string {
  const files = readdirSync(MIGRATIONS)
    .filter((name) => name.includes("arena_catalog") && name.endsWith(".sql"))
    .sort();
  expect(files.length, "照合表の migration が無い").toBeGreaterThan(0);
  return readFileSync(join(MIGRATIONS, files[files.length - 1]), "utf8");
}

const sql = latestCatalogSql();

/** `insert into <table> ... values` に続く行を、素直な形で取り出す */
function rowsOf(table: string): string[][] {
  const marker = `insert into public.${table} (`;
  const at = sql.indexOf(marker);
  expect(at, `${table} の挿入が無い`).toBeGreaterThan(-1);
  const from = sql.indexOf("values", at) + "values".length;
  const to = sql.indexOf(";", from);
  return sql.slice(from, to)
    .split("\n")
    .map((line) => line.trim().replace(/^\(|\),?$|\)$/g, "").trim())
    .filter((line) => line.length > 0)
    .map((line) => line.split(",").map((cell) => cell.trim().replace(/^'|'$/g, "")));
}

/* ==========================================================================
 * 1. 本物の装備を弾かないか
 * ========================================================================== */

const caps = new Map<string, { main: number; sub: number }>();
for (const [statType, star, level, main, sub] of rowsOf("arena_catalog_stat_caps")) {
  caps.set(`${statType}/${star}/${level}`, { main: Number(main), sub: Number(sub) });
}

function capFor(type: StatType, star: EquipStar, level: number) {
  const found = caps.get(`${type}/${star}/${level}`);
  expect(found, `上限が無い: ${type} 星${star} 強化${level}`).toBeDefined();
  return found!;
}

/** 決まった種の乱数。落ちた時に同じ盤面を再現できるようにする */
function seeded(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("上限が、正しく作った装備を弾かないこと", () => {
  it("6000個を生成して強化しても、1つも上限を超えない", () => {
    /*
     * **これが通らないと、真面目に遊んでいる人ほど登録できなくなる。**
     * 全スロット・全星・強化0〜15を通しで回す。
     */
    const rng = seeded(20260902);
    const violations: string[] = [];

    for (let i = 0; i < 6000; i += 1) {
      const slot = EQUIP_SLOTS[i % EQUIP_SLOTS.length];
      const star = EQUIP_STARS[i % EQUIP_STARS.length];
      const set = SET_TYPES[i % SET_TYPES.length];
      const item = generateEquipment({ slot, star, subStatCount: (i % 5), set, rng });
      const target = i % (EQUIP_MAX_LEVEL + 1);
      for (let l = 0; l < target; l += 1) enhanceEquipment(item, rng);

      const mainCap = capFor(item.mainStat.type, item.star, item.level).main;
      if (item.mainStat.value > mainCap) {
        violations.push(`メイン ${item.mainStat.type} 星${item.star} 強化${item.level}: ${item.mainStat.value} > ${mainCap}`);
      }
      for (const sub of item.subStats) {
        const subCap = capFor(sub.type, item.star, item.level).sub;
        if (sub.value > subCap) {
          violations.push(`サブ ${sub.type} 星${item.star} 強化${item.level}: ${sub.value} > ${subCap}`);
        }
      }
    }

    expect(violations.slice(0, 5)).toEqual([]);
  });

  it("上限は星と強化について下がらない", () => {
    // 下がる箇所があると、そこだけ正しい装備が落ちる
    for (const type of STAT_TYPES) {
      for (const star of EQUIP_STARS) {
        for (let level = 1; level <= EQUIP_MAX_LEVEL; level += 1) {
          expect(capFor(type, star, level).main,
            `${type} 星${star}: 強化${level} でメインの上限が下がった`)
            .toBeGreaterThanOrEqual(capFor(type, star, level - 1).main);
        }
      }
    }
  });
});

/* ==========================================================================
 * 2. 抜けが無いか
 * ========================================================================== */

describe("照合表に抜けが無いこと", () => {
  it("図鑑が全件入っている", () => {
    const rows = rowsOf("arena_catalog_monsters");
    expect(rows).toHaveLength(MONSTER_DEX.length);
    const ids = new Set(rows.map(([dexId]) => dexId));
    for (const entry of MONSTER_DEX) {
      expect(ids.has(entry.id), `${entry.id} が照合表に無い`).toBe(true);
    }
  });

  it("属性も一緒に持っている(図鑑IDだけでは属性の詐称を止められない)", () => {
    const byId = new Map(rowsOf("arena_catalog_monsters").map(([dexId, templateId, element]) =>
      [dexId, { templateId, element }]));
    for (const entry of MONSTER_DEX) {
      expect(byId.get(entry.id)).toEqual({ templateId: entry.templateId, element: entry.element });
    }
  });

  it("潜在覚醒の候補が全件入っている", () => {
    const rows = rowsOf("arena_catalog_latents");
    const expected = Object.values(LATENT_ABILITY_CANDIDATES).reduce((n, list) => n + list.length, 0);
    expect(rows).toHaveLength(expected);
    const pairs = new Set(rows.map(([dexId, latentId]) => `${dexId}/${latentId}`));
    for (const [dexId, candidates] of Object.entries(LATENT_ABILITY_CANDIDATES)) {
      for (const candidate of candidates) {
        expect(pairs.has(`${dexId}/${candidate.id}`), `${candidate.id} が照合表に無い`).toBe(true);
      }
    }
  });

  it("スロットごとのメインOP候補が一致する", () => {
    const rows = rowsOf("arena_catalog_slot_mains");
    const bySlot = new Map<number, Set<string>>();
    for (const [slot, statType] of rows) {
      const key = Number(slot);
      if (!bySlot.has(key)) bySlot.set(key, new Set());
      bySlot.get(key)!.add(statType);
    }
    for (const slot of EQUIP_SLOTS) {
      expect([...(bySlot.get(slot) ?? [])].sort())
        .toEqual([...SLOT_MAIN_STAT_OPTIONS[slot]].sort());
    }
  });

  it("星ごとのレベル上限と能力ポイントが一致する", () => {
    const rows = rowsOf("arena_catalog_star_rules");
    expect(rows).toHaveLength(STARS.length);
    for (const [star, maxLevel, points] of rows) {
      const s = Number(star) as (typeof STARS)[number];
      expect(Number(maxLevel), `星${s} のレベル上限`).toBe(STAR_MAX_LEVEL[s]);
      expect(Number(points), `星${s} の能力ポイント`).toBe(ABILITY_POINT_BUDGETS[s]);
    }
  });

  it("シリーズが全件入っている", () => {
    expect(rowsOf("arena_catalog_sets").map(([set]) => set).sort()).toEqual([...SET_TYPES].sort());
  });

  it("上限の表が 型 × 星 × 強化 を網羅している", () => {
    const rows = rowsOf("arena_catalog_stat_caps");
    expect(rows).toHaveLength(STAT_TYPES.length * EQUIP_STARS.length * (EQUIP_MAX_LEVEL + 1));
  });
});

describe("生成物であることが分かるようにしてある", () => {
  it("手で書き換えないよう書いてある", () => {
    // 生成物を手で直すと、次の生成で黙って消える
    expect(sql).toContain("このファイルは生成物です");
    expect(sql).toContain("tools/exportArenaCatalog.mts");
  });
});
