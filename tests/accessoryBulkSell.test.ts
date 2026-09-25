/**
 * アクセサリーの絞り込みとまとめ売り(依頼主:「アクセサリーの入手時や、装備のアクセサリー欄で
 * 絞り込みやまとめ売りを装備と同じくできるようにしたい」)。
 *
 * 画面はこのテストでは描けない(ブラウザが無い)ので、
 *   ・絞り込み・持っている値の札・売れるものの選別・確認後の見直し はロジックで
 *   ・部品を装備と共有していること、着ける先を選ぶ画面にまとめ売りを出さないこと はソースで
 * 見張る。見た目は実ブラウザで撮って確かめる。
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACCESSORY_SPECIALS, type Accessory, type AccessorySpecialId, generateAccessory } from "../src/core/accessory.js";
import { createMonsterInstance } from "../src/core/monsterInstance.js";
import {
  EMPTY_ACCESSORY_FILTER, activeAccessoryFilterCount, addAccessory, availableAccessoryFacets, bulkSellAccessories,
  equipAccessory, filterAccessories, sellableAccessoryIds, setAccessoryLocked, sortAndFilterAccessories, wornAccessoryIds,
} from "../src/game/accessories.js";
import { emptyResult, mergeReward } from "../src/game/autoFarm.js";
import { createInitialState, type PlayerState } from "../src/game/playerState.js";
import { accessorySpecialShortLabel } from "../src/web/views/accessoryFilterBar.js";

function rng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 4系統×3レアの12個。1個目を先頭のモンスターに着け、2個目に鍵を掛ける */
function stateWithMany(): { state: PlayerState; accs: Accessory[] } {
  const state = createInitialState();
  state.monsters = [createMonsterInstance("knight_FIRE", 6, 60), createMonsterInstance("wolf_WATER", 6, 60)];
  const random = rng(11);
  const accs: Accessory[] = [];
  for (const family of ["ATTACK", "DURABILITY", "SUPPORT", "DISRUPT"] as const) {
    for (const rarity of ["HERO", "LEGEND", "EPIC"] as const) {
      const acc = generateAccessory({ star: rarity === "EPIC" ? 6 : rarity === "LEGEND" ? 5 : 4, rarity, family, rng: random });
      addAccessory(state, acc);
      accs.push(acc);
    }
  }
  equipAccessory(state, state.monsters[0].id, accs[0].id);
  setAccessoryLocked(state, accs[1].id, true);
  return { state, accs };
}

