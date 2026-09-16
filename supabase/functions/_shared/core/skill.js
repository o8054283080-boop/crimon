import { describePassiveLevel, passiveAtLevel } from "./passive.js";
export const STATUS_EFFECT_CATEGORY = {
    CRIT_RATE_DOWN: "BUFF", ENDURE: "BUFF", REFLECT: "BUFF", REVIVE: "BUFF", INVINCIBLE: "BUFF",
    TAUNT: "DEBUFF", BUFF_BLOCK: "DEBUFF", SKILL_LOCK: "DEBUFF", CRIT_RATE_UP: "DEBUFF",
    FOCUS: "BUFF",
};
/**
 * 補正の基準になるステータス値。終盤に装備込みで到達する水準に合わせてある。
 *
 * 補正を「能力値1につき+○倍」で書いていた頃は、3つのステータスの桁が違うせいで
 * 意味が揃わなかった。HPは3万、防御は3500、速度は110なので、同じ係数を書いても
 * HP補正は+72、速度補正は+0.4にしかならず、**説明文の倍率が無意味になっていた**
 * (防御補正付きのゴーレムの通常攻撃と、ネメシスのCT5必殺技が同じダメージだった)。
 * 基準に対する割合にすることで、どのステータスでも同じ読み方ができる。
 */
export const SCALE_REFERENCE = {
    hp: 30000,
    def: 3500,
    // 速度の基準を110にしていたのは**素のステータスを見ていたから**で、
    // 実態と合っていなかった。★6装備の副効果を速度に寄せると
    // 素120のドラゴンが310まで伸びる(実測)。110を基準にすると、
    // 速度補正付きのスキルが終盤で想定の3倍近く効いてしまう。
    // 全員が速度を詰めるわけではないので、中間の200を基準に置く
    spd: 200,
};
/** そのスキルがパッシブか */
export function isPassiveSkill(skill) {
    return skill.passive !== undefined || skill.automatic === true;
}
/** スキルレベルの上限 */
export const MAX_SKILL_LEVEL = 5;
/** レベル2〜4の間、1レベルごとにダメージ倍率・回復量・発動確率がこの割合ずつ上昇する */
const SKILL_POWER_GROWTH_PER_LEVEL = 0.06;
/**
 * クールタイムが無いスキル(スキル1)は、Lv5になってもクールタイム短縮の恩恵を受けられず、
 * バフ/デバフ/スタンを持たない純粋な攻撃技だと何も変化しなかったため、Lv5到達時にさらに
 * もう一段成長するようにしてある(通常のLv2〜4と同じ上昇幅を追加で1回分)。
 */
const NO_COOLDOWN_LV5_BONUS_GROWTH = SKILL_POWER_GROWTH_PER_LEVEL;
function powerGrowthFactor(level, hasNoCooldown) {
    const cappedLevel = Math.min(level, 4);
    let growth = 1 + SKILL_POWER_GROWTH_PER_LEVEL * (cappedLevel - 1);
    if (level >= MAX_SKILL_LEVEL && hasNoCooldown) {
        growth += NO_COOLDOWN_LV5_BONUS_GROWTH;
    }
    return growth;
}
function round2(value) {
    return Math.round(value * 100) / 100;
}
function round3(value) {
    return Math.round(value * 1000) / 1000;
}
function growChance(chance, growth) {
    return Math.min(1, round3(chance * growth));
}
/**
 * スキルレベルを反映した実効スキルを計算する。
 * レベル2〜4: ダメージ倍率・回復量・(デバフ/スタン/火傷の)発動確率が少しずつ上昇する。
 * レベル5到達時: それ以上の威力上昇はせず(クールタイム無しのスキルを除く)、代わりにクールタイムが
 * 1ターン短縮され、バフ・デバフの継続ターンが1ターン延びる。ただしスタン・火傷は強力すぎるため、
 * 継続ターンはレベルによらず常に一定(発動確率のみ成長する)。
 */
