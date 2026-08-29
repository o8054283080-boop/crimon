import { Element } from "../../core/element.js";
import { MonsterAvatar } from "./monsterAvatar.js";
import { SpriteAvatar } from "./spriteAvatar.js";
import { hasSprite } from "./spriteArt.js";

/**
 * 戦闘画面に立つモンスター。2Dの絵か、従来の3Dモデルか。
 *
 * **どちらも同じ約束事を持つ**ので、戦闘画面は区別せずに扱える。
 * 約束事は「立ち位置を決める / 向きを変える / HPを反映する /
 * 攻撃・詠唱・被弾・撃破・復活を演じる / 手番と被狙いの印を出す /
 * 毎フレーム動かす / 片付ける」の13個だけ。
 */
export type BattleAvatar = MonsterAvatar | SpriteAvatar;

export interface BattleAvatarOptions {
  element: Element;
  role: string;
  templateId: string;
  facing: 1 | -1;
}

/**
 * その種族の2Dの絵があれば2Dで、無ければ3Dで立たせる。
 *
 * **旗ではなく「絵があるかどうか」で決める。**
 * 旗にすると、切り替えた瞬間に絵の無い種族が消える。
 * 絵が揃った種族から順に2Dへ移り、まだの種族はそのまま動く。
 * 一斉の切り替えにしないので、いつでも途中で止められる。
 */
export function createBattleAvatar(options: BattleAvatarOptions): BattleAvatar {
  if (hasSprite(options.templateId, options.element)) {
    try {
      return new SpriteAvatar(options);
    } catch (error) {
      // 絵が壊れている時に画面ごと落とさない。3Dで出せば遊べる
      console.warn(`2Dの絵を使えなかった: ${options.templateId}[${options.element}]`, error);
    }
  }
  return new MonsterAvatar(options);
}
