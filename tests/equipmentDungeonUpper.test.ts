import { describe, expect, it, vi } from "vitest";
import { DUNGEON_FLOOR_COUNT, DUNGEON_FLOOR_STAR_WEIGHTS } from "../src/core/equipment.js";
import { dungeonFloorRarityRates } from "../src/core/equipmentRarity.js";
import { DUNGEON_STAMINA_COST } from "../src/core/fighterLevel.js";
import {
  BEAST_DUNGEON_FLOORS,
  DUNGEON_UPPER_FLOOR_COUNT,
  DUNGEON_UPPER_FLOOR_START,
  EQUIPMENT_DUNGEON_FLOORS,
  dungeonFloorHasSkillPigDrop,
  dungeonFloorPigStars,
  findDungeonFloor,
  rollDungeonReincarnationPig,
  rollDungeonSkillPig,
  rollDungeonSummonScroll,
} from "../src/data/equipmentDungeon.js";
import { SKILL_PIG, REINCARNATION_PIG, findMonsterById } from "../src/data/monsters.js";
import { buildDungeonEnemyTeam } from "../src/game/dungeonRunner.js";
import { applyDungeonClearRewards } from "../src/game/rewards.js";
import {
  createInitialState,
  getParty,
  isDungeonFloorCleared,
  markDungeonFloorCleared,
  normalizeLoadedState,
} from "../src/game/playerState.js";

/**
 * 装備ダンジョンの上位階(11・12)。
 *
 * ## ここで守るもの
 *
 *   1. 指定されたステータスが**そのまま**敵の値になる(倍率を掛けない)
 *   2. ボスを倒した時点で勝利する(魔人・魔獣とも)
 *   3. 装備★・レア度・副ドロップが指定どおり
 *   4. **1〜10階が1ミリも動いていない**
 *
 * ## なぜ倍率に乗せないのか
 *
 * `DUNGEON_FLOOR_COUNT` は階数であると同時に**倍率カーブの分母**で、
 * `powerScaleForFloor` が `COUNT - 1` で割っている。
 * 10を12にした瞬間、1〜10階すべての難易度が変わる。
 * さらに `floor === DUNGEON_FLOOR_COUNT` が10階の勝利条件とHP倍率を決めているので、
 * ここを動かすと10階が「ボス撃破で勝利」でなくなる。
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

const demon = (floor: number) => findDungeonFloor(floor, "DEMON")!;
const beast = (floor: number) => findDungeonFloor(floor, "BEAST")!;
const statsOf = (floor: number, kind: "DEMON" | "BEAST") =>
  buildDungeonEnemyTeam(kind === "BEAST" ? beast(floor) : demon(floor)).map((d) => d.stats);

describe("上位階が生成される", () => {
  it("11・12階が魔人・魔獣の両方に存在する", () => {
    expect(DUNGEON_UPPER_FLOOR_START).toBe(11);
    expect(DUNGEON_UPPER_FLOOR_COUNT).toBe(12);
    for (const floor of [11, 12]) {
      expect(demon(floor), `魔人${floor}階`).toBeDefined();
      expect(beast(floor), `魔獣${floor}階`).toBeDefined();
      expect(demon(floor).enemies).toHaveLength(3);
      expect(beast(floor).enemies).toHaveLength(3);
    }
  });

  /*
   * **倍率カーブの分母は10のまま。**ここが動くと1〜10階が全部変わる。
   * 上位階は倍率に乗らない印として powerScale / speedScale に1が入る。
   */
  it("上位階は倍率カーブに乗らない", () => {
    expect(DUNGEON_FLOOR_COUNT, "倍率カーブの分母").toBe(10);
    for (const floor of [11, 12]) {
      for (const f of [demon(floor), beast(floor)]) {
        expect(f.powerScale, `${f.name} powerScale`).toBe(1);
        expect(f.speedScale, `${f.name} speedScale`).toBe(1);
      }
    }
  });

  it("11階は電気・草、12階は草・光(既存の属性の続き)", () => {
    expect(demon(11).enemies.every((e) => e.element === "ELECTRIC")).toBe(true);
    expect(demon(12).enemies.every((e) => e.element === "GRASS")).toBe(true);
    expect(beast(11).enemies.every((e) => e.element === "GRASS")).toBe(true);
    expect(beast(12).enemies.every((e) => e.element === "LIGHT")).toBe(true);
  });

  it("顔ぶれは10階と同じ(魔人・クリスタル・呪晶 / 魔獣・護獣・牙獣)", () => {
    for (const floor of [11, 12]) {
      expect(demon(floor).enemies.map((e) => e.templateId)).toEqual(demon(10).enemies.map((e) => e.templateId));
      expect(beast(floor).enemies.map((e) => e.templateId)).toEqual(beast(10).enemies.map((e) => e.templateId));
    }
  });
});

