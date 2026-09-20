import { COLLAB_EVENT_FROM_DATE, COLLAB_EVENT_TO_DATE, COLLAB_GIFT_DEX_ID } from "./collabEvent.js";
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
     * コラボ開催記念の配布。**全員へ1回だけ。**
     *
     * プレゼントボックスに任せるのは、この仕組みが既に
     * 「受け取ったかどうかを giftId で覚える」を持っているから。
     * 再ログインしても、端末を変えてセーブを復旧しても、二重には配られない。
     * 受け取る前なら一覧に残り続ける。
     *
     * **電気スエゾーは配布専用の弱い個体ではない。**
     * 召喚で引いたものとまったく同じ図鑑IDと星で入る。
     */
    giftId: "collab_celebration_20260919",
    title: "コラボ開催記念プレゼント",
    description: "コラボ開催を記念して、全員へお配りします。"
      + "電気スエゾーは召喚で引いたものとまったく同じ個体で、育成・装備・ランクアップ・"
      + "タイプ転生・才能覚醒まで何も制限がありません。"
      + "コラボ限定★4以上召喚書はコラボモンスターしか出ない特別な召喚書です。",
    rewards: [
      { kind: "MONSTER", dexId: COLLAB_GIFT_DEX_ID, star: 4, amount: 1 },
      { kind: "CRYSTAL", amount: 3_000 },
      { kind: "SUMMON_SCROLL", amount: 30 },
      { kind: "COLLAB_FOUR_STAR_SUMMON_SCROLL", amount: 1 },
    ],
    startsAt: `${COLLAB_EVENT_FROM_DATE}T00:00:00+09:00`,
    expiresAt: `${COLLAB_EVENT_TO_DATE}T23:59:59+09:00`,
  },
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
