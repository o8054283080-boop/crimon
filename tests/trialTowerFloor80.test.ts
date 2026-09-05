import { describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import type { Skill } from "../src/core/skill.js";
import { findMonster } from "../src/data/monsters.js";
import { findTowerFloor } from "../src/data/trialTower.js";
import { trialTowerEnemyInfo } from "../src/data/trialTowerEnemyInfo.js";
import { buildDungeonEnemyTeam } from "../src/game/dungeonRunner.js";
import { buildEnemy, buildTeams } from "../tools/battleLab/build.js";
import { mulberry32 } from "../tools/battleLab/rng.js";
import { TOWER80_V3 } from "../tools/battleLab/scenarios/tower80v3.js";

const setup = (floor = 80) => {
  const player = findMonster("wolf", "WATER")!;
  const engine = new BattleEngine([{ ...player, stats: { ...player.stats, hp: 10_000_000 } }],
    buildDungeonEnemyTeam(findTowerFloor(80)!), { trialTowerFloor: floor, rng: () => 0.5 });
  const [ally, boss, ...escorts] = engine.getUnits();
  return { engine, ally, boss, escorts };
};

describe("80階 古代聖竜の本編統合", () => {
  it("実際の5対5戦闘を最後まで進められる", () => {
    for (let seed = 1; seed <= 5; seed++) {
      const rng = mulberry32(seed);
      const { players } = buildTeams(TOWER80_V3, rng, "TYPICAL");
      const result = new BattleEngine(players, buildDungeonEnemyTeam(findTowerFloor(80)!),
        { trialTowerFloor: 80, rng, maxTurns: 300 }).run();
      expect(["PLAYER", "ENEMY", "DRAW"]).toContain(result.winner);
      expect(result.turnsTaken).toBeGreaterThan(0);
      expect(result.log.join("\n")).toContain("古代聖竜");
    }
  });
  it("V3の全員のステータス・スキル・固有特性を移植している", () => {
    const live = buildDungeonEnemyTeam(findTowerFloor(80)!);
    const lab = TOWER80_V3.enemies.map(buildEnemy);
    for (let i = 0; i < live.length; i++) {
      expect(live[i].stats).toEqual(lab[i].stats);
      expect(live[i].bossTraits).toEqual(lab[i].bossTraits);
      expect(live[i].skills.map(({ description, ...skill }) => skill))
        .toEqual(lab[i].skills.map(({ description, ...skill }) => skill));
    }
  });

  it("開幕に全5体へ免疫2ターン、本体を倒すだけで勝利", () => {
    const { engine, boss, escorts } = setup();
    expect([boss, ...escorts].map((u) => u.immuneTurns)).toEqual([2, 2, 2, 2, 2]);
    expect(boss.flatStatBonus.atk).toBe(2_000);
    boss.currentHp = 0;
    boss.alive = false;
    expect(engine.getWinner()).toBe("PLAYER");
    expect(escorts.every((u) => u.alive)).toBe(true);
  });

  it("HP70/40%で各1回だけ免疫を再展開し、強化阻害を尊重する", () => {
    const { engine, boss, escorts } = setup();
    const sync = () => (engine as any).syncTower80Boss();
    boss.currentHp = boss.maxHp * 0.7;
    for (const u of [boss, ...escorts]) u.immuneTurns = 0;
    escorts[0].statusEffects.push({ type: "BUFF_BLOCK", category: "DEBUFF", remainingTurns: 3 });
    sync();
    expect(boss.immuneTurns).toBe(2);
    expect(escorts[0].immuneTurns).toBe(0);
    boss.immuneTurns = 0;
    sync();
    expect(boss.immuneTurns).toBe(0);
    boss.currentHp = boss.maxHp * 0.4;
    sync();
    expect(boss.immuneTurns).toBe(2);
    boss.immuneTurns = 0;
    boss.currentHp = boss.maxHp;
    sync();
    boss.currentHp = boss.maxHp * 0.3;
    sync();
    expect(boss.immuneTurns).toBe(0);
  });

  it("免疫なしの被ダメージ増とお供撃破の増加を加算する", () => {
    const { engine, boss, escorts } = setup();
    const hit = () => {
      const hp = boss.currentHp;
      (engine as any).applyIncomingDamage(boss, 1000);
      return hp - boss.currentHp;
    };
    expect(hit()).toBe(1000);
    boss.immuneTurns = 0;
    expect(hit()).toBe(1250);
    expect(boss.flatStatBonus.atk).toBe(0);
    escorts[0].currentHp = 0;
    escorts[0].alive = false;
    expect(hit()).toBe(1300);
    boss.immuneTurns = 2;
    expect(hit()).toBe(1050);
    escorts.forEach((u) => { u.currentHp = 0; u.alive = false; });
    expect(hit()).toBe(1200);
    expect(hit()).toBe(1200);
  });

  it("S3は全員へ免疫を配るが強化阻害は残る", () => {
    const { engine, boss, escorts } = setup();
    [boss, ...escorts].forEach((u) => { u.immuneTurns = 0; });
    // S3の解除は1個。先の弱体だけ解除させて強化阻害を残す。
    escorts[0].effects.push({ kind: "DEBUFF", stat: "atk", amount: -0.5, remainingTurns: 3 });
    escorts[0].statusEffects.push({ type: "BUFF_BLOCK", category: "DEBUFF", remainingTurns: 3 });
    (engine as any).act(boss, { skillIndex: 2 });
    expect(boss.immuneTurns).toBe(2);
    expect(escorts.slice(1).every((u) => u.immuneTurns === 2)).toBe(true);
    expect(escorts[0].immuneTurns).toBe(0);
  });

  it("半分未満の攻撃強化は累積せず、HPが戻れば解除される", () => {
    const { engine, boss } = setup();
    const multipliers: number[] = [];
    (engine as any).applySkillEffects = (_s: unknown, _t: unknown, skill: Skill) => {
      const damage = skill.effects.find((e) => e.kind === "DAMAGE");
      if (damage?.kind === "DAMAGE") multipliers.push(damage.multiplier);
    };
    for (const ratio of [0.5, 0.49, 0.49, 0.6]) {
      boss.currentHp = boss.maxHp * ratio;
      (engine as any).act(boss, { skillIndex: 0 });
    }
    expect(multipliers).toEqual([1, 1.5, 1.5, 1]);
  });

  it("他の階に80階の固有効果を適用しない", () => {
    const { boss, escorts } = setup(79);
    expect([boss, ...escorts].every((u) => u.immuneTurns === 0)).toBe(true);
    expect(boss.flatStatBonus.atk ?? 0).toBe(0);
  });

  it("敵情報は全5体の実スキル3つとボス固有効果を表示", () => {
    const info = trialTowerEnemyInfo(80);
    expect(info.map((e) => e.name)).toEqual(["古代聖竜", "古代の護晶", "古代の鼓舞晶", "古代の破邪獣", "古代の呪獣"]);
    expect(info.every((e) => e.skills.length === 3 && e.skills.every((s) => s.description.length > 5))).toBe(true);
    expect(info[0].passives).toHaveLength(3);
    expect(JSON.stringify(info)).not.toMatch(/powerScale|fixedStats|200000|9500/);
  });
});
