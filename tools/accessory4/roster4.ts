/**
 * 4系統検証の顔ぶれと、各個体のアクセの選択肢。
 *
 * **検証専用。本番のデータには何も書かない。**
 *
 * 防衛は前回の最終検証の6系統(`../arenaFinal/roster.ts` の `DEFENSES`)を**そのまま使う**(比較のため)。
 * 攻撃は前回の最終4編成を土台に、今回の最重要編成「解除 → 防御DOWN → 火力」を足した5系統。
 *
 * ## アクセの選択肢(プロファイル)
 *
 * 1体ごとに「どの系統のアクセを、どのメインで着けるか」を複数持たせる。
 * `role` がその個体の役割最適。**メインと特殊の系統は固定しない**(ヒーラーに耐久特殊、
 * デバッファーに攻撃特殊、のような組み合わせも選べる。クロスビルドの比較に使う)。
 */
import type { Element } from "../../src/core/element.js";
import type { StatType } from "../../src/core/equipment.js";
import type { MonsterDefinition } from "../../src/core/monster.js";
import { ATTACKS, ATTACK_VARIANTS, DEFENSES, type Build, type Member, type Team } from "../arenaFinal/roster.js";
import type { Family, Special4, WeakKey4 } from "./specials4.js";

export interface Profile {
  family: Family;
  main: "ATK" | "HP" | "DEF";
  /** 先頭から ヒーロー=1個 / レジェンド=2個 / エピック=3個 */
  specials: Special4[];
  weak: WeakKey4;
  label: string;
}

export type Tag = "STRIP" | "DEFDOWN" | "ATTACKER" | "SUPPORT";

export interface Member4 extends Member {
  /**
   * **切り分け専用。**戦闘定義の写しへ手を入れる(本番のデータは変えない)。
   * 「このスキルの解除が無かったら」を測るためにだけ使う。
   */
  patch?: (def: MonsterDefinition) => MonsterDefinition;
  profiles: Record<string, Profile>;
  /** 役割最適のプロファイル名 */
  role4: string;
  tag?: Tag;
}
export interface Team4 { key: string; label: string; concept: string; members: Member4[] }

/* ================================================================ 装備の型(前回と同じ作法) */

const SUBS_SPEED_ACC: StatType[] = ["ACCURACY", "SPD", "HP_PERCENT", "DEF_PERCENT", "RESISTANCE", "ATK_PERCENT"];
/** 解除役。的中4+速攻2・速度最優先(抵抗の高い耐久防衛に解除を通すため的中を積む) */
const STRIPPER: Build = {
  type: "DISRUPT", abilityPoints: { hp: 30, atk: 0, def: 10, spd: 60 },
  set4: "ACCURACY_SET", set2: "SWIFT", slot2: "SPD", slot4: "HP_PERCENT", slot6: "ACCURACY", subs: SUBS_SPEED_ACC,
};
/** 防御DOWN役(モッチー闇は抵抗無視なので的中は要らない)。解除役より少し遅く、支援役より速く */
const DEFDOWNER: Build = {
  type: "SUPPORT", abilityPoints: { hp: 30, atk: 0, def: 10, spd: 60 },
  set4: "SWIFT", set2: "RESIST_SET", slot2: "HP_PERCENT", slot4: "HP_PERCENT", slot6: "HP_PERCENT",
  subs: ["SPD", "HP_PERCENT", "DEF_PERCENT", "RESISTANCE", "HP_FLAT", "ATK_PERCENT"],
};
/** 攻撃支援役。防御DOWN役より後、アタッカーより前に動く速さ */
const BOOSTER: Build = {
  type: "SUPPORT", abilityPoints: { hp: 60, atk: 0, def: 30, spd: 10 },
  set4: "SWIFT", set2: "RESIST_SET", slot2: "HP_PERCENT", slot4: "HP_PERCENT", slot6: "HP_PERCENT",
  subs: ["HP_PERCENT", "DEF_PERCENT", "RESISTANCE", "HP_FLAT", "ATK_PERCENT", "ACCURACY"],
};
/**
 * 最後に動くアタッカー。**速度を積まない**(2枠も攻撃%、サブにも速度を入れない)。
 * 解除と防御DOWNが済んだ盤面へ撃つための、合法な順番の作り方。
 */
