/**
 * **変更前と変更後の実効 Lv1〜5 を、数字ごとに突き合わせる。**
 *
 * 「弱くなった数字」を1つ残らず拾うためのもの。どちらが強いかは項目ごとに決まっている:
 *
 *   大きいほど強い … 倍率・比例係数・発動率・回復量・シールド量・持続・スタック・ヒット数
 *   小さいほど強い … クールタイム
 *   符号つきの量  … 行動ゲージは「絶対値が大きいほど強い」(味方へ+50%も敵へ-50%も、大きいほど効く)
 *
 * 効果の対応は「効果の種類 + その種類の中で何番目か」で取る。並びを入れ替えても
 * 同じ種類の同じ番目なら同じ効果として比べる。効果が消えたらそれも弱体化に数える。
 *
 * **例外(弱くなって良いもの)は呼び出し側が明示する。**勝手に見逃す値は持たない。
 */
import type { LevelEntry, MonsterReport, SkillReport } from "./collect.js";

/** 強さの向き。1 = 大きいほど強い、-1 = 小さいほど強い、0 = 比べない(文字列・印など) */
const DIRECTION: Record<string, 1 | -1 | "abs"> = {
  multiplier: 1, hpCoefficient: 1, defCoefficient: 1, chance: 1, healRate: 1, shieldRate: 1,
  durationTurns: 1, stacks: 1, hits: 1, damageRatePerStack: 1, ratio: 1, turns: 1, count: 1,
  amount: "abs", share: 1, bonus: 1, maxSourceHpRate: 1, allies: 1, allyCooldownReduce: 1, damageMultiplier: 1,
  ignoreDefenseRatio: 1, finalDamageBonus: 1, gaugeOnCritPerHit: 1, selfGaugePerRemoved: 1, selfGaugePerTarget: 1,
  maxBonus: 1, perBuff: 1, perDebuff: 1, bonusAtReference: 1, extraStacksIfPoisoned: 1, critDamageBonus: 1,
  currentHpBonus: 1, fullHpBonus: 1, heal: 1, gauge: 1, counterHpRatio: 1,
};

export interface Weakening {
  skillId: string;
  level: number;
  where: string;
  before: unknown;
  after: unknown;
}

type Effect = Record<string, unknown>;

function keyed(effects: readonly Effect[]): Map<string, Effect> {
  const counts = new Map<string, number>();
  const out = new Map<string, Effect>();
  for (const effect of effects) {
    const kind = String(effect.kind);
    const n = counts.get(kind) ?? 0;
    counts.set(kind, n + 1);
    out.set(`${kind}#${n}`, effect);
  }
  return out;
}

function stronger(dir: 1 | -1 | "abs", before: number, after: number): "weaker" | "ok" {
  const eps = 1e-9;
  if (dir === "abs") return Math.abs(after) + eps < Math.abs(before) ? "weaker" : "ok";
  return dir * (after - before) < -eps ? "weaker" : "ok";
}

function compareEffect(where: string, before: Effect, after: Effect, out: (w: string, b: unknown, a: unknown) => void): void {
  for (const [key, value] of Object.entries(before)) {
    const dir = DIRECTION[key];
    if (typeof value === "number") {
      const next = after[key];
      if (dir === undefined) {
        if (next !== value) out(`${where}.${key}`, value, next);
        continue;
      }
      if (typeof next !== "number") {
        out(`${where}.${key}`, value, next);
        continue;
      }
      if (stronger(dir, value, next) === "weaker") out(`${where}.${key}`, value, next);
      continue;
    }
    if (key === "perHitEffects" && Array.isArray(value)) {
      const nextList = after[key];
      if (!Array.isArray(nextList)) {
        out(`${where}.perHitEffects`, "あり", "なし");
        continue;
      }
      compareEffects(`${where}.perHit`, value as Effect[], nextList as Effect[], out);
      continue;
    }
    // 条件・対象・印など、強弱で比べられないものは「変わっていないこと」だけを見る
    if (key === "kind") continue;
    if (JSON.stringify(value) !== JSON.stringify(after[key])) {
      // 数字の入れ物(配列・オブジェクト)は中身の数字で比べる
      if (value && typeof value === "object" && after[key] && typeof after[key] === "object") {
        compareNested(`${where}.${key}`, value, after[key] as object, out);
        continue;
      }
      out(`${where}.${key}`, value, after[key]);
    }
  }
}

