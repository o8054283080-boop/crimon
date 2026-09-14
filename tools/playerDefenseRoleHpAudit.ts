/**
 * 新防御式1.2のプレイヤー側候補を、全162属性個体へ仮適用して監査する。
 *
 * 役割＋★6 Lv60基礎HP帯による基礎DEF補正と、役割別基礎ATK補正は
 * BattleLabが作る1戦分の図鑑コピーだけへ掛ける。本番データは変更しない。
 *
 *   node --import tsx tools/playerDefenseRoleHpAudit.ts --runs 200
 */
import { setBalanceFlags } from "../src/core/balanceFlags.js";
import { applyDefense, calculateBaseDamage, roundNormalDamage } from "../src/battle/damageFormula.js";
import type { Element } from "../src/core/element.js";
import { ELEMENT_JA } from "../src/core/element.js";
import type { StatType } from "../src/core/equipment.js";
import type { MonsterDefinition } from "../src/core/monster.js";
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
setBalanceFlags({ defenseFormula: "sw", unifyDefModifiers: true, swRatio: 1.2 });

type AuditRole = "攻撃型" | "体力型" | "防御型" | "補助型" | "妨害型" | "バランス型";
type Specialization = "HP" | "DEF" | "ATK";

const ROLES: readonly AuditRole[] = ["攻撃型", "体力型", "防御型", "補助型", "妨害型", "バランス型"];
const ROLE_DEF_KEYS: readonly AuditRole[] = ["攻撃型", "体力型", "防御型", "補助型", "妨害型", "バランス型"];
const roleDefValues = arg("role-def", "8,10,35,20,20,15").split(",").map(Number);
if (roleDefValues.length !== ROLE_DEF_KEYS.length || roleDefValues.some((value) => !Number.isFinite(value))) {
  throw new Error("--role-def は 攻撃,体力,防御,補助,妨害,バランス の順に6個の%を指定してください");
}
const ROLE_DEF_BONUS = Object.fromEntries(
  ROLE_DEF_KEYS.map((role, index) => [role, roleDefValues[index] / 100]),
) as Record<AuditRole, number>;
const MAX_DEF_BONUS = Number(arg("def-max", "35")) / 100;
const ROLE_ATK_BONUS: Record<AuditRole, number> = {
  攻撃型: 0.18, 体力型: 0.03, 防御型: 0.03, 補助型: 0.05, 妨害型: 0.08, バランス型: 0.12,
};

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

function roleOf(role: string): AuditRole {
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
  return dex.templateId === "valkyria" ? "MAX_SUPPORT" : "MAX_ATTACKER";
}

function hpBandPoint(baseHp: number): number {
  if (baseHp <= 15_000) return 0.05;
  if (baseHp <= 18_000) return 0;
  if (baseHp <= 22_000) return -0.05;
  return -0.10;
}

function defBonus(role: AuditRole, baseHp: number): number {
  return Math.max(0.05, Math.min(MAX_DEF_BONUS, ROLE_DEF_BONUS[role] + hpBandPoint(baseHp)));
}

function meanBuild(spec: AllySpec): MonsterDefinition {
  const defs = Array.from({ length: RUNS }, (_, index) => buildAlly(spec, mulberry32(SEED + index), "STRONG"));
  const first = defs[0];
  const keys = ["hp", "atk", "def", "spd", "criRate", "criDmg", "accuracy", "resistance"] as const;
  const stats = { ...first.stats };
  for (const key of keys) stats[key] = defs.reduce((sum, def) => sum + def.stats[key], 0) / RUNS;
  return { ...first, stats };
}

