import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { MONSTER_DEX } from "../src/data/monsters.js";
import { DamageEffect } from "../src/core/skill.js";
import { applyDefenseE, calculateBaseDamage } from "../src/battle/damageFormula.js";

export type DefenseMode = "A" | "B" | "C" | "D" | "E";
export interface DamageInput {
  atk: number;
  def: number;
  /** スキル全体の倍率（多段でもhit数を掛けない）。 */
  skillMultiplier?: number;
  /** 旧ツールとの互換名。skillMultiplierが優先される。 */
  multiplier?: number;
  critMultiplier?: number;
  /** 旧ツールとの互換名。critMultiplierが優先される。 */
  crit?: number;
  mode?: DefenseMode;
  defenseRatio?: number;
  flatRatio?: number;
  /** Eの固定軽減上限（割合軽減後ダメージに対する割合）。 */
  flatCap?: number;
  hp?: number;
  hits?: number;
  ignoreDefense?: boolean;
}

export interface DamageBreakdown {
  base: number; afterRatio: number; flatReduction: number; beforeCrit: number;
  damage: number; hpRatio: number; hits: number;
}

const clean = (value: number | undefined, fallback = 0): number =>
  Number.isFinite(value) ? Math.max(0, value as number) : fallback;

/** 比較専用の純粋関数。本番戦闘コードからは参照しない。 */
export function simulatedDamageBreakdown(input: DamageInput): DamageBreakdown {
  const atk = clean(input.atk);
  const def = clean(input.def);
  const multiplier = clean(input.skillMultiplier ?? input.multiplier);
  const crit = clean(input.critMultiplier ?? input.crit, 1);
  const hp = clean(input.hp);
  const hits = Math.max(1, Math.floor(clean(input.hits, 1)));
  const base = calculateBaseDamage(atk, multiplier);
  if (input.ignoreDefense) {
    const damage = Math.max(1, Math.round(base * crit));
    return { base, afterRatio: base, flatReduction: 0, beforeCrit: base, damage, hpRatio: hp ? damage / hp : 0, hits };
  }
  const mode = input.mode ?? "C";
  const defenseRatio = clean(input.defenseRatio, 1.5);
  const flatRatio = clean(input.flatRatio, 0.25);
  if (mode === "E" && defenseRatio === 1.5 && flatRatio === 0.25 && clean(input.flatCap, 0.25) === 0.25) {
    const result = applyDefenseE(base, atk, def);
    const damage = Math.max(1, Math.round(result.afterDefense * crit));
    return { base, afterRatio: result.afterRatio, flatReduction: result.flatReduction, beforeCrit: result.afterDefense, damage, hpRatio: hp ? damage / hp : 0, hits };
  }
  const scaledDef = mode === "A" ? def : def * defenseRatio;
  const denominator = scaledDef + Math.max(1, atk);
  const afterRatio = denominator > 0 ? base * Math.max(1, atk) / denominator : base;
  const unrestrictedFlat = def * flatRatio;
  const flatReduction = mode === "C" || mode === "D" ? unrestrictedFlat
    : mode === "E" ? Math.min(unrestrictedFlat, afterRatio * clean(input.flatCap, 0.25)) : 0;
  const raw = mode === "D"
    ? Math.max(0, afterRatio * crit - flatReduction)
    : Math.max(0, afterRatio - flatReduction) * crit;
  const damage = Math.max(1, Math.round(raw));
  return { base, afterRatio, flatReduction, beforeCrit: Math.max(0, afterRatio - flatReduction), damage, hpRatio: hp ? damage / hp : 0, hits };
}

export function simulatedDamage(input: DamageInput): number {
  return simulatedDamageBreakdown(input).damage;
}

/** 固定軽減をスキル全体に一度適用するため、同じ総倍率ならhit数に依存しない。 */
export function multiHitDamage(input: DamageInput, hits = input.hits ?? 1, flatPerHit = false): number {
  const count = Math.max(1, Math.floor(clean(hits, 1)));
  if (!flatPerHit) return simulatedDamage({ ...input, hits: count });
  const totalMultiplier = clean(input.skillMultiplier ?? input.multiplier);
  return Array.from({ length: count }, () => simulatedDamage({ ...input, skillMultiplier: totalMultiplier / count, hits: 1 }))
    .reduce((sum, damage) => sum + damage, 0);
}

export function dependentBase(atk: number, multiplier: number, stat: number, coefficient: number): number {
  return calculateBaseDamage(clean(atk), clean(multiplier), clean(stat), clean(coefficient));
}