export function computeLeveledSkill(skill, level) {
    const clampedLevel = Math.max(1, Math.min(level, MAX_SKILL_LEVEL));
    /*
     * パッシブはアクティブと成長のしかたが違う。
     * 倍率を掛けるのでもクールタイムを縮めるのでもなく、
     * **Lv1〜5の値がそれぞれ別に書いてある**(`src/core/passive.ts`)。
     * ここではレベルだけを焼き込み、効果には一切触れない。
     */
    if (skill.passive)
        return { ...skill, passiveLevel: clampedLevel };
    if (skill.automatic)
        return skill;
    if (skill.levelOverrides)
        return { ...skill, ...JSON.parse(JSON.stringify(skill.levelOverrides[clampedLevel - 1])) };
    if (clampedLevel === 1)
        return skill;
    const growth = powerGrowthFactor(clampedLevel, skill.cooldownTurns === 0);
    const isMaxLevel = clampedLevel >= MAX_SKILL_LEVEL;
    /**
     * Lv5でターン数を延ばしてよいか。
     * `fixedDuration` が立っている効果は、**スキルMAXでも書いたターン数のまま**。
     * 無敵1ターン・強化阻害1ターンなどは、その短さ自体が効果の重さと釣り合っている。
     */
    const extend = (effect) => isMaxLevel && !effect.fixedDuration;
    const effects = skill.effects.map((effect) => {
        switch (effect.kind) {
            case "DAMAGE":
                return { ...effect, multiplier: round2(effect.multiplier * growth) };
            case "HEAL":
                return { ...effect, healRate: round3(effect.healRate * growth) };
            case "LIFESTEAL":
                return { ...effect, healRate: round3(effect.healRate * growth) };
            case "BUFF":
                return extend(effect) ? { ...effect, durationTurns: effect.durationTurns + 1 } : effect;
            case "STATUS": {
                const withChance = effect.chance !== undefined ? { ...effect, chance: growChance(effect.chance, growth) } : effect;
                return extend(withChance) ? { ...withChance, durationTurns: withChance.durationTurns + 1 } : withChance;
            }
            case "DEBUFF": {
                const withChance = effect.chance !== undefined ? { ...effect, chance: growChance(effect.chance, growth) } : effect;
                return extend(withChance) ? { ...withChance, durationTurns: withChance.durationTurns + 1 } : withChance;
            }
            case "STUN":
                return effect.chance !== undefined ? { ...effect, chance: growChance(effect.chance, growth) } : effect;
            case "BLIND":
                // 暗闇は攻撃を丸ごと潰しうるため、継続ターンは伸ばさず確率だけ成長させる
                return effect.chance !== undefined ? { ...effect, chance: growChance(effect.chance, growth) } : effect;
            case "BURN":
                return { ...effect, chance: growChance(effect.chance, growth) };
            case "GAUGE":
                return { ...effect, amount: round3(effect.amount * growth), chance: effect.chance === undefined ? undefined : growChance(effect.chance, growth) };
            case "SHIELD": {
                const withRate = { ...effect, shieldRate: round3(effect.shieldRate * growth) };
                return extend(withRate) ? { ...withRate, durationTurns: withRate.durationTurns + 1 } : withRate;
            }
            case "IMMUNITY":
                return extend(effect) ? { ...effect, durationTurns: effect.durationTurns + 1 } : effect;
            case "REGEN": {
                const withRate = { ...effect, healRate: round3(effect.healRate * growth) };
                return extend(withRate) ? { ...withRate, durationTurns: withRate.durationTurns + 1 } : withRate;
            }
            case "POISON": {
                const withRate = { ...effect, damageRatePerStack: round3(effect.damageRatePerStack * growth) };
                const withChance = withRate.chance !== undefined ? { ...withRate, chance: growChance(withRate.chance, growth) } : withRate;
                return extend(withChance) ? { ...withChance, durationTurns: withChance.durationTurns + 1 } : withChance;
            }
            case "STRIP":
                return effect.chance !== undefined ? { ...effect, chance: growChance(effect.chance, growth) } : effect;
            case "STEAL_BUFF":
                return effect.chance !== undefined ? { ...effect, chance: growChance(effect.chance, growth) } : effect;
            case "HEAL_BLOCK": {
                const withChance = effect.chance !== undefined ? { ...effect, chance: growChance(effect.chance, growth) } : effect;
                return extend(withChance) ? { ...withChance, durationTurns: withChance.durationTurns + 1 } : withChance;
            }
            case "COOLDOWN_EXTEND":
                // 延長ターン数は伸ばさない。1増えるだけで妨害の重さが跳ね上がる
                return effect.chance !== undefined ? { ...effect, chance: growChance(effect.chance, growth) } : effect;
            case "MITIGATE":
                return extend(effect) ? { ...effect, durationTurns: effect.durationTurns + 1 } : effect;
            case "PROTECT":
                // 肩代わりは割合も期間も伸ばさない。守り役が一方的に強くなりすぎる
                return effect;
            case "COUNTER_STANCE":
                return { ...effect, multiplier: round2(effect.multiplier * growth) };
            case "COOLDOWN_REDUCE":
                // 縮めるターン数は伸ばさない。1増えるだけで必殺技の間隔の意味が消える
                return effect;
            case "GAUGE_ON_HIT":
                return extend(effect) ? { ...effect, durationTurns: effect.durationTurns + 1 } : effect;
            default:
                return effect;
        }
    });
    const cooldownTurns = isMaxLevel ? Math.max(0, skill.cooldownTurns - 1) : skill.cooldownTurns;
    return { ...skill, cooldownTurns, effects, ...(isMaxLevel ? skill.maxLevelOverride : {}) };
}
export const BUFF_STAT_JA = {
    atk: "攻撃力",
    def: "防御力",
    spd: "速度",
    criRate: "クリ率",
    criDmg: "クリダメ",
};
export const STATUS_EFFECT_JA = {
    CRIT_RATE_DOWN: "被クリ率ダウン", ENDURE: "我慢", REFLECT: "反射", REVIVE: "復活", INVINCIBLE: "無敵",
    TAUNT: "挑発", BUFF_BLOCK: "強化不可", SKILL_LOCK: "スキル使用不可", CRIT_RATE_UP: "被クリ率アップ",
    FOCUS: "ターゲット集中",
};
export const EFFECT_CONDITION_JA = {
    TARGET_HAS_DEBUFF: "対象が弱体状態なら",
    TARGET_SPD_DOWN: "対象が速度低下状態なら",
    TARGET_POISONED: "対象が毒状態なら",
    TARGET_TAUNTED: "対象が挑発状態なら",
    TARGET_HAS_BUFF: "対象が強化状態なら",
    TARGET_HP_BELOW_50: "対象のHPが50%以下なら",
    TARGET_HP_BELOW_30: "対象のHPが30%以下なら",
    TARGET_HP_ABOVE_SELF: "対象のHP割合が自身より高いなら",
    TARGET_GAUGE_BELOW_20: "対象の行動ゲージが20%以下なら",
    TARGET_GAUGE_ABOVE_50: "対象の行動ゲージが50%以上なら",
    TARGET_DEBUFF_AT_LEAST_2: "対象の弱体効果が2個以上なら",
    TARGET_DEBUFF_AT_LEAST_3: "対象の弱体効果が3個以上なら",
    SELF_HP_ABOVE_50: "自身のHPが50%以上なら",
    ANY_CRIT: "1回以上クリティカルしたら",
    CRITS_AT_LEAST_2: "2回以上クリティカルしたら",
    CRITS_AT_LEAST_3: "3回以上クリティカルしたら",
    STRIPPED_TARGET: "強化効果を剥がせたら",
    STUN_FAILED: "スタンが失敗したら",
    KILLED_TARGET: "相手を倒したら",
};
const SCALE_BONUS_STAT_JA = {
    spd: "速度",
    def: "防御力",
    hp: "最大HP",
};
function chanceSuffix(chance) {
    return chance !== undefined ? `${Math.round(chance * 100)}%で` : "";
}
function conditionPrefix(condition) {
    return condition ? EFFECT_CONDITION_JA[condition] : "";
}
/**
 * 割合を百分率の文字列へ。**小数点以下は1桁まで。末尾の0は落とす。**
 *
 * ## なぜ要るのか
 *
 * 係数をそのまま埋め込んでいたため、画面に
 * **「最大HP×0.08624999999999998を加算」**と出ていた(依頼主の指摘)。
 * 二進小数の誤差がそのまま出ていたもので、
 * 0.075 も「×0.075」と、比率なのか倍率なのかも読めない書き方だった。
 *
 * 百分率なら「最大HPの8.6%」と読める。桁も勝手に伸びない。
 */
