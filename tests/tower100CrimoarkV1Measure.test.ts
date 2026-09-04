import { describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import type { BattleUnit } from "../src/battle/unit.js";
import type { MonsterDefinition } from "../src/core/monster.js";
import type { Skill } from "../src/core/skill.js";
import { findMonster } from "../src/data/monsters.js";
import { buildAlly } from "../tools/battleLab/build.js";
import { mulberry32 } from "../tools/battleLab/rng.js";
import type { AllySpec } from "../tools/battleLab/types.js";

const S1: Skill = {
  id: "crimoark_s1", name: "クリエイト・ブレイク", description: "100F V1", target: "SINGLE_ENEMY", cooldownTurns: 0,
  targetPriority: "LOWEST_HP",
  effects: [
    { kind: "DAMAGE", multiplier: 1.35, debuffDamageBonus: { perDebuff: 0.15, maxBonus: 0.30 }, targetHpBonus: [{ hpRatio: 0.5, bonus: 0.20 }] },
    { kind: "DEBUFF", stat: "def", amount: 0.50, durationTurns: 2, chance: 1 },
    { kind: "GAUGE", amount: -0.20 },
  ],
};
const S2: Skill = {
  id: "crimoark_s2", name: "リライト・ディザスター", description: "100F V1", target: "ALL_ENEMIES", cooldownTurns: 3,
  effects: [
    { kind: "DAMAGE", multiplier: 1.15 },
    { kind: "STRIP", count: 2, chance: 1 },
    { kind: "STATUS", status: "BUFF_BLOCK", durationTurns: 2, chance: 1 },
    { kind: "GAUGE", amount: -0.25 },
    { kind: "DEBUFF", stat: "atk", amount: 0.50, durationTurns: 2, chance: 0.70 },
    { kind: "CLEANSE", count: 2, applyTo: "SELF" },
  ],
};
const S3: Skill = {
  id: "crimoark_s3", name: "クリエイト・コピー", description: "分身生成", target: "SELF", cooldownTurns: 5,
  effects: [{ kind: "GAUGE", amount: 0, applyTo: "SELF" }],
};
const cloneS1: Skill = {
  id: "crimoark_clone_s1", name: "模造斬", description: "分身", target: "SINGLE_ENEMY", cooldownTurns: 0,
  effects: [{ kind: "DAMAGE", multiplier: 1.10 }, { kind: "GAUGE", amount: -0.15 }],
};
const cloneS2: Skill = {
  id: "crimoark_clone_s2", name: "模造災波", description: "分身", target: "ALL_ENEMIES", cooldownTurns: 3,
  effects: [{ kind: "DAMAGE", multiplier: 0.70 }, { kind: "DEBUFF", stat: "def", amount: 0.50, durationTurns: 2, chance: 0.50 }],
};
const cloneS3: Skill = {
  id: "crimoark_clone_s3", name: "模造処刑", description: "分身", target: "SINGLE_ENEMY", cooldownTurns: 4,
  targetPriority: "LOWEST_HP",
  effects: [{ kind: "DAMAGE", multiplier: 1.60, targetHpBonus: [{ hpRatio: 0.5, bonus: 0.40 }] }, { kind: "GAUGE", amount: 0.15, applyTo: "ALLIES" }],
};

const BASE_STATS = { hp: 500_000, atk: 10_500, def: 5_000, spd: 215, criRate: 0.30, criDmg: 1.80, acc: 0.75, res: 0.60 };

function bossDef(): MonsterDefinition {
  const base = findMonster("nemesis", "DARK")!;
  return { ...base, id: "crimoark", name: "クリモアーク", stats: { ...base.stats, ...BASE_STATS }, skills: [S1, S2, S3], victoryTarget: true };
}
function cloneDef(index: number): MonsterDefinition {
  const base = findMonster("nemesis", "DARK")!;
  return {
    ...base, id: `crimoark_clone_${index}`, name: `クリモアークの分身${index}`,
    stats: { ...base.stats, hp: 110_000, atk: 8_400, def: 3_750, spd: 215, criRate: 0.30, criDmg: 1.80, acc: 0.65, res: 0.40 },
    skills: [cloneS1, cloneS2, cloneS3], victoryTarget: false,
  };
}

const SAFE: AllySpec[] = [
  { templateId: "fenrir", element: "ELECTRIC", preset: "MAX_ATTACKER" },
  { templateId: "mushroon", element: "GRASS", preset: "MAX_DEBUFFER" },
  { templateId: "basilisk", element: "LIGHT", preset: "MAX_TANK" },
  { templateId: "wisp", element: "WATER", preset: "MAX_HEALER" },
  { templateId: "chronos", element: "ELECTRIC", preset: "MAX_SUPPORT" },
];
const RUSH: AllySpec[] = [
  { templateId: "fenrir", element: "ELECTRIC", preset: "MAX_ATTACKER" },
  { templateId: "dragon", element: "DARK", preset: "MAX_ATTACKER" },
  { templateId: "mushroon", element: "GRASS", preset: "MAX_DEBUFFER" },
  { templateId: "wisp", element: "WATER", preset: "MAX_HEALER" },
  { templateId: "chronos", element: "ELECTRIC", preset: "MAX_SUPPORT" },
];
const SUSTAIN: AllySpec[] = [
  { templateId: "valkyria", element: "LIGHT", preset: "MAX_TANK" },
  { templateId: "seraph", element: "LIGHT", preset: "MAX_HEALER" },
  { templateId: "basilisk", element: "LIGHT", preset: "MAX_TANK" },
  { templateId: "wisp", element: "WATER", preset: "MAX_HEALER" },
  { templateId: "mushroon", element: "GRASS", preset: "MAX_DEBUFFER" },
];

type Mode = "CLONES" | "BOSS" | "SUSTAIN";

function clearDebuffs(unit: BattleUnit): void {
  unit.effects = unit.effects.filter((e) => e.kind !== "DEBUFF");
  unit.statusEffects = unit.statusEffects.filter((e) => e.category !== "DEBUFF");
  unit.stunTurns = 0; unit.burnTurns = 0; unit.poisonStacks = 0; unit.poisonTurns = 0; unit.blindTurns = 0; unit.healBlockTurns = 0;
}

function runOne(specs: AllySpec[], seed: number, mode: Mode) {
  const rng = mulberry32(seed);
  const players = specs.map((s) => buildAlly(s, rng, "TYPICAL"));
  const engine = new BattleEngine(players, [bossDef(), cloneDef(1), cloneDef(2)], { rng, maxTurns: 350 });
  const units = (engine as unknown as { units: BattleUnit[] }).units;
  const boss = units.find((u) => u.instanceId === "E1")!;
  const clones = units.filter((u) => u.instanceId === "E2" || u.instanceId === "E3");
  for (const clone of clones) { clone.alive = false; clone.currentHp = 0; clone.gauge = 0; }

  let turns = 0;
  let bossTurns = 0;
  let s4Cd = 5;
  let crossed40 = false;
  let spawned = 0;
  let cloneDeaths = 0;
  const seenDead = new Set<string>();
  let s4Uses = 0;

  const syncBoss = () => {
    const r = boss.currentHp / boss.maxHp;
    let atk = 0, spd = 0, criRate = 0, criDmg = 0, factor = 1;
    if (r <= 0.70) { atk += 1_000; spd += 15; }
    if (r <= 0.40) { atk += 1_500; spd += 25; criRate += 0.20; criDmg += 0.30; factor = 1.20; }
    if (r <= 0.20) { atk += 2_000; spd += 40; criRate += 0.20; criDmg += 0.50; factor = 1.40; }
    boss.flatStatBonus = { ...boss.flatStatBonus, atk, spd, criRate, criDmg };
    const aliveClones = clones.filter((c) => c.alive).length;
    boss.mitigateAmount = aliveClones * 0.15;
    boss.mitigateTurns = aliveClones ? 999 : 0;
    boss.def.skills = [
      { ...S1, effects: S1.effects.map((e) => e.kind === "DAMAGE" ? { ...e, multiplier: e.multiplier * factor } : e) },
      { ...S2, effects: S2.effects.map((e) => e.kind === "DAMAGE" ? { ...e, multiplier: e.multiplier * factor } : e) },
      S3,
    ];
    if (!crossed40 && r <= 0.40) {
      crossed40 = true;
      clearDebuffs(boss);
      boss.gauge = Math.max(boss.gauge, 100);
      boss.cooldowns[2] = 0;
      s4Cd = Math.max(0, s4Cd - 1);
    }
  };

  const spawnOrRefresh = () => {
    const maxClones = boss.currentHp / boss.maxHp > 0.70 ? 1 : 2;
    const inactive = clones.find((c) => !c.alive);
    const alive = clones.filter((c) => c.alive);
    if (alive.length < maxClones && inactive) {
      inactive.alive = true; inactive.currentHp = inactive.maxHp; inactive.gauge = 0; inactive.cooldowns = [0, 0, 0];
      spawned += 1; seenDead.delete(inactive.instanceId);
    } else {
      for (const c of alive) { c.currentHp = Math.min(c.maxHp, c.currentHp + Math.round(c.maxHp * 0.30)); c.gauge += 30; }
    }
  };

  while (!engine.getWinner() && turns < 350) {
    syncBoss();
    for (const clone of clones) {
      if (!clone.alive && clone.currentHp <= 0 && !seenDead.has(clone.instanceId) && spawned > 0) {
        seenDead.add(clone.instanceId); cloneDeaths += 1;
        boss.effects.push({ stat: "atk", amount: 0.30, remainingTurns: 3, kind: "BUFF" });
        boss.effects.push({ stat: "spd", amount: 0.20, remainingTurns: 3, kind: "BUFF" });
      }
    }

    if (mode !== "BOSS") {
      const target = clones.find((c) => c.alive);
      engine.setFocusTarget(target ? target.instanceId : "E1");
    } else {
      engine.setFocusTarget("E1");
    }

    const actor = engine.getNextActor();
    if (!actor) break;
    let record;
    if (actor === boss) {
      bossTurns += 1;
      s4Cd -= 1;
      if (s4Cd <= 0) {
        const aliveClones = clones.filter((c) => c.alive).length;
        const r = boss.currentHp / boss.maxHp;
        const factor = r <= 0.20 ? 1.40 : r <= 0.40 ? 1.20 : 1;
        const s4: Skill = {
          id: "crimoark_s4", name: "オーバークリエイト", description: "100F V1", target: "ALL_ENEMIES", cooldownTurns: 6,
          effects: [
            { kind: "STRIP", chance: 1 },
            { kind: "DAMAGE", multiplier: 1.50 * factor * (1 + aliveClones * 0.20) },
            { kind: "GAUGE", amount: -0.50 },
            { kind: "DEBUFF", stat: "def", amount: 0.50, durationTurns: 3, chance: 1, fixedDuration: true },
            { kind: "HEAL_BLOCK", healMultiplier: 0, durationTurns: 2, chance: 1, fixedDuration: true },
            { kind: "GAUGE", amount: 0.30, applyTo: "SELF" },
          ],
        };
        const old = boss.def.skills[2]; const oldCd = boss.cooldowns[2];
        boss.def.skills[2] = s4; boss.cooldowns[2] = 0;
        record = engine.resolveTurn(actor, { skillIndex: 2 });
        boss.def.skills[2] = old; boss.cooldowns[2] = oldCd;
        s4Cd = 6; s4Uses += 1;
      } else if (boss.cooldowns[2] <= 0) {
        record = engine.resolveTurn(actor, { skillIndex: 2 });
        spawnOrRefresh();
      } else {
        record = engine.resolveTurn(actor);
      }
    } else {
      record = engine.resolveTurn(actor);
      if (boss.currentHp / boss.maxHp <= 0.20 && actor.team === "ENEMY" && actor !== boss && actor.alive) boss.gauge += 10;
    }
    if (boss.currentHp / boss.maxHp <= 0.20 && actor === boss && boss.alive) {
      for (const clone of clones) if (clone.alive) clone.gauge += 20;
    }
    turns += 1;
  }
  const winner = engine.getWinner() ?? "DRAW";
  const survivors = units.filter((u) => u.team === "PLAYER" && u.alive).length;
  return { winner, turns, survivors, bossHpRatio: Math.max(0, boss.currentHp / boss.maxHp), spawned, cloneDeaths, s4Uses, bossTurns };
}

function measure(name: string, specs: AllySpec[], mode: Mode, seedBase: number, runs = 1000) {
  let wins = 0, losses = 0, draws = 0, turns = 0, survivors = 0, bossHp = 0, spawned = 0, cloneDeaths = 0, s4Uses = 0;
  for (let i = 0; i < runs; i++) {
    const r = runOne(specs, seedBase + i, mode);
    if (r.winner === "PLAYER") wins += 1; else if (r.winner === "ENEMY") losses += 1; else draws += 1;
    turns += r.turns; survivors += r.survivors; bossHp += r.bossHpRatio; spawned += r.spawned; cloneDeaths += r.cloneDeaths; s4Uses += r.s4Uses;
  }
  return { name, winRate: wins / runs, lossRate: losses / runs, drawRate: draws / runs, avgTurns: turns / runs, avgSurvivors: survivors / runs, avgBossHpRatio: bossHp / runs, avgClonesSpawned: spawned / runs, avgCloneDeaths: cloneDeaths / runs, avgS4Uses: s4Uses / runs };
}

describe("100階クリモアークV1 一時測定", () => {
  it("分身処理・ボス集中・耐久を各1000戦測る", () => {
    const rows = [
      measure("分身処理型", SAFE, "CLONES", 410000),
      measure("ボス集中型", RUSH, "BOSS", 420000),
      measure("耐久処理型", SUSTAIN, "SUSTAIN", 430000),
    ];
    console.log(`TOWER100_CRIMOARK_V1_RESULTS=${JSON.stringify(rows)}`);
    expect(rows).toHaveLength(3);
  }, 120_000);
});