function specializationGear(stat: "HP" | "DEF"): GearSpec[] {
  const percent = `${stat}_PERCENT` as StatType;
  const flat = `${stat}_FLAT` as StatType;
  const otherPercent: StatType = stat === "HP" ? "DEF_PERCENT" : "HP_PERCENT";
  const otherFlat: StatType = stat === "HP" ? "DEF_FLAT" : "HP_FLAT";
  return ([1, 2, 3, 4, 5, 6] as GearSpec["slot"][]).map((slot) => {
    const main: StatType = slot === 1 ? "ATK_FLAT" : slot === 3 ? "DEF_FLAT" : slot === 5 ? "HP_FLAT" : percent;
    const ordered = [percent, flat, otherPercent, otherFlat, "RESISTANCE", "SPD", "ATK_PERCENT"] as StatType[];
    return { slot, set: slot <= 4 ? "VITALITY" : "GUARD", main, subs: ordered.filter((value) => value !== main).slice(0, 4) };
  });
}

interface AuditEntry {
  dex: MonsterDefinition;
  name: string;
  rarity: 3 | 4 | 5;
  role: AuditRole;
  oldBase: MonsterDefinition;
  newBase: MonsterDefinition;
  defBonus: number;
  atkBonus: number;
  oldStrong: MonsterDefinition;
  strong: MonsterDefinition;
  hp: MonsterDefinition;
  def: MonsterDefinition;
  atk: MonsterDefinition;
}

function correctedSpec(dex: MonsterDefinition, role: AuditRole, baseHp: number, extra: Partial<AllySpec> = {}): AllySpec {
  return {
    templateId: dex.templateId,
    element: dex.element,
    baseStatMultipliers: { def: 1 + defBonus(role, baseHp), atk: 1 + ROLE_ATK_BONUS[role] },
    ...extra,
  };
}

const entries: AuditEntry[] = ALL_DISPLAYABLE_MONSTERS_DEX.map((dex) => {
  const role = roleOf(dex.role);
  const oldBase = buildAlly({ templateId: dex.templateId, element: dex.element }, mulberry32(SEED));
  const bonusDef = defBonus(role, oldBase.stats.hp);
  const bonusAtk = ROLE_ATK_BONUS[role];
  const base = correctedSpec(dex, role, oldBase.stats.hp);
  return {
    dex,
    name: dex.name.replace(/\[[^\]]+\]$/, ""),
    rarity: rarityOf(dex.templateId),
    role,
    oldBase,
    newBase: buildAlly(base, mulberry32(SEED)),
    defBonus: bonusDef,
    atkBonus: bonusAtk,
    oldStrong: meanBuild({ templateId: dex.templateId, element: dex.element, preset: presetOf(dex) }),
    strong: meanBuild({ ...base, preset: presetOf(dex) }),
    hp: meanBuild({ ...base, type: "HP", abilityPoints: { hp: 100 }, gear: specializationGear("HP"), latentIndex: null }),
    def: meanBuild({ ...base, type: "DEFENSE", abilityPoints: { def: 100 }, gear: specializationGear("DEF"), latentIndex: null }),
    atk: meanBuild({ ...base, preset: "MAX_ATTACKER" }),
  };
});

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const index = (sorted.length - 1) * fraction;
  const low = Math.floor(index), high = Math.ceil(index);
  return low === high ? sorted[low] : sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}
function mean(values: number[]): number { return values.reduce((sum, value) => sum + value, 0) / values.length; }
function median(values: number[]): number { return percentile(values, 0.5); }
function n(value: number): string { return Math.round(value).toLocaleString("en-US"); }
function pct(value: number, digits = 0): string { return `${(value * 100).toFixed(digits)}%`; }
function score(value: number): string { return (value * 100).toFixed(1); }
function title(value: string): void { console.log(`\n## ${value}\n`); }
function ehp(hp: number, def: number): number { return hp * (1000 + 1.2 * Math.max(0, def)) / 1000; }
function damage(atk: number, criDmg: number, def: number, multiplier: number): number {
  const raw = calculateBaseDamage(atk, multiplier) * criDmg;
  return roundNormalDamage(applyDefense(raw, atk, def).afterDefense);
}
function shots(hp: number, hit: number): number { return Math.max(1, Math.ceil(hp / Math.max(1, hit))); }

interface Metrics {
  normalHpScore: number;
  break50DefScore: number;
  break70DefScore: number;
  buffDefScore: number;
  hpBuffGain: number;
  defBuffGain: number;
  ignoreHpScore: number;
  defBreak70VsAtk: number;
}

