import { LatentAbilityCandidate } from "../core/monsterDevelopment.js";
import { ELEMENTS } from "../core/element.js";

type Draft = Omit<LatentAbilityCandidate, "id" | "skillSlot">;
const d = (name: string, description: string, category: Draft["category"], effectType: Draft["effectType"], value: number,
  chance: number, duration: number, target: Draft["target"], resolution: Draft["resolution"], status?: string): Draft =>
  ({ name, description, category, effectType, value, chance, duration, target, resolution, status });

/**
 * 種族のS1に合わせた3方向の設計原本。属性ごとの安定IDへ展開する。
 * BattleEngineへ渡す宣言データの原本。
 */
const BLUEPRINTS: Readonly<Record<string, readonly [Draft, Draft, Draft]>> = {
  slime: [
    d("弾ける体当たり", "S1ダメージ+15%。", "OFFENSE", "DAMAGE_UP", .15, 1, 0, "TARGET", "ALWAYS"),
    d("粘液の足止め", "S1命中時、別判定30%でSPD低下を1ターン付与。", "DISRUPT", "ADD_DEBUFF", 0, .3, 1, "TARGET", "SEPARATE", "SPD_DOWN"),
    d("分裂保護", "S1使用後、HP割合が最も低い味方へ最大HP8%のシールドを1ターン付与。", "SUPPORT", "SHIELD", .08, 1, 1, "LOWEST_HP_ALLY", "ALWAYS", "SHIELD"),
  ],
  wolf: [
    d("急所狩り", "S1クリティカル時のダメージ+18%。", "OFFENSE", "CRIT_TRIGGER", .18, 1, 0, "TARGET", "ON_CRIT"),
    d("裂傷の牙", "S1命中時、別判定30%で回復阻害を1ターン付与。", "DISRUPT", "ADD_DEBUFF", 0, .3, 1, "TARGET", "SEPARATE", "HEAL_BLOCK"),
    d("群れの号令", "S1クリティカル時、HP割合が最も低い味方の行動ゲージを8%増加。", "SUPPORT", "ALLY_SUPPORT", .08, 1, 0, "LOWEST_HP_ALLY", "ON_CRIT"),
  ],
  golem: [
    d("岩芯打", "S1へ防御力12%分の追加係数。", "OFFENSE", "DEF_SCALING", .12, 1, 0, "TARGET", "ALWAYS"),
    d("重圧", "S1命中時、別判定25%で挑発を1ターン付与。", "DISRUPT", "ADD_DEBUFF", 0, .25, 1, "TARGET", "SEPARATE", "TAUNT"),
    d("石化外殻", "S1使用後、自身へ最大HP8%のシールドを1ターン付与。", "DURABILITY", "SHIELD", .08, 1, 1, "SELF", "ALWAYS", "SHIELD"),
  ],
  fairy: [
    d("光羽の一撃", "S1ダメージ+12%。", "OFFENSE", "DAMAGE_UP", .12, 1, 0, "TARGET", "ALWAYS"),
    d("惑わしの燐粉", "S1命中時、別判定30%で暗闇を1ターン付与。", "DISRUPT", "ADD_DEBUFF", 0, .3, 1, "TARGET", "SEPARATE", "BLIND"),
    d("癒やしの羽音", "S1使用後、HP割合が最も低い味方を最大HP6%回復。", "SUPPORT", "ALLY_SUPPORT", .06, 1, 0, "LOWEST_HP_ALLY", "ALWAYS"),
  ],
  imp: [
    d("悪戯の追撃", "S1ダメージ+14%。", "OFFENSE", "DAMAGE_UP", .14, 1, 0, "TARGET", "ALWAYS"),
    d("封印針", "S1命中時、別判定20%でスキル使用不可を1ターン付与。", "DISRUPT", "ADD_DEBUFF", 0, .2, 1, "TARGET", "SEPARATE", "SKILL_LOCK"),
    d("盗気", "S1でデバフ付与に成功した時、自身の行動ゲージを8%増加。", "SPECIAL", "SPECIAL_TRIGGER", .08, 1, 0, "SELF", "CONDITIONAL"),
  ],
  wisp: [
    d("魂火", "S1ダメージ+12%。", "OFFENSE", "DAMAGE_UP", .12, 1, 0, "TARGET", "ALWAYS"),
    d("消魂", "S1命中時、別判定25%で強化不可を1ターン付与。", "DISRUPT", "ADD_DEBUFF", 0, .25, 1, "TARGET", "SEPARATE", "BUFF_BLOCK"),
    d("残光", "S1使用後、自身を最大HP7%回復。", "DURABILITY", "SELF_HEAL", .07, 1, 0, "SELF", "ALWAYS"),
  ],
  treant: [
    d("年輪打", "S1へ最大HP8%分の追加係数。", "OFFENSE", "HP_SCALING", .08, 1, 0, "TARGET", "ALWAYS"),
    d("絡み根", "S1命中時、別判定30%でATK低下を1ターン付与。", "DISRUPT", "ADD_DEBUFF", 0, .3, 1, "TARGET", "SEPARATE", "ATK_DOWN"),
    d("再生樹皮", "S1使用後、自身を最大HP6%回復。", "DURABILITY", "SELF_HEAL", .06, 1, 0, "SELF", "ALWAYS"),
  ],
  knight: [
    d("墓守の剣", "S1へ防御力10%分の追加係数。", "OFFENSE", "DEF_SCALING", .1, 1, 0, "TARGET", "ALWAYS"),
    d("呪鎧砕き", "S1の既存DEF低下発動率へ+15pt（上限100%）。", "DISRUPT", "DEBUFF_CHANCE_UP", .15, 1, 0, "TARGET", "ADD_TO_EXISTING", "DEF_DOWN"),
    d("死線の構え", "S1使用時HP30%以下なら、自身へ我慢を1ターン付与（戦闘中1回）。", "SPECIAL", "ADD_BUFF", 0, 1, 1, "SELF", "CONDITIONAL", "ENDURE"),
  ],
  griffon: [
    d("烈風爪", "S1ダメージ+16%。", "OFFENSE", "DAMAGE_UP", .16, 1, 0, "TARGET", "ALWAYS"),
    d("風圧", "S1命中時、別判定30%で対象の行動ゲージを10%減少。", "DISRUPT", "TURN_METER_DOWN", .1, .3, 0, "TARGET", "SEPARATE"),
    d("追い風", "S1クリティカル時、自身の行動ゲージを7%増加。", "SPECIAL", "SPECIAL_TRIGGER", .07, 1, 0, "SELF", "ON_CRIT"),
  ],
  dragon: [
    d("竜牙研磨", "S1ダメージ+12%。S2/S3には影響しない。", "OFFENSE", "DAMAGE_UP", .12, 1, 0, "TARGET", "ALWAYS"),
    d("崩鱗", "S1の既存DEF低下発動率へ+15pt（上限100%）。", "DISRUPT", "DEBUFF_CHANCE_UP", .15, 1, 0, "TARGET", "ADD_TO_EXISTING", "DEF_DOWN"),
    d("竜鱗", "S1使用後、自身へ最大HP7%のシールドを1ターン付与。", "DURABILITY", "SHIELD", .07, 1, 1, "SELF", "ALWAYS", "SHIELD"),
  ],
  seraph: [
    d("裁きの光", "S1ダメージ+10%。", "OFFENSE", "DAMAGE_UP", .1, 1, 0, "TARGET", "ALWAYS"),
    d("戒め", "S1命中時、別判定25%で被クリ率アップを1ターン付与。", "DISRUPT", "ADD_DEBUFF", 0, .25, 1, "TARGET", "SEPARATE", "CRIT_RATE_UP"),
    d("守護の祈り", "S1使用後、HP割合が最も低い味方へ被クリ率ダウンを1ターン付与。", "SUPPORT", "ADD_BUFF", 0, 1, 1, "LOWEST_HP_ALLY", "ALWAYS", "CRIT_RATE_DOWN"),
  ],
  nemesis: [
    d("復讐の刃", "S1ダメージ+10%。高火力な既存性能を考慮した下限値。", "OFFENSE", "DAMAGE_UP", .1, 1, 0, "TARGET", "ALWAYS"),
    d("報いの刻印", "S1命中時、別判定20%で強化不可を1ターン付与。", "DISRUPT", "ADD_DEBUFF", 0, .2, 1, "TARGET", "SEPARATE", "BUFF_BLOCK"),
    d("逆境反射", "S1使用時HP30%以下なら、自身へ反射を1ターン付与（戦闘中1回）。", "SPECIAL", "ADD_BUFF", 0, 1, 1, "SELF", "CONDITIONAL", "REFLECT"),
  ],
};

export const LATENT_ABILITY_CANDIDATES: Readonly<Record<string, readonly LatentAbilityCandidate[]>> =
  Object.fromEntries(Object.entries(BLUEPRINTS).flatMap(([templateId, drafts]) => ELEMENTS.map((element) => [`${templateId}_${element}`, drafts.map((draft, index) => ({
    ...draft,
    id: `${templateId}_${element}_latent_${index + 1}`,
    skillSlot: 0 as const,
  }))])));

/** 戦闘定義化のたびに72体を走査しない、安定ID用O(1)索引。 */
export const LATENT_ABILITY_BY_ID: ReadonlyMap<string, LatentAbilityCandidate> = new Map(
  Object.values(LATENT_ABILITY_CANDIDATES).flat().map((candidate) => [candidate.id, candidate]),
);
