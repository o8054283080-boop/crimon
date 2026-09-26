import { MonsterTemplate } from "../../core/monster.js";
import { Skill } from "../../core/skill.js";
import { ATK_UP, DEF_DOWN, DEF_UP, SPD_DOWN } from "../../core/statusValues.js";
import { passive } from "../newMonsters/shared.js";
import { described, fromStar6Lv60 } from "./shared.js";

/**
 * ★5 グジラ。**アタッカーのコラボモンスター。**
 *
 * 攻撃2,500は4種で最も高く、防御920は最も低い。
 * **殴ることしかできない代わりに、殴る力が抜けている**という形で、
 * 守りは他の3種か既存のタンクに任せる前提で置いてある。
 *
 * ## ★6 Lv60 の到達値(属性補正前)
 *
 *   HP 18,600 / 攻撃 2,500 / 防御 920 / 速度 90
 *   クリ率 18% / クリダメ +60% / 命中 15% / 抵抗 15%
 *
 * **速度90は4種で最も遅い。**先に殴られることを前提にした種族で、
 * 闇の「深淵の主」は殴られるほど強くなる形になっている。
 */

/**
 * S1「はら」。**ただ殴る。**
 *
 * 追加効果を1つも持たない代わりに、スキル1としては最も高い倍率。
 * Lvごとの伸びも +0.15 ずつで一定——
 * **この種族のスキル1は、育てた分だけまっすぐ強くなる。**
 */
const GUJIRA_S1: Skill = described({
  id: "gujira_s1",
  name: "はら",
  description: "",
  target: "SINGLE_ENEMY",
  cooldownTurns: 0,
  effects: [
    { kind: "DAMAGE", multiplier: 1.5 },
  ],
  levelOverrides: [
    // Lv1
    { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.5 }] },
    // Lv2 ダメージ倍率 1.50倍→1.65倍
    { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.65 }] },
    // Lv3 ダメージ倍率 1.65倍→1.80倍
    { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.8 }] },
    // Lv4 ダメージ倍率 1.80倍→2.00倍
    { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 2 }] },
    // Lv5 ダメージ倍率 2.00倍→2.20倍
    { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 2.2 }] },
  ],
}, "【対象】敵単体。追加効果を持たない代わりに、スキル1としては倍率が高い。");

/**
 * S2候補A「ぐるぐるプレス」。**単体を潰して止める。**
 *
 * 気絶は1ターン固定。CT2まで縮むので、
 * **同じ相手を止め続ける**組み立てができる。
 */
const GUJIRA_S2_PRESS: Skill = described({
  id: "gujira_s2_press",
  name: "ぐるぐるプレス",
  description: "",
  target: "SINGLE_ENEMY",
  cooldownTurns: 3,
  effects: [
    { kind: "DAMAGE", multiplier: 3 },
    { kind: "STUN", durationTurns: 1, chance: 0.4 },
  ],
  levelOverrides: [
    // Lv1
    { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 3 }, { kind: "STUN", durationTurns: 1, chance: 0.4 }] },
    // Lv2 ダメージ倍率 3.00倍→3.20倍
    { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 3.2 }, { kind: "STUN", durationTurns: 1, chance: 0.4 }] },
    // Lv3 スタンの発動率 40%→50%
    { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 3.2 }, { kind: "STUN", durationTurns: 1, chance: 0.5 }] },
    // Lv4 ダメージ倍率 3.20倍→3.60倍
    { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 3.6 }, { kind: "STUN", durationTurns: 1, chance: 0.5 }] },
    // Lv5 クールタイム -1(3→2ターン) / ダメージ倍率 3.60倍→3.70倍
    { cooldownTurns: 2, effects: [{ kind: "DAMAGE", multiplier: 3.7 }, { kind: "STUN", durationTurns: 1, chance: 0.5 }] },
  ],
}, "【対象】敵単体。気絶は1ターン固定。クールタイムが短いので、同じ相手を止め続けられる。");

/**
 * S2候補B「地震」。**全体を薙ぎ、守りを崩す。**
 *
 * 防御DOWNが通ればこのグジラ自身の次の一撃も通りやすくなる。
 * 気絶は15%と低く、1ターン固定——全体気絶は戦況を固めるので伸ばさない。
 */
