import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { EQUIPMENT_DUNGEON_FLOORS, BEAST_DUNGEON_FLOORS } from "../src/data/equipmentDungeon.js";
import { findTowerFloor } from "../src/data/trialTower.js";
import { buildDungeonEnemyTeam } from "../src/game/dungeonRunner.js";

/*
 * その階の主を、大きく・真ん中に立たせる仕掛けの見張り。
 *
 * ## 型チェックもテストも、画面から切れたことを教えてくれない
 *
 * 実際にここで一度やっている。主を1.3倍にして「真ん中の段」へ置いたら、
 * 段と列が連動しているせいで**外側の列に来て、画面の右端から56pxはみ出した**
 * (390px幅・装備ダンジョン1階で実測)。倍率も席番号も型としては正しいまま。
 *
 * 目で見るのが一番だが、毎回見るとは限らない。数で押さえられるところは押さえる。
 */

const STAGE_SOURCE = readFileSync("src/web/three/battleStage.ts", "utf8");
const SPRITE_SOURCE = readFileSync("src/web/three/spriteAvatar.ts", "utf8");

/** `const NAME = 1.23;` の形の定数を、ソースから読む */
function constantOf(source: string, name: string): number {
  const found = new RegExp(`const ${name} = ([0-9.]+);`).exec(source);
  expect(found, `${name} が見つからない`).not.toBeNull();
  return Number(found![1]);
}

const BOSS_BODY_SCALE = constantOf(STAGE_SOURCE, "BOSS_BODY_SCALE");
const TILT_COS = constantOf(STAGE_SOURCE, "TILT_COS");
const LANE_INNER = constantOf(STAGE_SOURCE, "LANE_INNER");
const LANE_GAP = constantOf(STAGE_SOURCE, "LANE_GAP");
const SPRITE_HALF_WIDTH = constantOf(STAGE_SOURCE, "SPRITE_HALF_WIDTH");
const SPRITE_SCALE = constantOf(SPRITE_SOURCE, "SPRITE_SCALE");
/** 役割の背丈でいちばん高いもの(ボス) */
const TALLEST_ROLE_HEIGHT = 2.95;

describe("主の大きさは、盤面の枠を広げずに収まる", () => {
  it("**枠の天井を上げなくてよい。**上げると取り巻きが縮む", () => {
    /*
     * 枠の天井は `SPRITE_MAX_HEIGHT / TILT_COS`。見下ろし角ぶんの割り戻しが
     * そのまま余裕として効いているので、1/TILT_COS 倍までは天井に触れない。
     *
     * ここを超える倍率にしたくなったら、天井も一緒に上げることになる。
     * **その時は必ず取り巻きの大きさを測り直すこと。**
     * 一度1.3倍に上げてみて、カメラが引いて取り巻きが4.2%縮んだ
     * (味方の段の間隔が実測111.7px → 107.0px)。
     */
    expect(BOSS_BODY_SCALE).toBeLessThanOrEqual(1 / TILT_COS);
  });

  it("いちばん背の高い役割を大きくしても、天井に届かない", () => {
    const bossHeight = TALLEST_ROLE_HEIGHT * SPRITE_SCALE * BOSS_BODY_SCALE;
    const ceiling = TALLEST_ROLE_HEIGHT * SPRITE_SCALE / TILT_COS;
    expect(bossHeight).toBeLessThan(ceiling);
  });

  it("**内側の列なら横も収まる。外側の列だと収まらない**", () => {
    /*
     * 枠の横幅は `maxAbsX + SPRITE_HALF_WIDTH` で、`maxAbsX` は外側の列。
     * 主は1.3倍ぶん幅も広いので、外側の列に立つと枠からはみ出す。
     * ここが `bossStandPosition` が内側の列へ寄せている理由そのもの。
     */
    const halfWidth = (LANE_INNER + LANE_GAP) + SPRITE_HALF_WIDTH;
    const bossHalfWidth = SPRITE_HALF_WIDTH * BOSS_BODY_SCALE;
    expect(LANE_INNER + bossHalfWidth).toBeLessThanOrEqual(halfWidth);
    expect((LANE_INNER + LANE_GAP) + bossHalfWidth).toBeGreaterThan(halfWidth);
  });
});

describe("主を見分ける印は、盤面まで届いている", () => {
  it("主は段だけ真ん中で、列は内側(実装がその形になっている)", () => {
    // 席の入れ替えと、列の置き直しの両方が要る。片方だけでは画面から切れる
    expect(STAGE_SOURCE).toContain("function slotOrderWithBossCentered");
    expect(STAGE_SOURCE).toContain("function bossStandPosition");
    // 組み直し(画面比が変わった時)の側でも列を置き直している
    expect(STAGE_SOURCE).toContain("entry.isBoss ? bossStandPosition(seat, laneInner) : seat");
  });

  it("大きさは2Dの絵と3Dの骨格の両方へ渡している", () => {
    /*
     * 種族ごとに2Dか3Dかが変わる(`avatarFactory.ts` が絵の有無で選ぶ)。
     * 片方だけに渡すと、**絵のある主だけ大きくなる**という揃わない出方をする。
     */
    expect(readFileSync("src/web/three/spriteAvatar.ts", "utf8")).toContain("bodyScale");
    expect(readFileSync("src/web/three/monsterAvatar.ts", "utf8")).toContain("bodyScale");
    expect(readFileSync("src/web/three/avatarFactory.ts", "utf8")).toContain("bodyScale");
  });

  it("階のデータの `isBoss` が、戦闘用の定義まで運ばれている", () => {
    // ここが抜けると、盤面はどれが主なのかを知りようがない
    const floor = findTowerFloor(90)!;
    const team = buildDungeonEnemyTeam(floor);
    expect(team.filter((def) => def.isBoss)).toHaveLength(1);
    expect(team[0].isBoss).toBe(true);
    expect(team[0].name).toContain("古代ネメシス");
  });
});

describe("主の居る階には、主がちょうど1体だけ居る", () => {
  const towerBossFloors = [60, 70, 80, 90, 100];

  it.each(towerBossFloors)("試練の塔%d階", (floor) => {
    const team = buildDungeonEnemyTeam(findTowerFloor(floor)!);
    expect(team.filter((def) => def.isBoss)).toHaveLength(1);
  });

  it("装備ダンジョンは全10階に1体ずつ", () => {
    for (const floor of EQUIPMENT_DUNGEON_FLOORS) {
      expect(buildDungeonEnemyTeam(floor).filter((def) => def.isBoss), floor.name).toHaveLength(1);
    }
  });

  it("魔獣のダンジョンも全階に1体ずつ", () => {
    for (const floor of BEAST_DUNGEON_FLOORS) {
      expect(buildDungeonEnemyTeam(floor).filter((def) => def.isBoss), floor.name).toHaveLength(1);
    }
  });

  it("**1〜50階の通常の階には主が居ない**(全員同じ大きさのまま)", () => {
    for (const floor of [1, 7, 23, 44, 49]) {
      expect(buildDungeonEnemyTeam(findTowerFloor(floor)!).filter((def) => def.isBoss), `${floor}階`).toHaveLength(0);
    }
  });
});
