/**
 * 実戦アリーナ最終検証の顔ぶれ(防衛6系統・攻撃4系統)。
 *
 * **検証専用。本番のデータには何も書かない。**
 *
 * 個体は Battle Lab の `buildAlly` を通す——`createMonsterInstance` → 装備 → `toBattleDefinition`
 * という、本番がプレイヤーの手持ちを戦闘へ送り出すのと同じ道。
 * ここに書くのは「何を選んだか」(図鑑ID・タイプ転生・能力ポイント・装備・潜在)だけで、
 * ステータスの計算は1行も持たない。
 *
 * ## 装備の組み方
 *
 * Battle Lab の型紙(`presets.ts`)と同じ作法にそろえる:
 *   - ★6 +15 を6個。奇数枠のメインは固定(1=ATK実数 / 3=DEF実数 / 5=HP実数)
 *   - 4個セット+2個セット
 *   - サブは役割に合う項目を並べ、**最後に役割外の項目を1つ混ぜて**枠ごとにずらして配る
 *     (全部を理想で埋めると誰も辿り着けない個体になる。型紙と同じ理由)
 */
import type { Element } from "../../src/core/element.js";
import type { SetType, StatType } from "../../src/core/equipment.js";
import type { MonsterType } from "../../src/core/monsterDevelopment.js";
import type { AtkSpecial, DefSpecial, WeakKey } from "../accessoryFinal/specials.js";
import type { GearSpec } from "../battleLab/types.js";

/** アクセのメインを決める役割 */
export type Role = "ATK" | "HP" | "DEF" | "HEAL" | "SUP" | "DIS";

export const ROLE_LABEL: Record<Role, string> = {
  ATK: "攻撃役", HP: "HP受け", DEF: "DEF受け", HEAL: "回復役", SUP: "支援役", DIS: "妨害役",
};

export interface Build {
  type: MonsterType;
  abilityPoints: { hp: number; atk: number; def: number; spd: number };
  set4: SetType;
  set2: SetType;
  slot2: StatType;
  slot4: StatType;
  slot6: StatType;
  /** 役割どおりのサブ(前から優先)。最後の1つは役割外(型紙と同じ作法) */
  subs: StatType[];
}

export interface Member {
  key: string;
  label: string;
  templateId: string;
  element: Element;
  role: Role;
  build: Build;
  /** 潜在覚醒の候補の何番目か */
  latentIndex: number;
  /** 採用した理由(レポートに出す) */
  why: string;
  /** 主に使うスキル(レポートに出す) */
  skills: string;
  /** アクセの特殊効果の優先順(先頭から ヒーロー=1 / レジェンド=2 / エピック=3)と弱効果 */
  acc: { specials: (AtkSpecial | DefSpecial)[]; weak: WeakKey };
}

export function gearOf(b: Build): GearSpec[] {
  const pickSubs = (exclude: StatType, offset: number): StatType[] => {
    const pool = b.subs.filter((s) => s !== exclude);
    return Array.from({ length: 4 }, (_, i) => pool[(offset + i) % pool.length]);
  };
  return [
    { slot: 1, set: b.set4, main: "ATK_FLAT", subs: pickSubs("ATK_FLAT", 0) },
    { slot: 2, set: b.set4, main: b.slot2, subs: pickSubs(b.slot2, 1) },
    { slot: 3, set: b.set4, main: "DEF_FLAT", subs: pickSubs("DEF_FLAT", 2) },
    { slot: 4, set: b.set4, main: b.slot4, subs: pickSubs(b.slot4, 3) },
    { slot: 5, set: b.set2, main: "HP_FLAT", subs: pickSubs("HP_FLAT", 4) },
    { slot: 6, set: b.set2, main: b.slot6, subs: pickSubs(b.slot6, 5) },
  ];
}

/* ================================================================ 型紙 */

/** HP受け。体力4+守護2、2/4/6はHP%。HP比例で殴る技の火力もここから出る */
const HP_TANK: Build = {
  type: "HP", abilityPoints: { hp: 70, atk: 0, def: 20, spd: 10 },
  set4: "VITALITY", set2: "GUARD", slot2: "HP_PERCENT", slot4: "HP_PERCENT", slot6: "HP_PERCENT",
  subs: ["HP_PERCENT", "DEF_PERCENT", "SPD", "RESISTANCE", "HP_FLAT", "ATK_PERCENT"],
};
/** HP受けの速い版。手番の数で守る役(挑発・全体無敵・ゲージ操作)は遅いと仕事が間に合わない */
const HP_TANK_SPD: Build = {
  type: "HP", abilityPoints: { hp: 60, atk: 0, def: 10, spd: 30 },
  set4: "VITALITY", set2: "SWIFT", slot2: "SPD", slot4: "HP_PERCENT", slot6: "HP_PERCENT",
  subs: ["HP_PERCENT", "SPD", "DEF_PERCENT", "RESISTANCE", "HP_FLAT", "ATK_PERCENT"],
};
/** DEF受け。守護4+体力2、2/4/6はDEF%。DEF比例で殴る技の火力もここから出る */
const DEF_TANK: Build = {
  type: "DEFENSE", abilityPoints: { hp: 20, atk: 0, def: 70, spd: 10 },
  set4: "GUARD", set2: "VITALITY", slot2: "DEF_PERCENT", slot4: "DEF_PERCENT", slot6: "DEF_PERCENT",
  subs: ["DEF_PERCENT", "HP_PERCENT", "SPD", "RESISTANCE", "DEF_FLAT", "ATK_PERCENT"],
};
/** 回復役。体力4+抵抗2・速度メイン(Battle Lab の MAX_HEALER と同じ) */
const HEALER: Build = {
  type: "SUPPORT", abilityPoints: { hp: 50, atk: 0, def: 20, spd: 30 },
  set4: "VITALITY", set2: "RESIST_SET", slot2: "SPD", slot4: "HP_PERCENT", slot6: "HP_PERCENT",
  subs: ["SPD", "HP_PERCENT", "DEF_PERCENT", "RESISTANCE", "HP_FLAT", "ATK_PERCENT"],
};
/** 支援役。速攻4+抵抗2・速度最優先(MAX_SUPPORT と同じ) */
const SUPPORT: Build = {
  type: "SUPPORT", abilityPoints: { hp: 40, atk: 0, def: 20, spd: 40 },
  set4: "SWIFT", set2: "RESIST_SET", slot2: "SPD", slot4: "HP_PERCENT", slot6: "HP_PERCENT",
  subs: ["SPD", "HP_PERCENT", "DEF_PERCENT", "RESISTANCE", "HP_FLAT", "ATK_PERCENT"],
};
/** 妨害役。的中4+速攻2・6枠も効果命中(MAX_DEBUFFER と同じ) */
const DEBUFFER: Build = {
  type: "DISRUPT", abilityPoints: { hp: 30, atk: 30, def: 0, spd: 40 },
  set4: "ACCURACY_SET", set2: "SWIFT", slot2: "SPD", slot4: "ATK_PERCENT", slot6: "ACCURACY",
  subs: ["ACCURACY", "SPD", "ATK_PERCENT", "HP_PERCENT", "DEF_PERCENT", "HP_FLAT"],
};
/** 攻撃役。会心4+筋力2・速度メイン(MAX_ATTACKER と同じ) */
const ATTACKER: Build = {
  type: "ATTACK", abilityPoints: { hp: 0, atk: 70, def: 0, spd: 30 },
  set4: "CRIT", set2: "POWER", slot2: "SPD", slot4: "CRIT_DMG", slot6: "ATK_PERCENT",
  subs: ["CRIT_RATE", "CRIT_DMG", "ATK_PERCENT", "SPD", "HP_PERCENT", "DEF_PERCENT"],
};
/** 防御を削る攻撃役。崩壊4(攻撃時50%で防御50%無視)+会心2 */
const ATTACKER_COLLAPSE: Build = {
  ...ATTACKER, set4: "COLLAPSE", set2: "CRIT",
};
/** 速さで崩す攻撃役。速攻4+会心2 */
const ATTACKER_SWIFT: Build = {
  ...ATTACKER, abilityPoints: { hp: 0, atk: 50, def: 0, spd: 50 }, set4: "SWIFT", set2: "CRIT",
};

