/**
 * 新防御式1.2で、プレイヤーが所有可能な全モンスターのHP/DEFを変更せず使えるか監査する。
 * 本番データは一切変更せず、BattleLabが各試行用に作った個体と純粋な防御計算だけを使う。
 *
 *   node --import tsx tools/playerDefenseAudit.ts --runs 200
 */
import { setBalanceFlags } from "../src/battle/balanceFlags.js";
import { applyDefenseE, calculateBaseDamage, roundNormalDamage } from "../src/battle/damageFormula.js";
import type { MonsterDefinition } from "../src/core/monster.js";
import type { Element } from "../src/core/element.js";
import { ELEMENT_JA } from "../src/core/element.js";
import type { StatType } from "../src/core/equipment.js";
import {
  ALL_DISPLAYABLE_MONSTERS_DEX,
  GACHA_STAR3_TEMPLATES,
  GACHA_STAR4_TEMPLATES,
  GACHA_STAR5_TEMPLATES,
} from "../src/data/monsters.js";
import { buildAlly } from "./battleLab/build.js";
import { mulberry32 } from "./battleLab/rng.js";
import type { AllySpec, GearSpec, PresetName } from "./battleLab/types.js";

const argv = process.argv.slice(2);
const arg = (name: string, fallback: string): string => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const RUNS = Number(arg("runs", "200"));
const SEED = Number(arg("seed", "20260913"));
const COMPACT_ONLY = argv.includes("--compact-only");
setBalanceFlags({ defenseFormula: "sw", unifyDefModifiers: true, swRatio: 1.2 });

type AuditRole = "攻撃型" | "体力型" | "防御型" | "補助型" | "妨害型" | "バランス型";
interface AuditEntry {
  dex: MonsterDefinition;
  name: string;
  rarity: 3 | 4 | 5;
  role: AuditRole;
  base: MonsterDefinition;
  strong: MonsterDefinition;
}

const templateSets = {
  3: new Set(GACHA_STAR3_TEMPLATES.map((entry) => entry.templateId)),
  4: new Set(GACHA_STAR4_TEMPLATES.map((entry) => entry.templateId)),
  5: new Set(GACHA_STAR5_TEMPLATES.map((entry) => entry.templateId)),
};

function rarityOf(templateId: string): 3 | 4 | 5 {
  if (templateSets[5].has(templateId)) return 5;
  if (templateSets[4].has(templateId)) return 4;
  if (templateSets[3].has(templateId)) return 3;
  throw new Error(`初期レアリティを解決できないテンプレート: ${templateId}`);
}

function auditRoleOf(role: string): AuditRole {
  if (role === "アタッカー") return "攻撃型";
  if (role === "タンク") return "体力型";
  if (role === "ディフェンダー") return "防御型";
  if (role === "ヒーラー" || role === "サポート") return "補助型";
  if (role === "デバッファー") return "妨害型";
  return "バランス型";
}

function presetOf(dex: MonsterDefinition): PresetName {
  if (dex.role === "アタッカー") return "MAX_ATTACKER";
  if (dex.role === "ディフェンダー" || dex.role === "タンク") return "MAX_TANK";
  if (dex.role === "ヒーラー") return "MAX_HEALER";
  if (dex.role === "サポート") return "MAX_SUPPORT";
  if (dex.role === "デバッファー") return "MAX_DEBUFFER";
  // ナイトは実戦で攻撃枠、ヴァルキリアは支援枠として既に使っている。
  return dex.templateId === "valkyria" ? "MAX_SUPPORT" : "MAX_ATTACKER";
}

function specOf(dex: MonsterDefinition, preset?: PresetName): AllySpec {
  return { templateId: dex.templateId, element: dex.element, ...(preset ? { preset } : {}) };
}

function meanBuild(spec: AllySpec): MonsterDefinition {
  const defs = Array.from({ length: RUNS }, (_, i) => buildAlly(spec, mulberry32(SEED + i), "STRONG"));
  const first = defs[0];
  const keys = ["hp", "atk", "def", "spd", "criRate", "criDmg", "accuracy", "resistance"] as const;
  const stats = { ...first.stats };
  for (const key of keys) stats[key] = defs.reduce((sum, def) => sum + def.stats[key], 0) / RUNS;
  return { ...first, stats };
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const index = (sorted.length - 1) * p;
  const low = Math.floor(index), high = Math.ceil(index);
  if (low === high) return sorted[low];
  return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}

