/**
 * **指定値 + 変更前の実効値 → 最終的な Lv1〜5。**
 *
 * スキル調整の指定は「Lv2で倍率1.15」のように、変わる所だけが書いてある。
 * 一方で、変更前のゲーム内の値(一律成長で Lv ごとに約6%ずつ伸びた値)は
 * 指定を書いた時に見えていなかったことが多く、**指定値をそのまま入れると弱くなる段**が出る。
 * 依頼の共通方針は「ナーフ禁止」「端数整理で元より弱くしない」なので、ここで機械的に決める:
 *
 *   R1 指定がある値 … 指定値。ただし変更前の同じ Lv の値より弱ければ、
 *                     変更前の値以上で最も近いきりのいい値へ上げる(逸脱として記録する)
 *   R2 指定が無い値 … 変更前の同じ Lv の値を引き継ぐ。一律成長の端数は上方向へ整理する
 *   R3 新しい効果    … 指定に書かれたものだけ(`structure`)。変更前には無いので R1/R2 は掛からない
 *   R4 弱くなって良い … 置き換え・作り直しの指定がある所だけ(`allowWeaker`)。理由を必ず書く
 *
 * ここで決めた値をそのまま定義ファイルの `levelOverrides` に書く(`emit.ts`)。
 * テストも同じ関数で「期待値」を作り、実効値と1件ずつ照合する。
 */
import type { SkillEffect, TargetType } from "../../../src/core/skill.js";
import type { LevelEntry, MonsterReport, SkillReport } from "../collect.js";

export type Effect = Record<string, unknown> & { kind: string };
export type Series = readonly (number | undefined)[];

/** 構造の変更。Lv1 の効果列を受け取り、新しい効果列を返す */
export type StructureStep = (effects: Effect[]) => Effect[];

export interface SkillSpec {
  id: string;
  /** 強化なし。実効 Lv1〜5 を1文字も変えない */
  keep?: true;
  /** 保留。今回は触らない(理由) */
  pending?: string;
  /** 効果の構造を変える(新効果の追加・置き換え)。**指定に書かれたものだけ** */
  structure?: readonly StructureStep[];
  /** Lv ごとに構造を足す(Lv5 だけ付く効果など) */
  levelStructure?: (level: number, effects: Effect[], before: LevelEntry) => Effect[];
  target?: TargetType;
  /** スキル全体の性質(即時追加ターンなど)。全 Lv 共通 */
  flags?: Record<string, unknown>;
  /** Lv1〜5 の指定値。キーは "ct" / "KIND#n.key" / "KIND#n.perHit.KIND#m.key" / "passive.key" */
  values?: Record<string, Series>;
  /** 弱くなって良い所(パス → 理由)。置き換えの指定がある時だけ使う */
  allowWeaker?: Record<string, string>;
  /** 曖昧な指定をどう具体化したか */
  note?: string;
}

export interface Deviation {
  skillId: string;
  level: number;
  path: string;
  specified: number;
  final: number;
  reason: string;
}

export interface ResolvedSkill {
  id: string;
  target: TargetType;
  flags: Record<string, unknown>;
  levels: { cooldownTurns: number; effects: SkillEffect[] }[];
  /** パッシブなら Lv1〜5 の値 */
  passiveLevels?: Record<string, unknown>[];
  deviations: Deviation[];
}

/* ============================================================ きりのいい値 */

const EPS = 1e-9;

function niceStep(kind: string, key: string, effect: Effect): number {
  if (key === "multiplier") return 0.05;
  if (key === "chance") return 0.05;
  if (key === "hpCoefficient") return 0.005;
  if (key === "defCoefficient") return 0.05;
  if (key === "damageRatePerStack") return 0.005;
  if (key === "amount" && kind === "GAUGE") return 0.05;
  if (key === "healRate") return effect.scaleStat === "atk" || effect.scaleStat === "def" ? 0.05 : 0.01;
  if (key === "shieldRate") return 0.01;
  return 0.01;
}

/** 変更前の値以上で最も近いきりのいい値。**符号は保つ**(ゲージ下げの -0.53 は -0.55 へ) */
export function roundUpNice(value: number, step: number): number {
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  const units = abs / step;
  const up = Math.abs(units - Math.round(units)) < 1e-6 ? Math.round(units) : Math.ceil(units - EPS);
  return sign * Math.round(up * step * 10000) / 10000;
}

/** 強さの向き。1 = 大きいほど強い / "abs" = 絶対値が大きいほど強い / -1 = 小さいほど強い */
function direction(kind: string, key: string): 1 | -1 | "abs" | null {
  if (key === "hpRatio" || key === "perLostRatio" || key === "slot" || key === "turns" && kind === "COOLDOWN_EXTEND") return null;
  if (kind === "SELF_DAMAGE" && key === "ratio") return -1;
  if (key === "amount" && kind === "GAUGE") return "abs";
  if (key === "amount" && (kind === "DEBUFF" || kind === "BUFF")) return null; // 共通定数。比べない
  return 1;
}

