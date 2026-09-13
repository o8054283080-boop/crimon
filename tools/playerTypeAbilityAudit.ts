/**
 * タイプ転生と能力付与だけを仮差し替えし、HP/DEF特化の耐久比を監査する。
 * 正式定数はプロセス内で一時的に変更し、各案の計算後と終了時に必ず復元する。
 *
 *   node --import tsx tools/playerTypeAbilityAudit.ts --runs 200
 */
import { setBalanceFlags } from "../src/battle/balanceFlags.js";
import { calculateBaseDamage } from "../src/battle/damageFormula.js";
import type { Element } from "../src/core/element.js";
import { ELEMENT_JA } from "../src/core/element.js";
import type { StatType } from "../src/core/equipment.js";
import type { MonsterDefinition } from "../src/core/monster.js";
import {
  ABILITY_POINT_VALUES,
  MONSTER_TYPE_STAT_MULTIPLIERS,
  type MonsterTypeModifiers,
} from "../src/core/monsterDevelopment.js";
import { ALL_DISPLAYABLE_MONSTERS_DEX } from "../src/data/monsters.js";
import { buildAlly } from "./battleLab/build.js";
import { mulberry32 } from "./battleLab/rng.js";
import type { AllySpec, GearSpec } from "./battleLab/types.js";

const argv = process.argv.slice(2);
const arg = (name: string, fallback: string): string => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const RUNS = Number(arg("runs", "200"));
const SEED = Number(arg("seed", "20260913"));
setBalanceFlags({ defenseFormula: "sw", swRatio: 1.2 });

interface Proposal {
  key: "A" | "B" | "C" | "微調整";
  hp: Pick<MonsterTypeModifiers, "hp" | "atk" | "def">;
  defense: Pick<MonsterTypeModifiers, "hp" | "atk" | "def">;
  defPoint: number;
}
const PROPOSALS: Proposal[] = [
  { key: "A", hp: { hp: 1.10, atk: 0.85, def: 0.95 }, defense: { hp: 0.95, atk: 0.90, def: 1.25 }, defPoint: 4 },
  { key: "B", hp: { hp: 1.10, atk: 0.85, def: 0.90 }, defense: { hp: 0.95, atk: 0.90, def: 1.30 }, defPoint: 4 },
  { key: "C", hp: { hp: 1.10, atk: 0.85, def: 0.90 }, defense: { hp: 0.90, atk: 0.90, def: 1.35 }, defPoint: 5 },
];
const DIAGNOSTIC: Proposal = {
  key: "微調整", hp: { hp: 1.10, atk: 0.85, def: 0.90 },
  defense: { hp: 0.85, atk: 0.90, def: 1.42 }, defPoint: 5,
};

type MutableModifiers = Record<string, number>;
const mutableTypes = MONSTER_TYPE_STAT_MULTIPLIERS as unknown as Record<string, MutableModifiers>;
const mutablePoints = ABILITY_POINT_VALUES as unknown as MutableModifiers;
const originalHp = { ...MONSTER_TYPE_STAT_MULTIPLIERS.HP };
const originalDefense = { ...MONSTER_TYPE_STAT_MULTIPLIERS.DEFENSE };
const originalDefPoint = ABILITY_POINT_VALUES.def;

