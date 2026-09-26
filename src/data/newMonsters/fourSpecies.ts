import type { MonsterTemplate } from '../../core/monster.js';
import type { Skill, SkillEffect, TargetType } from '../../core/skill.js';
import { describeSkillLines } from '../../core/skill.js';
import type { PassiveLevelEffect } from '../../core/passive.js';
import { passive } from './shared.js';
import {
  ATK_UP, DEF_UP, SPD_UP, CRI_RATE_UP, CRI_DMG_UP, ATK_DOWN, DEF_DOWN, SPD_DOWN,
} from '../../core/statusValues.js';

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
/* 効果量は種類ごとに固定。スキル側で選べるのは**確率と持続ターンだけ** */
const DEBUFF_AMOUNT = { atk: ATK_DOWN, def: DEF_DOWN, spd: SPD_DOWN } as const;
const BUFF_AMOUNT = { atk: ATK_UP, def: DEF_UP, spd: SPD_UP, criRate: CRI_RATE_UP, criDmg: CRI_DMG_UP } as const;
const deb = (stat: 'atk'|'def'|'spd', chance = 1, durationTurns = 2): SkillEffect => ({ kind: 'DEBUFF', stat, amount: DEBUFF_AMOUNT[stat], chance, durationTurns });
const buff = (stat: 'atk'|'def'|'spd'|'criRate'|'criDmg', applyTo?: 'SELF'|'ALLIES'): SkillEffect => ({ kind: 'BUFF', stat, amount: BUFF_AMOUNT[stat], durationTurns: 2, applyTo });
const heal = (healRate: number, applyTo?: 'ALLIES'): SkillEffect => ({ kind: 'HEAL', scaleStat: 'hp', healRate, applyTo });
const regen = (healRate: number, durationTurns: number): SkillEffect => ({ kind: 'REGEN', healRate, durationTurns });
const gauge = (amount: number, applyTo?: 'SELF'|'ALLIES', extra = {}): SkillEffect => ({ kind: 'GAUGE', amount, applyTo, ...extra });
const poison = (chance: number, extra = {}): SkillEffect => ({ kind: 'POISON', chance, durationTurns: 2, damageRatePerStack: .05, ...extra });
const block = (chance: number): SkillEffect => ({ kind: 'HEAL_BLOCK', chance, durationTurns: 2});
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
    // 強化の量は共通値で固定なので、レベルで伸ばすのは行動ゲージだけ(Lv5でCT-1)
    skill('scorpion_s2_b','狩りの構え','SELF',4,[buff('atk'),buff('criRate'),buff('criDmg'),gauge(.3)],[set(3,{amount:.35})]),
    skill('scorpion_s2_c','麻痺針','SINGLE_ENEMY',3,[d(1.6),deb('spd',.8),gauge(-.3),{kind:'STUN',chance:.6,durationTurns:1,requires:'TARGET_HP_BELOW_50'}],[power(1.1),set(1,{chance:.9}),set(3,{chance:.7})]),
  ],
  skill3Variants:[
    skill('scorpion_s3_a','デススティング','SINGLE_ENEMY',5,[d(2.8,{targetHpBonus:[{hpRatio:.3,bonus:.6},{hpRatio:.5,bonus:.35}]})],growth25),
    pass('scorpion_s3_b','弱点看破',[0,1,2,3,4].map(i=>({kind:'WEAK_POINT',hpRatio:i===4?.8:.75,critRate:i>=1?.3:.25,critDmg:i>=2?.6:.5,ignore:i>=3?.4:.35}))),
    {
      id: 'scorpion_s3_c',
      name: '毒殺',
      description: "ダメージ倍率 2.60倍 対象の弱体効果1個につき最終ダメージ+10%(最大+40%)。弱体3個以上で防御100%無視",
      target: "SINGLE_ENEMY",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 2.6, debuffDamageBonus: { perDebuff: 0.1, maxBonus: 0.4 }, debuffIgnoreDefense: { count: 3, ratio: 1 } },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 2.6, debuffDamageBonus: { perDebuff: 0.1, maxBonus: 0.4 }, debuffIgnoreDefense: { count: 3, ratio: 1 } }] },
        // Lv2 ダメージ倍率 2.60倍→2.80倍
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 2.8, debuffDamageBonus: { perDebuff: 0.1, maxBonus: 0.4 }, debuffIgnoreDefense: { count: 3, ratio: 1 } }] },
        // Lv3 ダメージ倍率 2.80倍→3.00倍
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 3, debuffDamageBonus: { perDebuff: 0.1, maxBonus: 0.4 }, debuffIgnoreDefense: { count: 3, ratio: 1 } }] },
        // Lv4 ダメージ倍率 3.00倍→3.30倍
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 3.3, debuffDamageBonus: { perDebuff: 0.1, maxBonus: 0.4 }, debuffIgnoreDefense: { count: 3, ratio: 1 } }] },
        // Lv5 クールタイム -1(4→3ターン)
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 3.3, debuffDamageBonus: { perDebuff: 0.1, maxBonus: 0.4 }, debuffIgnoreDefense: { count: 3, ratio: 1 } }] },
      ],
    },
  ],
  lightSkill3:skill('scorpion_s3_light','ホーリーピアース','SINGLE_ENEMY',4,[d(2.8),{kind:'STRIP',requires:'ANY_CRIT'}],growth25),
  darkSkill3:skill('scorpion_s3_dark','アサシネイト','SINGLE_ENEMY',5,[d(2.5,{ignoreDefense:true})],growth20),
  skillAssignment:map([[0,0],[2,1],[1,0],[0,2],[1,0],[0,0]]),
};