function median(values: number[]): number { return percentile(values, 0.5); }
function n(value: number): string { return Math.round(value).toLocaleString("en-US"); }
function p(value: number): string { return `${Math.round(value * 100)}%`; }
function title(text: string): void { console.log(`\n## ${text}\n`); }

const entries: AuditEntry[] = ALL_DISPLAYABLE_MONSTERS_DEX.map((dex) => ({
  dex,
  name: dex.name.replace(/\[[^\]]+\]$/, ""),
  rarity: rarityOf(dex.templateId),
  role: auditRoleOf(dex.role),
  base: buildAlly(specOf(dex), mulberry32(SEED)),
  strong: meanBuild(specOf(dex, presetOf(dex))),
}));

if (COMPACT_ONLY) {
  const templates = [...new Set(entries.map((entry) => entry.dex.templateId))];
  console.log("| モンスター | ★ | 役割 | 火 | 草 | 電気 | 水 | 光 | 闇 |");
  console.log("|---|---:|---|---|---|---|---|---|---|");
  for (const templateId of templates) {
    const rows = entries.filter((entry) => entry.dex.templateId === templateId);
    const first = rows[0];
    const cell = (element: Element): string => {
      const row = rows.find((entry) => entry.dex.element === element)!;
      const s = row.base.stats;
      return `${n(s.hp)}/${n(s.atk)}/${n(s.def)}/${n(s.spd)}`;
    };
    console.log(`| ${first.name} | ${first.rarity} | ${first.role} | ${cell("FIRE")} | ${cell("GRASS")} | ${cell("ELECTRIC")} | ${cell("WATER")} | ${cell("LIGHT")} | ${cell("DARK")} |`);
  }
  console.log("\nSTRONGは `HP/ATK/DEF/SPD/CR/CD`。\n");
  console.log("| モンスター | 火 | 草 | 電気 | 水 | 光 | 闇 |");
  console.log("|---|---|---|---|---|---|---|");
  for (const templateId of templates) {
    const rows = entries.filter((entry) => entry.dex.templateId === templateId);
    const first = rows[0];
    const cell = (element: Element): string => {
      const row = rows.find((entry) => entry.dex.element === element)!;
      const s = row.strong.stats;
      return `${n(s.hp)}/${n(s.atk)}/${n(s.def)}/${n(s.spd)}/${p(s.criRate)}/${p(s.criDmg)}`;
    };
    console.log(`| ${first.name} | ${cell("FIRE")} | ${cell("GRASS")} | ${cell("ELECTRIC")} | ${cell("WATER")} | ${cell("LIGHT")} | ${cell("DARK")} |`);
  }
  setBalanceFlags({ defenseFormula: "legacy", unifyDefModifiers: false, swRatio: 1.2 });
  process.exit(0);
}

function distribution(label: string, values: number[]): void {
  console.log(`| ${label} | ${n(percentile(values, 0))} | ${n(percentile(values, 0.25))} | ${n(percentile(values, 0.5))} | ${n(percentile(values, 0.75))} | ${n(percentile(values, 1))} |`);
}

