import { describe, expect, it } from "vitest";
import { STAGES } from "../src/data/stages.js";
import { buildEnemyTeam } from "../src/game/stageRunner.js";

function bossWave(chapter: number) {
  return STAGES.find((stage) => stage.id === `${chapter}-5`)!.waves[2];
}

describe("冒険5〜8章のボス", () => {
  it("8章の時空の支配者は強化済みの時空崩壊を使用する", () => {
    const boss = buildEnemyTeam(bossWave(8), "NORMAL")[1];
    const collapse = boss.skills.find((skill) => skill.id === "chronos_s3_b");

    expect(collapse).toBeDefined();
    expect(collapse!.effects.some((effect) => effect.kind === "GAUGE" && effect.amount === -1)).toBe(true);
  });

  it("5〜8章のボスは全難易度で2番目に配置される", () => {
    for (const chapter of [5, 6, 7, 8]) {
      expect(bossWave(chapter).enemies[1].isBoss).toBe(true);
    }
  });
});
