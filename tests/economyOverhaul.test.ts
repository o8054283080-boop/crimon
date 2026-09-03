import { describe, expect, it } from "vitest";
import {
  ENHANCE_COST_TABLE,
  EQUIP_MAX_LEVEL,
  EquipStar,
  enhanceEquipment,
  enhanceEquipmentCost,
  enhanceEquipmentTotalCost,
  generateEquipment,
} from "../src/core/equipment.js";
import { GOLD_DUNGEON_DAILY_LIMIT, GOLD_DUNGEON_FLOORS, GOLD_DUNGEON_FLOOR_COUNT, findGoldDungeonFloor } from "../src/data/goldDungeon.js";
import { SHOP_EQUIPMENT_PRICE, shopEquipmentPrice } from "../src/game/shop.js";
import { ABILITY_POINT_RESET_COST, TYPE_REINCARNATION_GOLD_COST } from "../src/core/monsterDevelopment.js";
import { LATENT_REAWAKENING_GOLD_COST } from "../src/game/monsterDevelopment.js";
import { CREATE_GOLD_COST } from "../src/game/monsterCreate.js";

/*
 * 経済まわりの作り直し。**依頼主が決めた数字をそのまま見張る。**
 *
 * ここに書いてある額は「バランス上こうした方がよい」で動かしてよいものではない。
 * 変えたくなったら、まず依頼主に確かめること(明示の指定)。
 */

describe("ゴールドダンジョン", () => {
  it("5階建て・1日3回のまま", () => {
    expect(GOLD_DUNGEON_FLOOR_COUNT).toBe(5);
    expect(GOLD_DUNGEON_DAILY_LIMIT).toBe(3);
  });

  it("階ごとの報酬が指定どおり", () => {
    const expected = [50_000, 100_000, 180_000, 250_000, 380_000];
    expect(GOLD_DUNGEON_FLOORS.map((floor) => floor.goldReward)).toEqual(expected);
    for (let floor = 1; floor <= GOLD_DUNGEON_FLOOR_COUNT; floor += 1) {
      // 画面が読むのはこちら。表と食い違っていないことも見る
      expect(findGoldDungeonFloor(floor)?.goldReward).toBe(expected[floor - 1]);
    }
  });

  it("上の階ほど多い(飛ばして下が得になる階が無い)", () => {
    for (let i = 1; i < GOLD_DUNGEON_FLOORS.length; i += 1) {
      expect(GOLD_DUNGEON_FLOORS[i].goldReward).toBeGreaterThan(GOLD_DUNGEON_FLOORS[i - 1].goldReward);
    }
  });
});

