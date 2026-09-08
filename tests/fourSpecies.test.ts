import { describe, it, expect } from 'vitest';
import { BattleEngine } from '../src/battle/engine.js';
import { applyDamage, applyStatus, cleanseDebuffs, countDebuffs, getEffectiveStat, createBattleUnit } from '../src/battle/unit.js';
import { calcDamage } from '../src/battle/damage.js';
import { computeLeveledSkill, describeSkillLines, type Skill } from '../src/core/skill.js';
import { createMonsterVariant } from '../src/core/monster.js';
import { FOUR_SPECIES } from '../src/data/newMonsters/fourSpecies.js';
import { findMonster, GACHA_STAR3_TEMPLATES, GACHA_STAR4_TEMPLATES, GACHA_STAR5_TEMPLATES } from '../src/data/monsters.js';
import { ELEMENTS, type Element } from '../src/core/element.js';
import { encodeSave, decodeSave } from '../src/game/saveCodec.js';
import { createInitialState, addMonster } from '../src/game/playerState.js';
import { LATENT_ABILITY_CANDIDATES } from '../src/data/latentAbilities.js';
import { extractSurvivors } from '../src/game/stageRunner.js';

function def(name: string, element: Element = 'FIRE', level = 1) {
  const original = structuredClone(findMonster(name, element)!);
  original.skills = original.skills.map(s=>computeLeveledSkill(s,level)) as [Skill,Skill,Skill];
  original.stats = { ...original.stats, hp: 100000, atk: 100, def: 100, accuracy: 1, resistance: 0, criRate: 0, criDmg: 1.5 };
  return original;
}
function battle(name: string, element: Element = 'FIRE', level = 1, enemy = 'slime') {
  const engine = new BattleEngine([def(name,element,level)],[def(enemy)],{rng:()=>0});
  const [a,b] = engine.getUnits();
  const act = (index: 0|1|2) => { a.gauge=100; return engine.resolveTurn(a,{skillIndex:index,targetId:b.instanceId}); };
  return {engine,a,b,act};
}

describe('新4種の登録と個別成長',()=>{
  it('指定24属性が一意に登録され、対応する召喚プールに入る',()=>{
    const ids = new Set<string>();
    for(const t of FOUR_SPECIES) {
      const pool = t.gachaStar === 3 ? GACHA_STAR3_TEMPLATES : t.gachaStar === 4 ? GACHA_STAR4_TEMPLATES : GACHA_STAR5_TEMPLATES;
      expect(pool.some(x=>x.templateId===t.templateId)).toBe(true);
      for(const e of ELEMENTS) { const d=createMonsterVariant(t,e); ids.add(d.id); expect(findMonster(t.templateId,e)?.skills.map(s=>s.id)).toEqual(d.skills.map(s=>s.id)); }
    }
    expect(ids.size).toBe(24);
    for (const id of ids) for (const ability of LATENT_ABILITY_CANDIDATES[id] ?? []) expect(ability.name).not.toContain("undefined");
  });
  it('全スキルの5段が有効で、原本を変更しない',()=>{
    for(const t of FOUR_SPECIES) for(const e of ELEMENTS) for(const s of createMonsterVariant(t,e).skills) {
      const original=JSON.stringify(s);
      for(let lv=1;lv<=5;lv++) {
        const result=computeLeveledSkill(s,lv);
        expect(describeSkillLines(result).join('')).not.toMatch(/NaN|undefined/);
        expect(result.cooldownTurns).toBeGreaterThanOrEqual(0);
        if(!s.passive) expect(result.effects).toEqual(s.levelOverrides![lv-1].effects);
      }
      expect(JSON.stringify(s)).toBe(original);
    }
  });
  it('無敵・免疫・復活の成長が一律強化に上書きされない',()=>{
    expect(def('phoenix','LIGHT',5).skills[2]).toMatchObject({cooldownTurns:7,effects:[{durationTurns:3},{healRate:.2,durationTurns:3}]});
    expect(def('phoenix','WATER',5).skills[1]).toMatchObject({cooldownTurns:2,effects:[{healRate:.24},{count:2},{durationTurns:1}]});
    expect(def('scorpion','DARK',5).skills[2].effects[0]).toMatchObject({multiplier:3,ignoreDefense:true});
  });
  it('新モンスター24体のスキルレベルをセーブ往復できる',()=>{
    const state=createInitialState();
    for(const t of FOUR_SPECIES) for(const e of ELEMENTS) { const m=addMonster(state,createMonsterVariant(t,e).id,t.gachaStar!);m.skillLevels=[5,3,4]; }
    expect(decodeSave(encodeSave(state))).toEqual(state);
  });
});

