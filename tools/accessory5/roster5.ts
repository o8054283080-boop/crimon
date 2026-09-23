/**
 * サポート・妨害の最終調整検証の顔ぶれと、各個体のアクセの選択肢。
 *
 * **検証専用。本番のデータには何も書かない。**
 *
 * 攻撃5系統(OFF-A〜E)と防衛6系統(A〜F)は**前回の総合検証と同じ個体・同じ装備**(`../accessory4/roster4.ts`)。
 * OFF-B は前回選んだ「アビスリーパー光 → モッチー闇 → ウルフ電気 → ネメシス闇」(候補B-aby)をそのまま使う。
 *
 * 今回足した防衛(現在の main から選んだ代表個体を入れるため):
 *   G  サポート耐久   フェアリー光(回復+解除)・ゴーレム光(シールド)・フェニックス闇(蘇生)・ベヒモス水(タンク)
 *   G2 サポート耐久2  ウンディーネ水(回復+解除)・ベヒモス光(シールド+我慢)・フェニックス闇(蘇生)・シェルタートル光(バフ支援)
 *   H  純ヒーラー     フェアリー水(回復だけ)・ウンディーネ電気(回復+解除+シールド)・ベヒモス光・シェルタートル光
 *   X  妨害ハメ(防衛) クロノス草・スエゾー闇・ベヒモス水・ベヒモス闇(全員が敵全体のゲージを削る)
 * 攻撃:
 *   OFF-X 妨害ハメ    クロノス草・スエゾー闇・フェンリル光(全体スタン+CT延長)・ベヒモス水(速い型)
 *
 * ## アクセの選択肢(プロファイル)
 *
 * 1体ごとに「どの系統のアクセを、どのメインで着けるか」を持たせる。先頭から ヒーロー=1個 / レジェンド=2個 / エピック=3個。
 * サポートの特化は依頼9章の組をそのまま使い、**スキル構成に合わないものだけ差し替える**(回復を持たないシールド役など)。
 */
import type { Element } from "../../src/core/element.js";
import type { MonsterDefinition } from "../../src/core/monster.js";
import type { Build, Member } from "../arenaFinal/roster.js";
import { ATTACKS4, DEFENSES4, OFF_B_CANDIDATES, OFF_E_STRIP, memberOf, type Member4, type Team4 } from "../accessory4/roster4.js";
import type { Family, Special5, WeakKey5 } from "./specials5.js";

export interface Profile5 {
  family: Family;
  main: "ATK" | "HP" | "DEF";
  specials: Special5[];
  weak: WeakKey5;
  label: string;
}
export type Tag = "STRIP" | "DEFDOWN" | "ATTACKER" | "SUPPORT";
/** サポートの役どころ(比較の対象を選ぶのに使う) */
export type SupRole = "HEALER" | "SHIELDER" | "CLEANSER" | "REVIVER" | "BUFFER" | "TANK" | "GAUGE" | "CC" | "DEFDOWN" | "STRIPPER" | "DPS";

export interface Member5 {
  key: string; label: string; templateId: string; element: Element; role: Member["role"]; build: Build; latentIndex: number;
  skills: string; why: string;
  /** 前回の防衛で使っていた耐久アクセの組(E・F は相手の攻撃の形に寄せた特化) */
  defSpecials?: Special5[]; defWeak?: WeakKey5;
  patch?: (def: MonsterDefinition) => MonsterDefinition;
  profiles: Record<string, Profile5>;
  role5: string;
  tag?: Tag;
  sup: SupRole[];
}
export interface Team5 { key: string; label: string; concept: string; members: Member5[] }

const P = (family: Family, main: Profile5["main"], specials: Special5[], weak: WeakKey5, label: string): Profile5 => ({ family, main, specials, weak, label });

interface Kit { heal?: boolean; cleanse?: boolean; shield?: boolean; buff?: boolean; revive?: boolean; rateSlot?: 1 | 2 | 3 }

