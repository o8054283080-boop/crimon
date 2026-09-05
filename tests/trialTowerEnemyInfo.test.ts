import { describe, expect, it } from "vitest";
import { trialTowerEnemyInfo } from "../src/data/trialTowerEnemyInfo.js";
import { findTowerFloor } from "../src/data/trialTower.js";
import { buildDungeonEnemyTeam } from "../src/game/dungeonRunner.js";

describe("試練の塔: 敵情報", () => {
  it("60階未満では表示しない", () => {
    expect(trialTowerEnemyInfo(59)).toEqual([]);
  });

  it.each([60, 61, 69, 70, 80, 90, 99])("%i階の実戦用の顔ぶれとスキルを表示する", (floorNumber) => {
    const floor = findTowerFloor(floorNumber)!;
    const actual = buildDungeonEnemyTeam(floor).filter((_, index) => !floor.enemies[index].summonedInBattle);
    const info = trialTowerEnemyInfo(floorNumber);
    expect(info.map((enemy) => enemy.name)).toEqual(actual.map((enemy) => enemy.name.replace(/\s*【BOSS】\s*$/, "")));
    expect(info.every((enemy) => enemy.skills.length > 0)).toBe(true);
    for (let index = 0; index < actual.length; index += 1) {
      for (const skill of actual[index].skills) {
        expect(info[index].skills.concat(info[index].passives).some((shown) => shown.name === skill.name)).toBe(true);
      }
    }
  });

  it("特殊階はエンジン固有のパッシブも説明する", () => {
    expect(trialTowerEnemyInfo(60)[0].passives.map((item) => item.name)).toContain("豪魔の反撃");
    expect(trialTowerEnemyInfo(70)[0].passives.map((item) => item.name)).toContain("始祖の咆哮");
    expect(trialTowerEnemyInfo(80)[0].passives.map((item) => item.name)).toContain("聖竜の免疫");
    expect(trialTowerEnemyInfo(90)[0].passives.map((item) => item.name)).toContain("古代の狂化");
    expect(trialTowerEnemyInfo(90)[3].passives.map((item) => item.name)).toContain("狂牙の激昂");
    expect(trialTowerEnemyInfo(100)[0].passives.map((item) => item.name)).toContain("分身結界");
    expect(trialTowerEnemyInfo(100)[0].passives.map((item) => item.name)).toContain("中層免疫");
  });

  it("100階は本体のスキル4と、出現しうる分身3型をすべて表示する", () => {
    const info = trialTowerEnemyInfo(100);
    expect(info.map((enemy) => enemy.name)).toEqual([
      "クリモアーク",
      "クリモアーク・攻",
      "クリモアーク・援",
      "クリモアーク・蝕",
    ]);
    expect(info[0].skills.map((skill) => skill.name)).toContain("オーバークリエイト");
  });

  it("表示情報に能力値・装備・内部倍率キーを混ぜない", () => {
    for (let floor = 60; floor <= 100; floor += 1) {
      const serialized = JSON.stringify(trialTowerEnemyInfo(floor));
      expect(serialized).not.toMatch(/powerScale|speedScale|fixedStats|装備情報|攻撃力[0-9.]+倍/);
    }
  });
});
