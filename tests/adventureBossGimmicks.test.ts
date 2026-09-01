import { describe, expect, it } from "vitest";
import { STAGES } from "../src/data/stages.js";
import { buildEnemyTeam } from "../src/game/stageRunner.js";

const bossWave = STAGES.find((stage) => stage.id === "5-5")!.waves[2];

describe("冒険章ボスの固有ギミック", () => {
  it("腐食トレントはNormal/Hard/Hellで毎手番3%/5%/7%再生する", () => {
    expect(buildEnemyTeam(bossWave, "NORMAL")[1].combatMods?.turnHealPercent).toBe(0.03);
    expect(buildEnemyTeam(bossWave, "HARD")[1].combatMods?.turnHealPercent).toBe(0.05);
    expect(buildEnemyTeam(bossWave, "HELL")[1].combatMods?.turnHealPercent).toBe(0.07);
  });

  it("腐食トレントのNormal速度120は再生追加後も維持される", () => {
    expect(buildEnemyTeam(bossWave, "NORMAL")[1].stats.spd).toBe(120);
  });
});
