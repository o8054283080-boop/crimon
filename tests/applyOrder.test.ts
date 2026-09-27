import { describe, expect, it } from "vitest";
import { applyStatEffect, applyStatus, cleanseDebuffs, createBattleUnit, stealBuffs, stripBuffs } from "../src/battle/unit.js";
import { findMonster } from "../src/data/monsters.js";

/*
 * 依頼主の指定(2026-09-27): **解除は種類ではなく「付いた順」。**強化解除・強化奪取・弱体解除すべて。
 * 以前は強化解除が必ず免疫から剥がし、弱体解除は能力の弱体→状態→毒→治癒阻害→気絶…の種類順だった。
 * 掛け直したものは「新しく付いた」扱いで後ろへ回る。
 */
const unit = () => createBattleUnit(findMonster("golem", "WATER")!, "ENEMY", "E1");

describe("強化解除は付いた順", () => {
  it("先に張った攻撃UPが先に外れ、後から張った免疫は残る", () => {
    const u = unit();
    applyStatEffect(u, "atk", 0.3, 2, "BUFF");
    u.immuneTurns = 2;
    expect(stripBuffs(u, 1)).toBe(1);
    expect(u.effects.some((e) => e.kind === "BUFF")).toBe(false);
    expect(u.immuneTurns).toBe(2);
  });

  it("免疫を先に張れば免疫が先に外れる", () => {
    const u = unit();
    u.immuneTurns = 2;
    applyStatEffect(u, "atk", 0.3, 2, "BUFF");
    stripBuffs(u, 1);
    expect(u.immuneTurns).toBe(0);
    expect(u.effects.some((e) => e.kind === "BUFF")).toBe(true);
  });

  it("シールド・免疫・無敵・攻撃UPの4つを付けた順に1個ずつ外す", () => {
    const u = unit();
    u.shieldValue = 1000; u.shieldTurns = 2;
    u.immuneTurns = 2;
    applyStatus(u, "INVINCIBLE", 1);
    applyStatEffect(u, "atk", 0.3, 2, "BUFF");
    stripBuffs(u, 1); expect([u.shieldTurns, u.immuneTurns]).toEqual([0, 2]);
    stripBuffs(u, 1); expect(u.immuneTurns).toBe(0);
    stripBuffs(u, 1); expect(u.statusEffects.some((s) => s.type === "INVINCIBLE")).toBe(false);
    expect(u.effects.some((e) => e.kind === "BUFF")).toBe(true);
  });

  it("掛け直すと後ろへ回る", () => {
    const u = unit();
    u.immuneTurns = 2;
    applyStatEffect(u, "atk", 0.3, 2, "BUFF");
    u.immuneTurns = Math.max(u.immuneTurns, 2); // 同じ長さで張り直し
    stripBuffs(u, 1);
    expect(u.immuneTurns).toBe(2);
    expect(u.effects.some((e) => e.kind === "BUFF")).toBe(false);
  });

  it("手番の経過で減っても順番は変わらない", () => {
    const u = unit();
    u.immuneTurns = 3;
    applyStatEffect(u, "atk", 0.3, 2, "BUFF");
    u.immuneTurns -= 1;
    stripBuffs(u, 1);
    expect(u.immuneTurns).toBe(0);
  });

  it("強化奪取も同じ順番", () => {
    const from = unit();
    const to = createBattleUnit(findMonster("wolf", "FIRE")!, "PLAYER", "P1");
    applyStatEffect(from, "def", 0.5, 2, "BUFF");
    from.immuneTurns = 2;
    expect(stealBuffs(from, to, 1)).toBe(1);
    expect(to.effects.some((e) => e.stat === "def" && e.kind === "BUFF")).toBe(true);
    expect(from.immuneTurns).toBe(2);
  });
});

describe("弱体解除も付いた順", () => {
  it("先に受けた気絶が、後から受けた攻撃DOWNより先に消える", () => {
    const u = unit();
    u.stunTurns = 1;
    applyStatEffect(u, "atk", -0.5, 2, "DEBUFF");
    expect(cleanseDebuffs(u, 1)).toBe(1);
    expect(u.stunTurns).toBe(0);
    expect(u.effects.some((e) => e.kind === "DEBUFF")).toBe(true);
  });

  it("毒を重ね掛けされると後ろへ回る", () => {
    const u = unit();
    u.poisonStacks = 1; u.poisonTurns = 2;
    u.healBlockTurns = 2;
    u.poisonStacks += 1;
    cleanseDebuffs(u, 1);
    expect(u.healBlockTurns).toBe(0);
    expect(u.poisonStacks).toBe(2);
  });
});