const GUJIRA_S2_QUAKE: Skill = described({
  id: "gujira_s2_quake",
  name: "地震",
  description: "",
  target: "ALL_ENEMIES",
  cooldownTurns: 3,
  effects: [
    { kind: "DAMAGE", multiplier: 1.9 },
    { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.55 },
    { kind: "STUN", durationTurns: 1, chance: 0.15 },
  ],
  levelOverrides: [
    // Lv1
    { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.9 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.55 }, { kind: "STUN", durationTurns: 1, chance: 0.15 }] },
    // Lv2 ダメージ倍率 1.90倍→2.00倍
    { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 2 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.55 }, { kind: "STUN", durationTurns: 1, chance: 0.15 }] },
    // Lv3 弱体の発動率 55%→65%
    { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 2 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.65 }, { kind: "STUN", durationTurns: 1, chance: 0.15 }] },
    // Lv4 ダメージ倍率 2.00倍→2.10倍 / 弱体の持続 2→3ターン
    { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 2.1 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 3, chance: 0.65 }, { kind: "STUN", durationTurns: 1, chance: 0.15 }] },
    // Lv5 クールタイム -1(3→2ターン) / ダメージ倍率 2.10倍→2.20倍 / 弱体の発動率 65%→70%
    { cooldownTurns: 2, effects: [{ kind: "DAMAGE", multiplier: 2.2 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 3, chance: 0.7 }, { kind: "STUN", durationTurns: 1, chance: 0.15 }] },
  ],
}, "【対象】敵全体。気絶は1ターン固定。守りを崩してから自分の必殺技へ繋ぐ形になる。");

/**
 * S2候補C「ホエールブースト」。**身構えて、そのまま動く。**
 *
 * 攻撃UP・防御UP・シールドを自分へ配ってから**即座にもう一度動く**
 * (`extraTurn`)。この種族は速度が最も遅いので、
 * 「1回動く間に2手」は行動順の不利をそのまま埋める形になっている。
 * 攻撃UPと防御UPの持続は3ターン固定。
 */
const GUJIRA_S2_BOOST: Skill = described({
  id: "gujira_s2_whale_boost",
  name: "ホエールブースト",
  description: "",
  target: "SELF",
  cooldownTurns: 4,
  extraTurn: true,
  effects: [
    { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3, fixedDuration: true },
    { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 3, fixedDuration: true },
    { kind: "SHIELD", shieldRate: 0.2, durationTurns: 3, fixedDuration: true },
  ],
  levelOverrides: [
    // Lv1
    {
      cooldownTurns: 4,
      effects: [
        { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3, fixedDuration: true },
        { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 3, fixedDuration: true },
        { kind: "SHIELD", shieldRate: 0.2, durationTurns: 3, fixedDuration: true },
      ],
    },
    // Lv2 シールド 20% → 23%
    {
      cooldownTurns: 4,
      effects: [
        { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3, fixedDuration: true },
        { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 3, fixedDuration: true },
        { kind: "SHIELD", shieldRate: 0.23, durationTurns: 3, fixedDuration: true },
      ],
    },
    // Lv3 シールド 23% → 25%
    {
      cooldownTurns: 4,
      effects: [
        { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3, fixedDuration: true },
        { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 3, fixedDuration: true },
        { kind: "SHIELD", shieldRate: 0.25, durationTurns: 3, fixedDuration: true },
      ],
    },
    // Lv4 シールド 25% → 30%
    {
      cooldownTurns: 4,
      effects: [
        { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3, fixedDuration: true },
        { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 3, fixedDuration: true },
        { kind: "SHIELD", shieldRate: 0.3, durationTurns: 3, fixedDuration: true },
      ],
    },
    // Lv5 CT4 → CT3
    {
      cooldownTurns: 3,
      effects: [
        { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3, fixedDuration: true },
        { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 3, fixedDuration: true },
        { kind: "SHIELD", shieldRate: 0.3, durationTurns: 3, fixedDuration: true },
      ],
    },
  ],
}, "【対象】自身。シールド量は自分の最大HPが基準。身構えてすぐもう一度動けるので、遅さを取り戻せる。");

/**
 * S3候補A「大津波」。**先に守りを崩してから薙ぐ。**
 *
 * **防御DOWNの判定が攻撃より前**。効果は配列順に処理されるので、
 * 並びがそのまま順番になる。成功した相手には、
 * **その同じ攻撃から**守りの低下が効く。
 */
