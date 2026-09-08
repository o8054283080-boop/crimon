import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SKILL_PIG, findMonsterById } from "../src/data/monsters.js";
import { ALL_DISPLAYABLE_MONSTERS_DEX } from "../src/data/monsters.js";
import { addMonster, createInitialState, normalizeLoadedState, type PlayerState } from "../src/game/playerState.js";
import {
  MONSTER_POINT_ITEMS,
  canSendMonster,
  findMonsterPointItem,
  monsterPointsOf,
  monsterPointsOwned,
  sendMonstersForPoints,
  totalMonsterPoints,
  tryExchangeMonsterPoints,
} from "../src/game/monsterPoints.js";
import { rareCountOf, selectionBreakdown } from "../src/web/views/monsterExchange.js";

/**
 * モンスターポイント。**余った仲間の出口。**
 *
 * ここまで手持ちを減らす道は「ランクアップの素材」と「経験値・スキルの素材」だけで、
 * どちらも**使える相手が居る時にしか消化できなかった。**
 * 星3を100体持っていても、星3を育てる時以外は何にもならない。
 *
 * ここで見張るのは3つ。
 *
 *   1. 星の数がそのままポイントになる
 *   2. **育てた子を守る**(編成中・鍵つきは送れない)
 *   3. **輪が閉じない**(書→召喚→モンスター→ポイント→書 で増え続けない)
 */

const DEX_IDS = ALL_DISPLAYABLE_MONSTERS_DEX.map((dex) => dex.id);

function stateWith(stars: readonly (1 | 2 | 3 | 4 | 5 | 6)[]): PlayerState {
  const state = createInitialState();
  state.monsters = [];
  state.partyIds = [];
  for (const [i, star] of stars.entries()) addMonster(state, DEX_IDS[i % DEX_IDS.length], star);
  return state;
}

describe("星の数がそのままポイントになる", () => {
  it("星3を3体で9ポイント", () => {
    const state = stateWith([3, 3, 3]);
    expect(totalMonsterPoints(state.monsters)).toBe(9);
  });

  it("1体ずつの値は星と同じ", () => {
    for (const star of [1, 2, 3, 4, 5, 6] as const) {
      expect(monsterPointsOf({ star })).toBe(star);
    }
  });

  it("混ざっていても足し合わせるだけ", () => {
    const state = stateWith([3, 4, 5, 6]);
    const result = sendMonstersForPoints(state, state.monsters.map((m) => m.id));
    expect(result?.gained).toBe(18);
    expect(result?.sent).toBe(4);
    expect(state.monsters).toHaveLength(0);
  });
});

/**
 * 送るのは取り返しがつかない。守りは3つ重ねてある。
 * **1つでも抜けると、育てた子が黙って消える。**
 */
describe("育てた子を守る", () => {
  it("鍵をかけた子は送れない", () => {
    const state = stateWith([3, 3]);
    state.monsters[0].locked = true;
    expect(canSendMonster(state, state.monsters[0])).toBe(false);

    const result = sendMonstersForPoints(state, state.monsters.map((m) => m.id));
    expect(result?.sent, "鍵つきまで送っている").toBe(1);
    expect(state.monsters).toHaveLength(1);
    expect(state.monsters[0].locked).toBe(true);
  });

  /*
   * **編成は4か所ある。**通常編成だけを見て「ダンジョン編成の子が消えた」を
   * 起こすと、次に潜る時まで誰も気づけない。
   */
  it("どの編成に入っていても送れない", () => {
    const fields = ["partyIds", "dungeonPartyIds", "towerPartyIds", "arenaDefenseIds", "arenaOffenseIds"] as const;
    for (const field of fields) {
      const state = stateWith([3]);
      (state[field] as string[]) = [state.monsters[0].id];
      expect(canSendMonster(state, state.monsters[0]), `${field} の子が送れてしまう`).toBe(false);
      expect(sendMonstersForPoints(state, [state.monsters[0].id]), `${field}`).toBeNull();
      expect(state.monsters, `${field}`).toHaveLength(1);
    }
  });

  it("送れない子ばかりなら、何も起きずポイントも増えない", () => {
    const state = stateWith([3, 4]);
    state.monsters.forEach((monster) => { monster.locked = true; });
    expect(sendMonstersForPoints(state, state.monsters.map((m) => m.id))).toBeNull();
    expect(monsterPointsOwned(state)).toBe(0);
    expect(state.monsters).toHaveLength(2);
  });

  /*
   * 送れない子が混ざっていても**そこで止めない。**
   * 途中で止めると「何体送れたのか分からない」状態になる。
   */
  it("送れる子だけを送り、途中で止めない", () => {
    const state = stateWith([3, 4, 5]);
    state.monsters[1].locked = true;
    const ids = state.monsters.map((m) => m.id);
    const result = sendMonstersForPoints(state, ids);
    expect(result?.sent).toBe(2);
    expect(result?.gained).toBe(8); // 3 + 5
    expect(state.monsters.map((m) => m.star)).toEqual([4]);
  });
});