/* ================================================================ アクセの組(役割ごと) */

/** HP受け・回復役・支援役: 条件なしで効く3つ。前回の最終検証で最も硬かった「基本」 */
const HP_ACC = { specials: ["MAX_HP", "DMG_TAKEN", "CRIT_TAKEN"] as DefSpecial[], weak: "W_CRIT" as WeakKey };
/** DEF受け */
const DEF_ACC = { specials: ["DEF_UP", "DMG_TAKEN", "CRIT_TAKEN"] as DefSpecial[], weak: "W_CRIT" as WeakKey };
/** 全体攻撃に特化(E) */
const AOE_ACC = { specials: ["AOE_TAKEN", "S3_TAKEN", "DMG_TAKEN"] as DefSpecial[], weak: "W_CRIT" as WeakKey };
/** 単体攻撃に特化(F) */
const SINGLE_ACC = { specials: ["SINGLE_TAKEN", "S3_TAKEN", "DMG_TAKEN"] as DefSpecial[], weak: "W_CRIT" as WeakKey };

/* ================================================================ 防衛 */

export interface Team { key: string; label: string; concept: string; members: Member[] }

const M = (m: Member) => m;

/* --- 共通で使う個体 --- */
const behemothLight = (acc = HP_ACC) => M({
  key: "behemoth_LIGHT", label: "ベヒモス[光]", templateId: "behemoth", element: "LIGHT", role: "HP", build: HP_TANK, latentIndex: 1, acc,
  skills: "S1 挑発62% / S2 味方全体シールド18%+反射 / S3 味方全体シールド30%+解除+我慢2T",
  why: "作品で最もHPが高い種族。味方全体へシールドを2系統配り、S3の我慢で『その2ターンは誰も倒れない』を作る。S1の挑発で単体技を自分へ向ける",
});
const behemothWater = (acc = HP_ACC) => M({
  key: "behemoth_WATER", label: "ベヒモス[水]", templateId: "behemoth", element: "WATER", role: "HP", build: HP_TANK, latentIndex: 2, acc,
  skills: "S1 挑発62% / S2 敵全体 攻撃DOWN83%+ゲージ-35% / パッシブ HPが減るほど被ダメ-10〜30%",
  why: "最高HP。全体の攻撃DOWNとゲージ削りで相手の火力と手数を同時に落とす。HPが減るほど硬くなるパッシブで、削り切る直前が一番硬い",
});
const phoenixDark = (acc = HP_ACC) => M({
  key: "phoenix_DARK", label: "フェニックス[闇]", templateId: "phoenix", element: "DARK", role: "HP", build: HP_TANK, latentIndex: 2, acc,
  skills: "S2 敵全体 治癒阻害85%+味方全体回復12% / パッシブ 毎ターン味方全体を自身最大HP10%回復・HP0で全回復復活(CT8)",
  why: "作品で唯一の自己蘇生。倒しても全回復で戻る。自分の手番ごとに味方全体を回復し、S2で相手の回復を止める",
});
const mimicLight = (acc = HP_ACC) => M({
  key: "mimic_LIGHT", label: "ミミック[光]", templateId: "mimic", element: "LIGHT", role: "HP", build: HP_TANK_SPD, latentIndex: 0, acc,
  skills: "S2 自身にターゲット集中+被ダメ-15% / S3 味方全体 無敵1T(CT4)",
  why: "CT4で味方全体に無敵。相手の最大火力(S3)の手番に重なれば丸ごと空振りさせる。速度を積んで回転を上げる",
});
const undineWater = (acc = HP_ACC) => M({
  key: "undine_WATER", label: "ウンディーネ[水]", templateId: "undine", element: "WATER", role: "HEAL", build: HEALER, latentIndex: 2, acc,
  skills: "S2 単体回復46%+解除+免疫3T / パッシブ 自分以外の味方の被ダメ-25%・被クリ率-25%、行動ごとに味方全体を自身最大HP7%回復",
  why: "生きている間、他の3体の被ダメを常時25%削り、被クリ率も25%落とす。行動のたびに全体回復。耐久防衛の核になる(コラボ種族)",
});
const fairyLight = (acc = HP_ACC) => M({
  key: "fairy_LIGHT", label: "フェアリー[光]", templateId: "fairy", element: "LIGHT", role: "HEAL", build: HEALER, latentIndex: 2, acc,
  skills: "S2 単体回復37.8%+解除 / S3 味方全体回復47.2%+継続回復11.8%×4T+解除+免疫3T(CT4)",
  why: "作品で最も回復量の多い全体技。回復・継続回復・解除・免疫を1手で配り、防御DOWNを剥がして通常火力を止める",
});