function metricsOf(entry: AuditEntry): Metrics {
  const hp = entry.hp.stats, def = entry.def.stats, atk = entry.atk.stats;
  const hpNormal = ehp(hp.hp, hp.def), defNormal = ehp(def.hp, def.def);
  const hp50 = ehp(hp.hp, hp.def * 0.5), def50 = ehp(def.hp, def.def * 0.5);
  const hp70 = ehp(hp.hp, hp.def * 0.3), def70 = ehp(def.hp, def.def * 0.3);
  const hpBuff = ehp(hp.hp, hp.def * 1.3), defBuff = ehp(def.hp, def.def * 1.3);
  const atk70 = ehp(atk.hp, atk.def * 0.3);
  return {
    normalHpScore: hpNormal / defNormal,
    break50DefScore: def50 / hp50,
    break70DefScore: def70 / hp70,
    buffDefScore: defBuff / hpBuff,
    hpBuffGain: hpBuff / hpNormal,
    defBuffGain: defBuff / defNormal,
    ignoreHpScore: hp.hp / def.hp,
    defBreak70VsAtk: def70 / atk70,
  };
}
const metrics = entries.map((entry) => ({ entry, ...metricsOf(entry) }));

title(`仮補正後の全${entries.length}属性個体（STRONG ${RUNS} seed）`);
console.log("基礎HPは変更なし。DEF補正は役割値＋HP帯ptを5〜35%へクランプし、ATK補正は役割値を使用。");
console.log("| モンスター | 属性 | ★ | 役割 | DEF補正 | ATK補正 | 旧基礎 HP/ATK/DEF | 仮基礎 HP/ATK/DEF | STRONG HP/ATK/DEF | HP特化 HP/DEF | DEF特化 HP/DEF | 通常 HP点(DEF=100) | 防低50 DEF点(HP=100) | 防低70 DEF点(HP=100) | 防UP DEF/HP | 無視時 HP/DEF |");
console.log("|---|---|---:|---|---:|---:|---|---|---|---|---|---:|---:|---:|---:|---:|");
for (const row of metrics) {
  const { entry } = row;
  const old = entry.oldBase.stats, base = entry.newBase.stats, strong = entry.strong.stats;
  console.log(`| ${entry.name} | ${ELEMENT_JA[entry.dex.element]} | ${entry.rarity} | ${entry.role} | +${pct(entry.defBonus)} | +${pct(entry.atkBonus)} | ${n(old.hp)}/${n(old.atk)}/${n(old.def)} | ${n(base.hp)}/${n(base.atk)}/${n(base.def)} | ${n(strong.hp)}/${n(strong.atk)}/${n(strong.def)} | ${n(entry.hp.stats.hp)}/${n(entry.hp.stats.def)} | ${n(entry.def.stats.hp)}/${n(entry.def.stats.def)} | ${score(row.normalHpScore)} | ${score(row.break50DefScore)} | ${score(row.break70DefScore)} | ${row.buffDefScore.toFixed(2)} | ${row.ignoreHpScore.toFixed(2)} |`);
}

function distributionRow(label: string, values: number[], asScore = true): void {
  const format = (value: number): string => asScore ? score(value) : value.toFixed(2);
  console.log(`| ${label} | ${format(percentile(values, 0))} | ${format(percentile(values, 0.1))} | ${format(percentile(values, 0.25))} | ${format(percentile(values, 0.5))} | ${format(percentile(values, 0.75))} | ${format(percentile(values, 0.9))} | ${format(percentile(values, 1))} |`);
}

title("全162個体の耐久比分布");
console.log("| 指標 | 最低 | 10%点 | 25%点 | 中央値 | 75%点 | 90%点 | 最大 |");
console.log("|---|---:|---:|---:|---:|---:|---:|---:|");
distributionRow("通常: HP点（DEF=100）", metrics.map((row) => row.normalHpScore));
distributionRow("防低50%: DEF点（HP=100）", metrics.map((row) => row.break50DefScore));
distributionRow("防低70%: DEF点（HP=100）", metrics.map((row) => row.break70DefScore));
distributionRow("防UP30%: DEF/HP", metrics.map((row) => row.buffDefScore), false);
distributionRow("完全無視: HP/DEF", metrics.map((row) => row.ignoreHpScore), false);
distributionRow("防低70%: DEF特化/ATK特化", metrics.map((row) => row.defBreak70VsAtk), false);