function compareNested(where: string, before: object, after: object, out: (w: string, b: unknown, a: unknown) => void): void {
  for (const [key, value] of Object.entries(before)) {
    const next = (after as Record<string, unknown>)[key];
    if (typeof value === "number" && typeof next === "number") {
      // クールタイムは短いほど強い(復活・内部CTなど、パッシブの中にもある)
      const smallerIsStronger = /cooldown/i.test(key);
      if (smallerIsStronger ? next > value + 1e-9 : next + 1e-9 < value) out(`${where}.${key}`, value, next);
    } else if (value && typeof value === "object" && next && typeof next === "object") {
      compareNested(`${where}.${key}`, value, next, out);
    } else if (JSON.stringify(value) !== JSON.stringify(next)) {
      out(`${where}.${key}`, value, next);
    }
  }
}

function compareEffects(where: string, before: Effect[], after: Effect[], out: (w: string, b: unknown, a: unknown) => void): void {
  const b = keyed(before);
  const a = keyed(after);
  for (const [key, effect] of b) {
    const next = a.get(key);
    if (!next) {
      out(`${where}.${key}`, "あり", "なし");
      continue;
    }
    compareEffect(`${where}.${key}`, effect, next, out);
  }
}

function compareLevel(skillId: string, before: LevelEntry, after: LevelEntry): Weakening[] {
  const found: Weakening[] = [];
  const out = (where: string, b: unknown, a: unknown) => found.push({ skillId, level: before.level, where, before: b, after: a });
  if (after.cooldownTurns > before.cooldownTurns) out("cooldownTurns", before.cooldownTurns, after.cooldownTurns);
  if (after.target !== before.target) out("target", before.target, after.target);
  compareEffects("effects", before.effects as unknown as Effect[], after.effects as unknown as Effect[], out);
  if (before.passive && after.passive) {
    compareNested("passive", before.passive as object, after.passive as object, out);
  }
  for (const [key, value] of Object.entries(before.flags)) {
    if (JSON.stringify(after.flags[key]) !== JSON.stringify(value)) out(`flags.${key}`, value, after.flags[key]);
  }
  return found;
}

/** 変更前のどこかより弱くなった数字を、全部返す */
export function findWeakenings(before: MonsterReport[], after: MonsterReport[]): Weakening[] {
  const afterSkills = new Map<string, SkillReport>();
  for (const m of after) for (const s of m.skills) afterSkills.set(s.skillId, s);
  const found: Weakening[] = [];
  for (const m of before) {
    for (const skill of m.skills) {
      const next = afterSkills.get(skill.skillId);
      if (!next) {
        found.push({ skillId: skill.skillId, level: 0, where: "skill", before: "あり", after: "なし" });
        continue;
      }
      skill.levels.forEach((level, i) => found.push(...compareLevel(skill.skillId, level, next.levels[i])));
    }
  }
  return found;
}

/** 変わった箇所の一覧(強くなったものも含む)。レポート用 */
export function changedSkills(before: MonsterReport[], after: MonsterReport[]): string[] {
  const afterSkills = new Map<string, SkillReport>();
  for (const m of after) for (const s of m.skills) afterSkills.set(s.skillId, s);
  const changed: string[] = [];
  for (const m of before) {
    for (const skill of m.skills) {
      const next = afterSkills.get(skill.skillId);
      const strip = (s: SkillReport) => JSON.stringify(s.levels.map((l) => [l.cooldownTurns, l.target, l.effects, l.passive, l.flags]));
      if (!next || strip(skill) !== strip(next)) changed.push(skill.skillId);
    }
  }
  return changed;
}