const GUJIRA_S3_TSUNAMI: Skill = described({
  id: "gujira_s3_tsunami",
  name: "大津波",
  description: "",
  target: "ALL_ENEMIES",
  cooldownTurns: 6,
  effects: [
    { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.65 },
    { kind: "DAMAGE", multiplier: 2.5 },
  ],
  levelOverrides: [
    // Lv1
    { cooldownTurns: 6, effects: [{ kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.65 }, { kind: "DAMAGE", multiplier: 2.5 }] },
    // Lv2 ダメージ倍率 2.50倍→2.70倍
    { cooldownTurns: 6, effects: [{ kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.65 }, { kind: "DAMAGE", multiplier: 2.7 }] },
    // Lv3 弱体の発動率 65%→75%
    { cooldownTurns: 6, effects: [{ kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.75 }, { kind: "DAMAGE", multiplier: 2.7 }] },
    // Lv4 弱体の持続 2→3ターン / 弱体の発動率 75%→80% / ダメージ倍率 2.70倍→2.80倍
    { cooldownTurns: 6, effects: [{ kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 3, chance: 0.8 }, { kind: "DAMAGE", multiplier: 2.8 }] },
    // Lv5 クールタイム -1(6→5ターン) / ダメージ倍率 2.80倍→3.00倍
    { cooldownTurns: 5, effects: [{ kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 3, chance: 0.8 }, { kind: "DAMAGE", multiplier: 3 }] },
  ],
}, "【対象】敵全体。守りを崩す判定が先なので、通った相手にはこの一撃から低下が効く。");

/**
 * S3候補B「ウェーブプレス」。**自分を削って、速い相手を刺す。**
 *
 * 自傷は最大HPの25%固定。**この自傷で倒れることもある**——
 * 既存の自傷と同じ扱いで、HP1で止まる仕組みは入れていない。
 * 撃つかどうかの判断がそのまま賭けになる。
 *
 * 相手が自分より速ければ防御無視が乗る。この種族は最も遅いので、
 * **たいていの相手に条件が成立する**設計。
 */
const GUJIRA_S3_WAVE_PRESS: Skill = described({
  id: "gujira_s3_wave_press",
  name: "ウェーブプレス",
  description: "",
  target: "SINGLE_ENEMY",
  cooldownTurns: 5,
  effects: [
    { kind: "SELF_DAMAGE", ratio: 0.25 },
    { kind: "DAMAGE", multiplier: 6.5, conditionalIgnoreDefense: { when: "TARGET_SPD_ABOVE_SELF", ratio: 0.5 } },
  ],
  levelOverrides: [
    // Lv1
    { cooldownTurns: 5, effects: [{ kind: "SELF_DAMAGE", ratio: 0.25 }, { kind: "DAMAGE", multiplier: 6.5, conditionalIgnoreDefense: { when: "TARGET_SPD_ABOVE_SELF", ratio: 0.5 } }] },
    // Lv2 ダメージ倍率 6.50倍→6.90倍
    { cooldownTurns: 5, effects: [{ kind: "SELF_DAMAGE", ratio: 0.25 }, { kind: "DAMAGE", multiplier: 6.9, conditionalIgnoreDefense: { when: "TARGET_SPD_ABOVE_SELF", ratio: 0.5 } }] },
    // Lv3 対象の速度が自分より高いなら防御無視 50%→55%
    { cooldownTurns: 5, effects: [{ kind: "SELF_DAMAGE", ratio: 0.25 }, { kind: "DAMAGE", multiplier: 6.9, conditionalIgnoreDefense: { when: "TARGET_SPD_ABOVE_SELF", ratio: 0.55 } }] },
    // Lv4 ダメージ倍率 6.90倍→7.40倍
    { cooldownTurns: 5, effects: [{ kind: "SELF_DAMAGE", ratio: 0.25 }, { kind: "DAMAGE", multiplier: 7.4, conditionalIgnoreDefense: { when: "TARGET_SPD_ABOVE_SELF", ratio: 0.55 } }] },
    // Lv5 クールタイム -1(5→4ターン) / ダメージ倍率 7.40倍→7.50倍 / 対象の速度が自分より高いなら防御無視 55%→60%
    { cooldownTurns: 4, effects: [{ kind: "SELF_DAMAGE", ratio: 0.25 }, { kind: "DAMAGE", multiplier: 7.5, conditionalIgnoreDefense: { when: "TARGET_SPD_ABOVE_SELF", ratio: 0.6 } }] },
  ],
}, "【対象】敵単体。自傷の割合は伸びない。HPが足りない時に撃つと自分が倒れるので、撃つ判断そのものが賭けになる。");

