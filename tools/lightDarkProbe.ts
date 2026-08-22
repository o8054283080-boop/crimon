/**
 * 光/闇の固有スキル3が、同じ種族の通常スキル3より本当に強いかを実測する。
 *
 * 「強いスキルにした」は書けば書けるが、**実際に効いていなければ意味がない。**
 *
 * 測り方に三度失敗しているので、経緯を残しておく。同じ穴を掘り直さないために。
 *
 * 1. **属性ごと入れ替えて比べた** → 失敗。光/闇は属性相性そのものが違うので、
 *    差が「スキルのおかげ」なのか「相性のおかげ」なのか分からない
 * 2. **共通の相手への勝率を比べた** → 失敗。勝率は0%と100%で頭打ちになる。
 *    相手の強さを段階的に変えて自動調整も試したが、通常モンスターは
 *    40→50レベルの1段で100%から0%へ落ち、高レアは最上段でも100%のままで、
 *    真ん中に来る段が存在しなかった
 * 3. **スキル3だけ違う2チームの直接対決** → 失敗。素早さが完全に同じなので、
 *    ドラゴンやネメシスでは**先に並んだ側が必ず勝つ**。左右を入れ替えて
 *    打ち消すと、今度は差が丸ごと消えてちょうど50%になる。
 *    さらにフェアリーどうしは40戦すべて引き分け(回復しあって終わらない)で、
 *    勝敗では支援役を一切評価できない
 *
 * いま採っているのは**連続量**。共通の相手と戦わせ、勝ち負けではなく
 * 「相手のHPをどれだけ削ったか」から「自分のHPをどれだけ失ったか」を引いた値を見る。
 * 0か1かに丸められないので頭打ちになりにくく、支援役も
 * 「味方のHPが残る」という形で数字に出る。
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

function unit(templateId: string, element: string, star: number, level: number): MonsterDefinition {
  const inst = createMonsterInstance(`${templateId}_${element}`, star, level);
  return toBattleDefinition(inst, findMonsterById(inst.dexId)!);
}

/** 通常モンスター用の相手 */
const COMMON_FOES = () => [
  unit("golem", "WATER", 5, 50),
  unit("wolf", "FIRE", 5, 50),
  unit("fairy", "GRASS", 5, 50),
  unit("imp", "ELECTRIC", 5, 50),
];

/** 高レア用の相手。通常モンスターでは手応えがなく、削り具合が振り切れてしまう */
const RARE_FOES = () => [
  unit("dragon", "WATER", 6, 60),
  unit("nemesis", "GRASS", 6, 60),
  unit("seraph", "ELECTRIC", 6, 60),
  unit("griffon", "FIRE", 6, 60),
];

/**
 * 固定の仲間3体。**測る側は1体だけ**にする。
 *
 * 同じ種族を4体並べると、支援役は誰も敵を倒せずに全滅し、
 * どのスキルでも同じ「全滅」に潰れて差が消える(実際にフェアリーとウィスプが
 * 光も闇も通常も揃って底値になった)。攻め手と受け手が揃った編成に
 * 1体だけ混ぜれば、支援役の働きも「味方のHPが残る」形で数字に出る。
 */
const ALLIES = {
  common: [
    { templateId: "wolf", element: "FIRE" },
    { templateId: "golem", element: "WATER" },
    { templateId: "knight", element: "ELECTRIC" },
  ],
  rare: [
    { templateId: "dragon", element: "FIRE" },
    { templateId: "griffon", element: "WATER" },
    { templateId: "seraph", element: "ELECTRIC" },
  ],
};

/** スキル3を差し替えた1体＋固定の仲間3体。差し替え以外は完全に同じ条件にする */
function team(template: MonsterTemplate, skill3: Skill | undefined): MonsterDefinition[] {
  const isRare = RARE_TEMPLATES.includes(template);
  const star = isRare ? 6 : 5;
  const level = isRare ? 60 : 50;

  const probed = unit(template.templateId, "FIRE", star, level);
  if (skill3) probed.skills = [probed.skills[0], probed.skills[1], skill3];

  const allies = (isRare ? ALLIES.rare : ALLIES.common).map((a) => unit(a.templateId, a.element, star, level));
  return [probed, ...allies];
}

function hpFraction(units: { currentHp: number; maxHp: number }[]): number {
  const max = units.reduce((sum, u) => sum + u.maxHp, 0);
  return max === 0 ? 0 : units.reduce((sum, u) => sum + u.currentHp, 0) / max;
}