function applyProposal(proposal: Proposal): void {
  Object.assign(mutableTypes.HP, proposal.hp);
  Object.assign(mutableTypes.DEFENSE, proposal.defense);
  mutablePoints.def = proposal.defPoint;
}
function restore(): void {
  Object.assign(mutableTypes.HP, originalHp);
  Object.assign(mutableTypes.DEFENSE, originalDefense);
  mutablePoints.def = originalDefPoint;
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

function meanBuild(spec: AllySpec): MonsterDefinition {
  const defs = Array.from({ length: RUNS }, (_, index) => buildAlly(spec, mulberry32(SEED + index), "STRONG"));
  const first = defs[0];
  const stats = { ...first.stats };
  for (const key of ["hp", "atk", "def", "spd", "criRate", "criDmg", "accuracy", "resistance"] as const) {
    stats[key] = defs.reduce((sum, def) => sum + def.stats[key], 0) / RUNS;
  }
  return { ...first, stats };
}

interface Entry { dex: MonsterDefinition; hp: MonsterDefinition; def: MonsterDefinition }
interface Metric extends Entry {
  normal: number; broken: number; buff: number; ignore: number;
  hpEhp: number; defEhp: number; hpBreak: number; defBreak: number; hpBuff: number; defBuff: number;
}
interface Result { proposal: Proposal; rows: Metric[]; attacker: MonsterDefinition }

function ehp(hp: number, def: number): number { return hp * (1000 + 1.2 * Math.max(0, def)) / 1000; }
function metricOf(entry: Entry): Metric {
  const hpEhp = ehp(entry.hp.stats.hp, entry.hp.stats.def);
  const defEhp = ehp(entry.def.stats.hp, entry.def.stats.def);
  const hpBreak = ehp(entry.hp.stats.hp, entry.hp.stats.def * 0.30);
  const defBreak = ehp(entry.def.stats.hp, entry.def.stats.def * 0.30);
  const hpBuff = ehp(entry.hp.stats.hp, entry.hp.stats.def * 1.30);
  const defBuff = ehp(entry.def.stats.hp, entry.def.stats.def * 1.30);
  return { ...entry, hpEhp, defEhp, hpBreak, defBreak, hpBuff, defBuff,
    normal: hpEhp / defEhp, broken: defBreak / hpBreak, buff: defBuff / hpBuff,
    ignore: entry.hp.stats.hp / entry.def.stats.hp };
}
function run(proposal: Proposal): Result {
  applyProposal(proposal);
  const rows = ALL_DISPLAYABLE_MONSTERS_DEX.map((dex) => metricOf({
    dex,
    hp: meanBuild({ templateId: dex.templateId, element: dex.element, type: "HP", abilityPoints: { hp: 100 }, gear: specializationGear("HP"), latentIndex: null }),
    def: meanBuild({ templateId: dex.templateId, element: dex.element, type: "DEFENSE", abilityPoints: { def: 100 }, gear: specializationGear("DEF"), latentIndex: null }),
  }));
  const attacker = meanBuild({ templateId: "dragon", element: "FIRE", preset: "MAX_ATTACKER" });
  restore();
  return { proposal, rows, attacker };
}

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * fraction, low = Math.floor(index), high = Math.ceil(index);
  return low === high ? sorted[low] : sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}
function n(value: number): string { return Math.round(value).toLocaleString("en-US"); }
function score(value: number): string { return (value * 100).toFixed(1); }
function title(value: string): void { console.log(`\n## ${value}\n`); }
function dist(values: number[], scale = 100): string[] { return [0, .1, .25, .5, .75, .9, 1].map((q) => (percentile(values, q) * scale).toFixed(1)); }
function focus(result: Result, templateId: string, element: Element): Metric {
  const found = result.rows.find((row) => row.dex.templateId === templateId && row.dex.element === element);
  if (!found) throw new Error(`重点個体がありません: ${templateId}_${element}`);
  return found;
}