describe("指定されたステータスがそのまま入る", () => {
  it("魔人11階", () => {
    expect(statsOf(11, "DEMON")).toMatchObject([
      { hp: 410_000, atk: 6_100, def: 3_250, spd: 200 },
      { hp: 120_000, def: 2_250, spd: 145 },
      { hp: 115_000, atk: 2_550, def: 1_750, spd: 132 },
    ]);
  });

  it("魔人12階(クリスタルのSPDは165)", () => {
    const stats = statsOf(12, "DEMON");
    expect(stats).toMatchObject([
      { hp: 485_000, atk: 7_000, def: 3_600, spd: 204 },
      { hp: 140_000, def: 2_500, spd: 165 },
      { hp: 135_000, atk: 2_900, def: 1_950, spd: 136 },
    ]);
    // **165は意図した調整値。**10階相当(122)まで落ちていないこと
    expect(stats[1].spd, "12階クリスタルのSPD").toBe(165);
    expect(stats[1].spd).toBeGreaterThan(statsOf(10, "DEMON")[1].spd);
  });

  it("魔獣11階", () => {
    expect(statsOf(11, "BEAST")).toMatchObject([
      { hp: 420_000, atk: 6_400, def: 4_050, spd: 210 },
      { hp: 235_000, atk: 1_700, def: 4_300, spd: 182 },
      { hp: 145_000, atk: 3_650, def: 2_250, spd: 180 },
    ]);
  });

  it("魔獣12階(ボスATKは7,500)", () => {
    const stats = statsOf(12, "BEAST");
    expect(stats).toMatchObject([
      { hp: 500_000, atk: 7_500, def: 4_500, spd: 215 },
      { hp: 270_000, atk: 1_850, def: 4_650, spd: 187 },
      { hp: 165_000, atk: 4_050, def: 2_500, spd: 185 },
    ]);
    // 安全側へ下げない、と指定された値
    expect(stats[0].atk, "魔獣12階ボスのATK").toBe(7_500);
  });

  it("ボスのATKが指定値そのもの", () => {
    expect(statsOf(11, "DEMON")[0].atk).toBe(6_100);
    expect(statsOf(12, "DEMON")[0].atk).toBe(7_000);
    expect(statsOf(11, "BEAST")[0].atk).toBe(6_400);
    expect(statsOf(12, "BEAST")[0].atk).toBe(7_500);
  });

  /*
   * **指定しなかった能力を「素の値」で置くと下がる。**
   * 10階は powerScale 2.734 が掛かってクリスタルのATKが1,394だが、
   * 上位階は倍率に乗らないのでATKを書かないと図鑑素の691まで落ちる。
   * 支援役なので伸ばす理由は無いが、**10階より弱くする理由も無い。**
   */
  it("クリスタルのATKは10階より下がらない", () => {
    const base = statsOf(10, "DEMON")[1].atk;
    for (const floor of [11, 12]) {
      expect(statsOf(floor, "DEMON")[1].atk, `${floor}階クリスタルのATK`).toBeGreaterThanOrEqual(base);
    }
  });

  it("HP・ATK・DEF・SPDは階を上がるほど強くなる", () => {
    for (const kind of ["DEMON", "BEAST"] as const) {
      for (const floor of [11, 12]) {
        const prev = statsOf(floor - 1, kind)[0];
        const cur = statsOf(floor, kind)[0];
        for (const key of ["hp", "atk", "def", "spd"] as const) {
          // 11階の魔人DEFだけは指定が10階より低い(依頼主の指定値)ので、そこは見ない
          if (kind === "DEMON" && floor === 11 && key === "def") continue;
          expect(cur[key], `${kind}${floor}階ボスの${key}`).toBeGreaterThan(prev[key]);
        }
      }
    }
  });
});