describe('呪いの戦闘処理',()=>{
  it('攻撃力を付与時に記録し、対象の2回目の手番で個別に発動する',()=>{
    const {engine,a,b,act}=battle('joker');act(0);
    expect(b.curses).toEqual([{attack:100,turns:2,sourceId:a.instanceId}]);
    a.effects.push({kind:'BUFF',stat:'atk',amount:2,remainingTurns:9});
    b.gauge=100;engine.resolveTurn(b,{skillIndex:0,targetId:a.instanceId});
    expect(b.curses?.[0].turns).toBe(1);
    const before=b.currentHp;b.gauge=100;const record=engine.resolveTurn(b,{skillIndex:0,targetId:a.instanceId});
    expect(before-b.currentHp).toBe(400);expect(b.curses).toEqual([]);expect(record.lines.some(x=>x.includes('スタン中'))).toBe(true);
  });
  it('免疫で防ぎ、抵抗され、弱体解除で1個ずつ消える',()=>{
    const {a,b,act}=battle('joker');b.immuneTurns=3;act(0);expect(b.curses?.length??0).toBe(0);
    b.immuneTurns=0;act(0);act(0);expect(countDebuffs(b)).toBeGreaterThanOrEqual(2);
    b.statusEffects=[];expect(cleanseDebuffs(b,1)).toBe(1);expect(b.curses).toHaveLength(1);
    cleanseDebuffs(b);expect(b.curses).toHaveLength(0);
    const resistEngine=new BattleEngine([def('joker')],[def('slime')],{rng:()=>.99});
    const [r,t]=resistEngine.getUnits();r.gauge=100;resistEngine.resolveTurn(r,{skillIndex:0,targetId:t.instanceId});expect(t.curses?.length??0).toBe(0);
  });
  it('最低なイタズラは残りターンに関係なくすべて起爆し追加ターンを得る',()=>{
    const {engine,a,b,act}=battle('joker','DARK');
    b.curses=[{attack:100,turns:2,sourceId:a.instanceId},{attack:200,turns:1,sourceId:a.instanceId}];
    const record=act(1);expect(b.curses).toEqual([]);expect(record.events.filter(e=>e.kind==='DAMAGE'&&[400,800].includes(e.amount!))).toHaveLength(2);
    expect(engine.getNextActor()).toBe(a);
  });
  it('反転の儀式は免疫を含む4強化を解除して4呪いへ変換する',()=>{
    const {a,b,act}=battle('joker','DARK');
    b.effects=[{kind:'BUFF',stat:'atk',amount:.5,remainingTurns:3},{kind:'BUFF',stat:'def',amount:.5,remainingTurns:3}];b.immuneTurns=3;b.shieldTurns=3;b.shieldValue=9999;
    act(2);expect(b.effects).toHaveLength(0);expect(b.immuneTurns).toBe(0);expect(b.shieldTurns).toBe(0);expect(b.curses).toHaveLength(4);expect(b.stunTurns).toBe(1);
    expect(b.curses?.every(c=>c.attack===getEffectiveStat(a,'atk'))).toBe(true);
  });
  it('呪いはシールドと無敵を尊重し、防御力では減らない',()=>{
    const {engine,a,b}=battle('joker');b.def.stats.def=100000;b.curses=[{attack:100,turns:1,sourceId:a.instanceId}];b.shieldValue=100;b.shieldTurns=4;
    const before=b.currentHp;b.gauge=100;engine.resolveTurn(b);expect(before-b.currentHp).toBe(300);
    b.stunTurns=0;applyStatus(b,'INVINCIBLE',3);b.curses=[{attack:100,turns:1,sourceId:a.instanceId}];const hp=b.currentHp;b.gauge=100;engine.resolveTurn(b);expect(b.currentHp).toBe(hp);
  });
});