describe("絞り込み", () => {
  it("空の条件は全部を残す。軸どうしは AND、同じ軸の中は OR", () => {
    const { state, accs } = stateWithMany();
    const worn = wornAccessoryIds(state);
    const isWorn = (acc: Accessory) => worn.has(acc.id);
    expect(filterAccessories(accs, EMPTY_ACCESSORY_FILTER, isWorn)).toHaveLength(12);

    const attackOrSupport = filterAccessories(accs, { ...EMPTY_ACCESSORY_FILTER, families: ["ATTACK", "SUPPORT"] }, isWorn);
    expect(attackOrSupport).toHaveLength(6);
    expect(attackOrSupport.every((a) => a.family === "ATTACK" || a.family === "SUPPORT")).toBe(true);

    const attackEpic = filterAccessories(accs, { ...EMPTY_ACCESSORY_FILTER, families: ["ATTACK"], rarities: ["EPIC"] }, isWorn);
    expect(attackEpic.map((a) => a.id)).toEqual([accs[2].id]);
  });

  it("★・メイン・装着・ロックで絞れる", () => {
    const { state, accs } = stateWithMany();
    const worn = wornAccessoryIds(state);
    const isWorn = (acc: Accessory) => worn.has(acc.id);
    expect(filterAccessories(accs, { ...EMPTY_ACCESSORY_FILTER, stars: [6] }, isWorn).every((a) => a.star === 6)).toBe(true);
    const main = accs[3].mainStat;
    expect(filterAccessories(accs, { ...EMPTY_ACCESSORY_FILTER, mainStats: [main] }, isWorn).every((a) => a.mainStat === main)).toBe(true);
    expect(filterAccessories(accs, { ...EMPTY_ACCESSORY_FILTER, worn: "EQUIPPED" }, isWorn).map((a) => a.id)).toEqual([accs[0].id]);
    expect(filterAccessories(accs, { ...EMPTY_ACCESSORY_FILTER, worn: "FREE" }, isWorn)).toHaveLength(11);
    expect(filterAccessories(accs, { ...EMPTY_ACCESSORY_FILTER, lock: "LOCKED" }, isWorn).map((a) => a.id)).toEqual([accs[1].id]);
    expect(filterAccessories(accs, { ...EMPTY_ACCESSORY_FILTER, lock: "UNLOCKED" }, isWorn)).toHaveLength(11);
  });

  it("特殊効果は1個でも持っていれば残す", () => {
    const { state, accs } = stateWithMany();
    const target = accs[5].specials[accs[5].specials.length - 1].id;
    const kept = filterAccessories(accs, { ...EMPTY_ACCESSORY_FILTER, specials: [target] }, () => false);
    expect(kept.map((a) => a.id)).toContain(accs[5].id);
    expect(kept.every((a) => a.specials.some((s) => s.id === target))).toBe(true);
    expect(state.accessories).toHaveLength(12);
  });

  it("札の候補は持っている値だけ。手元に無い系統・特殊効果は出さない", () => {
    const { accs } = stateWithMany();
    const onlyAttack = accs.filter((a) => a.family === "ATTACK");
    const facets = availableAccessoryFacets(onlyAttack);
    expect(facets.families).toEqual(["ATTACK"]);
    const held = new Set(onlyAttack.flatMap((a) => a.specials.map((s) => s.id)));
    expect(new Set(facets.specials)).toEqual(held);
    // 持っていない特殊効果の札は出ない(攻撃系統しか持っていなければ、耐久の効果は1つも出ない)
    expect(facets.specials.every((id) => ACCESSORY_SPECIALS[id].family === "ATTACK")).toBe(true);
    expect(availableAccessoryFacets([]).families).toEqual([]);
  });

  it("畳んだ時のバッジは「絞っている軸の数」", () => {
    expect(activeAccessoryFilterCount(EMPTY_ACCESSORY_FILTER)).toBe(0);
    expect(activeAccessoryFilterCount({ ...EMPTY_ACCESSORY_FILTER, families: ["ATTACK", "SUPPORT"], lock: "LOCKED" })).toBe(2);
  });

  it("並べ替えの入口は、条件を一部だけ渡しても残りを「すべて」として読む", () => {
    const { state } = stateWithMany();
    expect(sortAndFilterAccessories(state, "NEWEST")).toHaveLength(12);
    expect(sortAndFilterAccessories(state, "STAR", { stars: [6] }).every((a) => a.star === 6)).toBe(true);
  });

  it("特殊効果の札の名前は、全種類に書いてあり、確率の数字を含まない", () => {
    for (const id of Object.keys(ACCESSORY_SPECIALS) as AccessorySpecialId[]) {
      const label = accessorySpecialShortLabel(id);
      expect(label, id).toBeTruthy();
      expect(label.length, id).toBeLessThanOrEqual(12);
      // 「被弾時 15%で回復」の15%のような発動の確率は札に書かない(HPの閾値の%は条件なので残してよい)
      if (id === "HIT_HEAL") expect(label).not.toMatch(/\d+%/);
    }
  });
});

describe("まとめ売り", () => {
  it("「表示中をすべて選ぶ」の候補は、見えているもののうちロック中・装着中を除いたものだけ", () => {
    const { state, accs } = stateWithMany();
    const ids = sellableAccessoryIds(accs, wornAccessoryIds(state));
    expect(ids).toHaveLength(10);
    expect(ids).not.toContain(accs[0].id);
    expect(ids).not.toContain(accs[1].id);
    // 絞り込みで見えているものだけから選ぶ
    const shown = accs.filter((a) => a.family === "DISRUPT");
    expect(sellableAccessoryIds(shown, wornAccessoryIds(state)).every((id) => shown.some((a) => a.id === id))).toBe(true);
  });

  it("売れるものだけなら全部売れ、売値の合計が入る", () => {
    const { state, accs } = stateWithMany();
    const before = state.gold;
    const targets = [accs[3], accs[4], accs[5]];
    const result = bulkSellAccessories(state, targets.map((a) => a.id));
    expect(result.ok).toBe(true);
    expect(result.sold).toBe(3);
    expect(state.gold - before).toBe(result.goldEarned);
    expect(result.goldEarned).toBeGreaterThan(0);
    expect(state.accessories).toHaveLength(9);
  });

  it("確認の後にロック・装着が変わっていたら、1個も売らない", () => {
    const { state, accs } = stateWithMany();
    const ids = [accs[3].id, accs[4].id];
    // 確認を出している間に鍵を掛けた
    setAccessoryLocked(state, accs[4].id, true);
    const gold = state.gold;
    const locked = bulkSellAccessories(state, ids);
    expect(locked.ok).toBe(false);
    expect(locked.sold).toBe(0);
    expect(state.gold).toBe(gold);
    expect(state.accessories).toHaveLength(12);

    // 確認を出している間に着けた
    setAccessoryLocked(state, accs[4].id, false);
    equipAccessory(state, state.monsters[1].id, accs[3].id);
    const worn = bulkSellAccessories(state, ids);
    expect(worn.ok).toBe(false);
    expect(state.accessories).toHaveLength(12);
  });

  it("もう無いアクセが混ざっていても1個も売らない。同じIDが2回来ても1回だけ数える", () => {
    const { state, accs } = stateWithMany();
    expect(bulkSellAccessories(state, [accs[3].id, "acc_gone"]).ok).toBe(false);
    expect(state.accessories).toHaveLength(12);
    const twice = bulkSellAccessories(state, [accs[3].id, accs[3].id]);
    expect(twice.sold).toBe(1);
    expect(bulkSellAccessories(state, []).ok).toBe(false);
  });
});

