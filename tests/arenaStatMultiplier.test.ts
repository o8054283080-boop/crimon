import { describe, expect, it } from "vitest";
import { ARENA_NPC_BANDS, arenaNpcBandForRating } from "../src/data/arena/npcConfig.js";
import { buildArenaNpc } from "../src/game/arena/npc.js";
import { snapshotToDefinitions } from "../src/game/arena/snapshot.js";
import type { ArenaDefenseSnapshot } from "../src/game/arena/types.js";

/*
 * レート3000より上のNPCだけが持つ、HP・攻撃・防御の倍率の見張り。
 *
 * **ここだけが育成の外に出ている。**3000あたりで育成の範囲内で作れる強さの
 * 天井に届き、そこから先は何を積んでも差が出なくなったため、依頼主の判断で入れた。
 * 広がると「どう育てても再現できない相手」がアリーナ全体へ漏れる。
 */

describe("レート3000より上の倍率", () => {
  it("3000までは倍率を持たない", () => {
    for (const band of ARENA_NPC_BANDS.filter((b) => b.minRating <= 3000)) {
      expect(band.statMultiplier, `${band.id}(${band.minRating}) に倍率が付いている`).toBeUndefined();
    }
  });

  it("3100から上は、レートが上がるほど倍率も上がる", () => {
    const above = ARENA_NPC_BANDS.filter((b) => b.minRating > 3000);
    expect(above.length).toBe(5);
    for (const band of above) {
      expect(band.statMultiplier, `${band.id} に倍率が無い`).toBeDefined();
    }
    for (let i = 1; i < above.length; i += 1) {
      expect(above[i].statMultiplier!, `${above[i].id} が ${above[i - 1].id} 以下`)
        .toBeGreaterThan(above[i - 1].statMultiplier!);
    }
  });

  /*
   * **速度に掛けてはいけない。**速度は手番の数に直結するので、
   * 伸ばすと相手だけが何度も動く別のゲームになる。
   * クリ率・クリダメ・的中・抵抗も同じで、確率は積み上げても頭打ちになり、
   * 100%を超えた瞬間に「絶対に当たる」という別の性質へ変わる。
   */
  it("掛かるのはHP・攻撃・防御だけ。速度も確率も動かさない", () => {
    /*
     * **同じ控えで、倍率の有無だけを比べる。**
     * レート3000と3500では引く編成の段が違うので(段4も引くか、段5だけか)、
     * 素直に2つのレートで作ると別の顔ぶれが出てきて比べられない
     * (最初そう書いて、HP 115,921 と 34,170 を突き合わせて落ちた)。
     */
    const npc = buildArenaNpc(3500, 4242, 1);
    /*
     * **指定したレートの倍率とは限らない。**並べる相手には位置ごとの差(±)と
     * 揺らぎが乗るので、3500を頼んでも 3480 の個体が出てきて1つ下の帯になる
     * (最初 `arenaNpcBandForRating(3500)` の 1.7 と突き合わせて落ちた)。
     * 実際に付いた倍率を見る。
     */
    const multiplier = npc.defense.statMultiplier!;
    expect(multiplier, "3500付近のNPCに倍率が付いていない").toBeGreaterThan(1);
    expect(multiplier).toBe(arenaNpcBandForRating(npc.rating).statMultiplier);

    const withoutMultiplier: ArenaDefenseSnapshot = { ...npc.defense };
    delete withoutMultiplier.statMultiplier;
    const plain = snapshotToDefinitions(withoutMultiplier);
    const boosted = snapshotToDefinitions(npc.defense);
    expect(plain.length).toBe(boosted.length);

    for (let i = 0; i < plain.length; i += 1) {
      const a = plain[i].stats;
      const b = boosted[i].stats;
      // 同じ種・同じ並び位置なので、素の個体は同じはず(倍率だけが違う)
      expect(b.hp).toBe(Math.round(a.hp * multiplier));
      expect(b.atk).toBe(Math.round(a.atk * multiplier));
      expect(b.def).toBe(Math.round(a.def * multiplier));
      expect(b.spd, "速度に掛かっている").toBe(a.spd);
      expect(b.criRate, "クリ率に掛かっている").toBe(a.criRate);
      expect(b.criDmg, "クリダメに掛かっている").toBe(a.criDmg);
      expect(b.accuracy, "的中に掛かっている").toBe(a.accuracy);
      expect(b.resistance, "抵抗に掛かっている").toBe(a.resistance);
    }
  });

  /*
   * **プレイヤーの防衛編成には絶対に付かない。**
   * 付いた瞬間、防衛が「自分の育成より強い自分」になる。
   */
  it("倍率の無い控えは、素のステータスのまま出てくる", () => {
    const npc = buildArenaNpc(3500, 4242, 1);
    expect(npc.defense.statMultiplier).toBeDefined();

    // 倍率を外した同じ控え。プレイヤーの防衛編成はこの形
    const asPlayer: ArenaDefenseSnapshot = { ...npc.defense };
    delete asPlayer.statMultiplier;
    const boosted = snapshotToDefinitions(npc.defense);
    const plain = snapshotToDefinitions(asPlayer);
    for (let i = 0; i < plain.length; i += 1) {
      expect(plain[i].stats.hp).toBeLessThan(boosted[i].stats.hp);
    }
  });

  it("3000以下のNPCの控えには、倍率の項目そのものが無い", () => {
    // 1 を入れて回ると、控えを見た時に「倍率のあるNPC」と区別が付かなくなる
    for (const rating of [2000, 2700, 3000]) {
      expect(buildArenaNpc(rating, 777, 1).defense.statMultiplier, `レート${rating}`).toBeUndefined();
    }
  });
});
