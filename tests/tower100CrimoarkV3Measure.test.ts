import { describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import type { BattleUnit } from "../src/battle/unit.js";
import type { MonsterDefinition } from "../src/core/monster.js";
import type { Skill } from "../src/core/skill.js";
import { findMonster } from "../src/data/monsters.js";
import { buildAlly } from "../tools/battleLab/build.js";
import { mulberry32 } from "../tools/battleLab/rng.js";
import type { AllySpec, GearGrade } from "../tools/battleLab/types.js";

type CloneRole = "ATTACK" | "SUPPORT" | "DEBUFF";
type Mode = "CLONES" | "BOSS" | "SUSTAIN";

const S1: Skill = { id:"crimoark_v3_s1", name:"クリエイト・ブレイク", description:"100F V3", target:"SINGLE_ENEMY", cooldownTurns:0, targetPriority:"LOWEST_HP", effects:[{kind:"DAMAGE",multiplier:1.35,debuffDamageBonus:{perDebuff:0.15,maxBonus:0.30},targetHpBonus:[{hpRatio:0.5,bonus:0.20}]},{kind:"DEBUFF",stat:"def",amount:0.50,durationTurns:2,chance:1},{kind:"GAUGE",amount:-0.20}] };
const S2: Skill = { id:"crimoark_v3_s2", name:"リライト・ディザスター", description:"100F V3", target:"ALL_ENEMIES", cooldownTurns:3, effects:[{kind:"DAMAGE",multiplier:1.15},{kind:"STRIP",count:2,chance:1},{kind:"STATUS",status:"BUFF_BLOCK",durationTurns:2,chance:1},{kind:"GAUGE",amount:-0.25},{kind:"DEBUFF",stat:"atk",amount:0.50,durationTurns:2,chance:0.70},{kind:"CLEANSE",count:2,applyTo:"SELF"}] };
const S3: Skill = { id:"crimoark_v3_s3", name:"クリエイト・コピー", description:"3種ランダム分身", target:"SELF", cooldownTurns:5, effects:[{kind:"GAUGE",amount:0,applyTo:"SELF"}] };

const atkSkills: [Skill,Skill,Skill] = [
  { id:"cva1",name:"模造強襲",description:"攻撃型",target:"SINGLE_ENEMY",cooldownTurns:0,effects:[{kind:"DAMAGE",multiplier:1.20},{kind:"GAUGE",amount:-0.15}] },
  { id:"cva2",name:"模造連撃",description:"攻撃型",target:"SINGLE_ENEMY",cooldownTurns:3,effects:[{kind:"DAMAGE",multiplier:0.85},{kind:"DAMAGE",multiplier:0.85,targetHpBonus:[{hpRatio:0.5,bonus:0.30}]}] },
  { id:"cva3",name:"模造処刑",description:"攻撃型",target:"SINGLE_ENEMY",cooldownTurns:4,targetPriority:"LOWEST_HP",effects:[{kind:"DAMAGE",multiplier:1.80,targetHpBonus:[{hpRatio:0.5,bonus:0.50}]},{kind:"GAUGE",amount:0.20,applyTo:"ALLIES"}] },
];
const supSkills: [Skill,Skill,Skill] = [
  { id:"cvs1",name:"模造供給",description:"サポート型",target:"SINGLE_ENEMY",cooldownTurns:0,effects:[{kind:"DAMAGE",multiplier:0.75},{kind:"GAUGE",amount:0.10,applyTo:"ALLIES"}] },
  { id:"cvs2",name:"模造強化",description:"サポート型",target:"ALL_ALLIES",cooldownTurns:3,effects:[{kind:"BUFF",stat:"atk",amount:0.50,durationTurns:2},{kind:"BUFF",stat:"spd",amount:0.30,durationTurns:2},{kind:"SHIELD",shieldRate:0.08,durationTurns:2}] },
  { id:"cvs3",name:"模造加速",description:"サポート型",target:"ALL_ALLIES",cooldownTurns:4,effects:[{kind:"GAUGE",amount:0.35},{kind:"COOLDOWN_REDUCE",turns:1}] },
];
const debSkills: [Skill,Skill,Skill] = [
  { id:"cvd1",name:"模造侵蝕刃",description:"デバフ型",target:"SINGLE_ENEMY",cooldownTurns:0,effects:[{kind:"DAMAGE",multiplier:0.80},{kind:"DEBUFF",stat:"def",amount:0.50,durationTurns:2,chance:1}] },
  { id:"cvd2",name:"模造災波",description:"デバフ型",target:"ALL_ENEMIES",cooldownTurns:3,effects:[{kind:"DAMAGE",multiplier:0.65},{kind:"GAUGE",amount:-0.20},{kind:"DEBUFF",stat:"atk",amount:0.50,durationTurns:2,chance:0.70}] },
  { id:"cvd3",name:"模造侵食",description:"デバフ型",target:"ALL_ENEMIES",cooldownTurns:4,effects:[{kind:"DAMAGE",multiplier:0.40},{kind:"STRIP",count:1,chance:1},{kind:"STATUS",status:"BUFF_BLOCK",durationTurns:2,chance:1},{kind:"HEAL_BLOCK",healMultiplier:0,durationTurns:2,chance:1},{kind:"GAUGE",amount:-0.25}] },
];

const BASE_STATS = { hp:400_000, atk:9_800, def:4_600, spd:215, criRate:0.30, criDmg:1.80, accuracy:0.75, resistance:0.60 };
function bossDef(): MonsterDefinition { const b=findMonster("nemesis","DARK")!; return {...b,id:"crimoark_v3",name:"クリモアーク",stats:{...b.stats,...BASE_STATS},skills:[S1,S2,S3],victoryTarget:true}; }
function cloneDef(index:number): MonsterDefinition { const b=findMonster("nemesis","DARK")!; return {...b,id:`crimoark_v3_clone_${index}`,name:`クリモアークの分身${index}`,stats:{...b.stats,hp:100_000,atk:7_500,def:2_300,spd:215,criRate:0.30,criDmg:1.80,accuracy:0.65,resistance:0.40},skills:atkSkills,victoryTarget:false}; }

const SAFE: AllySpec[]=[{templateId:"fenrir",element:"ELECTRIC",preset:"MAX_ATTACKER"},{templateId:"mushroon",element:"GRASS",preset:"MAX_DEBUFFER"},{templateId:"basilisk",element:"LIGHT",preset:"MAX_TANK"},{templateId:"wisp",element:"WATER",preset:"MAX_HEALER"},{templateId:"chronos",element:"ELECTRIC",preset:"MAX_SUPPORT"}];
const RUSH: AllySpec[]=[{templateId:"fenrir",element:"ELECTRIC",preset:"MAX_ATTACKER"},{templateId:"dragon",element:"DARK",preset:"MAX_ATTACKER"},{templateId:"mushroon",element:"GRASS",preset:"MAX_DEBUFFER"},{templateId:"wisp",element:"WATER",preset:"MAX_HEALER"},{templateId:"chronos",element:"ELECTRIC",preset:"MAX_SUPPORT"}];
const SUSTAIN: AllySpec[]=[{templateId:"valkyria",element:"LIGHT",preset:"MAX_TANK"},{templateId:"seraph",element:"LIGHT",preset:"MAX_HEALER"},{templateId:"basilisk",element:"LIGHT",preset:"MAX_TANK"},{templateId:"wisp",element:"WATER",preset:"MAX_HEALER"},{templateId:"mushroon",element:"GRASS",preset:"MAX_DEBUFFER"}];

function clearDebuffs(u:BattleUnit){u.effects=u.effects.filter(e=>e.kind!=="DEBUFF");u.statusEffects=u.statusEffects.filter(e=>e.category!=="DEBUFF");u.stunTurns=0;u.burnTurns=0;u.poisonStacks=0;u.poisonTurns=0;u.blindTurns=0;u.healBlockTurns=0;}
function roleData(role:CloneRole){ if(role==="ATTACK") return {skills:atkSkills,atk:8500,def:2100,spd:220,criRate:.40,criDmg:1.90,accuracy:.65}; if(role==="SUPPORT") return {skills:supSkills,atk:5500,def:2700,spd:230,criRate:.30,criDmg:1.80,accuracy:.65}; return {skills:debSkills,atk:6000,def:2300,spd:225,criRate:.30,criDmg:1.80,accuracy:.75}; }

function runOne(specs:AllySpec[],seed:number,mode:Mode,grade:GearGrade){
 const rng=mulberry32(seed); const players=specs.map(s=>buildAlly(s,rng,grade)); const engine=new BattleEngine(players,[bossDef(),cloneDef(1),cloneDef(2)],{rng,maxTurns:350}); const units=(engine as unknown as {units:BattleUnit[]}).units; const boss=units.find(u=>u.instanceId==="E1")!; const clones=units.filter(u=>u.instanceId==="E2"||u.instanceId==="E3"); for(const c of clones){c.alive=false;c.currentHp=0;c.gauge=0;}
 let turns=0,s4Cd=5,spawned=0,cloneDeaths=0,s4Uses=0; let crossed40=false; const seenDead=new Set<string>(); const roles:Record<string,CloneRole|undefined>={}; const roleCounts={ATTACK:0,SUPPORT:0,DEBUFF:0};
 const syncBoss=()=>{const r=boss.currentHp/boss.maxHp;let atk=0,spd=0,criRate=0,criDmg=0,factor=1;if(r<=.70){atk+=1000;spd+=15}if(r<=.40){atk+=1500;spd+=25;criRate+=.20;criDmg+=.30;factor=1.15}if(r<=.20){atk+=2000;spd+=40;criRate+=.20;criDmg+=.50;factor=1.30}boss.flatStatBonus={...boss.flatStatBonus,atk,spd,criRate,criDmg};const alive=clones.filter(c=>c.alive).length;boss.mitigateAmount=alive*.10;boss.mitigateTurns=alive?999:0;boss.def.skills=[{...S1,effects:S1.effects.map(e=>e.kind==="DAMAGE"?{...e,multiplier:e.multiplier*factor}:e)},{...S2,effects:S2.effects.map(e=>e.kind==="DAMAGE"?{...e,multiplier:e.multiplier*factor}:e)},S3];if(!crossed40&&r<=.40){crossed40=true;clearDebuffs(boss);boss.gauge=Math.max(boss.gauge,100);boss.cooldowns[2]=0;s4Cd=Math.max(0,s4Cd-1)}};
 const spawnOrRefresh=()=>{const max=boss.currentHp/boss.maxHp>.70?1:2;const inactive=clones.find(c=>!c.alive);const alive=clones.filter(c=>c.alive);if(alive.length<max&&inactive){const roll=rng();const role:CloneRole=roll<1/3?"ATTACK":roll<2/3?"SUPPORT":"DEBUFF";const d=roleData(role);roles[inactive.instanceId]=role;roleCounts[role]++;inactive.def.skills=d.skills;inactive.def.stats={...inactive.def.stats,atk:d.atk,def:d.def,spd:d.spd,criRate:d.criRate,criDmg:d.criDmg,accuracy:d.accuracy};inactive.maxHp=Math.max(75_000,Math.round(boss.currentHp*.25));inactive.currentHp=inactive.maxHp;inactive.alive=true;inactive.gauge=0;inactive.cooldowns=[0,0,0];spawned++;seenDead.delete(inactive.instanceId);}else{for(const c of alive){c.currentHp=Math.min(c.maxHp,c.currentHp+Math.round(c.maxHp*.30));c.gauge+=30}}};
 while(!engine.getWinner()&&turns<350){syncBoss();for(const c of clones){if(!c.alive&&c.currentHp<=0&&!seenDead.has(c.instanceId)&&roles[c.instanceId]){seenDead.add(c.instanceId);cloneDeaths++;boss.effects.push({stat:"atk",amount:.30,remainingTurns:3,kind:"BUFF"});boss.effects.push({stat:"spd",amount:.20,remainingTurns:3,kind:"BUFF"});}}
  if(mode!=="BOSS"){const t=clones.find(c=>c.alive);engine.setFocusTarget(t?t.instanceId:"E1")}else engine.setFocusTarget("E1"); const actor=engine.getNextActor();if(!actor)break;
  if(actor===boss){s4Cd--;if(s4Cd<=0){const alive=clones.filter(c=>c.alive).length;const r=boss.currentHp/boss.maxHp;const factor=r<=.20?1.30:r<=.40?1.15:1;const s4:Skill={id:"crimoark_v3_s4",name:"オーバークリエイト",description:"100F V3",target:"ALL_ENEMIES",cooldownTurns:6,effects:[{kind:"STRIP",chance:1},{kind:"DAMAGE",multiplier:1.30*factor*(1+alive*.15)},{kind:"GAUGE",amount:-.50},{kind:"DEBUFF",stat:"def",amount:.50,durationTurns:3,chance:1,fixedDuration:true},{kind:"HEAL_BLOCK",healMultiplier:0,durationTurns:2,chance:1,fixedDuration:true},{kind:"GAUGE",amount:.30,applyTo:"SELF"}]};const old=boss.def.skills[2],oldCd=boss.cooldowns[2];boss.def.skills[2]=s4;boss.cooldowns[2]=0;engine.resolveTurn(actor,{skillIndex:2});boss.def.skills[2]=old;boss.cooldowns[2]=oldCd;s4Cd=6;s4Uses++;}else if(boss.cooldowns[2]<=0){engine.resolveTurn(actor,{skillIndex:2});spawnOrRefresh()}else engine.resolveTurn(actor);
  }else{engine.resolveTurn(actor);if(boss.currentHp/boss.maxHp<=.20&&actor.team==="ENEMY"&&actor!==boss&&actor.alive)boss.gauge+=10;}if(boss.currentHp/boss.maxHp<=.20&&actor===boss&&boss.alive)for(const c of clones)if(c.alive)c.gauge+=20;turns++;}
 const winner=engine.getWinner()??"DRAW";return{winner,turns,survivors:units.filter(u=>u.team==="PLAYER"&&u.alive).length,bossHpRatio:Math.max(0,boss.currentHp/boss.maxHp),spawned,cloneDeaths,s4Uses,...roleCounts};
}
function measure(name:string,specs:AllySpec[],mode:Mode,grade:GearGrade,seedBase:number,runs=1000){let wins=0,losses=0,draws=0,turns=0,survivors=0,bossHp=0,spawned=0,cloneDeaths=0,s4Uses=0,ATTACK=0,SUPPORT=0,DEBUFF=0;for(let i=0;i<runs;i++){const r=runOne(specs,seedBase+i,mode,grade);if(r.winner==="PLAYER")wins++;else if(r.winner==="ENEMY")losses++;else draws++;turns+=r.turns;survivors+=r.survivors;bossHp+=r.bossHpRatio;spawned+=r.spawned;cloneDeaths+=r.cloneDeaths;s4Uses+=r.s4Uses;ATTACK+=r.ATTACK;SUPPORT+=r.SUPPORT;DEBUFF+=r.DEBUFF;}return{name,grade,winRate:wins/runs,lossRate:losses/runs,drawRate:draws/runs,avgTurns:turns/runs,avgSurvivors:survivors/runs,avgBossHpRatio:bossHp/runs,avgClonesSpawned:spawned/runs,avgCloneDeaths:cloneDeaths/runs,avgS4Uses:s4Uses/runs,cloneRoleCounts:{ATTACK,SUPPORT,DEBUFF}};}

describe("100階クリモアークV3 一時測定",()=>{it("TYPICAL/STRONG/FINISHED × 3攻略型を各1000戦測る",()=>{const rows=[] as ReturnType<typeof measure>[];for(const [gi,grade] of (["TYPICAL","STRONG","FINISHED"] as GearGrade[]).entries()){rows.push(measure("分身処理型",SAFE,"CLONES",grade,510000+gi*30000),measure("ボス集中型",RUSH,"BOSS",grade,520000+gi*30000),measure("耐久処理型",SUSTAIN,"SUSTAIN",grade,530000+gi*30000));}console.log(`TOWER100_CRIMOARK_V3_RESULTS=${JSON.stringify(rows)}`);expect(rows).toHaveLength(9);},120_000);});