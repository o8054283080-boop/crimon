/**
 * **スキル調整の前後で、編成どうしの強さがどう動いたかを測る。**
 *
 *   npx tsx tools/skillsReport/tuning/battleCheck.ts            # 既定: 各60戦
 *   npx tsx tools/skillsReport/tuning/battleCheck.ts --runs 200
 *
 * 変更前と比べる時は、変更前のコミットを別の作業ツリーに出して同じコマンドを流す
 * (`git worktree add ../before <commit>`)。**このファイルごと持っていくこと。**
 *
 * 挑む側は `tools/arenaNpcPressure.ts` と同じ4体、守る側は依頼で名指しされた
 * 「防衛が強い」編成(ベヒモス入り)と、比較用にベヒモスを抜いた編成。
 * アリーナと同じ速度圧縮・同じ戦闘設定で戦わせる。
 * 勝率は飽和しやすいので、**決着時に守る側へ残っていたHP**も並べる。
 */
import { BattleEngine } from "../../../src/battle/engine.js";
import type { MonsterDefinition } from "../../../src/core/monster.js";
import { ARENA_BATTLE_OPTIONS, arenaCompressedSpeed } from "../../../src/data/pvpArena.js";
import { buildAlly } from "../../battleLab/build.js";
import { mulberry32 } from "../../battleLab/rng.js";
import type { AllySpec, GearGrade } from "../../battleLab/types.js";

const argv = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const RUNS = Number(arg("runs", "60"));
const GEAR = arg("gear", "STRONG") as GearGrade;

const CHALLENGER: AllySpec[] = [
  { label: "主力・草グリフォン", templateId: "griffon", element: "GRASS", preset: "MAX_ATTACKER" },
  { label: "主力・火ドラゴン", templateId: "dragon", element: "FIRE", preset: "MAX_ATTACKER" },
  { label: "妨害・電気ネメシス", templateId: "nemesis", element: "ELECTRIC", preset: "MAX_DEBUFFER" },
  { label: "回復・水セラフ", templateId: "seraph", element: "WATER", preset: "MAX_HEALER" },
];

const DEFENSES: Record<string, AllySpec[]> = {
  "ベヒモス闇+回復+妨害+火力": [
    { label: "ベヒモス闇", templateId: "behemoth", element: "DARK", preset: "MAX_TANK" },
    { label: "水セラフ", templateId: "seraph", element: "WATER", preset: "MAX_HEALER" },
    { label: "電気ネメシス", templateId: "nemesis", element: "ELECTRIC", preset: "MAX_DEBUFFER" },
    { label: "火ドラゴン", templateId: "dragon", element: "FIRE", preset: "MAX_ATTACKER" },
  ],
  "ベヒモス電気+回復+妨害+火力": [
    { label: "ベヒモス電気", templateId: "behemoth", element: "ELECTRIC", preset: "MAX_TANK" },
    { label: "水セラフ", templateId: "seraph", element: "WATER", preset: "MAX_HEALER" },
    { label: "電気ネメシス", templateId: "nemesis", element: "ELECTRIC", preset: "MAX_DEBUFFER" },
    { label: "火ドラゴン", templateId: "dragon", element: "FIRE", preset: "MAX_ATTACKER" },
  ],
  "ベヒモス2体+回復+妨害": [
    { label: "ベヒモス闇", templateId: "behemoth", element: "DARK", preset: "MAX_TANK" },
    { label: "ベヒモス水", templateId: "behemoth", element: "WATER", preset: "MAX_TANK" },
    { label: "水セラフ", templateId: "seraph", element: "WATER", preset: "MAX_HEALER" },
    { label: "電気ネメシス", templateId: "nemesis", element: "ELECTRIC", preset: "MAX_DEBUFFER" },
  ],
  "比較: ゴーレム+回復+妨害+火力": [
    { label: "電気ゴーレム", templateId: "golem", element: "ELECTRIC", preset: "MAX_TANK" },
    { label: "水セラフ", templateId: "seraph", element: "WATER", preset: "MAX_HEALER" },
    { label: "電気ネメシス", templateId: "nemesis", element: "ELECTRIC", preset: "MAX_DEBUFFER" },
    { label: "火ドラゴン", templateId: "dragon", element: "FIRE", preset: "MAX_ATTACKER" },
  ],
};

function withArenaSpeed(def: MonsterDefinition): MonsterDefinition {
  return { ...def, stats: { ...def.stats, spd: arenaCompressedSpeed(def.stats.spd) } };
}

console.log(`挑む側: ${CHALLENGER.map((s) => s.label).join("・")} / ${GEAR}装備 / 各${RUNS}戦`);
console.log("| 守る側 | 挑む側の勝率 | 決着時の守る側残HP | 手番 |");
console.log("|---|---:|---:|---:|");
for (const [name, defense] of Object.entries(DEFENSES)) {
  let wins = 0;
  let hpLeft = 0;
  let actions = 0;
  for (let run = 0; run < RUNS; run += 1) {
    const allies = CHALLENGER.map((spec) => withArenaSpeed(buildAlly(spec, mulberry32(7_000 + run * 31), GEAR)));
    const enemies = defense.map((spec) => withArenaSpeed(buildAlly(spec, mulberry32(9_000 + run * 17), GEAR)));
    const result = new BattleEngine(allies, enemies, { ...ARENA_BATTLE_OPTIONS, rng: mulberry32(50_000 + run * 977) }).run();
    if (result.winner === "PLAYER") wins += 1;
    const last = result.turns[result.turns.length - 1];
    const snap = last ? last.snapshot.filter((u) => u.team === "ENEMY") : [];
    const max = snap.reduce((sum, u) => sum + u.maxHp, 0);
    hpLeft += max > 0 ? snap.reduce((sum, u) => sum + Math.max(0, u.currentHp), 0) / max : 0;
    actions += result.turns.length;
  }
  console.log(`| ${name} | ${((wins / RUNS) * 100).toFixed(0)}% | ${((hpLeft / RUNS) * 100).toFixed(1)}% | ${Math.round(actions / RUNS)} |`);
}