const ATTACKER_LAST: Build = {
  type: "ATTACK", abilityPoints: { hp: 0, atk: 100, def: 0, spd: 0 },
  set4: "CRIT", set2: "POWER", slot2: "ATK_PERCENT", slot4: "CRIT_DMG", slot6: "ATK_PERCENT",
  subs: ["CRIT_RATE", "CRIT_DMG", "ATK_PERCENT", "HP_PERCENT", "DEF_PERCENT", "ACCURACY"],
};

/* ================================================================ プロファイル */

const P = (family: Family, main: Profile["main"], specials: Special4[], weak: WeakKey4, label: string): Profile => ({ family, main, specials, weak, label });

/** 誰にでも着けられる基本の4系統 */
function baseProfiles(m: Member, opts: { atk?: Special4[]; atkWeak?: WeakKey4; healSlot?: 1 | 2 | 3; shieldSlot?: 1 | 2 | 3; rateSlot?: 1 | 2 | 3 }): Record<string, Profile> {
  const defTank = m.role === "DEF";
  const hs = `S${opts.healSlot ?? 3}_HEAL` as Special4;
  const ss = `S${opts.shieldSlot ?? 3}_HEAL` as Special4;
  const rs = `S${opts.rateSlot ?? 3}_RATE` as Special4;
  return {
    ATK: P("ATK", "ATK", opts.atk ?? ["S3", "FIRST", "SELF_HP70"], opts.atkWeak ?? "FIRST_ASSIST", "攻撃(ATKメイン)"),
    DEF: P("DEF", defTank ? "DEF" : "HP", defTank ? ["DEF_UP", "DMG_TAKEN", "CRIT_TAKEN"] : ["MAX_HP", "DMG_TAKEN", "CRIT_TAKEN"], "W_CRIT", `耐久(${defTank ? "DEF" : "HP"}メイン)`),
    SUP_HEAL: P("SUP", "HP", ["HEAL_UP", hs, "LOW30_HEAL"], "WS_LOW30_HEAL", "サポート回復特化(HPメイン)"),
    SUP_CLEANSE: P("SUP", "HP", ["CLEANSE_HEAL", "CLEANSE_GAUGE", "HEAL_UP"], "WS_CLEANSE_HEAL", "サポート解除特化(HPメイン)"),
    SUP_SHIELD: P("SUP", "HP", ["SHIELD_UP", ss, "LOW50_SHIELD"], "WS_SHIELD", "サポートシールド特化(HPメイン)"),
    SUP_BUFF: P("SUP", "HP", ["BUFF_GAUGE", "BUFF_HEAL", "HEAL_UP"], "WS_BUFF_HEAL", "サポート強化支援(HPメイン)"),
    SUP_GAUGE: P("SUP", "HP", ["HEALED_GAUGE", "HEALER_GAUGE", "HEAL_UP"], "WS_HEALED_GAUGE", "サポート回復ゲージ(HPメイン)"),
    DIS_RATE: P("DIS", "HP", ["DEBUFF_RATE", rs, "FIRST_RATE"], "WD_RATE", "妨害付与率(HPメイン)"),
    DIS_RATE_ATK: P("DIS", "ATK", ["DEBUFF_RATE", rs, "FIRST_RATE"], "WD_RATE", "妨害付与率(ATKメイン)"),
    DIS_STRIP: P("DIS", "HP", ["DEBUFF_RATE", "STRIP_SELF_GAUGE", "STRIP_TARGET_GAUGE"], "WD_STRIP_GAUGE", "妨害解除特化(HPメイン)"),
    DIS_GAUGE: P("DIS", "HP", ["GAUGE_DOWN_UP", "DEBUFFED_GAUGE_DOWN", "DEBUFF_SELF_GAUGE"], "WD_GAUGE_DOWN", "妨害ゲージ(HPメイン)"),
    DIS_SPD: P("DIS", "HP", ["SPD_IF_DEBUFF3", "DEBUFF_RATE", "DEBUFF_SELF_GAUGE"], "WD_DEBUFF_GAUGE", "妨害SPD(危険確認用)"),
  };
}

