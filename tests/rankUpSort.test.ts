import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { MonsterInstance, createMonsterInstance } from "../src/core/monsterInstance.js";
import { MONSTER_SORT_KEYS, sortMonsters } from "../src/game/monsterSort.js";
import { sortMaterialMonsters } from "../src/game/materialMonsterSort.js";

/*
 * ランクアップの素材選びの並べ替え。
 *
 * ここで見張るのは**2つの並べ替えの重ね方**。
 * 軸(星・レベル・種族…)で並べてから、転生ピッグだけを先頭へ寄せる。
 * 逆にすると、寄せた並びを軸が壊して転生ピッグが散らばる。
 * 順番はコードを読んでも気づきにくいので、機械で押さえておく。
 */

function instance(dexId: string, star: 1 | 2 | 3 | 4 | 5 | 6, level: number): MonsterInstance {
  const made = createMonsterInstance(dexId, star, level);
  return made;
}

describe("ランクアップの素材の並べ替え", () => {
  const candidates = [
    instance("slime_FIRE", 3, 10),
    instance("reincarnation_pig_WATER", 3, 1),
    instance("dragon_FIRE", 3, 30),
    instance("reincarnation_pig_FIRE", 3, 1),
    instance("wolf_GRASS", 3, 20),
  ];

  it("軸で並べたあとに転生ピッグを寄せる(寄せた並びが軸で崩れない)", () => {
    const sorted = sortMaterialMonsters(
      sortMonsters(candidates, "power", { partyIds: [] }),
      "REINCARNATION_PIG_FIRST",
    );
    const isPig = (m: MonsterInstance) => m.dexId.startsWith("reincarnation_pig_");
    expect(sorted.slice(0, 2).every(isPig), "転生ピッグが先頭に集まる").toBe(true);
    expect(sorted.slice(2).some(isPig), "後ろに散らばっていない").toBe(false);
    expect(sorted).toHaveLength(candidates.length);
  });

  it("どの軸を選んでも素材が増減しない", () => {
    for (const key of MONSTER_SORT_KEYS) {
      for (const material of ["DEFAULT", "REINCARNATION_PIG_FIRST"] as const) {
        const sorted = sortMaterialMonsters(sortMonsters(candidates, key, { partyIds: [] }), material);
        expect(sorted.map((m) => m.id).sort(), `${key}/${material}`).toEqual(candidates.map((m) => m.id).sort());
      }
    }
  });

  it("並べ替えの札は所持一覧と同じ軸から作る", () => {
    /*
     * 素材選びだけ別の言葉にすると、同じことをするのに2つの操作を覚えることになる。
     * 軸を足した時にランクアップ側だけ取り残されないよう、
     * **一覧と同じ定数から札を作っていること**を見る。
     */
    const source = readFileSync("src/web/views/monsters.ts", "utf8");
    const rankUp = source.slice(source.indexOf("function renderRankUp"), source.indexOf("export function renderMonsters"));
    expect(rankUp, "ランクアップの札が MONSTER_SORT_KEYS から作られていない").toContain("MONSTER_SORT_KEYS.map");
    expect(rankUp, "軸で並べてから素材の寄せをかけていない").toContain("sortMaterialMonsters(\n    sortMonsters(");
  });
});
