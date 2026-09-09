import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SUMMON_COST_SINGLE, SUMMON_COST_TEN } from "../src/game/gacha.js";
import { createInitialState, type PlayerState } from "../src/game/playerState.js";
import { resolveSummonAgain, type SummonMethod } from "../src/web/views/summon.js";

/**
 * 結果画面の「もう一度」。
 *
 * ## 何が起きていたか
 *
 * ここが**常にダイヤ**だった。書で10連した直後の「もう一度」がダイヤ10連に
 * なるので、書がまだ何十枚もあっても、続けて書で引くには
 * 一度閉じて召喚画面まで戻る必要があった。周回する遊びなのに、
 * **いちばん押される的が、直前と違うことをする**状態だった。
 *
 * ## 決め方
 *
 * 同じ手段が続けられるならそれを出し、続けられない時だけダイヤへ落とす。
 * 書を使い切った人の前に、押せないボタンを出したままにはしない。
 */

function playerWith(over: Partial<PlayerState>): PlayerState {
  return { ...createInitialState(), ...over };
}

describe("書で引いた後は、書で続けられる", () => {
  it("書で10連 → 書が10枚以上あれば、書で10連", () => {
    const player = playerWith({ summonScrolls: 25, crystal: 999_999 });
    const again = resolveSummonAgain(player, { kind: "SCROLL", count: 10 }, 10);
    expect(again.method).toEqual({ kind: "SCROLL", count: 10 });
    expect(again.costIcon).toBe("scroll");
    expect(again.cost).toBe(10);
    expect(again.lead).toBe("書でもう10連");
    expect(again.enabled).toBe(true);
  });

  it("書で1回 → 書が1枚でもあれば、書で1回", () => {
    const player = playerWith({ summonScrolls: 1, crystal: 0 });
    const again = resolveSummonAgain(player, { kind: "SCROLL", count: 1 }, 1);
    expect(again.method).toEqual({ kind: "SCROLL", count: 1 });
    expect(again.cost).toBe(1);
    expect(again.enabled).toBe(true);
  });

  it("ちょうど10枚でも書で10連できる", () => {
    const player = playerWith({ summonScrolls: 10 });
    expect(resolveSummonAgain(player, { kind: "SCROLL", count: 10 }, 10).method)
      .toEqual({ kind: "SCROLL", count: 10 });
  });

  /*
   * **書が尽きたらダイヤへ落とす。**
   * 押せないボタンを出したままにすると、次に何ができるのか分からない。
   */
  it("書が9枚に減ったら、ダイヤの10連へ落ちる", () => {
    const player = playerWith({ summonScrolls: 9, crystal: SUMMON_COST_TEN });
    const again = resolveSummonAgain(player, { kind: "SCROLL", count: 10 }, 10);
    expect(again.method).toEqual({ kind: "CRYSTAL", count: 10 });
    expect(again.costIcon).toBe("crystal");
    expect(again.cost).toBe(SUMMON_COST_TEN);
    expect(again.lead).toBe("もう10連");
    expect(again.enabled).toBe(true);
  });

  it("書も尽きてダイヤも足りなければ、押せない", () => {
    const player = playerWith({ summonScrolls: 0, crystal: 0 });
    const again = resolveSummonAgain(player, { kind: "SCROLL", count: 10 }, 10);
    expect(again.enabled).toBe(false);
  });

  /*
   * **1回ぶんの書しか無い人に、10連を出さない。**
   * 直前が10連でも、落とす先は「引いた数と同じ」ダイヤ10連であって、
   * 書1枚での1回召喚ではない(数が変わると、押した人の期待とずれる)。
   */
  it("書10連の後に書が1枚だけ残っていても、書1回にはしない", () => {
    const player = playerWith({ summonScrolls: 1, crystal: SUMMON_COST_TEN });
    expect(resolveSummonAgain(player, { kind: "SCROLL", count: 10 }, 10).method)
      .toEqual({ kind: "CRYSTAL", count: 10 });
  });
});

