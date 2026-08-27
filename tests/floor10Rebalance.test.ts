import { describe, expect, it } from "vitest";
import { chooseSkill, chooseTargets, HEAL_SKILL_HP_THRESHOLD } from "../src/battle/ai.js";
import { createBattleUnit } from "../src/battle/unit.js";
import { findMonster } from "../src/data/monsters.js";
import { computeLeveledSkill } from "../src/core/skill.js";

describe("10階支援AI", () => {
  it("全員が80%以上ならクリスタルは全体回復を空撃ちせずATKバフを選ぶ", () => {
    const crystal=createBattleUnit(findMonster("ancient_crystal","WATER")!,"ENEMY","E2");
    const boss=createBattleUnit({...findMonster("ancient_demon","WATER")!,primaryTarget:true},"ENEMY","E1");
    crystal.cooldowns=[0,0,0];
    expect(HEAL_SKILL_HP_THRESHOLD).toBe(.8);
    expect(chooseSkill(crystal,[boss,crystal]).skill.id).toBe("ancient_crystal_s2");
  });
  it("ATKバフはHP最低ではなくprimaryTargetを優先する", () => {
    const crystal=createBattleUnit(findMonster("ancient_crystal","WATER")!,"ENEMY","E2");
    const boss=createBattleUnit({...findMonster("ancient_demon","WATER")!,primaryTarget:true},"ENEMY","E1");
    crystal.currentHp=1;
    expect(chooseTargets(crystal,crystal.def.skills[1],[crystal,boss])).toEqual([boss]);
  });
});

describe("破壊の流星のレベル成長",()=>{
  it("既存成長式で1.20/1.27/1.34/1.42/1.42となり防御無視を維持する",()=>{
    const skill=findMonster("dragon","DARK")!.skills[2];
    const values=[1,2,3,4,5].map(level=>computeLeveledSkill(skill,level).effects.find(e=>e.kind==="DAMAGE"));
    expect(values.map(e=>e?.kind==="DAMAGE"?e.multiplier:0)).toEqual([1.2,1.27,1.34,1.42,1.42]);
    expect(values.every(e=>e?.kind==="DAMAGE"&&e.ignoreDefense)).toBe(true);
    expect(skill.effects).toContainEqual({kind:"LIFESTEAL",healRate:.25});
  });
});
