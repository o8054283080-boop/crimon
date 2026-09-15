import type { MonsterInstance } from "../core/monsterInstance.js";
import { MAX_SKILL_LEVEL } from "../core/skill.js";
import { rollSkillLevelUp } from "../core/monsterInstance.js";
import { CRIM_TEMPLATE_ID } from "../data/newMonsters/crim.js";
import type { PlayerState } from "./playerState.js";

/**
 * クリムにまつわる決まりごと。**判定はここに集める。**
 *
 * ## なぜ1か所にまとめるのか
 *
 * クリムは全員へ1体だけ配る看板モンスターで、**二度と手に入らない。**
 * 消える道が1つでも残っていれば、いつかそこから消える。
 *
 * モンスターが永続的に消える経路は、いま5つある:
 *
 *   1. モンスターポイントへの変換     `sendMonstersForPoints`
 *   2. 保管所へ預ける                 `depositMonsters`
 *      (預けた先から直接ポイントへ変換できるので、預ける時点で止める)
 *   3. モンスター強化の素材           `executeMonsterPowerUp`
 *   4. ランクアップの素材             `applyRankUp`
 *   5. クリエイト(スキル継承)の移し元 `applyMonsterCreate`
 *
 * **どれも判定関数を持っている**ので、そこへこのファイルの拒否を挿す。
 * 画面から選べなくするだけでは足りない——別の画面が同じ処理を呼んだ時、
 * あるいは将来UIを作り直した時に、また消えるようになる。
 *
 * ## 専用素材も同じ考え方
 *
 * 「クリムの宝珠のかけら」は**クリムのスキルを上げること以外に使えない。**
 * 売ることも、ポイントへ換えることも、他のモンスターへ使うこともできない。
 * 使い道が1つしか無いものは、その1つだけを通す関数を置いて、
 * 他の入口を作らないのがいちばん確実。
 */

/** クリムの図鑑ID。光属性1種類しか存在しない */
export const CRIM_DEX_ID = `${CRIM_TEMPLATE_ID}_LIGHT`;

/** その個体がクリムか */
export function isCrim(monster: Pick<MonsterInstance, "dexId">): boolean {
  return monster.dexId === CRIM_DEX_ID;
}

/** 手持ちのクリム(まだ受け取っていなければ undefined) */
export function findCrim(player: Pick<PlayerState, "monsters">): MonsterInstance | undefined {
  return player.monsters.find(isCrim);
}

/**
 * 素材にしようとした時に見せる理由。
 *
 * **「できません」だけにしない。**なぜ駄目なのかが分からないと、
 * 不具合だと思われる。特別な1体であることを毎回そこで伝える。
 */
export const CRIM_MATERIAL_REFUSAL = "クリムは特別なモンスターのため素材にできません";

/** 保管所へ預けようとした時の理由。預けた先から変換できてしまうので、ここで止める */
export const CRIM_STORAGE_REFUSAL = "クリムは特別なモンスターのため保管所へ預けられません";

/* ------------------------------------------------------- 専用スキル強化素材 */

/**
 * クリムの宝珠のかけら。**クリムのスキルレベルを1回上げる。**
 *
 * ## なぜ専用の素材が要るのか
 *
 * スキルレベルを上げる手段は「同じ種族を重ねる」か「スキルピッグ」しかない。
 * クリムは**同種族・他属性が存在しない**ので、重ねる道が最初から無い。
 * スキルピッグは試練の塔の奥かモンスターポイント750ptでしか手に入らず、
 * **始めたばかりの人には遠すぎる。**
 *
 * 全スキルをMAXにするのに要るのは12個(S1〜S3が各4回)。
 * 初心者ミッションを進めれば、ちょうど12個そろう。
 *
 * ## 上がり方は既存のまま
 *
 * 既存のスキル育成は「まだMAXでないスキルからランダムに1つ」(`rollSkillLevelUp`)。
 * **専用素材だけ狙って上げられる形にはしない。**同じものを配る手段が
 * 増えただけ、という関係を保つ(依頼主の指定)。
 */
export const CRIM_SHARD_NAME = "クリムの宝珠のかけら";
export const CRIM_SHARD_ICON = "💠";

/** 全スキルをMAXにするのに要る数。S1〜S3を各4回ずつ */
export const CRIM_SHARDS_FOR_MAX_SKILLS = 12;

/** 手持ちのかけら。旧セーブには無いので0として読む */
export function crimShardsOwned(player: Pick<PlayerState, "crimShards">): number {
  const value = player.crimShards ?? 0;
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export type CrimShardUseResult =
  | { ok: true; skillIndex: number; remaining: number }
  | { ok: false; reason: string };

/**
 * かけらを1個使ってクリムのスキルを1つ上げる。
 *
 * **対象がクリムであることを、ここで必ず確かめる。**
 * 画面が渡してくる相手を信用しない。将来どの画面から呼ばれても、
 * クリム以外へ使われることはない。
 */
export function useCrimShard(
  player: PlayerState,
  monsterId: string,
  rng: () => number = Math.random,
): CrimShardUseResult {
  const target = player.monsters.find((monster) => monster.id === monsterId);
  if (!target) return { ok: false, reason: "対象のモンスターが見つかりません" };
  if (!isCrim(target)) {
    return { ok: false, reason: `${CRIM_SHARD_NAME}はクリムにしか使えません` };
  }
  if (crimShardsOwned(player) < 1) {
    return { ok: false, reason: `${CRIM_SHARD_NAME}を持っていません` };
  }
  if (target.skillLevels.every((level) => level >= MAX_SKILL_LEVEL)) {
    return { ok: false, reason: "すべてのスキルが最大Lvです" };
  }

  const skillIndex = rollSkillLevelUp(target, rng);
  if (skillIndex < 0) return { ok: false, reason: "上げられるスキルがありません" };

  // **上げてから引く。**引いてから上げると、上げられなかった時にかけらだけ消える
  player.crimShards = crimShardsOwned(player) - 1;
  return { ok: true, skillIndex, remaining: player.crimShards };
}