function weaker(dir: 1 | -1 | "abs", before: number, after: number): boolean {
  if (dir === "abs") return Math.abs(after) + EPS < Math.abs(before);
  return dir * (after - before) < -EPS;
}

/* ============================================================ 効果の対応 */

function keyOf(effects: readonly Effect[]): Map<string, Effect> {
  const counts = new Map<string, number>();
  const out = new Map<string, Effect>();
  for (const effect of effects) {
    const n = counts.get(effect.kind) ?? 0;
    counts.set(effect.kind, n + 1);
    out.set(`${effect.kind}#${n}`, effect);
  }
  return out;
}

const FRESH = Symbol("fresh");
const FIXED = Symbol("fixed");
type Marked = Effect & { [FRESH]?: true; [FIXED]?: Set<string> };

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/* ============================================================ 構造の部品 */

/** 末尾に新しい効果を足す(指定に書かれた新効果だけ) */
export const add = (effect: Effect): StructureStep => (effects) => [...effects, { ...effect, [FRESH]: true } as Marked];
/** 効果 i を置き換える(作り直しの指定がある時だけ) */
export const replace = (index: number, effect: Effect): StructureStep => (effects) =>
  effects.map((e, i) => (i === index ? ({ ...effect, [FRESH]: true } as Marked) : e));
/** 効果 i を消す(置き換えの指定がある時だけ) */
export const remove = (index: number): StructureStep => (effects) => effects.filter((_, i) => i !== index);
/** 効果 i の一部を書き換える。書き換えた欄は変更前から引き継がない */
export const patch = (index: number, fields: Record<string, unknown>): StructureStep => (effects) =>
  effects.map((e, i) => {
    if (i !== index) return e;
    const fixed = new Set((e as Marked)[FIXED] ?? []);
    for (const key of Object.keys(fields)) fixed.add(key);
    return { ...e, ...fields, [FIXED]: fixed } as Marked;
  });
/** 全効果を差し替える(完全な作り直し) */
export const rebuild = (effects: Effect[]): StructureStep => () => effects.map((e) => ({ ...e, [FRESH]: true } as Marked));

/* ============================================================ パス */

function splitPath(path: string): string[] {
  return path.split(".");
}

/** "DAMAGE#0.perHit.DEBUFF#0.chance" などを辿って、入れ物と最後の鍵を返す */
function locate(effects: Effect[], path: string, create = false): { holder: Record<string, unknown>; key: string; effect: Effect } | null {
  const parts = splitPath(path);
  let list = effects;
  let holder: Record<string, unknown> | undefined;
  let effect: Effect | undefined;
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (part.includes("#")) {
      effect = keyOf(list).get(part);
      if (!effect) return null;
      holder = effect;
      continue;
    }
    if (part === "perHit") {
      list = ((holder as Effect).perHitEffects as Effect[]) ?? [];
      continue;
    }
    if (i === parts.length - 1) return holder && effect ? { holder, key: part, effect } : null;
    const next = (holder as Record<string, unknown>)[part];
    if (next === undefined || next === null) {
      if (!create) return null;
      (holder as Record<string, unknown>)[part] = /^\d+$/.test(parts[i + 1]) ? [] : {};
    }
    holder = (holder as Record<string, unknown>)[part] as Record<string, unknown>;
  }
  return null;
}

/* ============================================================ 解決 */

function inherit(target: Effect, source: Effect, kind: string): void {
  const fixed = (target as Marked)[FIXED] ?? new Set<string>();
  for (const [key, value] of Object.entries(source)) {
    if (fixed.has(key)) continue;
    if (key === "perHitEffects" && Array.isArray(value) && Array.isArray(target.perHitEffects)) {
      const mine = keyOf(target.perHitEffects as Effect[]);
      const theirs = keyOf(value as Effect[]);
      for (const [k, e] of mine) {
        const src = theirs.get(k);
        if (src && !(e as Marked)[FRESH]) inherit(e, src, e.kind);
      }
      continue;
    }
    if (typeof value === "number" && typeof target[key] === "number") {
      target[key] = direction(kind, key) === null ? value : roundUpNice(value, niceStep(kind, key, target));
    }
  }
}