/** 誰にでも着けられる基本の4系統 + サポートの6特化 + 妨害の5組 */
function profiles5(m: Member4 | Member, kit: Kit, defSpecials?: Special5[], defWeak?: WeakKey5): Record<string, Profile5> {
  const defTank = m.role === "DEF";
  const rs = `S${kit.rateSlot ?? 3}_RATE` as Special5;
  const atkSpecials = (m.role === "ATK" ? (m.acc.specials as Special5[]) : ["S3", "FIRST", "SELF_HP70"]) as Special5[];
  const atkWeak = (m.role === "ATK" ? m.acc.weak : "FIRST_ASSIST") as WeakKey5;
  // シールド特化の2番目: 回復を持つなら「HP50%以下を回復した時シールド」、持たないなら「強化付与時シールド」を繰り上げる
  const shieldSet: Special5[] = kit.heal ? ["SHIELD_UP", "LOW50_HEALED_SHIELD", "BUFF_SHIELD"] : ["SHIELD_UP", "BUFF_SHIELD", kit.cleanse ? "CLEANSE_SHIELD" : "BUFF_GAUGE"];
  // 回復を持たない個体の回復特化は意味が無いので、回復系の枠を解除・強化に寄せる
  const healSet: Special5[] = ["HEAL_UP", "LOW50_HEAL", "HEALED_DR"];
  const guardSet: Special5[] = ["HEALED_DR", "HEALED_SHIELD", "LOW50_HEALED_SHIELD"];
  return {
    ATK: P("ATK", "ATK", atkSpecials, atkWeak, "攻撃(ATKメイン)"),
    DEF: P("DEF", defTank ? "DEF" : "HP", defSpecials ?? (defTank ? ["DEF_UP", "DMG_TAKEN", "CRIT_TAKEN"] : ["MAX_HP", "DMG_TAKEN", "CRIT_TAKEN"]), defWeak ?? "W_CRIT", `耐久(${defTank ? "DEF" : "HP"}メイン)`),
    DEF_STD: P("DEF", defTank ? "DEF" : "HP", defTank ? ["DEF_UP", "DMG_TAKEN", "CRIT_TAKEN"] : ["MAX_HP", "DMG_TAKEN", "CRIT_TAKEN"], "W_CRIT", `耐久標準(${defTank ? "DEF" : "HP"}メイン)`),
    SUP_HEAL: P("SUP", "HP", healSet, "WS_HEAL", "サポート回復特化"),
    SUP_GUARD: P("SUP", "HP", guardSet, "WS_HEALED_SHIELD", "サポート保護特化"),
    SUP_SHIELD: P("SUP", "HP", shieldSet, "WS_SHIELD", "サポートシールド特化"),
    SUP_CLEANSE: P("SUP", "HP", ["CLEANSE_SHIELD", "CLEANSE_HEAL", "CLEANSE_GAUGE"], "WS_CLEANSE_HEAL", "サポート解除特化"),
    SUP_TEMPO: P("SUP", "HP", ["HEALED_GAUGE", "BUFF_GAUGE", "SUPPORT_SELF_GAUGE"], "WS_HEALED_GAUGE", "サポート行動支援特化"),
    SUP_REVIVE: P("SUP", "HP", ["REVIVE_HP", "REVIVE_SHIELD", "HEAL_UP"], "WS_REVIVE", "サポート蘇生特化"),
    DIS_RATE: P("DIS", "HP", ["DEBUFF_RATE", rs, "DEBUFF_SELF_GAUGE"], "WD_RATE", "妨害付与率(HPメイン)"),
    DIS_RATE_ATK: P("DIS", "ATK", ["DEBUFF_RATE", rs, "DEBUFF_SELF_GAUGE"], "WD_RATE", "妨害付与率(ATKメイン)"),
    DIS_STRIP: P("DIS", "HP", ["STRIP_SELF_GAUGE", "STRIP_TARGET_GAUGE", "DEBUFF_RATE"], "WD_STRIP_GAUGE", "妨害解除特化(HPメイン)"),
    DIS_GAUGE: P("DIS", "HP", ["GAUGE_DOWN_UP", "DEBUFFED_GAUGE_DOWN", "DEBUFF_SELF_GAUGE"], "WD_GAUGE_DOWN", "妨害ゲージ(HPメイン)"),
    DIS_GAUGE_ATK: P("DIS", "ATK", ["GAUGE_DOWN_UP", "DEBUFFED_GAUGE_DOWN", "DEBUFF_SELF_GAUGE"], "WD_GAUGE_DOWN", "妨害ゲージ(ATKメイン)"),
    DIS_CC: P("DIS", "HP", ["STUNNED_DMG", "DEBUFF_RATE", rs], "WD_STUNNED_DMG", "妨害+火力(HPメイン)"),
    DIS_CC_ATK: P("DIS", "ATK", ["STUNNED_DMG", "DEBUFF_RATE", rs], "WD_STUNNED_DMG", "妨害+火力(ATKメイン)"),
    ATK_ONLY: P("ATK", "ATK", ["S3", "FIRST", "SELF_HP70"], "FIRST_ASSIST", "攻撃特殊(ATKメイン)"),
  };
}

