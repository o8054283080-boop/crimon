import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EQUIP_STARS, Equipment, SET_TYPES, STAT_TYPES, generateEquipment } from "../src/core/equipment.js";
import { EQUIPMENT_RARITIES } from "../src/core/equipmentRarity.js";
import {
  EMPTY_EQUIPMENT_FILTER,
  activeEquipmentFilterCount,
  availableEquipmentFacets,
  filterEquipment,
  toggleEquipmentFilterValue,
} from "../src/web/equipmentFilter.js";
import { applyEquipmentOrder } from "../src/web/views/equipment.js";

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ORDER = { rarities: EQUIPMENT_RARITIES, stars: EQUIP_STARS, sets: SET_TYPES, mainStats: STAT_TYPES };

/** 条件を確かめやすいよう、性質を指定して1個作る */
function make(options: { star?: 1 | 2 | 3 | 4 | 5 | 6; sub?: number; set?: (typeof SET_TYPES)[number]; seed?: number }): Equipment {
  return generateEquipment({
    slot: 1,
    star: options.star ?? 5,
    subStatCount: options.sub ?? 2,
    set: options.set ?? "CRIT",
    rng: mulberry32(options.seed ?? 1),
  });
}

describe("所持装備の絞り込み", () => {
  const never = () => false;

  it("条件なしなら全部残る", () => {
    const all = [make({ seed: 1 }), make({ seed: 2, star: 3 }), make({ seed: 3, sub: 4 })];
    expect(filterEquipment(all, EMPTY_EQUIPMENT_FILTER, never)).toHaveLength(3);
  });

  it("レア度で絞れる。初期サブ数から見るので、強化しても対象が変わらない", () => {
    const normal = make({ sub: 0, seed: 10 });
    const epic = make({ sub: 4, seed: 11 });
    const all = [normal, epic];

    const onlyEpic = filterEquipment(all, { ...EMPTY_EQUIPMENT_FILTER, rarities: ["EPIC"] }, never);
    expect(onlyEpic).toEqual([epic]);

    // ノーマルを強化してサブが増えても、ノーマルのまま残り続ける
    normal.subStats = [...epic.subStats];
    normal.level = 15;
    expect(filterEquipment(all, { ...EMPTY_EQUIPMENT_FILTER, rarities: ["NORMAL"] }, never)).toEqual([normal]);
    expect(filterEquipment(all, { ...EMPTY_EQUIPMENT_FILTER, rarities: ["EPIC"] }, never)).toEqual([epic]);
  });

  /*
   * 同じ軸の中は「どれか」、軸どうしは「かつ」。
   * 「★6か★5の、速攻シリーズ」という読み方になる。ここが逆だと
   * 条件を足すほど増える/減らない、という直感に反する動きになる。
   */
  it("同じ軸の複数選択はOR、別の軸どうしはAND", () => {
    const six = make({ star: 6, set: "SWIFT", seed: 20 });
    const five = make({ star: 5, set: "SWIFT", seed: 21 });
    const sixOther = make({ star: 6, set: "CRIT", seed: 22 });
    const all = [six, five, sixOther];

    expect(filterEquipment(all, { ...EMPTY_EQUIPMENT_FILTER, stars: [6, 5] }, never)).toHaveLength(3);
    expect(filterEquipment(all, { ...EMPTY_EQUIPMENT_FILTER, stars: [6, 5], sets: ["SWIFT"] }, never)).toEqual([six, five]);
  });

  it("装着中・未装着・ロック中で絞れる", () => {
    const worn = make({ seed: 30 });
    const free = make({ seed: 31 });
    const locked = make({ seed: 32 });
    locked.locked = true;
    const all = [worn, free, locked];
    const isEquipped = (item: Equipment) => item.id === worn.id;

    expect(filterEquipment(all, { ...EMPTY_EQUIPMENT_FILTER, use: "EQUIPPED" }, isEquipped)).toEqual([worn]);
    expect(filterEquipment(all, { ...EMPTY_EQUIPMENT_FILTER, use: "FREE" }, isEquipped)).toEqual([free, locked]);
    expect(filterEquipment(all, { ...EMPTY_EQUIPMENT_FILTER, use: "LOCKED" }, isEquipped)).toEqual([locked]);
  });

  it("札は持っている値だけ出す(12種のシリーズを常に並べない)", () => {
    const all = [make({ star: 6, set: "SWIFT", sub: 4, seed: 40 }), make({ star: 3, set: "CRIT", sub: 0, seed: 41 })];
    const facets = availableEquipmentFacets(all, ORDER);
    expect(facets.sets).toEqual(["CRIT", "SWIFT"]);
    expect(facets.stars).toEqual([3, 6]);
    expect(facets.rarities).toEqual(["NORMAL", "EPIC"]);
  });

  it("絞っている軸の数を数える。畳んでいる時のバッジに使う", () => {
    expect(activeEquipmentFilterCount(EMPTY_EQUIPMENT_FILTER)).toBe(0);
    expect(activeEquipmentFilterCount({ ...EMPTY_EQUIPMENT_FILTER, rarities: ["EPIC", "LEGEND"] })).toBe(1);
    expect(activeEquipmentFilterCount({ ...EMPTY_EQUIPMENT_FILTER, rarities: ["EPIC"], sets: ["SWIFT"], use: "FREE" })).toBe(3);
  });

  it("札は押すたびに出し入れされる", () => {
    expect(toggleEquipmentFilterValue([], "EPIC")).toEqual(["EPIC"]);
    expect(toggleEquipmentFilterValue(["EPIC"], "EPIC")).toEqual([]);
    expect(toggleEquipmentFilterValue(["EPIC"], "LEGEND")).toEqual(["EPIC", "LEGEND"]);
  });
});