describe("特別召喚書も、残っていれば続けられる", () => {
  it("★4以上召喚書 → まだ持っていれば同じ書で", () => {
    const player = playerWith({ fourStarSummonScrolls: 3 });
    const again = resolveSummonAgain(player, { kind: "SPECIAL", type: "FOUR_STAR" }, 1);
    expect(again.method).toEqual({ kind: "SPECIAL", type: "FOUR_STAR" });
    expect(again.costIcon).toBe("scroll");
    expect(again.enabled).toBe(true);
  });

  it("使い切ったら、ダイヤの1回へ落ちる(10連にはしない)", () => {
    const player = playerWith({ fiveStarSummonScrolls: 0, crystal: 999_999 });
    const again = resolveSummonAgain(player, { kind: "SPECIAL", type: "FIVE_STAR" }, 1);
    expect(again.method).toEqual({ kind: "CRYSTAL", count: 1 });
    expect(again.cost).toBe(SUMMON_COST_SINGLE);
  });

  it("3種類それぞれ、自分の持ち数だけを見る", () => {
    const types = [
      ["FOUR_STAR", "fourStarSummonScrolls"],
      ["LIGHT_DARK_FOUR_STAR", "lightDarkFourStarSummonScrolls"],
      ["FIVE_STAR", "fiveStarSummonScrolls"],
    ] as const;
    for (const [type, field] of types) {
      const has = playerWith({ [field]: 1 } as Partial<PlayerState>);
      const none = playerWith({ fourStarSummonScrolls: 0, lightDarkFourStarSummonScrolls: 0, fiveStarSummonScrolls: 0 });
      expect(resolveSummonAgain(has, { kind: "SPECIAL", type }, 1).method, `${type} を持っている`)
        .toEqual({ kind: "SPECIAL", type });
      expect(resolveSummonAgain(none, { kind: "SPECIAL", type }, 1).method.kind, `${type} を持っていない`)
        .toBe("CRYSTAL");
    }
  });
});

describe("ダイヤで引いた後は、今までどおり", () => {
  it("ダイヤ10連 → ダイヤ10連", () => {
    const player = playerWith({ crystal: 999_999, summonScrolls: 50 });
    const again = resolveSummonAgain(player, { kind: "CRYSTAL", count: 10 }, 10);
    expect(again.method).toEqual({ kind: "CRYSTAL", count: 10 });
    expect(again.cost).toBe(SUMMON_COST_TEN);
  });

  it("ダイヤ1回 → ダイヤ1回。書を何枚持っていても勝手に書へ移らない", () => {
    const player = playerWith({ crystal: 999_999, summonScrolls: 50 });
    const again = resolveSummonAgain(player, { kind: "CRYSTAL", count: 1 }, 1);
    expect(again.method).toEqual({ kind: "CRYSTAL", count: 1 });
    expect(again.cost).toBe(SUMMON_COST_SINGLE);
  });

  it("ダイヤが足りなければ押せない", () => {
    const player = playerWith({ crystal: SUMMON_COST_TEN - 1 });
    expect(resolveSummonAgain(player, { kind: "CRYSTAL", count: 10 }, 10).enabled).toBe(false);
  });
});

/**
 * 手段が分からない時。はじまりの10連の直後や、読み込み直しを挟んだ時。
 * **前と同じ振る舞い**(引いた数からダイヤの10連・1回を選ぶ)。
 */
describe("直前の手段が分からない時は、引いた数で決める", () => {
  it("10体出ていればダイヤ10連", () => {
    const player = playerWith({ crystal: 999_999 });
    expect(resolveSummonAgain(player, null, 10).method).toEqual({ kind: "CRYSTAL", count: 10 });
  });

  it("1体ならダイヤ1回", () => {
    const player = playerWith({ crystal: 999_999 });
    expect(resolveSummonAgain(player, null, 1).method).toEqual({ kind: "CRYSTAL", count: 1 });
  });
});

/**
 * 画面側の配線。
 *
 * **押した先が違う関数**なので、ここを間違えるとダイヤが減って書が減らない
 * (あるいはその逆)。型では気づけない。
 */
describe("押した先が手段ごとに分かれている", () => {
  const VIEW = readFileSync(new URL("../src/web/views/summon.ts", import.meta.url), "utf8");

  it("書なら書の関数、特別書なら特別書の関数、ダイヤならダイヤの関数を呼ぶ", () => {
    const block = VIEW.slice(VIEW.indexOf("const again = resolveSummonAgain"), VIEW.indexOf("const omen ="));
    expect(block).toContain('again.method.kind === "SCROLL"');
    expect(block).toContain("props.onUseSummonScroll(again.method.count)");
    expect(block).toContain('again.method.kind === "SPECIAL"');
    expect(block).toContain("props.onUseSpecialSummonScroll(again.method.type)");
    expect(block).toContain("onSummon(again.method.count)");
  });

  /*
   * 他の召喚は保存に失敗したら引かなかったことにしているのに、
   * **特別召喚書だけ素通りしていた。**結果画面から連打できるようになったので揃える。
   */
  it("特別召喚書も、保存できなければ引かなかったことにする", () => {
    const MAIN = readFileSync(new URL("../src/web/main.ts", import.meta.url), "utf8");
    const fn = MAIN.slice(MAIN.indexOf("function handleUseSpecialSummonScroll"));
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    expect(body).toContain("if (!savePlayerState(state.player))");
    expect(body).toContain("removeMonsters(state.player, state.player.monsters.slice(before)");
    expect(body).toContain("state.player[SPECIAL_SCROLL_FIELD[type]] += 1;");
  });
});