describe("ボスを倒した時点で勝利する", () => {
  it("魔人・魔獣とも、勝利条件はボス1体だけ", () => {
    for (const floor of [11, 12]) {
      for (const f of [demon(floor), beast(floor)]) {
        const victory = f.enemies.filter((e) => e.victoryTarget);
        expect(victory, `${f.name} の勝利条件`).toHaveLength(1);
        expect(victory[0].isBoss, `${f.name} の勝利条件はボス`).toBe(true);
      }
    }
  });

  it("戦闘定義にも勝利条件が乗る", () => {
    for (const floor of [11, 12]) {
      for (const kind of ["DEMON", "BEAST"] as const) {
        const team = buildDungeonEnemyTeam(kind === "BEAST" ? beast(floor) : demon(floor));
        expect(team.filter((d) => d.victoryTarget)).toHaveLength(1);
        expect(team[0].victoryTarget).toBe(true);
      }
    }
  });

  /*
   * ボス特性(7回攻撃を受けると1.4倍反撃、15%追加ターン)は図鑑のまま。
   * 階の側で `bossTraits` を指定しなければ `dex.bossTraits` が使われる。
   */
  it("ボス特性は10階と同じものが乗る", () => {
    for (const floor of [11, 12]) {
      for (const kind of ["DEMON", "BEAST"] as const) {
        const at = (f: number) => buildDungeonEnemyTeam(kind === "BEAST" ? beast(f) : demon(f))[0].bossTraits;
        expect(at(floor), `${kind}${floor}階のボス特性`).toEqual(at(10));
      }
    }
  });

  it("スキルも10階と同じ(差し替えていない)", () => {
    for (const floor of [11, 12]) {
      for (const kind of ["DEMON", "BEAST"] as const) {
        const at = (f: number) => buildDungeonEnemyTeam(kind === "BEAST" ? beast(f) : demon(f)).map((d) => d.skills.map((s) => s.name));
        expect(at(floor), `${kind}${floor}階のスキル`).toEqual(at(10));
      }
    }
  });
});

describe("装備の★とレア度", () => {
  it("11階は★5 55% / ★6 45%、12階は★5 40% / ★6 60%", () => {
    expect(DUNGEON_FLOOR_STAR_WEIGHTS[11]).toEqual([{ value: 5, weight: 55 }, { value: 6, weight: 45 }]);
    expect(DUNGEON_FLOOR_STAR_WEIGHTS[12]).toEqual([{ value: 5, weight: 40 }, { value: 6, weight: 60 }]);
  });

  it("★4以下は出ない", () => {
    for (const floor of [11, 12]) {
      const stars = DUNGEON_FLOOR_STAR_WEIGHTS[floor].map((w) => w.value);
      expect(Math.min(...stars), `${floor}階の最低★`).toBe(5);
    }
  });

  it("★の確率の合計は必ず100%になる", () => {
    for (const floor of [11, 12]) {
      const total = DUNGEON_FLOOR_STAR_WEIGHTS[floor].reduce((sum, w) => sum + w.weight, 0);
      expect(total, `${floor}階の★合計`).toBe(100);
    }
  });

  it("レア度は 11階 6/30/38/26%、12階 3/25/40/32%", () => {
    const pick = (floor: number) => Object.fromEntries(dungeonFloorRarityRates(floor).map((r) => [r.rarity, r.percent]));
    expect(pick(11)).toMatchObject({ NORMAL: 0, RARE: 6, HERO: 30, LEGEND: 38, EPIC: 26 });
    expect(pick(12)).toMatchObject({ NORMAL: 0, RARE: 3, HERO: 25, LEGEND: 40, EPIC: 32 });
  });

  it("レア度の合計も100%", () => {
    for (const floor of [11, 12]) {
      const total = dungeonFloorRarityRates(floor).reduce((sum, r) => sum + r.percent, 0);
      expect(total, `${floor}階のレア度合計`).toBeCloseTo(100, 5);
    }
  });
});

