import type { MonsterTemplate } from '../../core/monster.js';
import type { Skill, SkillEffect, TargetType } from '../../core/skill.js';
import { describeSkillLines } from '../../core/skill.js';
import type { PassiveLevelEffect } from '../../core/passive.js';
import { passive } from './shared.js';

// 各段の完成値を保存する。既存モンスターの一律成長は変更しない。
type Step = (effects: SkillEffect[]) => void;
const power = (amount: number): Step => effects => {
  for (const e of effects) if (e.kind === 'DAMAGE') {
    e.multiplier *= amount;
    if (e.hpCoefficient !== undefined) e.hpCoefficient *= amount;
  }
};
const set = (index: number, values: object): Step => effects => { Object.assign(effects[index], values); };
function skill(id: string, name: string, target: TargetType, ct: number, effects: SkillEffect[], steps: Step[], extras: Partial<Skill> = {}): Skill {
  const levels = [{ effects: JSON.parse(JSON.stringify(effects)) as SkillEffect[], cooldownTurns: ct }];
  for (let i = 0; i < 4; i++) {
    const next = JSON.parse(JSON.stringify(levels[i])) as typeof levels[number];
    steps[i]?.(next.effects);
    if (i === 3 && ct > 0) next.cooldownTurns--;
    levels.push(next);
  }
  const result: Skill = { id, name, description: '', target, cooldownTurns: ct, effects, levelOverrides: levels, ...extras };
  result.description = describeSkillLines(result).join('。') + (effects.some(e => e.kind === 'BUFF') ? '。能力上昇' : '') + (effects.some(e => e.kind === 'DEBUFF') ? '。能力低下' : '');
  return result;
}
function pass(id: string, name: string, levels: PassiveLevelEffect[]): Skill {
  return { id, name, description: '', target: 'SELF', cooldownTurns: 0, effects: [], passive: passive('ALWAYS', levels) };
}
const d = (multiplier: number, extra = {}): SkillEffect => ({ kind: 'DAMAGE', multiplier, ...extra });
const deb = (stat: 'atk'|'def'|'spd', chance = 1, durationTurns = 2): SkillEffect => ({ kind: 'DEBUFF', stat, amount: stat === 'spd' ? .3 : .5, chance, durationTurns });
const buff = (stat: 'atk'|'def'|'spd'|'criRate'|'criDmg', amount: number, applyTo?: 'SELF'|'ALLIES'): SkillEffect => ({ kind: 'BUFF', stat, amount, durationTurns: 2, applyTo });
const heal = (healRate: number, applyTo?: 'ALLIES'): SkillEffect => ({ kind: 'HEAL', scaleStat: 'hp', healRate, applyTo });
const regen = (healRate: number, durationTurns: number): SkillEffect => ({ kind: 'REGEN', healRate, durationTurns });
const gauge = (amount: number, applyTo?: 'SELF'|'ALLIES', extra = {}): SkillEffect => ({ kind: 'GAUGE', amount, applyTo, ...extra });
const poison = (chance: number, extra = {}): SkillEffect => ({ kind: 'POISON', chance, durationTurns: 2, damageRatePerStack: .05, ...extra });
const block = (chance: number): SkillEffect => ({ kind: 'HEAL_BLOCK', chance, durationTurns: 2, healMultiplier: .5 });
const growth25 = [power(1.1), power(1.15/1.1), power(1.25/1.15)];
const growth20 = [power(1.05), power(1.1/1.05), power(1.2/1.1)];
const stats = (hp: number, atk: number, def: number, spd: number) => ({ hp, atk, def, spd, criRate: .18, criDmg: 1.6, accuracy: .2, resistance: .2 });
const map = (pairs: number[][]): MonsterTemplate['skillAssignment'] => Object.fromEntries(['FIRE','WATER','ELECTRIC','GRASS','LIGHT','DARK'].map((e,i) => [e,{skill2:pairs[i][0],skill3:pairs[i][1]}]));

