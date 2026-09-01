import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALL_DISPLAYABLE_MONSTERS_DEX } from "../src/data/monsters.js";

const audit = readFileSync(new URL("../docs/latent-awakening-redesign-audit.md", import.meta.url), "utf8");
const candidateRows = audit.split("\n").filter((line) => /^\|[ABC]：/.test(line));
const effectCount = (effect: string) => candidateRows.filter((line) => line.includes(`\`${effect}\``)).length;

describe("潜在覚醒再設計監査文書", () => {
  it("全72体を現行DEX IDで1回ずつ監査し、各3候補・安定IDを記載する", () => {
    expect(ALL_DISPLAYABLE_MONSTERS_DEX).toHaveLength(72);
    expect(candidateRows).toHaveLength(216);
    for (const monster of ALL_DISPLAYABLE_MONSTERS_DEX) {
      expect(audit.split("\n").filter((line) => line.startsWith("### ") && line.endsWith(`(\`${monster.id}\`)`))).toHaveLength(1);
      for (let slot = 1; slot <= 3; slot += 1) {
        const stableId = `${monster.templateId}_${monster.element}_latent_${slot}`;
        expect(candidateRows.filter((line) => line.includes(`\`${stableId}\``))).toHaveLength(1);
      }
    }
    expect(new Set(candidateRows.map((line) => line.match(/`([^`]+_latent_[123])`/)?.[1])).size).toBe(216);
  });

  it("必須カテゴリの集計値と多段1スキル1判定を監査できる", () => {
    expect(effectCount("S1_TO_AOE")).toBe(24);
    expect(effectCount("HEAL_BLOCK")).toBe(11);
    expect(effectCount("TURN_METER_DOWN")).toBe(11);
    expect(effectCount("STRIP_ONE")).toBe(10);
    expect(effectCount("SPD_DOWN")).toBe(10);
    expect(effectCount("POISON")).toBe(10);
    expect(effectCount("STUN")).toBe(10);
    expect(effectCount("IGNORE_DEFENSE")).toBe(24);
    expect(effectCount("BUFF_BLOCK")).toBe(10);
    expect(effectCount("ALLY_GAUGE_UP")).toBe(12);
    expect(effectCount("DEBUFF_EXTEND")).toBe(12);
    expect(effectCount("DEBUFF_COUNT_DAMAGE")).toBe(24);
    expect(candidateRows.every((line) => line.includes("各hit判定なし"))).toBe(true);
  });

  it("評価分布にDを含めず、S/A/B/Cの計画値を満たす", () => {
    const grades = (grade: string) => candidateRows.filter((line) => line.split("|")[3] === grade).length;
    expect({ S: grades("S"), A: grades("A"), B: grades("B"), C: grades("C") }).toEqual({ S: 6, A: 42, B: 108, C: 60 });
    expect(grades("D")).toBe(0);
  });
});