function withProfiles(m: Member, role4: string, opts: Parameters<typeof baseProfiles>[1] = {}, extra: Partial<Member4> = {}): Member4 {
  const atk = opts.atk ?? (m.role === "ATK" ? (m.acc.specials as Special4[]) : undefined);
  return { ...m, ...extra, profiles: baseProfiles(m, { ...opts, atk, atkWeak: opts.atkWeak ?? (m.role === "ATK" ? m.acc.weak : undefined) }), role4 };
}

const memberOf = (teams: Team[], key: string) => {
  for (const t of teams) for (const m of t.members) if (m.key === key) return m;
  throw new Error(`${key} が見つからない`);
};

const newMember = (key: string, label: string, templateId: string, element: Element, role: Member["role"], build: Build, latentIndex: number, skills: string, why: string): Member =>
  ({ key, label, templateId, element, role, build, latentIndex, skills, why, acc: { specials: [], weak: "W_CRIT" } });

/* ================================================================ 攻撃 */

/** 前回の最終4編成(1d/2d/3d/4d)と、その入れ替え候補にいた個体 */
const pool = [...ATTACKS, ...ATTACK_VARIANTS];
const nemesisDark = memberOf(pool, "nemesis_DARK");
const griffonLight = memberOf(pool, "griffon_LIGHT");
const nemesisGrass = memberOf(pool, "nemesis_GRASS");
const dragonWater = memberOf(pool, "dragon_WATER");
const jokerWater = memberOf(pool, "joker_WATER");

/* --- 解除 → 防御DOWN → 火力 の部品 --- */
const undineLightStrip = newMember("undine_LIGHT", "ウンディーネ[光]", "undine", "LIGHT", "DIS", STRIPPER, 2,
  "S3 敵全体の強化を**全部**解除(確定・抵抗判定あり)+ゲージ-35%+味方全体回復25%+攻撃UP(CT6)",
  "数の上限なしの全体解除を確定で撃てる(我慢・無敵・シールド・防御UPまで届く)。回復と攻撃UPも付く");
const jokerStrip = { ...jokerWater, key: "joker_WATER", build: STRIPPER, why: "敵全体の強化を全部解除(100%)し、同じ技で防御DOWN100%も入れる" };
const abyssLightStrip = newMember("abyssreaper_LIGHT", "アビスリーパー[光]", "abyssreaper", "LIGHT", "DIS", STRIPPER, 1,
  "S3 敵全体の強化を全部解除(77%)+味方全体ゲージ+30%+自身に復活(CT5)", "全体解除に味方の加速が付く");
const wolfLightStrip = newMember("wolf_LIGHT", "ウルフ[光]", "wolf", "LIGHT", "DIS", STRIPPER, 1,
  "S2 敵全体の強化を全部解除(59%)+攻撃DOWN83%(**CT2**)", "全体解除をCT2で撃ち直せる。1回の成功率は低いが回数で補う");
const mocchiDark = newMember("mocchi_DARK", "モッチー[闇]", "mocchi", "DARK", "DIS", DEFDOWNER, 2,
  "S3 敵全体 防御DOWN90%(**抵抗無視**・免疫には入らない)+味方全体 攻撃UP+ゲージ+10%(CT4)",
  "抵抗の高い耐久防衛にも防御DOWNが入る。同じ技で味方全体の攻撃UPとゲージUPも配る(コラボ種族)");
