/**
 * **2026年10月のスキル調整の指定を、機械で読める形に書き起こしたもの。**
 *
 * 依頼文の「Lv2 1.15 / Lv3 poison75%」を、そのまま Lv1〜5 の値の列に直してある。
 * 書かれていない Lv は前の段の値を引き継ぐ(`c()`)。**指定に無い値は書かない**
 * (変更前の値を引き継ぐのは `resolve.ts` の仕事)。
 *
 * 曖昧な指定(「少量の速度比例」「控えめに」など)は `note` に、どう具体化したかを書く。
 * 指定の前提が今のゲームと食い違っていて、そのまま入れると作り替えになるものは
 * `pending` にして触らない(理由を書く)。
 */
import {
  ATK_DOWN, ATK_UP, CRI_DMG_UP, DEF_DOWN, DEF_UP, SPD_DOWN,
} from "../../../src/core/statusValues.js";
import { add, patch, rebuild, remove, replace, type Effect, type Series, type SkillSpec } from "./resolve.js";

/** 前の段を引き継いで Lv1〜5 の列にする。c(1, 1.1, undefined, 1.2) → [1, 1.1, 1.1, 1.2, 1.2] */
function c(...values: (number | undefined)[]): Series {
  const out: number[] = [];
  let last: number | undefined;
  for (let i = 0; i < 5; i += 1) {
    const v = values[i];
    if (v !== undefined) last = v;
    if (last === undefined) throw new Error("最初の段が要ります");
    out.push(last);
  }
  return out;
}
/** 指定がある段だけ。無い段は変更前を引き継ぐ */
function only(values: Record<number, number>): Series {
  return [1, 2, 3, 4, 5].map((lv) => values[lv]);
}
/** Lv5 だけ CT を変える */
const ct5 = (n: number): Series => only({ 5: n });
/** Lv1〜4 は変更前のまま、Lv5 だけ n */
const lv5 = (n: number): Series => only({ 5: n });

const BUFF_BLOCK = (chance: number, turns: number): Effect => ({ kind: "STATUS", status: "BUFF_BLOCK", chance, durationTurns: turns, fixedDuration: true });

