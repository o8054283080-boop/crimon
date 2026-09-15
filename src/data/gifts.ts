import { CRIM_DEX_ID } from "../game/crim.js";
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
    /*
     * クリムの配布。**全員へ1体だけ。**
     *
     * プレゼントボックスに任せるのは、この仕組みが既に
     * 「受け取ったかどうかを giftId で覚える」を持っているから。
     * 新しく始めた人にも、前から遊んでいる人にも同じ1件が並び、
     * 何度開き直しても2体目は出ない。
     *
     * **期限を切らない。**配り終わりを作ると、その日以降に始めた人だけが
     * 看板モンスターを持てなくなる。
     */
    giftId: "crim_starter_20260915",
    title: "クリムがあなたの相棒になります",
    description: "CRIMONの看板モンスター「クリム」を1体お贈りします。"
      + "光属性★5のアタッカーで、育てれば冒険とダンジョンの周回で長く戦えます。"
      + "売却や素材にはできない特別な1体です。",
    rewards: [
      { kind: "MONSTER", dexId: CRIM_DEX_ID, star: 5, amount: 1 },
    ],
    startsAt: "2026-09-15T00:00:00+09:00",
    expiresAt: null,
  },
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
