import { describe, expect, it } from "vitest";
import { createMonsterInstance, toBattleDefinition } from "../src/core/monsterInstance.js";
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
    expect(t.createdSkill).toEqual({ slot: 1, skillId: wisp.skills[1].id, sourceDexId: "wisp_WATER" });
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

  it("**持てる移し替えは常に1つだけ**。別のを合成すると置き換わる", () => {
    const t = target();
    applyMonsterCreate(t, material("wisp_WATER"), 1, NO_PARTY);
    const first = t.createdSkill;

    const second = applyMonsterCreate(t, material("imp_DARK"), 2, NO_PARTY);

    expect(second.ok).toBe(true);
    expect(second.replaced).toEqual(first);
    expect(t.createdSkill?.sourceDexId).toBe("imp_DARK");
    expect(t.createdSkill?.slot).toBe(2);

    // 前の枠は元のスキルへ戻っている
    const dex = findMonsterById(t.dexId)!;
    expect(toBattleDefinition(t, dex).skills[1].name).toBe(dex.skills[1].name);
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
    expect(t.createdSkill).toBeUndefined();
  });

  it("取り消すと元のスキルへ戻る", () => {
    const t = target();
    const dex = findMonsterById(t.dexId)!;
    applyMonsterCreate(t, material(), 1, NO_PARTY);
    expect(clearMonsterCreate(t)).toBe(true);
    expect(t.createdSkill).toBeUndefined();
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
    const text = describeCreatedSkill(t.createdSkill!);
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
    expect(t.createdSkill).toBeUndefined();
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
    expect(t.createdSkill).toBeDefined();
  });
});
