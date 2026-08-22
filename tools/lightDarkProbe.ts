/**
 * 光/闇の固有スキル3が、同じ種族の通常スキル3より本当に強いかを実測する。
 *
 * 「強いスキルにした」は書けば書けるが、**実際に効いていなければ意味がない。**
 *
 * 注意1: 属性ごと入れ替えて比べてはいけない。光/闇は属性相性そのものが違うので、
 * 勝率の差が「スキルのおかげ」なのか「相性のおかげ」なのか分からなくなる
 * (実際に最初そう測って、結論が出せなかった)。
 * ここでは**同じ属性のまま、スキル3だけを差し替えて**比べる。
 *
 * 注意2: 勝率は0%と100%で頭打ちになる。全滅どうし・完勝どうしを並べても
 * 差は出ないので、**種族の格に合わせて相手を変える**。それでも天井/床に
 * 貼り付いた組み合わせは「強い/弱い」ではなく「測れなかった」として扱う。
 *
 *   npx tsx tools/lightDarkProbe.ts
 */
import { BattleEngine } from "../src/battle/engine.js";
import { MonsterDefinition, MonsterTemplate } from "../src/core/monster.js";
import { createMonsterInstance, toBattleDefinition } from "../src/core/monsterInstance.js";
import { Skill } from "../src/core/skill.js";
import {
  GACHA_SR_COMMON_TEMPLATE,
  GACHA_SR_RARE_TEMPLATE,
  GACHA_SSR_COMMON_TEMPLATE,
  GACHA_SSR_RARE_TEMPLATE,
  MONSTER_TEMPLATES,
  findMonsterById,
} from "../src/data/monsters.js";

/** ガチャ限定の高レアも同じ基準で測る。強さの根拠が「レアだから」で止まらないように */
const RARE_TEMPLATES = [
  GACHA_SR_COMMON_TEMPLATE,
  GACHA_SR_RARE_TEMPLATE,
  GACHA_SSR_COMMON_TEMPLATE,
  GACHA_SSR_RARE_TEMPLATE,
];

const PROBED_TEMPLATES = [...MONSTER_TEMPLATES, ...RARE_TEMPLATES];

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

interface Opponent {
  templateId: string;
  element: string;
  star: number;
  level: number;
}

/** 通常モンスター用の相手。硬すぎず柔らかすぎない混成 */
const NORMAL_FOES: Opponent[] = [
  { templateId: "golem", element: "WATER", star: 5, level: 45 },
  { templateId: "wolf", element: "FIRE", star: 5, level: 45 },
  { templateId: "fairy", element: "GRASS", star: 5, level: 45 },
  { templateId: "imp", element: "ELECTRIC", star: 5, level: 45 },
];

/** 高レア用の相手。通常の相手だと全員が完勝してしまい、差が一切見えない */
const RARE_FOES: Opponent[] = [
  { templateId: "dragon", element: "WATER", star: 6, level: 60 },
  { templateId: "nemesis", element: "GRASS", star: 6, level: 60 },
  { templateId: "seraph", element: "ELECTRIC", star: 6, level: 60 },
  { templateId: "griffon", element: "FIRE", star: 6, level: 60 },
];

function build(o: Opponent): MonsterDefinition {
  const inst = createMonsterInstance(`${o.templateId}_${o.element}`, o.star, o.level);
  return toBattleDefinition(inst, findMonsterById(inst.dexId)!);
}

/**
 * 指定のスキル3を持たせた4体編成で挑み、勝率を返す。
 * `skill3` を差し替える以外は完全に同じ条件にする。
 */
function winRate(template: MonsterTemplate, skill3: Skill | undefined, foes: Opponent[], trials: number): number {
  const isRare = RARE_TEMPLATES.includes(template);
  let wins = 0;
  for (let i = 0; i < trials; i++) {
    const rng = mulberry32(700 + i);
    const players = Array.from({ length: 4 }, () => {
      const inst = createMonsterInstance(`${template.templateId}_FIRE`, isRare ? 6 : 5, isRare ? 60 : 50);
      const def = toBattleDefinition(inst, findMonsterById(inst.dexId)!);
      if (skill3) def.skills = [def.skills[0], def.skills[1], skill3];
      return def;
    });
    if (new BattleEngine(players, foes.map(build), { rng }).run().winner === "PLAYER") wins += 1;
  }
  return wins / trials;
}

const TRIALS = 80;
const pct = (v: number) => (Number.isNaN(v) ? "  —  ".padStart(7) : `${(v * 100).toFixed(0)}%`.padStart(7));

/**
 * 通常と比べて強くなったか。**天井(両方100%)と床(両方0%)は「測れなかった」を返す。**
 * ここを「以上だから合格」で片付けると、何も測っていない行が合格数に混ざる。
 */
function compare(base: number, variant: number): "stronger" | "same" | "weaker" | "unmeasurable" {
  if (Number.isNaN(variant)) return "unmeasurable";
  if ((base === 0 && variant === 0) || (base === 1 && variant === 1)) return "unmeasurable";
  if (variant > base) return "stronger";
  if (variant < base) return "weaker";
  return "same";
}

console.log("同じ属性(火)のまま、スキル3だけを差し替えて比較");
console.log(`${"種族".padEnd(12)}${"通常".padStart(7)}${"光".padStart(7)}${"闇".padStart(7)}   判定`);

const tally = { stronger: 0, same: 0, weaker: 0, unmeasurable: 0 };
const weaker: string[] = [];

for (const template of PROBED_TEMPLATES) {
  if (!template.lightSkill3 && !template.darkSkill3) continue;
  const foes = RARE_TEMPLATES.includes(template) ? RARE_FOES : NORMAL_FOES;

  const base = winRate(template, undefined, foes, TRIALS);
  const light = template.lightSkill3 ? winRate(template, template.lightSkill3, foes, TRIALS) : Number.NaN;
  const dark = template.darkSkill3 ? winRate(template, template.darkSkill3, foes, TRIALS) : Number.NaN;

  const results = { 光: compare(base, light), 闇: compare(base, dark) };
  for (const [label, result] of Object.entries(results)) {
    tally[result] += 1;
    if (result === "weaker") weaker.push(`${template.baseName}の${label}`);
  }

  const verdict =
    results.光 === "unmeasurable" && results.闇 === "unmeasurable"
      ? "この相手では差が測れない"
      : Object.entries(results)
          .map(([label, r]) => `${label}:${{ stronger: "強い", same: "同等", weaker: "**弱い**", unmeasurable: "測れず" }[r]}`)
          .join(" ");

  console.log(`${template.baseName.padEnd(12)}${pct(base)}${pct(light)}${pct(dark)}   ${verdict}`);
}

console.log(`\n強くなった ${tally.stronger} / 同等 ${tally.same} / 弱い ${tally.weaker} / 測れず ${tally.unmeasurable}`);
if (weaker.length > 0) {
  console.log(`通常を下回っている: ${weaker.join("、")}`);
  process.exitCode = 1;
}