export const SCORPION: MonsterTemplate = {
  templateId:'scorpion', baseName:'スコーピオン', role:'アタッカー', emoji:'🦂', gachaStar:3,
  baseStats:stats(1400,80,140,102),
  skill1:skill('scorpion_s1','毒針','SINGLE_ENEMY',0,[d(1), gauge(.1,'SELF',{requires:'TARGET_POISONED'}),poison(.8,{requires:'ANY_CRIT'})],[power(1.1),set(2,{chance:.9}),power(1.2/1.1),set(2,{chance:1})]),
  skill2Variants:[
    skill('scorpion_s2_a','急所刺し','SINGLE_ENEMY',3,[d(1.9,{critDamageBonus:.3}),deb('def')],growth25),
    skill('scorpion_s2_b','狩りの構え','SELF',4,[buff('atk',.5),buff('criRate',.3),buff('criDmg',.3),gauge(.3)],[set(3,{amount:.35}),set(1,{amount:.35}),set(2,{amount:.4})]),
    skill('scorpion_s2_c','麻痺針','SINGLE_ENEMY',3,[d(1.6),deb('spd',.8),gauge(-.3),{kind:'STUN',chance:.6,durationTurns:1,requires:'TARGET_HP_BELOW_50'}],[power(1.1),set(1,{chance:.9}),set(3,{chance:.7})]),
  ],
  skill3Variants:[
    skill('scorpion_s3_a','デススティング','SINGLE_ENEMY',5,[d(2.8,{targetHpBonus:[{hpRatio:.3,bonus:.6},{hpRatio:.5,bonus:.35}]})],growth25),
    pass('scorpion_s3_b','弱点看破',[0,1,2,3,4].map(i=>({kind:'WEAK_POINT',hpRatio:i===4?.8:.75,critRate:i>=1?.3:.25,critDmg:i>=2?.6:.5,ignore:i>=3?.4:.35}))),
    skill('scorpion_s3_c','毒殺','SINGLE_ENEMY',4,[d(2.4,{debuffDamageBonus:{perDebuff:.1,maxBonus:.4},debuffIgnoreDefense:{count:3,ratio:.5}})],growth25),
  ],
  lightSkill3:skill('scorpion_s3_light','ホーリーピアース','SINGLE_ENEMY',4,[d(2.8),{kind:'STRIP',requires:'ANY_CRIT'}],growth25),
  darkSkill3:skill('scorpion_s3_dark','アサシネイト','SINGLE_ENEMY',5,[d(2.5,{ignoreDefense:true})],growth20),
  skillAssignment:map([[0,0],[2,1],[1,0],[0,2],[1,0],[0,0]]),
};