function percent(ratio) {
    return `${Number((ratio * 100).toFixed(1))}%`;
}
/** UI表示用に、スキル効果1件を短い日本語テキストに変換する */
export function describeSkillEffect(effect) {
    switch (effect.kind) {
        case "CURSE": return `${Math.round(effect.chance * 100)}%で呪い1個(対象の2回目のターン開始時、付与時攻撃力×4の固定ダメージと1ターンスタン)`;
        case "DETONATE_CURSES": return "対象の呪いをすべて即時発動";
        case "CONVERT_CURSES": return `${Math.round(effect.chance * 100)}%で対象の強化をすべて呪いへ変換。成功時1ターンスタン`;
        case "DAMAGE_BOOST": return `与ダメージ+${Math.round(effect.amount * 100)}%(${effect.durationTurns}ターン)`;
        // **「対象以外へ」と書く。**対象を含めると、本命に二重で入るように読める
        case "SPLASH": return `対象に与えたダメージの${Math.round(effect.ratio * 100)}%を対象以外の敵全体へ拡散`;
        case "DAMAGE": {
            const scaleText = effect.scaleBonus
                ? `(自身の${SCALE_BONUS_STAT_JA[effect.scaleBonus.stat]}が高いほど上昇)`
                : effect.hpCoefficient !== undefined
                    ? `(最大HPの${percent(effect.hpCoefficient)}を加算)`
                    : effect.defCoefficient !== undefined
                        ? `(防御力の${percent(effect.defCoefficient)}を加算)`
                        : "";
            const ignoreDefenseText = effect.ignoreDefense
                ? "(防御力無視)"
                : effect.ignoreDefenseRatio
                    ? `(防御力${Math.round(effect.ignoreDefenseRatio * 100)}%無視)`
                    : "";
            const hpBonusText = (effect.targetHpBonus ?? [])
                .map((tier) => ` 対象HP${Math.round(tier.hpRatio * 100)}%以下で最終ダメージ+${Math.round(tier.bonus * 100)}%`)
                .join("");
            const hpIgnoreText = (effect.targetHpIgnoreDefense ?? [])
                .map((tier) => ` 対象HP${Math.round(tier.hpRatio * 100)}%以下で防御力${Math.round(tier.ratio * 100)}%無視`)
                .join("");
            const condBonusText = (effect.conditionalBonus ?? [])
                .map((entry) => ` ${EFFECT_CONDITION_JA[entry.when]}最終ダメージ+${Math.round(entry.bonus * 100)}%`)
                .join("");
            const missingText = effect.missingHpBonus
                ? ` 自身が失ったHPが多いほど最終ダメージ上昇(最大+${Math.round(effect.missingHpBonus.maxBonus * 100)}%)`
                : "";
            const debuffBonusText = effect.debuffDamageBonus
                ? ` 対象の弱体効果1個につき最終ダメージ+${Math.round(effect.debuffDamageBonus.perDebuff * 100)}%(最大+${Math.round(effect.debuffDamageBonus.maxBonus * 100)}%)`
                : "";
            const critGaugeText = effect.gaugeOnCritPerHit
                ? ` 各ヒットのクリティカルで自身の行動ゲージ+${Math.round(effect.gaugeOnCritPerHit * 100)}%`
                : "";
            const special = [
                effect.critDamageBonus ? `会心時の最終ダメージ+${effect.critDamageBonus * 100}%` : '',
                effect.currentHpBonus ? `対象の現在HP割合が高いほど最終ダメージ上昇(最大+${effect.currentHpBonus * 100}%)` : '',
                effect.fullHpBonus ? `対象HP100%で最終ダメージ+${effect.fullHpBonus * 100}%` : '',
                effect.debuffIgnoreDefense ? `弱体${effect.debuffIgnoreDefense.count}個以上で防御${effect.debuffIgnoreDefense.ratio * 100}%無視` : '',
                effect.perHitEffects ? `各ヒットごとに: ${effect.perHitEffects.map(describeSkillEffect).join('、')}` : '',
            ].filter(Boolean).join('。');
            const requiresText = conditionPrefix(effect.requires);
            return `${requiresText}ダメージ倍率 ${effect.multiplier.toFixed(2)}倍${effect.hits && effect.hits > 1 ? ` × ${effect.hits}回` : ""}${scaleText}${ignoreDefenseText}${hpBonusText}${hpIgnoreText}${condBonusText}${missingText}${debuffBonusText}${critGaugeText}${special ? `。${special}` : ""}`;
        }
        case "HEAL": {
            const who = effect.applyTo === "SELF" ? "自身を" : effect.applyTo === "ALLIES" ? "味方全体を" : "";
            if (effect.scaleStat === "hp")
                return `${who}回復 術者の最大HPの${Number((effect.healRate * 100).toFixed(2))}%`;
            if (effect.scaleStat === "atk")
                return `${who}回復 自身の攻撃力の${(effect.healRate * 100).toFixed(0)}%`;
            if (effect.scaleStat === "def")
                return `${who}回復 自身の防御力の${(effect.healRate * 100).toFixed(0)}%`;
            return `${who}回復 最大HPの${(effect.healRate * 100).toFixed(1)}%`;
        }
        case "LIFESTEAL":
            return `与えたダメージの${(effect.healRate * 100).toFixed(0)}%を自身が回復${effect.maxSourceHpRate === undefined ? "" : ` (自身の最大HPの${effect.maxSourceHpRate * 100}%まで)`}`;
        case "BUFF": {
            const scope = effect.applyTo === "ALLIES" ? "味方全体の" : effect.applyTo === "SELF" ? "自身の" : "";
            return `${scope}${BUFF_STAT_JA[effect.stat]}+${Math.round(effect.amount * 100)}% (${effect.durationTurns}ターン)`;
        }
        case "DEBUFF":
            return `${chanceSuffix(effect.chance)}${BUFF_STAT_JA[effect.stat]}-${Math.round(effect.amount * 100)}% (${effect.durationTurns}ターン)`;
        case "STATUS": {
            const scope = effect.applyTo === "ALLIES" ? "味方全体に" : effect.applyTo === "SELF" ? "自身に" : "";
            return `${chanceSuffix(effect.chance)}${scope}${STATUS_EFFECT_JA[effect.status]} (${effect.durationTurns}ターン)`;
        }
        case "STUN":
            return `${conditionPrefix(effect.requires)}${chanceSuffix(effect.chance)}スタン (${effect.durationTurns}ターン)`;
        case "BURN":
            return `${chanceSuffix(effect.chance)}火傷 (${effect.durationTurns}ターン、自身のターン終了時に自身の攻撃力分のダメージ)`;
        case "GAUGE": {
            const scope = effect.applyTo === "ALLIES" ? "味方全体の" : effect.applyTo === "SELF" ? "自身の" : "";
            const extra = effect.conditionalExtra
                ? ` (${EFFECT_CONDITION_JA[effect.conditionalExtra.when]}さらに${Math.round(Math.abs(effect.conditionalExtra.amount) * 100)}%)`
                : effect.lowHpExtra
                    ? ` (HP${Math.round(effect.lowHpExtra.hpRatio * 100)}%以下ならさらに${Math.round(effect.lowHpExtra.amount * 100)}%)`
                    : "";
            const head = conditionPrefix(effect.requires);
            if (effect.drain)
                return `${head}${chanceSuffix(effect.chance)}${scope}行動ゲージを${Math.round(effect.amount * 100)}%吸収${extra}`;
            /*
             * **100%を超える指定は、100%と書く。**
             *
             * ゲージは0〜100%の間に収まる(`engine.ts` が両端で止める)ので、
             * -118% と -100% では起きることが同じ。スキルを上げると量も伸びる作りなので、
             * 「-100%」と書いた技がMAXで「-118%」と表示され、**足りない数字を
             * 盛ったように見えていた**。実際に起きることだけを書く。
             */
            const shown = Math.min(1, Math.abs(effect.amount));
            const verb = effect.amount >= 0 ? `+${Math.round(shown * 100)}%` : `-${Math.round(shown * 100)}%`;
            return `${head}${chanceSuffix(effect.chance)}${scope}行動ゲージ${verb}${extra}`;
        }
        case "SHIELD": {
            const scope = effect.applyTo === "ALLIES" ? "味方全体に" : effect.applyTo === "SELF" ? "自身に" : "";
            const base = effect.fromSourceHp ? "自身の最大HP" : "最大HP";
            return `${scope}シールド ${base}の${Math.round(effect.shieldRate * 100)}% (${effect.durationTurns}ターン、ダメージを肩代わり)`;
        }
        case "IMMUNITY":
            return `状態異常無効 (${effect.durationTurns}ターン)`;
        case "REGEN":
            return `継続回復 最大HPの${(effect.healRate * 100).toFixed(1)}% (${effect.durationTurns}ターン、自身のターン開始時)`;
        case "CLEANSE": {
            const scope = effect.applyTo === "ALLIES" ? "味方全体の" : effect.applyTo === "SELF" ? "自身の" : "";
            return effect.count === undefined ? `${scope}デバフを解除` : `${scope}デバフを${effect.count}個解除`;
        }
        case "STRIP":
            return effect.count === undefined
                ? `${conditionPrefix(effect.requires)}${chanceSuffix(effect.chance)}有利な効果(シールド・無効・能力上昇)を解除`
                : `${conditionPrefix(effect.requires)}${chanceSuffix(effect.chance)}有利な効果を${effect.count}個解除`;
        case "STEAL_BUFF":
            return `${chanceSuffix(effect.chance)}有利な効果を${effect.count ?? 1}個奪って自身に付与`;
        case "MITIGATE": {
            const scope = effect.applyTo === "ALLIES" ? "味方全体の" : effect.applyTo === "SELF" ? "自身の" : "";
            const extra = effect.vsTauntedExtra ? `(挑発状態の敵からはさらに${Math.round(effect.vsTauntedExtra * 100)}%軽減)` : "";
            return `${scope}受けるダメージ-${Math.round(effect.amount * 100)}% (${effect.durationTurns}ターン)${extra}`;
        }
        case "PROTECT":
            return `保護 (${effect.durationTurns}ターン、対象が受けるダメージの${Math.round(effect.share * 100)}%を自身が肩代わり)`;
        case "COUNTER_STANCE": {
            const hp = effect.hpCoefficient ? `(最大HPの${percent(effect.hpCoefficient)}を加算)` : "";
            const heal = effect.healRate ? ` 反撃のたび自身のHPを最大HPの${Math.round(effect.healRate * 100)}%回復` : "";
            return `${effect.durationTurns}ターン、攻撃を受けるたび攻撃者へ攻撃力${effect.multiplier.toFixed(2)}倍の反撃${hp}${heal}`;
        }
        case "COOLDOWN_REDUCE": {
            const scope = effect.applyTo === "ALLIES" ? "味方全体の" : effect.applyTo === "SELF" ? "自身の" : "";
            return `${scope}全スキルのクールタイムを${effect.turns}ターン短縮`;
        }
        case "COOP_ATTACK": {
            const cd = effect.allyCooldownReduce ? `(参加した味方のクールタイム-${effect.allyCooldownReduce})` : "";
            return `味方${effect.allies}体とともに同じ相手へスキル1で協力攻撃${cd}`;
        }
        case "GAUGE_ON_HIT":
            return `${effect.durationTurns}ターン、攻撃を受けるたび行動ゲージ+${Math.round(effect.amount * 100)}%`;
        case "HEAL_BLOCK":
            return `${chanceSuffix(effect.chance)}治癒阻害 (${effect.durationTurns}ターン、受ける回復が${Math.round((1 - effect.healMultiplier) * 100)}%減る)`;
        case "COOLDOWN_EXTEND":
            return `${chanceSuffix(effect.chance)}敵の全スキルのクールタイムを${effect.turns}ターン延長`;
        case "BLIND":
            return `${chanceSuffix(effect.chance)}暗闇 (${effect.durationTurns}ターン、攻撃時50%でダメージ-75%・追加効果なし)`;
        case "POISON": {
            const stacks = effect.stacks && effect.stacks > 1 ? `${effect.stacks}スタック` : "1スタック";
            const extra = effect.extraStacksIfPoisoned ? ` (既に毒状態ならさらに${effect.extraStacksIfPoisoned}スタック)` : "";
            return `${conditionPrefix(effect.requires)}${chanceSuffix(effect.chance)}毒${stacks} (1スタックにつき最大HPの${Math.round(effect.damageRatePerStack * 100)}%、最大5スタック、${effect.durationTurns}ターン)${extra}`;
        }
    }
}
/**
 * UI表示用に、スキル1つの中身を行の配列にする。
 * パッシブはそのレベルの中身を1行で返す(効果の配列を持たないため)。
 */
export function describeSkillLines(skill) {
    if (skill.passive)
        return [describePassiveLevel(passiveAtLevel(skill.passive, skill.passiveLevel ?? 1))];
    return [...skill.effects.map(describeSkillEffect),
        ...(skill.extraTurn ? ['使用後、即時に追加ターンを獲得'] : []),
        ...(skill.resetCooldownOnKill ? ['このスキルで1体以上倒すと、このスキルのCTを全回復'] : []),
        ...(skill.gaugeIfThreeEnemies ? [`敵が3体以上いる時、自身の行動ゲージ+${skill.gaugeIfThreeEnemies * 100}%`] : []),
    ];
}