const wolfElectric = newMember("wolf_ELECTRIC", "ウルフ[電気]", "wolf", "ELECTRIC", "SUP", BOOSTER, 0,
  "S3 味方全体 ゲージ+24%+速度UP(CT3)", "アタッカーの手番を前へ引き寄せる");
const griffonElectric = newMember("griffon_ELECTRIC", "グリフォン[電気]", "griffon", "ELECTRIC", "SUP", BOOSTER, 0,
  "S3 味方全体 攻撃UP+クリダメUP+ゲージ+18%(CT4)", "攻撃UPとクリダメUPでアタッカーの一撃を重くする");
const nemesisLast = { ...nemesisDark, key: "nemesis_DARK", build: ATTACKER_LAST, why: "解除と防御DOWNが済んだ盤面へ、全体S3(ATK×2.12×2+防御DOWN)を撃つ。**あえて速度を積まず最後に動かす**" };

const B = (m: Member, role4: string, tag: Tag, opts: Parameters<typeof baseProfiles>[1] = {}) => withProfiles(m, role4, opts, { tag });

/**
 * モッチー闇の妨害は、**スキルに噛み合うものだけ**を選ぶ。
 * S3の防御DOWNは抵抗無視の経路(`ignoreResistance`)を通るので、本番の「付与率」の口
 * (`debuffChanceBonus`)は効かない。効くのはS3の発動率そのもの(S3弱体付与率UP)だけ。
 */
const mocchiProfiles = (m: Member4): Member4 => ({ ...m, profiles: { ...m.profiles,
  DIS_MOCCHI: P("DIS", "HP", ["S3_RATE", "DEBUFF_SELF_GAUGE", "S2_RATE"], "WD_S3_RATE", "妨害(S3付与率・弱体成功時ゲージ・S2付与率)"),
} });

/** OFF-B の候補。アクセなしで6防衛と戦わせ、最も勝てる組を採る */
export const OFF_B_CANDIDATES: Team4[] = [
  { key: "B-und", label: "ウンディーネ光・モッチー闇・ウルフ電気・ネメシス闇", concept: "", members: [
    B(undineLightStrip, "DIS_STRIP", "STRIP"), mocchiProfiles(B(mocchiDark, "DIS_MOCCHI", "DEFDOWN")), B(wolfElectric, "SUP_BUFF", "SUPPORT"), B(nemesisLast, "ATK", "ATTACKER")] },
  { key: "B-jok", label: "ジョーカー水・モッチー闇・ウルフ電気・ネメシス闇", concept: "", members: [
    B(jokerStrip, "DIS_STRIP", "STRIP"), mocchiProfiles(B(mocchiDark, "DIS_MOCCHI", "DEFDOWN")), B(wolfElectric, "SUP_BUFF", "SUPPORT"), B(nemesisLast, "ATK", "ATTACKER")] },
  { key: "B-aby", label: "アビスリーパー光・モッチー闇・ウルフ電気・ネメシス闇", concept: "", members: [
    B(abyssLightStrip, "DIS_STRIP", "STRIP"), mocchiProfiles(B(mocchiDark, "DIS_MOCCHI", "DEFDOWN")), B(wolfElectric, "SUP_BUFF", "SUPPORT"), B(nemesisLast, "ATK", "ATTACKER")] },
  { key: "B-wol", label: "ウルフ光・モッチー闇・ウルフ電気・ネメシス闇", concept: "", members: [
    B(wolfLightStrip, "DIS_STRIP", "STRIP", { rateSlot: 2 }), mocchiProfiles(B(mocchiDark, "DIS_MOCCHI", "DEFDOWN")), B(wolfElectric, "SUP_BUFF", "SUPPORT"), B(nemesisLast, "ATK", "ATTACKER")] },
  { key: "B-und-gri", label: "ウンディーネ光・モッチー闇・グリフォン電気・ネメシス闇", concept: "", members: [
    B(undineLightStrip, "DIS_STRIP", "STRIP"), mocchiProfiles(B(mocchiDark, "DIS_MOCCHI", "DEFDOWN")), B(griffonElectric, "SUP_BUFF", "SUPPORT"), B(nemesisLast, "ATK", "ATTACKER")] },
  { key: "B-und-jok", label: "ウンディーネ光・ジョーカー水・ウルフ電気・ネメシス闇", concept: "", members: [
    B(undineLightStrip, "DIS_STRIP", "STRIP"), B({ ...jokerWater, build: DEFDOWNER }, "DIS_RATE", "DEFDOWN"), B(wolfElectric, "SUP_BUFF", "SUPPORT"), B(nemesisLast, "ATK", "ATTACKER")] },
  { key: "B-und-2atk", label: "ウンディーネ光・モッチー闇・グリフォン光・ネメシス闇", concept: "", members: [
    B(undineLightStrip, "DIS_STRIP", "STRIP"), mocchiProfiles(B(mocchiDark, "DIS_MOCCHI", "DEFDOWN")), B(griffonLight, "ATK", "SUPPORT"), B(nemesisLast, "ATK", "ATTACKER")] },
];