try {
  const results = [...PROPOSALS, DIAGNOSTIC].map(run);
  title(`タイプ転生＋能力付与 A/B/C（全${results[0].rows.length}属性個体、STRONG ${RUNS} seed）`);
  console.log(`seed=${SEED}。基礎値・装備数値・潜在は変更せず、両特化は同じVITALITY4+GUARD2品質。`);
  console.log("| 案 | 通常HP点 分布 min/p10/p25/med/p75/p90/max | 80〜90 | 83〜88 | 防低70 DEF点 分布 | 70〜85 | 防UP DEF/HP中央値 | ≥1.3 | ≥1.4 | ≥1.5 | 無視時HP/DEF min/med/max |");
  console.log("|---|---|---:|---:|---|---:|---:|---:|---:|---:|---|");
  for (const result of results) {
    const normal = result.rows.map((r) => r.normal), broken = result.rows.map((r) => r.broken), buff = result.rows.map((r) => r.buff), ignore = result.rows.map((r) => r.ignore);
    console.log(`| ${result.proposal.key} | ${dist(normal).join(" / ")} | ${normal.filter((v) => v >= .8 && v <= .9).length}/${normal.length} | ${normal.filter((v) => v >= .83 && v <= .88).length}/${normal.length} | ${dist(broken).join(" / ")} | ${broken.filter((v) => v >= .7 && v <= .85).length}/${broken.length} | ${percentile(buff,.5).toFixed(2)} | ${buff.filter((v)=>v>=1.3).length} | ${buff.filter((v)=>v>=1.4).length} | ${buff.filter((v)=>v>=1.5).length} | ${percentile(ignore,0).toFixed(2)} / ${percentile(ignore,.5).toFixed(2)} / ${percentile(ignore,1).toFixed(2)} |`);
  }

  const focuses: Array<[string, string, Element]> = [
    ["火ドラゴン","dragon","FIRE"], ["火ゴーレム","golem","FIRE"], ["草シェルタートル","shellturtle","GRASS"],
    ["火トレント","treant","FIRE"], ["火ベヒモス","behemoth","FIRE"], ["火フェニックス","phoenix","FIRE"],
    ["火スコーピオン","scorpion","FIRE"], ["草クロノス","chronos","GRASS"], ["火ネメシス","nemesis","FIRE"],
    ["火フェンリル","fenrir","FIRE"], ["火グリフォン","griffon","FIRE"], ["火ミミック","mimic","FIRE"],
  ];
  title("重点12個体");
  console.log("属性未指定のネメシス・フェンリル・グリフォン・ミミックは火属性で統一。");
  console.log("| 個体 | 案 | HP特化 HP/DEF/EHP/防低EHP/防UPEHP | DEF特化 HP/DEF/EHP/防低EHP/防UPEHP | 通常HP点 | 防低DEF点 |");
  console.log("|---|---|---|---|---:|---:|");
  for (const [label, templateId, element] of focuses) for (const result of results.filter((item) => item.proposal.key !== "微調整")) {
    const row = focus(result, templateId, element);
    console.log(`| ${label} | ${result.proposal.key} | ${n(row.hp.stats.hp)}/${n(row.hp.stats.def)}/${n(row.hpEhp)}/${n(row.hpBreak)}/${n(row.hpBuff)} | ${n(row.def.stats.hp)}/${n(row.def.stats.def)}/${n(row.defEhp)}/${n(row.defBreak)}/${n(row.defBuff)} | ${score(row.normal)} | ${score(row.broken)} |`);
  }

  title("火ドラゴンSTRONG攻撃型（DEF=0への理論クリティカル）");
  console.log("| 案 | ATK | クリダメ | S1 1.2 | S2 2.4 | S3 3.6 |");
  console.log("|---|---:|---:|---:|---:|---:|");
  for (const result of results) {
    const stats = result.attacker.stats;
    const raw = (multiplier: number) => Math.round(calculateBaseDamage(stats.atk, multiplier) * stats.criDmg);
    console.log(`| ${result.proposal.key} | ${n(stats.atk)} | ${(stats.criDmg*100).toFixed(0)}% | ${n(raw(1.2))} | ${n(raw(2.4))} | ${n(raw(3.6))} |`);
  }

  title("PvP長期化リスク proxy（火ドラゴンS3クリ、通常DEF特化）");
  console.log("| 案 | 10発以上耐える個体 | 最大想定発数 |");
  console.log("|---|---:|---:|");
  for (const result of results) {
    const a = result.attacker.stats;
    const shots = result.rows.map((row) => Math.ceil(row.def.stats.hp / Math.max(1, calculateBaseDamage(a.atk, 3.6) * a.criDmg * 1000 / (1000 + 1.2 * row.def.stats.def))));
    console.log(`| ${result.proposal.key} | ${shots.filter((v)=>v>=10).length}/162 | ${Math.max(...shots)} |`);
  }
} finally {
  restore();
}