/** 1段目の候補(弱い攻撃編成を相手に選んだ時の顔ぶれ)。最終の顔ぶれはファイル末尾の `DEFENSES` */
export const DEFENSE_ROUND1: Team[] = [
  {
    key: "A", label: "A HP耐久型",
    concept: "最大HPの厚みに、被ダメ軽減(ウンディーネ)・全体無敵(ミミック)・全体シールドと我慢(ベヒモス)・蘇生と毎ターン全体回復(フェニックス)を重ねる。防御無視はHPで受ける",
    members: [behemothLight(), phoenixDark(), mimicLight(), undineWater()],
  },
  {
    key: "B", label: "B DEF耐久型",
    concept: "4体とも防御型に転生し守護4セット。防御UP・全体シールド・全体の被ダメ軽減・挑発を重ね、通常のATK攻撃をDEFで止める。回復はゴーレムの継続回復と各自のシールド",
    members: [
      M({
        key: "golem_LIGHT", label: "ゴーレム[光]", templateId: "golem", element: "LIGHT", role: "DEF", build: DEF_TANK, latentIndex: 2, acc: DEF_ACC,
        skills: "S2 DEF比例の3連撃(全体) / S3 味方全体シールド47%+防御UP+継続回復9.4%+解除(CT4)",
        why: "CT4で最大HP47%のシールド・防御UP・継続回復・解除を全体へ。DEF耐久の土台。S2はDEF比例の全体攻撃で、硬さがそのまま火力になる",
      }),
      M({
        key: "shellturtle_LIGHT", label: "シェルタートル[光]", templateId: "shellturtle", element: "LIGHT", role: "DEF", build: DEF_TANK, latentIndex: 2, acc: DEF_ACC,
        skills: "S1 攻撃DOWN62% / S2 味方を保護(被ダメの50%を肩代わり) / S3 味方全体 防御UP+被ダメ-20%+解除",
        why: "最高DEFの種族。全体の防御UPと被ダメ-20%を重ね、柔らかい味方の被ダメを半分肩代わりする",
      }),
      M({
        key: "knight_LIGHT", label: "グレイヴナイト[光]", templateId: "knight", element: "LIGHT", role: "DEF", build: DEF_TANK, latentIndex: 2, acc: DEF_ACC,
        skills: "S2 味方全体の解除+自身防御UP / S3 味方全体 攻撃UP+防御UP+シールド18%(CT4)",
        why: "防御DOWNを全体解除できるDEF型。S3で防御UPとシールドを配り直し、攻撃UPで相手を削る火力も出す",
      }),
      M({
        key: "shellturtle_ELECTRIC", label: "シェルタートル[電気]", templateId: "shellturtle", element: "ELECTRIC", role: "DEF", build: DEF_TANK, latentIndex: 2, acc: DEF_ACC,
        skills: "S1 攻撃DOWN62% / S2 挑発94%+ゲージ-30% / S3 味方全体 被ダメ-15%(CT4)",
        why: "挑発で単体アタッカーの矛先を最も硬い自分へ固定し、ゲージも削る。全体の被ダメ軽減を光タートルと交互に張る",
      }),
    ],
  },
  {
    key: "C", label: "C HP＋DEF混合耐久",
    concept: "HP受け(ベヒモス水)とDEF受け(シェルタートル光)を並べ、回復役(フェアリー光)と蘇生役(フェニックス闇)で支える。防御無視はHP側が、防御DOWN込みの通常火力はDEF側と解除が受ける",
    members: [
      behemothWater(),
      M({
        key: "shellturtle_LIGHT", label: "シェルタートル[光]", templateId: "shellturtle", element: "LIGHT", role: "DEF", build: DEF_TANK, latentIndex: 2, acc: DEF_ACC,
        skills: "S1 攻撃DOWN62% / S2 味方を保護(50%肩代わり) / S3 味方全体 防御UP+被ダメ-20%+解除",
        why: "DEF受け。全体の防御UP・被ダメ軽減と保護で、HP型の味方の弱点(防御DOWN込みの通常火力)を埋める",
      }),
      fairyLight(),
      phoenixDark(),
    ],
  },
  {
    key: "D", label: "D 妨害耐久型",
    concept: "相手の手番そのものを減らす。クロノス草の全体ゲージ-100%とスタン、バジリスクのスタン、ベヒモス水の攻撃DOWNとゲージ削り。フェアリー光が免疫と解除で妨害の撃ち合いに勝つ",
    members: [
      M({
        key: "chronos_GRASS", label: "クロノス[草]", templateId: "chronos", element: "GRASS", role: "SUP", build: SUPPORT, latentIndex: 0,  acc: HP_ACC,
        skills: "S1 ゲージ-19% / S2 スタン94%+ゲージ-59% / S3 敵全体 ゲージ-100%(83%)+スタン24%(CT5)",
        why: "敵全体の行動ゲージを0へ戻すS3と、単体スタンのS2。HPも高く(★6素で24,714)、速さを積んでも倒れにくい",
      }),
      M({
        key: "basilisk_ELECTRIC", label: "バジリスク[電気]", templateId: "basilisk", element: "ELECTRIC", role: "DIS", build: DEBUFFER, latentIndex: 1, acc: HP_ACC,
        skills: "S1 速度DOWN74% / S2 スタン89%(失敗時ゲージ-47%) / S3 ゲージ-59%+速度DOWN中ならスタン94%",
        why: "速度DOWNからスタンへつなぐ単体の行動封じ。的中を積み、S1の速度DOWNが入るとゲージも削る潜在",
      }),
      behemothWater(),
      fairyLight(),
    ],
  },
  {
    key: "E", label: "E 対全体攻撃特化",
    concept: "全体攻撃は4体へ同時に入る。だから『全員の被ダメを一度に減らす』手段を集める: ウンディーネの常時-25%、ゴーレム光の全体47%シールド、ベヒモス光の全体シールド2系統、ミミック光の全体無敵。アクセも全体攻撃軽減・S3軽減に寄せる",
    members: [
      undineWater(AOE_ACC),
      M({
        key: "golem_LIGHT", label: "ゴーレム[光]", templateId: "golem", element: "LIGHT", role: "DEF", build: DEF_TANK, latentIndex: 2, acc: AOE_ACC,
        skills: "S3 味方全体シールド47%+防御UP+継続回復9.4%+解除(CT4)",
        why: "全体へ配るシールドとしては最大量(最大HP47%)。全体攻撃の1発目をまるごと吸う",
      }),
      mimicLight(AOE_ACC),
      behemothLight(AOE_ACC),
    ],
  },
  {
    key: "F", label: "F 対単体攻撃特化",
    concept: "単体攻撃の矛先を操る。ミミック電気のターゲット集中(被ダメ-15%・被弾でゲージ+8%・反撃)で自分に集め、シェルタートル光の保護で肩代わり、ヴァルキリア水のパッシブでHP30%を切った味方へ無敵と回復、フェニックス闇の蘇生。アクセは単体攻撃軽減・S3軽減に寄せる",
    members: [
      M({
        key: "mimic_ELECTRIC", label: "ミミック[電気]", templateId: "mimic", element: "ELECTRIC", role: "HP", build: HP_TANK_SPD, latentIndex: 0, acc: SINGLE_ACC,
        skills: "S2 自身にターゲット集中+被ダメ-15%+被弾でゲージ+8% / S3 反撃の構え(2T)+自己回復",
        why: "ターゲット集中で単体技を全部自分へ向け、反撃で殴り返す。HP型なので防御無視の単体技も受けられる",
      }),
      M({
        key: "shellturtle_LIGHT", label: "シェルタートル[光]", templateId: "shellturtle", element: "LIGHT", role: "DEF", build: DEF_TANK, latentIndex: 2, acc: SINGLE_ACC,
        skills: "S2 味方を保護(50%肩代わり) / S3 味方全体 防御UP+被ダメ-20%+解除",
        why: "集中役が受けきれない分を肩代わり。全体の防御UPで単体技の1発を小さくする",
      }),
      M({
        key: "valkyria_WATER", label: "ヴァルキリア[水]", templateId: "valkyria", element: "WATER", role: "HEAL", build: HEALER, latentIndex: 0, acc: SINGLE_ACC,
        skills: "S2 単体に我慢2T+回復23.6% / パッシブ 味方がHP30%以下になったら無敵1T+自身最大HP30%回復(内部CT4)",
        why: "単体技で1体を落とし切る直前に、無敵と回復で割り込む。高倍率の単体突破への直接の答え",
      }),
      phoenixDark(SINGLE_ACC),
    ],
  },
];

