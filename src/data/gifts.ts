import type { GiftDefinition } from "../game/gift.js";

/**
 * プレゼントボックスへ届ける配布の定義。**運営が足す唯一の場所。**
 *
 * ## 書き方
 *
 * `giftId` は**二度と変えない。**受け取った記録はこのIDで残るので、
 * 後から変えると全員がもう一度受け取れてしまう。
 * 日付を入れておくと、同じ趣旨の配布を繰り返しても衝突しない。
 *
 * `startsAt` より前は一覧に出ない。`expiresAt` を過ぎたら受け取れない
 * (`null` なら無期限)。**どちらも日本時間で書く**(`+09:00` を付ける)。
 *
 * ## 既存の「お知らせ配布」との使い分け
 *
 * `compensation.ts` の方は**開けば自動で入る**手軽な配布で、
 * 通貨と召喚書しか配れない。モンスターを配る時、受け取ったものを
 * 後から確かめてほしい時、期限を切りたい時はこちらを使う。
 */
export const GIFT_DEFINITIONS: readonly GiftDefinition[] = [
  {
    giftId: "balance_apology_20260914",
    title: "大規模バランス調整のおわび",
    description: "大規模なバトルバランス調整に伴い、皆さまへおわびと感謝を込めてプレゼントをお送りします。",
    rewards: [
      { kind: "CRYSTAL", amount: 5_000 },
      { kind: "GOLD", amount: 1_500_000 },
      { kind: "SUMMON_SCROLL", amount: 30 },
      { kind: "SKILL_PIG", amount: 2 },
    ],
    startsAt: "2026-09-14T00:00:00+09:00",
    expiresAt: "2026-10-14T23:59:59+09:00",
  },
];
