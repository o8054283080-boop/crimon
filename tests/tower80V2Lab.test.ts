import { describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import type { BattleUnit } from "../src/battle/unit.js";
import { hasStatus } from "../src/battle/unit.js";
import type { Skill } from "../src/core/skill.js";
import { buildTeams } from "../tools/battleLab/build.js";
import { mulberry32 } from "../tools/battleLab/rng.js";
import { TOWER80_FOCUS_V2, TOWER80_V2 } from "../tools/battleLab/scenarios/tower80v2.js";

interface EngineInternals {
  units: BattleUnit[];
  log: string[];
  recordTurn: (unit: BattleUnit, choice?: unknown) => unknown;
}

interface OneResult {
  winner: "PLAYER" | "ENEMY" | "DRAW";
  turns: number;
  bossActions: number;
  bossImmuneActions: number;
  bossBuffBlockedActions: number;
  bossStripEvents: number;
  buffBlockApplications: number;
  thresholdImmunities: number;
  bossHpLeft: number;
}

function cloneSkills(skills: readonly Skill[]): [Skill, Skill, Skill] {
  return skills.map((skill) => ({ ...skill, effects: skill.effects.map((effect) => ({ ...effect })) })) as [Skill, Skill, Skill];
}

function runOne(seed: number, focusOrder: string[]): OneResult {
  const rng = mulberry32(seed);
  const { players, enemies } = buildTeams(TOWER80_V2, rng, "TYPICAL");
  const engine = new BattleEngine(players, enemies, { rng, maxTurns: 300 });
  const e = engine as unknown as EngineInternals;
  const boss = e.units.find((u) => u.instanceId === "E1")!;
  const baseBossSkills = cloneSkills(boss.def.skills);

  for (const unit of e.units.filter((u) => u.team === "ENEMY")) unit.immuneTurns = Math.max(unit.immuneTurns, 3);

  let threshold70 = false;
  let threshold40 = false;
  let bossActions = 0;
  let bossImmuneActions = 0;
  let bossBuffBlockedActions = 0;
  let bossStripEvents = 0;
  let buffBlockApplications = 0;
  let thresholdImmunities = 0;
  let lastBossBuffBlock = hasStatus(boss, "BUFF_BLOCK");

  const enemyIdFor = (label: string): string | null => {
    const index = TOWER80_V2.enemies.findIndex((enemy) => (enemy.label ?? enemy.templateId) === label);
    return index >= 0 ? `E${index + 1}` : null;
  };
  const focusIds = focusOrder.map(enemyIdFor).filter((id): id is string => id !== null);
  const refocus = () => {
    for (const id of focusIds) {
      const target = e.units.find((u) => u.instanceId === id);
      if (target?.alive) { engine.setFocusTarget(id); return; }
    }
    engine.setFocusTarget(null);
  };

  const applyTeamImmunity = () => {
    for (const unit of e.units.filter((u) => u.team === "ENEMY" && u.alive)) {
      if (!hasStatus(unit, "BUFF_BLOCK")) unit.immuneTurns = Math.max(unit.immuneTurns, 3);
    }
  };

  const syncBossPassive = () => {
    if (!boss.alive) return;
    const immune = boss.immuneTurns > 0;
    boss.flatStatBonus.atk = immune ? 2_000 : 0;
    boss.mitigateTurns = 999;
    boss.mitigateAmount = immune ? 0 : -0.25;
    const factor = boss.currentHp / boss.maxHp < 0.5 ? 1.5 : 1;
    boss.def.skills = baseBossSkills.map((skill) => ({
      ...skill,
      effects: skill.effects.map((effect) => effect.kind === "DAMAGE"
        ? { ...effect, multiplier: effect.multiplier * factor }
        : { ...effect }),
    })) as [Skill, Skill, Skill];
  };

  const original = e.recordTurn.bind(e);
  e.recordTurn = (unit: BattleUnit, choice?: unknown) => {
    refocus();
    syncBossPassive();
    if (unit === boss && boss.alive) {
      bossActions += 1;
      if (boss.immuneTurns > 0) bossImmuneActions += 1;
      if (hasStatus(boss, "BUFF_BLOCK")) bossBuffBlockedActions += 1;
    }
    const beforeLog = e.log.length;
    const record = original(unit, choice);
    const lines = e.log.slice(beforeLog);

    if (unit === boss && lines.some((line) => line.includes("聖域の咆哮"))) applyTeamImmunity();

    const ratio = boss.currentHp / boss.maxHp;
    if (boss.alive && ratio <= 0.70 && !threshold70) {
      threshold70 = true;
      thresholdImmunities += 1;
      applyTeamImmunity();
    }
    if (boss.alive && ratio <= 0.40 && !threshold40) {
      threshold40 = true;
      thresholdImmunities += 1;
      applyTeamImmunity();
    }

    if (lines.some((line) => line.includes("[敵:E1]") && line.includes("有利な効果") && line.includes("剥"))) bossStripEvents += 1;
    const nowBlocked = hasStatus(boss, "BUFF_BLOCK");
    if (!lastBossBuffBlock && nowBlocked) buffBlockApplications += 1;
    lastBossBuffBlock = nowBlocked;
    syncBossPassive();
    return record;
  };

  refocus();
  syncBossPassive();
  const result = engine.run();
  return {
    winner: result.winner,
    turns: result.turnsTaken,
    bossActions,
    bossImmuneActions,
    bossBuffBlockedActions,
    bossStripEvents,
    buffBlockApplications,
    thresholdImmunities,
    bossHpLeft: boss.currentHp,
  };
}

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);

describe("80階V2: お供ATK低下+SPD-10、剥がし+強化阻害で再測定", () => {
  it("V2実数を固定", () => {
    expect(TOWER80_V2.enemies.map((e) => [e.stats?.atk, e.stats?.spd])).toEqual([
      [9500, 185], [6000, 170], [5500, 162], [8500, 180], [6500, 155],
    ]);
  });

  it("TYPICAL 1000戦×5攻略順", () => {
    const rows = TOWER80_FOCUS_V2.map((focus, fi) => {
      const results = Array.from({ length: 1000 }, (_, i) => runOne(20260930 + fi * 10_000 + i, focus.order));
      const wins = results.filter((r) => r.winner === "PLAYER").length;
      const losses = results.filter((r) => r.winner === "ENEMY").length;
      const draws = results.filter((r) => r.winner === "DRAW").length;
      const bossActions = results.reduce((sum, r) => sum + r.bossActions, 0);
      const bossImmuneActions = results.reduce((sum, r) => sum + r.bossImmuneActions, 0);
      const bossBlockedActions = results.reduce((sum, r) => sum + r.bossBuffBlockedActions, 0);
      return {
        focus: focus.name,
        winRate: wins / results.length,
        lossRate: losses / results.length,
        drawRate: draws / results.length,
        avgTurns: mean(results.map((r) => r.turns)),
        bossImmuneActionRate: bossActions ? bossImmuneActions / bossActions : 0,
        bossBuffBlockActionRate: bossActions ? bossBlockedActions / bossActions : 0,
        avgBossStrips: mean(results.map((r) => r.bossStripEvents)),
        avgBuffBlockApplications: mean(results.map((r) => r.buffBlockApplications)),
        avgThresholdImmunities: mean(results.map((r) => r.thresholdImmunities)),
        avgBossHpLeft: mean(results.map((r) => r.bossHpLeft)),
      };
    });
    console.log("TOWER80_V2_STRIP_BLOCK_RESULTS=" + JSON.stringify(rows));
    expect(rows).toHaveLength(5);
  }, 240_000);
});
