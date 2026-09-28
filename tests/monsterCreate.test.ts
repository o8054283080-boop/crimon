import { describe, expect, it } from "vitest";
import { createMonsterInstance, createdSkillsOf, toBattleDefinition } from "../src/core/monsterInstance.js";
import { findMonsterById } from "../src/data/monsters.js";
import {
  CREATE_GOLD_COST,
  CREATE_MATERIAL_STAR,
  applyMonsterCreate,
  checkMonsterCreate,
  clearMonsterCreate,
  creatableSkills,
  currentSkillOf,
  describeCreatedSkill,
} from "../src/game/monsterCreate.js";

const NO_PARTY: string[] = [];

function target() {
  return createMonsterInstance("slime_FIRE", 4, 30);
}

function material(dexId = "wisp_WATER", star: 1 | 6 = 6) {
  return createMonsterInstance(dexId, star, star === 6 ? 60 : 1);
}

describe("クリエイト(スキル合成)の条件", () => {
  it("星6の素材なら合成できる", () => {
    expect(checkMonsterCreate(target(), material(), NO_PARTY).ok).toBe(true);
  });

  it(`素材が星${CREATE_MATERIAL_STAR}未満なら断る`, () => {
    const check = checkMonsterCreate(target(), material("wisp_WATER", 1), NO_PARTY);
    expect(check.ok).toBe(false);
    expect(check.reason).toContain(`星${CREATE_MATERIAL_STAR}`);
  });

  it("編成中のモンスターは素材にできない", () => {
    const m = material();
    const check = checkMonsterCreate(target(), m, [m.id]);
    expect(check.ok).toBe(false);
    expect(check.reason).toContain("編成中");
  });

  it("ダンジョン編成中のモンスターも素材にできない", () => {
    const m = material();
    const check = checkMonsterCreate(target(), m, NO_PARTY, [m.id]);
    expect(check.ok).toBe(false);
  });

  it("自分自身は素材にできない", () => {
    const t = target();
    expect(checkMonsterCreate(t, t, NO_PARTY).ok).toBe(false);
  });

  it("断る時は必ず理由が付く", () => {
    const check = checkMonsterCreate(target(), material("wisp_WATER", 1), NO_PARTY);
    expect(check.reason).toBeTruthy();
  });
});

