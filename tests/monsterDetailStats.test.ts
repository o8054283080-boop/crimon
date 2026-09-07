import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createMonsterInstance, toBattleDefinition } from "../src/core/monsterInstance.js";
import { findMonsterById } from "../src/data/monsters.js";
import { detailGainNote } from "../src/web/views/monsters.js";

/**
 * モンスター詳細に出る数字。
 *
 * **長いあいだ「レベル成長 + 装備」しか見ていなかった。**
 * タイプ転生・能力ポイント・才能覚醒は戦闘には効いているのに詳細の数字が
 * 動かず、「タイプ転生のクリ率アップは本当に効いているのか」という
 * 指摘を受けた(効いてはいたが、確かめる手段が画面に無かった)。
 */

const SOURCE = readFileSync(new URL("../src/web/views/monsters.ts", import.meta.url), "utf8");

describe("詳細の数字は戦闘と同じ計算で出す", () => {
  it("実効値は toBattleDefinition から取る", () => {
    const at = SOURCE.indexOf("function renderDetail");
    expect(at, "renderDetail が無い").toBeGreaterThan(-1);
    const body = SOURCE.slice(at, at + 2000);
    expect(body, "戦闘と同じ計算を使っていない").toContain("toBattleDefinition(instance, dex, equippedItems)");
    /*
     * **レベル成長＋装備だけの計算に戻さない。**
     * これを実効値に使うと、育てたぶんが画面から消える。
     */
    expect(body, "装備だけの計算が実効値に戻っている").not.toContain("applyEquipmentToStats(growthStats");
  });

  it("タイプ転生をすると、クリ率の実効値が動く", () => {
    const dex = findMonsterById("knight_FIRE");
    if (!dex) throw new Error("図鑑にいない");
    const monster = createMonsterInstance("knight_FIRE", 6);
    monster.level = 40;

    const before = toBattleDefinition(monster, dex).stats.criRate;
    monster.development.type = "ATTACK";
    const after = toBattleDefinition(monster, dex).stats.criRate;

    // 攻撃タイプはクリ率 +10pt
    expect(after - before).toBeCloseTo(0.10, 5);
  });
});

describe("緑字が何の補正かを言う", () => {
  it("何も育てていなければ「なし」", () => {
    const monster = createMonsterInstance("knight_FIRE", 3);
    expect(detailGainNote(monster, 0)).toBe("育成・装備の補正：なし");
  });

  /*
   * **ここが今回の穴。**タイプ転生しただけの個体で「装備補正：なし」と
   * 書いておきながら、数字は動く(動くようにした)。何が足されたのかを言う。
   */
  it("タイプ転生しただけでも、その旨を出す", () => {
    const monster = createMonsterInstance("knight_FIRE", 6);
    monster.development.type = "ATTACK";
    expect(detailGainNote(monster, 0)).toContain("タイプ");
  });

  it("装備・能力pt・才能も、足したものだけ並べる", () => {
    const monster = createMonsterInstance("knight_FIRE", 6);
    monster.development.type = "HP";
    monster.development.abilityPoints.atk = 5;
    if (monster.development.talents) monster.development.talents.unlockedPoints = 2;

    const note = detailGainNote(monster, 3);
    expect(note).toContain("装備3枠");
    expect(note).toContain("タイプ");
    expect(note).toContain("能力pt");
    expect(note).toContain("才能");
  });
});
