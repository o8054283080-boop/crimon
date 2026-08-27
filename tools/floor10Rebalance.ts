import { BattleEngine } from "../src/battle/engine.js";
import { EQUIP_SLOTS, Equipment, generateEquipment, enhanceEquipment } from "../src/core/equipment.js";
import { createMonsterInstance, MonsterInstance } from "../src/core/monsterInstance.js";
import { findDungeonFloor } from "../src/data/equipmentDungeon.js";
import { setupDungeonBattle } from "../src/game/dungeonRunner.js";

function rng(seed:number){let a=seed;return()=>{a=(a+0x6d2b79f5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296}}
const IDS=["dragon_DARK","dragon_LIGHT","nemesis_LIGHT","wisp_WATER","slime_GRASS"];
type Stage={name:string; equipped:number; star:5|6; subs:number; points:boolean; skills:boolean};
const STAGES:Stage[]=[
{name:"A 未装備",equipped:0,star:5,subs:0,points:false,skills:false},
{name:"B 2体中程度",equipped:2,star:5,subs:2,points:false,skills:false},
{name:"C 2体高品質",equipped:2,star:6,subs:4,points:false,skills:false},
{name:"D 全員中程度",equipped:5,star:5,subs:2,points:false,skills:false},
{name:"E 中程度+能力",equipped:5,star:5,subs:2,points:true,skills:false},
{name:"F 中程度+スキル",equipped:5,star:5,subs:2,points:false,skills:true},
{name:"G 全員高品質",equipped:5,star:6,subs:4,points:true,skills:false},
{name:"H 完成育成",equipped:5,star:6,subs:4,points:true,skills:true},
];
function build(stage:Stage, random:()=>number){const party=IDS.map((id,i)=>createMonsterInstance(id,i<3?6:5,i<3?60:50));const gear:Equipment[]=[];party.forEach((m,i)=>{if(stage.points)m.development.abilityPoints={hp:20,atk:60,def:10,spd:10};if(stage.skills)m.skillLevels=[5,5,5];if(i<stage.equipped)for(const slot of EQUIP_SLOTS){const e=generateEquipment({slot,star:stage.star,subStatCount:stage.subs,rng:random});for(let n=0;n<15;n++)enhanceEquipment(e,random);m.equipment[slot]=e.id;gear.push(e)}});return{party,gear}}
function runOne(stage:Stage,route:"safe"|"rush",seed:number){const random=rng(seed);const {party,gear}=build(stage,random);const setup=setupDungeonBattle(party,findDungeonFloor(10)!,gear);const engine=new BattleEngine(setup.playerDefs,setup.enemyDefs,{rng:random,maxTurns:500});let turns=0;while(!engine.getWinner()&&turns<500){if(route==="rush")engine.setFocusTarget("E1");else{const units=engine.getUnits();engine.setFocusTarget(units.find(u=>u.instanceId==="E3"&&u.alive)?.instanceId??units.find(u=>u.instanceId==="E2"&&u.alive)?.instanceId??"E1")}const actor=engine.getNextActor();if(!actor)break;engine.resolveTurn(actor);turns++}return{win:engine.getWinner()==="PLAYER",turns}}
const trials=Number(process.argv[2]??100);console.log(`seed=62000.. trials=${trials}`);for(const stage of STAGES){for(const route of ["safe","rush"] as const){let wins=0,total=0;for(let i=0;i<trials;i++){const r=runOne(stage,route,62000+i);wins+=Number(r.win);if(r.win)total+=r.turns}console.log(`${stage.name}\t${route}\t${(wins/trials*100).toFixed(1)}%\t${wins?Math.round(total/wins):"-"} actions`)}}