export const HARPY: MonsterTemplate = {
  templateId:'harpy',baseName:'ハーピー',role:'アタッカー',emoji:'🪽',gachaStar:4,baseStats:stats(1300,180,90,113),
  skill1:skill('harpy_s1','フェザースラッシュ','ALL_ENEMIES',0,[d(.7),deb('atk',.2)],[power(1.1),set(1,{chance:.25}),power(1.2/1.1),set(1,{chance:.3})],{gaugeIfThreeEnemies:.1}),
  skill2Variants:[
    skill('harpy_s2_a','急降下','SINGLE_ENEMY',3,[d(2.4,{fullHpBonus:.3}),gauge(.4,'SELF',{requires:'ANY_CRIT'})],growth25),
    skill('harpy_s2_b','羽ばたき','SELF',4,[buff('atk',.5)],[set(0,{amount:.55}),set(0,{amount:.6}),set(0,{amount:.65})],{extraTurn:true}),
    skill('harpy_s2_c','ツインフェザー','ALL_ENEMIES',3,[d(.7,{hits:2,fullHpBonus:.25,perHitEffects:[deb('spd',.5)]})],[power(1.1),set(0,{perHitEffects:[deb('spd',.6)]}),power(1.2/1.1)]),
  ],
  skill3Variants:[
    skill('harpy_s3_a','テンペスト','ALL_ENEMIES',5,[d(1.15,{hits:2,perHitEffects:[deb('def',.6)]})],[power(1.1),set(0,{perHitEffects:[deb('def',.7)]}),power(1.2/1.1)],{resetCooldownOnKill:true}),
    pass('harpy_s3_b','空の支配者',[0,1,2,3,4].map(i=>({kind:'SKY_RULER',atk:i>=3?.125:i>=1?.11:.1,critDmg:i>=4?.2:i>=2?.175:.15}))),
    skill('harpy_s3_c','掃討','ALL_ENEMIES',5,[deb('def',.6,1),d(2.1,{targetHpBonus:[{hpRatio:.5,bonus:.3}]})],[power(1.1),set(0,{chance:.7}),power(1.2/1.1)]),
  ],
  lightSkill3:skill('harpy_s3_light','セレスティアルストーム','ALL_ENEMIES',4,[d(1.35),gauge(.35,'ALLIES'),{kind:'DAMAGE_BOOST',amount:.2,durationTurns:2,applyTo:'ALLIES'}],[power(1.1),set(2,{amount:.25}),power(1.2/1.1)]),
  darkSkill3:skill('harpy_s3_dark','ブラックテンペスト','ALL_ENEMIES',5,[d(2.2,{debuffDamageBonus:{perDebuff:.1,maxBonus:.4}})],growth25),
  skillAssignment:map([[0,2],[2,0],[1,2],[0,1],[1,0],[2,0]]),
};

export const PHOENIX: MonsterTemplate = {
  templateId:'phoenix',baseName:'フェニックス',role:'ヒーラー',emoji:'🔥',gachaStar:5,baseStats:stats(1750,108,105,102),
  skill1:skill('phoenix_s1','生命の火','SINGLE_ENEMY',0,[d(.7,{hpCoefficient:.04,currentHpBonus:.3})],[power(1.05),power(1.1/1.05),power(1.15/1.1),power(1.25/1.15)]),
  skill2Variants:[
    skill('phoenix_s2_a','癒しの炎','SINGLE_ALLY',3,[heal(.2),{kind:'CLEANSE',count:1},{kind:'IMMUNITY',durationTurns:1}],[set(0,{healRate:.22}),set(0,{healRate:.24}),set(1,{count:2})]),
    skill('phoenix_s2_b','命の火種','SINGLE_ALLY',3,[heal(.25),regen(.15,3),buff('spd',.3)],[set(0,{healRate:.275}),set(0,{healRate:.3}),set(1,{healRate:.2})]),
    skill('phoenix_s2_c','炎の翼','ALL_ENEMIES',4,[d(.8,{hpCoefficient:.08}),block(.75),heal(.1,'ALLIES')],[power(1.1),set(1,{chance:.85}),set(2,{healRate:.12})]),
  ],
  skill3Variants:[
    skill('phoenix_s3_a','再生の炎','ALL_ALLIES',5,[heal(.15),buff('def',.5),regen(.15,2)],[set(0,{healRate:.17}),set(0,{healRate:.2}),set(2,{healRate:.2})]),
    skill('phoenix_s3_b','不死鳥の羽','ALL_ALLIES',5,[heal(.18),{kind:'CLEANSE',count:2},{kind:'IMMUNITY',durationTurns:2},gauge(.2)],[set(0,{healRate:.2}),set(0,{healRate:.22}),set(1,{count:3})]),
    skill('phoenix_s3_c','灼熱転生','ALL_ENEMIES',5,[d(1.2,{hpCoefficient:.1}),buff('atk',.5,'ALLIES'),{kind:'SHIELD',shieldRate:.15,durationTurns:3,fromSourceHp:true,applyTo:'ALLIES'}],[power(1.1),set(2,{shieldRate:.18}),power(1.2/1.1)]),
    skill('phoenix_s3_electric','雷光再生','ALL_ALLIES',5,[heal(.18),gauge(.25),buff('spd',.3),{kind:'CLEANSE',count:1}],[set(0,{healRate:.2}),set(0,{healRate:.22}),set(1,{amount:.3})]),
  ],
  lightSkill3:skill('phoenix_s3_light','輪廻の聖炎','SINGLE_ALLY',8,[{kind:'STATUS',status:'INVINCIBLE',durationTurns:3},regen(.15,2)],[set(1,{healRate:.175}),set(1,{healRate:.2}),set(1,{durationTurns:3})]),
  darkSkill3:pass('phoenix_s3_dark','輪廻転生',[0,1,2,3,4].map(i=>({kind:'REBIRTH',heal:i>=3?.1:i>=1?.09:.08,damage:i>=2?.55:.5,cooldown:i===4?8:9}))),
  skillAssignment:map([[2,2],[0,1],[0,3],[1,0],[0,0],[2,0]]),
};