/*
 * 強化すると一覧の並びが変わり、押した札が別の場所へ飛んでいた。
 *
 * 「おすすめ順」は `装着中 → 枠 → ★ → 強化値` の順なので、`+1` を押した
 * 瞬間にその装備が前へ動く。装備を選ぶ画面で続けて `+2` を押そうとすると、
 * そこにはもう別の装備が居る——**押すたびにボタンが逃げる**状態だった。
 *
 * 直し方は「画面に居る間だけ並びを固定する」。ここはその固定を当てる関数。
 */
describe("一覧の並びの固定", () => {
  const item = (id: string): Equipment => ({
    id,
    slot: 1,
    star: 5,
    level: 0,
    set: "CRIT",
    mainStat: { type: "ATK_FLAT", value: 10 },
    subStats: [],
    initialSubStatCount: 0,
  });

  it("控えが無ければ、渡された並びをそのまま使う", () => {
    const items = [item("a"), item("b"), item("c")];
    expect(applyEquipmentOrder(items, null).map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(applyEquipmentOrder(items, []).map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("控えた順を保つ。並べ替えの結果が変わっても位置が動かない", () => {
    const locked = ["a", "b", "c", "d"];
    // 強化して「c」が先頭へ動いた後の並び
    const resorted = [item("c"), item("a"), item("b"), item("d")];
    expect(applyEquipmentOrder(resorted, locked).map((e) => e.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("控えた後に増えた装備は末尾へ回す", () => {
    const locked = ["a", "b"];
    const withNew = [item("new2"), item("a"), item("new1"), item("b")];
    expect(applyEquipmentOrder(withNew, locked).map((e) => e.id)).toEqual(["a", "b", "new2", "new1"]);
  });

  it("売った装備は控えに残っていても消える", () => {
    expect(applyEquipmentOrder([item("a"), item("c")], ["a", "b", "c"]).map((e) => e.id)).toEqual(["a", "c"]);
  });
});

/*
 * 一覧を開くたびに全モンスターを走査していると、装備が増えた時に効いてくる。
 * 所持1800個で **597ms → 22ms**。並べ替えの比較から呼ばれる場所なので、
 * 1件ずつ探す形へ戻すと一気に重くなる。
 */
describe("装着判定の作り方", () => {
  it("並べ替えの比較で毎回モンスターを走査しない", () => {
    const source = readFileSync(new URL("../src/web/views/equipment.ts", import.meta.url), "utf8");
    expect(source, "集合を先に作る関数が無い").toContain("function makeIsEquipped(");
    // 1件ずつ持ち主を探す形へ戻していないこと
    expect(source).not.toMatch(/const isEquipped = \(e: Equipment\) => equipmentOwnerName\(/);
  });
});

/*
 * 「1ページで表示する数を増やしたい」という依頼で 24 → 48 にした。
 * 共通の既定(`incrementalGrid.ts` の 24)は他の画面が使い続けるので、
 * 装備だけがこの値を持つ。
 */
describe("一覧の1ページぶん", () => {
  it("装備の一覧は共通の既定より多く描く", async () => {
    const { EQUIPMENT_LIST_PAGE_SIZE } = await import("../src/web/views/equipment.js");
    const { INVENTORY_INITIAL_RENDER_COUNT } = await import("../src/web/incrementalGrid.js");
    expect(EQUIPMENT_LIST_PAGE_SIZE).toBe(48);
    expect(EQUIPMENT_LIST_PAGE_SIZE).toBeGreaterThan(INVENTORY_INITIAL_RENDER_COUNT);
  });
});

/*
 * 「1画面に2行しか見えないので4行にしたい」という依頼で入れた簡易表示。
 *
 * 実測(390×844)で 通常192px → 簡易85px。1画面の行数は 4 → 9。
 * 縮めているのは**サブ4行(67px)と持ち主(19px)を描かないこと**で、
 * 見比べに要る ★・レア度・枠・シリーズ・強化段階・メインの数値は全部残す。
 * ここを `display:none` で隠す形へ変えると、数百枚ぶんのDOMを持ったままになる。
 */
describe("一覧の簡易表示", () => {
  const source = readFileSync(new URL("../src/web/views/equipment.ts", import.meta.url), "utf8");

  it("簡易表示では、サブと持ち主を**描かない**(隠すのではない)", () => {
    expect(source).toContain('dense ? null : el("div", { className: "equip-card__subs" }, subLines)');
    expect(source, "持ち主も描かない").toMatch(/dense\s*\?\s*null\s*:\s*ownerName/);
  });

  it("見比べに要るもの(★・レア度・枠・シリーズ・強化段階・メインの数値)は残す", () => {
    /*
     * これらは `dense` の分岐を通らない＝簡易表示でも必ず描かれる。
     * どれか1つでも `dense ? null :` を付けて落とすと、
     * 「どの装備か」「どれが強いか」が一覧で分からなくなる。
     */
    for (const keep of [
      'el("span", { className: "equip-card__star" }',
      "equipmentRarityTag(equipment)",
      'el("span", { className: "equip-card__slot" }',
      'el("span", { className: "equip-card__set" }',
      'el("span", { className: "equip-card__level" }',
      'el("strong", { className: "equip-card__main-value" }',
    ]) {
      const at = source.indexOf(keep);
      expect(at, `${keep} が無い`).toBeGreaterThan(-1);
      // 直前200文字に dense の分岐が無いこと
      expect(source.slice(Math.max(0, at - 200), at), `${keep} が簡易表示で落ちている`).not.toContain("dense ? null");
    }
  });

  it("装備を選びに来た画面では簡易表示にしない", () => {
    // 札が差分と強化ボタンを抱えているので、縮めると押すところが無くなる
    expect(source).toContain("props.dense && !props.pickerContext");
    expect(source).toContain("props.pickerContext ? null : renderEquipmentListDensityToggle(");
  });

  it("表示密度はセーブデータではなく端末の設定として持つ", async () => {
    const mod = await import("../src/web/equipmentListDensity.js");
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
    };
    expect(mod.loadEquipmentListDense(storage)).toBe(false);
    mod.saveEquipmentListDense(true, storage);
    expect(mod.loadEquipmentListDense(storage)).toBe(true);
    // モンスター側とはキーを分ける(見たい細かさが別なので)
    expect([...store.keys()][0]).toBe("crimon_equipment_list_dense_v1");
  });

  it("書けない端末でも落ちない", async () => {
    const mod = await import("../src/web/equipmentListDensity.js");
    const broken = {
      getItem: () => { throw new Error("使えません"); },
      setItem: () => { throw new Error("使えません"); },
    };
    expect(mod.loadEquipmentListDense(broken)).toBe(false);
    expect(() => mod.saveEquipmentListDense(true, broken)).not.toThrow();
  });
});
