import { describe, expect, it } from "vitest";
import {
  EQUIP_MAX_LEVEL,
  MAIN_STAT_TUNING,
  enhanceEquipment,
  generateEquipment,
  mainStatTuning,
  type EquipSlot,
  type Equipment,
  type StatType,
} from "../src/core/equipment.js";
import { createInitialState, normalizeLoadedState } from "../src/game/playerState.js";
import { mulberry32 } from "../tools/battleLab/rng.js";

/*
 * メインHP%を0.85倍、メインクリダメ%を1.35倍にした調整の見張り。
 *
 * **生成・強化・既存装備の移行の3つが対で決まる。**どれか1つを直し忘れると、
 * 「新規だけ強い」「前から遊んでいる人だけ古い性能」のどちらかになる。
 * ここはその3つが同じ基準で動いていることだけを見る。
 */

/** 指定のメインが出るまで引く。出なければ null(枠によっては候補が多い) */
function rollUntilMain(slot: EquipSlot, type: StatType, seed: number, level = EQUIP_MAX_LEVEL): Equipment | null {
  const rng = mulberry32(seed);
  for (let i = 0; i < 400; i += 1) {
    const equipment = generateEquipment({ slot, star: 6, subStatCount: 0, rng });
    if (equipment.mainStat.type !== type) continue;
    while (equipment.level < level) enhanceEquipment(equipment, rng);
    return equipment;
  }
  return null;
}

describe("装備メインの調整倍率", () => {
  it("倍率が乗るのはメインHP%とメインクリダメ%だけ", () => {
    expect(MAIN_STAT_TUNING.HP_PERCENT).toBe(0.85);
    expect(MAIN_STAT_TUNING.CRIT_DMG).toBe(1.35);
    // 割合系など、今回の実数メイン調整対象外は1倍のまま
    for (const type of ["ATK_PERCENT", "DEF_PERCENT", "SPD", "CRIT_RATE", "ACCURACY", "RESISTANCE"] as StatType[]) {
      expect(mainStatTuning(type), `${type} には倍率を掛けない`).toBe(1);
    }
    expect(mainStatTuning("HP_FLAT")).toBeCloseTo(0.32, 6);
    expect(mainStatTuning("ATK_FLAT")).toBeCloseTo(0.293, 6);
    expect(mainStatTuning("DEF_FLAT")).toBeCloseTo(0.293, 6);
  });

  it("★6+15のメインHP%は70〜95%帯、クリダメ%は105〜130%帯に収まる", () => {
    const hp: number[] = [];
    const crit: number[] = [];
    for (let seed = 1; seed <= 120; seed += 1) {
      const hpEquip = rollUntilMain(4, "HP_PERCENT", seed);
      if (hpEquip) hp.push(hpEquip.mainStat.value);
      const critEquip = rollUntilMain(4, "CRIT_DMG", seed + 5_000);
      if (critEquip) crit.push(critEquip.mainStat.value);
    }
    expect(hp.length).toBeGreaterThan(50);
    expect(crit.length).toBeGreaterThan(50);
    expect(Math.min(...hp), "メインHP%の下限").toBeGreaterThan(0.7);
    expect(Math.max(...hp), "メインHP%の上限").toBeLessThan(0.95);
    expect(Math.min(...crit), "メインクリダメ%の下限").toBeGreaterThan(1.05);
    expect(Math.max(...crit), "メインクリダメ%の上限").toBeLessThan(1.3);
  });

  /*
   * **サブOPは対象外。**ここが落ちたら、メインだけのはずの倍率が
   * サブまで巻き込んでいる(`rollStatValue` と `rollMainStatValue` の取り違え)。
   */
  it("サブOPのHP%とクリダメ%には倍率が乗らない", () => {
    const rng = mulberry32(77);
    const hpSubs: number[] = [];
    const critSubs: number[] = [];
    for (let i = 0; i < 400; i += 1) {
      const equipment = generateEquipment({ slot: 1, star: 6, subStatCount: 4, rng });
      for (const sub of equipment.subStats) {
        if (sub.type === "HP_PERCENT") hpSubs.push(sub.value);
        if (sub.type === "CRIT_DMG") critSubs.push(sub.value);
      }
    }
    // サブは初期値の2割。★6の素の初期値は HP% 0.09×6=0.54 / クリダメ 0.08×6=0.48
    // 倍率が乗っていれば中心が 0.0918 / 0.1296 へずれる
    const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;
    expect(mean(hpSubs)).toBeGreaterThan(0.1 * 0.9);
    expect(mean(hpSubs)).toBeLessThan(0.12);
    expect(mean(critSubs)).toBeGreaterThan(0.085);
    expect(mean(critSubs)).toBeLessThan(0.105);
  });
});

