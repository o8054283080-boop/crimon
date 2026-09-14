/**
 * アリーナNPCの、実際に戦う時のステータスを出す。
 *
 * **設定の表を見ても、出来上がった個体の強さは分からない。**
 * 星・レベル・装備・能力ポイント・タイプ転生・潜在覚醒を全部通した
 * 最終的な数字を見ないと、帯どうしの差が読めない。
 *
 *   npx tsx tools/arenaNpcStats.ts --ratings 3000,3500
 *   npx tsx tools/arenaNpcStats.ts --ratings 3000,3500 --team titan_tide
 */
import { arenaCompressedSpeed } from "../src/data/pvpArena.js";
import { ARENA_NPC_TEAMS } from "../src/data/arena/npcTeams.js";
import { arenaNpcBandForRating } from "../src/data/arena/npcConfig.js";
import { buildArenaNpc } from "../src/game/arena/npc.js";
import { snapshotToDefinitions } from "../src/game/arena/snapshot.js";

const argv = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const RATINGS = arg("ratings", "3000,3500").split(",").map(Number);
const TEAM = arg("team", "");
const SEEDS = Number(arg("seeds", "1"));

/** 狙った編成だけを引かせる(他を「すでに出した」ことにして除く) */
function excludeAllBut(teamId: string): Set<string> {
  return new Set(ARENA_NPC_TEAMS.filter((team) => team.id !== teamId).map((team) => team.id));
}

const n = (value: number) => Math.round(value).toLocaleString("en-US");
const pct = (value: number) => `${Math.round(value * 100)}%`;

for (const rating of RATINGS) {
  const band = arenaNpcBandForRating(rating);
  console.log(`\n## レート${rating} … ${band.name}(${band.id})`);
  console.log(`装備の厳選 ${band.gearRolls ?? 1}本から1本 / 使う編成の段 ${band.teamTiers.join(",")}`);

  for (let seed = 0; seed < SEEDS; seed += 1) {
    const npc = buildArenaNpc(rating, 90_000 + seed * 13, 1, TEAM ? excludeAllBut(TEAM) : undefined);
    const defs = snapshotToDefinitions(npc.defense);
    console.log(`\n### ${npc.archetypeName}（レート${npc.rating}）`);
    console.log("| モンスター | HP | 攻撃 | 防御 | 速度(圧縮後) | クリ率 | クリダメ | 的中 | 抵抗 |");
    console.log("|---|---:|---:|---:|---:|---:|---:|---:|---:|");
    let hp = 0;
    let atk = 0;
    let def = 0;
    for (const d of defs) {
      const s = d.stats;
      hp += s.hp; atk += s.atk; def += s.def;
      console.log(`| ${d.name} | ${n(s.hp)} | ${n(s.atk)} | ${n(s.def)} `
        + `| ${n(s.spd)}(${n(arenaCompressedSpeed(s.spd))}) | ${pct(s.criRate)} | ${pct(s.criDmg)} `
        + `| ${pct(s.accuracy)} | ${pct(s.resistance)} |`);
    }
    console.log(`| **合計** | **${n(hp)}** | **${n(atk)}** | **${n(def)}** | | | | | |`);
  }
}
console.log("\n速度は素の値と、アリーナの圧縮を通した値。戦闘では圧縮後で動く");