title("役割別の通常耐久比");
console.log("| 役割 | 個体数 | DEF補正範囲 | HP点平均 | HP点中央値 | 目標83〜88内 | 防低70 DEF点平均 | 防低70 DEF点中央値 |");
console.log("|---|---:|---:|---:|---:|---:|---:|---:|");
for (const role of ROLES) {
  const rows = metrics.filter((row) => row.entry.role === role);
  const normal = rows.map((row) => row.normalHpScore), broken = rows.map((row) => row.break70DefScore);
  console.log(`| ${role} | ${rows.length} | +${pct(Math.min(...rows.map((row) => row.entry.defBonus)))}〜+${pct(Math.max(...rows.map((row) => row.entry.defBonus)))} | ${score(mean(normal))} | ${score(median(normal))} | ${rows.filter((row) => row.normalHpScore >= 0.83 && row.normalHpScore <= 0.88).length}/${rows.length} | ${score(mean(broken))} | ${score(median(broken))} |`);
}

title("役割別STRONG実戦presetの変化");
console.log("HP/SPDは不変なので省略。平均は各役割内の属性個体平均。");
console.log("| 役割 | 旧ATK→仮ATK | 旧DEF→仮DEF | ATK増 | DEF増 | 仮EHP平均 |");
console.log("|---|---:|---:|---:|---:|---:|");
for (const role of ROLES) {
  const rows = entries.filter((entry) => entry.role === role);
  const oldAtk = mean(rows.map((entry) => entry.oldStrong.stats.atk));
  const newAtk = mean(rows.map((entry) => entry.strong.stats.atk));
  const oldDef = mean(rows.map((entry) => entry.oldStrong.stats.def));
  const newDef = mean(rows.map((entry) => entry.strong.stats.def));
  console.log(`| ${role} | ${n(oldAtk)}→${n(newAtk)} | ${n(oldDef)}→${n(newDef)} | ${pct(newAtk / oldAtk - 1, 1)} | ${pct(newDef / oldDef - 1, 1)} | ${n(mean(rows.map((entry) => ehp(entry.strong.stats.hp, entry.strong.stats.def))))} |`);
}

title("防御UP30%の増加率");
console.log("| 指標 | 最低 | 中央値 | 最大 |");
console.log("|---|---:|---:|---:|");
for (const [label, values] of [
  ["HP特化 EHP倍率", metrics.map((row) => row.hpBuffGain)],
  ["DEF特化 EHP倍率", metrics.map((row) => row.defBuffGain)],
  ["防UP後 DEF特化/HP特化", metrics.map((row) => row.buffDefScore)],
] as const) console.log(`| ${label} | ${percentile(values, 0).toFixed(2)} | ${percentile(values, 0.5).toFixed(2)} | ${percentile(values, 1).toFixed(2)} |`);