describe("既に持っている装備の移行", () => {
  it("メインHP%は0.85倍、メインクリダメ%は1.35倍になる", () => {
    const hp = rollUntilMain(4, "HP_PERCENT", 11);
    const crit = rollUntilMain(4, "CRIT_DMG", 12);
    const atk = rollUntilMain(2, "ATK_PERCENT", 13);
    expect(hp && crit && atk).toBeTruthy();

    const state = createInitialState();
    state.equipment = [hp!, crit!, atk!];
    const before = state.equipment.map((e) => e.mainStat.value);
    delete (state as { equipmentMainHpCritRebalanced?: boolean }).equipmentMainHpCritRebalanced;

    const migrated = normalizeLoadedState(state);
    expect(migrated.equipment[0].mainStat.value).toBeCloseTo(before[0] * 0.85, 3);
    expect(migrated.equipment[1].mainStat.value).toBeCloseTo(before[1] * 1.35, 3);
    // 攻撃%は一切動かない
    expect(migrated.equipment[2].mainStat.value).toBe(before[2]);
    expect(migrated.equipmentMainHpCritRebalanced).toBe(true);
  });

  it("移行は一度きり。読み込むたびに痩せていかない", () => {
    const hp = rollUntilMain(4, "HP_PERCENT", 21);
    expect(hp).toBeTruthy();
    const state = createInitialState();
    state.equipment = [hp!];
    delete (state as { equipmentMainHpCritRebalanced?: boolean }).equipmentMainHpCritRebalanced;

    const once = normalizeLoadedState(state).equipment[0].mainStat.value;
    const twice = normalizeLoadedState(normalizeLoadedState(state)).equipment[0].mainStat.value;
    const thrice = normalizeLoadedState(normalizeLoadedState(normalizeLoadedState(state))).equipment[0].mainStat.value;
    expect(twice).toBe(once);
    expect(thrice).toBe(once);
  });

  it("サブOP・星・強化値・シリーズ・ロック・装着対象外の印は動かない", () => {
    const rng = mulberry32(31);
    let target: Equipment | null = null;
    for (let i = 0; i < 400 && !target; i += 1) {
      const equipment = generateEquipment({ slot: 4, star: 6, subStatCount: 4, rng });
      if (equipment.mainStat.type === "HP_PERCENT") {
        while (equipment.level < EQUIP_MAX_LEVEL) enhanceEquipment(equipment, rng);
        target = equipment;
      }
    }
    expect(target).toBeTruthy();
    target!.locked = true;
    target!.autoExclude = true;
    const snapshot = JSON.parse(JSON.stringify({ ...target!, mainStat: null })) as Record<string, unknown>;

    const state = createInitialState();
    state.equipment = [target!];
    delete (state as { equipmentMainHpCritRebalanced?: boolean }).equipmentMainHpCritRebalanced;
    const migrated = normalizeLoadedState(state).equipment[0];

    expect({ ...migrated, mainStat: null }).toEqual(snapshot);
  });

  /*
   * **厳選の序列が逆転しないこと。**倍率は全員に同じだけ掛かるので、
   * 良い装備と悪い装備が入れ替わることは無いはず。
   *
   * **「完全に同じ並び」は求めない。**小数第3位へ丸めるので、
   * 元が 0.843 と 0.844 のように僅差だった組は移行後に同じ値になる。
   * それは順位の逆転ではなく、区別が付かなくなっただけ。
   * ここが落ちたら、移行が「値によって違う直し方」をしている。
   */
  it("厳選した装備の序列が逆転しない", () => {
    const equipment: Equipment[] = [];
    for (let seed = 40; seed < 70; seed += 1) {
      const rolled = rollUntilMain(4, "HP_PERCENT", seed);
      if (rolled) equipment.push(rolled);
    }
    expect(equipment.length).toBeGreaterThan(10);
    const before = equipment.map((e) => e.mainStat.value);

    const state = createInitialState();
    state.equipment = equipment;
    delete (state as { equipmentMainHpCritRebalanced?: boolean }).equipmentMainHpCritRebalanced;
    const after = normalizeLoadedState(state).equipment.map((e) => e.mainStat.value);

    for (let i = 0; i < before.length; i += 1) {
      for (let j = 0; j < before.length; j += 1) {
        if (before[i] >= before[j]) continue;
        expect(after[i], `移行前 ${before[i]} < ${before[j]} が移行後に逆転した`).toBeLessThanOrEqual(after[j]);
      }
    }
  });

  /*
   * **移行した装備と、新しく引いた装備が同じ値域になること。**
   * 片方だけ直すと「既存だけ弱い」「新規だけ強い」が起きる。
   * 丸め(小数第3位)のぶんだけ厳密には一致しないので、値域で見る。
   */
  it("移行後の既存装備と新規生成の値域がそろう", () => {
    for (const [type, slot] of [["HP_PERCENT", 4], ["CRIT_DMG", 4]] as [StatType, EquipSlot][]) {
      const fresh: number[] = [];
      const migrated: number[] = [];
      for (let seed = 100; seed < 160; seed += 1) {
        const rolled = rollUntilMain(slot, type, seed);
        if (!rolled) continue;
        fresh.push(rolled.mainStat.value);
        // 同じ引きを「旧基準の控え」に見立てて移行を通す
        const legacy = { ...rolled, mainStat: { ...rolled.mainStat, value: rolled.mainStat.value / mainStatTuning(type) } };
        const state = createInitialState();
        state.equipment = [legacy];
        delete (state as { equipmentMainHpCritRebalanced?: boolean }).equipmentMainHpCritRebalanced;
        migrated.push(normalizeLoadedState(state).equipment[0].mainStat.value);
      }
      expect(fresh.length).toBeGreaterThan(20);
      const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;
      expect(Math.abs(mean(fresh) - mean(migrated)) / mean(fresh), `${type} の平均のずれ`).toBeLessThan(0.005);
    }
  });
});