/* ================================================================ 攻撃 */

/** 攻撃側の組。S3で開幕する技が多い(アリーナは開始時CT0)ので、S3と最初の攻撃を軸にする */
const A_S3_FIRST = { specials: ["S3", "FIRST", "SELF_HP70"] as AtkSpecial[], weak: "FIRST_ASSIST" as WeakKey };
const A_MULTI = { specials: ["S3", "MULTI2", "MULTI3"] as AtkSpecial[], weak: "COMBO_ASSIST" as WeakKey };

/** 1段目の候補。最終の顔ぶれはファイル末尾の `ATTACKS` */
export const ATTACK_ROUND1: Team[] = [
  {
    key: "1", label: "1 標準火力",
    concept: "通常のDEF軽減を受けるATKアタッカー4体。防御DOWN(ネメシス闇S3 83%・ドラゴン水S2 65%)と攻撃UP(ドラゴン水S3・グリフォン光S3)を自前で入れて、耐久を削り切る",
    members: [
      M({ key: "nemesis_DARK", label: "ネメシス[闇]", templateId: "nemesis", element: "DARK", role: "ATK", build: ATTACKER, latentIndex: 0,
        acc: { specials: ["S3", "FIRST", "MULTI2"], weak: "FIRST_ASSIST" },
        skills: "S3 敵全体 ATK×2.12×2+防御DOWN83%+ゲージ吸収", why: "全体への防御DOWNを開幕のS3で入れる" }),
      M({ key: "griffon_LIGHT", label: "グリフォン[光]", templateId: "griffon", element: "LIGHT", role: "ATK", build: ATTACKER, latentIndex: 0, acc: A_S3_FIRST,
        skills: "S3 敵全体 ATK×2.83+スタン59%+味方全体攻撃UP", why: "全体火力に攻撃UPとスタンが付く" }),
      M({ key: "harpy_DARK", label: "ハーピー[闇]", templateId: "harpy", element: "DARK", role: "ATK", build: ATTACKER, latentIndex: 0,
        acc: { specials: ["S3", "FIRST", "DEBUFF1"], weak: "FIRST_ASSIST" },
        skills: "S3 敵全体 ATK×2.75(弱体1個につき+10%)", why: "防御DOWN・速度DOWNが入った後の全体火力" }),
      M({ key: "dragon_WATER", label: "ドラゴン[水]", templateId: "dragon", element: "WATER", role: "ATK", build: ATTACKER, latentIndex: 0,
        acc: { specials: ["S2", "SELF_HP70", "DEBUFF1"], weak: "FINISH" },
        skills: "S2 単体 ATK×2.83+防御DOWN65% / S3 味方全体 攻撃UP+防御UP+回復", why: "攻撃UPを配る側。自分もS2で防御DOWN込みの単体火力" }),
    ],
  },
  {
    key: "2", label: "2 防御無視",
    concept: "ドラゴン闇の全体防御無視を軸に、崩壊4セット(攻撃時50%で防御50%無視)の単体役2体と、強化(シールド・防御UP)を剥がすアビスリーパー電気。DEF耐久への明確な答え",
    members: [
      M({ key: "dragon_DARK", label: "ドラゴン[闇]", templateId: "dragon", element: "DARK", role: "ATK", build: ATTACKER, latentIndex: 0, acc: A_S3_FIRST,
        skills: "S3 敵全体 ATK×1.42(防御無視)+与ダメの30%吸血", why: "作品で唯一の全体防御無視" }),
      M({ key: "fenrir_FIRE", label: "フェンリル[火]", templateId: "fenrir", element: "FIRE", role: "ATK", build: ATTACKER_COLLAPSE, latentIndex: 0, acc: A_MULTI,
        skills: "S1 防御DOWN43%×2 / S2 3発目が防御無視 / S3 4連撃", why: "多段なので崩壊の抽選回数が多い" }),
      M({ key: "kobold_FIRE", label: "コボルト[火]", templateId: "kobold", element: "FIRE", role: "ATK", build: ATTACKER_COLLAPSE, latentIndex: 0,
        acc: { specials: ["S3", "ENEMY_HP30", "S2"], weak: "FINISH" },
        skills: "S2 防御25%無視 / S3 対象HP30%以下で防御100%無視", why: "削れた相手へ防御無視で止めを刺す" }),
      M({ key: "abyssreaper_ELECTRIC", label: "アビスリーパー[電気]", templateId: "abyssreaper", element: "ELECTRIC", role: "DIS", build: DEBUFFER, latentIndex: 0,
        acc: { specials: ["S3", "FIRST", "SELF_HP70"], weak: "FIRST_ASSIST" },
        skills: "S1 強化解除74% / S2 解除+防御DOWN94%+ゲージ-47% / S3 敵全体 強化解除89%", why: "シールド・防御UPを剥がす" }),
    ],
  },
  {
    key: "3", label: "3 単体突破",
    concept: "高倍率の単体技で1体ずつ落とす。狙いは本番AIのまま(属性有利 → HP割合の低い順)。ヒーラーを名指しで狙う判断はAIに無い",
    members: [
      M({ key: "nemesis_FIRE", label: "ネメシス[火]", templateId: "nemesis", element: "FIRE", role: "ATK", build: ATTACKER, latentIndex: 0, acc: A_S3_FIRST,
        skills: "S3 単体 ATK×4.6(+DEF比例)+スタン83%", why: "作品で最も重い単体技の1つ" }),
      M({ key: "scorpion_LIGHT", label: "スコーピオン[光]", templateId: "scorpion", element: "LIGHT", role: "ATK", build: ATTACKER, latentIndex: 0, acc: A_S3_FIRST,
        skills: "S2 自己強化(攻撃UP・クリ率・クリダメ) / S3 単体 ATK×3.5+会心時に強化解除", why: "会心でシールドを剥がす単体技" }),
      M({ key: "wolf_DARK", label: "ウルフ[闇]", templateId: "wolf", element: "DARK", role: "ATK", build: ATTACKER, latentIndex: 0, acc: A_MULTI,
        skills: "S2 毒+治癒阻害83% / S3 単体 ATK×1.77×3+吸血", why: "回復を止めて多段で削る" }),
      M({ key: "fenrir_DARK", label: "フェンリル[闇]", templateId: "fenrir", element: "DARK", role: "ATK", build: ATTACKER, latentIndex: 0, acc: A_MULTI,
        skills: "S2 防御DOWN94% / S3 単体 ATK×0.77×5(HP50%以下で防御30%無視)+撃破でゲージ+100%", why: "倒すたびに次の手番が来る" }),
    ],
  },
  {
    key: "4", label: "4 速度・妨害",
    concept: "ウルフ電気のゲージUPと速度UPで先手を取り、フェンリル光の全体スタンとCT延長、バジリスク電気のスタンで相手の手番を奪い、サンダービースト闇の速度比例火力で削る",
    members: [
      M({ key: "wolf_ELECTRIC", label: "ウルフ[電気]", templateId: "wolf", element: "ELECTRIC", role: "SUP", build: SUPPORT, latentIndex: 0,
        acc: { specials: ["S1", "SELF_HP70", "DEBUFF1"], weak: "FIRST_ASSIST" },
        skills: "S3 味方全体 ゲージUP+速度UP", why: "開幕に全員を先に動かす" }),
      M({ key: "fenrir_LIGHT", label: "フェンリル[光]", templateId: "fenrir", element: "LIGHT", role: "ATK", build: ATTACKER_SWIFT, latentIndex: 0, acc: A_S3_FIRST,
        skills: "S3 敵全体 ATK×1.65+スタン83%+CT延長83%+ゲージ-18%", why: "全体の行動封じと火力" }),
      M({ key: "basilisk_ELECTRIC", label: "バジリスク[電気]", templateId: "basilisk", element: "ELECTRIC", role: "DIS", build: DEBUFFER, latentIndex: 1,
        acc: { specials: ["S3", "DEBUFF1", "S1"], weak: "FIRST_ASSIST" },
        skills: "S2 スタン89% / S3 ゲージ-59%+スタン94%", why: "単体の行動封じ" }),
      M({ key: "thunderbeast_DARK", label: "サンダービースト[闇]", templateId: "thunderbeast", element: "DARK", role: "ATK", build: ATTACKER_SWIFT, latentIndex: 0, acc: A_MULTI,
        skills: "S2 防御DOWN94% / S3 単体 速度比例×4連撃", why: "速さがそのまま火力になる" }),
    ],
  },
];

