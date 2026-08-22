/**
 * 光/闇の固有スキル3が、同じ種族の通常スキル3より本当に強いかを実測する。
 *
 * 「強いスキルにした」は書けば書けるが、**実際に効いていなければ意味がない。**
 *
 * 注意: 属性ごと入れ替えて比べてはいけない。光/闇は属性相性そのものが違うので、
 * 勝率の差が「スキルのおかげ」なのか「相性のおかげ」なのか分からなくなる
 * (実際に最初そう測って、結論が出せなかった)。
 * ここでは**同じ属性のまま、スキル3だけを差し替えて**比べる。
 *
 *   npx tsx tools/lightDarkProbe.ts
 */
import { BattleEngine } from "../src/battle/engine.js";
import { MonsterDefinition } from "../src/core/monster.js";
import { createMonsterInstance, toBattleDefinition } from "../src/core/monsterInstance.js";
import { Skill } from "../src/core/skill.js";
import { MONSTER_TEMPLATES, findMonsterById } from "../src/data/monsters.js";

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 比較の基準になる相手。硬すぎず柔らかすぎない混成にして、勝率が中間に来るようにする */
function opponents(): MonsterDefinition[] {
  return [
    ["golem", "WATER"],
    ["wolf", "FIRE"],
    ["fairy", "GRASS"],
    ["imp", "ELECTRIC"],
  ].map(([tid, e]) => {
    const inst = createMonsterInstance(`${tid}_${e}`, 5, 45);
    return toBattleDefinition(inst, findMonsterById(inst.dexId)!);
  });
}

/**
 * 指定のスキル3を持たせた4体編成で挑み、勝率を返す。
 * `skill3` を差し替える以外は完全に同じ条件にする。
 */
function winRate(templateId: string, skill3: Skill | undefined, trials: number): number {
  let wins = 0;
  for (let i = 0; i < trials; i++) {
    const rng = mulberry32(700 + i);
    const players = Array.from({ length: 4 }, () => {
      const inst = createMonsterInstance(`${templateId}_FIRE`, 5, 50);
      const def = toBattleDefinition(inst, findMonsterById(inst.dexId)!);
      if (skill3) def.skills = [def.skills[0], def.skills[1], skill3];
      return def;
    });
    if (new BattleEngine(players, opponents(), { rng }).run().winner === "PLAYER") wins += 1;
  }
  return wins / trials;
}

const TRIALS = 80;
const pct = (v: number) => `${(v * 100).toFixed(0)}%`.padStart(7);

console.log("同じ属性(火)のまま、スキル3だけを差し替えて比較");
console.log(`${"種族".padEnd(12)}${"通常".padStart(7)}${"光".padStart(7)}${"闇".padStart(7)}   判定`);

let lightWins = 0;
let darkWins = 0;
let compared = 0;

for (const template of MONSTER_TEMPLATES) {
  if (!template.lightSkill3 && !template.darkSkill3) continue;
  const base = winRate(template.templateId, undefined, TRIALS);
  const light = template.lightSkill3 ? winRate(template.templateId, template.lightSkill3, TRIALS) : Number.NaN;
  const dark = template.darkSkill3 ? winRate(template.templateId, template.darkSkill3, TRIALS) : Number.NaN;

  compared += 1;
  if (light >= base) lightWins += 1;
  if (dark >= base) darkWins += 1;

  // 支援役だけを4体並べても、この相手には誰も勝てない。
  // 全部0%の行は「弱い」のではなく「この基準では差が測れない」ことを示す
  const undiscriminating = base === 0 && (Number.isNaN(light) || light === 0) && (Number.isNaN(dark) || dark === 0);
  const verdict = undiscriminating
    ? "この基準では差が出ない(支援役)"
    : light >= base && dark >= base
      ? "両方とも通常以上"
      : light < base
        ? "光が通常を下回る"
        : "闇が通常を下回る";
  console.log(`${template.baseName.padEnd(12)}${pct(base)}${pct(light)}${pct(dark)}   ${verdict}`);
}

console.log(`\n通常以上だったもの: 光 ${lightWins}/${compared}、闇 ${darkWins}/${compared}`);
