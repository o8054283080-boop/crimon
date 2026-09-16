import { levelMultiplier, starMultiplier } from "../../core/rarity.js";
import { ATK_DOWN } from "../../core/statusValues.js";
/**
 * クリム。**CRIMONの看板モンスターで、全員に配る最初の相棒。**
 *
 * ## 立ち位置
 *
 * 光属性★5、他属性は存在しない。役割はアタッカー。
 * 「序盤だけの繋ぎ」にはしない——★6 Lv60・スキルMAXまで育てれば、
 * 冒険とダンジョンの周回では最後まで戦力になる水準に置いてある。
 * 初心者が最初に手にする1体が途中で用済みになると、
 * **育てた時間そのものが無駄だった**ことになる。
 *
 * ## ★6 Lv60 の到達値をここから逆算している
 *
 * 設計値(装備・能力ポイント・タイプ転生・才能なし):
 *
 *   HP 18,000 / 攻撃 2,300 / 防御 1,250 / 速度 118
 *   クリ率 20% / クリダメ +60% / 命中 15% / 抵抗 15%
 *
 * ★とLvの成長は `computeEffectiveStats` が
 * `Math.round(base × starMultiplier(6) × levelMultiplier(6,60))` で出す。
 * **その式を逆に使って base を置く。**数字を手で丸めて書くと、
 * 成長の式を触った時に設計値との対応が切れて誰にも分からなくなる。
 *
 * 属性補正は掛けない(`noElementFlavor`)。理由はそちらの説明に書いた。
 */
/** ★6 Lv60 の成長倍率。1.4^5 × 2.0 = 10.75648 */
const STAR6_LV60_MULTIPLIER = starMultiplier(6) * levelMultiplier(6, 60);
/** 「★6 Lv60でこの値にしたい」から素の値を出す */
const fromStar6Lv60 = (value) => value / STAR6_LV60_MULTIPLIER;
/**
 * S1「プリズムスプレッド」。**単体を撃ち抜き、その傷が周りへ広がる。**
 *
 * 拡散はメイン対象へ**実際に与えたダメージ**が基準(`SPLASH`)。
 * 会心が出た時、属性で有利を取った時、相手の防御を抜いた時——
 * 本命に通ったぶんだけ周りへの被害も増える。
 *
 * Lvで伸びるのは「倍率」と「拡散率」を交互に。
 * どちらか片方だけを伸ばすと、育てている途中の実感が段で途切れる。
 */
const CRIM_S1 = {
    id: "crim_s1",
    name: "プリズムスプレッド",
    /*
     * **説明文は、効果から生成した文で始める。**
     * `tests/monsterDescription.test.ts` が `describeSkillLines` の出力と
     * 突き合わせていて、手で書いた数字が効果とずれることを防いでいる。
     * 後ろへ、初心者向けに「どこへ当たるのか」を足す。
     */
    description: "ダメージ倍率 1.00倍。対象に与えたダメージの50%を対象以外の敵全体へ拡散。"
        + "【対象】敵単体＋対象以外の敵全体。狙った1体を撃ち抜き、その1体に実際に通ったダメージを基準に、残りの敵へ光が広がる。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
        { kind: "DAMAGE", multiplier: 1.0 },
        { kind: "SPLASH", ratio: 0.5 },
    ],
    levelOverrides: [
        // Lv1
        { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.0 }, { kind: "SPLASH", ratio: 0.5 }] },
        // Lv2 倍率 1.0 → 1.05
        { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.05 }, { kind: "SPLASH", ratio: 0.5 }] },
        // Lv3 拡散 50% → 60%
        { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.05 }, { kind: "SPLASH", ratio: 0.6 }] },
        // Lv4 倍率 1.05 → 1.10
        { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.10 }, { kind: "SPLASH", ratio: 0.6 }] },
        // Lv5 拡散 60% → 70%
        { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.10 }, { kind: "SPLASH", ratio: 0.7 }] },
    ],
};
/**
 * S2「クリスタルラッシュ」。**全体2回攻撃。当てるたびに攻撃を削る。**
 *
 * 攻撃DOWNの判定は**1撃ごと**(`perHitEffects`)。
 * 2回とも抜ければ2回試したことになるので、
 * 表に出ている確率よりは通りやすい——そのぶん1回あたりを低めに置いてある。
 */
