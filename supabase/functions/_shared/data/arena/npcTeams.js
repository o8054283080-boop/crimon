/**
 * 編成テンプレート。**段ごとに複数用意して、毎回同じ顔ぶれにならないようにする。**
 * 1つの段に1つしか無いと、その帯の相手が全員同じになる。
 */
export const ARENA_NPC_TEAMS = [
    /* ---------------- 段0: 覚えたての編成。役割は揃っているが噛み合いは浅い ---------------- */
    {
        id: "starter_pack",
        claims: [],
        name: "手探りの4体",
        note: "殴る係と守る係を1体ずつ置いただけの編成",
        tier: 0,
        members: [
            { dexId: "wolf_FIRE", role: "ATTACK" },
            { dexId: "slime_ELECTRIC", role: "ATTACK" },
            { dexId: "knight_WATER", role: "DEFENSE" },
            { dexId: "fairy_GRASS", role: "SUPPORT" },
        ],
    },
    {
        id: "stone_wall",
        claims: ["HEAL", "GUARD"],
        name: "石垣",
        note: "硬い前衛で受けて、回復でしのぐ",
        tier: 0,
        members: [
            { dexId: "golem_WATER", role: "DEFENSE" },
            { dexId: "treant_GRASS", role: "HP" },
            { dexId: "fairy_WATER", role: "SUPPORT" },
            { dexId: "knight_FIRE", role: "ATTACK" },
        ],
    },
    {
        id: "swamp_start",
        claims: ["POISON", "DEBUFF"],
        name: "沼地の使い",
        note: "毒と弱体を重ねて削り切る",
        tier: 0,
        members: [
            { dexId: "imp_DARK", role: "DISRUPT" },
            { dexId: "slime_DARK", role: "DISRUPT" },
            { dexId: "mushroon_GRASS", role: "DISRUPT" },
            { dexId: "shellturtle_WATER", role: "DEFENSE" },
        ],
    },
    /* ---------------- 段1: 戦い方が1つに決まっている編成 ---------------- */
    {
        id: "gale_hunt",
        /*
         * **「動く前に落とす」とは名乗れない。** この4体は最大倍率が1.65で、
         * スタンもゲージ減少も持っていない。できるのは「全員が先に動く」ことと
         * 「弱らせること」だけなので、名乗りも説明もそこへ合わせてある
         * (`tests/arenaNpcTeams.test.ts` が実際のスキルをたどって拾った)。
         */
        claims: ["SPEED", "DEBUFF"],
        name: "疾風の狩り",
        note: "電気で固めて全員が先に動き、弱らせてから削る",
        tier: 1,
        set: "SWIFT",
        members: [
            { dexId: "wolf_ELECTRIC", role: "ATTACK" },
            { dexId: "thunderbeast_ELECTRIC", role: "ATTACK" },
            { dexId: "wisp_ELECTRIC", role: "SUPPORT" },
            { dexId: "knight_ELECTRIC", role: "DEFENSE" },
        ],
    },
    {
        id: "bulwark",
        claims: ["HEAL", "GUARD"],
        name: "城壁",
        note: "落ちない前衛と回復で、時間を味方にする",
        tier: 1,
        set: "GUARD",
        members: [
            { dexId: "shellturtle_WATER", role: "DEFENSE" },
            { dexId: "mimic_WATER", role: "HP" },
            { dexId: "fairy_WATER", role: "SUPPORT" },
            { dexId: "knight_WATER", role: "ATTACK" },
        ],
    },
    {
        id: "chain_venom",
        claims: ["POISON", "CONTROL"],
        name: "鎖と毒",
        note: "手番を奪いながら毒を積む",
        tier: 1,
        set: "ACCURACY_SET",
        members: [
            { dexId: "basilisk_DARK", role: "DISRUPT" },
            { dexId: "mushroon_DARK", role: "DISRUPT" },
            { dexId: "imp_DARK", role: "DISRUPT" },
            { dexId: "treant_DARK", role: "HP" },
        ],
    },
    /* ---------------- 段2: 役割が噛み合い始める編成 ---------------- */
    {
        id: "sky_raid",
        claims: ["BURST", "SPEED"],
        name: "翼の急襲",
        note: "高い攻撃力を先手で押し付ける",
        tier: 2,
        set: "CRIT",
        members: [
            { dexId: "griffon_ELECTRIC", role: "ATTACK" },
            { dexId: "griffon_FIRE", role: "ATTACK" },
            { dexId: "wisp_ELECTRIC", role: "SUPPORT" },
            { dexId: "knight_ELECTRIC", role: "DEFENSE" },
        ],
    },
    {
        id: "sanctuary",
        claims: ["HEAL", "GUARD"],
        name: "聖域",
        note: "回復と防壁を切らさず、削り負けない",
        tier: 2,
        members: [
            { dexId: "seraph_LIGHT", role: "SUPPORT" },
            { dexId: "valkyria_LIGHT", role: "SUPPORT" },
            { dexId: "behemoth_GRASS", role: "HP" },
            { dexId: "knight_LIGHT", role: "DEFENSE" },
        ],
    },
    {
        id: "hex_breaker",
        claims: ["STRIP"],
        name: "解呪の刃",
        note: "強化を剥がしてから殴る",
        tier: 2,
        members: [
            { dexId: "abyssreaper_DARK", role: "DISRUPT" },
            { dexId: "mimic_DARK", role: "HP" },
            { dexId: "valkyria_WATER", role: "SUPPORT" },
            { dexId: "fenrir_FIRE", role: "ATTACK" },
        ],
    },
    /* ---------------- 段3: 戦術が完成している編成 ---------------- */
    {
        id: "dragonfire_verdict",
        claims: ["BURST"],
        name: "竜火の断罪",
        note: "支えを固めた上での、一撃必殺",
        tier: 3,
        set: "CRIT",
        members: [
            { dexId: "dragon_FIRE", role: "ATTACK" },
            { dexId: "nemesis_ELECTRIC", role: "ATTACK" },
            { dexId: "seraph_WATER", role: "SUPPORT" },
            { dexId: "behemoth_WATER", role: "DEFENSE" },
        ],
    },
    {
        id: "time_thief",
        claims: ["CONTROL", "STRIP"],
        name: "時を止める者",
        note: "手番を奪い、強化を剥がし、返す手を残さない",
        tier: 3,
        members: [
            { dexId: "chronos_LIGHT", role: "SUPPORT" },
            { dexId: "abyssreaper_DARK", role: "DISRUPT" },
            { dexId: "nemesis_DARK", role: "ATTACK" },
            { dexId: "mimic_LIGHT", role: "HP" },
        ],
    },
    {
        id: "fang_sprint",
        claims: ["SPEED"],
        name: "狼牙の疾走",
        note: "全員が先に動く。返す手番を作らせない",
        tier: 3,
        set: "SWIFT",
        members: [
            { dexId: "fenrir_ELECTRIC", role: "ATTACK" },
            { dexId: "thunderbeast_ELECTRIC", role: "ATTACK" },
            { dexId: "chronos_ELECTRIC", role: "SUPPORT" },
            { dexId: "valkyria_ELECTRIC", role: "SUPPORT" },
        ],
    },
    {
        id: "honed_regular",
        claims: [],
        name: "研ぎ澄ました常連",
        note: "通常モンスターだけ。育成と装備で最上位に居座る",
        tier: 3,
        members: [
            { dexId: "knight_WATER", role: "DEFENSE" },
            { dexId: "wolf_FIRE", role: "ATTACK" },
            { dexId: "fairy_LIGHT", role: "SUPPORT" },
            { dexId: "imp_DARK", role: "DISRUPT" },
        ],
    },
    /* ---------------- 段4・段5: レート2700から上の相手 ----------------
     *
     * **段3より数値が高いのではない。**星もレベルも装備の強化も同じ上限で、
     * 違うのは**噛み合い方の徹底ぶり**と、装備の厳選の回数(`gearRolls`)。
     *
     * ここを作った理由は、2700を越えた人に同じ相手しか並ばなかったこと。
     * 上限だけ上げても、伸びしろの無い相手が横に広がるだけになる。
     *
     * ## 段4と段5の分け方は、実測で決めた
     *
     * **設定を眺めても強さは分からない。**育成が全部カンストした編成どうしでは
     * 表に差が1行も出ず、効くのは顔ぶれの噛み合い方だけになる。
     * 同じ相手へ30戦ずつぶつけて、挑む側の勝率で並べ替えてある
     * (`npx tsx tools/arenaNpcPressure.ts --teams`)。
     *
     *   段5(勝率0〜23%) … 巨獣の潮 / 免疫の砦 / 審判の城壁 /
     *                      聖なる宝箱 / 時を制す殲滅 / 極めた常連
     *   段4(勝率47%〜)  … 聖炎の盾 / 呪いの宴 / 崩壊の刃 / 暴走の連鎖
     *
     * **数字を触ったら並べ替え直すこと。**順番が入れ替わったまま帯へ配ると、
     * 上のレートほど弱い相手が並ぶ、という逆転が黙って起きる。
     */
    {
        id: "titan_tide",
        claims: ["HEAL", "GUARD", "CONTROL"],
        name: "巨獣の潮",
        note: "HPを積むほど攻撃も回復も重くなる。先に動いて、押し潰す",
        tier: 5,
        /*
         * **HP比例で殴る顔ぶれを、速度シリーズで先に動かす。**
         *
         * ベヒモスの「巨体の圧力」は最大HP×0.20、フェニックスの「灼熱転生」は×0.18。
         * どちらもHPがそのまま火力なので、耐久を積むことが火力を積むことになる——
         * 普通は選ばされる二択が、この顔ぶれでは両立してしまう。
         * フェニックスの回復も最大HP基準なので、積んだHPが三重に効く。
         *
         * 体力型はふつう遅い。そこを疾風4セットで埋めると、
         * **硬くて重くて先に動く**という噛み合いになる。
         */
        set: "SWIFT",
        members: [
            { dexId: "behemoth_LIGHT", role: "HP" },
            { dexId: "phoenix_WATER", role: "HP" },
            { dexId: "mimic_DARK", role: "HP" },
            { dexId: "chronos_ELECTRIC", role: "SUPPORT" },
        ],
    },
    {
        id: "rampage_chain",
        claims: ["SPEED", "HEAL", "DEBUFF"],
        name: "暴走の連鎖",
        note: "追加の手番が続く。回復を挟まれる前に削り切られる",
        tier: 4,
        /*
         * 暴走4セット。行動終了時に追加ターンが乗る回数が、そのまま手数の差になる。
         *
         * **暴走は4個そろえないと何も起きない。**そのぶん会心シリーズの2個セット
         * (クリ率+15%)を諦めることになり、最初に組んだ顔ぶれでは
         * 攻撃役が会心を出せず、実測で**勝率100%(=最弱)**だった。
         * 追加ターンが増えても、その1回が軽ければ手数の意味が無い。
         * 1手の重さを足すために、グリフォンへ差し替えてある。
         */
        set: "RAMPAGE",
        members: [
            { dexId: "fenrir_ELECTRIC", role: "ATTACK" },
            { dexId: "griffon_GRASS", role: "ATTACK" },
            { dexId: "chronos_ELECTRIC", role: "SUPPORT" },
            { dexId: "seraph_WATER", role: "SUPPORT" },
        ],
    },
    {
        id: "collapse_edge",
        claims: ["BURST", "STRIP", "HEAL"],
        name: "崩壊の刃",
        note: "硬さを当てにできない。強化を剥がしてから、一撃で抜く",
        tier: 4,
        // 崩壊4セット。守りを固める相手ほど、この編成には通じない
        set: "COLLAPSE",
        members: [
            { dexId: "dragon_DARK", role: "ATTACK" },
            { dexId: "griffon_GRASS", role: "ATTACK" },
            { dexId: "abyssreaper_DARK", role: "DISRUPT" },
            { dexId: "phoenix_FIRE", role: "SUPPORT" },
        ],
    },
    {
        id: "time_annihilation",
        claims: ["CONTROL", "SPEED"],
        name: "時を制す殲滅",
        note: "手番を奪われ、返す前に全体を抜かれる",
        tier: 5,
        /*
         * 水クロノスは的中26%と抵抗22%を素で持ち、**弱体が通りやすい。**
         * S2「時間加速」で闇ドラゴンのゲージを50%進めつつクールタイムを1縮め、
         * S3「時空崩壊」で敵全体のゲージを100%飛ばす。
         * その空いた手番に、防御を無視する「破壊の流星」が落ちてくる。
         */
        set: "SWIFT",
        members: [
            { dexId: "chronos_WATER", role: "SUPPORT" },
            { dexId: "valkyria_ELECTRIC", role: "SUPPORT" },
            { dexId: "dragon_DARK", role: "ATTACK" },
            { dexId: "seraph_WATER", role: "SUPPORT" },
        ],
    },
    {
        id: "treasure_veil",
        claims: ["GUARD", "SPEED", "BURST"],
        name: "聖なる宝箱",
        note: "無敵で攻めを1手やり過ごし、その間に距離を詰めてくる",
        tier: 5,
        /*
         * 光ミミックの「聖なる宝箱」は**味方全体へ1ターンの無敵。**
         * 素の速度は92と遅いので、補助の型紙で速度メインを積んで先に撃たせる。
         * ヴァルキリアの号令が全体のゲージを20%進めるので、無敵の1ターンが
         * そのまま殴る番に変わる。
         */
        set: "SWIFT",
        members: [
            { dexId: "mimic_LIGHT", role: "SUPPORT" },
            { dexId: "valkyria_ELECTRIC", role: "SUPPORT" },
            { dexId: "nemesis_LIGHT", role: "ATTACK" },
            { dexId: "dragon_FIRE", role: "ATTACK" },
        ],
    },
    {
        id: "immune_bastion",
        claims: ["HEAL", "GUARD"],
        name: "免疫の砦",
        note: "状態異常が通らない。崩す手を持たないと、削り切れない",
        tier: 5,
        /*
         * 免疫4セットで**戦闘開始から2ターン、状態異常が入らない。**
         * 開幕に弱体を入れて優位を作る戦い方が、そのまま空振りになる。
         * ウィスプのS3がさらに2ターンの無効を重ねるので、切れ目が薄い。
         */
        set: "IMMUNITY_SET",
        members: [
            { dexId: "behemoth_WATER", role: "HP" },
            { dexId: "shellturtle_LIGHT", role: "DEFENSE" },
            { dexId: "wisp_WATER", role: "SUPPORT" },
            { dexId: "fairy_WATER", role: "SUPPORT" },
        ],
    },
    {
        id: "phoenix_aegis",
        claims: ["GUARD", "SPEED", "BURST"],
        name: "聖炎の盾",
        note: "主力に無敵が乗る。落とす順番を間違えると手が尽きる",
        tier: 4,
        /*
         * 光フェニックスの「輪廻の聖炎」は**味方1体へ3ターンの無敵。**
         * 貼られた先が5.0倍の「ラストジャッジメント」を持つ光ネメシスなので、
         * 主力を落として止める、という基本の手が3ターン封じられる。
         * CT7と長いぶん、掛かっている間に決着を付けに来る。
         */
        set: "SWIFT",
        members: [
            { dexId: "phoenix_LIGHT", role: "SUPPORT" },
            { dexId: "valkyria_ELECTRIC", role: "SUPPORT" },
            { dexId: "nemesis_LIGHT", role: "ATTACK" },
            { dexId: "griffon_LIGHT", role: "ATTACK" },
        ],
    },
    {
        id: "curse_carnival",
        claims: ["CONTROL", "DEBUFF"],
        name: "呪いの宴",
        note: "撒かれた呪いが一斉に弾ける。手番を奪われたまま終わる",
        tier: 4,
        /*
         * ジョーカーの呪いは**2回目のターン開始時に、付与時攻撃力×4の固定ダメージと
         * 1ターンのスタン。**S2「最低なイタズラ」が呪いを即時発動させ、
         * しかも使用後に追加ターンを得る。2体で撒いて一度に起こす形。
         */
        set: "ACCURACY_SET",
        members: [
            { dexId: "joker_ELECTRIC", role: "DISRUPT" },
            { dexId: "joker_DARK", role: "DISRUPT" },
            { dexId: "chronos_ELECTRIC", role: "SUPPORT" },
            { dexId: "seraph_WATER", role: "SUPPORT" },
        ],
    },
    {
        id: "judgment_bulwark",
        claims: ["GUARD", "BURST", "DEBUFF"],
        name: "審判の城壁",
        note: "守りを固めるほど一撃が重くなる。硬いのに、殴ると痛い",
        tier: 5,
        /*
         * **防御が火力になる顔ぶれ。**
         *
         * 光ネメシスの「ラストジャッジメント」は防御力×1.5、闇シェルタートルの
         * 「アビスシェル」と闇ゴーレムの「オブシディアンクラッシュ」も同じ×1.5。
         * 守護4セットで防御を積むと、耐久と火力が同時に伸びる——
         * ふつうは選ばされる二択が、ここでは両立してしまう。
         *
         * 「巨獣の潮」がHPで同じことをする編成なので、**対になっている。**
         */
        set: "GUARD",
        members: [
            { dexId: "nemesis_LIGHT", role: "DEFENSE" },
            { dexId: "shellturtle_DARK", role: "DEFENSE" },
            { dexId: "golem_DARK", role: "DEFENSE" },
            { dexId: "phoenix_WATER", role: "SUPPORT" },
        ],
    },
    {
        id: "honed_normal",
        claims: ["HEAL", "DEBUFF"],
        name: "極めた常連",
        note: "通常モンスターだけ。厳選しきった装備だけで最上位に並ぶ",
        tier: 5,
        /*
         * **最上段を高レアだけで埋めない。**
         * `docs/design-concept.md` の芯は「ふつうのモンスターでも、育てて
         * 装備を整えれば奥まで行ける」。ここを引き当てた顔ぶれだけにすると、
         * 相手編成そのものが「ここから先は引き次第だ」と言ってしまう。
         */
        members: [
            { dexId: "golem_DARK", role: "DEFENSE" },
            { dexId: "wolf_DARK", role: "ATTACK" },
            { dexId: "fairy_LIGHT", role: "SUPPORT" },
            { dexId: "imp_DARK", role: "DISRUPT" },
        ],
    },
];
/** その段で使える編成テンプレート。1つも無ければ全体から返す(空を返さない) */
export function arenaNpcTeamsForTiers(tiers) {
    const matched = ARENA_NPC_TEAMS.filter((team) => tiers.includes(team.tier));
    return matched.length > 0 ? matched : ARENA_NPC_TEAMS;
}
