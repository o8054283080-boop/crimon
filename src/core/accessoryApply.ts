/**
 * アクセサリーを戦闘用の定義へ着ける。**`toBattleDefinition` の最後の段。**
 *
 * ## 適用順
 *
 *   1. 装備・才能まで載った最終値へ、**メインの実数を足す**
 *   2. そこへ**最大HP増加・防御力増加(特殊・弱)を割合で掛ける**
 *   3. 定義の段階で決まる効果を焼き込む
 *        ターン開始回復・開幕シールド … 体力セット・障壁セットと同じ口へ足す
 *        シールド量UP             … `shieldMultiplier` へ掛ける(張る側の補正)
 *        弱体付与率UP             … `debuffChanceBonus` へ足す(抵抗の判定は通る)
 *        S1/S2/S3の付与率UP        … その枠の、敵へ掛ける確率付きの効果へ足す
 *        回復量UP                 … その個体の回復・継続回復・回復パッシブの値へ掛ける
 *   4. 戦闘中に見張る効果は `def.accessory` に載せ、エンジン(`accessoryRuntime.ts`)が拾う
 *
 * 2 を最終値へ掛けるのは、検証(本番前のアクセサリー最終検証)で測った形と同じにするため。
 */
import {
  type Accessory, type AccessoryBattleEffects,
  accessoryBattleEffects, accessoryMainValue, hasRuntimeAccessoryEffects,
} from "./accessory.js";
import { DEFAULT_COMBAT_MODIFIERS } from "./equipment.js";
import type { MonsterDefinition } from "./monster.js";
import { STATUS_EFFECT_CATEGORY, type Skill, type SkillEffect } from "./skill.js";

/** 敵へ掛ける、抵抗判定を通る効果の種類 */
const ENEMY_ROLL_KINDS = new Set([
  "DEBUFF", "STUN", "STRIP", "STEAL_BUFF", "HEAL_BLOCK", "POISON", "BURN", "BLIND",
  "COOLDOWN_EXTEND", "CURSE", "CONVERT_CURSES",
]);

/** その効果が「敵へ掛ける弱体(か解除)で、発動率が書かれているもの」か。**ゲージ減少は含めない** */
function isEnemyRollEffect(skill: Skill, effect: SkillEffect): boolean {
  const onEnemy = skill.target === "ALL_ENEMIES" || skill.target === "SINGLE_ENEMY";
  const applyTo = (effect as { applyTo?: string }).applyTo;
  if (!onEnemy || applyTo === "ALLIES" || applyTo === "SELF" || applyTo === "LOWEST_HP_ALLY") return false;
  if ((effect as { chance?: number }).chance === undefined) return false;
  if ((effect as { ignoreResistance?: boolean }).ignoreResistance) return false;
  if (ENEMY_ROLL_KINDS.has(effect.kind)) return true;
  if (effect.kind === "STATUS") return STATUS_EFFECT_CATEGORY[effect.status] === "DEBUFF";
  return false;
}

function mapEffects(effects: readonly SkillEffect[], f: (e: SkillEffect) => SkillEffect): SkillEffect[] {
  return effects.map((e) => {
    const next = f(e);
    if (next.kind === "DAMAGE" && next.perHitEffects) return { ...next, perHitEffects: mapEffects(next.perHitEffects, f) };
    return next;
  });
}

const PASSIVE_HEAL_FIELDS = ["healOnAct", "heal", "healOnTurn"] as const;

function applySkillBonuses(skills: MonsterDefinition["skills"], effects: AccessoryBattleEffects): MonsterDefinition["skills"] {
  const heal = effects.healUp;
  const slotRate = [effects.s1Rate, effects.s2Rate, effects.s3Rate];
  return skills.map((skill, slot) => {
    if (!skill) return skill;
    const rateAdd = slotRate[slot] ?? 0;
    let changed = false;
    const mapped = mapEffects(skill.effects, (e) => {
      let next = e;
      if ((e.kind === "HEAL" || e.kind === "REGEN") && heal > 0) {
        next = { ...next, healRate: (next as { healRate: number }).healRate * (1 + heal) } as SkillEffect;
        changed = true;
      }
      if (rateAdd > 0 && isEnemyRollEffect(skill, e)) {
        next = { ...next, chance: Math.min(1, (e as { chance: number }).chance + rateAdd) } as SkillEffect;
        changed = true;
      }
      return next;
    });
    let passive = skill.passive;
    if (passive && heal > 0) {
      passive = {
        ...passive,
        levels: passive.levels.map((lv) => {
          const copy = { ...lv } as Record<string, unknown>;
          for (const field of PASSIVE_HEAL_FIELDS) {
            if (typeof copy[field] === "number") { copy[field] = (copy[field] as number) * (1 + heal); changed = true; }
          }
          return copy;
        }) as unknown as typeof passive.levels,
      };
    }
    return changed ? { ...skill, effects: mapped, passive } : skill;
  }) as MonsterDefinition["skills"];
}

/**
 * 定義へアクセを着ける。`accessory` が null なら**定義をそのまま返す**
 * (アクセを持たない個体の戦闘は、この関数を通っても1ビットも変わらない)。
 */
export function applyAccessoryToDefinition(def: MonsterDefinition, accessory: Accessory | null | undefined): MonsterDefinition {
  if (!accessory) return def;
  const effects = accessoryBattleEffects(accessory);
  const stats = { ...def.stats };
  const main = accessoryMainValue(accessory);
  if (accessory.mainStat === "HP") stats.hp += main;
  if (accessory.mainStat === "ATK") stats.atk += main;
  if (accessory.mainStat === "DEF") stats.def += main;
  stats.hp = Math.max(1, Math.round(stats.hp * (1 + effects.maxHp)));
  stats.def = Math.max(1, Math.round(stats.def * (1 + effects.defUp)));

  const mods = { ...DEFAULT_COMBAT_MODIFIERS, ...(def.combatMods ?? {}) };
  if (effects.turnHeal > 0) mods.turnHealPercent = (mods.turnHealPercent ?? 0) + effects.turnHeal;
  if (effects.startShield > 0) mods.battleStartShieldPercent = (mods.battleStartShieldPercent ?? 0) + effects.startShield;
  if (effects.shieldUp > 0) mods.shieldMultiplier = (mods.shieldMultiplier ?? 1) * (1 + effects.shieldUp);
  if (effects.debuffRate > 0) mods.debuffChanceBonus = (mods.debuffChanceBonus ?? 0) + effects.debuffRate;

  const skills = applySkillBonuses(def.skills, effects);
  return {
    ...def,
    stats,
    skills,
    combatMods: mods,
    ...(hasRuntimeAccessoryEffects(effects) ? { accessory: effects } : {}),
  };
}