export const HARPY: MonsterTemplate = {
  templateId:'harpy',baseName:'ハーピー',role:'アタッカー',emoji:'🪽',gachaStar:4,baseStats:stats(1300,180,90,113),
  skill1:{
    id: 'harpy_s1',
    name: 'フェザースラッシュ',
    description: "ダメージ倍率 0.70倍。20%で攻撃力-50% (2ターン)。敵が3体以上いる時、自身の行動ゲージ+10%。能力低下",
    target: "ALL_ENEMIES",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 0.7 },
      { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, chance: 0.2, durationTurns: 2 },
    ],
    gaugeIfThreeEnemies: 0.1,
    levelOverrides: [
      // Lv1
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.7 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, chance: 0.2, durationTurns: 2 }] },
      // Lv2 ダメージ倍率 0.70倍→0.80倍
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.8 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, chance: 0.2, durationTurns: 2 }] },
      // Lv3 弱体の発動率 20%→25%
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.8 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, chance: 0.25, durationTurns: 2 }] },
      // Lv4 ダメージ倍率 0.80倍→0.85倍
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.85 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, chance: 0.25, durationTurns: 2 }] },
      // Lv5 弱体の発動率 25%→30%
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.85 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, chance: 0.3, durationTurns: 2 }] },
    ],
  },
  skill2Variants:[
    {
      id: 'harpy_s2_a',
      name: '急降下',
      description: "ダメージ倍率 2.40倍。対象HP100%で最終ダメージ+30%。1回以上クリティカルしたら自身の行動ゲージ+40%",
      target: "SINGLE_ENEMY",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 2.4, fullHpBonus: 0.3 },
        { kind: "GAUGE", amount: 0.4, applyTo: "SELF", requires: "ANY_CRIT" },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 2.4, fullHpBonus: 0.3 }, { kind: "GAUGE", amount: 0.4, applyTo: "SELF", requires: "ANY_CRIT" }] },
        // Lv2 ダメージ倍率 2.40倍→2.65倍
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 2.65, fullHpBonus: 0.3 }, { kind: "GAUGE", amount: 0.4, applyTo: "SELF", requires: "ANY_CRIT" }] },
        // Lv3 ダメージ倍率 2.65倍→2.80倍
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 2.8, fullHpBonus: 0.3 }, { kind: "GAUGE", amount: 0.4, applyTo: "SELF", requires: "ANY_CRIT" }] },
        // Lv4 ダメージ倍率 2.80倍→3.00倍
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 3, fullHpBonus: 0.3 }, { kind: "GAUGE", amount: 0.4, applyTo: "SELF", requires: "ANY_CRIT" }] },
        // Lv5 クールタイム -1(3→2ターン)
        { cooldownTurns: 2, effects: [{ kind: "DAMAGE", multiplier: 3, fullHpBonus: 0.3 }, { kind: "GAUGE", amount: 0.4, applyTo: "SELF", requires: "ANY_CRIT" }] },
      ],
    },
    // 強化の量は共通値で固定。このスキルは効果量でしか伸びていなかったので、
    // いまはLv5のCT短縮だけが成長になる(**要検討として報告済み**)
    skill('harpy_s2_b','羽ばたき','SELF',4,[buff('atk')],[],{extraTurn:true}),
    {
      id: 'harpy_s2_c',
      name: 'ツインフェザー',
      description: "ダメージ倍率 0.70倍 × 2回。対象HP100%で最終ダメージ+25%。各ヒットごとに: 50%で速度-30% (2ターン)",
      target: "ALL_ENEMIES",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 0.7, hits: 2, fullHpBonus: 0.25, perHitEffects: [{ kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, chance: 0.5, durationTurns: 2 }] },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 0.7, hits: 2, fullHpBonus: 0.25, perHitEffects: [{ kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, chance: 0.5, durationTurns: 2 }] }] },
        // Lv2 ダメージ倍率 0.70倍→0.80倍
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 0.8, hits: 2, fullHpBonus: 0.25, perHitEffects: [{ kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, chance: 0.5, durationTurns: 2 }] }] },
        // Lv3 弱体の発動率 50%→60%
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 0.8, hits: 2, fullHpBonus: 0.25, perHitEffects: [{ kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, chance: 0.6, durationTurns: 2 }] }] },
        // Lv4 ダメージ倍率 0.80倍→0.85倍
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 0.85, hits: 2, fullHpBonus: 0.25, perHitEffects: [{ kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, chance: 0.6, durationTurns: 2 }] }] },
        // Lv5 クールタイム -1(3→2ターン)
        { cooldownTurns: 2, effects: [{ kind: "DAMAGE", multiplier: 0.85, hits: 2, fullHpBonus: 0.25, perHitEffects: [{ kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, chance: 0.6, durationTurns: 2 }] }] },
      ],
    },
  ],
  skill3Variants:[
    {
      id: 'harpy_s3_a',
      name: 'テンペスト',
      description: "ダメージ倍率 1.15倍 × 2回。各ヒットごとに: 60%で防御力-75% (2ターン)。このスキルで1体以上倒すと、このスキルのCTを全回復",
      target: "ALL_ENEMIES",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 1.15, hits: 2, perHitEffects: [{ kind: "DEBUFF", stat: "def", amount: DEF_DOWN, chance: 0.6, durationTurns: 2 }] },
      ],
      resetCooldownOnKill: true,
      levelOverrides: [
        // Lv1
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.15, hits: 2, perHitEffects: [{ kind: "DEBUFF", stat: "def", amount: DEF_DOWN, chance: 0.6, durationTurns: 2 }] }] },
        // Lv2 ダメージ倍率 1.15倍→1.30倍
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.3, hits: 2, perHitEffects: [{ kind: "DEBUFF", stat: "def", amount: DEF_DOWN, chance: 0.6, durationTurns: 2 }] }] },
        // Lv3 弱体の発動率 60%→70%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.3, hits: 2, perHitEffects: [{ kind: "DEBUFF", stat: "def", amount: DEF_DOWN, chance: 0.7, durationTurns: 2 }] }] },
        // Lv4 ダメージ倍率 1.30倍→1.40倍
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.4, hits: 2, perHitEffects: [{ kind: "DEBUFF", stat: "def", amount: DEF_DOWN, chance: 0.7, durationTurns: 2 }] }] },
        // Lv5 クールタイム -1(5→4ターン)
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.4, hits: 2, perHitEffects: [{ kind: "DEBUFF", stat: "def", amount: DEF_DOWN, chance: 0.7, durationTurns: 2 }] }] },
      ],
    },
    pass('harpy_s3_b','空の支配者',[0,1,2,3,4].map(i=>({kind:'SKY_RULER',atk:i>=3?.125:i>=1?.11:.1,critDmg:i>=4?.2:i>=2?.175:.15}))),
    {
      id: 'harpy_s3_c',
      name: '掃討',
      description: "60%で防御力-75% (1ターン)。ダメージ倍率 2.10倍 対象HP50%以下で最終ダメージ+30%。能力低下",
      target: "ALL_ENEMIES",
      cooldownTurns: 5,
      effects: [
        { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, chance: 0.6, durationTurns: 1 },
        { kind: "DAMAGE", multiplier: 2.1, targetHpBonus: [{ hpRatio: 0.5, bonus: 0.3 }] },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 5, effects: [{ kind: "DEBUFF", stat: "def", amount: DEF_DOWN, chance: 0.6, durationTurns: 1 }, { kind: "DAMAGE", multiplier: 2.1, targetHpBonus: [{ hpRatio: 0.5, bonus: 0.3 }] }] },
        // Lv2 ダメージ倍率 2.10倍→2.35倍
        { cooldownTurns: 5, effects: [{ kind: "DEBUFF", stat: "def", amount: DEF_DOWN, chance: 0.6, durationTurns: 1 }, { kind: "DAMAGE", multiplier: 2.35, targetHpBonus: [{ hpRatio: 0.5, bonus: 0.3 }] }] },
        // Lv3 弱体の発動率 60%→70%
        { cooldownTurns: 5, effects: [{ kind: "DEBUFF", stat: "def", amount: DEF_DOWN, chance: 0.7, durationTurns: 1 }, { kind: "DAMAGE", multiplier: 2.35, targetHpBonus: [{ hpRatio: 0.5, bonus: 0.3 }] }] },
        // Lv4 ダメージ倍率 2.35倍→2.55倍
        { cooldownTurns: 5, effects: [{ kind: "DEBUFF", stat: "def", amount: DEF_DOWN, chance: 0.7, durationTurns: 1 }, { kind: "DAMAGE", multiplier: 2.55, targetHpBonus: [{ hpRatio: 0.5, bonus: 0.3 }] }] },
        // Lv5 クールタイム -1(5→4ターン)
        { cooldownTurns: 4, effects: [{ kind: "DEBUFF", stat: "def", amount: DEF_DOWN, chance: 0.7, durationTurns: 1 }, { kind: "DAMAGE", multiplier: 2.55, targetHpBonus: [{ hpRatio: 0.5, bonus: 0.3 }] }] },
      ],
    },
  ],
  lightSkill3:{
    id: 'harpy_s3_light',
    name: 'セレスティアルストーム',
    description: "ダメージ倍率 1.35倍。味方全体の行動ゲージ+35%。与ダメージ+20%(2ターン)",
    target: "ALL_ENEMIES",
    cooldownTurns: 4,
    effects: [
      { kind: "DAMAGE", multiplier: 1.35 },
      { kind: "GAUGE", amount: 0.35, applyTo: "ALLIES" },
      { kind: "DAMAGE_BOOST", amount: 0.2, durationTurns: 2, applyTo: "ALLIES" },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.35 }, { kind: "GAUGE", amount: 0.35, applyTo: "ALLIES" }, { kind: "DAMAGE_BOOST", amount: 0.2, durationTurns: 2, applyTo: "ALLIES" }] },
      // Lv2 ダメージ倍率 1.35倍→1.50倍
      { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.5 }, { kind: "GAUGE", amount: 0.35, applyTo: "ALLIES" }, { kind: "DAMAGE_BOOST", amount: 0.2, durationTurns: 2, applyTo: "ALLIES" }] },
      // Lv3 与ダメージ増加 20%→25%
      { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.5 }, { kind: "GAUGE", amount: 0.35, applyTo: "ALLIES" }, { kind: "DAMAGE_BOOST", amount: 0.25, durationTurns: 2, applyTo: "ALLIES" }] },
      // Lv4 ダメージ倍率 1.50倍→1.65倍
      { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.65 }, { kind: "GAUGE", amount: 0.35, applyTo: "ALLIES" }, { kind: "DAMAGE_BOOST", amount: 0.25, durationTurns: 2, applyTo: "ALLIES" }] },
      // Lv5 クールタイム -1(4→3ターン)
      { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.65 }, { kind: "GAUGE", amount: 0.35, applyTo: "ALLIES" }, { kind: "DAMAGE_BOOST", amount: 0.25, durationTurns: 2, applyTo: "ALLIES" }] },
    ],
  },
  darkSkill3:{
    id: 'harpy_s3_dark',
    name: 'ブラックテンペスト',
    description: "ダメージ倍率 2.20倍 対象の弱体効果1個につき最終ダメージ+10%(最大+40%)",
    target: "ALL_ENEMIES",
    cooldownTurns: 5,
    effects: [
      { kind: "DAMAGE", multiplier: 2.2, debuffDamageBonus: { perDebuff: 0.1, maxBonus: 0.4 } },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.2, debuffDamageBonus: { perDebuff: 0.1, maxBonus: 0.4 } }] },
      // Lv2 ダメージ倍率 2.20倍→2.45倍
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.45, debuffDamageBonus: { perDebuff: 0.1, maxBonus: 0.4 } }] },
      // Lv3 ダメージ倍率 2.45倍→2.55倍
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.55, debuffDamageBonus: { perDebuff: 0.1, maxBonus: 0.4 } }] },
      // Lv4 ダメージ倍率 2.55倍→2.75倍
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.75, debuffDamageBonus: { perDebuff: 0.1, maxBonus: 0.4 } }] },
      // Lv5 クールタイム -1(5→4ターン)
      { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 2.75, debuffDamageBonus: { perDebuff: 0.1, maxBonus: 0.4 } }] },
    ],
  },
  skillAssignment:map([[0,2],[2,0],[1,2],[0,1],[1,0],[2,0]]),
};

