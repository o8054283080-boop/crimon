import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createInitialState, type PlayerState } from "../src/game/playerState.js";
import { createMonsterInstance } from "../src/core/monsterInstance.js";
import { LIMIT_POINT_RESET_COST } from "../src/core/monsterDevelopment.js";
import {
  clampLimitDraft, isLimitPointsConfirmed, resetLimitPoints, setLimitPoints, unlockLimitBreak,
} from "../src/game/ancientCraft.js";

/*
 * 限界能力付与を、能力ポイントと同じ作りにする(依頼主の指定)。
 * 「50回タップしないとだめなので能力付与と同じようにできるように」
 * 「ふり直しに50万ゴールドかかるように」
 */

function unlocked(): PlayerState {
  const state = createInitialState();
  state.monsters = [createMonsterInstance("knight_FIRE", 6, 60)];
  state.evolutionCores = 100;
  unlockLimitBreak(state, state.monsters[0].id);
  return state;
}

describe("確定と有料リセット", () => {
  it("振り直しの代金は50万ゴールド", () => {
    expect(LIMIT_POINT_RESET_COST).toBe(500_000);
  });
  it("1点も振っていない配分は確定できない", () => {
    const state = unlocked();
    expect(setLimitPoints(state, state.monsters[0].id, { hp: 0, atk: 0, def: 0, spd: 0 }).ok).toBe(false);
    expect(isLimitPointsConfirmed(state.monsters[0])).toBe(false);
  });
  it("確定した配分は、そのままでは変えられない", () => {
    const state = unlocked();
    const id = state.monsters[0].id;
    expect(setLimitPoints(state, id, { hp: 0, atk: -50, def: 0, spd: 50 }).ok).toBe(true);
    expect(isLimitPointsConfirmed(state.monsters[0])).toBe(true);
    const again = setLimitPoints(state, id, { hp: -50, atk: 50, def: 0, spd: 0 });
    expect(again.ok).toBe(false);
    expect(state.monsters[0].development.limitBreak?.points).toEqual({ hp: 0, atk: -50, def: 0, spd: 50 });
  });
  it("リセットは50万ゴールド。払うと0に戻り、また無料で振れる", () => {
    const state = unlocked();
    const id = state.monsters[0].id;
    setLimitPoints(state, id, { hp: 0, atk: -50, def: 0, spd: 50 });
    state.gold = LIMIT_POINT_RESET_COST - 1;
    expect(resetLimitPoints(state, id).ok).toBe(false);
    expect(state.gold).toBe(LIMIT_POINT_RESET_COST - 1);
    state.gold = LIMIT_POINT_RESET_COST + 7;
    expect(resetLimitPoints(state, id).ok).toBe(true);
    expect(state.gold).toBe(7);
    expect(state.monsters[0].development.limitBreak).toEqual({ unlocked: true, points: { hp: 0, atk: 0, def: 0, spd: 0 } });
    expect(setLimitPoints(state, id, { hp: -50, atk: 50, def: 0, spd: 0 }).ok).toBe(true);
  });
  it("確定していない時のリセットは代金を取らない(連打しても二重に払わない)", () => {
    const state = unlocked();
    const id = state.monsters[0].id;
    setLimitPoints(state, id, { hp: 0, atk: -10, def: 0, spd: 10 });
    state.gold = LIMIT_POINT_RESET_COST * 3;
    expect(resetLimitPoints(state, id).ok).toBe(true);
    expect(resetLimitPoints(state, id).ok).toBe(false);
    expect(state.gold).toBe(LIMIT_POINT_RESET_COST * 2);
  });
});

describe("スライダーの丸め(clampLimitDraft)", () => {
  const zero = { hp: 0, atk: 0, def: 0, spd: 0 };
  it("端まで引けば一度に±50まで動く(50回押さなくてよい)", () => {
    expect(clampLimitDraft(zero, "spd", 50).spd).toBe(50);
    expect(clampLimitDraft(zero, "atk", -50).atk).toBe(-50);
  });
  it("+側は他の能力と合わせて50を越えない", () => {
    expect(clampLimitDraft({ ...zero, spd: 30 }, "atk", 50)).toEqual({ hp: 0, atk: 20, def: 0, spd: 30 });
  });
  it("−側も他の能力と合わせて50を越えない", () => {
    expect(clampLimitDraft({ ...zero, hp: -40, spd: 50 }, "def", -50)).toEqual({ hp: -40, atk: 0, def: -10, spd: 50 });
  });
  it("+から−へ、同じ能力の中で行き来できる", () => {
    const plus = clampLimitDraft({ ...zero, atk: 20 }, "atk", -30);
    expect(plus.atk).toBe(-30);
  });
  it("小数や範囲外は整数に丸める", () => {
    expect(clampLimitDraft(zero, "hp", 12.7).hp).toBe(12);
    expect(clampLimitDraft(zero, "hp", 999).hp).toBe(50);
    expect(clampLimitDraft(zero, "hp", Number.NaN).hp).toBe(0);
  });
});

describe("画面", () => {
  const view = readFileSync(new URL("../src/web/views/limitBreak.ts", import.meta.url), "utf8");
  it("各能力にスライダー(−50〜+50)がある", () => {
    expect(view).toMatch(/type: "range"/);
    expect(view).toMatch(/min: String\(-LIMIT_POINT_MAX_PLUS\)/);
    expect(view).toMatch(/max: String\(LIMIT_POINT_MAX_PLUS\)/);
  });
  it("動かしている最中は描き直さず、指を離した時だけ描き直す(ドラッグが途切れないように)", () => {
    expect(view).toMatch(/oninput: \(event: Event\) => \{ draft = props\.onSet\(/);
    expect(view).toMatch(/onchange: \(\) => props\.onCommit\(\)/);
  });
  it("確定後はスライダーを止め、有料のリセットを出す", () => {
    expect(view).toMatch(/disabled: confirmed/);
    expect(view).toMatch(/限界能力付与リセット \$\{cost\} GOLD/);
  });
});