describe("副ドロップ", () => {
  /** 統計で確かめる。乱数は固定して再現できるようにする */
  const rateOf = (seed: number, n: number, run: (rng: () => number) => boolean): number => {
    const rng = mulberry32(seed);
    let count = 0;
    for (let i = 0; i < n; i += 1) if (run(rng)) count += 1;
    return count / n;
  };

  it("召喚の書は11階7%・12階10%", () => {
    expect(rateOf(11, 40_000, (rng) => rollDungeonSummonScroll(rng, 11))).toBeCloseTo(0.07, 2);
    expect(rateOf(12, 40_000, (rng) => rollDungeonSummonScroll(rng, 12))).toBeCloseTo(0.10, 2);
  });

  it("転生ピッグは11階が★3 7%・★4 0.8%、12階が★3 5%・★4 2%", () => {
    for (const [floor, want3, want4] of [[11, 0.07, 0.008], [12, 0.05, 0.02]] as const) {
      const rng = mulberry32(100 + floor);
      const n = 200_000;
      let three = 0;
      let four = 0;
      for (let i = 0; i < n; i += 1) {
        const pig = rollDungeonReincarnationPig(findDungeonFloor(floor, "DEMON")!, rng);
        if (pig?.star === 3) three += 1;
        if (pig?.star === 4) four += 1;
      }
      expect(three / n, `${floor}階の★3`).toBeCloseTo(want3, 2);
      expect(four / n, `${floor}階の★4`).toBeCloseTo(want4, 3);
    }
  });

  it("スキルピッグは11階0.2%・12階0.5%", () => {
    for (const [floor, want] of [[11, 0.002], [12, 0.005]] as const) {
      const rng = mulberry32(300 + floor);
      const n = 400_000;
      let hit = 0;
      for (let i = 0; i < n; i += 1) if (rollDungeonSkillPig(findDungeonFloor(floor, "DEMON")!, rng)) hit += 1;
      expect(hit / n, `${floor}階のスキルピッグ`).toBeCloseTo(want, 3);
    }
  });

  /*
   * **名前で素材の種類を見分けない。**図鑑の正式なデータから引き、
   * templateId が一致することで確かめる(判定側も templateId を見ている)。
   */
  it("スキルピッグは図鑑の正式なデータから出る", () => {
    const rng = () => 0;
    const drop = rollDungeonSkillPig(findDungeonFloor(12, "DEMON")!, rng);
    expect(drop).not.toBeNull();
    expect(findMonsterById(drop!.dexId)?.templateId).toBe(SKILL_PIG.templateId);
  });

  it("転生ピッグも図鑑の正式なデータから出る", () => {
    const drop = rollDungeonReincarnationPig(findDungeonFloor(11, "DEMON")!, () => 0);
    expect(drop).not.toBeNull();
    expect(findMonsterById(drop!.dexId)?.templateId).toBe(REINCARNATION_PIG.templateId);
  });

  it("スキルピッグは上位階でしか出ない", () => {
    for (let floor = 1; floor <= 10; floor += 1) {
      expect(dungeonFloorHasSkillPigDrop(floor), `${floor}階`).toBe(false);
      expect(rollDungeonSkillPig(findDungeonFloor(floor, "DEMON")!, () => 0)).toBeNull();
    }
    expect(dungeonFloorHasSkillPigDrop(11)).toBe(true);
    expect(dungeonFloorHasSkillPigDrop(12)).toBe(true);
  });

  it("画面に出すピッグの★は、抽選と同じ表から来る", () => {
    expect(dungeonFloorPigStars(6)).toEqual([2]);
    expect(dungeonFloorPigStars(10)).toEqual([3]);
    expect(dungeonFloorPigStars(11)).toEqual([3, 4]);
    expect(dungeonFloorPigStars(12)).toEqual([3, 4]);
  });
});

describe("スタミナ", () => {
  it("11・12階も共通の10で、専用の定数を作っていない", () => {
    expect(DUNGEON_STAMINA_COST).toBe(10);
  });
});

describe("階層解放", () => {
  it("10階クリアで11階、11階クリアで12階が開く(魔人)", () => {
    const state = createInitialState();
    expect(isDungeonFloorCleared(state, 10, "DEMON")).toBe(false);
    markDungeonFloorCleared(state, 10, "DEMON");
    expect(isDungeonFloorCleared(state, 10, "DEMON"), "11階の解放条件").toBe(true);
    expect(isDungeonFloorCleared(state, 11, "DEMON"), "12階はまだ").toBe(false);
    markDungeonFloorCleared(state, 11, "DEMON");
    expect(isDungeonFloorCleared(state, 11, "DEMON")).toBe(true);
  });

  it("魔人と魔獣は独立して進む", () => {
    const state = createInitialState();
    markDungeonFloorCleared(state, 11, "DEMON");
    expect(isDungeonFloorCleared(state, 11, "DEMON")).toBe(true);
    expect(isDungeonFloorCleared(state, 11, "BEAST"), "魔獣は別勘定").toBe(false);
  });

  /*
   * **既に10階を周回している人が、1階からやり直しにならないこと。**
   * 上位階を足したせいで既存の記録が消えると、画面上は全階が閉じて見える。
   */
  it("既存セーブで10階クリア済みなら、更新後も10階クリア済みのまま", () => {
    const state = createInitialState();
    state.clearedDungeonFloors = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    state.clearedBeastDungeonFloors = [1, 2, 3];
    const loaded = normalizeLoadedState(state);
    expect(loaded.clearedDungeonFloors).toContain(10);
    expect(isDungeonFloorCleared(loaded, 10, "DEMON"), "11階が開く条件を満たしたまま").toBe(true);
    expect(isDungeonFloorCleared(loaded, 3, "BEAST")).toBe(true);
    expect(isDungeonFloorCleared(loaded, 11, "DEMON"), "勝手に開いてはいない").toBe(false);
  });

  it("上位階を知らない古いセーブでも落ちない", () => {
    const state = createInitialState();
    delete (state as { clearedBeastDungeonFloors?: number[] }).clearedBeastDungeonFloors;
    expect(() => normalizeLoadedState(state)).not.toThrow();
  });
});

