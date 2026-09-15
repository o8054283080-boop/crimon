import { loadPlayerState, savePlayerState } from "../game/playerState.js";
import { syncCrimShardGrants } from "../game/tutorialMissions.js";

/**
 * クリムの宝珠のかけらを、**既に達成済みの初心者ミッションぶんだけ**配る。
 *
 * かけらは後から足した報酬なので、更新前に初心者ミッションを進めていた人は
 * そのままでは1個も受け取れない。かといって受取印を消して配り直すと、
 * **ダイヤも召喚書もゴールドも全部もう一度出る。**
 *
 * `syncCrimShardGrants` はかけら専用の印だけを見るので、
 * 何度呼んでも過去の報酬には触らず、かけらも二重には配らない。
 * 保存に失敗した回は印も残らないので、次に開いた時にもう一度試される。
 *
 * **経験値調整のお詫び(`expBalanceCompensationBootstrap`)と同じ形。**
 * 起動時に一度だけ走らせ、失敗しても画面は止めない。
 */
try {
  const state = loadPlayerState();
  const gained = syncCrimShardGrants(state);
  if (gained > 0) savePlayerState(state);
} catch (error) {
  console.error("[CRIMON] クリムの宝珠のかけらの遡及配布に失敗しました", error);
}
