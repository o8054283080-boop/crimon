/**
 * 倍率の表。
 *
 * **攻撃力を下げているモンスターは1体もいない。**攻撃はそのモンスターの
 * 立ち位置そのものなので、ここでは触らない(上げるのは初期星の底上げと、
 * ★3より弱かったフェンリル・サンダービーストだけ)。
 *
 * 下げているのは**攻撃上位のアタッカーの防御**だけ。理由は表の中に書いた。
 */
export const PLAYER_STAT_BOOST = {
    // --- 初期★3 ---
    slime: { hp: 1.24, atk: 1.24, def: 1.24 },
    wolf: { hp: 1.24, atk: 1.24, def: 1.24 },
    kobold: { hp: 1.24, atk: 1.24, def: 1.24 },
    imp: { hp: 1.25, atk: 1.13, def: 1.43 },
    mushroon: { hp: 1.13, atk: 1.13, def: 1.13 },
    knight: { hp: 1.05, atk: 1, def: 1.11 },
    golem: { hp: 1, atk: 1, def: 1.27 },
    treant: { hp: 1, atk: 1, def: 1.41 },
    shellturtle: { hp: 1, atk: 1, def: 1.56 },
    wisp: { hp: 1.39, atk: 1, def: 1.35 },
    fairy: { hp: 1.55, atk: 1, def: 1.80 },
    // --- 初期★4 ---
    /*
     * グリフォンは★4アタッカーの当たり枠。攻撃3位まで見れば妥当だが、
     * **防御まで1位**だったので下げる(下のドラゴン・ネメシスと同じ理由)。
     */
    griffon: { hp: 1.13, atk: 1.13, def: 0.99 },
    /*
     * **★4なのに★3のアタッカー3体すべてより弱かった。**フェンリルと同じ穴。
     * 指数 4264 に対し、ウルフ 4512 / スライム 4396 / コボルト 4356。
     * ★4アタッカーの位置(★3の上・★5の下)へ引き上げる。
     */
    thunderbeast: { hp: 1.24, atk: 1.28, def: 1.26 },
    basilisk: { hp: 1.10, atk: 1.08, def: 1.12 },
    mimic: { hp: 1.27, atk: 1, def: 1.34 },
    valkyria: { hp: 1.21, atk: 1, def: 1.20 },
    // --- 初期★5 ---
    abyssreaper: { hp: 1.23, atk: 1, def: 1.56 },
    behemoth: { hp: 1.39, atk: 1, def: 1.52 },
    chronos: { hp: 1.60, atk: 1, def: 1.60 },
    /*
     * **攻撃1位が防御まで1位だった。**アタッカー8体の中での順位:
     *
     *   ネメシス  攻撃1位 / 防御1位 / 速度1位 / HP2位
     *   ドラゴン  攻撃2位 / 防御2位 / 速度2位 / HP5位
     *
     * 全22体で見ればHPも防御も中位(14位)なので数字は目立たないが、
     * **同じ役割の中では最上位**。攻撃で勝つ代わりに打たれ弱い、という
     * アタッカーの形になっていなかった。攻撃と速度はそのまま、防御だけ
     * アタッカーの中ほどへ下げる。
     */
    dragon: { hp: 1, atk: 1, def: 0.86 },
    nemesis: { hp: 1, atk: 1, def: 0.76 },
    /*
     * **★5なのに★3より弱かった。**★6 Lv60・闇属性・装備なしの指数で
     * フェンリル 3891 に対し、ウルフ 4311 / スライム 4236 / コボルト 4156。
     * 初期★3の3体すべてに負けている。★5として引いた意味が無い。
     *
     * ここだけは他の★5アタッカー(ドラゴン・ネメシス)と違って基準側ではないので、
     * 表へ入れて引き上げる。ドラゴンの93%あたりへ置いた。
     *
     * 攻撃より HP と防御を厚くしてあるのは、フェンリルが**とどめ役**だから。
     * S3「終焉の牙」は0.69倍×5回で相手のHPが30%以下なら+25%、潜在覚醒も
     * 「S1で倒すと行動ゲージ+50%」。前に出て削り切る役なので、殴られても
     * 立っていられる方が仕事が回る。
     */
    fenrir: { hp: 1.32, atk: 1.20, def: 1.32 },
};
const NO_BOOST = { hp: 1, atk: 1, def: 1 };
/**
 * 今の星ごとの効き方。**★5から効き始め、★6で満額。**
 *
 * 序盤には効かせない。装備ダンジョン1階は「★3のLv上限・装備なしでは
 * 勝てない」ところに置いてあり(`tests/equipmentDungeonBalance.test.ts`)、
 * ここが**装備を取りに行く理由**そのものになっている。
 * 満額を最初から掛けたとき、その勝率が実測で 12% から 100% へ飛んだ。
 *
 * 意味としても素直で、**育て切った人への報い**になる。
 */
const BOOST_RATIO_BY_STAR = { 5: 0.5, 6: 1 };
/**
 * そのテンプレートと今の星での倍率。
 *
 * 星を渡さないと満額(★6と同じ)。図鑑のように「育て切ったらどうなるか」を
 * 見せる場所で使う。
 */
export function playerStatBoostOf(templateId, star) {
    if (templateId === undefined)
        return NO_BOOST;
    const full = PLAYER_STAT_BOOST[templateId];
    if (full === undefined)
        return NO_BOOST;
    const ratio = star === undefined ? 1 : BOOST_RATIO_BY_STAR[star] ?? 0;
    if (ratio === 0)
        return NO_BOOST;
    return {
        hp: 1 + (full.hp - 1) * ratio,
        atk: 1 + (full.atk - 1) * ratio,
        def: 1 + (full.def - 1) * ratio,
    };
}
/**
 * HP・攻撃・防御へ倍率を掛ける。**速度と会心・命中・抵抗はそのまま。**
 *
 * 何も変わらないときは元のオブジェクトをそのまま返す。
 */
export function applyPlayerStatBoost(stats, templateId, star) {
    const boost = playerStatBoostOf(templateId, star);
    if (boost.hp === 1 && boost.atk === 1 && boost.def === 1)
        return stats;
    return {
        ...stats,
        hp: Math.round(stats.hp * boost.hp),
        atk: Math.round(stats.atk * boost.atk),
        def: Math.round(stats.def * boost.def),
    };
}
