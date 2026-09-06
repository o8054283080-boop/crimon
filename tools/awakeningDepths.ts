/**
 * 目覚の深域の実測。**画面を通さず、本編のエンジンで1〜10階を回す。**
 *
 *   npx tsx tools/awakeningDepths.mjs --runs 200
 *
 * ## 何を見るか
 *
 * 勝率だけでは上の階が全部0%に張り付いて何も読めなくなるので、
 * **決着時点の敵残HP割合**も一緒に出す(`CLAUDE.md` の「測ってから判断する」)。
 *
 * ## 編成は3つ
 *
 *   ・集中型 — 1体の高火力に寄せる。**才能適応がいちばん効く相手**
 *   ・分散型 — 攻撃役を分ける。適応が乗り切らない
 *   ・耐久型 — 削り役を1体だけ置いて粘る
 *
 * 3つ目に削り役を入れてあるのは、**殴る手を持たない編成を
 * 「耐久編成」として測ると嘘の結論が出る**から(100階でやった失敗)。
 */
import { BattleEngine } from "../src/battle/engine.js";
import { AWAKENING_DEPTH_FLOORS } from "../src/data/awakeningDepths.js";
import { buildDungeonEnemyTeam } from "../src/game/dungeonRunner.js";
import { buildAlly } from "./battleLab/build.js";
import { mulberry32 } from "./battleLab/rng.js";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const RUNS = Number(arg("runs", "200"));
const GEAR = arg("gear", "TYPICAL");
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** 1体の火力に全部を任せる。適応が最も深く乗る */
const FOCUS = [
  { templateId: "dragon", element: "FIRE", preset: "MAX_ATTACKER" },
  { templateId: "wisp", element: "WATER", preset: "MAX_HEALER" },
  { templateId: "golem", element: "GRASS", preset: "MAX_TANK" },
  { templateId: "fairy", element: "LIGHT", preset: "MAX_SUPPORT" },
];
/** 攻撃役を分ける。適応が乗り切らない */
const SPREAD = [
  { templateId: "dragon", element: "FIRE", preset: "MAX_ATTACKER" },
  { templateId: "wolf", element: "ELECTRIC", preset: "MAX_ATTACKER" },
  { templateId: "knight", element: "WATER", preset: "MAX_ATTACKER" },
  { templateId: "wisp", element: "WATER", preset: "MAX_HEALER" },
];
/** 耐久寄り。**削り役は必ず入れる** */
const SUSTAIN = [
  { templateId: "golem", element: "GRASS", preset: "MAX_TANK" },
  { templateId: "seraph", element: "LIGHT", preset: "MAX_HEALER" },
  { templateId: "wisp", element: "WATER", preset: "MAX_HEALER" },
  { templateId: "dragon", element: "FIRE", preset: "MAX_ATTACKER" },
];

function runOne(specs, floor, seed) {
  const rng = mulberry32(seed);
  const players = specs.map((spec) => buildAlly(spec, rng, GEAR));
  const enemies = buildDungeonEnemyTeam(floor);
  const engine = new BattleEngine(players, enemies, { rng, maxTurns: 300 });
  const units = engine.getUnits();
  const boss = units.find((u) => u.team === "ENEMY" && u.def.victoryTarget) ?? units.find((u) => u.team === "ENEMY");

  let turns = 0;
  while (!engine.getWinner() && turns < 300) {
    const actor = engine.getNextActor();
    if (!actor) break;
    engine.resolveTurn(actor);
    turns += 1;
  }
  return {
    won: engine.getWinner() === "PLAYER",
    turns,
    bossHp: boss ? Math.max(0, boss.currentHp / boss.maxHp) : 0,
  };
}

console.log(`装備: ${GEAR} / ${RUNS}戦ずつ\n`);
console.log("|階|編成|勝率|平均手数|ボス残HP|");
console.log("|---|---|---:|---:|---:|");
for (const floor of AWAKENING_DEPTH_FLOORS) {
  for (const [name, specs] of [["集中", FOCUS], ["分散", SPREAD], ["耐久", SUSTAIN]]) {
    const rows = Array.from({ length: RUNS }, (_, i) => runOne(specs, floor, 7_000_000 + floor.floor * 1000 + i));
    const wins = rows.filter((r) => r.won).length;
    console.log(
      `|${floor.floor}F|${name}|${pct(wins / RUNS)}|${mean(rows.map((r) => r.turns)).toFixed(1)}|`
      + `${pct(mean(rows.map((r) => r.bossHp)))}|`,
    );
  }
}