title("基礎DEF補正だけでは届かない場合のDEF特化側感度（診断用）");
console.log("指定ルール適用後のDEF特化最終DEFだけを仮に増幅した参考値。装備変更案ではなく、タイプ補正等を別途検証すべき量の目安。");
console.log("| DEF特化最終DEF倍率 | 通常HP点 最低/中央値/最大 | 80〜90内 | 防低70 DEF点 最低/中央値/最大 | 70〜85内 | 防UP後 DEF/HP 最大 |");
console.log("|---:|---|---:|---|---:|---:|");
for (const factor of [1, 1.1, 1.2, 1.25, 1.3, 1.35, 1.4]) {
  const rows = entries.map((entry) => {
    const hp = entry.hp.stats, def = entry.def.stats;
    const normalHp = ehp(hp.hp, hp.def) / ehp(def.hp, def.def * factor);
    const breakDef = ehp(def.hp, def.def * factor * 0.3) / ehp(hp.hp, hp.def * 0.3);
    const buff = ehp(def.hp, def.def * factor * 1.3) / ehp(hp.hp, hp.def * 1.3);
    return { normalHp, breakDef, buff };
  });
  const normal = rows.map((row) => row.normalHp), broken = rows.map((row) => row.breakDef);
  console.log(`| ×${factor.toFixed(2)} | ${score(percentile(normal, 0))}/${score(median(normal))}/${score(percentile(normal, 1))} | ${normal.filter((value) => value >= 0.8 && value <= 0.9).length}/${entries.length} | ${score(percentile(broken, 0))}/${score(median(broken))}/${score(percentile(broken, 1))} | ${broken.filter((value) => value >= 0.7 && value <= 0.85).length}/${entries.length} | ${Math.max(...rows.map((row) => row.buff)).toFixed(2)} |`);
}

console.log("\n防御特化側を別途強める場合の、防御低下率との組合せ診断。");
console.log("| DEF特化最終DEF倍率 | 通常HP点中央値 | 防低70 DEF点中央値 | 防低75 DEF点中央値 | 防低80 DEF点中央値 |");
console.log("|---:|---:|---:|---:|---:|");
for (const factor of [1.2, 1.25, 1.3]) {
  const normal = entries.map((entry) => ehp(entry.hp.stats.hp, entry.hp.stats.def) / ehp(entry.def.stats.hp, entry.def.stats.def * factor));
  const broken = (remaining: number): number[] => entries.map((entry) => (
    ehp(entry.def.stats.hp, entry.def.stats.def * factor * remaining)
      / ehp(entry.hp.stats.hp, entry.hp.stats.def * remaining)
  ));
  console.log(`| ×${factor.toFixed(2)} | ${score(median(normal))} | ${score(median(broken(0.3)))} | ${score(median(broken(0.25)))} | ${score(median(broken(0.2)))} |`);
}

const attackRepresentatives: Array<[string, Element]> = [
  ["dragon", "FIRE"], ["griffon", "GRASS"], ["nemesis", "FIRE"], ["fenrir", "FIRE"], ["harpy", "FIRE"],
];
title("ATK型代表の仮補正後STRONG火力（DEF0へのクリティカル）");
console.log("| モンスター | 最終ATK | CR | CD | S1 1.2 | S2 2.4 | S3 3.6 |");
console.log("|---|---:|---:|---:|---:|---:|---:|");
for (const [templateId, element] of attackRepresentatives) {
  const entry = entries.find((candidate) => candidate.dex.templateId === templateId && candidate.dex.element === element)!;
  const s = entry.atk.stats;
  console.log(`| ${entry.name}[${ELEMENT_JA[element]}] | ${n(s.atk)} | ${pct(s.criRate)} | ${pct(s.criDmg)} | ${n(damage(s.atk, s.criDmg, 0, 1.2))} | ${n(damage(s.atk, s.criDmg, 0, 2.4))} | ${n(damage(s.atk, s.criDmg, 0, 3.6))} |`);
}