const CRIM_S2 = {
    id: "crim_s2",
    name: "クリスタルラッシュ",
    description: "ダメージ倍率 0.80倍 × 2回。各ヒットごとに: 35%で攻撃力-50% (1ターン)。"
        + "【対象】敵全体・2回攻撃。当たるたびに判定するので、2回とも通れば2体ぶんの手応えがある。",
    target: "ALL_ENEMIES",
    cooldownTurns: 3,
    effects: [
        {
            kind: "DAMAGE", multiplier: 0.8, hits: 2,
            perHitEffects: [{ kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 1, chance: 0.35 }],
        },
    ],
    levelOverrides: [
        // Lv1
        {
            cooldownTurns: 3,
            effects: [{
                    kind: "DAMAGE", multiplier: 0.8, hits: 2,
                    perHitEffects: [{ kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 1, chance: 0.35 }],
                }],
        },
        // Lv2 倍率 0.8 → 0.9
        {
            cooldownTurns: 3,
            effects: [{
                    kind: "DAMAGE", multiplier: 0.9, hits: 2,
                    perHitEffects: [{ kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 1, chance: 0.35 }],
                }],
        },
        // Lv3 付与率 35% → 50%
        {
            cooldownTurns: 3,
            effects: [{
                    kind: "DAMAGE", multiplier: 0.9, hits: 2,
                    perHitEffects: [{ kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 1, chance: 0.5 }],
                }],
        },
        // Lv4 攻撃DOWN 1ターン → 2ターン
        {
            cooldownTurns: 3,
            effects: [{
                    kind: "DAMAGE", multiplier: 0.9, hits: 2,
                    perHitEffects: [{ kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.5 }],
                }],
        },
        // Lv5 倍率 0.9 → 1.0、CT3 → CT2
        {
            cooldownTurns: 2,
            effects: [{
                    kind: "DAMAGE", multiplier: 1.0, hits: 2,
                    perHitEffects: [{ kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.5 }],
                }],
        },
    ],
};
/**
 * S3「創世の宝珠」。**全体を薙ぎ、味方を守り、倒せばもう一度動く。**
 *
 * シールドは**クリム自身の最大HP**が基準(`fromSourceHp`)。
 * 受け手の最大HPで計算すると、硬い味方ほど厚く守られて
 * 「守る側を育てる」意味が消える。
 *
 * 追加ターンは `extraTurnOnKill`(既存)。何体倒しても1回だけ。
 * シールドは**倒せたかどうかに関わらず**必ず配る——
 * 攻撃が通らなかった時ほど守りが要る。
 *
 * シールドの持続は2ターンで据え置く(`fixedDuration`)。**伸ばせないからではない**
 * ——シールドのターン数は量が増えるのと同じくらいの重さで、伸ばしてよいもの
 * (`CLAUDE.md` の「スキルLvは `levelOverrides` で1段ずつ書く」)。
 * ここで伸ばさないのは、クリムのS3は倍率とCTを伸ばす形だと決めてあるため。
 * **Lv5はCT短縮に使う。**1ターン早く回ることは、倍率が数%伸びるのとは
 * 比べものにならないので、最後の段へ置く。
 */
const CRIM_S3 = {
    id: "crim_s3",
    name: "創世の宝珠",
    description: "ダメージ倍率 2.00倍。味方全体にシールド 自身の最大HPの20% (2ターン、ダメージを肩代わり)。"
        + "【対象】敵全体＋味方全体。この攻撃で敵を1体でも倒すと追加ターンを得る(何体倒しても1回)。シールドは倒せなくても必ず張る。",
    target: "ALL_ENEMIES",
    cooldownTurns: 5,
    extraTurnOnKill: true,
    effects: [
        { kind: "DAMAGE", multiplier: 2.0 },
        { kind: "SHIELD", shieldRate: 0.2, durationTurns: 2, fromSourceHp: true, applyTo: "ALLIES", fixedDuration: true },
    ],
    levelOverrides: [
        // Lv1
        {
            cooldownTurns: 5,
            effects: [
                { kind: "DAMAGE", multiplier: 2.0 },
                { kind: "SHIELD", shieldRate: 0.2, durationTurns: 2, fromSourceHp: true, applyTo: "ALLIES", fixedDuration: true },
            ],
        },
        // Lv2 倍率 2.0 → 2.3
        {
            cooldownTurns: 5,
            effects: [
                { kind: "DAMAGE", multiplier: 2.3 },
                { kind: "SHIELD", shieldRate: 0.2, durationTurns: 2, fromSourceHp: true, applyTo: "ALLIES", fixedDuration: true },
            ],
        },
        // Lv3 シールド 20% → 25%
        {
            cooldownTurns: 5,
            effects: [
                { kind: "DAMAGE", multiplier: 2.3 },
                { kind: "SHIELD", shieldRate: 0.25, durationTurns: 2, fromSourceHp: true, applyTo: "ALLIES", fixedDuration: true },
            ],
        },
        // Lv4 倍率 2.3 → 2.7
        {
            cooldownTurns: 5,
            effects: [
                { kind: "DAMAGE", multiplier: 2.7 },
                { kind: "SHIELD", shieldRate: 0.25, durationTurns: 2, fromSourceHp: true, applyTo: "ALLIES", fixedDuration: true },
            ],
        },
        // Lv5 CT5 → CT4
        {
            cooldownTurns: 4,
            effects: [
                { kind: "DAMAGE", multiplier: 2.7 },
                { kind: "SHIELD", shieldRate: 0.25, durationTurns: 2, fromSourceHp: true, applyTo: "ALLIES", fixedDuration: true },
            ],
        },
    ],
};
/** クリムの種族ID。判定はあちこちから参照されるので、文字列を直に書かないこと */
export const CRIM_TEMPLATE_ID = "crim";
export const CRIM = {
    templateId: CRIM_TEMPLATE_ID,
    baseName: "クリム",
    role: "アタッカー",
    emoji: "🐉",
    // 光しか存在しない。他属性版は作らない
    elements: ["LIGHT"],
    noElementFlavor: true,
    baseStats: {
        hp: fromStar6Lv60(18_000),
        atk: fromStar6Lv60(2_300),
        def: fromStar6Lv60(1_250),
        // 速度・クリ率・クリダメ・命中・抵抗は★とLvで伸びない。設計値をそのまま置く
        spd: 118,
        criRate: 0.20,
        criDmg: 1.60,
        accuracy: 0.15,
        resistance: 0.15,
    },
    skill1: CRIM_S1,
    skill2Variants: [CRIM_S2],
    skill3Variants: [CRIM_S3],
    dexNote: "CRIMONの看板モンスター。全員へ1体だけ配られる特別な相棒で、売却や素材にはできません。"
        + "単体を撃ち抜いた傷を周りへ広げるS1、全体2回攻撃で攻撃を削るS2、"
        + "味方全体を守りながら薙ぎ払うS3を持ち、育てれば冒険とダンジョンの周回で長く戦えます。",
};
export const CRIM_TEMPLATES = [CRIM];
