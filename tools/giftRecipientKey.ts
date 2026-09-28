/**
 * 宛先付きプレゼント(`GiftDefinition.recipients`)に書く値を出す。
 *
 *   npx tsx tools/giftRecipientKey.ts <復旧ID> [<復旧ID> ...]
 *
 * 復旧IDは管理画面のプレイヤー一覧に出ている。**復旧IDそのものはコードに書かない。**
 */
import { recipientKey } from "../src/game/gift.js";

const ids = process.argv.slice(2);
if (ids.length === 0) {
  console.error("使い方: npx tsx tools/giftRecipientKey.ts <復旧ID> [<復旧ID> ...]");
  process.exit(1);
}
for (const id of ids) console.log(`${recipientKey(id)}  (${id.trim().toLowerCase()})`);