describe("ポイントの持ち越し", () => {
  it("送るたびに足される", () => {
    const state = stateWith([3, 3, 4]);
    sendMonstersForPoints(state, [state.monsters[0].id]);
    expect(monsterPointsOwned(state)).toBe(3);
    sendMonstersForPoints(state, [state.monsters[0].id, state.monsters[1].id]);
    expect(monsterPointsOwned(state)).toBe(10);
  });

  /** 前から遊んでいる人の控えには無い。**0から始まる** */
  it("旧セーブは0から始まる", () => {
    const state = createInitialState();
    delete (state as { monsterPoints?: number }).monsterPoints;
    const normalized = normalizeLoadedState(state);
    expect(monsterPointsOwned(normalized)).toBe(0);
  });

  it("壊れた値でも0に直す", () => {
    for (const broken of [-5, Number.NaN, "10" as unknown as number, 3.7]) {
      const state = createInitialState();
      state.monsterPoints = broken;
      const normalized = normalizeLoadedState(state);
      expect(normalized.monsterPoints, String(broken)).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(normalized.monsterPoints), String(broken)).toBe(true);
    }
  });
});

describe("交換する", () => {
  it("召喚の書が増え、ポイントが減る", () => {
    const state = createInitialState();
    state.monsterPoints = 30;
    const before = state.summonScrolls;
    const result = tryExchangeMonsterPoints(state, "scroll_1");
    expect(result?.remaining).toBe(0);
    expect(state.summonScrolls).toBe(before + 1);
  });

  it("10連ぶんは10枚まとめて増える", () => {
    const state = createInitialState();
    state.monsterPoints = 250;
    const before = state.summonScrolls;
    tryExchangeMonsterPoints(state, "scroll_10");
    expect(state.summonScrolls).toBe(before + 10);
    expect(monsterPointsOwned(state)).toBe(0);
  });

  it("スキルピッグは手持ちへ1体増える", () => {
    const state = createInitialState();
    state.monsterPoints = 750;
    const before = state.monsters.length;
    tryExchangeMonsterPoints(state, "skill_pig");
    expect(state.monsters).toHaveLength(before + 1);
    const added = state.monsters[state.monsters.length - 1];
    expect(findMonsterById(added.dexId)?.templateId).toBe(SKILL_PIG.templateId);
    expect(added.star, "塔の報酬と同じ★1で配る").toBe(1);
  });

  /*
   * **足りない時は何も減らさない。**先に引いてから配る形にすると、
   * 配る側で失敗した時にポイントだけが消える。
   */
  it("1ポイントでも足りなければ、何も動かない", () => {
    const state = createInitialState();
    state.monsterPoints = 29;
    const beforeScrolls = state.summonScrolls;
    expect(tryExchangeMonsterPoints(state, "scroll_1")).toBeNull();
    expect(monsterPointsOwned(state)).toBe(29);
    expect(state.summonScrolls).toBe(beforeScrolls);
  });

  it("知らない商品は何もしない", () => {
    const state = createInitialState();
    state.monsterPoints = 9999;
    expect(tryExchangeMonsterPoints(state, "存在しない")).toBeNull();
    expect(monsterPointsOwned(state)).toBe(9999);
  });
});

/**
 * **輪が閉じてはいけない。**
 *
 * 交換品に召喚の書があるので、書 → 召喚 → モンスター → ポイント → 書 が回る。
 * 1周して増えるなら、放っておくだけで無限に書が湧く。
 */
describe("召喚の書の輪が閉じない", () => {
  it("書1枚から得られるポイントより、書1枚の値段が高い", () => {
    // 書1枚 = 1回召喚 = ★3〜5が1体 = 3〜5ポイント
    const bestPerScroll = 5;
    const item = findMonsterPointItem("scroll_1")!;
    expect(item.cost, "1回召喚で得られる最大より安いと、書が無限に増える").toBeGreaterThan(bestPerScroll);
    // 最も運が良くても6回は回さないと1枚に戻らない
    expect(item.cost / bestPerScroll).toBeGreaterThanOrEqual(6);
  });

  it("10連もまとめて割に合わない", () => {
    const item = findMonsterPointItem("scroll_10")!;
    // 10連で得られるのは、全部★5でも50ポイント
    expect(item.cost).toBeGreaterThan(10 * 5);
  });

  it("まとめて交換する方が、1枚ずつより安い", () => {
    const one = findMonsterPointItem("scroll_1")!;
    const ten = findMonsterPointItem("scroll_10")!;
    expect(ten.cost).toBeLessThan(one.cost * ten.amount);
  });

  /*
   * スキルピッグはこれまで**試練の塔の70階・90階でしか手に入らなかった。**
   * 気軽に買えると塔の値打ちが落ちる。
   */
  it("スキルピッグは、書25枚ぶんより重い", () => {
    const pig = findMonsterPointItem("skill_pig")!;
    const one = findMonsterPointItem("scroll_1")!;
    expect(pig.cost).toBeGreaterThanOrEqual(one.cost * 25);
    // ★3なら250体ぶん。片手間には届かない量であること
    expect(pig.cost / 3).toBeGreaterThanOrEqual(200);
  });

  it("交換品の値段が依頼の額と一致している", () => {
    expect(MONSTER_POINT_ITEMS.map((item) => [item.id, item.cost, item.amount])).toEqual([
      ["scroll_1", 30, 1],
      ["scroll_10", 250, 10],
      ["skill_pig", 750, 1],
    ]);
  });
});

