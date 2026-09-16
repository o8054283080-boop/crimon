/**
 * パッシブスキル。
 *
 * ## なぜ「効果の配列」ではなく「種類ごとの型」なのか
 *
 * アクティブスキルは `SkillEffect[]` の組み合わせで書けている。同じやり方を
 * パッシブへ持ち込むと、**発動条件・発動単位・内部クールタイムまで
 * 効果1つずつに書くことになり、組み合わせのほとんどが意味を成さない。**
 * 「敵が毒ダメージを受けるたび」に回復や強化解除を載せられる形にしても、
 * 実際に要るのは「自身のゲージが上がる」ただ1つで、残りは
 * 誰も使わないのに全部の分岐を正しく保たなければならない負債になる。
 *
 * パッシブは11種それぞれが1つの決まった振る舞いなので、
 * **種類そのものを型にする。** 何が起きるかがデータを見れば分かり、
 * 戦闘側は種類ごとに1か所だけ書けば済む。
 *
 * ## レベル
 *
 * パッシブもLv1〜5を持つ。ただしアクティブのような一律の倍率成長
 * (`computeLeveledSkill`)ではなく、**Lv1〜5の値を5つ並べて書く。**
 * 「Lv5でクールタイムが1減る」「Lv5でターンが1延びる」といった
 * アクティブ側の規則は、パッシブには一切かからない。
 */
/** パッシブのレベルの上限。アクティブと同じ5 */
export const MAX_PASSIVE_LEVEL = 5;
/** そのレベルでのパッシブの中身。範囲外のレベルは端に丸める */
export function passiveAtLevel(spec, level) {
    const index = Math.max(1, Math.min(MAX_PASSIVE_LEVEL, Math.round(level))) - 1;
    return spec.levels[index];
}
/** UI表示用に、パッシブ1段の中身を短い日本語にする */
export function describePassiveLevel(effect) {
    const pct = (value) => `${Number((value * 100).toFixed(2))}%`;
    switch (effect.kind) {
        case "WEAK_POINT": return `HP${pct(effect.hpRatio)}以下の敵へクリ率+${pct(effect.critRate)}・クリダメ+${pct(effect.critDmg)}・防御${pct(effect.ignore)}無視`;
        case "SKY_RULER": return `敵を倒すたび攻撃+${pct(effect.atk)}・クリダメ+${pct(effect.critDmg)}(最大8スタック)。ウェーブを越えて維持、戦闘終了でリセット`;
        case "REBIRTH": return `自身のターン開始時、味方全体を自身最大HP${pct(effect.heal)}回復。敵の現在HP割合に応じ与ダメージ最大+${pct(effect.damage)}。HP0で全回復復活、ゲージ維持(CT${effect.cooldown}、戦闘不能中は進まない)`;
        case "ILLUSION": return `光闇からのダメージ50%軽減・光闇への最終ダメージ+50%。通常ターン開始時、敵全体に攻撃力${effect.damage}倍と${pct(effect.chance)}で呪い。追加ターンでは発動しない`;
        case "CHEAT": return `クリティカル被ダメージ${pct(effect.reduction)}軽減。クリティカル被弾時、最大HP10%回復(敵1スキルにつき1回、致死時は回復しない)。全攻撃スキルに自身最大HP7%を加算`;
        case "GAUGE_ON_ENEMY_POISON":
            return `敵が毒ダメージを受けるたび、自身の行動ゲージ+${pct(effect.gauge)}(敵1ターンにつき1回)`;
        case "LAST_STAND":
            return `自身のHPが${pct(effect.hpRatio)}以下の間、防御力+${pct(effect.defUp)}・受けるダメージ-${pct(effect.damageTaken)}`;
        case "SCENT_OF_PREY":
            return `HPが${pct(effect.hpRatio)}以下の敵への最終ダメージ+${pct(effect.damageUp)}。常時攻撃力+${pct(effect.atkUp ?? 0)}・速度+${effect.spd ?? 0}。すべての攻撃に速度比例を加算(速度200で倍率+${effect.speedCoefficient ?? 0})`;
        case "GAUGE_ON_SLOWED_ENEMY_ACT":
            return `速度低下状態の敵が行動するたび、自身の行動ゲージ+${pct(effect.gauge)}`;
        case "FALSE_TREASURE":
            return `攻撃を受けた時、自身のHPを最大HPの${pct(effect.heal)}回復し、${pct(effect.chance)}で攻撃者の攻撃力-${pct(effect.atkDown)}(${effect.duration}ターン)。敵1行動につき1回`;
        case "VALKYRIE_OATH":
            return `味方のHPが${pct(effect.hpRatio)}以下になった時、その味方に1ターン無敵と自身の最大HPの${pct(effect.heal)}回復(内部クールタイム${effect.internalCooldown}ターン)`;
        case "THUNDER_INSTINCT":
            return `クリダメ+${pct(effect.critDmg)}・速度+${effect.spd}。攻撃スキルのクリティカル時、対象の行動ゲージを${pct(effect.drain)}吸収(1スキルにつき1回)`;
        case "REAPER_HARVEST":
            return `攻撃スキル使用時、${pct(effect.chance)}で対象に1ターンの強化阻害と回復阻害。成功時、自身のHPを最大HPの${pct(effect.heal)}回復し行動ゲージ+${pct(effect.gauge)}(1スキルにつき1回)`;
        case "PACK_INSTINCT":
            return `クリダメ+${pct(effect.critDmg)}。敵を倒すと追加ターンを得る`;
        case "TIME_KEEPER":
            return `味方が行動するたび自身の行動ゲージ+${pct(effect.allyGauge)}。自身の攻撃スキルに行動ゲージ${pct(effect.drain)}吸収と${pct(effect.stunChance)}のスタンが乗る(1スキルにつき1回)`;
        case "ANCIENT_BEHEMOTH":
            return effect.tiers
                .map((tier) => `HP${pct(tier.hpRatio)}以下: 受けるダメージ-${pct(tier.damageTaken)}・最大HP比例ダメージ+${pct(tier.hpDamageUp)}`)
                .join(" / ");
    }
}
