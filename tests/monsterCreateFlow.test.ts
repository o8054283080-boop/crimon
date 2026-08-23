import { describe, expect, it } from "vitest";
import { toBattleDefinition } from "../src/core/monsterInstance.js";
import { findMonsterById } from "../src/data/monsters.js";
import { applyMonsterCreate, currentSkillOf } from "../src/game/monsterCreate.js";
import { addMonster, createInitialState, removeMonsters } from "../src/game/playerState.js";

/**
 * クリエイトを「画面から実行したときの一連の流れ」の検証。
 *
 * 中核(`tests/monsterCreate.test.ts`)は書き換えの正しさだけを見ている。
 * こちらは**画面側の責任**を確かめる。中核は対象を書き換えるだけで、
 * 素材を手持ちから取り除くのは呼び出し側の仕事になっている。
 * ここを忘れると**素材が消えないまま技だけ増える**ので、必ず検査する。
 */

function stateWith(...specs: { dexId: string; star: 1 | 4 | 6; level: number }[]) {
  const state = createInitialState();
  // 初期状態には配布分のモンスターがいる。検証したいものだけにする
  state.monsters = [];
  state.partyIds = [];
  state.dungeonPartyIds = [];
  // addMonster は中で作るので、返ってきた実体を使うこと
  // (自分で作った実体を渡すと、手持ちには別のIDの複製が入る)
  const made = specs.map((spec) => addMonster(state, spec.dexId, spec.star, spec.level));
  return { state, made };
}

describe("画面から実行したときのクリエイト", () => {
  it("成功したら素材が手持ちから消える", () => {
    const { state, made } = stateWith(
      { dexId: "slime_FIRE", star: 4, level: 30 },
      { dexId: "wisp_WATER", star: 6, level: 60 },
    );
    const [target, material] = made;

    const result = applyMonsterCreate(target, material, 1, state.partyIds, state.dungeonPartyIds);
    expect(result.ok).toBe(true);
    removeMonsters(state, [material.id]);

    expect(state.monsters.map((m) => m.id)).toEqual([target.id]);
    expect(state.monsters[0].createdSkill).toBeDefined();
  });

  it("**断られたときは素材を消さない**", () => {
    const { state, made } = stateWith(
      { dexId: "slime_FIRE", star: 4, level: 30 },
      { dexId: "wisp_WATER", star: 1, level: 1 },
    );
    const [target, material] = made;

    const result = applyMonsterCreate(target, material, 1, state.partyIds, state.dungeonPartyIds);
    expect(result.ok).toBe(false);
    // 画面側は ok を見てから取り除く。ここで消してしまうと素材だけ失う
    expect(state.monsters).toHaveLength(2);
    expect(target.createdSkill).toBeUndefined();
  });

  it("移し替えた技が、画面の表示と戦闘の中身で一致する", () => {
    const { state, made } = stateWith(
      { dexId: "slime_FIRE", star: 4, level: 30 },
      { dexId: "wisp_WATER", star: 6, level: 60 },
    );
    const [target, material] = made;
    applyMonsterCreate(target, material, 2, state.partyIds, state.dungeonPartyIds);

    // 画面(詳細のスキル欄)が出すもの
    const shown = currentSkillOf(target, 2);
    // 戦闘が実際に使うもの
    const dex = findMonsterById(target.dexId)!;
    const inBattle = toBattleDefinition(target, dex).skills[2];

    expect(shown).toBeDefined();
    expect(inBattle.name).toBe(shown!.name);
  });

  it("置き換えたとき、前の移し替えは消えて枠が戻る", () => {
    const { state, made } = stateWith(
      { dexId: "slime_FIRE", star: 4, level: 30 },
      { dexId: "wisp_WATER", star: 6, level: 60 },
      { dexId: "imp_DARK", star: 6, level: 60 },
    );
    const [target, first, second] = made;

    applyMonsterCreate(target, first, 1, state.partyIds, state.dungeonPartyIds);
    removeMonsters(state, [first.id]);
    const replaced = applyMonsterCreate(target, second, 2, state.partyIds, state.dungeonPartyIds);
    removeMonsters(state, [second.id]);

    expect(replaced.replaced).toBeDefined();
    expect(state.monsters.map((m) => m.id)).toEqual([target.id]);

    // 前に触った枠は元へ戻っている
    const dex = findMonsterById(target.dexId)!;
    expect(currentSkillOf(target, 1)?.id).toBe(dex.skills[1].id);
  });
});
