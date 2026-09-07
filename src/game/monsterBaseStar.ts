import type { Star } from "../core/rarity.js";
import {
  GACHA_STAR3_TEMPLATES, GACHA_STAR4_TEMPLATES, GACHA_STAR5_TEMPLATES, findMonsterById,
} from "../data/monsters.js";

/**
 * そのモンスターが**最初に手に入った時の星**。
 *
 * `MonsterInstance.star` は今の星で、ランクアップで上がっていく。
 * だから「★5を持っている」だけでは、★5として引いたのか、
 * ★3を5体食わせて上げたのかが分からない。
 *
 * 素材を自動で選ぶ時にこの区別が要る。同じ★5でも、
 * **★5として出るモンスターの方が手に入りにくい**からだ。
 *
 * 判定はガチャの抽選プールから引く。星ごとにプールが分かれていて
 * (`GACHA_STAR3/4/5_TEMPLATES`)、そのモンスターが何星で出るかは
 * プールがそのまま答えになっている。
 */

function poolEntries(templates: readonly { templateId: string }[], star: Star): [string, Star][] {
  return templates.map((template) => [template.templateId, star]);
}

const BASE_STAR_BY_TEMPLATE = new Map<string, Star>([
  ...poolEntries(GACHA_STAR3_TEMPLATES, 3),
  ...poolEntries(GACHA_STAR4_TEMPLATES, 4),
  ...poolEntries(GACHA_STAR5_TEMPLATES, 5),
]);

/**
 * 初期星を返す。**分からない時は今の星をそのまま返す。**
 *
 * 分からないのはピッグ3種と、召喚に出ない特殊なモンスター。
 * ピッグは入手先ごとに星が違い(装備ダンジョンは★2〜3、ショップは★3〜5)、
 * **ランクアップの素材として消えるだけで自分は星が上がらない**ので、
 * 今の星がそのまま入手時の星になっている。
 *
 * 0 や 1 を返して「いちばん低い」ことにはしない。
 * 素材選びでは低い星から先に選ばれるので、
 * **正体が分からないものを真っ先に食わせる**ことになってしまう。
 */
export function baseStarOf(monster: { dexId: string; star: Star }): Star {
  const templateId = findMonsterById(monster.dexId)?.templateId;
  const known = templateId === undefined ? undefined : BASE_STAR_BY_TEMPLATE.get(templateId);
  return known ?? monster.star;
}