export const JOKER: MonsterTemplate = {
  templateId:'joker',baseName:'ジョーカー',role:'デバッファー',emoji:'🃏',gachaStar:5,baseStats:stats(1450,145,100,108),
  skill1:skill('joker_s1','呪いの札','SINGLE_ENEMY',0,[d(1),{kind:'STATUS',status:'SKILL_LOCK',durationTurns:1,chance:.4},{kind:'CURSE',chance:.2}],[power(1.1),set(1,{chance:.5}),power(1.2/1.1),set(2,{chance:.3})]),
  skill2Variants:[
    skill('joker_s2_a','悪魔の囁き','SINGLE_ENEMY',3,[d(1.4),deb('atk',.6),deb('def',.6),block(.6)],[power(1.1),e=>{[1,2,3].forEach(i=>Object.assign(e[i],{chance:.7}));},power(1.2/1.1)]),
    skill('joker_s2_b','最低なイタズラ','SINGLE_ENEMY',4,[d(1.2),{kind:'DETONATE_CURSES'}],growth20,{extraTurn:true,targetPriority:'CURSED'}),
    skill('joker_s2_c','悪意の振り撒き','ALL_ENEMIES',4,[{kind:'CURSE',chance:.7},{kind:'BLIND',chance:.7,durationTurns:2},gauge(-.25,undefined,{chance:.6})],[set(0,{chance:.8}),set(1,{chance:.8}),set(2,{chance:.7})]),
  ],
  skill3Variants:[
    pass('joker_s3_a','バトルイリュージョン',[0,1,2,3,4].map(i=>({kind:'ILLUSION',damage:i>=3?.96:i>=1?.88:.8,chance:i>=4?.6:i>=2?.55:.5}))),
    skill('joker_s3_b','ショータイム','ALL_ENEMIES',6,[{kind:'STRIP',chance:1},deb('def',.8)],[set(1,{chance:.85}),set(1,{chance:.9}),set(1,{chance:1})]),
    skill('joker_s3_c','ナイフジャグリング','SINGLE_ENEMY',5,[d(.7,{hits:4,perHitEffects:[block(.2),{kind:'STATUS',status:'BUFF_BLOCK',durationTurns:2,chance:.2},poison(.2)]})],[power(1.1),set(0,{perHitEffects:[block(.25),{kind:'STATUS',status:'BUFF_BLOCK',durationTurns:2,chance:.25},poison(.25)]}),power(1.2/1.1)]),
  ],
  lightSkill3:pass('joker_s3_light','イカサマ',[.3,.35,.4,.45,.5].map(reduction=>({kind:'CHEAT',reduction}))),
  darkSkill3:skill('joker_s3_dark','反転の儀式','ALL_ENEMIES',6,[d(1.7),{kind:'CONVERT_CURSES',chance:.85}],[power(1.1),set(1,{chance:.9}),power(1.2/1.1)]),
  skillAssignment:map([[0,2],[2,1],[1,0],[2,2],[0,0],[1,0]]),
};
export const FOUR_SPECIES = [SCORPION,HARPY,PHOENIX,JOKER];
