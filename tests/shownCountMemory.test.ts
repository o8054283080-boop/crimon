import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import {
  INVENTORY_INITIAL_RENDER_COUNT,
  forgetShownCounts,
  plannedInitialCount,
  rememberShownCount,
  rememberedShownCount,
} from "../src/web/incrementalGrid.js";

/**
 * 「さらに表示」で増やした件数を覚える。
 *
 * ## 何が起きていたか
 *
 * これらの画面は、**何か操作するたびに丸ごと組み直す。**
 * ロックを掛ける、素材に選ぶ、編成へ入れる——どれも `render()` を通るので、
 * グリッドも新しく作られ、表示数が24件へ巻き戻っていた。
 *
 *   100体持っている人が「さらに表示」を3回押して72件出す
 *   → 1体ロックする
 *   → **また24件に戻り、3回押し直す**
 *
 * 選ぶ操作が続くほど押し直しが増えるので、**選ぶための画面ほど辛い。**
 * 8つの画面すべてで同じことが起きていた。
 */

beforeEach(() => forgetShownCounts());

describe("描き直しても、押したぶんが残る", () => {
  it("72件まで出していたら、次も72件から始まる", () => {
    rememberShownCount("monsters", 72);
    expect(plannedInitialCount("monsters", INVENTORY_INITIAL_RENDER_COUNT, 100)).toBe(72);
  });

  it("何も押していなければ、最初の24件だけ", () => {
    expect(plannedInitialCount("monsters", INVENTORY_INITIAL_RENDER_COUNT, 100)).toBe(24);
  });

  it("合言葉を渡さない一覧は、毎回24件から", () => {
    rememberShownCount(undefined, 72);
    expect(plannedInitialCount(undefined, INVENTORY_INITIAL_RENDER_COUNT, 100)).toBe(24);
  });

  it("画面ごとに別々に覚える", () => {
    rememberShownCount("monsters", 72);
    rememberShownCount("equipment", 48);
    expect(rememberedShownCount("monsters")).toBe(72);
    expect(rememberedShownCount("equipment")).toBe(48);
    expect(rememberedShownCount("party")).toBe(0);
  });
});

describe("並べられる数は超えない", () => {
  it("絞り込みで10件になったら、10件しか出さない", () => {
    rememberShownCount("monsters", 72);
    expect(plannedInitialCount("monsters", INVENTORY_INITIAL_RENDER_COUNT, 10)).toBe(10);
  });

  it("1件も無ければ0件", () => {
    rememberShownCount("monsters", 72);
    expect(plannedInitialCount("monsters", INVENTORY_INITIAL_RENDER_COUNT, 0)).toBe(0);
  });
});

/**
 * **減った時に覚え直さない。**
 *
 * 絞り込みで10件に減った時、そこで10と覚えてしまうと、
 * 絞り込みを外した後も10件しか出なくなる。押した回数は減っていない。
 */
describe("絞り込みで減っても、押した回数は忘れない", () => {
  it("72件出した後に10件へ絞っても、外せば72件に戻る", () => {
    rememberShownCount("monsters", 72);
    // 絞り込みで10件になり、その10件を描いた
    rememberShownCount("monsters", 10);
    expect(rememberedShownCount("monsters")).toBe(72);
    // 絞り込みを外すと、また72件から
    expect(plannedInitialCount("monsters", INVENTORY_INITIAL_RENDER_COUNT, 100)).toBe(72);
  });
});

/**
 * **画面を移ったら忘れる。**
 *
 * 別の場所から入り直した時にまで何百件も並べると、
 * 速さのために段階描画を入れた意味が無くなる
 * (アリーナの編成では、全件DOM化で1体選ぶのに246〜286msかかっていた)。
 */
describe("画面を移ったら忘れる", () => {
  it("忘れると、また24件から始まる", () => {
    rememberShownCount("monsters", 72);
    forgetShownCounts();
    expect(rememberedShownCount("monsters")).toBe(0);
    expect(plannedInitialCount("monsters", INVENTORY_INITIAL_RENDER_COUNT, 100)).toBe(24);
  });

  it("画面を移る時に忘れる処理が繋がっている", () => {
    const MAIN = readFileSync("src/web/main.ts", "utf8");
    const navigate = MAIN.slice(MAIN.indexOf("function navigate(screen: ScreenName)"));
    expect(navigate.slice(0, navigate.indexOf("\n}\n"))).toContain("forgetShownCounts();");
  });
});

/**
 * 巻き戻っていた8つの画面すべてに合言葉が渡っていること。
 *
 * **1つ漏らすと、その画面だけ押し直しが残る。**
 * どれも「選ぶ・ロックする」ための画面なので、症状は同じ。
 */
describe("巻き戻っていた画面すべてに合言葉が付いている", () => {
  const CASES: [string, string][] = [
    ["src/web/views/monsters.ts", "monsters"],
    ["src/web/views/monsters.ts", "rankUpMaterials"],
    ["src/web/views/equipment.ts", "equipment"],
    ["src/web/views/party.ts", "party"],
    ["src/web/views/monsterTraining.ts", "trainingMaterials"],
    ["src/web/views/monsterCreate.ts", "createMaterials"],
    ["src/web/views/arena/teams.ts", "arenaTeam"],
    ["src/web/views/monsterExchange.ts", "monsterExchange"],
  ];

  for (const [file, key] of CASES) {
    it(`${key} (${file.split("/").pop()})`, () => {
      expect(readFileSync(file, "utf8")).toContain(`memoryKey: `);
      expect(readFileSync(file, "utf8")).toContain(key);
    });
  }

  it("段階描画を使うすべての呼び出しに合言葉が付いている", () => {
    const files = [...new Set(CASES.map(([file]) => file))];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const calls = source.match(/createIncrementalGrid[<(]/g)?.length ?? 0;
      const keys = source.match(/memoryKey:/g)?.length ?? 0;
      expect(keys, `${file}: 呼び出し ${calls} に対し合言葉 ${keys}`).toBe(calls);
    }
  });
});