/**
 * S3候補C「ホワイトサージ」。**会心した時だけ、さらに刺さる。**
 *
 * 固定ダメージは**防御でも会心倍率でも変わらない**(`FLAT_DAMAGE`)。
 * 会心したかどうかだけで決まるので、
 * クリ率を積むほどこの技の期待値が素直に上がる。
 */
const GUJIRA_S3_SURGE: Skill = described({
  id: "gujira_s3_white_surge",
  name: "ホワイトサージ",
  description: "",
  target: "SINGLE_ENEMY",
  cooldownTurns: 5,
  effects: [
    { kind: "DAMAGE", multiplier: 4.8 },
    { kind: "FLAT_DAMAGE", amount: 10000, requires: "ANY_CRIT" },
  ],
  levelOverrides: [
    // Lv1
    { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 4.8 }, { kind: "FLAT_DAMAGE", amount: 10000, requires: "ANY_CRIT" }] },
    // Lv2 ダメージ倍率 4.80倍→5.10倍
    { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 5.1 }, { kind: "FLAT_DAMAGE", amount: 10000, requires: "ANY_CRIT" }] },
    // Lv3 固定ダメージ 10,000→12,000
    { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 5.1 }, { kind: "FLAT_DAMAGE", amount: 12000, requires: "ANY_CRIT" }] },
    // Lv4 ダメージ倍率 5.10倍→5.60倍
    { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 5.6 }, { kind: "FLAT_DAMAGE", amount: 12000, requires: "ANY_CRIT" }] },
    // Lv5 クールタイム -1(5→4ターン) / ダメージ倍率 5.60倍→5.80倍 / 固定ダメージ 12,000→15,000
    { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 5.8 }, { kind: "FLAT_DAMAGE", amount: 15000, requires: "ANY_CRIT" }] },
  ],
}, "【対象】敵単体。固定ダメージは相手の防御でも会心倍率でも変わらないので、硬い相手にも同じだけ通る。");

/**
 * 光S3「キングウェーブ」。**守りを一切見ずに、全員を薙ぐ。**
 *
 * 完全防御無視。倍率は控えめだが、**相手が何を積んでいても同じだけ通る。**
 * 硬さで止める編成に対する答えとして置いてある。
 */
const GUJIRA_S3_LIGHT: Skill = described({
  id: "gujira_s3_king_wave",
  name: "キングウェーブ",
  description: "",
  target: "ALL_ENEMIES",
  cooldownTurns: 6,
  effects: [
    { kind: "DAMAGE", multiplier: 1.6, ignoreDefense: true },
    { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 1.0 },
  ],
  levelOverrides: [
    // Lv1
    {
      cooldownTurns: 6,
      effects: [
        { kind: "DAMAGE", multiplier: 1.6, ignoreDefense: true },
        { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 1.0 },
      ],
    },
    // Lv2 倍率 1.60 → 1.70
    {
      cooldownTurns: 6,
      effects: [
        { kind: "DAMAGE", multiplier: 1.7, ignoreDefense: true },
        { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 1.0 },
      ],
    },
    // Lv3 倍率 1.70 → 1.80
    {
      cooldownTurns: 6,
      effects: [
        { kind: "DAMAGE", multiplier: 1.8, ignoreDefense: true },
        { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 1.0 },
      ],
    },
    // Lv4 倍率 1.80 → 2.00、速度DOWN 2ターン → 3ターン
    {
      cooldownTurns: 6,
      effects: [
        { kind: "DAMAGE", multiplier: 2.0, ignoreDefense: true },
        { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 3, chance: 1.0 },
      ],
    },
    // Lv5 CT6 → CT5
    {
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 2.0, ignoreDefense: true },
        { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 3, chance: 1.0 },
      ],
    },
  ],
}, "【対象】敵全体。相手が防御をどれだけ積んでいても同じだけ通るので、硬さで止める編成への答えになる。");

/**
 * 闇S3「深淵の主」。**殴られるほど強くなる。**
 *
 * **敵の1スキルにつき1スタック。**多段攻撃で4回殴られても1つ。
 * 1ヒット1つにすると、4回殴る技ひとつで上限近くまで飛ぶ。
 *
 * 上限10スタックで攻撃+150% / 速度+50%。この上限と1スタックあたりの
 * 量は全Lv固定で、Lvで伸びるのは被ダメージ軽減とターン開始の回復だけ。
 * **溜まる速さを触らない**のは、溜め切るまでの時間がこの技の代償だから。
 */