describe("クリエイトの実行", () => {
  it("素材のスキル2を、対象のスキル2の枠へ移せる", () => {
    const t = target();
    const m = material();
    const wisp = findMonsterById("wisp_WATER")!;

    const result = applyMonsterCreate(t, m, 1, NO_PARTY);

    expect(result.ok).toBe(true);
    expect(createdSkillsOf(t)).toEqual([{ slot: 1, skillId: wisp.skills[1].id, sourceDexId: "wisp_WATER" }]);
  });

  it("移し替えたスキルが実際の戦闘データに反映される", () => {
    const t = target();
    const dex = findMonsterById(t.dexId)!;
    const before = toBattleDefinition(t, dex);

    applyMonsterCreate(t, material(), 1, NO_PARTY);
    const after = toBattleDefinition(t, dex);

    const wisp = findMonsterById("wisp_WATER")!;
    expect(after.skills[1].name).toBe(wisp.skills[1].name);
    expect(after.skills[1].name).not.toBe(before.skills[1].name);
    // 移していない枠は元のまま
    expect(after.skills[0].name).toBe(before.skills[0].name);
    expect(after.skills[2].name).toBe(before.skills[2].name);
  });

  it("スキル3の枠も同じように移せる", () => {
    const t = target();
    applyMonsterCreate(t, material(), 2, NO_PARTY);
    const dex = findMonsterById(t.dexId)!;
    const wisp = findMonsterById("wisp_WATER")!;
    expect(toBattleDefinition(t, dex).skills[2].name).toBe(wisp.skills[2].name);
  });

  /*
   * **移し替えはスキル2・スキル3の枠ごとに1つずつ持てる。**
   * 依頼主の指摘(2026-09-28): スキル3を継承した後に同じモンスターでスキル2を継承したら、
   * スキル3が元に戻って星6の素材が無駄になった。本来の構想は「両方とも変わる」。
   */
  it("スキル3を移した後にスキル2を移すと、両方とも移し替わったまま", () => {
    const t = target();
    applyMonsterCreate(t, material("wisp_WATER"), 2, NO_PARTY);
    const second = applyMonsterCreate(t, material("imp_DARK"), 1, NO_PARTY);

    expect(second.ok).toBe(true);
    expect(second.replaced).toBeUndefined();
    const wisp = findMonsterById("wisp_WATER")!;
    const imp = findMonsterById("imp_DARK")!;
    const dex = findMonsterById(t.dexId)!;
    const def = toBattleDefinition(t, dex);
    expect(def.skills[1].id).toBe(imp.skills[1].id);
    expect(def.skills[2].id).toBe(wisp.skills[2].id);
    expect(createdSkillsOf(t).map((c) => [c.slot, c.sourceDexId])).toEqual([[1, "imp_DARK"], [2, "wisp_WATER"]]);
  });

  it("同じ枠へ合成した時だけ、その枠の前の移し替えと置き換わる", () => {
    const t = target();
    applyMonsterCreate(t, material("wisp_WATER"), 2, NO_PARTY);
    applyMonsterCreate(t, material("wisp_WATER"), 1, NO_PARTY);
    const first3 = createdSkillsOf(t).find((c) => c.slot === 2);

    const again = applyMonsterCreate(t, material("imp_DARK"), 2, NO_PARTY);

    expect(again.ok).toBe(true);
    expect(again.replaced).toEqual(first3);
    // スキル2の移し替えは残っている
    expect(createdSkillsOf(t).map((c) => [c.slot, c.sourceDexId])).toEqual([[1, "wisp_WATER"], [2, "imp_DARK"]]);
  });

  it("旧形式(1体に1つ)の移し替えを持つ個体も、別の枠へ移すと両方残る", () => {
    const t = target();
    const wisp = findMonsterById("wisp_WATER")!;
    t.createdSkill = { slot: 2, skillId: wisp.skills[2].id, sourceDexId: "wisp_WATER" };
    applyMonsterCreate(t, material("imp_DARK"), 1, NO_PARTY);
    // 書き込んだ時点で旧形式の欄は新形式へ移り、消えている
    expect(t.createdSkill).toBeUndefined();
    expect(createdSkillsOf(t).map((c) => [c.slot, c.sourceDexId])).toEqual([[1, "imp_DARK"], [2, "wisp_WATER"]]);
  });

  it("取り消しは枠ごと。もう一方の枠は残る", () => {
    const t = target();
    applyMonsterCreate(t, material("wisp_WATER"), 1, NO_PARTY);
    applyMonsterCreate(t, material("imp_DARK"), 2, NO_PARTY);
    expect(clearMonsterCreate(t, 1)).toBe(true);
    expect(createdSkillsOf(t).map((c) => c.slot)).toEqual([2]);
    expect(clearMonsterCreate(t, 1)).toBe(false);
  });

  it("同じスキルを移そうとしても意味がないので断る", () => {
    const t = createMonsterInstance("wisp_WATER", 4, 30);
    const m = createMonsterInstance("wisp_WATER", 6, 60);
    const result = applyMonsterCreate(t, m, 1, NO_PARTY);
    expect(result.ok).toBe(false);
  });

  it("条件を満たさない合成は、対象を書き換えない", () => {
    const t = target();
    const result = applyMonsterCreate(t, material("wisp_WATER", 1), 1, NO_PARTY);
    expect(result.ok).toBe(false);
    expect(createdSkillsOf(t)).toEqual([]);
  });

  it("取り消すと元のスキルへ戻る", () => {
    const t = target();
    const dex = findMonsterById(t.dexId)!;
    applyMonsterCreate(t, material(), 1, NO_PARTY);
    expect(clearMonsterCreate(t)).toBe(true);
    expect(createdSkillsOf(t)).toEqual([]);
    expect(toBattleDefinition(t, dex).skills[1].name).toBe(dex.skills[1].name);
  });
});

describe("表示用の情報", () => {
  it("素材が出せるスキルは、スキル2と3の2つ", () => {
    const list = creatableSkills(material());
    expect(list.map((s) => s.slot)).toEqual([1, 2]);
    expect(list.every((s) => s.skill.name.length > 0)).toBe(true);
  });

  it("いま入っているスキルを引ける(移し替え後は移した側)", () => {
    const t = target();
    const dex = findMonsterById(t.dexId)!;
    expect(currentSkillOf(t, 1)?.id).toBe(dex.skills[1].id);

    applyMonsterCreate(t, material(), 1, NO_PARTY);
    const wisp = findMonsterById("wisp_WATER")!;
    expect(currentSkillOf(t, 1)?.id).toBe(wisp.skills[1].id);
  });

  it("どこから何を移したかが文字で分かる", () => {
    const t = target();
    applyMonsterCreate(t, material(), 1, NO_PARTY);
    const text = describeCreatedSkill(createdSkillsOf(t)[0]);
    expect(text).toContain("スキル2");
    expect(text).toContain("ウィスプ");
  });
});

