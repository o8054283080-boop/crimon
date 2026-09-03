import { describe, expect, it } from "vitest";
import { createMonsterInstance } from "../src/core/monsterInstance.js";
import { ABILITY_POINT_RESET_COST } from "../src/core/monsterDevelopment.js";
import {
  abilityPointsConfirmed,
  confirmAbilityPoints,
  resetAbilityPoints,
  setAbilityPoint,
  usedAbilityPoints,
} from "../src/game/monsterDevelopment.js";
import { applyRankUp } from "../src/game/progression.js";
import { createInitialState, normalizeLoadedState } from "../src/game/playerState.js";

/*
 * 能力付与の無料振り直し。
 *
 * ## 実際にあった穴
 *
 * 画面は能力ごとの `<input type="range">` で、動かすたびに `setAbilityPoint` を呼ぶ。
 * その `setAbilityPoint` が**下げる方向も素通し**していたので、
 * HPを100から0へ戻して、その100を攻撃へ移す、が**無料で何度でも**できた。
 * 有料のリセットは、隣に回り道がある限り誰も使わない。
 *
 * 塞ぎ方は「配り終えたら確定する」。確定するまでは何度でも自由、
 * **確定した後は有料のリセットでしか動かせない。**
 */

describe("配分が終わるまでは自由", () => {
  it("確定前は、下げる向きにも動かせる", () => {
    const monster = createMonsterInstance("slime_FIRE", 6);
    expect(setAbilityPoint(monster, "hp", 100)).toBe(true);
    expect(setAbilityPoint(monster, "hp", 0)).toBe(true);
    expect(setAbilityPoint(monster, "atk", 100)).toBe(true);
    expect(usedAbilityPoints(monster.development.abilityPoints)).toBe(100);
    expect(abilityPointsConfirmed(monster)).toBe(false);
  });

  it("上限を超える配分は断る", () => {
    const monster = createMonsterInstance("slime_FIRE", 5);
    expect(setAbilityPoint(monster, "hp", 50)).toBe(true);
    expect(setAbilityPoint(monster, "atk", 1)).toBe(false);
    expect(setAbilityPoint(monster, "hp", -1)).toBe(false);
    expect(setAbilityPoint(monster, "hp", 1.5)).toBe(false);
  });
});

describe("確定した後は有料でしか動かせない", () => {
  it("確定すると、どちらの向きにも動かせなくなる", () => {
    const monster = createMonsterInstance("slime_FIRE", 6);
    setAbilityPoint(monster, "hp", 100);
    expect(confirmAbilityPoints(monster)).toBe(true);
    expect(abilityPointsConfirmed(monster)).toBe(true);

    // **これが塞ぎたかった動き**
    expect(setAbilityPoint(monster, "hp", 0)).toBe(false);
    expect(setAbilityPoint(monster, "atk", 100)).toBe(false);
    expect(monster.development.abilityPoints.hp).toBe(100);
  });

  it("確定は1回だけ。1点も振っていないものは確定させない", () => {
    const monster = createMonsterInstance("slime_FIRE", 6);
    expect(confirmAbilityPoints(monster)).toBe(false);
    setAbilityPoint(monster, "def", 10);
    expect(confirmAbilityPoints(monster)).toBe(true);
    expect(confirmAbilityPoints(monster)).toBe(false);
  });

  it("リセット代を払うと、また無料で配れる", () => {
    const monster = createMonsterInstance("slime_FIRE", 6);
    setAbilityPoint(monster, "hp", 100);
    confirmAbilityPoints(monster);
    const wallet = { gold: ABILITY_POINT_RESET_COST };
    expect(resetAbilityPoints(monster, wallet)).toBe(true);
    expect(wallet.gold).toBe(0);
    expect(abilityPointsConfirmed(monster)).toBe(false);
    expect(setAbilityPoint(monster, "atk", 100)).toBe(true);
  });

  it("リセット代が足りなければ、印も配分もそのまま", () => {
    const monster = createMonsterInstance("slime_FIRE", 6);
    setAbilityPoint(monster, "hp", 100);
    confirmAbilityPoints(monster);
    const wallet = { gold: ABILITY_POINT_RESET_COST - 1 };
    expect(resetAbilityPoints(monster, wallet)).toBe(false);
    expect(wallet.gold).toBe(ABILITY_POINT_RESET_COST - 1);
    expect(abilityPointsConfirmed(monster)).toBe(true);
    expect(setAbilityPoint(monster, "atk", 1)).toBe(false);
  });

  it("リセットを連打しても二重に取られない", () => {
    const monster = createMonsterInstance("slime_FIRE", 6);
    setAbilityPoint(monster, "hp", 100);
    confirmAbilityPoints(monster);
    const wallet = { gold: ABILITY_POINT_RESET_COST * 3 };
    expect(resetAbilityPoints(monster, wallet)).toBe(true);
    expect(resetAbilityPoints(monster, wallet)).toBe(false);
    expect(resetAbilityPoints(monster, wallet)).toBe(false);
    expect(wallet.gold).toBe(ABILITY_POINT_RESET_COST * 2);
  });
});

describe("ランクアップで増えた枠は無料で配れる", () => {
  it("★5で確定していても、★6になれば印が外れる", () => {
    /*
     * 外し忘れると「100ポイント持っているのに1つも振れない、
     * 振るには30万G」という理不尽が起きる。増えた枠はタダで配れなければおかしい。
     */
    const monster = createMonsterInstance("slime_FIRE", 5, 45);
    setAbilityPoint(monster, "hp", 50);
    confirmAbilityPoints(monster);
    applyRankUp(monster, []);
    expect(monster.star).toBe(6);
    expect(abilityPointsConfirmed(monster)).toBe(false);
    expect(setAbilityPoint(monster, "atk", 100)).toBe(true);
  });
});

describe("既に配ってあるセーブ", () => {
  it("印の無い旧セーブは、配分済みなら確定として扱う", () => {
    /*
     * **ここを緩めると、旧セーブの個体だけ無料で振り直せる場所が残る。**
     * 印が無いときは「1点でも振ってあれば確定済み」と読む。
     */
    const monster = createMonsterInstance("slime_FIRE", 6);
    monster.development.abilityPoints = { hp: 100, atk: 0, def: 0, spd: 0 };
    delete monster.development.abilityPointsConfirmed;
    expect(abilityPointsConfirmed(monster)).toBe(true);
    expect(setAbilityPoint(monster, "hp", 0)).toBe(false);
  });

  it("1点も振っていない旧セーブは、そのまま無料で配れる", () => {
    const monster = createMonsterInstance("slime_FIRE", 6);
    delete monster.development.abilityPointsConfirmed;
    expect(abilityPointsConfirmed(monster)).toBe(false);
    expect(setAbilityPoint(monster, "spd", 100)).toBe(true);
  });

  it("保存して読み直しても印が残る", () => {
    const state = createInitialState();
    const monster = state.monsters[0];
    monster.star = 6;
    setAbilityPoint(monster, "atk", 100);
    confirmAbilityPoints(monster);
    const loaded = normalizeLoadedState(JSON.parse(JSON.stringify(state)));
    expect(abilityPointsConfirmed(loaded.monsters[0])).toBe(true);
    expect(setAbilityPoint(loaded.monsters[0], "atk", 0)).toBe(false);
  });
});
