import { LatentAbilityCandidate, LatentRuntimeEffect } from "../core/monsterDevelopment.js";
import { ALL_DISPLAYABLE_MONSTERS_DEX } from "./monsters.js";
import { setLatentAbilityResolver } from "../core/monsterInstance.js";

const ELEMENT_LABEL: Record<string, string> = { FIRE: "炎", WATER: "水", GRASS: "翠", ELECTRIC: "雷", LIGHT: "光", DARK: "闇" };
const SPECIES_LABEL: Record<string, string> = {
  slime: "スライム", wolf: "ウルフ", golem: "ゴーレム", fairy: "フェアリー", imp: "インプ", wisp: "ウィスプ",
  treant: "トレント", knight: "ナイト", griffon: "グリフォン", dragon: "ドラゴン", seraph: "セラフ", nemesis: "ネメシス",
};
const DISRUPTIONS: readonly { label: string; description: string; effect: LatentRuntimeEffect }[] = [
  { label: "治癒封じ", description: "80%の確率で2ターン回復を阻害", effect: { kind: "DEBUFF", status: "HEAL_BLOCK", chance: .8, duration: 2 } },
  { label: "時奪い", description: "80%の確率で行動ゲージを15%減少", effect: { kind: "GAUGE_DOWN", chance: .8, value: .15 } },
  { label: "浄破", description: "80%の確率で強化効果を1個解除", effect: { kind: "STRIP", chance: .8, count: 1 } },
  { label: "鈍化", description: "75%の確率で2ターン素早さを低下", effect: { kind: "DEBUFF", status: "SPD_DOWN", chance: .75, duration: 2 } },
  { label: "侵蝕毒", description: "70%の確率で2ターン毒を1つ付与", effect: { kind: "DEBUFF", status: "POISON", chance: .7, duration: 2, value: .05 } },
  { label: "衝撃", description: "45%の確率で1ターン行動不能", effect: { kind: "DEBUFF", status: "STUN", chance: .45, duration: 1 } },
  { label: "強化封印", description: "70%の確率で2ターン強化効果を受けられなくする", effect: { kind: "DEBUFF", status: "BUFF_BLOCK", chance: .7, duration: 2 } },
];
const SUPPORTS: readonly { label: string; description: string; effect: LatentRuntimeEffect; stats?: Partial<LatentAbilityCandidate> }[] = [
  { label: "先導", description: "味方全体の行動ゲージを8%増加", effect: { kind: "ALLY_GAUGE_UP", chance: 1, value: .08 } },
  { label: "呪縛継承", description: "80%の確率で対象の弱体効果を1ターン延長", effect: { kind: "DEBUFF_EXTEND", chance: .8, duration: 1 } },
  { label: "清癒", description: "最もHP割合が低い味方を8%回復し弱体効果を1個解除", effect: { kind: "HEAL_CLEANSE", value: .08 } },
  { label: "再生結界", description: "最もHP割合が低い味方へ2ターン5%継続回復", effect: { kind: "REGEN", value: .05, duration: 2 } },
  { label: "守護膜", description: "最もHP割合が低い味方へ最大HP10%のシールドを2ターン付与", effect: { kind: "SHIELD", value: .1, duration: 2 }, stats: { hpMultiplier: 1.1 } },
  { label: "不屈装甲", description: "最大HP+10%、防御力+12%、受けるダメージ8%軽減", effect: { kind: "SHIELD", value: .06, duration: 1 }, stats: { hpMultiplier: 1.1, defMultiplier: 1.12, damageTakenMultiplier: .92 } },
];
function grade(index: number): "S" | "A" | "B" | "C" { return index < 6 ? "S" : index < 48 ? "A" : index < 156 ? "B" : "C"; }

/** 72個体それぞれを属性・既存S1の役割に合わせ、安定IDの三方向へ展開する。 */
export const LATENT_ABILITY_CANDIDATES: Readonly<Record<string, readonly LatentAbilityCandidate[]>> = Object.fromEntries(
  ALL_DISPLAYABLE_MONSTERS_DEX.map((monster, monsterIndex) => {
    const prefix = `${ELEMENT_LABEL[monster.element]}の${SPECIES_LABEL[monster.templateId]}`;
    const offenseMode = monsterIndex % 3;
    const offense: LatentAbilityCandidate = {
      id: `${monster.templateId}_${monster.element}_latent_1`, name: `${prefix}・攻勢`, skillSlot: 0, category: "OFFENSE",
      effectType: "DAMAGE_UP", value: .08, chance: 1, duration: 0, target: "TARGET", resolution: "ALWAYS",
      description: offenseMode === 0 ? "スキル1を威力70%の敵全体攻撃へ変化（主対象を維持）" : offenseMode === 1
        ? "スキル1で対象の防御力を20%無視" : "敵の弱体効果1個につきダメージ+5%（最大25%）",
      ...(offenseMode === 0 ? { aoeConversion: { damageMultiplier: .7, secondaryEffectChanceMultiplier: .65, nativeEffectTarget: "PRIMARY_ONLY" as const } }
        : offenseMode === 1 ? { ignoreDefenseRatio: .2 } : { debuffDamageBonus: { perDebuff: .05, maxBonus: .25 } }),
      grade: grade(monsterIndex * 3),
    };
    const disrupt = DISRUPTIONS[monsterIndex % DISRUPTIONS.length];
    const control: LatentAbilityCandidate = {
      id: `${monster.templateId}_${monster.element}_latent_2`, name: `${prefix}・${disrupt.label}`, description: `スキル1命中後、${disrupt.description}（多段でも1回）`,
      skillSlot: 0, category: "DISRUPT", effectType: "DAMAGE_UP", value: 0, chance: 1, duration: 0, target: "TARGET", resolution: "SEPARATE",
      runtimeEffects: [disrupt.effect], grade: grade(monsterIndex * 3 + 1),
    };
    const support = SUPPORTS[monsterIndex % SUPPORTS.length];
    const utility: LatentAbilityCandidate = {
      id: `${monster.templateId}_${monster.element}_latent_3`, name: `${prefix}・${support.label}`, description: `スキル1使用後、${support.description}`,
      skillSlot: 0, category: monsterIndex % 2 ? "DURABILITY" : "SUPPORT", effectType: "DAMAGE_UP", value: 0, chance: 1, duration: 0,
      target: support.effect.kind === "ALLY_GAUGE_UP" ? "ALL_ALLIES" : "LOWEST_HP_ALLY", resolution: "ALWAYS", runtimeEffects: [support.effect],
      ...support.stats, grade: grade(monsterIndex * 3 + 2),
    };
    return [monster.id, [offense, control, utility] as const];
  }),
);

setLatentAbilityResolver((dexId, abilityId) => LATENT_ABILITY_CANDIDATES[dexId]?.find((candidate) => candidate.id === abilityId));