function levelEffects(spec: SkillSpec, before: SkillReport, level: number): Effect[] {
  const beforeLevel = before.levels[level - 1];
  let effects = clone(before.levels[0].effects) as unknown as Effect[];
  for (const step of spec.structure ?? []) effects = step(effects);
  const beforeKeyed = keyOf(beforeLevel.effects as unknown as Effect[]);
  // R2: 変更前の同じ Lv から引き継ぐ(新しい効果・書き換えた欄は除く)
  keyOf(effects).forEach((effect, key) => {
    if ((effect as Marked)[FRESH]) return;
    const src = beforeKeyed.get(key);
    if (src) inherit(effect, src, effect.kind);
  });
  if (spec.levelStructure) effects = spec.levelStructure(level, effects, beforeLevel);
  return effects;
}

export function resolveSkill(spec: SkillSpec, before: SkillReport): ResolvedSkill {
  const deviations: Deviation[] = [];
  const allow = spec.allowWeaker ?? {};

  if (before.growth === "passive") {
    const passiveLevels = before.levels.map((l) => clone(l.passive) as Record<string, unknown>);
    for (const [path, series] of Object.entries(spec.values ?? {})) {
      const key = path.replace(/^passive\./, "");
      series.forEach((value, i) => {
        if (value === undefined) return;
        const prev = before.levels[i].passive as Record<string, unknown>;
        const dir = key === "internalCooldown" || key === "cooldown" ? -1 : 1;
        const was = prev[key];
        let final = value;
        if (typeof was === "number" && weaker(dir, was, value) && !allow[path]) {
          final = dir === -1 ? was : roundUpNice(was, 0.01);
          deviations.push({ skillId: spec.id, level: i + 1, path, specified: value, final, reason: "変更前の値を下回るため引き上げ" });
        }
        passiveLevels[i][key] = final;
      });
    }
    return {
      id: spec.id, target: before.levels[0].target, flags: before.levels[0].flags,
      levels: before.levels.map((l) => ({ cooldownTurns: l.cooldownTurns, effects: [] })),
      passiveLevels, deviations,
    };
  }

  const levels = before.levels.map((beforeLevel, i) => {
    const level = i + 1;
    const effects = levelEffects(spec, before, level);
    let cooldownTurns = beforeLevel.cooldownTurns;
    for (const [path, series] of Object.entries(spec.values ?? {})) {
      const value = series[i];
      if (value === undefined) continue;
      if (path === "ct") {
        if (value > beforeLevel.cooldownTurns && !allow.ct && !allow["*"]) {
          deviations.push({ skillId: spec.id, level, path, specified: value, final: beforeLevel.cooldownTurns, reason: "変更前のCTより長くなるため据え置き" });
        } else {
          cooldownTurns = value;
        }
        continue;
      }
      const at = locate(effects, path, true);
      if (!at) throw new Error(`${spec.id} Lv${level}: ${path} が見つかりません`);
      const was = locate(beforeLevel.effects as unknown as Effect[], path);
      const kind = at.effect.kind;
      const dir = direction(kind, at.key);
      let final = value;
      const prev = was ? (was.holder[was.key] as unknown) : undefined;
      if (dir !== null && typeof prev === "number" && weaker(dir, prev, value) && !allow[path] && !allow["*"]) {
        final = dir === -1 ? prev : roundUpNice(prev, niceStep(kind, at.key, at.effect));
        deviations.push({ skillId: spec.id, level, path, specified: value, final, reason: "変更前の値を下回るため引き上げ" });
      }
      at.holder[at.key] = final;
    }
    return { cooldownTurns, effects: strip(effects) as unknown as SkillEffect[] };
  });

  return {
    id: spec.id,
    target: spec.target ?? before.levels[0].target,
    flags: { ...before.levels[0].flags, ...(spec.flags ?? {}) },
    levels,
    deviations,
  };
}

/** 印を外し、ゼロの新効果(その Lv ではまだ付かない)を落とす */
function strip(effects: Effect[]): Effect[] {
  return effects
    .filter((e) => !((e as Marked)[FRESH] && isZero(e)))
    .map((e) => {
      const out = JSON.parse(JSON.stringify(e)) as Effect;
      if (Array.isArray(out.perHitEffects)) out.perHitEffects = strip(out.perHitEffects as Effect[]);
      return out;
    });
}

function isZero(effect: Effect): boolean {
  if (effect.kind === "GAUGE" || effect.kind === "MITIGATE") return effect.amount === 0;
  if ("chance" in effect && effect.chance === 0) return true;
  if ("shieldRate" in effect && effect.shieldRate === 0) return true;
  if ("healRate" in effect && effect.healRate === 0) return true;
  return false;
}

/** 種族一覧から skillId のスキルを引く */
export function findSkill(monsters: MonsterReport[], id: string): SkillReport {
  for (const m of monsters) for (const s of m.skills) if (s.skillId === id) return s;
  throw new Error(`スキルが見つかりません: ${id}`);
}
