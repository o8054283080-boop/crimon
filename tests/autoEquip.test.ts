import { describe, expect, it } from "vitest";
import { EQUIP_SLOTS, Equipment, EquipSlot, generateEquipment } from "../src/core/equipment.js";
import { toBattleDefinition } from "../src/core/monsterInstance.js";
import { ALL_DISPLAYABLE_MONSTERS_DEX, findMonsterById } from "../src/data/monsters.js";
import { addEquipment, addMonster, createInitialState, type PlayerState } from "../src/game/playerState.js";
import {
  applyAutoEquipPlan,
  autoEquipPowerOf,
  collectCandidates,
  createDefaultAutoEquipSettings,
  currentStatsOf,
  meetsMinimums,
  planAutoEquip,
  type AutoEquipSettings,
} from "../src/game/autoEquip.js";

/**
 * おまかせ装備。
 *
 * ## ここで守るもの
 *
 *   1. **本当に最大になっているか**(総当たりの答えと突き合わせる)
 *   2. 固定したスロットは動かない
 *   3. おまかせ対象外は候補に入らない
 *   4. 最低条件を満たさない構成は選ばれない。満たすものが無ければ断る
 *   5. **計算しただけでは何も変わらない**(確定するまで装備は動かない)
 *
 * ## 途中で見つけた、危うかったところ
 *
 * 最初の版は「セット構成ごとに上位3件で 5^6 通り」を回していた。
 * 小さい母集団では総当たりと一致したが、**実際のセット構成は443通りあり、
 * 上限3万では1構成しか回れていなかった。**残り442構成は一度も測らずに
 * 「これが最良です」と答えていた。ここのテストは、
 * **母集団を変えても最良であること**を見る形にしてある。
 */

const DEX_IDS = ALL_DISPLAYABLE_MONSTERS_DEX.map((d) => d.id);

function makeRng(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}

/** モンスター1体と、スロットごとに n 個ずつの装備を持つ状態 */
function stateWith(perSlot: number, seed = 7, dexIndex = 3): { state: PlayerState; monsterId: string } {
  const state = createInitialState();
  state.monsters = [];
  state.equipment = [];
  const rng = makeRng(seed);
  const monster = addMonster(state, DEX_IDS[dexIndex % DEX_IDS.length], 6, 60);
  for (const slot of EQUIP_SLOTS) {
    for (let i = 0; i < perSlot; i += 1) {
      addEquipment(state, generateEquipment({ slot, star: 6, subStatCount: 4, rng }));
    }
  }
  return { state, monsterId: monster.id };
}

/** 小さい母集団なら総当たりできる。探索の答えと突き合わせる物差し */
function bruteForceBest(state: PlayerState, monsterId: string, key: string): number {
  const monster = state.monsters.find((m) => m.id === monsterId)!;
  const dex = findMonsterById(monster.dexId)!;
  const bySlot = EQUIP_SLOTS.map((slot) => state.equipment.filter((e) => e.slot === slot));
  let best = -Infinity;
  const walk = (i: number, chosen: Equipment[]): void => {
    if (i === EQUIP_SLOTS.length) {
      const stats = toBattleDefinition(monster, dex, chosen).stats;
      const value = key === "power" ? autoEquipPowerOf(stats) : (stats as unknown as Record<string, number>)[key];
      if (value > best) best = value;
      return;
    }
    for (const item of bySlot[i]) walk(i + 1, [...chosen, item]);
    walk(i + 1, chosen);   // そのスロットは着けない
  };
  walk(0, []);
  return best;
}

function settingsFor(over: Partial<AutoEquipSettings>): AutoEquipSettings {
  return { ...createDefaultAutoEquipSettings(), scope: "ALL", ...over };
}