title(`全${entries.length}属性個体の★6 Lv60基礎値とSTRONG平均（${RUNS} seed）`);
console.log("| モンスター | 属性 | 初期★ | 役割 | 基礎HP | 基礎ATK | 基礎DEF | 基礎SPD | STRONG HP | ATK | DEF | SPD | CR | CD |");
console.log("|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
for (const entry of entries) {
  const b = entry.base.stats, s = entry.strong.stats;
  console.log(`| ${entry.name} | ${ELEMENT_JA[entry.dex.element]} | ${entry.rarity} | ${entry.role} | ${n(b.hp)} | ${n(b.atk)} | ${n(b.def)} | ${n(b.spd)} | ${n(s.hp)} | ${n(s.atk)} | ${n(s.def)} | ${n(s.spd)} | ${p(s.criRate)} | ${p(s.criDmg)} |`);
}

title("HP・DEF分布");
console.log("| 状態・能力 | 最低 | 25%点 | 中央値 | 75%点 | 最大 |");
console.log("|---|---:|---:|---:|---:|---:|");
distribution("基礎HP", entries.map((entry) => entry.base.stats.hp));
distribution("基礎DEF", entries.map((entry) => entry.base.stats.def));
distribution("STRONG HP", entries.map((entry) => entry.strong.stats.hp));
distribution("STRONG DEF", entries.map((entry) => entry.strong.stats.def));

title("役割別の基礎DEF");
console.log("| 役割 | 個体数 | 平均DEF | 中央DEF |");
console.log("|---|---:|---:|---:|");
for (const role of ["攻撃型", "体力型", "防御型", "補助型", "妨害型", "バランス型"] as const) {
  const values = entries.filter((entry) => entry.role === role).map((entry) => entry.base.stats.def);
  console.log(`| ${role} | ${values.length} | ${n(values.reduce((a, b) => a + b, 0) / values.length)} | ${n(median(values))} |`);
}

function printRanking(label: string, rows: AuditEntry[]): void {
  title(label);
  console.log("| 順位 | モンスター | 属性 | 役割 | 基礎HP | 基礎DEF | STRONG HP | STRONG DEF |");
  console.log("|---:|---|---|---|---:|---:|---:|---:|");
  rows.forEach((entry, index) => console.log(`| ${index + 1} | ${entry.name} | ${ELEMENT_JA[entry.dex.element]} | ${entry.role} | ${n(entry.base.stats.hp)} | ${n(entry.base.stats.def)} | ${n(entry.strong.stats.hp)} | ${n(entry.strong.stats.def)} |`));
}
const byDef = [...entries].sort((a, b) => a.base.stats.def - b.base.stats.def);
printRanking("基礎DEF下位10", byDef.slice(0, 10));
printRanking("基礎DEF上位10", byDef.slice(-10).reverse());

function specializationGear(stat: "HP" | "DEF"): GearSpec[] {
  const percent = `${stat}_PERCENT` as StatType;
  const flat = `${stat}_FLAT` as StatType;
  const otherPercent: StatType = stat === "HP" ? "DEF_PERCENT" : "HP_PERCENT";
  const otherFlat: StatType = stat === "HP" ? "DEF_FLAT" : "HP_FLAT";
  const slots: GearSpec["slot"][] = [1, 2, 3, 4, 5, 6];
  return slots.map((slot) => {
    const main: StatType = slot === 1 ? "ATK_FLAT" : slot === 3 ? "DEF_FLAT" : slot === 5 ? "HP_FLAT" : percent;
    const ordered = [percent, flat, otherPercent, otherFlat, "RESISTANCE", "SPD", "ATK_PERCENT"] as StatType[];
    return {
      slot,
      set: slot <= 4 ? "VITALITY" : "GUARD",
      main,
      subs: ordered.filter((value) => value !== main).slice(0, 4),
    };
  });
}

const specializationCache = new Map<string, MonsterDefinition>();
function specialized(dex: MonsterDefinition, stat: "HP" | "DEF"): MonsterDefinition {
  const key = `${dex.id}:${stat}`;
  const cached = specializationCache.get(key);
  if (cached) return cached;
  const built = meanBuild({
    templateId: dex.templateId,
    element: dex.element,
    type: stat === "HP" ? "HP" : "DEFENSE",
    abilityPoints: stat === "HP" ? { hp: 100 } : { def: 100 },
    gear: specializationGear(stat),
    latentIndex: null,
  });
  specializationCache.set(key, built);
  return built;
}

function ehp(hp: number, def: number): number { return hp * (1000 + 1.2 * Math.max(0, def)) / 1000; }
function damage(
  atk: number,
  criDmg: number,
  def: number,
  multiplier: number,
  critical: boolean,
  damageTakenMultiplier = 1,
): number {
  const base = calculateBaseDamage(atk, multiplier) * (critical ? criDmg : 1);
  return roundNormalDamage(applyDefenseE(base, atk, def).afterDefense * damageTakenMultiplier);
}
function shots(hp: number, hit: number): number { return Math.max(1, Math.ceil(hp / Math.max(1, hit))); }

const baseHpMedian = median(entries.map((entry) => entry.base.stats.hp));
const baseDefMedian = median(entries.map((entry) => entry.base.stats.def));
const nearest = (key: "hp" | "def", target: number): AuditEntry => [...entries].sort((a, b) => Math.abs(a.base.stats[key] - target) - Math.abs(b.base.stats[key] - target))[0];
const roleRepresentative = (role: AuditRole): AuditEntry => {
  const group = entries.filter((entry) => entry.role === role);
  const target = median(group.map((entry) => entry.base.stats.def));
  return [...group].sort((a, b) => Math.abs(a.base.stats.def - target) - Math.abs(b.base.stats.def - target))[0];
};
const lowHpHighDef = [...entries].sort((a, b) => (b.base.stats.def / b.base.stats.hp) - (a.base.stats.def / a.base.stats.hp))[0];
const highHpLowDef = [...entries].sort((a, b) => (b.base.stats.hp / b.base.stats.def) - (a.base.stats.hp / a.base.stats.def))[0];
const picked = new Map<string, { entry: AuditEntry; reasons: string[] }>();
function pick(entry: AuditEntry, reason: string): void {
  const current = picked.get(entry.dex.id);
  if (current) current.reasons.push(reason); else picked.set(entry.dex.id, { entry, reasons: [reason] });
}
pick([...entries].sort((a, b) => b.base.stats.hp - a.base.stats.hp)[0], "基礎HP最大");
pick([...entries].sort((a, b) => b.base.stats.def - a.base.stats.def)[0], "基礎DEF最大");
pick(nearest("hp", baseHpMedian), "HP中央値付近");
pick(nearest("def", baseDefMedian), "DEF中央値付近");
pick(lowHpHighDef, "低HP・高DEF");
pick(highHpLowDef, "高HP・低DEF");
for (const role of ["攻撃型", "体力型", "防御型", "補助型", "妨害型"] as const) pick(roleRepresentative(role), `${role}代表`);
for (const templateId of ["treant", "scorpion", "dragon", "golem", "phoenix"]) {
  const entry = entries.find((candidate) => candidate.dex.templateId === templateId && candidate.dex.element === "FIRE")!;
  pick(entry, `${entry.name}指定枠`);
}

const fireDragon = entries.find((entry) => entry.dex.templateId === "dragon" && entry.dex.element === "FIRE")!;
const attacker = fireDragon.strong.stats;
title(`同品質HP特化・DEF特化（攻撃側: 火ドラゴン STRONG平均 ATK${n(attacker.atk)} / CD${p(attacker.criDmg)}）`);
console.log("| 対象（選定理由） | 特化 | HP | DEF | EHP | 防低EHP | 防UP EHP | 防低/通常 | 防UP/通常 | S1通常/クリ | S2通常/クリ | S3通常/クリ | S1/S2/S3クリ耐発数 |");
console.log("|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
for (const { entry, reasons } of picked.values()) {
  for (const stat of ["HP", "DEF"] as const) {
    const built = specialized(entry.dex, stat), s = built.stats;
    const hits = [1.2, 2.4, 3.6].map((multiplier) => ({
      normal: damage(attacker.atk, attacker.criDmg, s.def, multiplier, false),
      critical: damage(attacker.atk, attacker.criDmg, s.def, multiplier, true),
    }));
    const normalEhp = ehp(s.hp, s.def), breakEhp = ehp(s.hp, s.def * 0.5), buffEhp = ehp(s.hp, s.def * 1.3);
    console.log(`| ${entry.name}[${ELEMENT_JA[entry.dex.element]}]（${reasons.join("・")}） | ${stat} | ${n(s.hp)} | ${n(s.def)} | ${n(normalEhp)} | ${n(breakEhp)} | ${n(buffEhp)} | ${p(breakEhp / normalEhp)} | ${p(buffEhp / normalEhp)} | ${n(hits[0].normal)}/${n(hits[0].critical)} | ${n(hits[1].normal)}/${n(hits[1].critical)} | ${n(hits[2].normal)}/${n(hits[2].critical)} | ${hits.map((hit) => shots(s.hp, hit.critical)).join("/")} |`);
  }
}

title("HP特化とDEF特化のEHP比");
console.log("| 対象 | HP特化EHP | DEF特化EHP | DEF/HP | ±20%内 |");
console.log("|---|---:|---:|---:|---:|");
for (const { entry } of picked.values()) {
  const hp = specialized(entry.dex, "HP"), def = specialized(entry.dex, "DEF");
  const hpEhp = ehp(hp.stats.hp, hp.stats.def), defEhp = ehp(def.stats.hp, def.stats.def), ratio = defEhp / hpEhp;
  console.log(`| ${entry.name}[${ELEMENT_JA[entry.dex.element]}] | ${n(hpEhp)} | ${n(defEhp)} | ${ratio.toFixed(2)} | ${ratio >= 0.8 && ratio <= 1.2 ? "○" : "×"} |`);
}

const allSpecializationMetrics = entries.map((entry) => {
  const hp = specialized(entry.dex, "HP"), def = specialized(entry.dex, "DEF");
  const hpEhp = ehp(hp.stats.hp, hp.stats.def), defEhp = ehp(def.stats.hp, def.stats.def);
  const hpBreak = ehp(hp.stats.hp, hp.stats.def * 0.5), defBreak = ehp(def.stats.hp, def.stats.def * 0.5);
  const hpBuff = ehp(hp.stats.hp, hp.stats.def * 1.3), defBuff = ehp(def.stats.hp, def.stats.def * 1.3);
  return {
    ratio: defEhp / hpEhp,
    hpBreakRetained: hpBreak / hpEhp,
    defBreakRetained: defBreak / defEhp,
    breakRatio: defBreak / hpBreak,
    hpBuffGain: hpBuff / hpEhp,
    defBuffGain: defBuff / defEhp,
    buffRatio: defBuff / hpBuff,
  };
});
title("全162属性個体の特化投資効率分布");
console.log("| 指標 | 最低 | 25%点 | 中央値 | 75%点 | 最大 |");
console.log("|---|---:|---:|---:|---:|---:|");
for (const [label, values] of [
  ["DEF特化EHP / HP特化EHP", allSpecializationMetrics.map((row) => row.ratio)],
  ["防御低下時のHP特化EHP残存率", allSpecializationMetrics.map((row) => row.hpBreakRetained)],
  ["防御低下時のDEF特化EHP残存率", allSpecializationMetrics.map((row) => row.defBreakRetained)],
  ["防御低下時 DEF特化EHP / HP特化EHP", allSpecializationMetrics.map((row) => row.breakRatio)],
  ["防御UP時のHP特化EHP倍率", allSpecializationMetrics.map((row) => row.hpBuffGain)],
  ["防御UP時のDEF特化EHP倍率", allSpecializationMetrics.map((row) => row.defBuffGain)],
  ["防御UP時 DEF特化EHP / HP特化EHP", allSpecializationMetrics.map((row) => row.buffRatio)],
] as const) {
  console.log(`| ${label} | ${percentile(values, 0).toFixed(2)} | ${percentile(values, 0.25).toFixed(2)} | ${percentile(values, 0.5).toFixed(2)} | ${percentile(values, 0.75).toFixed(2)} | ${percentile(values, 1).toFixed(2)} |`);
}

function printStrongDurability(label: string, rows: AuditEntry[]): void {
  title(label);
  console.log("| モンスター | 属性 | 役割 | HP | DEF | S1クリ | S2クリ | S3クリ | 耐発数S1/S2/S3 | 防UP S3耐発数 |");
  console.log("|---|---|---|---:|---:|---:|---:|---:|---:|---:|");
  for (const entry of rows) {
    const s = entry.strong.stats;
    const taken = entry.strong.combatMods?.damageTakenMultiplier ?? 1;
    const hits = [1.2, 2.4, 3.6].map((multiplier) => damage(attacker.atk, attacker.criDmg, s.def, multiplier, true, taken));
    const buffS3 = damage(attacker.atk, attacker.criDmg, s.def * 1.3, 3.6, true, taken);
    console.log(`| ${entry.name} | ${ELEMENT_JA[entry.dex.element]} | ${entry.role} | ${n(s.hp)} | ${n(s.def)} | ${n(hits[0])} | ${n(hits[1])} | ${n(hits[2])} | ${hits.map((hit) => shots(s.hp, hit)).join("/")} | ${shots(s.hp, buffS3)} |`);
  }
}
printStrongDurability("基礎DEF下位10のSTRONG耐久", byDef.slice(0, 10));
printStrongDurability("基礎DEF上位10のSTRONG耐久", byDef.slice(-10).reverse());

type Classification = "変更不要" | "DEF微調整候補" | "HP微調整候補" | "要個別確認";
function classificationOf(entry: AuditEntry): Classification {
  const s = entry.strong.stats;
  const taken = entry.strong.combatMods?.damageTakenMultiplier ?? 1;
  const s1 = damage(attacker.atk, attacker.criDmg, s.def, 1.2, true, taken);
  const s3 = damage(attacker.atk, attacker.criDmg, s.def, 3.6, true, taken);
  if (shots(s.hp, s1) <= 1) return "HP微調整候補";
  // 数字だけで即調整にはしない。高耐久は役割・低火力・守護4セット込みなので、まず個別対戦で確認する。
  if (s.def >= 12_000) return "DEF微調整候補";
  if (shots(s.hp, s3) >= 5) return "要個別確認";
  return "変更不要";
}
title("全モンスター分類");
console.log("| 分類 | 個体数 | 対象 |");
console.log("|---|---:|---|");
for (const classification of ["変更不要", "DEF微調整候補", "HP微調整候補", "要個別確認"] as const) {
  const matches = entries.filter((entry) => classificationOf(entry) === classification);
  const targets = matches.length === entries.length
    ? "全個体"
    : matches.length === 0
      ? "なし"
      : matches.map((entry) => `${entry.name}[${ELEMENT_JA[entry.dex.element]}]`).join("、");
  console.log(`| ${classification} | ${matches.length} | ${classification === "変更不要" && matches.length > 20 ? "下記の要確認対象を除く全個体" : targets} |`);
}

title("火ドラゴン同士の純粋1対1（期待S1ダメージ）");
const duelBuilds = [
  { name: "ATK特化", def: fireDragon.strong },
  { name: "HP特化", def: specialized(fireDragon.dex, "HP") },
  { name: "DEF特化", def: specialized(fireDragon.dex, "DEF") },
];
console.log("| 攻撃側→防御側 | 与ダメ期待値 | 撃破ターン | 防御側EHP |");
console.log("|---|---:|---:|---:|");
for (const offense of duelBuilds) {
  for (const defense of duelBuilds) {
    const o = offense.def.stats, d = defense.def.stats;
    const normal = damage(o.atk, o.criDmg, d.def, 1.2, false);
    const critical = damage(o.atk, o.criDmg, d.def, 1.2, true);
    const expected = normal * (1 - o.criRate) + critical * o.criRate;
    console.log(`| ${offense.name}→${defense.name} | ${n(expected)} | ${shots(d.hp, expected)} | ${n(ehp(d.hp, d.def))} |`);
  }
}
console.log("\n| 型 | HP | ATK | DEF | CR | CD | EHP |");
console.log("|---|---:|---:|---:|---:|---:|---:|");
for (const row of duelBuilds) {
  const s = row.def.stats;
  console.log(`| ${row.name} | ${n(s.hp)} | ${n(s.atk)} | ${n(s.def)} | ${p(s.criRate)} | ${p(s.criDmg)} | ${n(ehp(s.hp, s.def))} |`);
}

setBalanceFlags({ defenseFormula: "legacy", unifyDefModifiers: false, swRatio: 1.2 });
console.log("\n監査終了。防御式フラグは旧式へ復帰済み。\n");
