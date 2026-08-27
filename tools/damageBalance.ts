import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { MONSTER_DEX } from "../src/data/monsters.js";
import { DamageEffect, SCALE_REFERENCE } from "../src/core/skill.js";

export type DefenseMode = "A" | "B" | "C" | "D";
export interface DamageInput {
  atk: number; def: number; multiplier: number; crit?: number; mode?: DefenseMode;
  defenseRatio?: number; flatRatio?: number; ignoreDefense?: boolean;
}

/** 比較専用の純粋関数。本番戦闘コードからは参照しない。 */
export function simulatedDamage(input: DamageInput): number {
  const atk = finiteNonNegative(input.atk);
  const def = finiteNonNegative(input.def);
  const base = atk * finiteNonNegative(input.multiplier);
  const crit = finiteNonNegative(input.crit ?? 1);
  if (input.ignoreDefense) return Math.max(1, Math.round(base * crit));
  const mode = input.mode ?? "A";
  const defenseRatio = finiteNonNegative(input.defenseRatio ?? 1.5);
  const flat = def * finiteNonNegative(input.flatRatio ?? 0.25);
  const scaledDef = mode === "A" ? def : def * defenseRatio;
  const afterRatio = base * (1 - (scaledDef <= 0 ? 0 : scaledDef / (scaledDef + Math.max(1, atk))));
  const raw = mode === "C" ? Math.max(0, afterRatio - flat) * crit
    : mode === "D" ? Math.max(0, afterRatio * crit - flat)
      : afterRatio * crit;
  return Math.max(1, Math.round(raw));
}

export function dependentBase(atk: number, multiplier: number, stat: number, coefficient: number): number {
  return finiteNonNegative(atk) * finiteNonNegative(multiplier) + finiteNonNegative(stat) * finiteNonNegative(coefficient);
}

export function currentDependentBase(atk: number, effect: DamageEffect, stat: number): number {
  const bonus = effect.scaleBonus
    ? effect.scaleBonus.bonusAtReference * finiteNonNegative(stat) / SCALE_REFERENCE[effect.scaleBonus.stat]
    : 0;
  return finiteNonNegative(atk) * (finiteNonNegative(effect.multiplier) + bonus);
}

export function multiHitDamage(input: DamageInput, hits: number, flatPerHit: boolean): number {
  const count = Math.max(1, Math.floor(hits));
  if (flatPerHit || input.mode !== "C") {
    return Array.from({ length: count }, () => simulatedDamage({ ...input, multiplier: input.multiplier / count })).reduce((a, b) => a + b, 0);
  }
  // 割合軽減は各hit（合計は同値）、固定軽減だけスキル全体へ一度。
  const ratioOnly = simulatedDamage({ ...input, mode: "B", multiplier: input.multiplier / count, crit: 1 }) * count;
  const raw = Math.max(0, ratioOnly - finiteNonNegative(input.def) * finiteNonNegative(input.flatRatio ?? 0.25));
  return Math.max(1, Math.round(raw * finiteNonNegative(input.crit ?? 1)));
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

type SkillRow = { monster: string; skill: string; effect: DamageEffect };
export function auditedSkills(): { hp: SkillRow[]; def: SkillRow[]; ignore: SkillRow[] } {
  const seen = new Set<string>();
  const rows: SkillRow[] = [];
  for (const monster of MONSTER_DEX) for (const skill of monster.skills) for (const effect of skill.effects) {
    if (effect.kind !== "DAMAGE") continue;
    const key = `${monster.templateId}:${skill.id}`;
    if (seen.has(key)) continue;
    seen.add(key); rows.push({ monster: monster.name.replace(/\[[^\]]+\]/, ""), skill: skill.name, effect });
  }
  return {
    hp: rows.filter((r) => r.effect.scaleBonus?.stat === "hp"),
    def: rows.filter((r) => r.effect.scaleBonus?.stat === "def"),
    ignore: rows.filter((r) => r.effect.ignoreDefense),
  };
}

const table = (headers: string[], rows: (string | number)[][]) =>
  `| ${headers.join(" | ")} |\n|${headers.map(() => "---:").join("|")}|\n${rows.map((r) => `| ${r.join(" | ")} |`).join("\n")}`;