/** 個体ごとのスキル構成(サポート特化の差し替えと、比較の対象選びに使う) */
const KIT: Record<string, Kit & { sup: SupRole[] }> = {
  undine_WATER: { heal: true, cleanse: true, sup: ["HEALER", "CLEANSER"] },
  fairy_LIGHT: { heal: true, cleanse: true, sup: ["HEALER", "CLEANSER"] },
  valkyria_WATER: { heal: true, buff: true, sup: ["HEALER"] },
  fairy_WATER: { heal: true, sup: ["HEALER"] },
  undine_ELECTRIC: { heal: true, cleanse: true, shield: true, buff: true, sup: ["HEALER", "SHIELDER", "CLEANSER"] },
  golem_LIGHT: { shield: true, cleanse: true, buff: true, sup: ["SHIELDER", "TANK"] },
  behemoth_LIGHT: { shield: true, cleanse: true, buff: true, sup: ["SHIELDER", "TANK"] },
  phoenix_DARK: { heal: true, revive: true, sup: ["REVIVER", "TANK"] },
  shellturtle_LIGHT: { buff: true, cleanse: true, sup: ["BUFFER", "TANK"] },
  chronos_GRASS: { rateSlot: 2, sup: ["GAUGE", "CC"] },
  suezo_DARK: { rateSlot: 2, sup: ["GAUGE", "CC"] },
  behemoth_WATER: { rateSlot: 2, sup: ["GAUGE", "TANK"] },
  behemoth_DARK: { rateSlot: 3, sup: ["GAUGE", "TANK"] },
  basilisk_ELECTRIC: { rateSlot: 2, sup: ["CC"] },
  fenrir_LIGHT: { rateSlot: 3, sup: ["CC", "DPS"] },
  joker_WATER: { rateSlot: 3, sup: ["STRIPPER", "DEFDOWN"] },
  abyssreaper_LIGHT: { revive: true, sup: ["STRIPPER", "REVIVER"] },
  mocchi_DARK: { rateSlot: 3, sup: ["DEFDOWN"] },
  wolf_ELECTRIC: { buff: true, sup: ["BUFFER"] },
};

function to5(m: Member4 | Member, role5: string, extra: Partial<Member5> = {}): Member5 {
  const kit = KIT[m.key] ?? { sup: m.role === "ATK" ? ["DPS"] : ["TANK"] };
  const m4 = m as Member4;
  return {
    key: m.key, label: m.label, templateId: m.templateId, element: m.element, role: m.role, build: m.build, latentIndex: m.latentIndex,
    skills: m.skills, why: m.why, patch: m4.patch, tag: m4.tag,
    profiles: profiles5(m, kit, extra.defSpecials, extra.defWeak),
    role5, sup: kit.sup, ...extra,
  };
}

/* ================================================================ 役割最適 */

/** 役割最適: タンク → 耐久 / ヒーラー → サポート回復特化 / シールド役 → サポートシールド特化 / 妨害役 → 妨害ゲージ / 火力 → 攻撃 */
function roleOf(m: Member4 | Member): string {
  const kit = KIT[m.key];
  if (m.role === "ATK") return "ATK";
  if (m.key === "phoenix_DARK") return "DEF";
  if (kit?.sup.includes("HEALER")) return "SUP_HEAL";
  if (kit?.sup.includes("SHIELDER")) return "SUP_SHIELD";
  if (kit?.sup.includes("GAUGE") && m.role !== "HP") return "DIS_GAUGE";
  if (m.role === "DIS" || m.role === "SUP") return "DIS_RATE";
  return "DEF";
}

