/**
 * **最終候補を全部まとめて当てた状態**で、162個体の耐久とダメージを監査する。
 *
 *   npx tsx tools/finalBalanceAudit.ts --runs 200
 *
 * 本番データは1つも変えない。`balanceFlags` に最終候補を仮適用して測り、
 * 終わったら必ず元へ戻す。
 *
 * ## 何を比べるか
 *
 * 同じ162個体を「HP特化」と「DEF特化」の2通りで組み、
 * **実効HP(何発ぶん耐えられるか)** を4つの場面で出す。
 *
 *   通常時 / 防御低下75%後 / 防御上昇30%後 / 完全防御無視
 *
 * 実効HP = HP ÷ 1発あたりに通る割合。**HPとDEFを1つの物差しに乗せる**ための値で、
 * これを見ないと「HP型とDEF型のどちらが硬いか」は比べられない。
 */
import { balanceFlags, resetBalanceFlags, setBalanceFlags } from "../src/core/balanceFlags.js";
import { FINAL_CANDIDATE } from "./finalCandidate.js";
import { applyDefenseE } from "../src/battle/damageFormula.js";
import { MONSTER_DEX } from "../src/data/monsters.js";
import { buildAlly } from "./battleLab/build.js";
import { mulberry32 } from "./battleLab/rng.js";
import type { AllySpec, GearGrade } from "./battleLab/types.js";

const argv = process.argv.slice(2);
const arg = (name: string, fallback: string): string => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const RUNS = Number(arg("runs", "200"));
const GEAR = arg("gear", "STRONG") as GearGrade;

export { FINAL_CANDIDATE } from "./finalCandidate.js";

/** 素材3種と敵専用6種を除いた27種。これに6属性で162個体 */
const EXCLUDED = new Set([
  "reincarnation_pig", "exp_pig", "skill_pig",
  "ancient_demon", "ancient_crystal", "ancient_crystal_curse",
  "ancient_beast", "ancient_guard_beast", "ancient_fang_beast",
]);

interface DexEntry { id: string; templateId: string; element: string; name: string }
const ROSTER = (MONSTER_DEX as DexEntry[]).filter((m) => !EXCLUDED.has(m.templateId));

/** HP特化: 体力タイプ・AP100をHPへ・体力4セットの装備 */
function hpSpec(m: DexEntry): AllySpec {
  return {
    templateId: m.templateId, element: m.element as never, preset: "MAX_HEALER",
    type: "HP", abilityPoints: { hp: 100, atk: 0, def: 0, spd: 0 },
  } as AllySpec;
}
/** DEF特化: 防御タイプ・AP100をDEFへ・守護4セットの装備 */
function defSpec(m: DexEntry): AllySpec {
  return {
    templateId: m.templateId, element: m.element as never, preset: "MAX_TANK",
    type: "DEFENSE", abilityPoints: { hp: 0, atk: 0, def: 100, spd: 0 },
  } as AllySpec;
}

/** 1発あたりに通る割合。DEFに倍率を掛けてから測る(防御低下・上昇の再現) */
function through(def: number, defScale: number, attackerAtk = 10_000): number {
  const base = 100_000;
  return applyDefenseE(base, attackerAtk, def * defScale).afterDefense / base;
}