/* ================================================================ 入れ替え候補 */

/*
 * 各系統の「もっと硬い組があるのでは」を確かめるための候補。
 * アクセなし200戦で、4系統の攻撃に対して最も粘ったものを本編(DEFENSES)に採る。
 * 採らなかった候補も、選んだ根拠としてレポートに残す。
 */
const undineWaterV = undineWater;
const valkyriaWater = (acc = HP_ACC) => M({
  key: "valkyria_WATER", label: "ヴァルキリア[水]", templateId: "valkyria", element: "WATER", role: "HEAL", build: HEALER, latentIndex: 0, acc,
  skills: "S2 単体に我慢2T+回復23.6% / パッシブ HP30%以下の味方へ無敵1T+回復30%", why: "",
});
const shellLight = (acc = DEF_ACC) => M({
  key: "shellturtle_LIGHT", label: "シェルタートル[光]", templateId: "shellturtle", element: "LIGHT", role: "DEF", build: DEF_TANK, latentIndex: 2, acc,
  skills: "S2 保護 / S3 全体 防御UP+被ダメ-20%", why: "",
});
const golemLight = (acc = DEF_ACC) => M({
  key: "golem_LIGHT", label: "ゴーレム[光]", templateId: "golem", element: "LIGHT", role: "DEF", build: DEF_TANK, latentIndex: 2, acc,
  skills: "S3 全体シールド47%+防御UP+継続回復", why: "",
});
const knightLight = (acc = DEF_ACC) => M({
  key: "knight_LIGHT", label: "グレイヴナイト[光]", templateId: "knight", element: "LIGHT", role: "DEF", build: DEF_TANK, latentIndex: 2, acc,
  skills: "S3 全体 攻撃UP+防御UP+シールド18%", why: "",
});
const chronosGrass = (acc = HP_ACC) => M({
  key: "chronos_GRASS", label: "クロノス[草]", templateId: "chronos", element: "GRASS", role: "SUP", build: SUPPORT, latentIndex: 0, acc,
  skills: "S2 スタン94% / S3 全体ゲージ-100%", why: "",
});
const basiliskElectric = (acc = HP_ACC) => M({
  key: "basilisk_ELECTRIC", label: "バジリスク[電気]", templateId: "basilisk", element: "ELECTRIC", role: "DIS", build: DEBUFFER, latentIndex: 1, acc,
  skills: "S2 スタン89% / S3 スタン94%", why: "",
});
const mimicElectric = (acc = HP_ACC) => M({
  key: "mimic_ELECTRIC", label: "ミミック[電気]", templateId: "mimic", element: "ELECTRIC", role: "HP", build: HP_TANK_SPD, latentIndex: 0, acc,
  skills: "S2 ターゲット集中 / S3 反撃", why: "",
});

export const DEFENSE_VARIANTS: Team[] = [
  { key: "A2", label: "A2 HP耐久(ミミック光→ベヒモス水)", concept: "", members: [behemothLight(), phoenixDark(), behemothWater(), undineWater()] },
  { key: "A3", label: "A3 HP耐久(ウンディーネ→フェアリー光)", concept: "", members: [behemothLight(), phoenixDark(), mimicLight(), fairyLight()] },
  { key: "B2", label: "B2 DEF耐久(電気タートル→セラフ光 防御型)", concept: "", members: [golemLight(), shellLight(), knightLight(), M({
    key: "seraph_LIGHT", label: "セラフ[光]", templateId: "seraph", element: "LIGHT", role: "DEF", build: DEF_TANK, latentIndex: 2, acc: DEF_ACC,
    skills: "S3 全体回復(DEF×260%)+解除+免疫4T+継続回復9.4%×5T", why: "",
  })] },
  { key: "B3", label: "B3 DEF耐久(電気タートル→モッチー水 防御型)", concept: "", members: [golemLight(), shellLight(), knightLight(), M({
    key: "mocchi_WATER", label: "モッチー[水]", templateId: "mocchi", element: "WATER", role: "DEF", build: DEF_TANK, latentIndex: 2, acc: DEF_ACC,
    skills: "S2 DEF比例2連撃+ゲージ-30% / S3 全体 治癒阻害", why: "",
  })] },
  { key: "C2", label: "C2 混合(フェアリー光→ウンディーネ水)", concept: "", members: [behemothWater(), shellLight(), undineWaterV(), phoenixDark()] },
  { key: "C3", label: "C3 混合(ベヒモス光・ゴーレム光・フェアリー光・フェニックス闇)", concept: "", members: [behemothLight(), golemLight(), fairyLight(), phoenixDark()] },
  { key: "D2", label: "D2 妨害(フェアリー光→ウンディーネ水)", concept: "", members: [chronosGrass(), basiliskElectric(), behemothWater(), undineWater()] },
  { key: "D3", label: "D3 妨害(バジリスク→スエゾー闇)", concept: "", members: [chronosGrass(), M({
    key: "suezo_DARK", label: "スエゾー[闇]", templateId: "suezo", element: "DARK", role: "DIS", build: DEBUFFER, latentIndex: 2, acc: HP_ACC,
    skills: "S2 全体 ゲージ-30%+攻撃DOWN75% / S3 全体スタン+速度DOWN", why: "",
  }), behemothWater(), fairyLight()] },
  { key: "D4", label: "D4 妨害(バジリスク→クロノス光)", concept: "", members: [chronosGrass(), M({
    key: "chronos_LIGHT", label: "クロノス[光]", templateId: "chronos", element: "LIGHT", role: "SUP", build: SUPPORT, latentIndex: 1, acc: HP_ACC,
    skills: "S2 スタン94%+ゲージ-59% / S3 全体ゲージ+35%+CT-2+無敵1T", why: "",
  }), behemothWater(), fairyLight()] },
  { key: "D5", label: "D5 妨害(フェアリー光→フェニックス闇)", concept: "", members: [chronosGrass(), basiliskElectric(), behemothWater(), phoenixDark()] },
  { key: "F2", label: "F2 対単体(フェニックス闇→ウンディーネ水)", concept: "", members: [mimicElectric(SINGLE_ACC), shellLight(SINGLE_ACC), valkyriaWater(SINGLE_ACC), undineWater(SINGLE_ACC)] },
  { key: "F3", label: "F3 対単体(ミミック電気→ベヒモス闇)", concept: "", members: [M({
    key: "behemoth_DARK", label: "ベヒモス[闇]", templateId: "behemoth", element: "DARK", role: "HP", build: HP_TANK, latentIndex: 0, acc: SINGLE_ACC,
    skills: "S1 挑発62% / S3 全体挑発94%+ゲージ-35%+反射", why: "",
  }), shellLight(SINGLE_ACC), valkyriaWater(SINGLE_ACC), phoenixDark(SINGLE_ACC)] },
  { key: "F4", label: "F4 対単体(シェルタートル光→ベヒモス光)", concept: "", members: [mimicElectric(SINGLE_ACC), behemothLight(SINGLE_ACC), valkyriaWater(SINGLE_ACC), phoenixDark(SINGLE_ACC)] },
];

