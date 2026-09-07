import { describe, expect, it } from "vitest";
import { toMatchRecord } from "../src/net/arenaSync.js";

/**
 * 防衛履歴に出る相手の名前。
 *
 * **実プレイヤーに攻められた記録が、全部「名もなき挑戦者」になっていた。**
 * `arena_matches` は表示名を持たない(改名で履歴が食い違うのを避けるため)ので、
 * 繋がっているプロフィールから引く必要があるのに、引いていなかった。
 * 誰に破られたのか分からないまま「リベンジする」だけが並ぶ画面になっていた。
 */
const ME = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

function row(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "match-1",
    attacker_id: OTHER,
    defender_id: ME,
    opponent_kind: "PLAYER",
    attacker_won: true,
    attacker_rating_before: 1839,
    attacker_rating_delta: 6,
    attacker_rating_after: 1845,
    defender_rating_before: 1875,
    defender_rating_delta: -6,
    defender_rating_after: 1869,
    coins_awarded: 0,
    defender_coins_awarded: 0,
    created_at: "2026-09-06T08:16:00Z",
    ...extra,
  };
}

describe("防衛履歴の相手の名前", () => {
  it("攻めてきた実プレイヤーの名前を出す", () => {
    const record = toMatchRecord(row({ attacker: { display_name: "ジン" } }), ME);
    expect(record?.side).toBe("DEFENSE");
    expect(record?.opponentName).toBe("ジン");
  });

  it("埋め込みが配列で返っても読める", () => {
    // PostgRESTは繋がりの向きによって配列で返すことがある
    const record = toMatchRecord(row({ attacker: [{ display_name: "ジン" }] }), ME);
    expect(record?.opponentName).toBe("ジン");
  });

  it("自分が攻めた記録では、守った側の名前を出す", () => {
    const record = toMatchRecord(
      row({
        attacker_id: ME,
        defender_id: OTHER,
        attacker: { display_name: "自分" },
        defender: { display_name: "相手" },
      }),
      ME,
    );
    expect(record?.side).toBe("OFFENSE");
    expect(record?.opponentName).toBe("相手");
  });

  it("NPCなら行に入っている名前を使う", () => {
    const record = toMatchRecord(
      row({ opponent_kind: "NPC", npc_name: "紅蓮の守り手", attacker: { display_name: "使わない" } }),
      ME,
    );
    expect(record?.opponentName).toBe("紅蓮の守り手");
  });

  it("名前を取れなかった時だけ「名もなき挑戦者」に戻す", () => {
    // 知らないことを、名前であるかのように出さない
    expect(toMatchRecord(row(), ME)?.opponentName).toBe("名もなき挑戦者");
    expect(toMatchRecord(row({ attacker: { display_name: "   " } }), ME)?.opponentName).toBe("名もなき挑戦者");
  });

  it("勝敗とレートは守った側の視点で入る", () => {
    const record = toMatchRecord(row({ attacker: { display_name: "ジン" } }), ME);
    // 攻撃側が勝った = 防衛は破られた
    expect(record?.won).toBe(false);
    expect(record?.ratingDelta).toBe(-6);
    expect(record?.ratingAfter).toBe(1869);
    // 「相手レート」は攻めてきた側の、戦う前のレート
    expect(record?.opponentRating).toBe(1839);
  });
});