function skillTable(rows: SkillRow[]): string {
  return table(["モンスター", "スキル", "倍率", "hit", "現行補正"], rows.map(({ monster, skill, effect }) => [monster, skill, effect.multiplier, effect.hits ?? 1, effect.scaleBonus ? `${effect.scaleBonus.stat}基準+${effect.scaleBonus.bonusAtReference}` : "防御無視"]));
}

export function buildDamageReport(): string {
  const skills = auditedSkills();
  const atkValues = [1000, 2000, 3000, 6000, 10000], defs = [500, 750, 1000, 1500, 2000, 3000, 4000, 6500];
  const threeRows = atkValues.flatMap((atk) => defs.map((def) => [atk, def, ...(["A", "B", "C", "D"] as const).map((mode) => simulatedDamage({ atk, def, multiplier: 3, mode }))]));
  const hpCoefficients = [0.03, 0.05, 0.08, 0.10, 0.15], defCoefficients = [0.5, 1, 1.5, 2, 3];
  const depRows = (rows: SkillRow[], stat: number, coeffs: number[]) => rows.map(({ monster, skill, effect }) => [monster, skill, Math.round(currentDependentBase(2000, effect, stat)), ...coeffs.map((c) => Math.round(dependentBase(2000, effect.multiplier, stat, c)))]);
  const critRows = [1, 1.5, 2, 2.5, 3].flatMap((crit) => [1000, 3000, 6500].map((def) => [crit, def, ...(["A", "B", "C", "D"] as const).map((mode) => simulatedDamage({ atk: 6000, def, multiplier: 3, crit, mode }))]));
  const pointRows = [2, 3, 4].flatMap((perPoint) => [0, 50, 100].map((points) => { const def = 1000 + perPoint * points; return [perPoint, points, def, ...(["A", "B", "C", "D"] as const).map((mode) => simulatedDamage({ atk: 3000, def, multiplier: 3, mode }))]; }));
  const hitRows = [1, 3, 6].map((hits) => [hits, multiHitDamage({ atk: 3000, def: 2000, multiplier: 3, mode: "C" }, hits, true), multiHitDamage({ atk: 3000, def: 2000, multiplier: 3, mode: "C" }, hits, false)]);
  const ignoreRows = [1000, 2000, 4000, 6500].map((def) => [def, simulatedDamage({ atk: 3000, def, multiplier: 1, mode: "C" }), simulatedDamage({ atk: 3000, def, multiplier: 3, mode: "C" }), simulatedDamage({ atk: 3000, def, multiplier: 3, crit: 2, mode: "C" }), simulatedDamage({ atk: 3000, def, multiplier: 3, mode: "C", ignoreDefense: true })]);
  return `# ダメージバランス再計算レポート

> 2026-08-27時点。これは比較シミュレーションであり、方式B/C/Dおよび新依存係数は未採用。

## 現行コードの式と処理順

実効ATKを \(P\)、実効DEFを \(Q\)、倍率を \(M\)、依存能力を \(S\)、基準値を \(R\)、基準時加算倍率を \(b\) とする。

1. 現行依存加算倍率 \(x=bS/R\)（HP: R=30000、DEF: R=3500）。
2. 基礎値 \(B=P(M+x)\)。したがって現行HP/DEF依存は独立加算ではなく、依存能力でATK倍率を増幅する。
3. 防御軽減率 \(q=Q/(Q+max(1,P))\)。防御無視なら q=0。防御後 \(B(1-q)\)。
4. 属性倍率、クリティカル倍率、装備の与ダメ倍率、装備の被ダメ倍率を順に乗算。
5. Math.round後、最低1ダメージ。多段は各hitでこの全処理（クリティカル抽選を含む）を独立実行。

よって1hitの最終値は \`max(1, round(P×(M+bS/R)×(1-q)×属性×クリ倍率×与ダメ補正×被ダメ補正))\`。

## 対象スキル監査

### HP依存（${skills.hp.length}件）
${skillTable(skills.hp)}

### DEF依存（${skills.def.length}件）
${skillTable(skills.def)}

### 完全防御無視（${skills.ignore.length}件）
${skillTable(skills.ignore)}

## 方式A/B/C/D・総倍率3.0（非クリティカル）

A=現行、B=DEF×1.5割合のみ、C=同割合+DEF×0.25をクリ前、D=同割合+DEF×0.25をクリ後。CとDは非クリ時に一致する。

${table(["ATK", "DEF", "A", "B", "C", "D"], threeRows)}

## クリティカル比較（ATK6000、総倍率3.0）
${table(["クリ倍率", "DEF", "A", "B", "C", "D"], critRows)}

Cは固定値もクリ倍率で増幅して差し引くため、高クリ時にDより低くなる。高DEFへのクリティカル対抗という目的にはCが整合する。現行実データの基礎クリダメはモンスター定義値と装備・バフの実効値であり、戦闘では上限クランプせずその値を使用する。

## HP依存係数（ATK2000、最大HP30000、軽減前）
${table(["モンスター", "スキル", "現行", ...hpCoefficients.map(String)], depRows(skills.hp, 30000, hpCoefficients))}

HP 10000/15000/20000/30000/50000/90000はツール関数のstat引数で再計算できる。H=0.03〜0.05は耐久と火力の両立を抑え、0.10以上は理論HP装備で+9000以上となるため危険域。

## DEF依存係数（ATK2000、DEF3500、軽減前）
${table(["モンスター", "スキル", "現行", ...defCoefficients.map(String)], depRows(skills.def, 3500, defCoefficients))}

D=0.5〜1.0を起点とし、2.0以上は高DEFと火力を同時に得る。理論DEF6500ならD=3で+19500となりATK型を容易に超える。

## DEF能力ポイント（基礎DEF1000、ATK3000・3倍被弾）
${table(["DEF/pt", "pt", "最終DEF", "A", "B", "C", "D"], pointRows)}

## 単発・多段（ATK3000、DEF2000、総倍率3.0、方式C）
${table(["hit", "固定軽減を各hit", "スキル全体に1回"], hitRows)}

各hit適用は6hitで固定軽減を6回受ける。固定軽減はスキル全体に一度を推奨する。ただし現行エンジンはhit単位で完結するため、採用時はスキル解決側の集約設計が必要。

## 防御無視（ATK3000）
${table(["DEF", "通常1倍C", "通常3倍C", "クリ2倍3倍C", "防御無視3倍"], ignoreRows)}

完全防御無視が割合・固定の双方を無視するとDEF6500でも9000。強化後は相対価値が急増するため倍率、対象範囲、CTを個別再査定すべき。

## 実ステータス帯と構成評価

- 網羅グリッド: ATK 1000/1500/2000/3000/4000/6000/10000、DEF 500/750/1000/1500/2000/3000/4000/6500、HP 10000/15000/20000/30000/50000/90000を入力可能にし、代表3倍表は可読性のためATK5点×DEF8点を掲載した。
- 前調査の★6 Lv60実測では初期★3/4/5で役割構成が違う。平均ATK差2.29倍を純レア差と断定せず、実在候補と装備なし・強装備・理論装備は stat-balance-report の値を併読する。
- 攻撃型: 最高火力。防御強化の影響を受ける。体力型: H=0.03〜0.05なら高HPと補助火力。防御型: D=0.5〜1.0なら通常耐久と補助火力。両耐久型ともATK型最大火力と同等にしない。
- 理論装備値（ATK10034/HP92293/DEF6531）は有限だが、H=0.15でHP項13844、D=3でDEF項19593となり破綻圧力が明白。本番基準にはしない。

## 結論（提案、未確定）

方式C（DEF×1.5割合+DEF×0.25固定、固定はクリ前かつスキル全体1回）を第一検証候補とする。HP係数0.03〜0.05、DEF係数0.5〜1.0からスキル別に調整する。長所は高DEFのクリ耐性と役割分離。短所は低倍率技・多段への最低1丸めの影響、防御無視の急激な価値上昇、ATK0付近で割合式がほぼ全軽減になる点。代替Eとして固定軽減に \`min(DEF×0.25, 割合軽減後ダメージ×0.25)\` の上限を置けば低倍率技の1固定化を緩和できるが、採用しない。
`;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = buildDamageReport();
  if (process.argv.includes("--write")) writeFileSync("docs/damage-balance-report.md", report);
  process.stdout.write(report);
}