describe('パッシブ・追加ターン・多段攻撃',()=>{
  it('ライブ戦闘でバトルイリュージョンは追加ターンに再発動しない',()=>{
    const {engine,a,b,act}=battle('joker','ELECTRIC');
    const normal=act(1);expect(normal.lines.filter(s=>s.includes('の「バトルイリュージョン」'))).toHaveLength(1);
    expect(engine.getNextActor()).toBe(a);
    const extra=engine.resolveTurn(a,{skillIndex:0,targetId:b.instanceId});expect(extra.lines.some(s=>s.includes('の「バトルイリュージョン」'))).toBe(false);
  });
  it('一括戦闘でも通常ターン開始攻撃は追加ターンに再発動しない',()=>{
    const a=def('joker','ELECTRIC');a.skills[1].cooldownTurns=1;a.stats.spd=10000;
    const engine=new BattleEngine([a],[def('slime')],{rng:()=>0,maxTurns:2});
    const result=engine.run();expect(result.turns).toHaveLength(2);expect(result.log.filter(s=>s.includes('の「バトルイリュージョン」'))).toHaveLength(1);
  });
  it('闇フェニックスは全回復復活しゲージを維持、CT中の再死亡は通常処理',()=>{
    const {a}=battle('phoenix','DARK',5);a.gauge=73;const hit=applyDamage(a,a.maxHp*2);
    expect(hit.revived).toBe(true);expect(a.currentHp).toBe(a.maxHp);expect(a.gauge).toBe(73);expect(a.passiveCooldown).toBe(8);
    expect(applyDamage(a,a.maxHp*2).died).toBe(true);expect(a.passiveCooldown).toBe(8);
  });
  it('闇フェニックスのターン回復は自身最大HPを参照する',()=>{
    const {a,b,act}=battle('phoenix','DARK',5);a.currentHp=20000;act(0);expect(a.currentHp).toBe(30000);expect(b.currentHp).toBeLessThan(b.maxHp);
  });
  it('光ジョーカーの回復は多段クリティカルでも1スキルにつき1回',()=>{
    const source=def('joker');source.stats.criRate=1;
    const engine=new BattleEngine([source],[def('joker','LIGHT',5)],{rng:()=>0});const [a,b]=engine.getUnits();b.currentHp=50000;a.gauge=100;
    const result=engine.resolveTurn(a,{skillIndex:2,targetId:b.instanceId});
    expect(result.events.filter(e=>e.targetId===b.instanceId&&e.kind==='HEAL')).toHaveLength(1);
  });
  it('ナイフジャグリングは4ヒットそれぞれ毒を判定する',()=>{
    const {b,act}=battle('joker');act(2);expect(b.poisonStacks).toBe(4);
  });
  it('フェニックスの全体回復・シールドは術者HP基準で1回ずつ付与する',()=>{
    const a=def('phoenix');a.stats.hp=1000;
    const ally=def('slime');ally.stats.hp=10000;
    const engine=new BattleEngine([a,ally],[def('slime'),def('slime')],{rng:()=>0});const [p,q,e]=engine.getUnits();p.currentHp=500;q.currentHp=1000;p.gauge=100;
    engine.resolveTurn(p,{skillIndex:1,targetId:e.instanceId});expect(p.currentHp).toBe(600);expect(q.currentHp).toBe(1100);
    p.gauge=100;engine.resolveTurn(p,{skillIndex:2,targetId:e.instanceId});expect(p.shieldValue).toBe(150);expect(q.shieldValue).toBe(150);
  });
  it('草ハーピーの撃破スタックは8まで、ウェーブを越えて維持し新戦闘で消える',()=>{
    const a=def('harpy','GRASS',5);a.stats.atk=100000;
    const engine=new BattleEngine([a],Array.from({length:9},()=>def('slime')),{rng:()=>0});
    const [p]=engine.getUnits();for(const e of engine.getUnits().slice(1))e.currentHp=1;p.gauge=100;engine.resolveTurn(p,{skillIndex:0});
    expect(p.skyStacks).toBe(8);
    const state=createInitialState();const m=addMonster(state,a.id,4);const survivors=extractSurvivors(engine,[m]);
    const next=new BattleEngine([a],[def('slime')],{initialSkyStacks:[survivors.survivorSkyStacks.get(m.id)!]});expect(next.getUnits()[0].skyStacks).toBe(8);
    expect(getEffectiveStat(next.getUnits()[0],'atk')).toBe(200000);expect(new BattleEngine([a],[def('slime')]).getUnits()[0].skyStacks??0).toBe(0);
  });
  it('テンペストは撃破時だけCTを全回復する',()=>{
    const {a,b,act}=battle('harpy','WATER');b.currentHp=1;act(2);expect(a.cooldowns[2]).toBe(0);
    const fresh=battle('harpy','WATER');fresh.act(2);expect(fresh.a.cooldowns[2]).toBe(5);
  });
  it('毒針は攻撃前から毒状態の対象でゲージを得る',()=>{
    const {a,b,act}=battle('scorpion');a.def.stats.criRate=1;act(0);expect(a.gauge).toBe(0);expect(b.poisonStacks).toBe(1);act(0);expect(a.gauge).toBe(10);
  });
  it('条件付き防御無視・HPボーナス・クリティカル軽減をダメージ計算へ反映する',()=>{
    const a=createBattleUnit(def('scorpion','WATER',5),'PLAYER','a');const b=createBattleUnit(def('slime'),'ENEMY','b');b.currentHp=b.maxHp*.8;
    const weak=calcDamage(a,b,{kind:'DAMAGE',multiplier:1},()=>.1);expect(weak.isCrit).toBe(true);
    b.currentHp=b.maxHp;expect(calcDamage(a,b,{kind:'DAMAGE',multiplier:1},()=>.1).isCrit).toBe(false);
    a.def.skills[2] = def("slime").skills[2];
    const full=calcDamage(a,b,{kind:'DAMAGE',multiplier:1,currentHpBonus:.3},()=>.99).damage;b.currentHp=1;
    expect(full).toBeGreaterThan(calcDamage(a,b,{kind:'DAMAGE',multiplier:1,currentHpBonus:.3},()=>.99).damage);
  });
});