describe("入手時のシート", () => {
  it("遺跡の周回は、所持品に入ったアクセのIDを結果に残す(シートの中身はここから引く)", () => {
    const result = emptyResult();
    const acc = generateAccessory({ star: 6, rarity: "EPIC", family: "ATTACK", rng: rng(3) });
    mergeReward(result, {
      goldEarned: 0, crystalEarned: 0, expTotal: 0, fighterLevelsGained: 0, levelUps: [],
      dropDexId: null, dropStar: null, equipmentDrop: null, accessoryDrop: acc,
    } as unknown as Parameters<typeof mergeReward>[1], 0);
    expect(result.earnedAccessoryIds).toEqual([acc.id]);
  });

  it("周回と1戦の結果に入口があり、シートは装備のシートと同じ部品で作る", () => {
    const farm = readFileSync("src/web/views/autoFarmResult.ts", "utf8");
    const stage = readFileSync("src/web/views/stageResult.ts", "utf8");
    const sheet = readFileSync("src/web/views/farmAccessoryResult.ts", "utf8");
    const main = readFileSync("src/web/main.ts", "utf8");
    expect(farm).toContain("今回獲得したアクセサリーを見る");
    expect(stage).toContain("獲得したアクセサリーを見る");
    // 装備のシートと同じ形(クラスを共有)。aria-modal は巡回が「裏は触れなくて正しい」を見分ける印
    expect(sheet).toContain('"farm-equip-sheet farm-acc-sheet"');
    expect(sheet).toContain('"aria-modal": "true"');
    expect(sheet).toContain("renderAccessoryFilterBar");
    expect(sheet).toContain("表示中をすべて選ぶ");
    // 1戦の遺跡の結果も、獲得したアクセのIDを持つ
    expect(main).toMatch(/earnedAccessoryIds: reward \? \[reward\.accessoryDrop\.id\] : \[\]/);
  });

  it("シートを開くたびに、絞り込みと選択を白紙へ戻す", () => {
    const main = readFileSync("src/web/main.ts", "utf8");
    const open = main.slice(main.indexOf("function openFarmAccessorySheet("), main.indexOf("function closeFarmAccessorySheet("));
    expect(open).toContain("state.farmAccessoryFilter = { ...EMPTY_ACCESSORY_FILTER }");
    expect(open).toContain("state.farmAccessorySelectedIds = []");
  });
});

describe("アクセの一覧", () => {
  const view = readFileSync("src/web/views/accessories.ts", "utf8");
  const bar = readFileSync("src/web/views/accessoryFilterBar.ts", "utf8");

  it("絞り込みは装備・モンスターと同じ畳める帯(クラスを共有)", () => {
    expect(view).toContain("renderAccessoryFilterBar");
    expect(bar).toContain('className: `mfilter__toggle');
    expect(bar).toContain("slot-filter-chip mfilter__chip");
    // 札を常に並べていた旧い形へ戻っていないこと
    expect(view).not.toContain("acc-filters");
  });

  it("着ける先を選ぶ画面(pickFor)では、まとめ売りを出さない", () => {
    expect(view).toContain("const selecting = props.selecting && props.pickFor === null");
    expect(view).toContain("props.pickFor === null ? renderToolbar(props) : null");
  });
});