describe("装備強化費", () => {
  it("★3〜★6の+0→+15合計が指定どおり", () => {
    expect(enhanceEquipmentTotalCost(3)).toBe(141_000);
    expect(enhanceEquipmentTotalCost(4)).toBe(270_000);
    expect(enhanceEquipmentTotalCost(5)).toBe(878_000);
    expect(enhanceEquipmentTotalCost(6)).toBe(1_346_000);
  });

  it("★1★2は消さず、★3より十分安い", () => {
    /*
     * 序盤に拾う装備を強化できない作りにはしない(依頼主の指定)。
     * 「十分安い」の線は**★が1つ上がるごとに倍以上**に置いた。
     * ★1 35,200 → ★2 70,500 → ★3 141,000 と、素直に倍で並ぶ。
     */
    expect(enhanceEquipmentTotalCost(1)).toBeGreaterThan(0);
    expect(enhanceEquipmentTotalCost(2)).toBeGreaterThanOrEqual(enhanceEquipmentTotalCost(1) * 2);
    expect(enhanceEquipmentTotalCost(3)).toBeGreaterThanOrEqual(enhanceEquipmentTotalCost(2) * 2);
    expect(enhanceEquipmentTotalCost(3)).toBeGreaterThanOrEqual(enhanceEquipmentTotalCost(1) * 4);
  });

  it("表は+0から+15までの16段ぶんある", () => {
    for (const star of [1, 2, 3, 4, 5, 6] as EquipStar[]) {
      expect(ENHANCE_COST_TABLE[star]).toHaveLength(EQUIP_MAX_LEVEL + 1);
      expect(ENHANCE_COST_TABLE[star][0]).toBe(0);
    }
  });

  it("同じ★なら段が進んでも安くならない", () => {
    for (const star of [1, 2, 3, 4, 5, 6] as EquipStar[]) {
      const table = ENHANCE_COST_TABLE[star];
      for (let level = 2; level < table.length; level += 1) {
        expect(table[level]).toBeGreaterThanOrEqual(table[level - 1]);
      }
    }
  });

  it("同じ段なら★が上ほど高い", () => {
    for (let level = 1; level <= EQUIP_MAX_LEVEL; level += 1) {
      for (const star of [2, 3, 4, 5, 6] as EquipStar[]) {
        expect(ENHANCE_COST_TABLE[star][level]).toBeGreaterThan(ENHANCE_COST_TABLE[(star - 1) as EquipStar][level]);
      }
    }
  });

  it("次の段の額を返す(いま払う額であって、いま到達した段の額ではない)", () => {
    const equipment = generateEquipment({ slot: 1, star: 6, subStatCount: 0 });
    expect(enhanceEquipmentCost(equipment)).toBe(ENHANCE_COST_TABLE[6][1]);
    enhanceEquipment(equipment);
    expect(enhanceEquipmentCost(equipment)).toBe(ENHANCE_COST_TABLE[6][2]);
  });

  it("1段ずつ払った合計が、表の合計と一致する", () => {
    // **表示している額の積み上げと、実際に引かれる額がずれないこと**
    for (const star of [1, 2, 3, 4, 5, 6] as EquipStar[]) {
      const equipment = generateEquipment({ slot: 1, star, subStatCount: 0 });
      let paid = 0;
      for (let i = 0; i < EQUIP_MAX_LEVEL; i += 1) {
        paid += enhanceEquipmentCost(equipment);
        enhanceEquipment(equipment);
      }
      expect(paid).toBe(enhanceEquipmentTotalCost(star));
    }
  });

  it("100%成功。失敗も破壊も低下も無い", () => {
    /*
     * `enhanceEquipment` は乱数を使うが、**使うのはサブOPの伸び方だけ。**
     * 段が上がらない/下がる/消える道が1本も無いことを、
     * 極端な乱数(常に0・常に1に近い)で往復して確かめる。
     */
    for (const roll of [() => 0, () => 0.999999, Math.random]) {
      const equipment = generateEquipment({ slot: 1, star: 5, subStatCount: 4 });
      for (let level = 1; level <= EQUIP_MAX_LEVEL; level += 1) {
        expect(enhanceEquipment(equipment, roll)).toBe(true);
        expect(equipment.level).toBe(level);
        expect(equipment.subStats).toHaveLength(4);
      }
      // 上限に達したら断るだけ。壊れない
      expect(enhanceEquipment(equipment, roll)).toBe(false);
      expect(equipment.level).toBe(EQUIP_MAX_LEVEL);
    }
  });
});

describe("装備ショップの値段", () => {
  it("★6サブ4は1,000,000G", () => {
    expect(SHOP_EQUIPMENT_PRICE[6][4]).toBe(1_000_000);
  });

  it("★とサブOPの数だけで決まり、中身では変わらない", () => {
    /*
     * 同じ★・同じサブ数で中身の違う装備を並べて、値段が1つに揃うことを見る。
     * ここが割れると「高い＝当たり」になり、値段が攻略情報になってしまう。
     */
    for (const star of [1, 2, 3, 4, 5, 6] as EquipStar[]) {
      for (let subs = 0; subs <= 4; subs += 1) {
        const prices = new Set<number>();
        for (let seed = 0; seed < 40; seed += 1) {
          const equipment = generateEquipment({ slot: ((seed % 6) + 1) as 1, star, subStatCount: subs });
          prices.add(shopEquipmentPrice(equipment));
        }
        expect(prices.size, `★${star} サブ${subs} で値段が割れた`).toBe(1);
        expect([...prices][0]).toBe(SHOP_EQUIPMENT_PRICE[star][subs]);
      }
    }
  });

  it("★が上、サブが多いほど高い", () => {
    for (const star of [1, 2, 3, 4, 5, 6] as EquipStar[]) {
      const row = SHOP_EQUIPMENT_PRICE[star];
      for (let subs = 1; subs < row.length; subs += 1) expect(row[subs]).toBeGreaterThan(row[subs - 1]);
      if (star > 1) {
        for (let subs = 0; subs < row.length; subs += 1) {
          expect(row[subs]).toBeGreaterThan(SHOP_EQUIPMENT_PRICE[(star - 1) as EquipStar][subs]);
        }
      }
    }
  });

  it("強化しても値段は動かない(棚は+0で並ぶ)", () => {
    const equipment = generateEquipment({ slot: 1, star: 5, subStatCount: 2 });
    const before = shopEquipmentPrice(equipment);
    enhanceEquipment(equipment);
    expect(shopEquipmentPrice(equipment)).toBe(before);
  });
});

describe("クリエイトの費用", () => {
  it("指定どおりの額が1か所から出ている", () => {
    expect(TYPE_REINCARNATION_GOLD_COST).toBe(300_000);
    expect(ABILITY_POINT_RESET_COST).toBe(300_000);
    expect(LATENT_REAWAKENING_GOLD_COST).toBe(500_000);
    expect(CREATE_GOLD_COST).toBe(500_000);
  });
});