export const SPEC: SkillSpec[] = [
  /* ================================================================ 1. スライム */
  { id: "slime_s1", values: { "DAMAGE#0.multiplier": c(1.0, 1.05, 1.10, 1.15, 1.20) } },
  {
    id: "slime_s2_a",
    structure: [add(BUFF_BLOCK(0.5, 2))],
    values: {
      "DAMAGE#0.multiplier": c(1.05, 1.15, 1.15, 1.25),
      "DEBUFF#0.chance": c(0.45, 0.45, 0.60),
      ct: ct5(2),
    },
  },
  { id: "slime_s2_b", values: { "DAMAGE#0.multiplier": c(1.30, 1.40, 1.40, 1.50), "POISON#0.chance": only({ 3: 0.75, 4: 0.75, 5: 0.75 }), ct: ct5(2) } },
  { id: "slime_s2_c", values: { "DAMAGE#0.multiplier": c(1.30, 1.40, 1.40, 1.50), "DEBUFF#0.chance": only({ 3: 0.85, 4: 0.85, 5: 0.85 }), ct: ct5(2) } },
  {
    id: "slime_s3_a",
    structure: [add({ kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2, applyTo: "SELF" })],
    values: {
      "DAMAGE#0.multiplier": c(1.50, 1.60, 1.60, 1.70),
      "GAUGE#0.amount": c(0.20, 0.20, 0.25),
      ct: ct5(3),
    },
    note: "自身ゲージは今の「倒した時だけ」の条件を残した(指定は条件を書いていないが、無条件化は勝手な強化になるため)。倍率の指定1.50〜1.70は差し替え後の今の1.80を下回るので、今の値へ引き上げ",
  },
  { id: "slime_s3_b", values: { "DAMAGE#0.multiplier": c(1.10, 1.15, 1.15, 1.20), "POISON#0.chance": only({ 3: 0.85, 4: 0.85, 5: 0.85 }), ct: ct5(4) } },
  { id: "slime_s3_c", values: { "DAMAGE#0.multiplier": c(1.30, 1.40, 1.40, 1.50), "BLIND#0.chance": only({ 1: 0.60, 3: 0.75, 4: 0.75, 5: 0.75 }), ct: ct5(3) } },
  {
    id: "slime_s3_light",
    values: {
      "DAMAGE#0.multiplier": only({ 2: 1.60, 3: 1.60, 4: 1.60, 5: 1.60 }),
      "BLIND#0.chance": only({ 3: 0.85, 4: 0.85, 5: 0.85 }),
      "LIFESTEAL#0.healRate": only({ 4: 0.25, 5: 0.25 }),
      ct: ct5(3),
    },
  },
  { id: "slime_s3_dark", values: { "DAMAGE#0.multiplier": only({ 2: 1.35, 3: 1.35, 4: 1.40, 5: 1.40 }), "POISON#0.chance": only({ 3: 0.90, 4: 0.90, 5: 0.90 }), ct: ct5(3) } },

  /* ================================================================ 2. ウルフ */
  {
    id: "wolf_s1",
    values: { "DAMAGE#0.scaleBonus.bonusAtReference": c(0.30, 0.30, 0.35, 0.35, 0.40) },
    note: "「現行を基準に速度比例を活かす」は数値の指定が無いため、速度比例を 0.30→0.35(Lv3)→0.40(Lv5) と控えめに伸ばした。倍率は今の成長を引き継ぐ",
  },
  {
    id: "wolf_s2_a",
    structure: [patch(0, { scaleBonus: { stat: "spd", bonusAtReference: 0.10 } })],
    note: "「少量の速度比例を追加」は量の指定が無いため 0.10(速度200で攻撃力0.10倍ぶん)とした",
  },
  {
    id: "wolf_s2_b",
    structure: [patch(1, { durationTurns: 2 })],
    values: {
      "STRIP#0.chance": c(0.50, 0.60, 0.75),
      "DEBUFF#0.chance": c(0.70, 0.70, 0.70, 0.85),
      "DEBUFF#0.durationTurns": c(2, 2, 2, 2, 2),
      ct: ct5(2),
    },
    note: "解除(50→60→75%)を Lv2・Lv3、攻撃DOWN(70→85%)を Lv4 に置いた(1段1つ)。攻撃DOWNは全段2T",
  },
  {
    id: "wolf_s2_c",
    structure: [patch(1, { durationTurns: 2 })],
    values: {
      "DAMAGE#0.multiplier": c(1.65, 1.80, 1.80, 1.95),
      "HEAL_BLOCK#0.chance": c(0.70, 0.70, 0.85),
      "POISON#0.durationTurns": c(2),
      ct: ct5(2),
    },
    note: "倍率(1.65→1.80→1.95)を Lv2・Lv4、回復阻害(70→85%)を Lv3 に置いた。毒は全段2T",
  },
  {
    id: "wolf_s3_a",
    structure: [patch(0, { targetHpBonus: [{ hpRatio: 0.5, bonus: 0.3 }], scaleBonus: { stat: "spd", bonusAtReference: 0.20 } })],
    values: {
      "DAMAGE#0.multiplier": c(2.50, 2.70, 2.70, 2.90),
      "STUN#0.chance": c(0.50, 0.50, 0.65),
      ct: ct5(3),
    },
    note: "「少量の速度比例を追加」は 0.20 とした。倍率の指定2.50〜2.90は差し替え後の今の2.80〜3.30を下回るので、今の値へ引き上げ",
  },
  {
    id: "wolf_s3_b",
    values: {
      "DAMAGE#0.multiplier": c(0.95, 1.00),
      "DAMAGE#0.perHit.DEBUFF#0.chance": c(0.25, 0.25, 0.35),
      ct: ct5(3),
    },
  },
  {
    id: "wolf_s3_c",
    flags: { extraTurn: true },
    values: { "GAUGE#0.amount": c(0.20, 0.25, 0.30, 0.35), ct: ct5(3) },
  },
  {
    id: "wolf_s3_light",
    values: { "DAMAGE#0.scaleBonus.bonusAtReference": c(1.2, 1.2, 1.3, 1.3, 1.4) },
    note: "「現行を基準に控えめな速度比例成長」は数値の指定が無いため、速度比例 1.2→1.3(Lv3)→1.4(Lv5)とした",
  },
  {
    id: "wolf_s3_dark",
    structure: [patch(0, { perHitEffects: [{ kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.3 }] })],
    values: {
      "DAMAGE#0.multiplier": c(1.55),
      "DAMAGE#0.perHit.DEBUFF#0.chance": c(0.30, 0.40),
      "LIFESTEAL#0.healRate": c(0.30, 0.30, 0.35),
      ct: ct5(3),
    },
  },

  /* ================================================================ 3. ゴーレム */
  { id: "golem_s1", values: { "DAMAGE#0.defCoefficient": c(0.85, 0.95, 1.05) } },
  { id: "golem_s2_a", values: { "DAMAGE#0.multiplier": c(0.95, 0.95, 1.05), "DAMAGE#0.defCoefficient": c(1.20, 1.30, 1.40), ct: ct5(2) } },
  { id: "golem_s2_b", values: { "DAMAGE#0.multiplier": c(0.48, 0.52), "DAMAGE#0.defCoefficient": c(0.80, 0.85), ct: ct5(2) } },
  {
    id: "golem_s2_c",
    structure: [patch(0, { defCoefficient: 0.60 })],
    values: {
      "DAMAGE#0.multiplier": c(1.30, 1.40, 1.40, 1.50),
      "DAMAGE#0.defCoefficient": c(0.60, 0.65, 0.65, 0.75),
      "DEBUFF#0.chance": only({ 3: 0.90 }),
      ct: ct5(2),
    },
    note: "倍率・防御DOWN率の指定は差し替え後の今の値を下回る段があり、その段は今の値へ引き上げ",
  },
  {
    id: "golem_s3_b",
    structure: [patch(0, { defCoefficient: 0.75 }), patch(1, { durationTurns: 2 })],
    values: { "DAMAGE#0.multiplier": c(1.20, 1.30, 1.30, 1.40), "DAMAGE#0.defCoefficient": c(0.75, 0.80, 0.80, 0.90), ct: ct5(3) },
  },
  {
    id: "golem_s3_a",
    pending: "「自身にはDEF比例の追加シールドを持たせる方向」は量・持続の指定が無く、防御比例のシールドは戦闘エンジンにまだ無い。方向だけで新しい仕組みを作るのは勝手な追加になるため保留",
  },
  {
    id: "golem_s3_c",
    structure: [add({ kind: "GAUGE", amount: 0.30, applyTo: "SELF" })],
    values: { "GAUGE#0.amount": c(0.30, 0.35, 0.40, 0.50), ct: ct5(3) },
    // Lv5 は今の最大レベル差し替え(攻撃・防御UP 3T と自身に反射3T)を残す
    levelStructure: (level, effects, before) => level === 5
      ? [...effects, ...(before.effects as unknown as Effect[]).filter((e) => e.kind === "STATUS")]
      : effects,
  },
  {
    id: "golem_s3_light",
    structure: [add({ kind: "HEAL", healRate: 0.25 })],
    values: { "SHIELD#0.shieldRate": only({ 3: 0.45, 4: 0.45, 5: 0.45 }), "REGEN#0.healRate": c(0.08, 0.10, 0.10, 0.12), ct: ct5(4) },
    note: "「heal25 → regen10 → shield45 → regen12」を Lv1 回復25%(新規)、Lv2 継続回復10%、Lv3 シールド45%、Lv4 継続回復12% と読んだ",
  },
  { id: "golem_s3_dark", values: { "DAMAGE#0.multiplier": c(1.70, 1.70, 1.80), "DAMAGE#0.defCoefficient": c(1.60, 1.60, 1.75), "DEBUFF#0.chance": c(0.70, 0.85), ct: ct5(3) } },

  /* ================================================================ 4. フェアリー */
  { id: "fairy_s1", values: { "DAMAGE#0.multiplier": c(0.85, 0.95, 0.95, 1.05), "HEAL#0.healRate": c(0.05, 0.05, 0.07, 0.07, 0.10) } },
  { id: "fairy_s2_a", values: { "HEAL#0.healRate": c(0.25, 0.27, 0.30, 0.33), ct: ct5(3) } },
  {
    id: "fairy_s2_b",
    structure: [add({ kind: "GAUGE", amount: 0.20 })],
    values: { "HEAL#0.healRate": c(0.40, 0.45, 0.50), "GAUGE#0.amount": c(0.20, 0.25), ct: ct5(2) },
  },
  { id: "fairy_s2_c", values: { "HEAL#0.healRate": c(0.15, 0.18, 0.18, 0.20), "REGEN#0.healRate": c(0.08, 0.08, 0.10), ct: ct5(3) } },
  { id: "fairy_s3_a", structure: [add({ kind: "GAUGE", amount: 0.20 })], values: { "GAUGE#0.amount": c(0.20, 0.25, 0.30, 0.35), ct: ct5(3) } },
  {
    id: "fairy_s3_b",
    structure: [add({ kind: "SHIELD", shieldRate: 0.15, durationTurns: 2 })],
    values: { "HEAL#0.healRate": c(0.40, 0.45, 0.50), "SHIELD#0.shieldRate": c(0.15, 0.20), ct: ct5(4) },
  },
  {
    id: "fairy_s3_c",
    structure: [add({ kind: "REGEN", healRate: 0.10, durationTurns: 2 })],
    values: { "HEAL#0.healRate": c(0.25, 0.28, 0.28, 0.32), "REGEN#0.healRate": c(0.10, 0.12), ct: ct5(4) },
  },
  { id: "fairy_s3_light", values: { "HEAL#0.healRate": c(0.45, 0.45, 0.50), "REGEN#0.healRate": c(0.10, 0.12), ct: ct5(4) } },
  { id: "fairy_s3_dark", values: { "HEAL#0.healRate": c(0.35, 0.35, 0.40), "GAUGE#0.amount": c(0.35, 0.40), ct: ct5(4) } },

  /* ================================================================ 5. インプ */
  {
    id: "imp_s1",
    structure: [patch(1, { durationTurns: 2 })],
    values: { "DAMAGE#0.multiplier": c(1.00, 1.10, 1.10, 1.20), "DEBUFF#0.chance": c(0.40, 0.40, 0.55, 0.55, 0.70), "DEBUFF#0.durationTurns": c(2) },
  },
  {
    id: "imp_s2_a",
    structure: [add({ kind: "POISON", damageRatePerStack: 0.05, durationTurns: 2, chance: 0.70 })],
    values: { "DAMAGE#0.multiplier": c(1.40, 1.55, 1.55, 1.70), "DEBUFF#0.chance": c(0.70, 0.70, 0.85), ct: ct5(2) },
  },
  { id: "imp_s2_b", values: { "DAMAGE#0.multiplier": c(1.00, 1.10, 1.10, 1.20), "BLIND#0.chance": c(0.60, 0.60, 0.75), ct: ct5(2) } },
  { id: "imp_s2_c", values: { "DAMAGE#0.multiplier": c(1.20, 1.35), "GAUGE#0.amount": c(0.15, 0.15, 0.20), "DEBUFF#0.chance": c(0.70, 0.70, 0.70, 0.85), ct: ct5(2) } },
  {
    id: "imp_s3_a",
    structure: [
      add({ kind: "HEAL_BLOCK", durationTurns: 2, chance: 0.70 }),
      add({ kind: "CURSE", chance: 0.50 }),
    ],
    values: {
      "DAMAGE#0.multiplier": c(1.25, 1.35, 1.35, 1.50),
      "DEBUFF#0.chance": c(0.70, 0.70, 0.80),
      "HEAL_BLOCK#0.chance": c(0.70, 0.70, 0.80),
      ct: ct5(3),
    },
    note: "今ある行動ゲージ-15%(差し替えで付いたもの)は指定に無いが、消すと弱くなるので残した",
  },
  {
    id: "imp_s3_b",
    structure: [add(BUFF_BLOCK(0.70, 2))],
    values: {
      "DAMAGE#0.multiplier": c(1.20, 1.35),
      "COOLDOWN_EXTEND#0.chance": c(0.70, 0.70, 0.85),
      "STATUS#0.chance": c(0.70, 0.70, 0.85),
      ct: ct5(4),
    },
    note: "指定のLv5 CT4は今(差し替え後CT4、Lv5でCT3)より長くなるので、Lv5 CT3 のまま",
  },
  { id: "imp_s3_c", values: { "DAMAGE#0.multiplier": c(0.75, 0.80, 0.90), "POISON#0.chance": c(0.70, 0.80), ct: ct5(3) } },
  { id: "imp_s3_light", values: { "DAMAGE#0.multiplier": c(1.55, 1.55, 1.70), "BLIND#0.chance": c(0.60, 0.75), "DEBUFF#0.chance": c(0.70, 0.70, 0.85), ct: ct5(3) } },
  { id: "imp_s3_dark", values: {}, note: "「現行を基準に小幅調整のみ」は数値の指定が無いため、今の一律成長の端数を上方向へ整えるだけにした" },

  /* ================================================================ 6. ウィスプ */
  {
    id: "wisp_s1",
    structure: [add({ kind: "GAUGE", amount: 0, applyTo: "SELF" })],
    values: { "DAMAGE#0.multiplier": c(0.80, 0.90, 1.00), "GAUGE#0.amount": c(0, 0.10, 0.20) },
  },
  {
    id: "wisp_s2_a",
    structure: [add({ kind: "GAUGE", amount: 0 })],
    values: { "SHIELD#0.shieldRate": c(0.20, 0.22, 0.22, 0.25), "GAUGE#0.amount": c(0, 0, 0.10), ct: ct5(4) },
  },
  { id: "wisp_s2_b", values: { "GAUGE#0.amount": c(0.20, 0.22, 0.25, 0.30), ct: ct5(3) } },
  { id: "wisp_s2_c", values: { "HEAL#0.healRate": c(0.18, 0.20, 0.20, 0.22), "REGEN#0.healRate": c(0.08, 0.08, 0.10), ct: ct5(3) } },
  {
    id: "wisp_s3_a",
    structure: [add({ kind: "BUFF", stat: "criDmg", amount: CRI_DMG_UP, durationTurns: 2 }), add({ kind: "GAUGE", amount: 0.10 })],
    values: { "GAUGE#0.amount": c(0.10, 0.15, 0.20), ct: ct5(3) },
  },
  {
    id: "wisp_s3_b",
    structure: [add({ kind: "CLEANSE" }), add({ kind: "GAUGE", amount: 0 })],
    values: { "HEAL#0.healRate": c(0.30, 0.35, 0.35, 0.40), "GAUGE#0.amount": c(0, 0, 0.15), ct: ct5(5) },
  },
  {
    id: "wisp_s3_c",
    pending: "指定(ゲージ35→40→45%・自身ゲージ20%)は差し替え前の「味方全体30%」を前提にしている。今のゲーム内は「味方単体80〜100%」なので、そのまま入れると別の技への作り替えになる",
  },
  {
    id: "wisp_s3_light",
    structure: [add({ kind: "BUFF", stat: "criDmg", amount: CRI_DMG_UP, durationTurns: 3 })],
    values: { "GAUGE#0.amount": c(0.25, 0.30, 0.35, 0.40), ct: ct5(5) },
  },
  {
    id: "wisp_s3_dark",
    pending: "指定の「味方単体ゲージ100%+攻撃UP+自身ゲージ」は、今の闇S3(ヴォイドシフト: 味方全体ゲージ35%+速度UP+シールド)と別の技。「ときわたり」の今の姿(単体100%)と混同している可能性があり、完全な作り直しの明記も無いため保留",
  },

  /* ================================================================ 7. トレント */
  { id: "treant_s1", values: { "DAMAGE#0.hpCoefficient": c(0.075, 0.08, 0.085, 0.095, 0.105) } },
  { id: "treant_s2_a", values: { "DAMAGE#0.hpCoefficient": c(0.075, 0.085, 0.085, 0.10), "STUN#0.chance": c(0.50, 0.50, 0.60), ct: ct5(3) } },
  {
    id: "treant_s2_b",
    structure: [add({ kind: "CLEANSE" }), add({ kind: "GAUGE", amount: 0, applyTo: "SELF" })],
    values: { "SHIELD#0.shieldRate": c(0.25, 0.30, 0.30, 0.35), "GAUGE#0.amount": c(0, 0, 0.20), ct: ct5(3) },
  },
  {
    id: "treant_s2_c",
    values: { "DAMAGE#0.hpCoefficient": c(0.10, 0.11, 0.11, 0.13), "LIFESTEAL#0.healRate": c(0.50, 0.50, 0.60), ct: ct5(2) },
    note: "今のLv5(最大レベル差し替え: 攻撃力1.5倍・HP12%)より弱くならないよう、Lv5 の倍率は今の1.5倍を残した",
  },
  {
    id: "treant_s3_a",
    structure: [add({ kind: "SHIELD", shieldRate: 0.15, durationTurns: 3 })],
    values: { "HEAL#0.healRate": c(0.20, 0.23), "REGEN#0.healRate": c(0.10, 0.10, 0.12), "SHIELD#0.shieldRate": c(0.15, 0.15, 0.15, 0.20), ct: ct5(4) },
  },
  { id: "treant_s3_b", values: { "DAMAGE#0.hpCoefficient": c(0.11, 0.12, 0.12, 0.14), "DEBUFF#0.chance": c(0.70, 0.70, 0.85), ct: ct5(3) } },
  {
    id: "treant_s3_c",
    structure: [add({ kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2 })],
    values: { "SHIELD#0.shieldRate": c(0.25, 0.28, 0.30, 0.35), ct: ct5(4) },
  },
  { id: "treant_s3_light", values: { "HEAL#0.healRate": c(0.25, 0.28, 0.28, 0.32), "REGEN#0.healRate": c(0.10, 0.10, 0.12), ct: ct5(4) } },
  {
    id: "treant_s3_dark",
    values: {
      "DAMAGE#0.hpCoefficient": c(0.13, 0.15, 0.15, 0.18),
      "LIFESTEAL#0.healRate": c(0.40, 0.40, 0.50),
      "DEBUFF#0.chance": c(0.60, 0.60, 0.75),
      "HEAL#0.healRate": c(0.15, 0.15, 0.15, 0.20),
      ct: ct5(3),
    },
  },

  /* ================================================================ 8. グレイヴナイト */
  { id: "knight_s1", values: { "DAMAGE#0.multiplier": c(1.00, 1.00, 1.10, 1.20), "DAMAGE#0.defCoefficient": c(0.90, 1.00, 1.10, 1.20) } },
  { id: "knight_s2_a", values: { "DAMAGE#0.multiplier": c(1.60, 1.75, 1.75, 1.90), "DEBUFF#0.chance": c(0.70, 0.70, 0.85), ct: ct5(2) } },
  {
    id: "knight_s2_b",
    structure: [add({ kind: "SHIELD", shieldRate: 0.10, durationTurns: 2 })],
    values: { "SHIELD#0.shieldRate": c(0.10, 0.12, 0.15, 0.18), ct: ct5(3) },
  },
  {
    id: "knight_s2_c",
    structure: [patch(0, { perHitEffects: [{ kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.25 }] })],
    values: { "DAMAGE#0.multiplier": c(0.75, 0.80, 0.80, 0.90), "DAMAGE#0.perHit.DEBUFF#0.chance": c(0.25, 0.25, 0.35), ct: ct5(2) },
  },
  {
    id: "knight_s3_a",
    structure: [add({ kind: "GAUGE", amount: 0.15, applyTo: "ALLIES" })],
    values: { "DAMAGE#0.multiplier": c(2.00, 2.20, 2.40), "GAUGE#0.amount": c(0.15, 0.20, 0.25), ct: ct5(3) },
  },
  {
    id: "knight_s3_b",
    structure: [add({ kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.70 })],
    values: { "DAMAGE#0.multiplier": c(1.50, 1.65, 1.65, 1.80), "STUN#0.chance": c(0.60, 0.60, 0.70), "DEBUFF#0.chance": c(0.70, 0.70, 0.70, 0.85), ct: ct5(4) },
  },
  { id: "knight_s3_c", values: { "SHIELD#0.shieldRate": c(0.20, 0.23, 0.25, 0.30), ct: ct5(4) } },
  {
    id: "knight_s3_light",
    structure: [
      add({ kind: "GAUGE", amount: 0.15 }),
      add({ kind: "BLIND", durationTurns: 2, chance: 0.85, applyTo: "ENEMIES" }),
    ],
    values: { "SHIELD#0.shieldRate": c(0.20, 0.23, 0.25), "GAUGE#0.amount": c(0.15, 0.15, 0.15, 0.20), ct: ct5(4) },
  },
  { id: "knight_s3_dark", values: { "DAMAGE#0.multiplier": c(2.10, 2.30, 2.30, 2.50), "STUN#0.chance": c(0.70, 0.70, 0.80), "LIFESTEAL#0.healRate": c(0.35, 0.35, 0.35, 0.50), ct: ct5(4) } },

  /* ================================================================ 9. グリフォン */
  { id: "griffon_s1", values: { "DAMAGE#0.multiplier": c(1.20, 1.30, 1.40), "STUN#0.chance": c(0.20, 0.30, 0.40) } },
  { id: "griffon_s2_a", values: { "DAMAGE#0.multiplier": c(1.30, 1.40, 1.50), "STUN#0.chance": c(0.30, 0.40), ct: ct5(2) } },
  { id: "griffon_s2_b", values: { "DAMAGE#0.multiplier": c(0.95, 1.00, 1.10), "DAMAGE#0.scaleBonus.bonusAtReference": c(0.45, 0.55, 0.65), ct: ct5(2) } },
  {
    id: "griffon_s2_c",
    structure: [add({ kind: "GAUGE", amount: -0.20 })],
    values: { "DAMAGE#0.multiplier": c(1.80, 2.00, 2.20), "DEBUFF#0.chance": c(0.80, 0.90), "GAUGE#0.amount": c(-0.20, -0.20, -0.30), ct: ct5(2) },
  },
  {
    id: "griffon_s3_a",
    structure: [patch(0, { scaleBonus: { stat: "spd", bonusAtReference: 0.60 } })],
    values: { "DAMAGE#0.multiplier": c(3.20, 3.40, 3.70), "DAMAGE#0.scaleBonus.bonusAtReference": c(0.60, 0.75, 0.90), "STUN#0.chance": c(0.70, 0.80), ct: ct5(4) },
  },
  {
    id: "griffon_s3_b",
    structure: [patch(0, { scaleBonus: { stat: "spd", bonusAtReference: 0.40 } }), add({ kind: "GAUGE", amount: 0.30, applyTo: "SELF" })],
    values: { "DAMAGE#0.multiplier": c(2.40, 2.55, 2.70), "DAMAGE#0.scaleBonus.bonusAtReference": c(0.40, 0.40, 0.55), "GAUGE#0.amount": c(0.30, 0.40), ct: ct5(4) },
  },
  { id: "griffon_s3_c", values: { "GAUGE#0.amount": c(0.20, 0.25, 0.30, 0.35), ct: ct5(4) } },
  {
    id: "griffon_s3_light",
    structure: [patch(0, { scaleBonus: { stat: "spd", bonusAtReference: 0.40 } })],
    values: { "DAMAGE#0.multiplier": c(2.50, 2.65, 2.80), "DAMAGE#0.scaleBonus.bonusAtReference": c(0.40, 0.40, 0.55), "STUN#0.chance": c(0.60, 0.70), ct: ct5(4) },
  },
  { id: "griffon_s3_dark", values: { "DAMAGE#0.multiplier": c(1.90, 1.95, 2.00), "DAMAGE#0.scaleBonus.bonusAtReference": c(0.50, 0.50, 0.60), "DEBUFF#0.chance": c(0.70, 0.85), ct: ct5(4) } },

  /* ================================================================ 10. ドラゴン */
  { id: "dragon_s1", values: { "DAMAGE#0.multiplier": c(1.30, 1.40, 1.50), "DEBUFF#0.chance": c(0.35, 0.45, 0.55) } },
  ...["dragon_s2_flame", "dragon_s2_d_flame"].map((id): SkillSpec => ({
    id,
    structure: [add({ kind: "BURN", durationTurns: 1, chance: 0.50 })],
    values: { "DAMAGE#0.multiplier": c(0.70, 0.75, 0.80), "BURN#0.chance": c(0.50, 0.65), ct: ct5(2) },
  })),
  ...["dragon_s2_claw", "dragon_s2_w_claw"].map((id): SkillSpec => ({
    id, values: { "DAMAGE#0.multiplier": c(2.50, 2.70, 2.70, 3.00), "DEBUFF#0.chance": c(0.65, 0.65, 0.80), ct: ct5(2) },
  })),
  ...["dragon_s2_spirit", "dragon_s2_l_spirit"].map((id): SkillSpec => ({
    id,
    structure: [
      add({ kind: "GAUGE", amount: 0.15 }),
      add({ kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.70, applyTo: "ENEMIES" }),
    ],
    values: { "GAUGE#0.amount": c(0.15, 0.20, 0.25, 0.30), "DEBUFF#0.chance": c(0.70, 0.80, 0.90), ct: ct5(3) },
  })),
  ...["dragon_s3_roar", "dragon_s3_roar_e"].map((id): SkillSpec => ({
    id, values: { "DAMAGE#0.hpCoefficient": c(0.14, 0.16, 0.16, 0.18), "DAMAGE#0.multiplier": c(2.0, 2.0, 2.2), ct: ct5(4) },
  })),
  {
    id: "dragon_s3_scale",
    structure: [add({ kind: "GAUGE", amount: 0.30, applyTo: "SELF" })],
    values: { "DAMAGE#0.multiplier": c(4.0, 4.3, 4.6), "GAUGE#0.amount": c(0.30, 0.40), ct: ct5(4) },
  },
  {
    id: "dragon_s3_blessing",
    structure: [replace(2, { kind: "HEAL", healRate: 0.20 }), add({ kind: "GAUGE", amount: 0.15 })],
    values: { "HEAL#0.healRate": c(0.20, 0.25, 0.30), "GAUGE#0.amount": c(0.15, 0.20, 0.25), ct: ct5(4) },
    allowWeaker: {
      "HEAL#0.scaleStat": "指定「heal maxHP20→25→30」で、防御力比例の回復を最大HP比例へ置き換える",
      "HEAL#0.healRate": "同上(基準の能力値が変わるので、数字どうしは比べられない)",
    },
  },
  { id: "dragon_s3_shining", values: { "DAMAGE#0.hpCoefficient": c(0.10, 0.10, 0.11, 0.11, 0.12) }, note: "「HP係数のみ控えめ成長」は数値の指定が無いため 10%→11%(Lv3)→12%(Lv5)とした。他は今の成長を引き継ぐ" },
  { id: "dragon_s3_meteor", keep: true },

  /* ================================================================ 11. セラフ */
  { id: "seraph_s1", values: { "DAMAGE#0.multiplier": c(1.30, 1.40, 1.50, 1.60, 1.70), "LIFESTEAL#0.healRate": c(0.15, 0.15, 0.20, 0.20, 0.25) } },
  { id: "seraph_s2_a", values: { "DAMAGE#0.multiplier": c(1.40, 1.50, 1.60, 1.70), "BLIND#0.chance": c(0.70, 0.70, 0.80), ct: ct5(2) } },
  {
    id: "seraph_s2_b",
    structure: [add({ kind: "GAUGE", amount: 0.20 })],
    values: {
      "HEAL#0.healRate": c(3.0, 3.3, 3.6, 4.0),
      "GAUGE#0.amount": c(0.20, 0.20, 0.25, 0.30),
      "BUFF#0.durationTurns": c(2, 2, 2, 2, 3),
      ct: ct5(2),
    },
  },
  {
    id: "seraph_s2_c",
    structure: [add({ kind: "GAUGE", amount: -0.20 }), add(BUFF_BLOCK(0.80, 2))],
    values: {
      "DAMAGE#0.multiplier": c(2.0, 2.2, 2.4, 2.6),
      "COOLDOWN_EXTEND#0.chance": c(0.80, 0.80, 0.90),
      "GAUGE#0.amount": c(-0.20, -0.20, -0.25, -0.30),
      "STATUS#0.chance": c(0.80, 0.80, 0.90),
      ct: ct5(3),
    },
  },
  {
    id: "seraph_s3_a",
    structure: [patch(1, { durationTurns: 2 })],
    values: { "DAMAGE#0.multiplier": c(1.8, 2.0, 2.2, 2.4), "DEBUFF#0.chance": c(0.80, 0.80, 0.90), "DEBUFF#0.durationTurns": c(2, 2, 2, 2, 3), ct: ct5(4) },
  },
  {
    id: "seraph_s3_b",
    structure: [replace(0, { kind: "HEAL", scaleStat: "atk", healRate: 1.8 }), add({ kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2 })],
    values: {
      "HEAL#0.healRate": c(1.8, 2.0, 2.2, 2.4),
      "IMMUNITY#0.durationTurns": c(2, 2, 2, 2, 3),
      "BUFF#0.durationTurns": c(2, 2, 2, 2, 3),
      ct: ct5(5),
    },
    allowWeaker: {
      "HEAL#0.scaleStat": "指定「DEF比例回復だったものはATK比例へ変更」",
      "HEAL#0.healRate": "同上(基準の能力値が変わるので、数字どうしは比べられない)",
    },
  },
  { id: "seraph_s3_c", values: { "GAUGE#0.amount": c(0.25, 0.30, 0.30, 0.35), ct: ct5(4) } },
  {
    id: "seraph_s3_light",
    structure: [replace(0, { kind: "HEAL", scaleStat: "atk", healRate: 2.0 })],
    values: { "HEAL#0.healRate": c(2.0, 2.2, 2.4, 2.6), "IMMUNITY#0.durationTurns": c(3, 3, 3, 3, 4), "REGEN#0.durationTurns": c(4, 4, 4, 4, 5), ct: ct5(5) },
    allowWeaker: {
      "HEAL#0.scaleStat": "指定「DEF比例回復だったものはATK比例へ変更」",
      "HEAL#0.healRate": "同上(基準の能力値が変わるので、数字どうしは比べられない)",
    },
  },
  {
    id: "seraph_s3_dark",
    values: {
      "DAMAGE#0.multiplier": c(2.3, 2.4, 2.5, 2.7),
      "BLIND#0.chance": c(0.85, 0.90, 0.95, 1.0),
      "BLIND#0.durationTurns": c(2, 2, 2, 3),
      "LIFESTEAL#0.healRate": c(0.35, 0.35, 0.40, 0.45),
      ct: ct5(4),
    },
  },

  /* ================================================================ 12. ネメシス */
  { id: "nemesis_s1", values: { "DAMAGE#0.multiplier": c(1.50, 1.60, 1.70, 1.80, 2.00) } },
  { id: "nemesis_s2_a", values: { "DAMAGE#0.multiplier": c(1.80, 1.90, 2.00, 2.20), ct: ct5(2) } },
  { id: "nemesis_s2_b", values: { "DAMAGE#0.multiplier": c(3.0, 3.2, 3.4, 3.6), "DEBUFF#0.chance": c(0.80, 0.80, 0.90), "DEBUFF#0.durationTurns": c(2, 2, 2, 2, 3), ct: ct5(2) } },
  { id: "nemesis_s2_c", values: { "DAMAGE#0.multiplier": c(1.30, 1.40, 1.50, 1.60), "DAMAGE#0.defCoefficient": c(0.90, 1.00, 1.10, 1.20), ct: ct5(2) } },
  {
    id: "nemesis_s3_a",
    values: { "DAMAGE#0.multiplier": c(4.2, 4.5, 4.8, 5.2), "DAMAGE#0.defCoefficient": c(1.3, 1.4, 1.5, 1.7), "STUN#0.chance": c(0.75, 0.80, 0.85, 0.90), ct: ct5(4) },
  },
  { id: "nemesis_s3_b", values: { "DAMAGE#0.multiplier": c(1.30, 1.40, 1.50, 1.60), "GAUGE#0.amount": c(0.15, 0.15, 0.20, 0.25), ct: ct5(4) } },
  {
    id: "nemesis_s3_c",
    structure: [add({ kind: "BUFF", stat: "criDmg", amount: CRI_DMG_UP, durationTurns: 2 })],
    values: { "GAUGE#0.amount": c(0.30, 0.35, 0.40, 0.45), "BUFF#0.durationTurns": c(2, 2, 2, 2, 3), "BUFF#1.durationTurns": c(2, 2, 2, 2, 3), ct: ct5(3) },
  },
  { id: "nemesis_s3_light", values: {}, note: "「実質強化しない。端数を上方向に丸めるだけ」" },
  { id: "nemesis_s3_dark", values: {}, note: "「実質強化しない。端数を上方向に丸めるだけ」" },

  /* ================================================================ 13. スコーピオン */
  {
    id: "scorpion_s3_c",
    values: {
      "DAMAGE#0.multiplier": c(2.60, 2.80, 3.00, 3.30),
      "DAMAGE#0.debuffIgnoreDefense.ratio": c(1.0),
      ct: ct5(3),
    },
  },

  /* ================================================================ 14. ハーピー */
  { id: "harpy_s3_c", values: { "DAMAGE#0.multiplier": c(2.10, 2.35, 2.35, 2.55) }, note: "実質強化なし。端数(2.31/2.52)を 0.05 刻みへ上げるだけ" },
  { id: "harpy_s3_light", values: { "DAMAGE#0.multiplier": c(1.35, 1.50, 1.50, 1.65) }, note: "実質強化なし。端数整理のみ" },
  { id: "harpy_s3_dark", values: { "DAMAGE#0.multiplier": c(2.20, 2.45, 2.55, 2.75) }, note: "実質強化なし。端数整理のみ" },
  { id: "harpy_s1", values: { "DAMAGE#0.multiplier": c(0.70, 0.80, 0.80, 0.85) }, note: "「既存案と比べてナーフにならない小幅アッパーのみ」: 既存案の数値が手元に無いため、端数(0.77/0.84)を 0.05 刻みへ上げるだけにした" },
  { id: "harpy_s2_a", values: { "DAMAGE#0.multiplier": c(2.40, 2.65, 2.80, 3.00) }, note: "同上(端数整理のみ)" },
  { id: "harpy_s2_c", values: { "DAMAGE#0.multiplier": c(0.70, 0.80, 0.80, 0.85) }, note: "同上(端数整理のみ)" },
  { id: "harpy_s3_a", values: { "DAMAGE#0.multiplier": c(1.15, 1.30, 1.30, 1.40) }, note: "同上(端数整理のみ)" },

  /* ================================================================ 15. フェニックス */
  { id: "phoenix_s1", values: { "DAMAGE#0.multiplier": c(0.70, 0.75, 0.80, 0.85, 0.90), "DAMAGE#0.hpCoefficient": c(0.075, 0.08, 0.085, 0.09, 0.095) } },
  {
    id: "phoenix_s3_c",
    values: {
      "DAMAGE#0.multiplier": c(1.20, 1.35, 1.35, 1.45),
      "DAMAGE#0.hpCoefficient": c(0.18, 0.20, 0.20, 0.22),
      "SHIELD#0.shieldRate": c(0.15, 0.15, 0.18),
    },
  },
  { id: "phoenix_s3_a", keep: true },
  { id: "phoenix_s3_b", keep: true },
  { id: "phoenix_s3_electric", keep: true },
  { id: "phoenix_s3_light", values: { "REGEN#0.healRate": c(0.15, 0.18, 0.20) }, note: "17.5% の端数だけを 18% へ" },
  { id: "phoenix_s3_dark", values: { "passive.heal": c(0.08, 0.10, 0.10, 0.10, 0.10) }, note: "「必要ならLv2/Lv3 heal10程度の小幅整理」: Lv2・Lv3 の回復を 9%→10% にした" },

  /* ================================================================ 16. ジョーカー */
  {
    id: "joker_s1",
    values: {
      "DAMAGE#0.multiplier": c(1.1, 1.2, 1.3, 1.4, 1.5),
      "STATUS#0.chance": c(0.50, 0.50, 0.60, 0.60, 0.70),
      "CURSE#0.chance": c(0.30, 0.30, 0.30, 0.40),
    },
  },
  {
    id: "joker_s2_a",
    values: {
      "DAMAGE#0.multiplier": c(1.5, 1.6, 1.7, 1.8),
      "DEBUFF#0.chance": c(0.70, 0.70, 0.80, 0.90),
      "DEBUFF#1.chance": c(0.70, 0.70, 0.80, 0.90),
      "HEAL_BLOCK#0.chance": c(0.70, 0.70, 0.80, 0.90),
      ct: ct5(2),
    },
  },
  { id: "joker_s2_b", values: { "DAMAGE#0.multiplier": c(1.2, 1.3, 1.4, 1.5), ct: ct5(3) } },
  {
    id: "joker_s2_c",
    values: {
      "CURSE#0.chance": c(0.70, 0.80, 0.80, 0.90),
      "BLIND#0.chance": c(0.70, 0.70, 0.80, 0.80, 0.90),
      "GAUGE#0.chance": c(0.60, 0.60, 0.70, 0.70, 0.80),
      ct: ct5(3),
    },
  },
  { id: "joker_s3_a", values: { "passive.damage": c(0.8, 0.9, 0.9, 1.0), "passive.chance": c(0.50, 0.50, 0.55, 0.55, 0.60) } },
  { id: "joker_s3_b", keep: true },
  {
    id: "joker_s3_c",
    values: {
      "DAMAGE#0.multiplier": c(0.75, 0.80, 0.85, 0.90),
      "DAMAGE#0.perHit.HEAL_BLOCK#0.chance": c(0.25, 0.25, 0.30, 0.35),
      "DAMAGE#0.perHit.STATUS#0.chance": c(0.25, 0.25, 0.30, 0.35),
      "DAMAGE#0.perHit.POISON#0.chance": c(0.25, 0.25, 0.30, 0.35),
      ct: ct5(4),
    },
  },
  { id: "joker_s3_light", keep: true },
  { id: "joker_s3_dark", values: { "DAMAGE#0.multiplier": c(1.7, 1.9, 1.9, 2.1), ct: ct5(5) } },

  /* ================================================================ 17. マッシュルン */
  { id: "mushroon_s1", values: { "DAMAGE#0.multiplier": c(1.0, 1.1, 1.1, 1.2), "POISON#0.chance": c(0.60, 0.60, 0.70, 0.70, 0.80) } },
  {
    id: "mushroon_s2_a",
    values: { "DAMAGE#0.multiplier": c(0.9, 1.0, 1.0, 1.1), "POISON#0.chance": c(0.70, 0.70, 0.80, 0.90), "POISON#0.durationTurns": c(2, 2, 2, 2, 3), ct: ct5(3) },
  },
  {
    id: "mushroon_s2_b",
    values: {
      "DAMAGE#0.multiplier": c(1.4, 1.5, 1.5, 1.6),
      "DEBUFF#0.chance": c(0.80, 0.80, 0.90, 0.90, 1.0),
      "HEAL_BLOCK#0.chance": c(0.80, 0.80, 0.90, 0.90, 1.0),
      "DEBUFF#0.durationTurns": c(2, 2, 2, 2, 3),
      "HEAL_BLOCK#0.durationTurns": c(2, 2, 2, 2, 3),
      ct: ct5(3),
    },
  },
  {
    id: "mushroon_s2_c",
    values: {
      "DAMAGE#0.multiplier": c(1.3, 1.4, 1.4, 1.5),
      "DEBUFF#0.chance": c(0.80, 0.90, 0.90, 1.0),
      "GAUGE#0.amount": c(-0.35, -0.35, -0.40, -0.40, -0.45),
      "DEBUFF#0.durationTurns": c(2, 2, 2, 2, 3),
      ct: ct5(3),
    },
  },
  {
    id: "mushroon_s3_a",
    values: { "DAMAGE#0.multiplier": c(1.0, 1.1, 1.1, 1.2), "POISON#0.chance": c(0.80, 0.80, 0.90, 0.90, 1.0), "POISON#0.durationTurns": c(3, 3, 3, 3, 4), ct: ct5(4) },
  },
  {
    id: "mushroon_s3_b",
    values: {
      "DAMAGE#0.multiplier": c(1.2, 1.3, 1.3, 1.4),
      "DEBUFF#0.chance": c(0.80, 0.80, 0.90, 0.90, 1.0),
      "DEBUFF#0.durationTurns": c(2, 2, 2, 2, 3),
      "GAUGE#0.amount": c(-0.25, -0.25, -0.30, -0.30, -0.35),
      ct: ct5(4),
    },
  },
  { id: "mushroon_s3_c", values: { "passive.gauge": c(0.07, 0.08, 0.09, 0.10, 0.12) } },
  {
    id: "mushroon_s3_light",
    values: { "HEAL#0.healRate": c(0.20, 0.22, 0.23, 0.24), "DEBUFF#0.chance": c(0.80, 0.85, 0.90, 0.95), "DEBUFF#0.durationTurns": c(2, 2, 2, 2, 3), ct: ct5(4) },
  },
  {
    id: "mushroon_s3_dark",
    values: {
      "DAMAGE#0.multiplier": c(1.20, 1.30, 1.30, 1.40),
      "DAMAGE#0.debuffDamageBonus.perDebuff": c(0.06, 0.07, 0.07, 0.08),
      "DAMAGE#0.debuffDamageBonus.maxBonus": c(0.30, 0.35, 0.35, 0.40),
      "POISON#0.chance": c(0.80, 0.85, 0.90, 0.95),
      ct: ct5(4),
    },
    // Lv5 は今の最大レベル差し替え(全体0.5倍の3回攻撃・毒3ターン)の形を残す。
    // 指定の「Lv5 1.40/100/3T」を1回攻撃で入れると、今の Lv5(合計1.5倍・毒3回判定)より弱くなる
    levelStructure: (level, effects, before) => {
      if (level !== 5) return effects;
      return (JSON.parse(JSON.stringify(before.effects)) as Effect[]).map((e) => e.kind === "DAMAGE"
        ? { ...e, debuffDamageBonus: { perDebuff: 0.08, maxBonus: 0.40 } }
        : e);
    },
    note: "Lv5 は今の最大レベル差し替え(0.5倍×3回・各攻撃後に毒)を残し、弱体ボーナスだけ Lv4 と同じ +8%/最大40% へ上げた",
  },

  /* ================================================================ 18. シェルタートル */
  {
    id: "shellturtle_s1",
    values: {
      "DAMAGE#0.multiplier": c(0.60, 0.65, 0.70, 0.75, 0.80),
      "DAMAGE#0.defCoefficient": c(0.85, 0.90, 1.00, 1.10, 1.20),
      "DEBUFF#0.chance": c(0.60, 0.60, 0.70, 0.70, 0.80),
    },
  },
  {
    id: "shellturtle_s2_a",
    structure: [add({ kind: "GAUGE", amount: 0, applyTo: "SELF" })],
    values: { "PROTECT#0.share": c(0.50, 0.55, 0.60), "GAUGE#0.amount": c(0, 0, 0, 0.20), ct: ct5(3) },
  },
  {
    id: "shellturtle_s2_b",
    values: {
      "DAMAGE#0.multiplier": c(1.0, 1.1, 1.1, 1.2),
      "DAMAGE#0.defCoefficient": c(1.25, 1.35, 1.45, 1.60),
      "STATUS#0.chance": c(0.80, 0.90, 0.90, 1.0),
      "GAUGE#0.amount": c(-0.25, -0.25, -0.30, -0.35),
      "STATUS#0.durationTurns": c(2, 2, 2, 2, 3),
      ct: ct5(3),
    },
  },
  {
    id: "shellturtle_s2_c",
    values: {
      "HEAL#0.healRate": c(0.30, 0.35, 0.35, 0.40),
      "REGEN#0.healRate": c(0.10, 0.10, 0.12, 0.12, 0.15),
      "CLEANSE#0.count": c(1, 1, 2),
      "REGEN#0.durationTurns": c(2, 2, 2, 2, 3),
      ct: ct5(4),
    },
  },
  {
    id: "shellturtle_s3_a",
    structure: [add({ kind: "GAUGE", amount: 0 })],
    values: { "MITIGATE#0.amount": c(0.20, 0.22, 0.25), "GAUGE#0.amount": c(0, 0, 0, 0.10), "MITIGATE#0.durationTurns": c(2, 2, 2, 2, 3), ct: ct5(4) },
    note: "指定の「shield20→22→25」は、この技の守り(被ダメージ軽減)の量として読んだ。光の同名系統の指定(20→22→23→25)と同じ扱い",
  },
  {
    id: "shellturtle_s3_b",
    values: {
      "DAMAGE#0.multiplier": c(1.1, 1.2, 1.2, 1.3),
      "DAMAGE#0.defCoefficient": c(1.3, 1.4, 1.5, 1.7),
      "DEBUFF#0.chance": c(0.80, 0.80, 0.90, 0.90, 1.0),
      "DEBUFF#0.durationTurns": c(2, 2, 2, 2, 3),
      ct: ct5(4),
    },
  },
  { id: "shellturtle_s3_c", values: { "passive.defUp": c(0.20, 0.25, 0.30, 0.35, 0.40), "passive.damageTaken": c(0.10, 0.10, 0.15, 0.15, 0.20) } },
  { id: "shellturtle_s3_light", values: { "MITIGATE#0.amount": c(0.20, 0.22, 0.23, 0.25), "MITIGATE#0.durationTurns": c(2, 2, 2, 2, 3), ct: ct5(4) } },
  {
    id: "shellturtle_s3_dark",
    values: {
      "DAMAGE#0.multiplier": c(1.7, 1.8, 1.9, 2.0),
      "DAMAGE#0.defCoefficient": c(1.6, 1.7, 1.8, 2.0),
      "DEBUFF#0.chance": c(0.80, 0.90, 0.90, 1.0),
      "DEBUFF#0.durationTurns": c(2, 2, 2, 2, 3),
      "STATUS#0.durationTurns": c(2, 2, 2, 2, 3),
      ct: ct5(4),
    },
  },

  /* ================================================================ 19. コボルト */
  { id: "kobold_s1", values: { "DAMAGE#0.multiplier": c(1.1, 1.2, 1.3, 1.4, 1.5), "DAMAGE#0.targetHpBonus.0.bonus": c(0.25, 0.25, 0.30, 0.30, 0.35) } },
  {
    id: "kobold_s2_a",
    structure: [patch(0, { targetHpIgnoreDefense: [{ hpRatio: 0.5, ratio: 1 }] })],
    values: { "DAMAGE#0.multiplier": c(2.0, 2.1, 2.2, 2.4), "DAMAGE#0.ignoreDefenseRatio": c(0.25, 0.30, 0.40, 0.50), ct: ct5(3) },
  },
  {
    id: "kobold_s2_b",
    values: {
      "DAMAGE#0.multiplier": c(1.5, 1.6, 1.7, 1.8),
      "DAMAGE#0.targetHpBonus.0.bonus": c(0.40, 0.40, 0.50, 0.50, 0.60),
      "GAUGE#0.amount": c(0.25, 0.25, 0.30, 0.35, 0.40),
      ct: ct5(2),
    },
    note: "倍率とゲージの指定は差し替え後の今(1.75倍・ゲージ吸収30%)を下回る段があり、その段は今の値へ引き上げ",
  },
  {
    id: "kobold_s2_c",
    values: {
      "DAMAGE#0.multiplier": c(1.4, 1.5, 1.6, 1.7),
      "DEBUFF#0.chance": c(0.80, 0.90, 0.90, 1.0),
      "GAUGE#0.amount": c(-0.40, -0.40, -0.45, -0.50),
      "DEBUFF#0.durationTurns": c(2, 2, 2, 2, 3),
      ct: ct5(3),
    },
  },
  {
    id: "kobold_s3_a",
    structure: [patch(0, { targetHpBonus: [{ hpRatio: 0.3, bonus: 0.5 }] })],
    values: { "DAMAGE#0.multiplier": c(3.0, 3.4, 3.8, 4.2, 4.5), "DAMAGE#0.targetHpBonus.0.bonus": c(0.50, 0.50, 0.60, 0.60, 0.70), ct: ct5(4) },
    note: "「+50/+60/+70」は対象HP30%以下の最終ダメージ上昇として足した。今ある「HP30%以下で防御100%無視」(差し替えで付いたもの)は、消すと弱くなるので残した",
  },
  {
    id: "kobold_s3_b",
    values: {
      "DAMAGE#0.multiplier": c(2.4, 2.7, 3.0, 3.4, 3.8),
      "GAUGE#0.amount": c(0.60, 0.60, 0.70, 0.70, 0.80),
      "COOLDOWN_REDUCE#0.turns": c(1, 1, 1, 2),
      ct: ct5(4),
    },
  },
  { id: "kobold_s3_c", values: { "passive.damageUp": c(0.20, 0.30, 0.45, 0.60, 0.75) } },
  {
    id: "kobold_s3_light",
    structure: [add({ kind: "COOLDOWN_REDUCE", turns: 1, applyTo: "ALLIES" })],
    values: { "GAUGE#0.amount": c(0.25, 0.30, 0.30, 0.35), "GAUGE#1.amount": c(0.20, 0.20, 0.25, 0.25, 0.30), "BUFF#0.durationTurns": c(2, 2, 2, 2, 3), ct: ct5(4) },
  },
  {
    id: "kobold_s3_dark",
    values: {
      "DAMAGE#0.multiplier": c(2.6, 2.9, 3.3, 3.7, 4.0),
      "DAMAGE#0.targetHpIgnoreDefense.0.ratio": c(0.50, 0.60, 0.60, 0.70),
      "DAMAGE#0.targetHpBonus.0.bonus": c(0.30, 0.30, 0.40, 0.40, 0.50),
      ct: ct5(4),
    },
  },

  /* ================================================================ 20. バジリスク */
  {
    id: "basilisk_s3_light",
    structure: [patch(0, { count: 3 }), add({ kind: "HEAL_BLOCK", durationTurns: 2, chance: 1.0, fixedDuration: true })],
    values: {
      "GAUGE#0.amount": c(-0.30, -0.40, -0.50, -0.60),
      "DEBUFF#0.chance": c(0.80, 0.85, 0.90, 1.0),
      "DEBUFF#0.durationTurns": c(2, 2, 2, 2, 3),
      ct: ct5(4),
    },
  },
  {
    id: "basilisk_s3_dark",
    target: "ALL_ENEMIES",
    structure: [rebuild([{
      kind: "DAMAGE", multiplier: 0.60, hits: 3,
      perHitEffects: [{ kind: "GAUGE", amount: -0.30, chance: 0.50 }, { kind: "STUN", durationTurns: 1, chance: 0.25 }],
    }])],
    values: {
      "DAMAGE#0.multiplier": c(0.60, 0.70, 0.70, 0.80),
      "DAMAGE#0.perHit.GAUGE#0.amount": c(-0.30),
      "DAMAGE#0.perHit.GAUGE#0.chance": c(0.50, 0.50, 0.60, 0.60, 0.70),
      "DAMAGE#0.perHit.STUN#0.chance": c(0.25, 0.25, 0.30, 0.35, 0.40),
      ct: c(5, 5, 5, 5, 4),
    },
    allowWeaker: {
      "*": "指定「完全再設計」。単体2.0倍+ゲージ-70%を、全体0.6倍×3回(1撃ごとにゲージとスタンを判定)へ作り直す",
    },
    note: "会話の最終仕様どおり、1Hitあたりのゲージ減少量は30%固定。発動率をLv1-2 50% / Lv3-4 60% / Lv5 70%へ成長させる",
  },

  /* ================================================================ 21. ミミック */
  {
    id: "mimic_s2_a",
    values: {
      "DAMAGE#0.multiplier": c(1.10, 1.20, 1.30, 1.40),
      "DAMAGE#0.hpCoefficient": c(0.10, 0.11, 0.12, 0.14, 0.15),
      "LIFESTEAL#0.healRate": c(0.40, 0.45, 0.45, 0.50),
      ct: ct5(3),
    },
    note: "倍率の指定1.10〜1.40は差し替え後の今の1.80を下回るので、今の値へ引き上げ",
  },
  {
    id: "mimic_s2_c",
    values: { "MITIGATE#0.amount": c(0.20, 0.25, 0.25, 0.30), "GAUGE_ON_HIT#0.amount": c(0.10, 0.10, 0.15, 0.15, 0.20), ct: ct5(4) },
  },
  {
    id: "mimic_s3_b",
    values: {
      "DAMAGE#0.multiplier": c(1.6, 1.9, 2.2, 2.6, 3.0),
      "DAMAGE#0.hpCoefficient": c(0.13, 0.16, 0.19, 0.22, 0.25),
      "DAMAGE#0.missingHpBonus.maxBonus": c(0.50, 0.50, 0.60, 0.60, 0.70),
      ct: ct5(4),
    },
  },
  {
    id: "mimic_s3_c",
    values: {
      "passive.heal": c(0.05, 0.06, 0.07, 0.08, 0.10),
      "passive.chance": c(0.70, 0.75, 0.80, 0.90, 1.0),
      "passive.counterHpRatio": c(0.05, 0.06, 0.07, 0.08, 0.10),
    },
    note: "「ATKdown70」は攻撃DOWNの発動率、「HPcounter」は被弾時に攻撃者へ自身の最大HPの割合で返す反撃として足した。敵1行動につき1回の決まりは維持",
  },
  {
    id: "mimic_s3_light",
    structure: [add({ kind: "HEAL_BLOCK", durationTurns: 2, chance: 0.60, applyTo: "ENEMIES" })],
    values: { "HEAL_BLOCK#0.chance": c(0.60, 0.70, 0.80, 0.90, 1.0), ct: ct5(4) },
  },
  {
    id: "mimic_s3_dark",
    structure: [
      patch(0, { missingHpBonus: { perLostRatio: 0.30, maxBonus: 0.30 } }),
      replace(1, { kind: "GAUGE", amount: 0.30, drain: true }),
    ],
    values: {
      "DAMAGE#0.multiplier": c(1.8, 2.1, 2.5, 2.9, 3.3),
      "DAMAGE#0.hpCoefficient": c(0.12, 0.14, 0.16, 0.18, 0.20),
      "DAMAGE#0.missingHpBonus.perLostRatio": c(0.30, 0.35, 0.40, 0.45, 0.50),
      "DAMAGE#0.missingHpBonus.maxBonus": c(0.30, 0.35, 0.40, 0.45, 0.50),
      "GAUGE#0.amount": c(0.30, 0.30, 0.40, 0.40, 0.50),
      ct: ct5(4),
    },
    allowWeaker: { "LIFESTEAL#0": "指定「HP吸収ではなくゲージ吸収」で、吸血をゲージ吸収へ置き換える" },
    note: "「missing+30」は、自身が失ったHPが多いほど上がる最終ダメージの上限として足した。今ある「対象が弱体状態なら+25%」は消すと弱くなるので残した",
  },

  /* ================================================================ 22. ヴァルキリア */
  { id: "valkyria_s1", values: { "DAMAGE#0.multiplier": c(1.0, 1.1, 1.1, 1.2), "GAUGE#0.amount": c(0.10, 0.10, 0.15, 0.15, 0.20) } },
  {
    id: "valkyria_s2_a",
    values: { "HEAL#0.healRate": c(0.30, 0.35, 0.35, 0.40), "CLEANSE#0.count": c(1, 1, 2), "BUFF#0.durationTurns": c(2, 2, 2, 2, 3), ct: ct5(3) },
    // Lv5 は全解除
    levelStructure: (level, effects) => level === 5 ? effects.map((e) => {
      if (e.kind !== "CLEANSE") return e;
      const { count: _c, ...rest } = e;
      return rest as Effect;
    }) : effects,
  },
  { id: "valkyria_s2_b", values: { "GAUGE#0.amount": c(0.20, 0.25, 0.25, 0.30), "BUFF#0.durationTurns": c(2, 2, 2, 2, 3), ct: ct5(4) } },
  {
    id: "valkyria_s2_c",
    structure: [
      remove(1),
      add({ kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2 }),
      add({ kind: "REGEN", healRate: 0.05, durationTurns: 2 }),
    ],
    values: { ct: c(3) },
    allowWeaker: { "HEAL#0": "指定「直接回復を削除。ENDURE + ATKup + REGEN型」" },
    note: "毎ターン5%の継続回復は、攻撃UPと同じ2ターンにした。Lv による伸びの指定は無いので全段同じ(Lv5 の我慢2ターンは今のまま)",
  },
  {
    id: "valkyria_s3_a",
    values: { "HEAL#0.healRate": c(0.25, 0.30, 0.30, 0.35, 0.40), "CLEANSE#0.count": c(1, 1, 2), "BUFF#0.durationTurns": c(2, 2, 2, 2, 3), ct: ct5(4) },
    levelStructure: (level, effects) => level === 5 ? effects.map((e) => {
      if (e.kind !== "CLEANSE") return e;
      const { count: _c, ...rest } = e;
      return rest as Effect;
    }) : effects,
    note: "「cleanse成長」は守りの翼と同じ形(Lv3 で2個・Lv5 で全解除)にした",
  },
  {
    id: "valkyria_s3_b",
    structure: [patch(0, { lowHpExtra: { hpRatio: 0.5, amount: 0.15 } })],
    values: {
      "GAUGE#0.amount": c(0.30, 0.35, 0.35, 0.40),
      "GAUGE#0.lowHpExtra.amount": c(0.15, 0.20, 0.25),
      "BUFF#0.durationTurns": c(2, 2, 2, 2, 3),
      ct: ct5(5),
    },
  },
  { id: "valkyria_s3_c", values: { "passive.heal": c(0.25, 0.30, 0.35, 0.40, 0.45), "passive.internalCooldown": c(5, 5, 5, 5, 4) } },
  { id: "valkyria_s3_light", values: { "HEAL#0.healRate": c(0.30, 0.35, 0.40, 0.45, 0.50), "STATUS#0.durationTurns": c(1, 1, 1, 1, 2), ct: ct5(5) } },
  {
    id: "valkyria_s3_dark",
    values: { "GAUGE#0.amount": c(0.30, 0.35, 0.40, 0.45, 0.50), "GAUGE#0.lowHpExtra.amount": c(0.15, 0.15, 0.20, 0.20, 0.25) },
    note: "「通常最大50 + lowHP25程度」を、ゲージ 30→50%(1段5%)、HP50%以下の上乗せ 15→25% とした",
  },

  /* ================================================================ 23. サンダービースト */
  { id: "thunderbeast_s1", values: { "DAMAGE#0.multiplier": c(0.90, 1.00, 1.00, 1.10, 1.10), "DAMAGE#0.scaleBonus.bonusAtReference": c(0.35, 0.35, 0.40, 0.40, 0.45) } },
  {
    id: "thunderbeast_s2_a",
    values: {
      "DAMAGE#0.multiplier": c(1.50, 1.60, 1.70, 1.80),
      "DAMAGE#0.scaleBonus.bonusAtReference": c(0.40, 0.45, 0.50, 0.55, 0.60),
      "GAUGE#0.amount": c(0.25, 0.25, 0.30, 0.30, 0.35),
      ct: ct5(3),
    },
  },
  {
    id: "thunderbeast_s2_b",
    structure: [patch(0, { scaleBonus: { stat: "spd", bonusAtReference: 0.15 } })],
    values: {
      "DAMAGE#0.multiplier": c(0.65, 0.70, 0.75, 0.80),
      "DAMAGE#0.scaleBonus.bonusAtReference": c(0.15, 0.20, 0.20, 0.25, 0.30),
      "GAUGE#0.amount": c(0.25, 0.25, 0.30, 0.30, 0.35),
      ct: ct5(3),
    },
  },
  {
    id: "thunderbeast_s2_c",
    values: {
      "DAMAGE#0.multiplier": c(1.40, 1.50, 1.60, 1.70, 1.80),
      "DAMAGE#0.scaleBonus.bonusAtReference": c(0.40, 0.45, 0.50, 0.55, 0.60),
      "DEBUFF#0.chance": c(0.80, 0.90, 0.90, 1.0),
      "DEBUFF#0.durationTurns": c(2, 2, 2, 2, 3),
      ct: ct5(3),
    },
  },
  {
    id: "thunderbeast_s3_a",
    values: {
      "DAMAGE#0.multiplier": c(0.75, 0.80, 0.85, 0.90),
      "DAMAGE#0.scaleBonus.bonusAtReference": c(0.45, 0.50, 0.55, 0.60, 0.65),
      "GAUGE#0.amount": c(0.40, 0.45, 0.50, 0.55, 0.60),
      ct: c(5, 5, 5, 5, 3),
    },
  },
  {
    id: "thunderbeast_s3_b",
    values: {
      "GAUGE#0.amount": c(0.20, 0.25, 0.25, 0.30),
      "GAUGE#1.amount": c(0.25, 0.25, 0.30, 0.30, 0.35),
      "BUFF#0.durationTurns": c(2, 2, 2, 2, 3),
      "BUFF#1.durationTurns": c(2, 2, 2, 2, 3),
      ct: ct5(5),
    },
  },
  {
    id: "thunderbeast_s3_c",
    flags: { extraTurn: true },
    structure: [
      remove(2),
      add({ kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3, applyTo: "SELF" }),
      add({ kind: "REGEN", healRate: 0.05, durationTurns: 3, applyTo: "SELF" }),
    ],
    values: {
      "REGEN#0.healRate": c(0.05, 0.07, 0.10, 0.12, 0.15),
      "REGEN#0.durationTurns": c(3, 3, 3, 3, 4),
      "BUFF#0.durationTurns": c(3, 3, 3, 3, 4),
      "BUFF#1.durationTurns": c(3, 3, 3, 3, 4),
      "BUFF#2.durationTurns": c(3, 3, 3, 3, 4),
      ct: ct5(4),
    },
    allowWeaker: { "GAUGE#0": "指定の「即時追加ターン」(行動ゲージ100%相当)が、今の自身ゲージ+40%の上位互換として置き換わる" },
  },
  {
    id: "thunderbeast_s3_light",
    values: { "passive.critDmg": c(0.25, 0.30, 0.35, 0.40, 0.45), "passive.spd": c(20, 25, 30, 35, 40), "passive.drain": c(0.15, 0.15, 0.20, 0.20, 0.25) },
  },
  {
    id: "thunderbeast_s3_dark",
    values: {
      "DAMAGE#0.multiplier": c(0.75, 0.80, 0.85, 0.90),
      "DAMAGE#0.scaleBonus.bonusAtReference": c(0.45, 0.50, 0.55, 0.60, 0.65),
      "DAMAGE#1.multiplier": c(0.80, 0.90, 1.00, 1.10, 1.20),
      "DAMAGE#1.scaleBonus.bonusAtReference": c(0.45, 0.50, 0.55, 0.60, 0.65),
      "DAMAGE#1.ignoreDefenseRatio": c(0.50, 0.50, 0.60, 0.70, 0.80),
      ct: ct5(5),
    },
    note: "追撃の速度比例は途中の段の指定が無いため、本体の速度比例と同じ値で伸ばした(Lv1 0.45 → Lv5 0.65 は指定どおり)",
  },

  /* ================================================================ 24. アビスリーパー */
  {
    id: "abyssreaper_s3_a",
    structure: [patch(1, { count: 3, selfGaugePerRemoved: undefined, selfGaugePerTarget: 0.10 })],
    values: {
      "DAMAGE#0.multiplier": c(1.30, 1.40, 1.50, 1.60),
      "STRIP#0.chance": c(0.80, 0.90, 0.90, 1.0),
      "STRIP#0.selfGaugePerTarget": c(0.10, 0.10, 0.15, 0.15, 0.20),
      ct: ct5(4),
    },
    allowWeaker: { "STRIP#0.selfGaugePerRemoved": "指定「成功した敵1体につき」へ数え方を変える(剥がした個数ではなく、剥がせた敵の数)" },
  },
  {
    id: "abyssreaper_s3_b",
    structure: [patch(0, { debuffDamageBonus: undefined, buffCountBonus: { perBuff: 0.15, maxBonus: 1.0 } })],
    values: {
      "DAMAGE#0.multiplier": c(2.30, 2.60, 2.90, 3.20, 3.50),
      "DAMAGE#0.buffCountBonus.perBuff": c(0.15, 0.15, 0.20, 0.20, 0.25),
      ct: ct5(4),
    },
    allowWeaker: { "DAMAGE#0.debuffDamageBonus": "指定「対象のデバフ数ではなく、攻撃開始時の対象の強化数で火力増加」" },
  },
  { id: "abyssreaper_s3_c", values: { "passive.chance": c(0.50, 0.60, 0.70, 0.80, 1.0), "passive.heal": c(0.10, 0.10, 0.15, 0.15, 0.20), "passive.gauge": c(0.15, 0.20, 0.20, 0.25, 0.30) } },

  /* ================================================================ 25. フェンリル */
  {
    id: "fenrir_s1",
    values: {
      "DAMAGE#0.multiplier": c(0.65, 0.70, 0.75, 0.80, 0.85),
      "DAMAGE#1.multiplier": c(0.65, 0.70, 0.75, 0.80, 0.85),
      "DEBUFF#0.chance": c(0.40, 0.40, 0.50, 0.50, 0.60),
      "DEBUFF#1.chance": c(0.40, 0.40, 0.50, 0.50, 0.60),
      "DEBUFF#0.durationTurns": c(2, 2, 2, 2, 3),
      "DEBUFF#1.durationTurns": c(2, 2, 2, 2, 3),
    },
  },
  { id: "fenrir_s2_a", values: { "DAMAGE#0.multiplier": c(0.70, 0.75, 0.80, 0.90), "DAMAGE#1.multiplier": c(0.80, 0.90, 1.00, 1.10, 1.20), ct: ct5(3) } },
  { id: "fenrir_s2_b", values: { "COOP_ATTACK#0.damageMultiplier": c(1.0, 1.1, 1.2, 1.3, 1.4), ct: c(5, 5, 5, 4, 3) } },
  {
    id: "fenrir_s2_c",
    values: {
      "DAMAGE#0.multiplier": c(1.50, 1.70, 1.90, 2.10, 2.30),
      "DEBUFF#0.chance": c(0.80, 0.90, 0.90, 1.0),
      "DEBUFF#0.durationTurns": c(2, 2, 2, 2, 3),
      "GAUGE#0.amount": c(0.50, 0.50, 0.60, 0.70, 0.80),
      ct: ct5(3),
    },
  },
  {
    id: "fenrir_s3_a",
    values: {
      "DAMAGE#0.multiplier": c(0.65, 0.70, 0.75, 0.80, 0.85),
      "DAMAGE#0.targetHpBonus.0.bonus": c(0.20, 0.20, 0.25, 0.25, 0.30),
      "DAMAGE#0.gaugeOnCritPerHit": c(0.10, 0.10, 0.10, 0.15),
      ct: ct5(4),
    },
  },
  {
    id: "fenrir_s3_b",
    values: {
      "DAMAGE#0.multiplier": c(3.0, 3.3, 3.6, 4.0),
      "HEAL_BLOCK#0.chance": c(0.80, 0.90, 0.90, 1.0),
      "POISON#0.chance": c(0.80, 0.90, 0.90, 1.0),
      "HEAL_BLOCK#0.durationTurns": c(2, 2, 2, 2, 3),
      "POISON#0.durationTurns": c(2, 2, 2, 2, 3),
      ct: ct5(4),
    },
  },
  { id: "fenrir_s3_c", values: { "passive.critDmg": c(0.20, 0.30, 0.40, 0.50, 0.60), "passive.repeatS1Chance": c(0.50, 0.50, 0.50, 0.50, 0.60) } },
  {
    id: "fenrir_s3_light",
    values: {
      "DAMAGE#0.multiplier": c(1.5, 1.7, 1.9, 2.1),
      "STUN#0.chance": c(0.70, 0.80, 0.80, 0.90, 1.0),
      "COOLDOWN_EXTEND#0.chance": c(0.70, 0.70, 0.70, 0.70, 1.0),
      "GAUGE#0.amount": c(-0.20, -0.20, -0.25, -0.30, -0.35),
      ct: ct5(5),
    },
  },
  {
    id: "fenrir_s3_dark",
    values: {
      "DAMAGE#0.multiplier": c(0.75, 0.80, 0.85, 0.90, 1.00),
      "DAMAGE#0.targetHpIgnoreDefense.0.ratio": c(0.40, 0.50, 0.60, 0.70, 0.80),
      "DAMAGE#0.targetHpBonus.0.bonus": c(0.30, 0.30, 0.40, 0.40, 0.50),
      ct: ct5(5),
    },
  },

  /* ================================================================ 26. クロノス */
  { id: "chronos_s1", values: { "DAMAGE#0.multiplier": c(0.90, 1.00, 1.10, 1.20, 1.30), "GAUGE#0.amount": c(-0.20, -0.20, -0.25, -0.25, -0.30) } },
  { id: "chronos_s2_a", values: { "GAUGE#0.amount": c(0.50, 0.60, 0.70, 0.80, 1.00), ct: ct5(4) } },
  { id: "chronos_s2_b", values: { "DAMAGE#0.multiplier": c(1.10, 1.20, 1.30, 1.40, 1.50), "STUN#0.chance": c(0.80, 0.90, 0.90, 1.0), "GAUGE#0.amount": c(-0.50, -0.60, -0.70, -0.80, -1.00), ct: ct5(4) } },
  { id: "chronos_s2_c", values: { "HEAL#0.healRate": c(0.30, 0.35, 0.40, 0.45, 0.50), "COOLDOWN_REDUCE#0.turns": c(1, 1, 1, 1, 2), ct: ct5(4) } },
  { id: "chronos_s3_a", values: { "GAUGE#0.amount": c(0.30, 0.35, 0.40, 0.45, 0.50), ct: ct5(5) } },
  {
    id: "chronos_s3_b",
    values: {
      "DAMAGE#0.multiplier": c(1.10, 1.20, 1.30, 1.40, 1.50),
      "GAUGE#0.chance": c(0.70, 0.80, 0.85, 0.90, 1.0),
      "STUN#0.chance": c(0.20, 0.20, 0.25, 0.30, 0.30),
      ct: c(6, 6, 6, 6, 5),
    },
    note: "実行時の差し替え(`applyLegacySkillBalance`)で作られていた今の姿(1.0倍・70%でゲージ-100%・20%でスタン)を基準にした。差し替えは定義へ移して消す",
  },
  { id: "chronos_s3_c", values: { "DAMAGE#0.multiplier": c(1.30, 1.40, 1.50, 1.60), "COOLDOWN_EXTEND#0.chance": c(0.80, 0.90, 0.90, 1.0), "GAUGE#0.amount": c(-0.50, -0.55, -0.60, -0.65, -0.70), ct: ct5(5) } },
  { id: "chronos_s3_light", values: { "GAUGE#0.amount": c(0.30, 0.35, 0.40, 0.45, 0.50), ct: ct5(7) } },
  { id: "chronos_s3_dark", values: { "passive.allyGauge": c(0.10, 0.10, 0.15, 0.15, 0.20), "passive.drain": c(0.10, 0.15, 0.15, 0.20, 0.20), "passive.stunChance": c(0.20, 0.25, 0.30, 0.35, 0.40) } },

  /* ================================================================ 27. ベヒモス */
  {
    id: "behemoth_s1",
    values: {
      "DAMAGE#0.multiplier": c(0.55, 0.60, 0.65, 0.70, 0.75),
      "DAMAGE#0.hpCoefficient": c(0.08, 0.08, 0.09, 0.09, 0.10),
      "STATUS#0.chance": c(0.50, 0.55, 0.60, 0.65, 0.70),
      "STATUS#0.durationTurns": c(2, 2, 2, 2, 3),
    },
  },
  {
    id: "behemoth_s2_a",
    values: {
      "DAMAGE#0.multiplier": c(0.80, 0.85, 0.90, 0.95, 1.00),
      "DAMAGE#0.hpCoefficient": c(0.12, 0.13, 0.13, 0.14, 0.15),
      "DEBUFF#0.chance": c(0.70, 0.75, 0.80, 0.85, 0.90),
      "DEBUFF#0.durationTurns": c(2, 2, 2, 2, 3),
      ct: ct5(4),
    },
  },
  {
    id: "behemoth_s2_b",
    values: {
      "DAMAGE#0.multiplier": c(1.30, 1.40, 1.50, 1.60, 1.70),
      "DAMAGE#0.hpCoefficient": c(0.20, 0.21, 0.22, 0.23, 0.25),
      "GAUGE#0.amount": c(-0.40, -0.40, -0.45, -0.45, -0.50),
      "GAUGE#0.conditionalExtra.amount": c(-0.20),
      ct: ct5(4),
    },
    note: "「conditional total -60/-65/-70」は、条件を満たした時の合計(基本 + 上乗せ)として読んだ。上乗せは全段 -20% のまま",
  },
  { id: "behemoth_s2_c", values: { "SHIELD#0.shieldRate": c(0.15, 0.16, 0.17, 0.18, 0.20), "SHIELD#0.durationTurns": c(2, 2, 2, 2, 3), "STATUS#0.durationTurns": c(2, 2, 2, 2, 3), ct: ct5(4) } },
  {
    id: "behemoth_s3_a",
    values: {
      "DAMAGE#0.multiplier": c(1.20, 1.30, 1.35, 1.45, 1.50),
      "DAMAGE#0.hpCoefficient": c(0.15, 0.16, 0.16, 0.17, 0.18),
      "DEBUFF#0.chance": c(0.80, 0.85, 0.90, 0.95, 1.0),
      "DEBUFF#0.durationTurns": c(2, 2, 2, 2, 3),
      "GAUGE#0.amount": c(-0.20, -0.20, -0.25, -0.25, -0.30),
      ct: ct5(5),
    },
  },
  { id: "behemoth_s3_b", values: { "HEAL#0.healRate": c(0.35, 0.38, 0.40, 0.42, 0.45), "MITIGATE#0.durationTurns": c(2, 2, 2, 2, 3), ct: ct5(5) } },
  { id: "behemoth_s3_c", keep: true },
  {
    id: "behemoth_s3_light",
    values: { "SHIELD#0.shieldRate": c(0.25, 0.27, 0.28, 0.30, 0.32), "SHIELD#0.durationTurns": c(2, 2, 2, 2, 3), "STATUS#0.durationTurns": c(1, 1, 1, 1, 2), ct: ct5(6) },
  },
  {
    id: "behemoth_s3_dark",
    values: {
      "DAMAGE#0.multiplier": c(1.20, 1.30, 1.35, 1.45, 1.50),
      "DAMAGE#0.hpCoefficient": c(0.15, 0.16, 0.16, 0.17, 0.18),
      "STATUS#0.chance": c(0.80, 0.85, 0.90, 0.95, 1.0),
      "STATUS#0.durationTurns": c(2, 2, 2, 2, 3),
      "GAUGE#0.amount": c(-0.30, -0.30, -0.35, -0.35, -0.40),
      "STATUS#1.durationTurns": c(2, 2, 2, 2, 3),
      ct: ct5(5),
    },
  },

  /* ================================================================ 28. クリム */
  { id: "crim_s1", values: { "DAMAGE#0.multiplier": c(1.00, 1.10, 1.10, 1.20, 1.20), "SPLASH#0.ratio": c(0.50, 0.50, 0.60, 0.60, 0.70) } },
  { id: "crim_s2", values: { "DAMAGE#0.multiplier": only({ 4: 0.95 }) }, note: "「控えめに調整」: Lv4 の倍率だけ 0.90→0.95 にした(強化阻害は足していない)" },
  { id: "crim_s3", values: { "DAMAGE#0.multiplier": lv5(2.80) }, note: "「小幅調整のみ」: Lv5 の倍率だけ 2.70→2.80 にした" },

  /* ================================================================ 29. グジラ */
  { id: "gujira_s1", values: { "DAMAGE#0.multiplier": c(1.50, 1.65, 1.80, 2.00, 2.20) } },
  { id: "gujira_s2_press", values: { "DAMAGE#0.multiplier": c(3.00, 3.20, 3.20, 3.60, 3.70), "STUN#0.chance": c(0.40, 0.40, 0.50), ct: ct5(2) } },
  {
    id: "gujira_s2_quake",
    values: {
      "DAMAGE#0.multiplier": c(1.90, 2.00, 2.00, 2.10, 2.20),
      "DEBUFF#0.chance": c(0.55, 0.55, 0.65, 0.65, 0.70),
      "DEBUFF#0.durationTurns": c(2, 2, 2, 3),
      ct: ct5(2),
    },
  },
  { id: "gujira_s2_whale_boost", keep: true },
  { id: "gujira_s3_tsunami", values: { "DEBUFF#0.chance": only({ 4: 0.80, 5: 0.80 }), "DEBUFF#0.durationTurns": only({ 4: 3, 5: 3 }), "DAMAGE#0.multiplier": only({ 4: 2.80, 5: 3.00 }), ct: ct5(5) } },
  { id: "gujira_s3_wave_press", values: { "DAMAGE#0.multiplier": c(6.50, 6.90, 6.90, 7.40, 7.50), "DAMAGE#0.conditionalIgnoreDefense.ratio": c(0.50, 0.50, 0.55, 0.55, 0.60), ct: ct5(4) } },
  { id: "gujira_s3_white_surge", values: { "DAMAGE#0.multiplier": c(4.80, 5.10, 5.10, 5.60, 5.80), "FLAT_DAMAGE#0.amount": c(10000, 10000, 12000, 12000, 15000), ct: ct5(4) } },
  { id: "gujira_s3_king_wave", keep: true },
  { id: "gujira_s3_abyss_lord", keep: true },

  /* ================================================================ 30. モッチー */
  { id: "mocchi_s1", values: { "DAMAGE#0.multiplier": c(0.60, 0.65, 0.65, 0.65, 0.70), "DAMAGE#0.hpCoefficient": c(0.05, 0.05, 0.06), "DAMAGE#0.defCoefficient": c(0.50, 0.50, 0.50, 0.55, 0.60) } },
  { id: "mocchi_s2_fubuki", values: { "DAMAGE#0.multiplier": c(1.40, 1.50), "DAMAGE#0.hpCoefficient": c(0.12, 0.12, 0.12, 0.14, 0.15), "STATUS#0.chance": c(0.70, 0.70, 0.80), ct: ct5(2) } },
  { id: "mocchi_s2_gatcher", values: { "DAMAGE#0.multiplier": c(0.70, 0.75, 0.75, 0.80), "DAMAGE#0.defCoefficient": c(0.60, 0.60, 0.60, 0.65, 0.70), "DAMAGE#0.perHit.GAUGE#0.chance": c(0.40, 0.40, 0.45), ct: ct5(2) } },
  { id: "mocchi_s2_cannon", values: { "DAMAGE#0.multiplier": c(1.60, 1.75, 1.75, 1.80), "DAMAGE#0.defCoefficient": c(1.20, 1.20, 1.20, 1.40), "DAMAGE#0.conditionalIgnoreDefense.ratio": c(0.30, 0.30, 0.35, 0.35, 0.40), ct: ct5(3) } },
  { id: "mocchi_s3_super_cannon", values: { "DAMAGE#0.multiplier": lv5(3.10), "DAMAGE#0.defCoefficient": lv5(2.20), "GAUGE#0.chance": lv5(0.85), "STUN#0.chance": lv5(0.60), ct: ct5(5) } },
  { id: "mocchi_s3_yoiyami", values: { "DAMAGE#0.multiplier": only({ 4: 1.80, 5: 1.80 }), "DAMAGE#0.hpCoefficient": only({ 4: 0.10, 5: 0.12 }), "HEAL_BLOCK#0.chance": only({ 4: 0.80, 5: 0.80 }), "HEAL_BLOCK#0.durationTurns": only({ 4: 3, 5: 3 }), ct: ct5(4) } },
  { id: "mocchi_s3_guts", keep: true },
  { id: "mocchi_s3_shiromossama", keep: true },
  { id: "mocchi_s3_sakura_field", keep: true },

  /* ================================================================ 31. スエゾー */
  { id: "suezo_s1", values: { "DAMAGE#0.multiplier": lv5(1.10) } },
  { id: "suezo_s2_kiss", values: { "DAMAGE#0.multiplier": only({ 2: 1.90 }) } },
  { id: "suezo_s2_telepathy", keep: true },
  { id: "suezo_s2_psychokinesis", values: { "DAMAGE#0.multiplier": only({ 2: 1.50 }) } },
  { id: "suezo_s3_sing", keep: true },
  { id: "suezo_s3_eat", values: { "DAMAGE#0.multiplier": lv5(4.20) } },
  { id: "suezo_s3_beam", values: { "DAMAGE#0.multiplier": lv5(4.60) } },
  { id: "suezo_s3_charm_eye", keep: true },
  { id: "suezo_s3_chronokinesis", keep: true },

  /* ================================================================ 32. ウンディーネ */
  { id: "undine_s1", values: { "DAMAGE#0.multiplier": lv5(1.10) } },
  {
    id: "undine_s2_aqua_veil",
    values: { "HEAL#0.healRate": c(0.40, 0.45, 0.50), "IMMUNITY#0.durationTurns": only({ 4: 3, 5: 3 }), ct: ct5(2) },
  },
  { id: "undine_s2_aqua_healing", values: { "HEAL#0.healRate": c(0.25, 0.30), "REGEN#0.healRate": c(0.10, 0.10, 0.12), "REGEN#0.durationTurns": c(2, 2, 2, 3), ct: ct5(3) } },
  { id: "undine_s2_crystal_rain", values: { "DAMAGE#0.multiplier": lv5(0.50) } },
  { id: "undine_s3_water_blessing", keep: true },
  { id: "undine_s3_crystal_arrow", keep: true },
  {
    id: "undine_s3_water_god_blessing",
    values: {
      "SHIELD#0.shieldRate": c(0.25, 0.30),
      "SHIELD#0.durationTurns": only({ 4: 3, 5: 3 }),
      "BUFF#0.durationTurns": only({ 4: 3, 5: 3 }),
      "BUFF#1.durationTurns": only({ 4: 3, 5: 3 }),
      ct: ct5(6),
    },
  },
  { id: "undine_s3_water_god_breath", values: { "HEAL#0.healRate": c(0.20, 0.25), "GAUGE#0.amount": only({ 3: -0.35, 4: -0.35, 5: -0.35 }), ct: ct5(6) } },
  { id: "undine_s3_aqua_dome", values: { "DAMAGE#0.defCoefficient": c(2.10, 2.30, 2.40, 2.60), ct: ct5(3) } },
];

/** 保留事項(依頼で「勝手に決めない」とされたもの) */
export const PENDING_NOTES: { title: string; body: string }[] = [
  {
    title: "アビスリーパーのS2多段化(冥府の契約・魂の略奪)",
    body: "死神の収穫を各ヒットで判定する形にしたが、草の「冥府の契約」は攻撃をしない技、水の「魂の略奪」は1ヒットなので、S2から収穫が1回しか(または一度も)出ない。依頼どおり今回は決めずに候補だけを出す(docs/SKILL_BALANCE_GUIDE.md の保留事項)。",
  },
];