export const PHOENIX: MonsterTemplate = {
  templateId:'phoenix',baseName:'フェニックス',role:'ヒーラー',emoji:'🔥',gachaStar:5,baseStats:stats(1750,108,105,102),
  /*
   * **フェニックスのHP比例は一律2倍ではなく、技ごとに決めた値を置く。**
   *
   * ヒーラーが自前のHPで殴る形なので、2倍にすると回復役のまま
   * 純アタッカーの火力帯に並んでしまう。S1は0.075、全体S2(炎の翼)は0.08で据え置き、
   * 攻撃S3(灼熱転生)だけ0.18まで伸ばす。
   *
   * **ここに書くのは定義値。**`power()` が段ごとに同じ倍率を比例係数にも掛けるので、
   * Lv5では S1 0.094 / 灼熱転生 0.216 になる(既存モンスターは係数が育たない作りで、
   * この一族だけ育つ)。数字を動かす時は、どちらの値を見ているかを取り違えないこと。
   */
  skill1:{
    id: 'phoenix_s1',
    name: '生命の火',
    description: "ダメージ倍率 0.70倍(最大HPの7.5%を加算)。対象の現在HP割合が高いほど最終ダメージ上昇(最大+30%)",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 0.7, hpCoefficient: 0.075, currentHpBonus: 0.3 },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.7, hpCoefficient: 0.075, currentHpBonus: 0.3 }] },
      // Lv2 ダメージ倍率 0.70倍→0.75倍 / 最大HP比例 7.5%→8%
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.75, hpCoefficient: 0.08, currentHpBonus: 0.3 }] },
      // Lv3 ダメージ倍率 0.75倍→0.80倍 / 最大HP比例 8%→8.5%
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.8, hpCoefficient: 0.085, currentHpBonus: 0.3 }] },
      // Lv4 ダメージ倍率 0.80倍→0.85倍 / 最大HP比例 8.5%→9%
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.85, hpCoefficient: 0.09, currentHpBonus: 0.3 }] },
      // Lv5 ダメージ倍率 0.85倍→0.90倍 / 最大HP比例 9%→9.5%
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.9, hpCoefficient: 0.095, currentHpBonus: 0.3 }] },
    ],
  },
  skill2Variants:[
    skill('phoenix_s2_a','癒しの炎','SINGLE_ALLY',3,[heal(.2),{kind:'CLEANSE',count:1},{kind:'IMMUNITY',durationTurns:1}],[set(0,{healRate:.22}),set(0,{healRate:.24}),set(1,{count:2})]),
    skill('phoenix_s2_b','命の火種','SINGLE_ALLY',3,[heal(.25),regen(.15,3),buff('spd')],[set(0,{healRate:.275}),set(0,{healRate:.3}),set(1,{healRate:.2})]),
    skill('phoenix_s2_c','炎の翼','ALL_ENEMIES',4,[d(.8,{hpCoefficient:.08}),block(.75),heal(.1,'ALLIES')],[power(1.1),set(1,{chance:.85}),set(2,{healRate:.12})]),
  ],
  skill3Variants:[
    skill('phoenix_s3_a','再生の炎','ALL_ALLIES',5,[heal(.15),buff('def'),regen(.15,2)],[set(0,{healRate:.17}),set(0,{healRate:.2}),set(2,{healRate:.2})]),
    skill('phoenix_s3_b','不死鳥の羽','ALL_ALLIES',5,[heal(.18),{kind:'CLEANSE',count:2},{kind:'IMMUNITY',durationTurns:2},gauge(.2)],[set(0,{healRate:.2}),set(0,{healRate:.22}),set(1,{count:3})]),
    {
      id: 'phoenix_s3_c',
      name: '灼熱転生',
      description: "ダメージ倍率 1.20倍(最大HPの18%を加算)。味方全体の攻撃力+30% (2ターン)。味方全体にシールド 自身の最大HPの15% (3ターン、ダメージを肩代わり)。能力上昇",
      target: "ALL_ENEMIES",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 1.2, hpCoefficient: 0.18 },
        { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2, applyTo: "ALLIES" },
        { kind: "SHIELD", shieldRate: 0.15, durationTurns: 3, fromSourceHp: true, applyTo: "ALLIES" },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.2, hpCoefficient: 0.18 }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2, applyTo: "ALLIES" }, { kind: "SHIELD", shieldRate: 0.15, durationTurns: 3, fromSourceHp: true, applyTo: "ALLIES" }] },
        // Lv2 ダメージ倍率 1.20倍→1.35倍 / 最大HP比例 18%→20%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.35, hpCoefficient: 0.2 }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2, applyTo: "ALLIES" }, { kind: "SHIELD", shieldRate: 0.15, durationTurns: 3, fromSourceHp: true, applyTo: "ALLIES" }] },
        // Lv3 シールド量 15%→18%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.35, hpCoefficient: 0.2 }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2, applyTo: "ALLIES" }, { kind: "SHIELD", shieldRate: 0.18, durationTurns: 3, fromSourceHp: true, applyTo: "ALLIES" }] },
        // Lv4 ダメージ倍率 1.35倍→1.45倍 / 最大HP比例 20%→22%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.45, hpCoefficient: 0.22 }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2, applyTo: "ALLIES" }, { kind: "SHIELD", shieldRate: 0.18, durationTurns: 3, fromSourceHp: true, applyTo: "ALLIES" }] },
        // Lv5 クールタイム -1(5→4ターン)
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.45, hpCoefficient: 0.22 }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2, applyTo: "ALLIES" }, { kind: "SHIELD", shieldRate: 0.18, durationTurns: 3, fromSourceHp: true, applyTo: "ALLIES" }] },
      ],
    },
    skill('phoenix_s3_electric','雷光再生','ALL_ALLIES',5,[heal(.18),gauge(.25),buff('spd'),{kind:'CLEANSE',count:1}],[set(0,{healRate:.2}),set(0,{healRate:.22}),set(1,{amount:.3})]),
  ],
  lightSkill3:{
    id: 'phoenix_s3_light',
    name: '輪廻の聖炎',
    description: "無敵 (3ターン)。継続回復 最大HPの15.0% (2ターン、自身のターン開始時)",
    target: "SINGLE_ALLY",
    cooldownTurns: 8,
    effects: [
      { kind: "STATUS", status: "INVINCIBLE", durationTurns: 3 },
      { kind: "REGEN", healRate: 0.15, durationTurns: 2 },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 8, effects: [{ kind: "STATUS", status: "INVINCIBLE", durationTurns: 3 }, { kind: "REGEN", healRate: 0.15, durationTurns: 2 }] },
      // Lv2 回復量 15%→18%
      { cooldownTurns: 8, effects: [{ kind: "STATUS", status: "INVINCIBLE", durationTurns: 3 }, { kind: "REGEN", healRate: 0.18, durationTurns: 2 }] },
      // Lv3 回復量 18%→20%
      { cooldownTurns: 8, effects: [{ kind: "STATUS", status: "INVINCIBLE", durationTurns: 3 }, { kind: "REGEN", healRate: 0.2, durationTurns: 2 }] },
      // Lv4 継続回復の持続 2→3ターン
      { cooldownTurns: 8, effects: [{ kind: "STATUS", status: "INVINCIBLE", durationTurns: 3 }, { kind: "REGEN", healRate: 0.2, durationTurns: 3 }] },
      // Lv5 クールタイム -1(8→7ターン)
      { cooldownTurns: 7, effects: [{ kind: "STATUS", status: "INVINCIBLE", durationTurns: 3 }, { kind: "REGEN", healRate: 0.2, durationTurns: 3 }] },
    ],
  },
  darkSkill3:pass('phoenix_s3_dark','輪廻転生',[{ kind: "REBIRTH", heal: 0.08, damage: 0.5, cooldown: 9 }, { kind: "REBIRTH", heal: 0.1, damage: 0.5, cooldown: 9 }, { kind: "REBIRTH", heal: 0.1, damage: 0.55, cooldown: 9 }, { kind: "REBIRTH", heal: 0.1, damage: 0.55, cooldown: 9 }, { kind: "REBIRTH", heal: 0.1, damage: 0.55, cooldown: 8 }]),
  skillAssignment:map([[2,2],[0,1],[0,3],[1,0],[0,0],[2,0]]),
};

