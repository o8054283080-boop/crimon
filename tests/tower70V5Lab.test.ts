import { describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import { findMonsterById } from "../src/data/monsters.js";
import { buildEnemy } from "../tools/battleLab/build.js";
import { attachProbe } from "../tools/battleLab/hook.js";
import { mulberry32 } from "../tools/battleLab/rng.js";
import { buildTower70V5 } from "../tools/battleLab/scenarios/tower70v5.js";

const CRUSH_LINE = '[敵:E3] 古代の脈動晶(闇) は 「命脈断ち」 を使った！';

/*
 * **計測はここから外した。**
 *
 * 元は「1000戦×5攻略順を実測してログへ出す」という `it` があったが、
 * 確かめていたのは `expect(rows).toHaveLength(5)` だけ——5回ループしたことしか
 * 見ておらず、肝心の数字は `console.log` へ流すだけだった。
 * そのために毎回のCIが約170秒(7件で)遅くなっていた。**測定はテストではない。**
 *
 * 数字が要る時は `npx tsx tools/battleLab/tower70/measure.ts` から回す。
 * ここに残すのは、壊れたら落ちる仕様の見張りだけ。
 */

describe("70階V5: 完全回復阻害 + 3体命脈断ち", () => {
  it("命脈断ちは発動時の現在HP上位3体を同時に半分にする", () => {
    const scenario = buildTower70V5();
    const enemies = scenario.enemies.map(buildEnemy);
    const wolf = findMonsterById("wolf_FIRE")!;
    const allies = [100_000, 90_000, 80_000, 70_000, 60_000].map(() => ({
      ...wolf,
      stats: { ...wolf.stats, hp: 500_000, atk: 1, spd: 1 },
    }));
    const engine = new BattleEngine(allies, enemies, { rng: mulberry32(1), maxTurns: 1 });
    const probe = attachProbe(engine, scenario.hook)!;
    const players = engine.getUnits().filter((unit) => unit.team === "PLAYER");
    [100_000, 90_000, 80_000, 70_000, 60_000].forEach((hp, i) => { players[i].currentHp = hp; });

    probe.beforeTurn("E3");
    probe.afterTurn("E3", [CRUSH_LINE]);

    expect(players.map((unit) => unit.currentHp)).toEqual([50_000, 45_000, 40_000, 70_000, 60_000]);
    expect(players.every((unit) => unit.alive)).toBe(true);
  });
});