/* --- 攻撃側の入れ替え候補(各系統で最も勝てる組を本編に採る) --- */
const atk = (key: string, label: string, templateId: string, element: Element, build: Build, acc: Member["acc"], role: Role = "ATK", latentIndex = 0) =>
  M({ key, label, templateId, element, role, build, latentIndex, acc, skills: "", why: "" });
const jokerWater = () => atk("joker_WATER", "ジョーカー[水]", "joker", "WATER", DEBUFFER, { specials: ["S1", "SELF_HP70", "DEBUFF1"], weak: "FIRST_ASSIST" }, "DIS");

export const ATTACK_VARIANTS: Team[] = [
  { key: "1b", label: "1b 標準(ドラゴン水→ジョーカー水)", concept: "", members: [ATTACK_ROUND1[0].members[0], ATTACK_ROUND1[0].members[1], ATTACK_ROUND1[0].members[2], jokerWater()] },
  { key: "1c", label: "1c 標準(ハーピー闇→ネメシス草)", concept: "", members: [ATTACK_ROUND1[0].members[0], ATTACK_ROUND1[0].members[1],
    atk("nemesis_GRASS", "ネメシス[草]", "nemesis", "GRASS", ATTACKER, { specials: ["S2", "FIRST", "SELF_HP70"], weak: "FIRST_ASSIST" }), ATTACK_ROUND1[0].members[3]] },
  { key: "2b", label: "2b 防御無視(コボルト火→グジラ火)", concept: "", members: [ATTACK_ROUND1[1].members[0], ATTACK_ROUND1[1].members[1],
    atk("gujira_FIRE", "グジラ[火]", "gujira", "FIRE", ATTACKER_COLLAPSE, { specials: ["S3", "FIRST", "SELF_HP70"], weak: "FIRST_ASSIST" }), ATTACK_ROUND1[1].members[3]] },
  { key: "2c", label: "2c 防御無視(アビスリーパー→ジョーカー水)", concept: "", members: [ATTACK_ROUND1[1].members[0], ATTACK_ROUND1[1].members[1], ATTACK_ROUND1[1].members[2], jokerWater()] },
  { key: "3b", label: "3b 単体(スコーピオン光→グリフォン闇)", concept: "", members: [ATTACK_ROUND1[2].members[0],
    atk("griffon_DARK", "グリフォン[闇]", "griffon", "DARK", ATTACKER, { specials: ["S3", "MULTI2", "MULTI3"], weak: "COMBO_ASSIST" }), ATTACK_ROUND1[2].members[2], ATTACK_ROUND1[2].members[3]] },
  { key: "3c", label: "3c 単体(ウルフ闇→ジョーカー水)", concept: "", members: [ATTACK_ROUND1[2].members[0], ATTACK_ROUND1[2].members[1], jokerWater(), ATTACK_ROUND1[2].members[3]] },
  { key: "4b", label: "4b 速度妨害(ウルフ電気・バジリスク→クロノス草・スエゾー闇)", concept: "", members: [
    atk("chronos_GRASS", "クロノス[草]", "chronos", "GRASS", SUPPORT, { specials: ["S1", "SELF_HP70", "DEBUFF1"], weak: "FIRST_ASSIST" }, "SUP"),
    atk("suezo_DARK", "スエゾー[闇]", "suezo", "DARK", DEBUFFER, { specials: ["S3", "FIRST", "SELF_HP70"], weak: "FIRST_ASSIST" }, "DIS", 2),
    ATTACK_ROUND1[3].members[1], ATTACK_ROUND1[3].members[3]] },
  { key: "4c", label: "4c 速度妨害(バジリスク→ネメシス闇)", concept: "", members: [ATTACK_ROUND1[3].members[0], ATTACK_ROUND1[3].members[1], ATTACK_ROUND1[3].members[2], ATTACK_ROUND1[0].members[0]] },
];