describe("本当に一番強い構成を出す", () => {
  /*
   * **「攻撃最大」が本当に所持装備内の最大攻撃構成になっているか。**
   * 装備4個×6スロットなら 5^6 = 15,625 通りを全部試せるので、
   * 総当たりの答えと1の位まで突き合わせる。
   */
  for (const key of ["atk", "spd", "hp", "def", "criRate", "criDmg", "power"] as const) {
    it(`${key} を狙うと、総当たりの最大と一致する`, () => {
      for (const seed of [7, 19, 33]) {
        const { state, monsterId } = stateWith(4, seed);
        const out = planAutoEquip(state, monsterId, settingsFor({ type: key }));
        expect(out.ok, `${key} seed=${seed}: ${out.ok ? "" : out.reason}`).toBe(true);
        if (!out.ok) continue;
        const got = key === "power"
          ? autoEquipPowerOf(out.plan.after)
          : (out.plan.after as unknown as Record<string, number>)[key];
        expect(got, `${key} seed=${seed}`).toBeCloseTo(bruteForceBest(state, monsterId, key), 6);
      }
    });
  }

  /*
   * **母集団を増やしても、増やしたぶんは必ず活きる。**
   * 装備が増えて答えが悪くなることは有り得ない。
   * 探索が一部の構成しか見ていないと、ここで下がる。
   */
  it("装備が増えると、答えは下がらない", () => {
    let previous = -Infinity;
    for (const perSlot of [4, 12, 40]) {
      const { state, monsterId } = stateWith(perSlot, 5);
      const out = planAutoEquip(state, monsterId, settingsFor({ type: "atk" }));
      expect(out.ok).toBe(true);
      if (!out.ok) continue;
      expect(out.plan.after.atk, `${perSlot}個/スロット`).toBeGreaterThanOrEqual(previous);
      previous = out.plan.after.atk;
    }
  });

  it("何度呼んでも同じ答えになる", () => {
    const { state, monsterId } = stateWith(8, 21);
    const first = planAutoEquip(state, monsterId, settingsFor({ type: "spd" }));
    for (let i = 0; i < 3; i += 1) {
      const again = planAutoEquip(state, monsterId, settingsFor({ type: "spd" }));
      expect(again.ok).toBe(first.ok);
      if (first.ok && again.ok) expect(again.plan.assignment).toEqual(first.plan.assignment);
    }
  });
});

