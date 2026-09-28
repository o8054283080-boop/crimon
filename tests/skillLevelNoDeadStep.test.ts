/**
 * **スキルLvを上げて何も変わらない段を作らない。**
 *
 * 依頼主の指摘(2026-09-28)で全287スキルを調べたところ、29スキル・36段で
 * Lvを上げても数値が1つも変わらなかった(ハーピー「羽ばたき」はLv2〜4がすべて空だった)。
 * 伸びを後ろの段へ振り分け、足りないものは小さな伸びを足して埋めた。
 *
 * ゲーム内と同じ経路で作った実効 Lv1〜5 を、1段ずつ比べる。
 */
import { describe, expect, it } from "vitest";
import { collectAll } from "../tools/skillsReport/collect.js";

describe("スキルLv", () => {
  it("どのスキルも、Lvを1つ上げると何かしらの数値が変わる", () => {
    const dead: string[] = [];
    const seen = new Set<string>();
    for (const monster of collectAll()) {
      for (const skill of monster.skills) {
        if (seen.has(skill.skillId)) continue;
        seen.add(skill.skillId);
        const sig = (l: (typeof skill.levels)[number]) =>
          JSON.stringify({ t: l.target, ct: l.cooldownTurns, e: l.effects, p: l.passive, f: l.flags });
        for (let i = 1; i < skill.levels.length; i += 1) {
          if (sig(skill.levels[i]) === sig(skill.levels[i - 1])) dead.push(`${monster.name} ${skill.skillName}(${skill.skillId}) Lv${i + 1}`);
        }
      }
    }
    expect(seen.size).toBeGreaterThan(250);
    expect(dead).toEqual([]);
  });
});