/* ================================================================ 攻撃 */

const offB4 = OFF_B_CANDIDATES.find((t) => t.key === "B-aby")!;
/** OFF-B の役割最適: 解除役 → 妨害解除特化 / 防御DOWN役 → 妨害(S3付与率) / 支援役 → サポート行動支援 / アタッカー → 攻撃 */
const offBRole: Record<string, string> = { STRIP: "DIS_STRIP", DEFDOWN: "DIS_MOCCHI", SUPPORT: "SUP_TEMPO", ATTACKER: "ATK" };

function offBMember(m: Member4): Member5 {
  const x = to5(m, offBRole[m.tag!]);
  // モッチー闇S3の防御DOWNは抵抗無視(`ignoreResistance`)の経路。効くのはS3の発動率そのもの(S3付与率UP)だけ
  x.profiles.DIS_MOCCHI = P("DIS", "HP", ["S3_RATE", "DEBUFF_SELF_GAUGE", "S2_RATE"], "WD_S3_RATE", "妨害(S3付与率・弱体成功時ゲージ・S2付与率)");
  return x;
}

const off4 = (key: string) => ATTACKS4.find((t) => t.key === key)!;
const remap = (t: Team4, key = t.key, label = t.label, concept = t.concept): Team5 => ({ key, label, concept, members: t.members.map((m) => to5(m, m.role4 === "SUP_BUFF" ? "SUP_TEMPO" : m.role4 === "DIS_STRIP" ? "DIS_STRIP" : m.role4 === "DIS_GAUGE" ? "DIS_GAUGE" : m.role4 === "DIS_RATE" ? "DIS_RATE" : m.role4 === "ATK" ? "ATK" : roleOf(m))) });

export const OFF_B5: Team5 = {
  key: "OFF-B", label: "OFF-B 解除→防御DOWN→火力",
  concept: "前回の最重要編成(候補B-aby)をそのまま再使用。①アビスリーパー光S3(敵全体の強化解除+味方全体ゲージ+30%)→②モッチー闇S3(敵全体 防御DOWN・抵抗無視+味方全体 攻撃UP・ゲージ+10%)→③ウルフ電気S3(味方全体ゲージ+24%・速度UP)→④ネメシス闇の全体S3",
  members: offB4.members.map(offBMember),
};

const newMember = (key: string, label: string, templateId: string, element: Element, role: Member["role"], build: Build, latentIndex: number, skills: string, why: string): Member =>
  ({ key, label, templateId, element, role, build, latentIndex, skills, why, acc: { specials: [], weak: "W_CRIT" } });

const offE = off4("OFF-E");
const chronosAtk = offE.members.find((m) => m.key === "chronos_GRASS")!;
const suezoAtk = offE.members.find((m) => m.key === "suezo_DARK")!;
const fenrirLight = offE.members.find((m) => m.key === "fenrir_LIGHT")!;
const behemothWaterFast = newMember("behemoth_WATER", "ベヒモス[水]", "behemoth", "WATER", "SUP", chronosAtk.build, 2,
  "S2 敵全体 攻撃DOWN83%+ゲージ-35%", "敵全体のゲージ削りを4体目にも持たせる(速い型に組み直した)");

export const ATTACKS5: Team5[] = [
  remap(off4("OFF-A")),
  OFF_B5,
  remap(off4("OFF-C")),
  remap(off4("OFF-D")),
  remap(off4("OFF-E")),
];
export const OFF_E_STRIP5: Team5 = remap(OFF_E_STRIP);

/** ゲージハメ検証(23章): 攻撃側の妨害4体。全員に妨害エピックを着ける前提 */
export const OFF_X: Team5 = {
  key: "OFF-X", label: "OFF-X 妨害ハメ(攻撃)", concept: "敵全体のゲージを削る・止める技だけを4体に集めた。クロノス草S3(全体ゲージ-100%)・スエゾー闇S2(CT2で全体ゲージ-30%)・フェンリル光S3(全体スタン+CT延長)・ベヒモス水S2(全体ゲージ-35%)",
  members: [to5(chronosAtk, "DIS_GAUGE"), to5(suezoAtk, "DIS_GAUGE"), to5(fenrirLight, "DIS_CC_ATK"), to5(behemothWaterFast, "DIS_GAUGE")],
};

