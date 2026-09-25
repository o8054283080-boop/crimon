import { describe, expect, it } from "vitest";
import {
  type Accessory, accessoryBattleEffects, generateAccessory, grantSpecialBoosts, sanitizeAccessory,
  SPECIAL_BOOST_PER_STEP, specialValue,
} from "../src/core/accessory.js";
import { normalizeAccessories, tryEnhanceAccessory } from "../src/game/accessories.js";
import { createInitialState } from "../src/game/playerState.js";

/*
 * 依頼主の指摘:「アクセの5、10、15の強化が弱能力しか強化されない」。
 * 選んだ形は「特殊を1つずつ伸ばす」——段に届くたびに特殊効果から1つを選び、基礎値の2割伸ばす。
 */

function seq(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

function epic(): Accessory {
  return generateAccessory({ star: 6, rarity: "EPIC", family: "ATTACK", rng: seq([0.1, 0.3, 0.5, 0.7, 0.9, 0.2, 0.4]) });
}

describe("特殊効果は Lv5・10・15 で1つずつ伸びる", () => {
  it("1回選ばれると基礎値の2割伸び、表示も戦闘も同じ値を見る", () => {
    const acc = epic();
    const roll = acc.specials[0];
    const base = roll.value;
    roll.boosts = 1;
    expect(specialValue(roll)).toBeCloseTo(base * (1 + SPECIAL_BOOST_PER_STEP), 3);
    const effects = accessoryBattleEffects(acc);
    // 伸びた値が戦闘へ流れている(元の値ではない)
    const flat = JSON.stringify(effects);
    expect(flat).toContain(String(specialValue(roll)));
  });

  it("段に届いた数だけ配り、何度呼んでも増えすぎない", () => {
    const acc = epic();
    acc.level = 10;
    expect(grantSpecialBoosts(acc, seq([0.0, 0.99]))).toHaveLength(2);
    expect(grantSpecialBoosts(acc, seq([0.5]))).toHaveLength(0);
    const total = acc.specials.reduce((sum, r) => sum + (r.boosts ?? 0), 0);
    expect(total).toBe(2);
  });

  it("Lv4→5 の強化で1つ伸び、Lv5→6 では伸びない", () => {
    const state = createInitialState();
    const acc = epic();
    acc.level = 4;
    state.accessories = [acc];
    state.gold = 10_000_000;
    const at5 = tryEnhanceAccessory(state, acc.id, seq([0.4]));
    expect(at5.ok).toBe(true);
    expect(at5.level).toBe(5);
    expect(at5.grownSpecials).toHaveLength(1);
    const at6 = tryEnhanceAccessory(state, acc.id, seq([0.4]));
    expect(at6.grownSpecials).toHaveLength(0);
  });

  it("前から Lv15 まで育てていたアクセにも、読み込み時に3回ぶん配る(控えの移行)", () => {
    const state = createInitialState();
    const acc = epic();
    acc.level = 15;
    state.accessories = [JSON.parse(JSON.stringify(acc))];
    normalizeAccessories(state);
    const total = state.accessories![0].specials.reduce((sum, r) => sum + (r.boosts ?? 0), 0);
    expect(total).toBe(3);
    // もう一度読み込んでも増えない
    normalizeAccessories(state);
    expect(state.accessories![0].specials.reduce((sum, r) => sum + (r.boosts ?? 0), 0)).toBe(3);
  });

  it("防衛データの改ざんで、届いていない段の強化を乗せても削られる", () => {
    const acc = epic();
    acc.level = 1;
    const raw = JSON.parse(JSON.stringify(acc));
    raw.specials[0].boosts = 3;
    const clean = sanitizeAccessory(raw)!;
    expect(clean.specials.reduce((sum, r) => sum + (r.boosts ?? 0), 0)).toBe(0);
    raw.level = 10;
    const partial = sanitizeAccessory(raw)!;
    expect(partial.specials.reduce((sum, r) => sum + (r.boosts ?? 0), 0)).toBe(2);
  });
});

describe("「弱効果」とは画面に出さない(依頼主の指定)", () => {
  it("アクセの札・モンスター詳細・一覧の注記に「弱効果」の文字が無い", async () => {
    const { readFileSync } = await import("node:fs");
    for (const file of ["accessoryCard.ts", "monsters.ts", "accessories.ts", "ancientCraft.ts"]) {
      const src = readFileSync(new URL(`../src/web/views/${file}`, import.meta.url), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(src, `${file} に「弱効果」の表示が残っている`).not.toMatch(/["`'][^"`'\n]*弱効果/);
    }
  });
});