const withoutEffect = (slot: number, kinds: string[]) => (def: MonsterDefinition): MonsterDefinition => ({
  ...def,
  skills: def.skills.map((k, i) => (i === slot ? { ...k, effects: k.effects.filter((e) => !kinds.includes(e.kind) || (e.kind === "GAUGE" && (e as { amount: number }).amount < 0 && !kinds.includes("GAUGE_DOWN"))) } : k)) as MonsterDefinition["skills"],
});
/** OFF-B(アビスリーパー光)の切り分け: S3から解除を抜く / 味方ゲージUPを抜く / 両方抜く(**検証用の写しだけ**) */
export function offBAblations(): Team4[] {
  const base = OFF_B_CANDIDATES.find((t) => t.key === "B-aby")!;
  const variant = (key: string, label: string, kinds: string[]): Team4 => ({
    key, label, concept: "切り分け専用(本番のスキルは変えていない)",
    members: base.members.map((m) => (m.tag === "STRIP" ? { ...m, patch: withoutEffect(2, kinds) } : m)),
  });
  return [
    variant("B-aby-noStrip", "S3の解除を抜いた写し", ["STRIP"]),
    variant("B-aby-noGauge", "S3の味方ゲージ+30%を抜いた写し", ["GAUGE"]),
    variant("B-aby-noBoth", "S3の解除と味方ゲージを両方抜いた写し", ["STRIP", "GAUGE"]),
  ];
}

const offOf = (key: string) => ATTACKS.find((t) => t.key === key)!;
const plain = (t: Team, key: string, label: string, concept: string, role: (m: Member) => string): Team4 =>
  ({ key, label, concept, members: t.members.map((m) => withProfiles(m, role(m))) });
const roleDefault = (m: Member) => (m.role === "ATK" ? "ATK" : m.key === "joker_WATER" ? "DIS_STRIP" : m.role === "DIS" ? "DIS_RATE" : m.role === "SUP" ? "SUP_BUFF" : m.role === "HEAL" ? "SUP_HEAL" : "DEF");