/**
 * 画面。**押してから知ることが無いようにする。**
 */
describe("押す前に見せる", () => {
  it("選んだ顔ぶれを星ごとに数える", () => {
    const state = stateWith([3, 3, 4, 5, 3]);
    expect(selectionBreakdown(state.monsters)).toBe("★5×1  ★4×1  ★3×3");
  });

  it("★5以上が混ざっていたら数える", () => {
    const state = stateWith([3, 5, 6, 4]);
    expect(rareCountOf(state.monsters)).toBe(2);
    expect(rareCountOf(stateWith([3, 4]).monsters)).toBe(0);
  });

  const VIEW = readFileSync(new URL("../src/web/views/monsterExchange.ts", import.meta.url), "utf8");

  it("合計ポイントを実行ボタンに出している", () => {
    expect(VIEW).toContain("+${gain}P");
  });

  it("★5以上が混ざっていたら、実行ボタンの色を変えて知らせる", () => {
    expect(VIEW).toContain("btn--danger");
    expect(VIEW).toContain("★5以上が");
  });

  /*
   * **浮かせない。**この案件では浮遊パネルで押せないボタンを3回作っている。
   * 実行バーは `stickyActions`(sticky で居場所を確保する部品)を通すこと。
   */
  it("交換所のCSSに position:fixed / absolute が無い", () => {
    const css = readFileSync(new URL("../src/web/ui/monsterExchange.css", import.meta.url), "utf8");
    expect(css).not.toMatch(/position:\s*fixed/);
    expect(css).not.toMatch(/position:\s*absolute/);
  });

  /*
   * 実機の360pxで、押せないままの実行バーが画面下端に貼り付き、
   * **「送った子は戻せません」を丸ごと覆っていた。**
   * 読ませたい文を覆うくらいなら、まだ要らないバーを出さない。
   */
  it("選ぶ前は実行バーを出さない", () => {
    expect(VIEW).toContain("selected.length === 0 ? el(");
    expect(VIEW).toContain("画面の下に「送る」が出ます");
  });

  /*
   * **絵を `display: none` で消さない。**
   *
   * 交換品の並びは3列(絵・説明・値段と的)の grid なので、絵を消すと
   * 子が2つになって列がずれる。実機の360pxで値段の列が幅0に潰れ、
   * 「750 P」と「あと750」が右へ溢れて切れていた。
   * 型チェックもテストも拾えない壊れ方だったので、ここで固定する。
   */
  it("狭い端末でも交換品の絵を消さない(列がずれる)", () => {
    const css = readFileSync(new URL("../src/web/ui/monsterExchange.css", import.meta.url), "utf8");
    const media = css.slice(css.indexOf("@media (max-width: 360px)"));
    const iconBlock = media.slice(media.indexOf(".mp-item__icon"), media.indexOf(".mp-item__detail"));
    expect(iconBlock).not.toMatch(/display:\s*none/);
  });
});

/**
 * 保存できなかった時は、送らなかったことにする。
 *
 * 召喚で同じ事故を出している(演出が出ないのに書だけ減り、再起動で戻る)。
 * **消費して得る操作は、保存の成否まで見て初めて終わる。**
 */
describe("保存できなかったら送らなかったことにする", () => {
  const MAIN = readFileSync(new URL("../src/web/main.ts", import.meta.url), "utf8");

  it("送る側が保存の成否を見て巻き戻す", () => {
    const fn = MAIN.slice(MAIN.indexOf("function handleSendMonstersForPoints"), MAIN.indexOf("function handleExchangeMonsterPoints"));
    expect(fn).toContain("if (!savePlayerState(state.player))");
    expect(fn).toContain("state.player.monsters = before;");
    expect(fn).toContain("state.player.monsterPoints = beforePoints;");
  });

  it("交換側も巻き戻す", () => {
    const fn = MAIN.slice(MAIN.indexOf("function handleExchangeMonsterPoints"));
    expect(fn.slice(0, fn.indexOf("\n}\n"))).toContain("state.player.summonScrolls = beforeScrolls;");
  });
});
