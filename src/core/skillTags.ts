import type { Skill, SkillEffect } from "./skill.js";

/**
 * スキルの中身から出す「そのスキルが何をする技か」の札。
 *
 * ## なぜ技の名前で決めないのか
 *
 * スキル才能の候補は**その枠に今入っている技**で決まる。
 * クリエイト(継承)で中身が入れ替わる枠なので、技の名前や図鑑IDに
 * 才能を紐づけると、移し替えた瞬間に候補が嘘になる。
 * **効果の配列を見て毎回決める**なら、何を移しても正しく付いてくる。
 *
 * ## 札は重なる
 *
 * 「敵全体を殴りながら味方を回復する」技には attack・heal・aoe が全部付く。
 * 才能側は「この札を持っていること」を条件にするので、
 * 1つの技に攻撃系と回復系の両方の候補が並ぶことがある。**それでよい。**
 */
export type SkillTag =
  /* --- 何をする技か --- */
  | "attack"
  | "heal"
  | "buff"
  | "debuff"
  | "gauge_up"
  | "gauge_down"
  | "shield"
  /* --- 誰に向く技か --- */
  | "single"
  | "aoe"
  | "self_target"
  | "ally_target"
  | "enemy_target";

/** 弱体扱いする効果。ここに無いものは弱化成功率の才能が乗らない */
const DEBUFF_KINDS: ReadonlySet<SkillEffect["kind"]> = new Set([
  "DEBUFF", "STUN", "BURN", "POISON", "BLIND", "HEAL_BLOCK", "COOLDOWN_EXTEND",
]);

/** 強化扱いする効果 */
const BUFF_KINDS: ReadonlySet<SkillEffect["kind"]> = new Set([
  "BUFF", "IMMUNITY", "REGEN", "MITIGATE", "PROTECT", "COUNTER_STANCE",
]);

/**
 * その効果が「味方へ向く」か。
 *
 * `applyTo` が付いていれば従い、無ければスキルの対象で決まる。
 * **敵を殴る技に置かれた回復は必ず applyTo を持つ**(そう書く決まりになっている)。
 */
function towardAllies(effect: SkillEffect, skill: Skill): boolean {
  const applyTo = "applyTo" in effect ? effect.applyTo : undefined;
  if (applyTo === "SELF" || applyTo === "ALLIES" || applyTo === "LOWEST_HP_ALLY") return true;
  return skill.target === "SINGLE_ALLY" || skill.target === "ALL_ALLIES" || skill.target === "SELF";
}

/**
 * そのスキルの札を出す。
 *
 * **パッシブ枠には何も付けない。**手番で使う技ではないので、
 * 「使用後にゲージ+10%」のような才能が意味を成さない。
 */
export function skillTags(skill: Skill): ReadonlySet<SkillTag> {
  const tags = new Set<SkillTag>();
  if (skill.passive !== undefined || skill.automatic === true) return tags;

  for (const effect of skill.effects) {
    switch (effect.kind) {
      case "DAMAGE":
        tags.add("attack");
        break;
      case "HEAL":
      case "LIFESTEAL":
        tags.add("heal");
        break;
      case "SHIELD":
        tags.add("shield");
        break;
      case "GAUGE":
        /*
         * **増やすか減らすかは符号で決まる。**
         * 「敵のゲージを減らす」も「味方のゲージを進める」も同じ GAUGE なので、
         * 向き先まで見ないと、減らす技に増加量の才能が並ぶ。
         */
        if (effect.amount > 0 && towardAllies(effect, skill)) tags.add("gauge_up");
        else if (effect.amount < 0) tags.add("gauge_down");
        else if (effect.drain) tags.add("gauge_down");
        break;
      case "STRIP":
        tags.add("debuff");
        break;
      default:
        if (DEBUFF_KINDS.has(effect.kind)) tags.add("debuff");
        else if (BUFF_KINDS.has(effect.kind)) tags.add("buff");
        else if (effect.kind === "STATUS") {
          // STATUS は中身で強化にも弱体にもなる。向き先で振り分ける
          if (towardAllies(effect, skill)) tags.add("buff");
          else tags.add("debuff");
        }
        break;
    }
  }

  switch (skill.target) {
    case "SINGLE_ENEMY":
      tags.add("single");
      tags.add("enemy_target");
      break;
    case "ALL_ENEMIES":
      tags.add("aoe");
      tags.add("enemy_target");
      break;
    case "SINGLE_ALLY":
      tags.add("single");
      tags.add("ally_target");
      break;
    case "ALL_ALLIES":
      tags.add("aoe");
      tags.add("ally_target");
      break;
    case "SELF":
      tags.add("single");
      tags.add("self_target");
      break;
  }
  return tags;
}
