import fs from "node:fs";

const enginePath = "src/battle/engine.ts";
let text = fs.readFileSync(enginePath, "utf8");

function replaceOnce(before, after, label) {
  const count = text.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 match, got ${count}`);
  text = text.replace(before, after);
}

replaceOnce(
  'import { EffectApplyTo, EffectCondition, STATUS_EFFECT_CATEGORY, STATUS_EFFECT_JA, Skill, SkillEffect } from "../core/skill.js";\n',
  'import { EffectApplyTo, EffectCondition, STATUS_EFFECT_CATEGORY, STATUS_EFFECT_JA, Skill, SkillEffect } from "../core/skill.js";\nimport {\n  TOWER70_BOSS_REGEN,\n  TOWER70_LIFE_REGEN_BONUS,\n  TOWER70_PULSE_CRUSH_RATIO,\n  TOWER70_ROAR_DEF_DOWN,\n  TOWER70_ROAR_DEF_DOWN_TURNS,\n  TOWER70_ROAR_GAUGE_DOWN,\n  TOWER70_ROAR_HP_COEFFICIENT,\n  TOWER70_ROAR_MULTIPLIER,\n  TOWER70_ROAR_THRESHOLDS,\n} from "../data/trialTowerFloor70.js";\n',
  "tower70 imports",
);

replaceOnce(
  '  private trialBossTurns = 0;\n',
  '  private trialBossTurns = 0;\n  /** 70階「始祖の咆哮」を既に発動したHP閾値。回復して跨ぎ直しても再発動しない。 */\n  private readonly tower70RoaredThresholds = new Set<number>();\n',
  "tower70 roar state",
);

replaceOnce(
  '  private onUnitActed(actor: BattleUnit): void {\n    const extraTurnChance = Math.max(actor.def.combatMods?.extraTurnChance ?? 0, actor.def.bossTraits?.extraTurnChance ?? 0);\n',
  '  private onUnitActed(actor: BattleUnit): void {\n    // 70階の再生は「始祖ベヒモス自身が実際に行動した手番の終了時」だけ。\n    // スタンで行動できなかった時や、取り巻きの手番では進めない。\n    if (this.isTower70Boss(actor)) this.applyTower70BossRegen(actor);\n\n    const extraTurnChance = Math.max(actor.def.combatMods?.extraTurnChance ?? 0, actor.def.bossTraits?.extraTurnChance ?? 0);\n',
  "tower70 turn-end regen hook",
);

replaceOnce(
  '  private trialBoss(): BattleUnit | undefined {\n    return this.units.find((u) => u.team === "ENEMY" && u.def.victoryTarget);\n  }\n\n',
  `  private trialBoss(): BattleUnit | undefined {\n    return this.units.find((u) => u.team === "ENEMY" && u.def.victoryTarget);\n  }\n\n  private isTower70Boss(unit: BattleUnit): boolean {\n    return this.trialTowerFloor === 70 && unit === this.trialBoss();\n  }\n\n  /** 70階のHP帯強化。段階は加算ではなく置き換え。 */\n  private tower70Tier(unit: BattleUnit): { atk: number; spd: number; hpFactor: number } {\n    const ratio = hpRatio(unit);\n    if (ratio <= 0.30) return { atk: 1500, spd: 45, hpFactor: 2.50 };\n    if (ratio <= 0.50) return { atk: 1000, spd: 25, hpFactor: 1.60 };\n    if (ratio <= 0.70) return { atk: 500, spd: 10, hpFactor: 1.30 };\n    return { atk: 0, spd: 0, hpFactor: 1 };\n  }\n\n  private syncTower70BossTier(unit: BattleUnit): void {\n    if (!this.isTower70Boss(unit) || !unit.alive) return;\n    const tier = this.tower70Tier(unit);\n    unit.flatStatBonus.atk = tier.atk;\n    unit.flatStatBonus.spd = tier.spd;\n  }\n\n  private tower70HpCoefficientFactor(unit: BattleUnit): number {\n    return this.isTower70Boss(unit) ? this.tower70Tier(unit).hpFactor : 1;\n  }\n\n  private applyTower70BossRegen(boss: BattleUnit): void {\n    if (!boss.alive) return;\n    const lifeAlive = this.units.some((unit) => unit.team === "ENEMY" && unit.alive && unit.def.name === "古代の生命晶");\n    const rate = TOWER70_BOSS_REGEN + (lifeAlive ? TOWER70_LIFE_REGEN_BONUS : 0);\n    const before = boss.currentHp;\n    const healed = applyHeal(boss, Math.round(boss.maxHp * rate));\n    if (healed > 0) {\n      this.push(\`\${this.label(boss)} の「不滅の巨獣」でHPが \${healed} 回復！ (\${boss.currentHp}/\${boss.maxHp})\`);\n      this.pushEvent({ targetId: boss.instanceId, kind: "HEAL", amount: healed });\n    } else if (before < boss.maxHp && boss.healBlockTurns > 0) {\n      this.push(\`\${this.label(boss)} の再生は回復阻害で封じられた！\`);\n    }\n    this.syncTower70BossTier(boss);\n  }\n\n  /** 脈動晶S2。通常ダメージではなく、現在HPの実数上位3体をその場で半分にする。 */\n  private applyTower70PulseCrush(): void {\n    const ranked = this.units\n      .map((unit, slot) => ({ unit, slot }))\n      .filter(({ unit }) => unit.team === "PLAYER" && unit.alive)\n      .sort((a, b) => b.unit.currentHp - a.unit.currentHp || a.slot - b.slot)\n      .slice(0, 3);\n    for (const { unit } of ranked) {\n      const before = unit.currentHp;\n      unit.currentHp = Math.max(1, Math.floor(unit.currentHp * TOWER70_PULSE_CRUSH_RATIO));\n      const removed = before - unit.currentHp;\n      this.push(\`  → \${this.label(unit)} の命脈が断たれ、現在HPが半減！ (\${unit.currentHp}/\${unit.maxHp})\`);\n      if (removed > 0) this.pushEvent({ targetId: unit.instanceId, kind: "DAMAGE", amount: removed });\n    }\n  }\n\n  /** 始祖ベヒモスのHPが減った直後に段階更新と75/50/25%咆哮を処理する。 */\n  private afterTower70BossHpChanged(boss: BattleUnit): void {\n    if (!this.isTower70Boss(boss) || !boss.alive) return;\n    this.syncTower70BossTier(boss);\n    for (const threshold of TOWER70_ROAR_THRESHOLDS) {\n      if (hpRatio(boss) > threshold || this.tower70RoaredThresholds.has(threshold)) continue;\n      this.tower70RoaredThresholds.add(threshold);\n      this.push(\`\${this.label(boss)} の「始祖の咆哮」！\`);\n      const targets = this.units.filter((unit) => unit.team === "PLAYER" && unit.alive);\n      for (const target of targets) {\n        const result = calcDamage(boss, target, {\n          kind: "DAMAGE",\n          multiplier: TOWER70_ROAR_MULTIPLIER,\n          hpCoefficient: TOWER70_ROAR_HP_COEFFICIENT,\n        }, this.rng);\n        // 咆哮は割り込み攻撃。通常攻撃への反撃・反射を再帰的に呼ばない。\n        const applied = this.applyIncomingDamage(target, result.damage, boss, "reflect");\n        this.push(\`  → \${this.label(target)} に \${applied.hpDamage} ダメージ！ (残りHP \${target.currentHp}/\${target.maxHp})\`);\n        this.pushEvent({ targetId: target.instanceId, kind: "DAMAGE", amount: applied.hpDamage, isCrit: result.isCrit });\n        target.gauge = Math.max(0, target.gauge - TOWER70_ROAR_GAUGE_DOWN * ATB_THRESHOLD);\n        target.effects.push({\n          kind: "DEBUFF",\n          stat: "def",\n          amount: -TOWER70_ROAR_DEF_DOWN,\n          remainingTurns: TOWER70_ROAR_DEF_DOWN_TURNS,\n        });\n      }\n    }\n  }\n\n`,
  "tower70 helpers",
);

replaceOnce(
  '    const ratio = hpRatio(unit);\n    const healing = this.trialTowerFloor === 70 || (this.trialTowerFloor === 100 && ratio >= 0.7);\n',
  '    const ratio = hpRatio(unit);\n    if (this.trialTowerFloor === 70) {\n      // 旧実装の「毎手番72%超再生」は廃止。V7確定仕様は行動終了時3%（生命晶生存中は7%）。\n      this.syncTower70BossTier(unit);\n      return;\n    }\n    const healing = this.trialTowerFloor === 100 && ratio >= 0.7;\n',
  "remove legacy 70 heal",
);

replaceOnce(
  '    let resolvedSkill = this.applyChargeToSkill(latent ? this.applyLatentToSkill(skill, latent) : skill, charge);\n',
  `    let resolvedSkill = this.applyChargeToSkill(latent ? this.applyLatentToSkill(skill, latent) : skill, charge);\n    // 70階はHPが減るほど「HP比例部分だけ」が30%/60%/150%強くなる。\n    // 咆哮はここを通らないので、咆哮の最大HP5%は常に固定。\n    if (this.isTower70Boss(unit)) {\n      this.syncTower70BossTier(unit);\n      const hpFactor = this.tower70HpCoefficientFactor(unit);\n      if (hpFactor !== 1) {\n        resolvedSkill = {\n          ...resolvedSkill,\n          effects: resolvedSkill.effects.map((effect) => effect.kind === "DAMAGE" && effect.hpCoefficient !== undefined\n            ? { ...effect, hpCoefficient: effect.hpCoefficient * hpFactor }\n            : effect),\n        };\n      }\n    }\n    const tower70BossS3AboveHalf = this.isTower70Boss(unit)\n      && skill.id === "tower70_behemoth_s3"\n      && hpRatio(unit) >= 0.5;\n`,
  "tower70 hp coefficient",
);

replaceOnce(
  '    this.push(`${this.label(unit)} の「${skill.name}」！`);\n\n    // 暗闇がかかっていると、攻撃するたびに外れ判定が入る。\n',
  '    this.push(`${this.label(unit)} の「${skill.name}」！`);\n\n    if (this.trialTowerFloor === 70 && unit.team === "ENEMY" && skill.id === "tower70_pulse_s2") {\n      this.applyTower70PulseCrush();\n      return;\n    }\n\n    // 暗闇がかかっていると、攻撃するたびに外れ判定が入る。\n',
  "pulse crush intercept",
);

replaceOnce(
  '    targets.forEach((target, i) => {\n      const targetSkill = aoeConverted && latent?.aoeConversion ? { ...resolvedSkill, effects: resolvedSkill.effects\n',
  '    targets.forEach((target, i) => {\n      const targetSkill = aoeConverted && latent?.aoeConversion ? { ...resolvedSkill, effects: resolvedSkill.effects\n',
  "targets anchor",
);

replaceOnce(
  '    });\n    for (const target of new Set(targets)) {\n      if (target.currentHp < (hpBeforeSkill.get(target.instanceId) ?? target.currentHp)) this.tryThresholdHeals(target);\n    }\n',
  `    });\n\n    if (this.isTower70Boss(unit) && skill.id === "tower70_behemoth_s3") {\n      const removed = cleanseDebuffs(unit);\n      if (removed > 0) this.push(\`  → \${this.label(unit)} は自身の弱体効果をすべて解除した！\`);\n      if (tower70BossS3AboveHalf) {\n        for (const enemy of this.units.filter((candidate) => candidate.team === "PLAYER" && candidate.alive)) {\n          enemy.gauge = Math.max(0, enemy.gauge - 0.2 * ATB_THRESHOLD);\n        }\n        this.push("  → 天地崩壊で味方全体の行動ゲージが20%後退した！");\n      }\n    }\n\n    for (const target of new Set(targets)) {\n      if (target.currentHp < (hpBeforeSkill.get(target.instanceId) ?? target.currentHp)) this.tryThresholdHeals(target);\n    }\n`,
  "tower70 s3 aftermath",
);

replaceOnce(
  '    applyDamage(unit, burnDamage);\n    this.push(`  → ${this.label(unit)} は火傷でダメージを受けた！ ${burnDamage} (残りHP ${unit.currentHp}/${unit.maxHp})`);\n',
  '    applyDamage(unit, burnDamage);\n    if (this.isTower70Boss(unit)) this.afterTower70BossHpChanged(unit);\n    this.push(`  → ${this.label(unit)} は火傷でダメージを受けた！ ${burnDamage} (残りHP ${unit.currentHp}/${unit.maxHp})`);\n',
  "burn roar hook",
);

replaceOnce(
  '    applyDamage(unit, poisonDamage);\n    this.push(`  → ${this.label(unit)} は毒(${stacks}スタック)でダメージを受けた！ ${poisonDamage} (残りHP ${unit.currentHp}/${unit.maxHp})`);\n',
  '    applyDamage(unit, poisonDamage);\n    if (this.isTower70Boss(unit)) this.afterTower70BossHpChanged(unit);\n    this.push(`  → ${this.label(unit)} は毒(${stacks}スタック)でダメージを受けた！ ${poisonDamage} (残りHP ${unit.currentHp}/${unit.maxHp})`);\n',
  "poison roar hook",
);

replaceOnce(
  '    const applied = applyDamage(target, incoming);\n    if (applied.invincible) this.push(`  → ${this.label(target)} は無敵でダメージを無効化した！`);\n',
  '    const applied = applyDamage(target, incoming);\n    if (this.isTower70Boss(target) && target.alive && applied.hpDamage > 0) this.afterTower70BossHpChanged(target);\n    if (applied.invincible) this.push(`  → ${this.label(target)} は無敵でダメージを無効化した！`);\n',
  "normal damage roar hook",
);

// 回復阻害はゲーム全体で「回復量低下」ではなく完全な回復不能に統一する。
text = text.replaceAll('target.healBlockMultiplier = Math.min(target.healBlockMultiplier, effect.healMultiplier);', 'target.healBlockMultiplier = 0;');
text = text.replaceAll('primary.healBlockMultiplier = Math.min(primary.healBlockMultiplier, 0.5);', 'primary.healBlockMultiplier = 0;');
text = text.replaceAll('receiver.healBlockMultiplier = Math.min(receiver.healBlockMultiplier, 0.5);', 'receiver.healBlockMultiplier = 0;');

fs.writeFileSync(enginePath, text);

// trialTower.ts の簡略化時に残った未使用importを落とす。
const towerPath = "src/data/trialTower.ts";
let tower = fs.readFileSync(towerPath, "utf8");
tower = tower.replace('import { STAR_MAX_LEVEL, Star, levelMultiplier, starMultiplier } from "../core/rarity.js";', 'import { Star, levelMultiplier, starMultiplier } from "../core/rarity.js";');
fs.writeFileSync(towerPath, tower);

// 既知のCI赤（RESULT-v3末尾の余分な空行）も、この確定作業で解消する。
const resultPath = "tools/battleLab/tower70/RESULT-v3.md";
if (fs.existsSync(resultPath)) {
  const result = fs.readFileSync(resultPath, "utf8").replace(/\n+$/u, "\n");
  fs.writeFileSync(resultPath, result);
}