describe("クリア報酬が保存される", () => {
  it("11・12階のクリアで装備・ゴールドが入り、クリア済みとして残る", () => {
    for (const floor of [11, 12]) {
      for (const kind of ["DEMON", "BEAST"] as const) {
        const state = createInitialState();
        const before = state.gold;
        const f = kind === "BEAST" ? beast(floor) : demon(floor);
        const reward = applyDungeonClearRewards(state, f, getParty(state));
        expect(reward.equipmentDrop, `${f.name} の装備ドロップ`).toBeTruthy();
        expect(state.equipment.length, `${f.name} の所持装備`).toBe(1);
        expect(state.gold - before).toBe(f.goldReward);
        expect(isDungeonFloorCleared(state, floor, kind), `${f.name} のクリア記録`).toBe(true);
      }
    }
  });

  /*
   * スキルピッグが当たった時、**転生ピッグとは別枠**で手元に入ること。
   * 混ぜるとランクアップ素材として数えられてしまう。
   */
  it("スキルピッグが当たると、手持ちへ正式なスキルピッグが入る", () => {
    const spy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const state = createInitialState();
      const reward = applyDungeonClearRewards(state, demon(12), getParty(state));
      expect(reward.skillPigDrop, "スキルピッグの記録").toBeTruthy();
      const added = state.monsters.find((m) => m.id === state.monsters[state.monsters.length - 1].id)!;
      expect(findMonsterById(reward.skillPigDrop!.dexId)?.templateId).toBe(SKILL_PIG.templateId);
      expect(state.monsters.some((m) => findMonsterById(m.dexId)?.templateId === SKILL_PIG.templateId)).toBe(true);
      expect(added).toBeDefined();
    } finally {
      spy.mockRestore();
    }
  });

  it("1〜10階のクリアではスキルピッグは入らない", () => {
    const spy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const state = createInitialState();
      const reward = applyDungeonClearRewards(state, demon(10), getParty(state));
      expect(reward.skillPigDrop ?? null).toBeNull();
      expect(state.monsters.some((m) => findMonsterById(m.dexId)?.templateId === SKILL_PIG.templateId)).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("1〜10階を壊していない", () => {
  /*
   * **ここが落ちたら、上位階の追加が既存階へ漏れている。**
   * 敵の実効ステータス・勝利条件・倍率・ゴールドを丸ごと突き合わせる。
   */
  it("既存階の敵・倍率・勝利条件・ゴールドが据え置き", () => {
    const digest: string[] = [];
    for (const kind of ["DEMON", "BEAST"] as const) {
      const floors = kind === "BEAST" ? BEAST_DUNGEON_FLOORS : EQUIPMENT_DUNGEON_FLOORS;
      for (const f of floors.filter((f) => f.floor <= 10)) {
        const team = buildDungeonEnemyTeam(f);
        digest.push(
          `${kind}${f.floor} ps=${f.powerScale.toFixed(6)} ss=${f.speedScale.toFixed(6)} gold=${f.goldReward} `
          + team.map((d) => `${d.stats.hp}/${d.stats.atk}/${d.stats.def}/${d.stats.spd}/${d.victoryTarget ?? false}`).join(" "),
        );
      }
    }
    expect(digest).toMatchSnapshot();
  });

  it("1〜10階の★ドロップ率は据え置き", () => {
    expect(DUNGEON_FLOOR_STAR_WEIGHTS[10]).toEqual([{ value: 5, weight: 68 }, { value: 6, weight: 32 }]);
    expect(DUNGEON_FLOOR_STAR_WEIGHTS[9]).toEqual([
      { value: 4, weight: 32 },
      { value: 5, weight: 53 },
      { value: 6, weight: 15 },
    ]);
  });

  it("1〜10階の副ドロップは従来どおり(召喚の書5%・転生ピッグ10%)", () => {
    const rng = mulberry32(7);
    let scroll = 0;
    const n = 40_000;
    for (let i = 0; i < n; i += 1) if (rollDungeonSummonScroll(rng)) scroll += 1;
    expect(scroll / n, "召喚の書").toBeCloseTo(0.05, 2);

    const rng2 = mulberry32(8);
    let pig = 0;
    for (let i = 0; i < n; i += 1) if (rollDungeonReincarnationPig(demon(10), rng2)) pig += 1;
    expect(pig / n, "転生ピッグ").toBeCloseTo(0.10, 2);
  });
});
