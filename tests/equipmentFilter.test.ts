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
 * 「文字や星を小さくして2列を4列にしたい」という依頼で入れた簡易表示。
 *
 * 実測(390×844): 2列192px → **4列**。
 * 落としているのは持ち主・枠番号・シリーズで、
 * 残すのは「その装備を選ぶ理由」——★・レア度・強化段階・メインの数値・**サブ4行**。
 * 隠す(`display:none`)のではなく**描かない**。数百枚を並べる画面なので、
 * 持っているだけで組み直しの費用が掛かる。
 *
 * **サブは一度落として、依頼主に戻された。**幅に収まらないことを理由に
 * 消したが、装備を見比べる時にいちばん読むのがそこで、無いと一覧の用が
 * 足りない。収める方(名前の短縮)で解いている。
 *
 * 79pxの札に収めるまでに3回はみ出した。**どれも実機で見るまで気付けなかった**:
 *   1. 鍵が右上でレア度の札に重なり「エピック」が読めない
 *   2. 強化段階「+0」が★とレア度の両方に重なる(縦に積んだ塊の右へ来ていた)
 *   3. 「レジェンド」が紋章に押されて右端で切れる
 */
describe("一覧の簡易表示", () => {
  const source = readFileSync(new URL("../src/web/views/equipment.ts", import.meta.url), "utf8");

  it("簡易表示でも**サブは描く**。持ち主だけ描かない(隠すのではない)", () => {
    expect(source, "サブを条件分岐で落としている").not.toContain(
      'dense ? null : el("div", { className: "equip-card__subs" }, subLines)',
    );
    expect(source, "サブが無条件に描かれていない").toContain('el("div", { className: "equip-card__subs" }, subLines)');
    expect(source, "持ち主は描かない").toMatch(/dense\s*\?\s*null\s*:\s*ownerName/);
  });

  /*
   * 79pxの札に「効果命中%」と数値は並ばない。名前だけ短縮形にする。
   * **「攻」「防」まで削ると攻撃力%と攻撃力+を読み違える**ので、
   * 記号(+/%)は必ず残す。
   */
  it("簡易表示のサブは名前を短縮し、数値は切らない", async () => {
    const { STAT_LABEL_SHORT, STAT_LABEL } = await import("../src/core/equipment.js");
    for (const [type, label] of Object.entries(STAT_LABEL)) {
      const short = STAT_LABEL_SHORT[type as keyof typeof STAT_LABEL];
      expect(short, `${type} に短縮名が無い`).toBeTruthy();
      expect([...short].length, `${type} の短縮名が長すぎる`).toBeLessThanOrEqual(4);
      expect([...short].length, `${type} は短くなっていない`).toBeLessThanOrEqual([...label].length);
    }
    /*
     * **実数と割合の別だけは絶対に落とさない。**
     * 攻撃力・防御力・HPは「+」と「%」の両方があり、
     * ここを削ると「攻撃 36」と「攻撃 3.8」が同じ名前で並ぶ。
     * 「クリ率」「クリダメ」は割合しか無いので%を削ってよい。
     */
    for (const type of ["ATK_FLAT", "ATK_PERCENT", "DEF_FLAT", "DEF_PERCENT", "HP_FLAT", "HP_PERCENT"] as const) {
      const suffix = STAT_LABEL[type].slice(-1);
      expect(STAT_LABEL_SHORT[type].endsWith(suffix), `${type} の「${suffix}」が落ちている`).toBe(true);
    }
    expect(source).toContain("dense ? STAT_LABEL_SHORT[s.type] : STAT_LABEL[s.type]");

    const css = readFileSync(new URL("../src/web/ui/equipmentList.css", import.meta.url), "utf8");
    // 縮んだ時に削るのは名前だけ。数値が切れると「3.8%」が「3.8」になる
    const value = css.slice(css.indexOf(".equipment-screen .equip-card__sub-value {"));
    expect(value.slice(0, value.indexOf("}"))).toContain("flex: none");
  });

  /*
   * サブを足したら、右下に浮かせた鍵が4行にまるごと被った。
   *
   * 角に浮かせている限り、下へ何かを足すたびに同じ事故が起きる。
   * **札の下に鍵ぶんの余白を確保し、そこだけを鍵に渡す**形にしてある。
   * `padding-bottom` を外すと即座に重なるので、対にして見張る。
   */
  it("簡易表示の鍵は札の下端の帯。中身と場所を取り合わない", () => {
    const css = readFileSync(new URL("../src/web/ui/equipmentList.css", import.meta.url), "utf8");
    const card = css.slice(css.indexOf(".equipment-screen .equip-card--dense {"));
    const cardBlock = card.slice(0, card.indexOf("}"));
    // `padding: 上 左右 下` の3つ目。ここが鍵の居場所
    const 余白 = /padding:\s*(\d+)px\s+(\d+)px\s+(\d+)px/.exec(cardBlock);
    expect(余白, "簡易表示の札に鍵ぶんの下余白が無い").not.toBeNull();
    expect(Number(余白![3]), "下余白が鍵(22px)より狭い").toBeGreaterThanOrEqual(22);

    const lock = css.slice(css.indexOf(":has(.equip-card--dense) .equip-card__lock-button {"));
    const lockBlock = lock.slice(0, lock.indexOf("}"));
    expect(lockBlock, "鍵が下端に張り付いていない").toContain("bottom:");
    expect(lockBlock, "鍵が帯になっていない(角に浮くとサブに被る)").toContain("left:");
    expect(/height:\s*(\d+)px/.exec(lockBlock), "鍵の高さが決まっていない").not.toBeNull();
    expect(Number(/height:\s*(\d+)px/.exec(lockBlock)![1]), "帯が薄すぎて押せない").toBeGreaterThanOrEqual(22);
  });

  /*
   * 列数の境界は**いちばん長いサブが入るか**で決めてある。
   * 最悪は強化しきった「クリダメ 35.7%」で、実測65px要る。
   * 4列にした時の1行の幅は 360px→63px / 375px→67px / 390px→71px なので、
   * 390pxで初めて余る。380px未満は3列。
   */
  it("狭い画面では列を減らす。名前を省略記号で潰さない", () => {
    const css = readFileSync(new URL("../src/web/ui/equipmentList.css", import.meta.url), "utf8");
    const at = css.indexOf("@media (max-width: 379px)");
    expect(at, "狭い画面を3列にする指定が無い").toBeGreaterThan(-1);
    expect(css.slice(at, at + 200)).toContain("repeat(3, minmax(0, 1fr))");
  });

  /*
   * 簡易表示は「枠1」の行を落としているので、**枠を語るのは左上の印だけ**になる。
   * 剣・羽・盾・珠・兜・環の6つを20pxで描き分けるのは実機では無理で、
   * 依頼主から「どのスロットか分かりにくい」と指摘を受けた。
   * 台座はそのまま、中身だけを枠番号そのものにしてある。
   */
  it("簡易表示の枠印は絵ではなく番号", () => {
    expect(source).toContain("dense ? String(equipment.slot) : icon(slotIcon(equipment.slot))");
    expect(source).toContain('equip-card__sigil${dense ? " equip-card__sigil--number" : ""}');
    const css = readFileSync(new URL("../src/web/ui/equipmentList.css", import.meta.url), "utf8");
    expect(css, "数字の見た目が決まっていない").toContain(".equip-card__sigil--number");
  });

  it("4列にする。文字と★も詰める", () => {
    const css = readFileSync(new URL("../src/web/ui/equipmentList.css", import.meta.url), "utf8");
    expect(css).toContain("grid-template-columns: repeat(4, minmax(0, 1fr))");
    // ★は数字表記(★6)にする。79pxの札に6つ並べると強化段階の下へ潜る
    expect(source).toContain("dense ? `★${equipment.star}` : \"★\".repeat(equipment.star)");
  });

  /*
   * 狭い札で3回はみ出した。**位置を決め打ちして逃がすやり方は失敗している。**
   *
   * 最後に効いたのは「重なりようのない形にする」ことだった:
   *   ・★と強化段階を**同じ flex 行の兄弟**にする(場所を取り合う)
   *   ・レア度は独立した行へ出す(幅いっぱいを使えるので「レジェンド」が切れない)
   *   ・鍵は右下へ(上はもう★と強化段階で埋まっている)
   *
   * 縦積みの塊の中に★を入れて `margin-left:auto` や `position:absolute` で
   * 逃がそうとすると、塊が縮んだ時に★がはみ出して**必ずどこかで重なる**。
   */
  it("★と強化段階は同じ行の兄弟。位置の決め打ちで逃がさない", () => {
    const css = readFileSync(new URL("../src/web/ui/equipmentList.css", import.meta.url), "utf8");
    const head = source.slice(source.indexOf('el("div", { className: "equip-card__head" }'), source.indexOf('className: "equip-card__main"'));
    expect(head, "★が見出しの行に無い").toContain('className: "equip-card__star"');
    expect(head, "強化段階が見出しの行に無い").toContain('className: "equip-card__level"');
    // 簡易表示で強化段階を絶対配置へ戻していないこと
    expect(css).not.toMatch(/\.equip-card--dense \.equip-card__level \{[\s\S]{0,120}position: absolute/);
    // 鍵は右下
    expect(css, "鍵が右上のままだとレア度に重なる").toMatch(/:has\(\.equip-card--dense\) \.equip-card__lock-button[\s\S]{0,120}bottom:/);
  });

  it("レア度は通常表示でも簡易表示でも独立した行に出す", () => {
    expect(source).toContain('el("div", { className: "equip-card__rarity-row" }, [equipmentRarityTag(equipment)])');
    // 条件分岐で片方だけにしていないこと
    expect(source).not.toContain('dense ? el("div", { className: "equip-card__rarity-row" }');
  });

  it("見比べに要るもの(★・レア度・強化段階・メインの数値)は簡易表示でも残す", () => {
    /*
     * どれか1つでも落とすと「どの装備か」「どれが強いか」が一覧で分からなくなる。
     * 枠番号とシリーズは落としてよい——枠は紋章が語り、
     * シリーズは絞り込みで選べるようになったため。
     */
    for (const keep of [
      'el("span", { className: "equip-card__star" }',
      'el("span", { className: "equip-card__level" }',
      'el("strong", { className: "equip-card__main-value" }',
    ]) {
      const at = source.indexOf(keep);
      expect(at, `${keep} が無い`).toBeGreaterThan(-1);
      expect(source.slice(Math.max(0, at - 160), at), `${keep} が簡易表示で落ちている`).not.toContain("dense ? null");
    }
    // レア度は独立した行に必ず出る
    expect(source).toContain('el("div", { className: "equip-card__rarity-row" }, [equipmentRarityTag(equipment)])');
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
    // 何も保存されていなければ簡易表示(4列)から始める
    expect(mod.loadEquipmentListDense(storage)).toBe(true);
    // 一度でも切り替えた人の設定は尊重する
    mod.saveEquipmentListDense(false, storage);
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
    expect(mod.loadEquipmentListDense(broken)).toBe(true);
    expect(() => mod.saveEquipmentListDense(true, broken)).not.toThrow();
  });
});

/*
 * シリーズ名が実機で「的中」→「的…」、「免疫」→「免…」と潰れていた。
 *
 * `text-overflow: ellipsis` を付けていたためで、**字幅はフォントで変わる**
 * ので開発機のChromiumでは足りて実機のiOSでは足りない、という差が出る。
 * シリーズ名は12種すべて2文字なので、潰す余地は要らない。
 */
describe("シリーズ名は省略しない", () => {
  it("12種すべて2文字。省略記号を出す指定を持たない", async () => {
    const { SET_LABEL, SET_TYPES } = await import("../src/core/equipment.js");
    for (const type of SET_TYPES) {
      expect([...SET_LABEL[type]].length, `${type} の名前が2文字ではない`).toBe(2);
    }

    const css = readFileSync(new URL("../src/web/style.css", import.meta.url), "utf8");
    const at = css.indexOf(".equip-card__set {", css.indexOf(".equip-card__slot"));
    expect(at, "一覧のシリーズ名の指定が無い").toBeGreaterThan(-1);
    const block = css.slice(at, css.indexOf("}", at));
    expect(block, "省略記号を出す指定が戻っている").not.toContain("text-overflow");
    expect(block, "縮む余地があると潰れる").toContain("flex: none");
  });
});