describe("スキル継承の費用", () => {
  /*
   * 移し替えは長いあいだ**完全に無料**だった。素材のモンスターを1体失うだけで、
   * ゴールドは1枚も要らない。ここへ一律 500,000G を置く(依頼主の指定)。
   *
   * `wallet` を渡さない呼び出しは無料のまま——道具やテストから
   * 「費用の話ぬきで移し替えだけ試す」道を残してある。画面からは必ず渡す。
   */
  it("財布を渡すと一律500,000Gを引く", () => {
    expect(CREATE_GOLD_COST).toBe(500_000);
    const wallet = { gold: 1_200_000 };
    expect(applyMonsterCreate(target(), material(), 1, NO_PARTY, [], wallet).ok).toBe(true);
    expect(wallet.gold).toBe(700_000);
    expect(applyMonsterCreate(target(), material(), 1, NO_PARTY, [], wallet).ok).toBe(true);
    expect(wallet.gold).toBe(200_000);
  });

  it("スキルの枠や星が変わっても額は同じ", () => {
    // 「一律」なので、slot・素材・対象で値段が動いてはいけない
    for (const slot of [1, 2] as const) {
      const wallet = { gold: CREATE_GOLD_COST };
      expect(applyMonsterCreate(target(), material(), slot, NO_PARTY, [], wallet).ok).toBe(true);
      expect(wallet.gold).toBe(0);
    }
  });

  it("足りなければ、モンスターもゴールドも動かさない", () => {
    const t = target();
    const m = material();
    const wallet = { gold: CREATE_GOLD_COST - 1 };
    const result = applyMonsterCreate(t, m, 1, NO_PARTY, [], wallet);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("ゴールドが足りません");
    expect(wallet.gold).toBe(CREATE_GOLD_COST - 1);
    expect(createdSkillsOf(t)).toEqual([]);
  });

  it("断られた移し替えでは請求しない", () => {
    /*
     * **払わせてから断る、が起きないこと。**
     * 同じスキルへの移し替えは意味が無いので断られる。その時に
     * ゴールドだけ消えていたら、押した側からは何が起きたのか分からない。
     */
    const t = target();
    const wallet = { gold: 1_000_000 };
    const same = applyMonsterCreate(t, material("slime_WATER"), 1, NO_PARTY, [], wallet);
    expect(same.ok).toBe(false);
    expect(wallet.gold).toBe(1_000_000);
  });

  it("財布を渡さない呼び出しは無料のまま", () => {
    const t = target();
    expect(applyMonsterCreate(t, material(), 1, NO_PARTY).ok).toBe(true);
    expect(createdSkillsOf(t)).toHaveLength(1);
  });
});

describe("アリーナの防衛データ", () => {
  it("スキル2・スキル3の両方の移し替えが、防衛データから組んだ戦闘の定義にも乗る", async () => {
    const { snapshotUnitToDefinition } = await import("../src/game/arena/snapshot.js");
    const t = createMonsterInstance("slime_FIRE", 6, 60);
    applyMonsterCreate(t, createMonsterInstance("wisp_WATER", 6, 60), 1, NO_PARTY);
    applyMonsterCreate(t, createMonsterInstance("imp_DARK", 6, 60), 2, NO_PARTY);
    const def = snapshotUnitToDefinition({ instance: structuredClone(t), equipment: [] })!;
    expect(def.skills[1].id).toBe(findMonsterById("wisp_WATER")!.skills[1].id);
    expect(def.skills[2].id).toBe(findMonsterById("imp_DARK")!.skills[2].id);
  });

  it("登録済みの旧形式(createdSkill 1つ)の防衛データも、そのまま効く", async () => {
    const { snapshotUnitToDefinition } = await import("../src/game/arena/snapshot.js");
    const t = createMonsterInstance("slime_FIRE", 6, 60);
    const wisp = findMonsterById("wisp_WATER")!;
    t.createdSkill = { slot: 2, skillId: wisp.skills[2].id, sourceDexId: "wisp_WATER" };
    const def = snapshotUnitToDefinition({ instance: t, equipment: [] })!;
    expect(def.skills[2].id).toBe(wisp.skills[2].id);
  });
});