/* 2段目: 1段目で効いた入れ替えを組み合わせる */
const byKey = (teams: Team[], key: string) => teams.find((t) => t.key === key)!;
const nemesisGrass = () => byKey(ATTACK_VARIANTS, "1c").members[2];
const gujiraFire = () => byKey(ATTACK_VARIANTS, "2b").members[2];
const griffonDark = () => byKey(ATTACK_VARIANTS, "3b").members[1];
const chronosGrassAtk = () => byKey(ATTACK_VARIANTS, "4b").members[0];
const suezoDarkAtk = () => byKey(ATTACK_VARIANTS, "4b").members[1];
ATTACK_VARIANTS.push(
  { key: "1d", label: "1d 標準(ネメシス闇・グリフォン光・ネメシス草・ジョーカー水)", concept: "", members: [ATTACK_ROUND1[0].members[0], ATTACK_ROUND1[0].members[1], nemesisGrass(), jokerWater()] },
  { key: "1e", label: "1e 標準(ネメシス闇・ハーピー闇・ネメシス草・ジョーカー水)", concept: "", members: [ATTACK_ROUND1[0].members[0], ATTACK_ROUND1[0].members[2], nemesisGrass(), jokerWater()] },
  { key: "2d", label: "2d 防御無視(ドラゴン闇・フェンリル火・グジラ火・ジョーカー水)", concept: "", members: [ATTACK_ROUND1[1].members[0], ATTACK_ROUND1[1].members[1], gujiraFire(), jokerWater()] },
  { key: "2e", label: "2e 防御無視(ドラゴン闇・グジラ火・コボルト火・アビスリーパー電気)", concept: "", members: [ATTACK_ROUND1[1].members[0], gujiraFire(), ATTACK_ROUND1[1].members[2], ATTACK_ROUND1[1].members[3]] },
  { key: "3d", label: "3d 単体(ネメシス火・グリフォン闇・フェンリル闇・ジョーカー水)", concept: "", members: [ATTACK_ROUND1[2].members[0], griffonDark(), ATTACK_ROUND1[2].members[3], jokerWater()] },
  { key: "3e", label: "3e 単体(ネメシス火・グリフォン闇・スコーピオン光・ジョーカー水)", concept: "", members: [ATTACK_ROUND1[2].members[0], griffonDark(), ATTACK_ROUND1[2].members[1], jokerWater()] },
  { key: "4d", label: "4d 速度妨害(クロノス草・スエゾー闇・フェンリル光・ネメシス闇)", concept: "", members: [chronosGrassAtk(), suezoDarkAtk(), ATTACK_ROUND1[3].members[1], ATTACK_ROUND1[0].members[0]] },
  { key: "4e", label: "4e 速度妨害(クロノス草・スエゾー闇・ウルフ電気・ネメシス闇)", concept: "", members: [chronosGrassAtk(), suezoDarkAtk(), ATTACK_ROUND1[3].members[0], ATTACK_ROUND1[0].members[0]] },
);

/* DEF耐久の追加候補: 防御DOWN(ジョーカー水・ネメシス闇)を免疫と解除で止められるか */
DEFENSE_VARIANTS.push(
  { key: "B4", label: "B4 DEF耐久(ゴーレム光・シェルタートル光・シェルタートル電気・フェアリー光)", concept: "", members: [golemLight(), shellLight(), M({
    key: "shellturtle_ELECTRIC", label: "シェルタートル[電気]", templateId: "shellturtle", element: "ELECTRIC", role: "DEF", build: DEF_TANK, latentIndex: 2, acc: DEF_ACC,
    skills: "S2 挑発94%+ゲージ-30% / S3 全体 被ダメ-15%", why: "",
  }), fairyLight()] },
  { key: "B5", label: "B5 DEF耐久(ゴーレム光・シェルタートル光・グレイヴナイト光・フェアリー光)", concept: "", members: [golemLight(), shellLight(), knightLight(), fairyLight()] },
  { key: "B6", label: "B6 DEF耐久(ゴーレム光・シェルタートル光・セラフ光 防御型・フェアリー光)", concept: "", members: [golemLight(), shellLight(), byKey(DEFENSE_VARIANTS, "B2").members[3], fairyLight()] },
);

/* ================================================================ 最終の顔ぶれ */

/*
 * 選び方(レポート2章に表を載せる):
 *   1. 各系統の候補を、アクセなし200戦で攻撃1段目の4編成と戦わせた
 *   2. 攻撃側も候補を試し、各系統で最も勝てる組(1d/2d/3d/4d)を採った
 *   3. 防衛の候補を、その強い攻撃4編成と改めて戦わせ、平均防衛勝率が最も高い組を採った
 *
 * **勝率をどこかに合わせるためにステータスは盛っていない。**選んだのは顔ぶれだけ。
 */
const TEXT: Record<string, { skills: string; why: string }> = {
  seraph_LIGHT: {
    skills: "S2 単体回復(ATK比例)+攻撃UP / S3 味方全体回復(DEF×260%)+解除+免疫4T+継続回復9.4%×5T(CT5)",
    why: "回復量がDEFに比例する唯一のヒーラー。防御型に転生させると、硬さがそのまま全体回復になる。免疫4Tで防御DOWNを止める",
  },
  suezo_DARK: {
    skills: "S1 攻撃DOWN70%+ゲージ-20% / S2 敵全体 ゲージ-30%(70%)+攻撃DOWN75%(CT2) / S3 敵全体 ゲージ吸収+速度DOWN+スタン(CT6)",
    why: "CT2で敵全体の攻撃DOWNとゲージ削りを撒き続ける。S3は全体スタン。『相手の手数と火力を同時に落とす』を最も短い間隔で繰り返せる(コラボ種族)",
  },
  behemoth_DARK: {
    skills: "S1 挑発62% / S2 敵全体 攻撃DOWN83%+ゲージ-35% / S3 敵全体 挑発94%+ゲージ-35%+自身に反射(CT5)",
    why: "全体挑発で相手の単体技をすべて最大HPの自分へ向け、反射で殴り返す。単体突破の『1体ずつ落とす』を、落とされたくない味方から外す",
  },
  valkyria_WATER: {
    skills: "S2 単体に我慢2T+回復23.6% / パッシブ 味方がHP30%以下になったら無敵1T+自身最大HP30%回復(内部CT4)",
    why: "単体技で1体を落とし切る直前に、無敵と回復で割り込む。高倍率の単体突破への直接の答え",
  },
  golem_LIGHT: {
    skills: "S2 DEF比例の3連撃(全体) / S3 味方全体シールド47%+防御UP+継続回復9.4%+解除(CT4)",
    why: "CT4で最大HP47%のシールド・防御UP・継続回復・解除を全体へ。全体シールドとしては最大量",
  },
  shellturtle_LIGHT: {
    skills: "S1 攻撃DOWN62% / S2 味方を保護(被ダメの50%を肩代わり) / S3 味方全体 防御UP+被ダメ-20%+解除",
    why: "最高DEFの種族。全体の防御UPと被ダメ-20%を重ね、柔らかい味方の被ダメを半分肩代わりする",
  },
  chronos_GRASS: {
    skills: "S1 ゲージ-19% / S2 スタン94%+ゲージ-59%(CT4) / S3 敵全体 ゲージ-100%(83%)+スタン24%(CT5)",
    why: "敵全体の行動ゲージを0へ戻すS3と単体スタンのS2。★6素のHPが24,714と高く、速さを積んでも倒れにくい",
  },
  joker_WATER: {
    skills: "S1 スキル封印50%+呪い30% / S2 敵全体 呪い80%+暗闇80%+ゲージ-25% / S3 敵全体 強化解除100%+防御DOWN100%(CT5)",
    why: "シールド・防御UP・免疫をまとめて剥がし、全体に防御DOWNを確定で入れる。耐久防衛の『重ねた守り』を1手で崩す",
  },
  nemesis_DARK: {
    skills: "S3 敵全体 ATK×2.12×2+防御DOWN83%+ゲージ24%吸収(CT4)",
    why: "開幕のS3で全体に防御DOWNを入れつつ最大級の全体火力。アリーナは開始時CT0なので最初の手番から撃てる",
  },
  griffon_LIGHT: {
    skills: "S3 敵全体 ATK×2.83+スタン59%+味方全体 攻撃UP(CT4)",
    why: "全体火力に攻撃UPとスタンが付く。後続の火力を底上げする",
  },
  nemesis_GRASS: {
    skills: "S2 単体 ATK×3.19+防御DOWN89%(CT2) / S3 敵全体 ATK×1.36×2+ゲージ吸収(CT4)",
    why: "CT2の重い単体技に防御DOWNが付く。全体と単体の両方で削る",
  },
  dragon_DARK: {
    skills: "S3 敵全体 ATK×1.42(防御無視)+与ダメの30%吸血(CT4)",
    why: "作品で唯一の全体防御無視。DEF耐久への明確な答え",
  },
  fenrir_FIRE: {
    skills: "S1 防御DOWN43%×2 / S2 3発目が防御無視(CT3) / S3 単体4連撃(CT4)",
    why: "多段なので崩壊4セット(攻撃時50%で防御50%無視)の抽選回数が多い",
  },
  gujira_FIRE: {
    skills: "S2 自己強化(攻撃UP・防御UP・シールド30%)+追加ターン / S3 単体 ATK×7.3(相手が速ければ防御55%無視)(CT4)",
    why: "作品で最も重い単体技。速い相手には防御を半分以上無視する(コラボ種族)",
  },
  nemesis_FIRE: {
    skills: "S3 単体 ATK×4.6(+DEF比例)+スタン83%(CT4)",
    why: "重い単体技にスタンが付く。1体を落としつつ次の手番も奪う",
  },
  griffon_DARK: {
    skills: "S2 単体+速度DOWN83% / S3 単体 ATK×2.24×3(速度比例)+防御DOWN83%(CT4)",
    why: "多段の単体技に防御DOWNが付く。速いほど重い",
  },
  fenrir_DARK: {
    skills: "S2 防御DOWN94% / S3 単体 ATK×0.77×5(HP50%以下で防御30%無視)+撃破でゲージ+100%(CT5)",
    why: "倒すたびに次の手番が来る。1体ずつ落とす作りそのもの",
  },
  fenrir_LIGHT: {
    skills: "S3 敵全体 ATK×1.65+スタン83%+CT延長83%+ゲージ-18%(CT5)",
    why: "全体スタンとCT延長で、相手の守りの技(全体無敵・全体シールド)の回転を遅らせる",
  },
};