/** 同じ seed 群で何度も組み、HPとDEFの平均を取る(装備の引きを均す) */
function averageStats(spec: AllySpec, runs: number): { hp: number; def: number; spd: number } {
  let hp = 0, def = 0, spd = 0;
  for (let i = 0; i < runs; i += 1) {
    const ally = buildAlly(spec as never, mulberry32(20260913 + i * 7919), GEAR);
    hp += ally.stats.hp; def += ally.stats.def; spd += ally.stats.spd;
  }
  return { hp: hp / runs, def: def / runs, spd: spd / runs };
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function distribution(label: string, values: number[]): void {
  const s = [...values].sort((a, b) => a - b);
  console.log(
    `  ${label.padEnd(26)} min ${s[0].toFixed(1).padStart(6)}  p10 ${quantile(s, 0.10).toFixed(1).padStart(6)}  ` +
    `p25 ${quantile(s, 0.25).toFixed(1).padStart(6)}  中央 ${quantile(s, 0.50).toFixed(1).padStart(6)}  ` +
    `p75 ${quantile(s, 0.75).toFixed(1).padStart(6)}  p90 ${quantile(s, 0.90).toFixed(1).padStart(6)}  max ${s[s.length - 1].toFixed(1).padStart(6)}`,
  );
}

// ───────────────── 162個体を2通りで組む ─────────────────

console.log(`最終候補の総合監査 / 装備${GEAR} / 各${RUNS}生成・同seed`);
console.log(`対象: ${ROSTER.length}個体 (素材3種・敵専用6種を除いた27種 × 6属性)\n`);

setBalanceFlags(FINAL_CANDIDATE);
console.log(`仮適用したフラグ: ${JSON.stringify(balanceFlags)}\n`);

const built = ROSTER.map((m) => ({
  name: m.name,
  hp: averageStats(hpSpec(m), RUNS),
  def: averageStats(defSpec(m), RUNS),
}));

// ── 12. 通常時EHP: DEF特化=100 としたときのHP特化点 ──
console.log("■ 12. 通常時の実効HP (DEF特化 = 100 としたときのHP特化)");
const normalScores = built.map((b) => {
  const hpEhp = b.hp.hp / through(b.hp.def, 1);
  const defEhp = b.def.hp / through(b.def.def, 1);
  return (hpEhp / defEhp) * 100;
});
distribution("HP特化点", normalScores);
console.log(`  → 中央値 ${quantile([...normalScores].sort((a, b) => a - b), 0.5).toFixed(1)} (目安 85〜90)\n`);

// ── 13. 防御低下75%後: HP特化=100 としたときのDEF特化点 ──
console.log("■ 13. 防御低下75%後の実効HP (HP特化 = 100 としたときのDEF特化)");
const downScores = built.map((b) => {
  const hpEhp = b.hp.hp / through(b.hp.def, 0.25);
  const defEhp = b.def.hp / through(b.def.def, 0.25);
  return (defEhp / hpEhp) * 100;
});
distribution("DEF特化点", downScores);
const inBand = downScores.filter((v) => v >= 70 && v <= 85).length;
console.log(`  → 中央値 ${quantile([...downScores].sort((a, b) => a - b), 0.5).toFixed(1)} (目標 75〜80)`);
console.log(`  → 70〜85に入る個体: ${inBand} / ${downScores.length}\n`);

// ── 14. 防御上昇30%後: DEF特化 / HP特化 ──
console.log("■ 14. 防御上昇30%後の DEF特化 ÷ HP特化");
const upRatios = built.map((b) => {
  const hpEhp = b.hp.hp / through(b.hp.def, 1.3);
  const defEhp = b.def.hp / through(b.def.def, 1.3);
  return defEhp / hpEhp;
});
distribution("倍率", upRatios);
for (const t of [1.2, 1.3, 1.4]) {
  console.log(`  ${t}倍以上: ${upRatios.filter((v) => v >= t).length} / ${upRatios.length}個体`);
}
console.log(`  最大: ${Math.max(...upRatios).toFixed(3)}倍\n`);

// ── 15. 完全防御無視(DEF=0): HP特化 / DEF特化 ──
console.log("■ 15. 完全防御無視 (DEF=0) の HP特化 ÷ DEF特化");
console.log("   防御を無視されると軽減が消えるので、実効HPは素のHPそのものになる");
const ignoreRatios = built.map((b) => b.hp.hp / b.def.hp);
distribution("倍率", ignoreRatios);
console.log(`  → 中央値 ${quantile([...ignoreRatios].sort((a, b) => a - b), 0.5).toFixed(2)}倍\n`);

// ── 参考: 素のHPとDEFの中央値 ──
const hpHps = built.map((b) => b.hp.hp).sort((a, b) => a - b);
const defHps = built.map((b) => b.def.hp).sort((a, b) => a - b);
const defDefs = built.map((b) => b.def.def).sort((a, b) => a - b);
const hpDefs = built.map((b) => b.hp.def).sort((a, b) => a - b);
console.log("■ 参考: 素のステータス(中央値)");
console.log(`  HP特化   HP ${Math.round(quantile(hpHps, 0.5)).toLocaleString()}  DEF ${Math.round(quantile(hpDefs, 0.5)).toLocaleString()}`);
console.log(`  DEF特化  HP ${Math.round(quantile(defHps, 0.5)).toLocaleString()}  DEF ${Math.round(quantile(defDefs, 0.5)).toLocaleString()}`);


// ───────────────── 16-18. 攻撃型の火力と、実際の被ダメージ ─────────────────

/** 図鑑から1体引く。属性違いは同じ templateId で並んでいる */
function dexOf(templateId: string, element: string): DexEntry {
  const found = (MONSTER_DEX as DexEntry[]).find((m) => m.templateId === templateId && m.element === element);
  if (!found) throw new Error(`図鑑にない: ${templateId} ${element}`);
  return found;
}

function attackerSpec(templateId: string, element: string): AllySpec {
  return { templateId, element, preset: "MAX_ATTACKER" } as AllySpec;
}

console.log("\n■ 16. 攻撃型の代表(ATTACKタイプは変更していない)");
console.log("  モンスター            HP        ATK      DEF     SPD   クリ率  クリダメ");
const ATTACKERS: [string, string, string][] = [
  ["火ドラゴン", "dragon", "FIRE"],
  ["グリフォン", "griffon", "GRASS"],
  ["ネメシス", "nemesis", "ELECTRIC"],
  ["フェンリル", "fenrir", "DARK"],
  ["ハーピー", "harpy", "WATER"],
];
const attackerStats = new Map<string, ReturnType<typeof buildAlly>["stats"]>();
for (const [label, templateId, element] of ATTACKERS) {
  const rng = mulberry32(20260913);
  const ally = buildAlly(attackerSpec(templateId, element) as never, rng, GEAR);
  attackerStats.set(label, ally.stats);
  console.log(
    `  ${label.padEnd(18)} ${ally.stats.hp.toLocaleString().padStart(7)} ${ally.stats.atk.toLocaleString().padStart(8)} ` +
    `${ally.stats.def.toLocaleString().padStart(7)} ${String(ally.stats.spd).padStart(6)} ` +
    `${`${(ally.stats.criRate * 100).toFixed(0)}%`.padStart(6)} ${`${(ally.stats.criDmg * 100).toFixed(0)}%`.padStart(8)}`,
  );
}

/** スキル倍率ごとの、防御を通す前のダメージ */
const SKILL_MULTIPLIERS: [string, number][] = [["S1相当 1.2倍", 1.2], ["S2相当 2.4倍", 2.4], ["S3相当 3.6倍", 3.6]];
const dragon = attackerStats.get("火ドラゴン")!;

console.log("\n  火ドラゴンの素のダメージ(防御を通す前)");
for (const [label, mult] of SKILL_MULTIPLIERS) {
  const normal = dragon.atk * mult;
  console.log(`    ${label.padEnd(14)} 通常 ${Math.round(normal).toLocaleString().padStart(8)}  クリ ${Math.round(normal * dragon.criDmg).toLocaleString().padStart(8)}`);
}

/** 火ドラゴンから相手へ当てたときの、防御を通した後のダメージと耐発数 */
function hits(targetHp: number, targetDef: number, mult: number, defScale: number, crit: boolean): { dmg: number; count: number } {
  const raw = dragon.atk * mult * (crit ? dragon.criDmg : 1);
  const dmg = applyDefenseE(raw, dragon.atk, targetDef * defScale).afterDefense;
  return { dmg, count: dmg > 0 ? targetHp / dmg : Infinity };
}

setBalanceFlags(FINAL_CANDIDATE);
const medianHpSpec = { hp: quantile(hpHps, 0.5), def: quantile(hpDefs, 0.5) };
const medianDefSpec = { hp: quantile(defHps, 0.5), def: quantile(defDefs, 0.5) };

for (const [who, target] of [["17. HP特化へ", medianHpSpec], ["18. DEF特化へ", medianDefSpec]] as [string, { hp: number; def: number }][]) {
  console.log(`\n■ ${who} 火ドラゴンで攻撃 (中央値の個体・HP ${Math.round(target.hp).toLocaleString()} / DEF ${Math.round(target.def).toLocaleString()})`);
  console.log("    スキル          通常時ダメージ  耐発数    防御低下75%時   耐発数");
  for (const [label, mult] of SKILL_MULTIPLIERS) {
    const n = hits(target.hp, target.def, mult, 1, false);
    const d = hits(target.hp, target.def, mult, 0.25, false);
    console.log(
      `    ${label.padEnd(14)} ${Math.round(n.dmg).toLocaleString().padStart(12)} ${n.count.toFixed(1).padStart(8)} ` +
      `${Math.round(d.dmg).toLocaleString().padStart(14)} ${d.count.toFixed(1).padStart(8)}`,
    );
  }
}

// ───────────────── 28. PvP簡易: 撃破までの手数 ─────────────────

console.log("\n■ 28. PvP簡易 — 火ドラゴン(ATK特化)が相手を落とすのに要る攻撃回数");
console.log("    相手          通常時 S1 / S2 / S3        防御低下75%時 S1 / S2 / S3");
for (const [label, target] of [["HP特化", medianHpSpec], ["DEF特化", medianDefSpec]] as [string, { hp: number; def: number }][]) {
  const cells = [1, 0.25].map((scale) =>
    SKILL_MULTIPLIERS.map(([, m]) => Math.ceil(hits(target.hp, target.def, m, scale, false).count)).join(" / "));
  console.log(`    ${label.padEnd(12)} ${cells[0].padStart(16)}        ${cells[1].padStart(18)}`);
}
console.log("\n    ※ DEF特化が「通常時はHP特化より硬く、防御低下75%後はHP特化より柔らかい」かを見る");

resetBalanceFlags();
console.log(`\n終了時のフラグ: ${JSON.stringify(balanceFlags)}`);