describe("固定したスロットは動かない", () => {
  it("固定した部位の装備が変わらない", () => {
    const { state, monsterId } = stateWith(6, 11);
    const monster = state.monsters.find((m) => m.id === monsterId)!;
    // まず何か着けておく
    const first = planAutoEquip(state, monsterId, settingsFor({ type: "atk" }));
    expect(first.ok).toBe(true);
    if (first.ok) applyAutoEquipPlan(state, monsterId, first.plan.assignment);

    const pinned: EquipSlot = 1;
    const before = monster.equipment[pinned];
    expect(before, "1番のスロットに何も着いていない").toBeTruthy();

    const out = planAutoEquip(state, monsterId, settingsFor({ type: "hp", fixedSlots: [pinned] }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.plan.assignment[pinned], "固定したのに変わっている").toBe(before);
  });

  it("固定したスロットは探索の候補にも出てこない", () => {
    const { state, monsterId } = stateWith(6, 11);
    const monster = state.monsters.find((m) => m.id === monsterId)!;
    const candidates = collectCandidates(state, monster, settingsFor({ fixedSlots: [2, 4] }));
    expect(candidates.get(2), "固定したスロットに候補がある").toHaveLength(0);
    expect(candidates.get(4), "固定したスロットに候補がある").toHaveLength(0);
    expect(candidates.get(1)!.length, "固定していないスロットが空").toBeGreaterThan(0);
  });
});

describe("おまかせ対象外は候補に入らない", () => {
  it("印を付けた装備は選ばれない", () => {
    const { state, monsterId } = stateWith(4, 13);
    const monster = state.monsters.find((m) => m.id === monsterId)!;
    // 攻撃を狙った時に選ばれるものを、対象外にしてから測り直す
    const before = planAutoEquip(state, monsterId, settingsFor({ type: "atk" }));
    expect(before.ok).toBe(true);
    if (!before.ok) return;
    const chosen = Object.values(before.plan.assignment).filter((id): id is string => Boolean(id));
    for (const id of chosen) {
      const item = state.equipment.find((e) => e.id === id)!;
      item.autoExclude = true;
    }
    const after = planAutoEquip(state, monsterId, settingsFor({ type: "atk" }));
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    for (const id of Object.values(after.plan.assignment)) {
      expect(chosen, "対象外にした装備が選ばれている").not.toContain(id);
    }
    expect(collectCandidates(state, monster, settingsFor({})).get(1)!.map((e) => e.id))
      .not.toContain(chosen[0]);
  });

  /*
   * **売却防止の鍵とは別物。**大事な装備に鍵をかけている人は多いので、
   * 鍵を「おまかせ対象外」と同じ意味にすると、鍵をかけた強い装備が
   * おまかせに一切出てこなくなる。
   */
  it("売却防止の鍵は、おまかせには効かない", () => {
    const { state, monsterId } = stateWith(4, 17);
    const monster = state.monsters.find((m) => m.id === monsterId)!;
    for (const item of state.equipment) item.locked = true;
    const candidates = collectCandidates(state, monster, settingsFor({}));
    const total = [...candidates.values()].reduce((n, list) => n + list.length, 0);
    expect(total, "鍵をかけただけで候補が消えている").toBe(state.equipment.length);
  });
});

describe("最低条件", () => {
  it("満たす構成だけが選ばれる", () => {
    const { state, monsterId } = stateWith(6, 23);
    const free = planAutoEquip(state, monsterId, settingsFor({ type: "atk" }));
    expect(free.ok).toBe(true);
    if (!free.ok) return;

    // 何も指定しない時より高い速度を条件にする
    const wantSpd = free.plan.after.spd + 10;
    const out = planAutoEquip(state, monsterId, settingsFor({ type: "atk", minimums: { spd: wantSpd } }));
    if (out.ok) {
      expect(out.plan.after.spd, "条件を満たしていない構成が選ばれた").toBeGreaterThanOrEqual(wantSpd);
      expect(meetsMinimums(out.plan.after, { spd: wantSpd })).toBe(true);
    }
  });

  /*
   * **勝手に条件を緩めない。**届かない条件を出された時に
   * 「近いもの」を着せると、指定した意味が無くなる。
   */
  it("届かない条件なら、何も選ばずに断る", () => {
    const { state, monsterId } = stateWith(4, 29);
    const out = planAutoEquip(state, monsterId, settingsFor({ type: "atk", minimums: { spd: 99999 } }));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("指定条件を満たす装備構成がありません");
  });

  it("断った時、装備は一切変わらない", () => {
    const { state, monsterId } = stateWith(4, 29);
    const monster = state.monsters.find((m) => m.id === monsterId)!;
    const before = JSON.stringify(monster.equipment);
    planAutoEquip(state, monsterId, settingsFor({ type: "atk", minimums: { hp: 9_999_999 } }));
    expect(JSON.stringify(monster.equipment)).toBe(before);
  });
});

describe("カスタムの優先順位", () => {
  /*
   * 辞書順。第1優先が同じなら第2優先で比べる。
   * **引き分けを残さない**ので、同じ入力なら必ず同じ構成になる。
   */
  it("第1優先が、その型を単独で狙った時と同じ値になる", () => {
    const { state, monsterId } = stateWith(5, 31);
    const single = planAutoEquip(state, monsterId, settingsFor({ type: "spd" }));
    const custom = planAutoEquip(state, monsterId, settingsFor({ type: "custom", priorities: ["spd", "atk"] }));
    expect(single.ok && custom.ok).toBe(true);
    if (!single.ok || !custom.ok) return;
    expect(custom.plan.after.spd).toBe(single.plan.after.spd);
  });

  it("第1優先が並んだ時は、第2優先で決まる", () => {
    const { state, monsterId } = stateWith(5, 31);
    const spdOnly = planAutoEquip(state, monsterId, settingsFor({ type: "custom", priorities: ["spd"] }));
    const spdThenAtk = planAutoEquip(state, monsterId, settingsFor({ type: "custom", priorities: ["spd", "atk"] }));
    expect(spdOnly.ok && spdThenAtk.ok).toBe(true);
    if (!spdOnly.ok || !spdThenAtk.ok) return;
    expect(spdThenAtk.plan.after.spd).toBe(spdOnly.plan.after.spd);
    expect(spdThenAtk.plan.after.atk).toBeGreaterThanOrEqual(spdOnly.plan.after.atk);
  });
});

describe("どこから装備を探すか", () => {
  function twoMonsters(): { state: PlayerState; mine: string; other: string } {
    const { state, monsterId } = stateWith(4, 37);
    const other = addMonster(state, DEX_IDS[5], 6, 60);
    // 相手に何個か着けさせる
    const plan = planAutoEquip(state, other.id, settingsFor({ type: "atk" }));
    if (plan.ok) applyAutoEquipPlan(state, other.id, plan.plan.assignment);
    return { state, mine: monsterId, other: other.id };
  }

  it("未装備のみ → 他の子の装備は候補に入らない", () => {
    const { state, mine, other } = twoMonsters();
    const otherMonster = state.monsters.find((m) => m.id === other)!;
    const worn = new Set(Object.values(otherMonster.equipment).filter(Boolean));
    const monster = state.monsters.find((m) => m.id === mine)!;
    const candidates = collectCandidates(state, monster, settingsFor({ scope: "UNEQUIPPED" }));
    for (const list of candidates.values()) {
      for (const item of list) expect(worn.has(item.id), "他の子の装備が候補に居る").toBe(false);
    }
  });

  it("他の子の装備も使う → 外すことになる相手が分かる", () => {
    const { state, mine } = twoMonsters();
    const out = planAutoEquip(state, mine, settingsFor({ type: "atk", scope: "ALL" }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // 相手が持っていた装備を選んだなら、必ず相手の名前が付いてくる
    for (const entry of out.plan.stolen) {
      expect(entry.monsterName.length).toBeGreaterThan(0);
      expect(entry.equipmentId.length).toBeGreaterThan(0);
    }
  });

  it("未装備のみなら、誰からも外さない", () => {
    const { state, mine } = twoMonsters();
    const out = planAutoEquip(state, mine, settingsFor({ type: "atk", scope: "UNEQUIPPED" }));
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.plan.stolen).toEqual([]);
  });

  /*
   * **この子の今の装備も外す。**ここを抜かすと「今の装備＋未装備」と
   * 中身が同じになり、選べるのに何も変わらない札が1つ増えるだけになる。
   */
  it("未装備のみ → この子が今着けている装備も候補に入らない", () => {
    const { state, mine } = twoMonsters();
    const monster = state.monsters.find((m) => m.id === mine)!;
    const plan = planAutoEquip(state, mine, settingsFor({ type: "atk" }));
    if (plan.ok) applyAutoEquipPlan(state, mine, plan.plan.assignment);
    const worn = new Set(Object.values(monster.equipment).filter(Boolean));
    expect(worn.size, "着けていないと試験にならない").toBeGreaterThan(0);

    const candidates = collectCandidates(state, monster, settingsFor({ scope: "UNEQUIPPED" }));
    for (const list of candidates.values()) {
      for (const item of list) expect(worn.has(item.id), "自分の今の装備が候補に居る").toBe(false);
    }
  });
});

describe("候補が無い部位は、動かさない", () => {
  /*
   * **対象外は「触るな」であって「捨てろ」ではない。**
   * 候補が空の部位をそのまま探索へ渡すと、割り当てに載らないまま
   * `applyAutoEquipPlan` が外しにいき、**印を付けた装備が裸にされる。**
   */
  it("おまかせ対象外の装備を着けている部位は、外されない", () => {
    const { state, monsterId } = stateWith(3, 91);
    const monster = state.monsters.find((m) => m.id === monsterId)!;
    const first = planAutoEquip(state, monsterId, settingsFor({ type: "atk" }));
    expect(first.ok).toBe(true);
    if (first.ok) applyAutoEquipPlan(state, monsterId, first.plan.assignment);

    // 2番の装備だけ対象外にし、2番の候補を全部消す
    const wornId = monster.equipment[2]!;
    expect(wornId).toBeTruthy();
    for (const item of state.equipment) {
      if (item.slot === 2) item.autoExclude = true;
    }

    const out = planAutoEquip(state, monsterId, settingsFor({ type: "atk", scope: "ALL" }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.plan.assignment[2], "対象外にしたら外された").toBe(wornId);
    applyAutoEquipPlan(state, monsterId, out.plan.assignment);
    expect(monster.equipment[2]).toBe(wornId);
  });

  it("未装備の替えが無い部位も、外されない", () => {
    const { state, monsterId } = stateWith(1, 92);
    const monster = state.monsters.find((m) => m.id === monsterId)!;
    const first = planAutoEquip(state, monsterId, settingsFor({ type: "atk" }));
    expect(first.ok).toBe(true);
    if (first.ok) applyAutoEquipPlan(state, monsterId, first.plan.assignment);
    // 1個ずつしか無いので、いま着けている物が全部。未装備の替えは1つも無い
    const worn = { ...monster.equipment };

    const out = planAutoEquip(state, monsterId, settingsFor({ type: "atk", scope: "UNEQUIPPED" }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    applyAutoEquipPlan(state, monsterId, out.plan.assignment);
    expect(monster.equipment, "替えが無いのに裸にされた").toEqual(worn);
  });
});

describe("計算しただけでは何も変わらない", () => {
  it("planAutoEquip は装備に触らない", () => {
    const { state, monsterId } = stateWith(6, 41);
    const snapshot = JSON.stringify(state.monsters.map((m) => m.equipment));
    for (const type of ["atk", "hp", "spd", "power"] as const) {
      planAutoEquip(state, monsterId, settingsFor({ type, scope: "ALL" }));
    }
    expect(JSON.stringify(state.monsters.map((m) => m.equipment)), "計算しただけで装備が動いた").toBe(snapshot);
  });

  it("確定して初めて装備が変わる", () => {
    const { state, monsterId } = stateWith(6, 41);
    const monster = state.monsters.find((m) => m.id === monsterId)!;
    const out = planAutoEquip(state, monsterId, settingsFor({ type: "atk" }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    applyAutoEquipPlan(state, monsterId, out.plan.assignment);
    for (const slot of EQUIP_SLOTS) {
      expect(monster.equipment[slot]).toBe(out.plan.assignment[slot]);
    }
  });

  /*
   * **同じ装備を2体が同時に着けることはできない。**
   * `applyAutoEquipPlan` は着ける前に他の子から外す。
   */
  it("同じ装備が2体に着かない", () => {
    const { state, monsterId } = stateWith(4, 43);
    const other = addMonster(state, DEX_IDS[9], 6, 60);
    const first = planAutoEquip(state, other.id, settingsFor({ type: "atk", scope: "ALL" }));
    if (first.ok) applyAutoEquipPlan(state, other.id, first.plan.assignment);
    const second = planAutoEquip(state, monsterId, settingsFor({ type: "atk", scope: "ALL" }));
    if (second.ok) applyAutoEquipPlan(state, monsterId, second.plan.assignment);

    const seen = new Map<string, string>();
    for (const monster of state.monsters) {
      for (const id of Object.values(monster.equipment)) {
        if (!id) continue;
        expect(seen.has(id), `${id} を2体が着けている`).toBe(false);
        seen.set(id, monster.id);
      }
    }
  });
});

describe("プレビューに出す数字が、実際の戦闘の数字と一致する", () => {
  /*
   * **画面に出す「変更後」は、着けた後の本物と同じでなければならない。**
   * ここがずれると、プレビューを見て決めた人が裏切られる。
   */
  it("変更後として見せた値が、着けた後の値と一致する", () => {
    const { state, monsterId } = stateWith(6, 47);
    const monster = state.monsters.find((m) => m.id === monsterId)!;
    const out = planAutoEquip(state, monsterId, settingsFor({ type: "power", scope: "ALL" }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    applyAutoEquipPlan(state, monsterId, out.plan.assignment);
    const actual = currentStatsOf(state, monster);
    expect(actual, "着けた後のステータスが取れない").not.toBeNull();
    expect(actual).toEqual(out.plan.after);
  });

  it("変更前として見せた値も、着ける前の値と一致する", () => {
    const { state, monsterId } = stateWith(6, 47);
    const monster = state.monsters.find((m) => m.id === monsterId)!;
    const before = currentStatsOf(state, monster);
    const out = planAutoEquip(state, monsterId, settingsFor({ type: "atk" }));
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.plan.before).toEqual(before);
  });
});

describe("そろえるシリーズを指定する", () => {
  /*
   * ## なぜこの指定が要るのか
   *
   * おまかせはステータスの数字で比べる。だが暴走・崩壊・祝福・加護・免疫の
   * 効果は `CombatModifiers` にしか入らず、**HPにも攻撃にも1も乗らない。**
   * つまり指定が無ければ、あの5つは**評価が常にゼロ**で一生選ばれない。
   * ここでは「名指しすれば必ずそろう」ことだけを見る。
   */
  function manyItems(perSlot = 40, seed = 11): { state: PlayerState; monsterId: string } {
    return stateWith(perSlot, seed);
  }

  const setCountsOf = (state: PlayerState, assignment: Partial<Record<EquipSlot, string>>): Map<string, number> => {
    const counts = new Map<string, number>();
    for (const id of Object.values(assignment)) {
      const item = state.equipment.find((e) => e.id === id);
      if (item) counts.set(item.set, (counts.get(item.set) ?? 0) + 1);
    }
    return counts;
  };

  it("4セットを名指しすると、必ず4個そろう", () => {
    const { state, monsterId } = manyItems();
    const out = planAutoEquip(state, monsterId, settingsFor({ type: "power", scope: "ALL", wantedSets: { SWIFT: 4 } }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(setCountsOf(state, out.plan.assignment).get("SWIFT") ?? 0).toBeGreaterThanOrEqual(4);
  });

  it("2つ同時に名指ししても、両方そろう", () => {
    const { state, monsterId } = manyItems();
    const out = planAutoEquip(state, monsterId, settingsFor({
      type: "power", scope: "ALL", wantedSets: { SWIFT: 4, CRIT: 2 },
    }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const counts = setCountsOf(state, out.plan.assignment);
    expect(counts.get("SWIFT") ?? 0).toBeGreaterThanOrEqual(4);
    expect(counts.get("CRIT") ?? 0).toBeGreaterThanOrEqual(2);
  });

  /*
   * **これが無いと機能そのものが無意味。**暴走はステータスに何も乗せないので、
   * 指定しなければ総合力狙いで選ばれることはまず無い。
   */
  it("ステータスに出ないシリーズ(暴走)も、名指しすればそろう", () => {
    const { state, monsterId } = manyItems();
    const free = planAutoEquip(state, monsterId, settingsFor({ type: "power", scope: "ALL" }));
    expect(free.ok).toBe(true);
    if (free.ok) {
      expect(setCountsOf(state, free.plan.assignment).get("RAMPAGE") ?? 0,
        "指定しなくても暴走が4つ選ばれるなら、この試験は何も見ていない").toBeLessThan(4);
    }
    const out = planAutoEquip(state, monsterId, settingsFor({ type: "power", scope: "ALL", wantedSets: { RAMPAGE: 4 } }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(setCountsOf(state, out.plan.assignment).get("RAMPAGE") ?? 0).toBeGreaterThanOrEqual(4);
  });

  /*
   * 暴走・崩壊・祝福は2個では何も起きない。
   * 2を渡されたら4へ引き上げる——**黙って無意味な縛りを掛けない。**
   */
  it("4個でしか効かないシリーズに2を指定したら、4へ引き上げる", () => {
    const { state, monsterId } = manyItems();
    const out = planAutoEquip(state, monsterId, settingsFor({ type: "power", scope: "ALL", wantedSets: { RAMPAGE: 2 } }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(setCountsOf(state, out.plan.assignment).get("RAMPAGE") ?? 0).toBeGreaterThanOrEqual(4);
  });

  /*
   * **黙って願いを捨てて「できました」と言わない。**
   * 最初の版は合計が6を超えると指定を丸ごと捨てており、
   * 暴走4+崩壊4 が「無指定と同じ結果」を成功として返していた。
   */
  it("6枠に入らない指定は、成功させずに断る", () => {
    const { state, monsterId } = manyItems();
    const out = planAutoEquip(state, monsterId, settingsFor({
      type: "power", scope: "ALL", wantedSets: { RAMPAGE: 4, COLLAPSE: 4 },
    }));
    expect(out.ok, "叶えられない指定を成功にした").toBe(false);
    if (!out.ok) expect(out.reason).toContain("6枠");
  });

  it("そろえるだけ持っていないシリーズは断る", () => {
    const { state, monsterId } = stateWith(4, 71);
    // 速攻を1個だけ残して、他は全部消す
    const swift = state.equipment.filter((e) => e.set === "SWIFT");
    if (swift.length > 1) {
      const keep = swift[0].id;
      state.equipment = state.equipment.filter((e) => e.set !== "SWIFT" || e.id === keep);
    }
    const out = planAutoEquip(state, monsterId, settingsFor({ type: "power", scope: "ALL", wantedSets: { SWIFT: 4 } }));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("シリーズ");
  });

  /*
   * **詰め直しが約束を崩さないこと。**総合力・カスタムは1枠ずつ
   * 入れ替えて詰めるので、そこで別シリーズへ替えた方が数字は上がる。
   * 放っておくと必ずそうなるので、最後に実際の個数を数えて守っている。
   */
  it("詰め直しが走る狙い(総合力・カスタム)でも崩れない", () => {
    const { state, monsterId } = manyItems(30, 29);
    for (const settings of [
      settingsFor({ type: "power", scope: "ALL", wantedSets: { CRIT: 4 } }),
      settingsFor({ type: "custom", priorities: ["spd", "atk"], scope: "ALL", wantedSets: { CRIT: 4 } }),
      settingsFor({ type: "custom", priorities: ["atk"], minimums: { spd: 100 }, scope: "ALL", wantedSets: { CRIT: 4 } }),
    ]) {
      const out = planAutoEquip(state, monsterId, settings);
      expect(out.ok).toBe(true);
      if (!out.ok) continue;
      expect(setCountsOf(state, out.plan.assignment).get("CRIT") ?? 0,
        `${settings.type} で約束が崩れた`).toBeGreaterThanOrEqual(4);
    }
  });

  it("固定した部位のシリーズも頭数に入れる", () => {
    const { state, monsterId } = manyItems();
    const monster = state.monsters.find((m) => m.id === monsterId)!;
    // まず速攻4セットを組んで着せる
    const first = planAutoEquip(state, monsterId, settingsFor({ type: "power", scope: "ALL", wantedSets: { SWIFT: 4 } }));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    applyAutoEquipPlan(state, monsterId, first.plan.assignment);

    // 速攻が乗っている部位を1つ固定して、もう一度同じ指定で探す
    const swiftSlot = EQUIP_SLOTS.find((slot) => {
      const id = monster.equipment[slot];
      return state.equipment.find((e) => e.id === id)?.set === "SWIFT";
    });
    expect(swiftSlot).toBeDefined();
    const out = planAutoEquip(state, monsterId, settingsFor({
      type: "power", scope: "ALL", wantedSets: { SWIFT: 4 }, fixedSlots: [swiftSlot!],
    }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(setCountsOf(state, out.plan.assignment).get("SWIFT") ?? 0).toBeGreaterThanOrEqual(4);
  });

  it("指定しなければ、今までどおり何も縛らない", () => {
    const { state, monsterId } = manyItems();
    const a = planAutoEquip(state, monsterId, settingsFor({ type: "atk", scope: "ALL" }));
    const b = planAutoEquip(state, monsterId, settingsFor({ type: "atk", scope: "ALL", wantedSets: {} }));
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(b.plan.after.atk).toBe(a.plan.after.atk);
  });
});

describe("重さ", () => {
  /*
   * **測ってから決める。**所持1800個(1スロット300個)でも待たされないこと。
   * 最初の版は総合力で1秒かかっていた——セット構成ごとに毎回
   * 並べ替え直していたのが原因だった。
   *
   * 上限を 1000ms にしていたら**時々落ちるようになった。**
   * 手元の実測は 250〜480ms だが、テストは並列に走るので、
   * 同じ機械の混み具合で倍近くまで伸びる。
   * ここで見たいのは「桁で遅くなっていないか」であって、
   * 数十msの上下ではない。**混んでいても落ちない幅**まで開けて、
   * 代わりに「打ち切られていないか」を別の物差しで見る。
   */
  it("所持1800個でも、桁で遅くならない", () => {
    const { state, monsterId } = stateWith(300, 53);
    expect(state.equipment.length).toBe(1800);
    for (const type of ["atk", "spd", "power"] as const) {
      const started = Date.now();
      const out = planAutoEquip(state, monsterId, settingsFor({ type, scope: "ALL" }));
      const elapsed = Date.now() - started;
      expect(out.ok).toBe(true);
      expect(elapsed, `${type} に ${elapsed}ms かかった`).toBeLessThan(2500);
      // 測る回数は上限で頭打ちになる。ここが増え続けるなら作りが変わっている
      if (out.ok) expect(out.plan.evaluated).toBeLessThanOrEqual(50000);
    }
  });
});
