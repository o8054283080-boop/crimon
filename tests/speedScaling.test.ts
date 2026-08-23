import { describe, expect, it } from "vitest";
import { EQUIPMENT_DUNGEON_FLOORS } from "../src/data/equipmentDungeon.js";
import { GOLD_DUNGEON_FLOORS } from "../src/data/goldDungeon.js";
import { LEVEL_DUNGEON_DEFS } from "../src/data/levelDungeon.js";
import { STAGES } from "../src/data/stages.js";

/**
 * 敵の速度が場所ごとにどこまで伸びるかの取り決め。
 *
 * `powerScale` はHP・攻撃・防御にしか掛からず、**速度だけが据え置き**だった。
 * プレイヤー側は★6装備の副効果を速度に寄せると300を超えるので、
 * 終盤では一方的に何度も動ける状態になっていた。
 *
 * 場所ごとに別のカーブを持たせてある。**装備ダンジョンがいちばん急**で、
 * ほかはそれより緩い。装備を詰めた人が挑む場所と、
 * 育てるために通う場所・物語を進める場所を同じ厳しさにしてはいけない。
 */

const equipTop = EQUIPMENT_DUNGEON_FLOORS[EQUIPMENT_DUNGEON_FLOORS.length - 1].speedScale;

describe("敵の速度カーブ", () => {
  it("どの場所も、最初は等倍から始まる", () => {
    expect(EQUIPMENT_DUNGEON_FLOORS[0].speedScale).toBe(1);
    expect(GOLD_DUNGEON_FLOORS[0].speedScale).toBe(1);
    expect(LEVEL_DUNGEON_DEFS[0].speedScale).toBe(1);
    expect(STAGES[0].waves[0].speedScale).toBe(1);
  });

  it("**装備ダンジョンがいちばん急で、ほかはそれより弱い**", () => {
    const stageTop = STAGES[STAGES.length - 1].waves[0].speedScale;
    const goldTop = GOLD_DUNGEON_FLOORS[GOLD_DUNGEON_FLOORS.length - 1].speedScale;
    const levelTop = LEVEL_DUNGEON_DEFS[LEVEL_DUNGEON_DEFS.length - 1].speedScale;

    expect(stageTop, "ステージ").toBeLessThan(equipTop);
    expect(goldTop, "ゴールド").toBeLessThan(equipTop);
    expect(levelTop, "レベル上げ").toBeLessThan(equipTop);
  });

  it("進むほど速くなる(どの場所でも後退しない)", () => {
    const series: [string, number[]][] = [
      ["装備ダンジョン", EQUIPMENT_DUNGEON_FLOORS.map((f) => f.speedScale)],
      ["ゴールド", GOLD_DUNGEON_FLOORS.map((f) => f.speedScale)],
      ["レベル上げ", LEVEL_DUNGEON_DEFS.map((d) => d.speedScale)],
      ["ステージ", STAGES.map((s) => s.waves[0].speedScale)],
    ];
    for (const [name, values] of series) {
      for (let i = 1; i < values.length; i++) {
        expect(values[i], `${name} ${i + 1}番目`).toBeGreaterThanOrEqual(values[i - 1]);
      }
    }
  });

  it("**速度はHPや攻撃力ほど急には伸ばさない**", () => {
    // 速度は手番の数に直結する。同じ勢いで伸ばすと、こちらが動く前に
    // 一方的に殴られる展開になる
    const first = EQUIPMENT_DUNGEON_FLOORS[0];
    const last = EQUIPMENT_DUNGEON_FLOORS[EQUIPMENT_DUNGEON_FLOORS.length - 1];
    expect(last.speedScale / first.speedScale).toBeLessThan(last.powerScale / first.powerScale);
  });

  it("ステージの速度倍率は、章をまたいでも巻き戻らない", () => {
    // 章ごとに作り直す実装だと、章の頭で1.0へ戻ってしまう
    const all = STAGES.flatMap((s) => s.waves.map((w) => w.speedScale));
    for (let i = 1; i < all.length; i++) {
      expect(all[i]).toBeGreaterThanOrEqual(all[i - 1]);
    }
  });
});