const GUJIRA_S3_DARK: Skill = described({
  id: "gujira_s3_abyss_lord",
  name: "深淵の主",
  description: "",
  target: "SELF",
  cooldownTurns: 0,
  effects: [],
  passive: passive("ALWAYS", [
    { kind: "ABYSS_LORD", damageTaken: 0.25, atkPerStack: 0.15, spdPerStack: 0.05, maxStacks: 10, healOnTurn: 0.1 },
    // Lv2 ターン開始の回復 10% → 12%
    { kind: "ABYSS_LORD", damageTaken: 0.25, atkPerStack: 0.15, spdPerStack: 0.05, maxStacks: 10, healOnTurn: 0.12 },
    // Lv3 被ダメージ軽減 25% → 28%
    { kind: "ABYSS_LORD", damageTaken: 0.28, atkPerStack: 0.15, spdPerStack: 0.05, maxStacks: 10, healOnTurn: 0.12 },
    // Lv4 ターン開始の回復 12% → 15%
    { kind: "ABYSS_LORD", damageTaken: 0.28, atkPerStack: 0.15, spdPerStack: 0.05, maxStacks: 10, healOnTurn: 0.15 },
    // Lv5 被ダメージ軽減 28% → 30%
    { kind: "ABYSS_LORD", damageTaken: 0.30, atkPerStack: 0.15, spdPerStack: 0.05, maxStacks: 10, healOnTurn: 0.15 },
  ]),
}, "【対象】自身(パッシブ)。溜まるのは敵のスキル1つにつき1つで、多段攻撃で何回殴られても増え方は変わらない。");

/** グジラの種族ID */
export const GUJIRA_TEMPLATE_ID = "gujira";

export const GUJIRA: MonsterTemplate = {
  templateId: GUJIRA_TEMPLATE_ID,
  baseName: "グジラ",
  role: "アタッカー",
  emoji: "🐋",
  gachaStar: 5,
  baseStats: {
    hp: fromStar6Lv60(18_600),
    atk: fromStar6Lv60(2_500),
    def: fromStar6Lv60(920),
    // 4種で最も遅い。先に殴られることを前提にした種族
    spd: 90,
    criRate: 0.18,
    criDmg: 1.60,
    accuracy: 0.15,
    resistance: 0.15,
  },
  skill1: GUJIRA_S1,
  skill2Variants: [GUJIRA_S2_PRESS, GUJIRA_S2_QUAKE, GUJIRA_S2_BOOST],
  skill3Variants: [GUJIRA_S3_TSUNAMI, GUJIRA_S3_WAVE_PRESS, GUJIRA_S3_SURGE],
  lightSkill3: GUJIRA_S3_LIGHT,
  darkSkill3: GUJIRA_S3_DARK,
  skillAssignment: {
    FIRE: { skill2: 2, skill3: 1 },      // ホエールブースト / ウェーブプレス — 身構えて一撃
    WATER: { skill2: 1, skill3: 0 },     // 地震 / 大津波 — 全体を崩して薙ぐ
    ELECTRIC: { skill2: 0, skill3: 2 },  // ぐるぐるプレス / ホワイトサージ — 単体を会心で落とす
    GRASS: { skill2: 2, skill3: 0 },     // ホエールブースト / 大津波 — 積んでから全体
    LIGHT: { skill2: 1 },                // 地震 / キングウェーブ(固有)
    DARK: { skill2: 0 },                 // ぐるぐるプレス / 深淵の主(固有)
  },
  elementFlavorAssignment: {
    FIRE: 0,      // 攻撃+12% / 防御-12%
    WATER: 2,     // 速度+5% / 防御-8%
    ELECTRIC: 2,  // 攻撃+10% / HP-8%
    GRASS: 1,     // 防御+12% / 攻撃-8%
    LIGHT: 2,     // HP+10% / クリダメ-4%
    DARK: 3,      // HP+9% / 速度-3%
  },
  dexNote: "攻撃力が4種で最も高く、防御が最も低いコラボモンスター。守りは他の仲間に任せる前提の純アタッカーです。"
    + "速度も最も遅く、先に殴られることを前提にした形になっています。",
};

export const GUJIRA_TEMPLATES: MonsterTemplate[] = [GUJIRA];