function withText(m: Member): Member {
  const t = TEXT[m.key];
  return t && !m.why ? { ...m, ...t } : m;
}
function pick(teams: Team[], key: string, label: string, concept: string): Team {
  const t = teams.find((x) => x.key === key)!;
  return { key: label.split(" ")[0], label: `${label}(候補${key})`, concept, members: t.members.map(withText) };
}
const DEF_POOL = () => [...DEFENSE_ROUND1, ...DEFENSE_VARIANTS];
const ATK_POOL = () => [...ATTACK_ROUND1, ...ATTACK_VARIANTS];

export const DEFENSES: Team[] = [
  pick(DEF_POOL(), "A2", "A HP耐久型",
    "HP受け3体(ベヒモス光・ベヒモス水・フェニックス闇)をウンディーネ水が支える。ウンディーネの常時-25%と行動ごとの全体回復、ベヒモス光の全体シールド2系統と我慢、ベヒモス水の全体攻撃DOWNとゲージ削り、フェニックス闇の蘇生と毎ターン全体回復。防御無視はHPで受ける"),
  pick(DEF_POOL(), "B6", "B DEF耐久型",
    "DEF受け2体(ゴーレム光・シェルタートル光)に、防御型へ転生させたセラフ光(回復量がDEF比例)と、免疫・解除のフェアリー光。全体シールド47%・防御UP・被ダメ-20%・保護を重ねて通常のATK攻撃をDEFで止め、防御DOWNは免疫と解除で止める"),
  pick(DEF_POOL(), "C2", "C HP＋DEF混合耐久",
    "HP受け(ベヒモス水)・DEF受け(シェルタートル光)・回復役(ウンディーネ水)・蘇生役(フェニックス闇)。防御無視はHP側が受け、防御DOWN込みの通常火力はDEF側の防御UP・保護・解除が受ける。1種類のアタッカーでは両方を同時に崩しにくい"),
  pick(DEF_POOL(), "D3", "D 妨害耐久型",
    "相手の手番そのものを減らす。クロノス草の全体ゲージ-100%とスタン、スエゾー闇のCT2の全体攻撃DOWN+ゲージ削り、ベヒモス水の全体攻撃DOWN+ゲージ削り。フェアリー光が免疫と解除で妨害の撃ち合いに勝つ"),
  pick(DEF_POOL(), "E", "E 対全体攻撃特化",
    "全体攻撃は4体へ同時に入る。だから『全員の被ダメを一度に減らす』手段を集める: ウンディーネの常時-25%、ゴーレム光の全体47%シールド、ベヒモス光の全体シールド2系統、ミミック光の全体無敵。アクセも全体攻撃軽減・S3軽減に寄せる"),
  pick(DEF_POOL(), "F3", "F 対単体攻撃特化",
    "単体攻撃の矛先を操る。ベヒモス闇の全体挑発で単体技を最大HPの自分へ集め、シェルタートル光の保護で肩代わり、ヴァルキリア水のパッシブでHP30%を切った味方へ無敵と回復、フェニックス闇の蘇生。アクセは単体攻撃軽減・S3軽減に寄せる"),
];

export const ATTACKS: Team[] = [
  pick(ATK_POOL(), "1d", "1 標準火力",
    "通常のDEF軽減を受けるATKアタッカー3体(ネメシス闇・グリフォン光・ネメシス草)に、ジョーカー水の強化解除+全体防御DOWN100%。防御DOWNと攻撃UPを自前で入れて、耐久を削り切る"),
  pick(ATK_POOL(), "2d", "2 防御無視",
    "ドラゴン闇の全体防御無視を軸に、崩壊4セットのフェンリル火、相手が速いと防御55%無視のグジラ火、強化を剥がすジョーカー水。DEF耐久への明確な答え"),
  pick(ATK_POOL(), "3d", "3 単体突破",
    "ネメシス火・グリフォン闇・フェンリル闇の高倍率単体技で1体ずつ落とす。ジョーカー水がシールドを剥がす。狙いは本番AIのまま(属性有利 → HP割合の低い順)。ヒーラーを名指しで狙う判断はAIに無い"),
  pick(ATK_POOL(), "4d", "4 速度・妨害",
    "クロノス草の全体ゲージ-100%、スエゾー闇の全体攻撃DOWN+ゲージ削り、フェンリル光の全体スタン+CT延長で相手の手番を奪い、ネメシス闇の全体火力で削る"),
];