/**
 * 戦いの「押し込み具合」。相手を削った割合から、自分が失った割合を引く。
 *
 * -1(何もできずに全滅)から +1(無傷で殲滅)まで。勝敗と違って途中の差も残るので、
 * 引き分けに終わる支援役どうしでも、どちらがどれだけ耐えたかが数字になる。
 */
function pressure(template: MonsterTemplate, skill3: Skill | undefined, trials: number): number {
  const isRare = RARE_TEMPLATES.includes(template);
  let total = 0;
  for (let i = 0; i < trials; i++) {
    const engine = new BattleEngine(team(template, skill3), isRare ? RARE_FOES() : COMMON_FOES(), {
      rng: mulberry32(700 + i),
    });
    engine.run();
    const units = engine.getUnits();
    const mine = units.filter((u) => u.team === "PLAYER");
    const theirs = units.filter((u) => u.team === "ENEMY");
    total += 1 - hpFraction(theirs) - (1 - hpFraction(mine));
  }
  return total / trials;
}

const TRIALS = 60;

/** これ未満の差は誤差として扱う(HP割合で2ポイント) */
const MEANINGFUL_MARGIN = 0.02;

const score = (v: number) => (v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2)).padStart(7);

function verdictOf(delta: number): { label: string; key: "stronger" | "even" | "weaker" } {
  if (delta >= MEANINGFUL_MARGIN) return { label: "強い", key: "stronger" };
  if (delta <= -MEANINGFUL_MARGIN) return { label: "**弱い**", key: "weaker" };
  return { label: "互角", key: "even" };
}

// 測り方そのものの確認。同じスキルどうしなら差はぴったり0になるはずで、
// ここがずれていたら結果全部が信用できない
const wolf = MONSTER_TEMPLATES[1];
const selfCheck = pressure(wolf, wolf.skill3Variants[0], TRIALS) - pressure(wolf, wolf.skill3Variants[0], TRIALS);
console.log(`測り方の確認(同じスキルどうしの差): ${score(selfCheck)} — 0.00 なら正常`);
if (selfCheck !== 0) console.log("  ⚠ 同じ条件で結果が揺れている。乱数の与え方を疑うこと");

console.log("\n共通の相手に対する押し込み具合(相手を削った割合 − 自分が失った割合)");
console.log(`${"種族".padEnd(12)}${"通常".padStart(7)}${"光".padStart(7)}${"闇".padStart(7)}${"光の差".padStart(8)}${"闇の差".padStart(8)}   判定`);

const tally = { stronger: 0, even: 0, weaker: 0 };
const problems: string[] = [];

for (const template of PROBED_TEMPLATES) {
  if (!template.lightSkill3 && !template.darkSkill3) continue;

  const base = pressure(template, undefined, TRIALS);
  const cells = ([["光", template.lightSkill3], ["闇", template.darkSkill3]] as const).map(([label, skill]) => {
    const value = skill ? pressure(template, skill, TRIALS) : Number.NaN;
    const delta = value - base;
    return { label, value, delta, verdict: verdictOf(delta) };
  });

  for (const cell of cells) {
    if (Number.isNaN(cell.value)) continue;
    tally[cell.verdict.key] += 1;
    if (cell.verdict.key !== "stronger") {
      problems.push(`${template.baseName}の${cell.label}(${cell.delta >= 0 ? "+" : ""}${cell.delta.toFixed(2)})`);
    }
  }

  const values = cells.map((c) => (Number.isNaN(c.value) ? "     — " : score(c.value))).join("");
  const deltas = cells.map((c) => (Number.isNaN(c.delta) ? "      — " : score(c.delta).padStart(8))).join("");
  const verdict = cells.map((c) => `${c.label}:${c.verdict.label}`).join(" ");
  // 通常スキルの時点でほぼ無傷の殲滅なら、上に伸ばせる幅がそもそも残っていない。
  // ここを見落とすと「差が出ないから」と際限なく倍率を盛ってしまう
  const headroom = base > 0.8 ? `  (伸びしろ ${(1 - base).toFixed(2)} しかない)` : "";
  console.log(`${template.baseName.padEnd(12)}${score(base)}${values}${deltas}   ${verdict}${headroom}`);
}

console.log(`\n強い ${tally.stronger} / 互角 ${tally.even} / 弱い ${tally.weaker}`);
if (problems.length > 0) {
  // 光/闇は召喚でしか手に入らない。通常と互角では、レアである意味がない
  console.log(`通常スキルを上回っていない: ${problems.join("、")}`);
  process.exitCode = 1;
}