type SkillRow = { monster: string; skill: string; effect: DamageEffect; cooldown: number; target: string };
export function auditedSkills(): { ignore: SkillRow[] } {
  const seen = new Set<string>();
  const rows: SkillRow[] = [];
  for (const monster of MONSTER_DEX) for (const skill of monster.skills) for (const effect of skill.effects) {
    if (effect.kind !== "DAMAGE") continue;
    const key = `${monster.templateId}:${skill.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ monster: monster.name.replace(/\[[^\]]+\]/, ""), skill: skill.name, effect, cooldown: skill.cooldownTurns, target: skill.target });
  }
  return { ignore: rows.filter((row) => row.effect.ignoreDefense) };
}

const table = (headers: string[], rows: (string | number)[][]): string =>
  `| ${headers.join(" | ")} |\n|${headers.map(() => "---:").join("|")}|\n${rows.map((row) => `| ${row.join(" | ")} |`).join("\n")}`;
const pct = (value: number): string => `${(value * 100).toFixed(1)}%`;
const ce = (atk: number, def: number, mult: number, crit = 1, hp = 0) => {
  const c = simulatedDamage({ atk, def, skillMultiplier: mult, critMultiplier: crit, hp, mode: "C" });
  const e = simulatedDamage({ atk, def, skillMultiplier: mult, critMultiplier: crit, hp, mode: "E" });
  return [c, e, `${((e / c - 1) * 100).toFixed(1)}%`];
};

export function buildDefenseComparisonReport(): string {
  const atks = [500, 1000, 1500, 2000, 3000, 4000, 6000, 10000];
  const defs = [500, 750, 1000, 1500, 2000, 3000, 4000, 5000, 6500];
  const multipliers = [0.5, 1, 1.5, 2, 3, 5];
  const focus = [[1000, 3000], [1000, 4000], [1000, 6500], [2000, 4000], [2000, 6500], [4000, 6500], [10000, 6500]];
  const focusRows = focus.flatMap(([atk, def]) => multipliers.map((m) => [atk, def, m, ...ce(atk, def, m)]));
  const oneRows = atks.map((atk) => {
    const c = multipliers.flatMap((m) => defs.filter((def) => simulatedDamage({ atk, def, skillMultiplier: m, mode: "C" }) === 1).map((def) => `${m}x:${def}`));
    const e = multipliers.flatMap((m) => defs.filter((def) => simulatedDamage({ atk, def, skillMultiplier: m, mode: "E" }) === 1).map((def) => `${m}x:${def}`));
    return [atk, c.length, c.join(", ") || "なし", e.length, e.join(", ") || "なし"];
  });
  const critRows = [1, 1.5, 2, 2.5, 3].flatMap((crit) => [[2000, 4000], [6000, 6500]].map(([atk, def]) => [atk, def, `${crit * 100}%`, ...ce(atk, def, 3, crit)]));
  const pointRows = [0, 50, 100].flatMap((points) => [2000, 4000].map((atk) => {
    const def = 1398 + points * 3; return [atk, points, def, ...ce(atk, def, 3)];
  }));
  const hitRows = [1, 3, 6].map((hits) => [hits, 3 / hits, ...(["C", "E"] as const).map((mode) => multiHitDamage({ atk: 2000, def: 4000, skillMultiplier: 3, mode }, hits))]);
  const ignoreRows = [3000, 4000, 6500].flatMap((def) => [
    ["ウルフ/ふいうちの牙", 1000, def, 0.9, simulatedDamage({ atk: 1000, def, skillMultiplier: 0.9, mode: "C" }), simulatedDamage({ atk: 1000, def, skillMultiplier: 0.9, mode: "E" }), simulatedDamage({ atk: 1000, def, skillMultiplier: 0.9, ignoreDefense: true })],
    ["ドラゴン/破壊の流星", 3000, def, 2, simulatedDamage({ atk: 3000, def, skillMultiplier: 2, mode: "C" }), simulatedDamage({ atk: 3000, def, skillMultiplier: 2, mode: "E" }), simulatedDamage({ atk: 3000, def, skillMultiplier: 2, ignoreDefense: true })],
  ]);
  const capRows = [0.15, 0.2, 0.25, 0.3, 0.35].map((cap) => [pct(cap), ...[[1000, 4000], [2000, 6500], [4000, 6500]].map(([atk, def]) => simulatedDamage({ atk, def, skillMultiplier: 1, mode: "E", flatCap: cap }))]);
  const ratioRows = [1.25, 1.5, 1.75, 2].map((ratio) => [ratio, ...[[1000, 4000], [2000, 6500], [4000, 6500]].flatMap(([atk, def]) => [simulatedDamage({ atk, def, skillMultiplier: 1, mode: "C", defenseRatio: ratio }), simulatedDamage({ atk, def, skillMultiplier: 1, mode: "E", defenseRatio: ratio })])]);
  const scenarios = [
    ["装備なし", 1733, 1128, 15940], ["現実的な強装備", 6057, 3942, 55710], ["理論装備（破綻検出）", 10034, 6531, 92293],
  ] as const;
  const scenarioRows = scenarios.flatMap(([label, atk, def, hp]) => [1, 3].map((m) => {
    const c = simulatedDamage({ atk, def, hp, skillMultiplier: m, mode: "C" });
    const e = simulatedDamage({ atk, def, hp, skillMultiplier: m, mode: "E" });
    return [label, atk, def, hp, m, c, pct(c / hp), Math.ceil(hp / c), e, pct(e / hp), Math.ceil(hp / e)];
  }));
  const realRows = [
    ["低ATK: ゴーレム[火]", 1065, "高DEF: ゴーレム[火]", 1398, 17210],
    ["平均ATK: スライム[火]", 1420, "平均DEF: スライム[水]", 828, 13553],
    ["高ATK: ドラゴン[闇]", 2474, "低DEF: ウルフ[火]", 645, 11294],
  ].flatMap(([attacker, atk, defender, def, hp]) => [1, 3].map((m) => {
    const [c, e, diff] = ce(atk as number, def as number, m);
    return [attacker, atk, defender, def, hp, m, c, e, diff];
  }));
  const audited = auditedSkills().ignore.map((r) => [r.monster, r.skill, r.effect.multiplier, r.effect.hits ?? 1, r.cooldown, r.target]);
  return `# 防御式C vs E 数値比較レポート

> 2026-08-27、検証専用。丸めはスキル全体の最後に1回、最低1。**本番式・能力ポイント・装備・スキルデータは未変更**。

## 式と読み方
Cは割合軽減後から \`DEF×0.25\`、Eは \`min(DEF×0.25, R×25%)\` をクリティカル前に引く。Eは常にRの75%以上を残すため、ATK>0かつ倍率>0なら原理上1への張り付きがほぼない。「E差」は \`(E/C-1)×100\` で、C=1では最低値丸めを分母にするため非常に大きくなる。

## 重点条件（非クリティカル）
${table(["ATK", "DEF", "倍率", "C", "E", "E差"], focusRows)}

## 1ダメージ領域（全432条件）
表記は \`倍率x:DEF\`。Cは ${oneRows.reduce((s, r) => s + Number(r[1]), 0)}/432、Eは ${oneRows.reduce((s, r) => s + Number(r[3]), 0)}/432 条件。

${table(["ATK", "C件数", "Cの条件", "E件数", "Eの条件"], oneRows)}

## クリティカル
${table(["ATK", "DEF", "クリ", "C", "E", "E差"], critRows)}

両方式とも固定軽減をクリ前に置くため、クリ倍率を上げてもE/C比はほぼ一定。Cの絶対軽減量もクリ倍率で拡大するので高DEFはクリティカル対策になるが、Cで0になった基礎は高クリでも1のまま。Eは残った75%がクリ倍率で伸びる。

## DEF能力ポイント（1pt=+3、ゴーレム[火] ★6 Lv60の基礎DEF1398、総倍率3.0）
${table(["攻撃ATK", "DEF pt", "最終DEF", "C", "E", "E差"], pointRows)}

## 1Hit / 3Hit / 6Hit（総倍率3.0、ATK2000 vs DEF4000）
${table(["hit", "1hit倍率", "C", "E"], hitRows)}

固定軽減をスキル全体へ1回だけ適用するモデルでは総倍率が同じなら総ダメージも同じで、多段ペナルティはない。

## 完全防御無視と実スキル
mainの監査結果は次の通り。

${table(["モンスター", "スキル", "1hit倍率", "hit", "CT", "対象"], audited)}

${table(["スキル", "仮ATK", "DEF", "総倍率", "通常C", "通常E", "完全無視"], ignoreRows)}

ドラゴンは全体2.0倍・CT5なので高DEFへの非常に強いカウンター。ウルフは単体・合計0.9倍・CT2で役割は明確だが即死級ではない。調整するなら防御式を弱めず、倍率・hit・CT・対象を個別に再査定する。

## 実モンスター代表（★6 Lv60、装備なし）
${table(["攻撃側", "ATK", "防御側", "DEF", "HP", "倍率", "C", "E", "E差"], realRows)}

低・平均・高は現行データの実在個体から代表帯を選んだ。属性・装備セット最終補正は除き、防御式だけを比較した。

## 装備、HP割合、戦闘テンポ
前回のスライム型候補（100pt極振り）を共通シナリオとして攻撃型ATK、防御型DEF、HP型最大HPを組み合わせた。

${table(["装備", "ATK", "DEF", "HP", "倍率", "C", "C/HP", "C耐久回数", "E", "E/HP", "E耐久回数"], scenarioRows)}

通常1倍だけを連打する想定では、強装備同士でも両方式とも倒すまで十数回以上となり長期化警告。3倍主力なら現実装備帯は数回規模。理論装備は破綻検出専用で調整基準にしない。

## E上限の補助比較（1.0倍）
${table(["cap", "1000/4000", "2000/6500", "4000/6500"], capRows)}

capが小さいほど固定軽減上限が小さくダメージが増える。25%は「最低75%を残す」という説明可能な中間値で、15%はDEF投資感が薄く、35%は低ATK抑制が再び強い。

## 防御係数の補助比較（各欄C/E、1.0倍）
${table(["係数", "1000/4000 C", "E", "2000/6500 C", "E", "4000/6500 C", "E"], ratioRows)}

係数を上げるとC/E双方が滑らかに低下する一方、Cだけの1固定化は残る。主因は1.5そのものではなく無上限の固定軽減である。
`;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = buildDefenseComparisonReport();
  if (process.argv.includes("--write")) writeFileSync("docs/defense-c-vs-e-report.md", report);
  process.stdout.write(report);
}