/* ================================================================ 防衛 */

export const DEFENSES5: Team5[] = DEFENSES4.map((t) => ({
  key: t.key, label: t.label, concept: t.concept,
  members: t.members.map((m) => to5(m, roleOf(m), { defSpecials: m.profiles.DEF.specials as Special5[], defWeak: m.profiles.DEF.weak as WeakKey5 })),
}));

const defM = (key: string) => {
  for (const t of DEFENSES4) for (const m of t.members) if (m.key === key) return m;
  throw new Error(`${key} が防衛に無い`);
};
const fairyLight = defM("fairy_LIGHT");
const undineWater = defM("undine_WATER");
const golemLight = defM("golem_LIGHT");
const behemothLight = defM("behemoth_LIGHT");
const behemothWater = defM("behemoth_WATER");
const phoenixDark = defM("phoenix_DARK");
const shellLight = defM("shellturtle_LIGHT");
const chronosDef = defM("chronos_GRASS");
const suezoDef = defM("suezo_DARK");
const behemothDark = defM("behemoth_DARK");
const fairyWater = newMember("fairy_WATER", "フェアリー[水]", "fairy", "WATER", "HEAL", fairyLight.build, 2,
  "S1 自身回復4% / S2 味方全体回復26%(CT3) / S3 味方全体回復41.3%(CT4)", "解除も免疫も持たない、回復だけのヒーラー(純ヒーラーの代表)");
const undineElectric = newMember("undine_ELECTRIC", "ウンディーネ[電気]", "undine", "ELECTRIC", "HEAL", fairyLight.build, 2,
  "S2 単体回復46%+解除+免疫3T(CT2) / S3 味方全体シールド30%+防御UP+速度UP+CT短縮(CT6)", "回復・解除・全体シールドを1体で持つ");

const std = (m: Member4 | Member, role: string) => to5(m, role);
export const DEFENSES_NEW: Team5[] = [
  { key: "G", label: "G サポート耐久", concept: "ヒーラー(フェアリー光)・シールド役(ゴーレム光)・蘇生役(フェニックス闇)・タンク(ベヒモス水)。サポートアクセだけで永久耐久が作れないかを見る(24章)",
    members: [std(fairyLight, "SUP_HEAL"), std(golemLight, "SUP_SHIELD"), std(phoenixDark, "DEF"), std(behemothWater, "DEF")] },
  { key: "G2", label: "G2 サポート耐久2", concept: "ヒーラー(ウンディーネ水)・シールド+我慢(ベヒモス光)・蘇生役(フェニックス闇)・バフ支援タンク(シェルタートル光)",
    members: [std(undineWater, "SUP_HEAL"), std(behemothLight, "SUP_SHIELD"), std(phoenixDark, "DEF"), std(shellLight, "DEF")] },
  { key: "H", label: "H 純ヒーラー", concept: "回復だけのフェアリー水と、回復・解除・シールドのウンディーネ電気。ベヒモス光(シールド)・シェルタートル光(防御UP・保護)と組む",
    members: [std(fairyWater, "SUP_HEAL"), std(undineElectric, "SUP_SHIELD"), std(behemothLight, "DEF"), std(shellLight, "DEF")] },
];

/** ゲージハメ検証(23章): 防衛側の妨害4体 */
export const DEF_X: Team5 = {
  key: "X", label: "X 妨害ハメ(防衛)", concept: "敵全体のゲージを削る技を4体に集めた。クロノス草S3(全体-100%)・スエゾー闇S2(CT2で全体-30%)・ベヒモス水S2(全体-35%)・ベヒモス闇S3(全体-35%+挑発)",
  members: [std(chronosDef, "DIS_GAUGE"), std(suezoDef, "DIS_GAUGE"), std(behemothWater, "DIS_GAUGE"), std(behemothDark, "DIS_GAUGE")],
};

export { memberOf };