export const JOKER: MonsterTemplate = {
  templateId:'joker',baseName:'ジョーカー',role:'デバッファー',emoji:'🃏',gachaStar:5,baseStats:stats(1450,145,100,108),
  skill1:{
    id: 'joker_s1',
    name: '呪いの札',
    description: "ダメージ倍率 1.10倍。50%でスキル使用不可 (1ターン)。30%で呪い1個(対象の2回目のターン開始時、付与時攻撃力×4の固定ダメージと1ターンスタン)",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 1.1 },
      { kind: "STATUS", status: "SKILL_LOCK", durationTurns: 1, chance: 0.5 },
      { kind: "CURSE", chance: 0.3 },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.1 }, { kind: "STATUS", status: "SKILL_LOCK", durationTurns: 1, chance: 0.5 }, { kind: "CURSE", chance: 0.3 }] },
      // Lv2 ダメージ倍率 1.10倍→1.20倍
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.2 }, { kind: "STATUS", status: "SKILL_LOCK", durationTurns: 1, chance: 0.5 }, { kind: "CURSE", chance: 0.3 }] },
      // Lv3 ダメージ倍率 1.20倍→1.30倍 / 発動率 50%→60%
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.3 }, { kind: "STATUS", status: "SKILL_LOCK", durationTurns: 1, chance: 0.6 }, { kind: "CURSE", chance: 0.3 }] },
      // Lv4 ダメージ倍率 1.30倍→1.40倍 / 発動率 30%→40%
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.4 }, { kind: "STATUS", status: "SKILL_LOCK", durationTurns: 1, chance: 0.6 }, { kind: "CURSE", chance: 0.4 }] },
      // Lv5 ダメージ倍率 1.40倍→1.50倍 / 発動率 60%→70%
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.5 }, { kind: "STATUS", status: "SKILL_LOCK", durationTurns: 1, chance: 0.7 }, { kind: "CURSE", chance: 0.4 }] },
    ],
  },
  skill2Variants:[
    {
      id: 'joker_s2_a',
      name: '悪魔の囁き',
      description: "ダメージ倍率 1.50倍。70%で攻撃力-50% (2ターン)。70%で防御力-75% (2ターン)。70%で治癒阻害 (2ターン、回復を受けられない)。能力低下",
      target: "SINGLE_ENEMY",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 1.5 },
        { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, chance: 0.7, durationTurns: 2 },
        { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, chance: 0.7, durationTurns: 2 },
        { kind: "HEAL_BLOCK", chance: 0.7, durationTurns: 2 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.5 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, chance: 0.7, durationTurns: 2 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, chance: 0.7, durationTurns: 2 }, { kind: "HEAL_BLOCK", chance: 0.7, durationTurns: 2 }] },
        // Lv2 ダメージ倍率 1.50倍→1.60倍
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.6 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, chance: 0.7, durationTurns: 2 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, chance: 0.7, durationTurns: 2 }, { kind: "HEAL_BLOCK", chance: 0.7, durationTurns: 2 }] },
        // Lv3 ダメージ倍率 1.60倍→1.70倍 / 弱体の発動率 70%→80% / 治癒阻害の発動率 70%→80%
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.7 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, chance: 0.8, durationTurns: 2 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, chance: 0.8, durationTurns: 2 }, { kind: "HEAL_BLOCK", chance: 0.8, durationTurns: 2 }] },
        // Lv4 ダメージ倍率 1.70倍→1.80倍 / 弱体の発動率 80%→90% / 治癒阻害の発動率 80%→90%
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.8 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, chance: 0.9, durationTurns: 2 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, chance: 0.9, durationTurns: 2 }, { kind: "HEAL_BLOCK", chance: 0.9, durationTurns: 2 }] },
        // Lv5 クールタイム -1(3→2ターン)
        { cooldownTurns: 2, effects: [{ kind: "DAMAGE", multiplier: 1.8 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, chance: 0.9, durationTurns: 2 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, chance: 0.9, durationTurns: 2 }, { kind: "HEAL_BLOCK", chance: 0.9, durationTurns: 2 }] },
      ],
    },
    {
      id: 'joker_s2_b',
      name: '最低なイタズラ',
      description: "ダメージ倍率 1.20倍。対象の呪いをすべて即時発動。使用後、即時に追加ターンを獲得",
      target: "SINGLE_ENEMY",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 1.2 },
        { kind: "DETONATE_CURSES" },
      ],
      extraTurn: true,
      targetPriority: "CURSED",
      levelOverrides: [
        // Lv1
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.2 }, { kind: "DETONATE_CURSES" }] },
        // Lv2 ダメージ倍率 1.20倍→1.30倍
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.3 }, { kind: "DETONATE_CURSES" }] },
        // Lv3 ダメージ倍率 1.30倍→1.40倍
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.4 }, { kind: "DETONATE_CURSES" }] },
        // Lv4 ダメージ倍率 1.40倍→1.50倍
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.5 }, { kind: "DETONATE_CURSES" }] },
        // Lv5 クールタイム -1(4→3ターン)
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.5 }, { kind: "DETONATE_CURSES" }] },
      ],
    },
    {
      id: 'joker_s2_c',
      name: '悪意の振り撒き',
      description: "70%で呪い1個(対象の2回目のターン開始時、付与時攻撃力×4の固定ダメージと1ターンスタン)。70%で暗闇 (2ターン、攻撃時50%でダメージ-75%・追加効果なし)。60%で行動ゲージ-25%",
      target: "ALL_ENEMIES",
      cooldownTurns: 4,
      effects: [
        { kind: "CURSE", chance: 0.7 },
        { kind: "BLIND", chance: 0.7, durationTurns: 2 },
        { kind: "GAUGE", amount: -0.25, chance: 0.6 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 4, effects: [{ kind: "CURSE", chance: 0.7 }, { kind: "BLIND", chance: 0.7, durationTurns: 2 }, { kind: "GAUGE", amount: -0.25, chance: 0.6 }] },
        // Lv2 発動率 70%→80%
        { cooldownTurns: 4, effects: [{ kind: "CURSE", chance: 0.8 }, { kind: "BLIND", chance: 0.7, durationTurns: 2 }, { kind: "GAUGE", amount: -0.25, chance: 0.6 }] },
        // Lv3 暗闇の発動率 70%→80% / 行動ゲージの発動率 60%→70%
        { cooldownTurns: 4, effects: [{ kind: "CURSE", chance: 0.8 }, { kind: "BLIND", chance: 0.8, durationTurns: 2 }, { kind: "GAUGE", amount: -0.25, chance: 0.7 }] },
        // Lv4 発動率 80%→90%
        { cooldownTurns: 4, effects: [{ kind: "CURSE", chance: 0.9 }, { kind: "BLIND", chance: 0.8, durationTurns: 2 }, { kind: "GAUGE", amount: -0.25, chance: 0.7 }] },
        // Lv5 クールタイム -1(4→3ターン) / 暗闇の発動率 80%→90% / 行動ゲージの発動率 70%→80%
        { cooldownTurns: 3, effects: [{ kind: "CURSE", chance: 0.9 }, { kind: "BLIND", chance: 0.9, durationTurns: 2 }, { kind: "GAUGE", amount: -0.25, chance: 0.8 }] },
      ],
    },
  ],
  skill3Variants:[
    pass('joker_s3_a','バトルイリュージョン',[{ kind: "ILLUSION", damage: 0.8, chance: 0.5 }, { kind: "ILLUSION", damage: 0.9, chance: 0.5 }, { kind: "ILLUSION", damage: 0.9, chance: 0.55 }, { kind: "ILLUSION", damage: 1, chance: 0.55 }, { kind: "ILLUSION", damage: 1, chance: 0.6 }]),
    skill('joker_s3_b','ショータイム','ALL_ENEMIES',6,[{kind:'STRIP',chance:1},deb('def',.8)],[set(1,{chance:.85}),set(1,{chance:.9}),set(1,{chance:1})]),
    {
      id: 'joker_s3_c',
      name: 'ナイフジャグリング',
      description: "ダメージ倍率 0.75倍 × 4回。各ヒットごとに: 25%で治癒阻害 (2ターン、回復を受けられない)、25%で強化不可 (2ターン)、25%で毒1スタック (1スタックにつき最大HPの5%、最大5スタック、2ターン)",
      target: "SINGLE_ENEMY",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 0.75, hits: 4, perHitEffects: [{ kind: "HEAL_BLOCK", chance: 0.25, durationTurns: 2 }, { kind: "STATUS", status: "BUFF_BLOCK", durationTurns: 2, chance: 0.25 }, { kind: "POISON", chance: 0.25, durationTurns: 2, damageRatePerStack: 0.05 }] },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 0.75, hits: 4, perHitEffects: [{ kind: "HEAL_BLOCK", chance: 0.25, durationTurns: 2 }, { kind: "STATUS", status: "BUFF_BLOCK", durationTurns: 2, chance: 0.25 }, { kind: "POISON", chance: 0.25, durationTurns: 2, damageRatePerStack: 0.05 }] }] },
        // Lv2 ダメージ倍率 0.75倍→0.80倍
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 0.8, hits: 4, perHitEffects: [{ kind: "HEAL_BLOCK", chance: 0.25, durationTurns: 2 }, { kind: "STATUS", status: "BUFF_BLOCK", durationTurns: 2, chance: 0.25 }, { kind: "POISON", chance: 0.25, durationTurns: 2, damageRatePerStack: 0.05 }] }] },
        // Lv3 ダメージ倍率 0.80倍→0.85倍 / 治癒阻害の発動率 25%→30% / 発動率 25%→30% / 毒の発動率 25%→30%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 0.85, hits: 4, perHitEffects: [{ kind: "HEAL_BLOCK", chance: 0.3, durationTurns: 2 }, { kind: "STATUS", status: "BUFF_BLOCK", durationTurns: 2, chance: 0.3 }, { kind: "POISON", chance: 0.3, durationTurns: 2, damageRatePerStack: 0.05 }] }] },
        // Lv4 ダメージ倍率 0.85倍→0.90倍 / 治癒阻害の発動率 30%→35% / 発動率 30%→35% / 毒の発動率 30%→35%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 0.9, hits: 4, perHitEffects: [{ kind: "HEAL_BLOCK", chance: 0.35, durationTurns: 2 }, { kind: "STATUS", status: "BUFF_BLOCK", durationTurns: 2, chance: 0.35 }, { kind: "POISON", chance: 0.35, durationTurns: 2, damageRatePerStack: 0.05 }] }] },
        // Lv5 クールタイム -1(5→4ターン)
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 0.9, hits: 4, perHitEffects: [{ kind: "HEAL_BLOCK", chance: 0.35, durationTurns: 2 }, { kind: "STATUS", status: "BUFF_BLOCK", durationTurns: 2, chance: 0.35 }, { kind: "POISON", chance: 0.35, durationTurns: 2, damageRatePerStack: 0.05 }] }] },
      ],
    },
  ],
  lightSkill3:pass('joker_s3_light','イカサマ',[.3,.35,.4,.45,.5].map(reduction=>({kind:'CHEAT',reduction}))),
  darkSkill3:{
    id: 'joker_s3_dark',
    name: '反転の儀式',
    description: "ダメージ倍率 1.70倍。85%で対象の強化をすべて呪いへ変換。成功時1ターンスタン",
    target: "ALL_ENEMIES",
    cooldownTurns: 6,
    effects: [
      { kind: "DAMAGE", multiplier: 1.7 },
      { kind: "CONVERT_CURSES", chance: 0.85 },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 6, effects: [{ kind: "DAMAGE", multiplier: 1.7 }, { kind: "CONVERT_CURSES", chance: 0.85 }] },
      // Lv2 ダメージ倍率 1.70倍→1.90倍
      { cooldownTurns: 6, effects: [{ kind: "DAMAGE", multiplier: 1.9 }, { kind: "CONVERT_CURSES", chance: 0.85 }] },
      // Lv3 発動率 85%→90%
      { cooldownTurns: 6, effects: [{ kind: "DAMAGE", multiplier: 1.9 }, { kind: "CONVERT_CURSES", chance: 0.9 }] },
      // Lv4 ダメージ倍率 1.90倍→2.10倍
      { cooldownTurns: 6, effects: [{ kind: "DAMAGE", multiplier: 2.1 }, { kind: "CONVERT_CURSES", chance: 0.9 }] },
      // Lv5 クールタイム -1(6→5ターン)
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.1 }, { kind: "CONVERT_CURSES", chance: 0.9 }] },
    ],
  },
  skillAssignment:map([[0,2],[2,1],[1,0],[2,2],[0,0],[1,0]]),
};
export const FOUR_SPECIES = [SCORPION,HARPY,PHOENIX,JOKER];
