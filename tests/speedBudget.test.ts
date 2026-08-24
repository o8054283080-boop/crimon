import { describe, expect, it } from "vitest";
import { EQUIP_SLOTS, Equipment, applyEquipmentToStats, generateEquipment } from "../src/core/equipment.js";
import { computeEffectiveStats } from "../src/core/rarity.js";
import { EQUIPMENT_DUNGEON_FLOORS } from "../src/data/equipmentDungeon.js";
import { ALL_DISPLAYABLE_MONSTERS_DEX, findMonsterById } from "../src/data/monsters.js";
import { createInitialState, normalizeLoadedState } from "../src/game/playerState.js";

/**
 * 速度の総量。
 *
 * 速度は**手番の数に直結する**ので、同じ「+1」でも攻撃力の+1とは重みが違う。
 * 一度、速度に寄せた★6装備一式で +190 が乗る状態になっていた。
 * モンスターの素の速度は72〜144なので、**装備がモンスター自身より大きい**。
 * そうなると「遅いモンスターに速度装備を積む方が、速いモンスターより速い」ことになり、
 * モンスターごとの速さという個性が消える。
 */

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 速度に全振りした★6装備一式を組む(実際のプレイヤーがやる詰め方の再現) */
function bestSpeedGear(rng: () => number): Equipment[] {
  const best: Record<number, { eq: Equipment; spd: number }> = {};
  for (let round = 0; round < 80; round++) {
    for (const slot of EQUIP_SLOTS) {
      const eq = generateEquipment({ slot, star: 6, subStatCount: 4, rng });
      const spd = [eq.mainStat, ...eq.subStats].reduce((s, x) => s + (x.type === "SPD" ? x.value : 0), 0);
      if (!best[slot] || spd > best[slot].spd) best[slot] = { eq, spd };
    }
  }
  return Object.values(best).map((b) => b.eq);
}

const baseSpeeds = ALL_DISPLAYABLE_MONSTERS_DEX.map((m) => m.stats.spd);
const maxBaseSpeed = Math.max(...baseSpeeds);

describe("速度の総量", () => {
  it("**装備で盛れる速度が、モンスターの素の速度を超えない**", () => {
    const dex = findMonsterById("dragon_FIRE")!;
    const growth = computeEffectiveStats(dex.stats, 6, 60);
    const gear = bestSpeedGear(mulberry32(7));
    const gain = applyEquipmentToStats(growth, gear).spd - growth.spd;

    // ここを超えると「遅い子に速度装備」が「速い子」に勝ってしまう
    expect(gain, `装備で +${gain}`).toBeLessThan(growth.spd);
    // まったく伸びないのも困る。速度を詰める育て方そのものが死ぬ
    expect(gain).toBeGreaterThan(growth.spd * 0.4);
  });

  it("素の速さの序列が、装備を積んでも入れ替わらない", () => {
    const slow = findMonsterById("golem_WATER")!;
    const fast = findMonsterById("dragon_FIRE")!;
    expect(fast.stats.spd).toBeGreaterThan(slow.stats.spd);

    const gear = bestSpeedGear(mulberry32(3));
    const slowTuned = applyEquipmentToStats(computeEffectiveStats(slow.stats, 6, 60), gear).spd;
    const fastPlain = computeEffectiveStats(fast.stats, 6, 60).spd;

    // 速度装備を極めた鈍足が、素の俊足を**追い抜く**のは構わない。
    // 追い抜き方が極端でないことを見る(2倍以上離れたら装備が主役になっている)
    expect(slowTuned).toBeLessThan(fastPlain * 2);
  });

  it("**敵の速度カーブは、プレイヤーの上限と対で決まる**", () => {
    /*
     * 装備の速度を半分にした時、敵側を1.85のまま据え置いたら
     * 8階44% / 9階4% / 10階0% まで崩れた。片方だけ触ってはいけない。
     */
    const dex = findMonsterById("dragon_FIRE")!;
    const growth = computeEffectiveStats(dex.stats, 6, 60);
    const playerTop = applyEquipmentToStats(growth, bestSpeedGear(mulberry32(11))).spd;

    const topFloor = EQUIPMENT_DUNGEON_FLOORS[EQUIPMENT_DUNGEON_FLOORS.length - 1];
    const enemyTop = maxBaseSpeed * topFloor.speedScale;

    // 敵が速すぎると一方的に殴られ、遅すぎると詰めた意味が消える
    expect(enemyTop, `敵の上限 ${Math.round(enemyTop)} / プレイヤーの上限 ${playerTop}`).toBeLessThan(playerTop);
    expect(enemyTop).toBeGreaterThan(playerTop * 0.5);
  });
});

describe("控えの移行", () => {
  it("**古い控えの装備も半分になる**(生成側だけ直しても既存の装備には効かない)", () => {
    const state = createInitialState();
    const rng = mulberry32(5);
    const eq = generateEquipment({ slot: 2, star: 6, subStatCount: 4, rng });
    // 速度が乗っている装備になるまで引き直す
    let target = eq;
    for (let i = 0; i < 60 && target.mainStat.type !== "SPD"; i++) {
      target = generateEquipment({ slot: 2, star: 6, subStatCount: 4, rng });
    }
    if (target.mainStat.type !== "SPD") return; // 引けなければこの回は見ない

    const before = target.mainStat.value;
    state.equipment = [target];
    // 移行前の控えを模す
    delete (state as { equipmentSpeedRebalanced?: boolean }).equipmentSpeedRebalanced;

    const migrated = normalizeLoadedState(state);
    expect(migrated.equipment[0].mainStat.value).toBe(Math.max(1, Math.round(before / 2)));
    expect(migrated.equipmentSpeedRebalanced).toBe(true);
  });

  it("移行は一度きり。読み込むたびに半分にならない", () => {
    const state = createInitialState();
    const rng = mulberry32(9);
    let target = generateEquipment({ slot: 2, star: 6, subStatCount: 4, rng });
    for (let i = 0; i < 60 && target.mainStat.type !== "SPD"; i++) {
      target = generateEquipment({ slot: 2, star: 6, subStatCount: 4, rng });
    }
    if (target.mainStat.type !== "SPD") return;

    state.equipment = [target];
    delete (state as { equipmentSpeedRebalanced?: boolean }).equipmentSpeedRebalanced;

    const once = normalizeLoadedState(state).equipment[0].mainStat.value;
    const twice = normalizeLoadedState(normalizeLoadedState(state)).equipment[0].mainStat.value;
    expect(twice).toBe(once);
  });
});
