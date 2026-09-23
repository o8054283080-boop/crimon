/**
 * 時間切れ(引き分け)になった1戦を探し、最後の盤面とログを出す。**検証専用。**
 *
 * 見つけたもの: 我慢(ENDURE)の残りターンは本人の手番開始時にしか減らない(`tickEffectsAtTurnStart`)。
 * 行動ゲージを削り続けて手番を与えないと、我慢が切れず HP1 のまま300手番の時間切れになる。
 *
 *   npx tsx tools/arenaFinal/endureDraw.ts 4 F    # 攻撃4 × 防衛F(アクセなし)
 */
import { BattleEngine } from "../../src/battle/engine.js";
import { ARENA_BATTLE_OPTIONS, arenaCompressedSpeed } from "../../src/data/pvpArena.js";
import { buildAlly } from "../battleLab/build.js";
import { mulberry32 } from "../battleLab/rng.js";
import { gearOf, ATTACKS, DEFENSES } from "./roster.js";
function seedOf(key: string, side: "A" | "D"): number { let h = side === "A" ? 17 : 29; for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; }
const mk = (m: any, side: "A" | "D") => { const d = buildAlly({ label: m.label, templateId: m.templateId, element: m.element, type: m.build.type, abilityPoints: m.build.abilityPoints, gear: gearOf(m.build), latentIndex: m.latentIndex }, mulberry32(seedOf(m.key, side))); return { ...d, stats: { ...d.stats, spd: arenaCompressedSpeed(d.stats.spd) } }; };
const a = ATTACKS.find((t) => t.key === process.argv[2])!; const d = DEFENSES.find((t) => t.key === process.argv[3])!;
for (let seed = 70000; seed < 70200; seed++) {
  const e = new BattleEngine(a.members.map((m) => mk(m, "A")), d.members.map((m) => mk(m, "D")), { ...ARENA_BATTLE_OPTIONS, rng: mulberry32(seed) });
  const r = e.run();
  if (r.winner === "DRAW") {
    console.log("seed", seed, "turns", r.turnsTaken);
    const units = (e as any).units;
    for (const u of units) console.log(u.team, u.def.name, u.alive, u.currentHp, "/", u.maxHp, "shield", u.shieldValue, "stun", u.stunTurns, "effects", u.effects.map((x: any) => x.kind + x.stat).join(","), "status", u.statusEffects.map((x: any) => x.type).join(","));
    console.log(r.log.slice(-60).join("\n"));
    break;
  }
}