/** OFF-B は候補から選んだ後に差し替える(`setOffB`) */
export const ATTACKS4: Team4[] = [
  { key: "OFF-A", label: "OFF-A 純火力", concept: "強化解除を持たないATK火力。防御DOWNはネメシス闇S3・ネメシス草S2・ドラゴン水S2が自前で入れる。前回の『標準火力』からジョーカー水(解除)を抜き、ドラゴン水を戻した組(前回の候補1c)",
    members: [nemesisDark, griffonLight, nemesisGrass, dragonWater].map((m) => withProfiles(m, "ATK")) },
  { key: "OFF-B", label: "OFF-B 解除→防御DOWN→火力", concept: "", members: [] },
  { ...plain(offOf("2"), "OFF-C", "OFF-C 防御無視", "前回の『防御無視』そのまま。ドラゴン闇の全体防御無視、崩壊4セットのフェンリル火、速い相手に防御55%無視のグジラ火、強化を剥がすジョーカー水", roleDefault) },
  { ...plain(offOf("3"), "OFF-D", "OFF-D 単体突破", "前回の『単体突破』そのまま。ネメシス火・グリフォン闇・フェンリル闇の単体技と、シールドを剥がすジョーカー水。狙いは本番AIのまま", roleDefault) },
  { ...plain(offOf("4"), "OFF-E", "OFF-E 速度・妨害", "前回の『速度・妨害』そのまま。クロノス草の全体ゲージ-100%、スエゾー闇の全体攻撃DOWN+ゲージ削り、フェンリル光の全体スタン+CT延長、ネメシス闇の全体火力。**強化解除を持たない**", (m) => (m.key === "chronos_GRASS" || m.key === "suezo_DARK" ? "DIS_GAUGE" : roleDefault(m))) },
];

export function setOffB(candidateKey: string, concept: string): Team4 {
  const c = OFF_B_CANDIDATES.find((t) => t.key === candidateKey)!;
  const team = { key: "OFF-B", label: `OFF-B 解除→防御DOWN→火力(候補${candidateKey})`, concept, members: c.members };
  ATTACKS4[1] = team;
  return team;
}

/** 我慢対策の比較用: OFF-E に全体解除を1枠入れた版(フェンリル光 → ジョーカー水) */
export const OFF_E_STRIP: Team4 = {
  key: "OFF-E+解除", label: "OFF-E+解除(フェンリル光→ジョーカー水)", concept: "我慢対策の比較用",
  members: offOf("4").members.map((m) => (m.key === "fenrir_LIGHT" ? withProfiles(jokerStrip, "DIS_STRIP") : withProfiles(m, m.key === "chronos_GRASS" || m.key === "suezo_DARK" ? "DIS_GAUGE" : roleDefault(m)))),
};

/* ================================================================ 防衛(前回の6系統そのまま) */

/** 防衛側の役割最適: タンク → 耐久 / ヒーラー → サポート / 妨害役 → 妨害 / 火力役 → 攻撃 */
function defenseRole(m: Member): string {
  if (m.role === "HEAL") return "SUP_HEAL";
  if (m.role === "DIS" || m.role === "SUP") return "DIS_GAUGE";
  if (m.role === "ATK") return "ATK";
  return "DEF";
}
/** ヒーラーの主な回復がどの枠か(S1/S2/S3回復量UPの選び先) */
const HEAL_SLOT: Record<string, 1 | 2 | 3> = { undine_WATER: 2, fairy_LIGHT: 3, valkyria_WATER: 2 };
const SHIELD_SLOT: Record<string, 1 | 2 | 3> = { behemoth_LIGHT: 3, golem_LIGHT: 3 };
const RATE_SLOT: Record<string, 1 | 2 | 3> = { chronos_GRASS: 3, suezo_DARK: 2 };

export const DEFENSES4: Team4[] = DEFENSES.map((t) => ({
  key: t.key, label: t.label, concept: t.concept,
  members: t.members.map((m) => {
    const x = withProfiles(m, defenseRole(m), { healSlot: HEAL_SLOT[m.key], shieldSlot: SHIELD_SLOT[m.key], rateSlot: RATE_SLOT[m.key] });
    // 防衛側の「耐久」は前回と同じ組(E・Fは相手の攻撃の形に寄せた特化の組)
    x.profiles.DEF = { ...x.profiles.DEF, specials: m.acc.specials as Special4[], weak: m.acc.weak };
    return x;
  }),
}));

export { memberOf };
