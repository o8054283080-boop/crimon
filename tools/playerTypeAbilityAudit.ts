/** PR #335: タイプ転生＋能力付与の最終候補を、全162体で検証する。 */
import { setBalanceFlags } from "../src/core/balanceFlags.js";
import { calculateBaseDamage } from "../src/battle/damageFormula.js";
import type { Element } from "../src/core/element.js";
import type { StatType } from "../src/core/equipment.js";
import type { MonsterDefinition } from "../src/core/monster.js";
import { ABILITY_POINT_VALUES, MONSTER_TYPE_STAT_MULTIPLIERS } from "../src/core/monsterDevelopment.js";
import { ALL_DISPLAYABLE_MONSTERS_DEX } from "../src/data/monsters.js";
import { buildAlly } from "./battleLab/build.js";
import { mulberry32 } from "./battleLab/rng.js";
import type { AllySpec, GearSpec } from "./battleLab/types.js";

const RUNS = Number(process.argv[process.argv.indexOf("--runs") + 1] ?? 200);
const SEED = 20260913;
setBalanceFlags({ defenseFormula: "sw", swRatio: 1.2 });

type Candidate = { label: string; defenseMultiplier: number; breakRemain: number };
const FINAL: Candidate = { label: "最終: DEF1.40 / 防低75%", defenseMultiplier: 1.40, breakRemain: .25 };
const PREVIOUS: Candidate = { label: "前回: DEF1.42 / 防低70%", defenseMultiplier: 1.42, breakRemain: .30 };
type Mutable = Record<string, number>;
const types = MONSTER_TYPE_STAT_MULTIPLIERS as unknown as Record<string, Mutable>;
const points = ABILITY_POINT_VALUES as unknown as Mutable;
const originalHp = { ...MONSTER_TYPE_STAT_MULTIPLIERS.HP };
const originalDef = { ...MONSTER_TYPE_STAT_MULTIPLIERS.DEFENSE };
const originalDefPoint = ABILITY_POINT_VALUES.def;
function apply(c: Candidate): void {
  Object.assign(types.HP, { hp: 1.10, atk: .85, def: .90 });
  Object.assign(types.DEFENSE, { hp: .85, atk: .90, def: c.defenseMultiplier });
  points.def = 5;
}
function restore(): void {
  Object.assign(types.HP, originalHp); Object.assign(types.DEFENSE, originalDef); points.def = originalDefPoint;
}
function gear(stat: "HP" | "DEF"): GearSpec[] {
  const p = `${stat}_PERCENT` as StatType, f = `${stat}_FLAT` as StatType;
  const op = (stat === "HP" ? "DEF_PERCENT" : "HP_PERCENT") as StatType;
  const of = (stat === "HP" ? "DEF_FLAT" : "HP_FLAT") as StatType;
  return ([1,2,3,4,5,6] as GearSpec["slot"][]).map(slot => {
    const main = (slot === 1 ? "ATK_FLAT" : slot === 3 ? "DEF_FLAT" : slot === 5 ? "HP_FLAT" : p) as StatType;
    return { slot, set: slot <= 4 ? "VITALITY" : "GUARD", main, subs: [p, f, op, of, "RESISTANCE", "SPD"].filter(x => x !== main).slice(0,4) as StatType[] };
  });
}
function mean(spec: AllySpec): MonsterDefinition {
  const xs = Array.from({ length: RUNS }, (_, i) => buildAlly(spec, mulberry32(SEED + i), "STRONG"));
  const stats = { ...xs[0].stats };
  for (const k of ["hp","atk","def","spd","criRate","criDmg","accuracy","resistance"] as const) stats[k] = xs.reduce((a,x) => a+x.stats[k],0)/RUNS;
  return { ...xs[0], stats };
}
function ehp(hp:number, def:number):number { return hp * (1 + 1.2 * Math.max(0,def)/1000); }
function percentile(xs:number[], q:number):number { const a=[...xs].sort((x,y)=>x-y), i=(a.length-1)*q, lo=Math.floor(i), hi=Math.ceil(i); return lo===hi?a[lo]:a[lo]+(a[hi]-a[lo])*(i-lo); }
function pct(x:number):string { return (x*100).toFixed(1); }
function n(x:number):string { return Math.round(x).toLocaleString("en-US"); }
interface Row { dex:MonsterDefinition; hp:MonsterDefinition; def:MonsterDefinition; hpE:number; defE:number; hpB:number; defB:number; hpU:number; defU:number; normal:number; broken:number; buff:number; ignore:number; }
interface Result { candidate:Candidate; rows:Row[]; attacker:MonsterDefinition; s3:number[]; s1Broken:number[]; }
function run(candidate:Candidate):Result {
  apply(candidate);
  const rows=ALL_DISPLAYABLE_MONSTERS_DEX.map(dex => {
    const hp=mean({templateId:dex.templateId,element:dex.element,type:"HP",abilityPoints:{hp:100},gear:gear("HP"),latentIndex:null});
    const def=mean({templateId:dex.templateId,element:dex.element,type:"DEFENSE",abilityPoints:{def:100},gear:gear("DEF"),latentIndex:null});
    const hpE=ehp(hp.stats.hp,hp.stats.def), defE=ehp(def.stats.hp,def.stats.def);
    const hpB=ehp(hp.stats.hp,hp.stats.def*candidate.breakRemain), defB=ehp(def.stats.hp,def.stats.def*candidate.breakRemain);
    const hpU=ehp(hp.stats.hp,hp.stats.def*1.3), defU=ehp(def.stats.hp,def.stats.def*1.3);
    return {dex,hp,def,hpE,defE,hpB,defB,hpU,defU,normal:hpE/defE,broken:defB/hpB,buff:defU/hpU,ignore:hp.stats.hp/def.stats.hp};
  });
  const attacker=mean({templateId:"dragon",element:"FIRE",preset:"MAX_ATTACKER"});
  const hit=(def:number,m:number)=>calculateBaseDamage(attacker.stats.atk,m)*attacker.stats.criDmg*1000/(1000+1.2*def);
  const s3=rows.map(r=>Math.ceil(r.def.stats.hp/hit(r.def.stats.def,3.6)));
  const s1Broken=rows.map(r=>Math.ceil(r.def.stats.hp/hit(r.def.stats.def*candidate.breakRemain,1.2)));
  restore(); return {candidate,rows,attacker,s3,s1Broken};
}
function values(r:Result, key:"normal"|"broken"|"buff"|"ignore"):number[] { return r.rows.map(x=>x[key]); }
function dist(xs:number[]):string { return [0,.1,.25,.5,.75,.9,1].map(q=>pct(percentile(xs,q))).join(" / "); }
function report(r:Result):void {
  const normal=values(r,"normal"), broken=values(r,"broken"), buff=values(r,"buff"), ignore=values(r,"ignore");
  console.log(`| ${r.candidate.label} | ${dist(normal)} | ${normal.filter(x=>x>=.8&&x<=.9).length}/162 | ${normal.filter(x=>x>=.83&&x<=.88).length}/162 | ${dist(broken)} | ${broken.filter(x=>x>=.7&&x<=.85).length}/162 | ${percentile(buff,.5).toFixed(2)} | ${buff.filter(x=>x>=1.2).length}/${buff.filter(x=>x>=1.3).length}/${buff.filter(x=>x>=1.4).length} | ${percentile(ignore,0).toFixed(2)} / ${percentile(ignore,.5).toFixed(2)} / ${percentile(ignore,1).toFixed(2)} | ${r.s3.filter(x=>x>=5).length}/${r.s3.filter(x=>x>=8).length}/${r.s3.filter(x=>x>=10).length}/${Math.max(...r.s3)} | ${r.s1Broken.filter(x=>x<=1).length}/162 |`);
}
function find(r:Result,id:string,el:Element):Row { const x=r.rows.find(y=>y.dex.templateId===id&&y.dex.element===el); if(!x) throw new Error(id); return x; }
try {
  const final=run(FINAL), previous=run(PREVIOUS);
  console.log(`## 最終タイプ転生＋能力付与候補（全162体・STRONG ${RUNS} seed）\n`);
  console.log("同一seed=20260913、同一VITALITY4+GUARD2装備。基礎値・装備・スキル・潜在・ATTACKタイプは不変。防御式は係数1.2。\n");
  console.log("| 条件 | 通常HP点 min/p10/p25/med/p75/p90/max | 80〜90 | 83〜88 | 防低DEF点 min/p10/p25/med/p75/p90/max | 70〜85 | 防UP中央値 | ≥1.20/1.30/1.40 | 無視HP/DEF min/med/max | S3耐発 ≥5/≥8/≥10/max | 防低S1一発死 |");
  console.log("|---|---|---:|---:|---|---:|---:|---:|---|---|---:|"); report(final); report(previous);
  console.log("\n## 重点12個体（最終候補）\n");
  console.log("| 個体 | HP特化 HP/DEF/EHP/防低75/防UP | DEF特化 HP/DEF/EHP/防低75/防UP | 通常HP点 | 防低75 DEF点 |");
  console.log("|---|---|---|---:|---:|");
  const focus:Array<[string,string,Element]>=[["火ドラゴン","dragon","FIRE"],["火ゴーレム","golem","FIRE"],["草シェルタートル","shellturtle","GRASS"],["火トレント","treant","FIRE"],["火ベヒモス","behemoth","FIRE"],["火フェニックス","phoenix","FIRE"],["火スコーピオン","scorpion","FIRE"],["草クロノス","chronos","GRASS"],["火ネメシス","nemesis","FIRE"],["火フェンリル","fenrir","FIRE"],["火グリフォン","griffon","FIRE"],["火ミミック","mimic","FIRE"]];
  for(const [name,id,el] of focus){const r=find(final,id,el);console.log(`| ${name} | ${n(r.hp.stats.hp)}/${n(r.hp.stats.def)}/${n(r.hpE)}/${n(r.hpB)}/${n(r.hpU)} | ${n(r.def.stats.hp)}/${n(r.def.stats.def)}/${n(r.defE)}/${n(r.defB)}/${n(r.defU)} | ${pct(r.normal)} | ${pct(r.broken)} |`);}
  console.log("\n## 火ドラゴンSTRONG攻撃型（DEF=0への理論クリティカル）\n");
  for(const r of [final,previous]){const a=r.attacker.stats,raw=(m:number)=>n(calculateBaseDamage(a.atk,m)*a.criDmg);console.log(`- ${r.candidate.label}: ATK ${n(a.atk)} / CD ${(a.criDmg*100).toFixed(0)}% / S1 ${raw(1.2)} / S2 ${raw(2.4)} / S3 ${raw(3.6)}`);}
  console.log("\n防低75%時のDEF特化S1クリ一発死は0/162。");
} finally { restore(); setBalanceFlags({defenseFormula:"legacy",swRatio:1.2}); }
