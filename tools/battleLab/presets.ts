/**
 * 「かなり仕上がった実戦個体」の型紙。
 *
 * ## なぜ理論値にしないか
 *
 * 全項目を最大の目で埋めた個体で測ると、**誰も辿り着けない盤面の
 * 難易度**を測ることになる。逆に素の★6で測ると、上級者が来る階が
 * 見えない。ここで作るのは「装備を真面目に集めた人の、良い方の個体」で、
 * サブは役割に合う4項目を素直に選び、目そのものは引き直していない。
 *
 * ## 何が入っているか
 *
 *   ★6 / Lv60 / スキル最大 / 能力ポイント100 / タイプ転生済み /
 *   潜在覚醒済み / ★6装備6個を+15まで強化
 *
 * ## 型紙は出発点であって、答えではない
 *
 * シナリオ側で `abilityPoints` や `gear` や `statOverrides` を書けば、
 * その項目だけが上書きされる。「MAX_ATTACKER のまま速度だけ180」が1行で書ける。
 */
import type { MonsterType } from "../../src/core/monsterDevelopment.js";
import type { GearSpec, PresetName } from "./types.js";
import type { SetType, StatType } from "../../src/core/equipment.js";

export interface Preset {
  type: MonsterType;
  abilityPoints: { hp: number; atk: number; def: number; spd: number };
  gear: GearSpec[];
  /** 潜在覚醒の候補の何番目を取るか */
  latentIndex: number;
  note: string;
}

/**
 * 装備6個を組む。
 *
 * 奇数枠(1/3/5)のメインは固定なので、選べるのは 2/4/6 の3枠だけ。
 * ここでその3枠と、全枠のサブ4項目を役割に合わせて決める。
 *
 * ## サブは「全部が理想」にしない
 *
 * 最初、6個すべてのサブを役割どおりの4項目で埋めていた。その結果
 * **会心率がちょうど100%、会心ダメージが3.68倍**という個体になり、
 * 一度も外さない攻撃役ができあがった。これは理論値であって、
 * 依頼された「現実的にかなり強い完成個体」ではない。
 *
 * そこで `subs` の後ろに**役割に合わない項目**を足し、枠ごとに1つずつ
 * ずらして配る。狙った項目は多く乗るが、どの装備にも無駄が少し混じる——
 * 装備を真面目に集めた人の手元は、だいたいこの形になる。
 *
 * ## セットは 4+2
 *
 * 6個そろえて同じシリーズにすると、**2個セットの効果が3組ぶん重なる。**
 * 会心シリーズなら会心率+45%で、これだけで会心率が天井に張り付いた。
 * 実際に組む時は「4個セット+2個セット」なので、そちらへ合わせる。
 */
function gearOf(
  set: SetType,
  slot2: StatType,
  slot4: StatType,
  slot6: StatType,
  subs: StatType[],
  /** 残り2枠に着ける別シリーズ。省略時は主シリーズと同じ */
  sub2: SetType = set,
): GearSpec[] {
  /** 枠ごとに開始位置をずらして4つ取る。同じ項目が6個そろわない */
  const pickSubs = (exclude: StatType, offset: number): StatType[] => {
    const pool = subs.filter((s) => s !== exclude);
    return Array.from({ length: 4 }, (_, i) => pool[(offset + i) % pool.length]);
  };
  return [
    { slot: 1, set, main: "ATK_FLAT", subs: pickSubs("ATK_FLAT", 0) },
    { slot: 2, set, main: slot2, subs: pickSubs(slot2, 1) },
    { slot: 3, set, main: "DEF_FLAT", subs: pickSubs("DEF_FLAT", 2) },
    { slot: 4, set, main: slot4, subs: pickSubs(slot4, 3) },
    // 5・6枠だけ別シリーズ。4個セット+2個セットの形にする
    { slot: 5, set: sub2, main: "HP_FLAT", subs: pickSubs("HP_FLAT", 4) },
    { slot: 6, set: sub2, main: slot6, subs: pickSubs(slot6, 5) },
  ];
}

export const PRESETS: Record<PresetName, Preset> = {
  /** 殴る役。会心を揃え、余った枠を速度へ回す */
  MAX_ATTACKER: {
    type: "ATTACK",
    abilityPoints: { hp: 0, atk: 70, def: 0, spd: 30 },
    gear: gearOf("CRIT", "SPD", "CRIT_DMG", "ATK_PERCENT", ["CRIT_RATE", "CRIT_DMG", "ATK_PERCENT", "SPD", "HP_PERCENT", "DEF_PERCENT"], "POWER"),
    latentIndex: 0,
    note: "会心4セット・速度メイン。倒しきる役",
  },
  /** 支えの役。先に動けないと支えにならないので、速度を最優先に積む */
  MAX_SUPPORT: {
    type: "SUPPORT",
    abilityPoints: { hp: 40, atk: 0, def: 20, spd: 40 },
    gear: gearOf("SWIFT", "SPD", "HP_PERCENT", "HP_PERCENT", ["SPD", "HP_PERCENT", "DEF_PERCENT", "RESISTANCE", "ATK_PERCENT", "DEF_FLAT"], "RESIST_SET"),
    latentIndex: 0,
    note: "疾風4セット・速度最優先。開幕に間に合う支え",
  },
  /** 癒やす役。倒れない硬さと、先に動ける速さの両方が要る */
  MAX_HEALER: {
    type: "SUPPORT",
    abilityPoints: { hp: 50, atk: 0, def: 20, spd: 30 },
    gear: gearOf("VITALITY", "SPD", "HP_PERCENT", "HP_PERCENT", ["SPD", "HP_PERCENT", "DEF_PERCENT", "RESISTANCE", "ATK_PERCENT", "DEF_FLAT"], "RESIST_SET"),
    latentIndex: 0,
    note: "体力4セット。落ちずに回し続ける",
  },
  /** 崩す役。**効果命中が無いと、入れたい弱体が全部抵抗される** */
  MAX_DEBUFFER: {
    type: "DISRUPT",
    abilityPoints: { hp: 30, atk: 30, def: 0, spd: 40 },
    gear: gearOf("ACCURACY_SET", "SPD", "ATK_PERCENT", "ACCURACY", ["ACCURACY", "SPD", "ATK_PERCENT", "HP_PERCENT", "DEF_PERCENT", "HP_FLAT"], "SWIFT"),
    latentIndex: 0,
    note: "的中4セット・6枠メインも効果命中。入れてこその役",
  },
  /** 受ける役。守護と体力を混ぜず、守護で寄せて抵抗を足す */
  MAX_TANK: {
    type: "DEFENSE",
    abilityPoints: { hp: 50, atk: 0, def: 50, spd: 0 },
    gear: gearOf("GUARD", "DEF_PERCENT", "DEF_PERCENT", "RESISTANCE", ["DEF_PERCENT", "HP_PERCENT", "RESISTANCE", "SPD", "ATK_PERCENT", "HP_FLAT"], "VITALITY"),
    latentIndex: 0,
    note: "守護4セット。抵抗を積んで崩されない",
  },
  /** 速さだけを極める。順番の検証用で、火力は期待しない */
  MAX_SPEED: {
    type: "SUPPORT",
    abilityPoints: { hp: 20, atk: 0, def: 0, spd: 80 },
    gear: gearOf("SWIFT", "SPD", "HP_PERCENT", "HP_PERCENT", ["SPD", "HP_PERCENT", "ACCURACY", "DEF_PERCENT", "ATK_PERCENT", "HP_FLAT"], "VITALITY"),
    latentIndex: 0,
    note: "疾風4セット・速度に全振り。行動順の検証用",
  },
};