const fireDragon = entries.find((entry) => entry.dex.templateId === "dragon" && entry.dex.element === "FIRE")!;
const dragonAtk = fireDragon.atk.stats;
const focusIds = new Set(["dragon", "nemesis", "griffon", "fenrir", "golem", "treant", "shellturtle", "behemoth", "mimic", "phoenix", "scorpion", "chronos"]);
title(`重点12種・全属性（攻撃側: 火ドラゴン ATK${n(dragonAtk.atk)} / CD${pct(dragonAtk.criDmg)}）`);
console.log("被ダメはS1/S2/S3クリティカル、括弧内は耐発数。防低70%は両特化へ適用。");
console.log("| 対象 | 役割 | DEF補正 | HP点 | 防低70 DEF点 | HP特化 通常被ダメ(耐発) | DEF特化 通常被ダメ(耐発) | HP特化 防低70被ダメ(耐発) | DEF特化 防低70被ダメ(耐発) |");
console.log("|---|---|---:|---:|---:|---|---|---|---|");
for (const row of metrics.filter((candidate) => focusIds.has(candidate.entry.dex.templateId))) {
  const { entry } = row;
  const damageCell = (built: MonsterDefinition, factor: number): string => {
    const s = built.stats;
    return [1.2, 2.4, 3.6].map((multiplier) => {
      const hit = damage(dragonAtk.atk, dragonAtk.criDmg, s.def * factor, multiplier);
      return `${n(hit)}(${shots(s.hp, hit)})`;
    }).join("/");
  };
  console.log(`| ${entry.name}[${ELEMENT_JA[entry.dex.element]}] | ${entry.role} | +${pct(entry.defBonus)} | ${score(row.normalHpScore)} | ${score(row.break70DefScore)} | ${damageCell(entry.hp, 1)} | ${damageCell(entry.def, 1)} | ${damageCell(entry.hp, 0.3)} | ${damageCell(entry.def, 0.3)} |`);
}

title("重点12種の基礎値変更例（火属性、グリフォンのみ草属性も併記）");
console.log("| モンスター | 旧 HP/ATK/DEF | 仮新 HP/ATK/DEF | DEF補正 | ATK補正 |");
console.log("|---|---|---|---:|---:|");
for (const templateId of focusIds) {
  const attrs: Element[] = templateId === "griffon" ? ["FIRE", "GRASS"] : ["FIRE"];
  for (const element of attrs) {
    const entry = entries.find((candidate) => candidate.dex.templateId === templateId && candidate.dex.element === element)!;
    const old = entry.oldBase.stats, next = entry.newBase.stats;
    console.log(`| ${entry.name}[${ELEMENT_JA[element]}] | ${n(old.hp)}/${n(old.atk)}/${n(old.def)} | ${n(next.hp)}/${n(next.atk)}/${n(next.def)} | +${pct(entry.defBonus)} | +${pct(entry.atkBonus)} |`);
  }
}

const normalInGoal = metrics.filter((row) => row.normalHpScore >= 0.83 && row.normalHpScore <= 0.88).length;
const normalInBroad = metrics.filter((row) => row.normalHpScore >= 0.80 && row.normalHpScore <= 0.90).length;
const breakInGoal = metrics.filter((row) => row.break70DefScore >= 0.70 && row.break70DefScore <= 0.85).length;
const s3TenPlus = metrics.filter((row) => {
  const s = row.entry.def.stats;
  return shots(s.hp, damage(dragonAtk.atk, dragonAtk.criDmg, s.def, 3.6)) >= 10;
});
const s3Shots = metrics.map((row) => {
  const s = row.entry.def.stats;
  return { row, shots: shots(s.hp, damage(dragonAtk.atk, dragonAtk.criDmg, s.def, 3.6)) };
});
const maxS3Shots = Math.max(...s3Shots.map((value) => value.shots));
title("成功条件の機械判定");
console.log(`- 通常HP点83〜88: ${normalInGoal}/${entries.length}`);
console.log(`- 通常HP点80〜90: ${normalInBroad}/${entries.length}`);
console.log(`- 防低70%のDEF点70〜85: ${breakInGoal}/${entries.length}`);
console.log(`- DEF特化がS3クリを10発以上耐える個体: ${s3TenPlus.length}/${entries.length}${s3TenPlus.length ? `（${s3TenPlus.map((row) => `${row.entry.name}[${ELEMENT_JA[row.entry.dex.element]}]`).join("、")}）` : ""}`);
console.log(`- DEF特化のS3クリ耐発数最大: ${maxS3Shots}発（${s3Shots.filter((value) => value.shots === maxS3Shots).map((value) => `${value.row.entry.name}[${ELEMENT_JA[value.row.entry.dex.element]}]`).join("、")}）`);

setBalanceFlags({ defenseFormula: "legacy", unifyDefModifiers: false, swRatio: 1.2 });
console.log("\n監査終了。防御式フラグは旧式へ復帰済み。\n");
