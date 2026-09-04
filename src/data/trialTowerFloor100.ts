import { Element } from "../core/element.js";
import {
  CRIMOARK_ACCURACY,
  CRIMOARK_ATK,
  CRIMOARK_CLONE_PROFILE,
  CRIMOARK_CRI_DMG,
  CRIMOARK_CRI_RATE,
  CRIMOARK_DEF,
  CRIMOARK_HP,
  CRIMOARK_RESISTANCE,
  CRIMOARK_SKILLS,
  CRIMOARK_SPD,
  CRIMOARK_TEMPLATE_ID,
} from "./crimoark.js";
import { DungeonEnemy } from "./equipmentDungeon.js";

/**
 * 試練の塔100階「クリモアーク」の盤面。
 *
 * ## 敵は3体だが、最初に立っているのは1体だけ
 *
 * 分身は**戦闘の途中で生まれる**。エンジンに「戦いの最中に敵を増やす」機構は
 * 無く、増やそうとすると盤面・HPの札・行動順UI・勝敗判定のすべてが
 * 「開幕に決まった顔ぶれ」を前提にしているところへ手を入れることになる。
 *
 * 代わりに**空席を2つ先に置く。**開幕は眠っていて(生きておらず、画面にも出ない)、
 * クリモアークがスキル3を撃った瞬間に、抽選した型の姿とスキルを着て起き上がる。
 * 顔ぶれの数は最初から最後まで3のままなので、既存の仕組みは何も変わらない。
 *
 * 空席の見た目とスキルは起きる瞬間に決まるので、ここで書いている
 * `templateId` と `fixedStats` は**眠っている間の器**でしかない。
 *
 * ## 勝利条件は本体だけ
 *
 * `victoryTarget` を持つのはクリモアークだけ。分身を残したまま本体を倒しても
 * その場で勝ちになるし、分身を全部倒しても本体が立っていれば終わらない。
 */

/** 本体も分身も闇で揃える。分身ごとに属性を変えると相性運で難易度が振れる */
export const TOWER100_ELEMENT: Element = "DARK";

/** 分身の空席の数。**HP70%以下でも同時に2体まで**なので2つで足りる */
export const TOWER100_CLONE_SLOTS = 2;

/** 眠っている空席の器。起きる瞬間に型ごとの姿へ着替える */
const DORMANT = CRIMOARK_CLONE_PROFILE.ATTACK;

export const TOWER100_ENEMIES: DungeonEnemy[] = [
  {
    templateId: CRIMOARK_TEMPLATE_ID,
    element: TOWER100_ELEMENT,
    star: 6,
    level: 60,
    isBoss: true,
    victoryTarget: true,
    primaryTarget: true,
    displayName: "クリモアーク",
    fixedStats: {
      hp: CRIMOARK_HP,
      atk: CRIMOARK_ATK,
      def: CRIMOARK_DEF,
      spd: CRIMOARK_SPD,
      criRate: CRIMOARK_CRI_RATE,
      criDmg: CRIMOARK_CRI_DMG,
      accuracy: CRIMOARK_ACCURACY,
      resistance: CRIMOARK_RESISTANCE,
    },
    skills: CRIMOARK_SKILLS,
    initialCooldowns: [0, 0, 0],
  },
  ...Array.from({ length: TOWER100_CLONE_SLOTS }, (): DungeonEnemy => ({
    templateId: DORMANT.templateId,
    element: TOWER100_ELEMENT,
    star: 6,
    level: 60,
    // **勝利条件にはしない。**分身を全部倒しても戦いは終わらない
    victoryTarget: false,
    // 挑む前の顔ぶれには出さない。何が出るかは戦ってから分かること
    summonedInBattle: true,
    displayName: DORMANT.displayName,
    fixedStats: {
      hp: 1,
      atk: DORMANT.atk,
      def: DORMANT.def,
      spd: DORMANT.spd,
      criRate: DORMANT.criRate,
      criDmg: DORMANT.criDmg,
      accuracy: DORMANT.accuracy,
      resistance: DORMANT.resistance,
    },
    skills: DORMANT.skills,
    initialCooldowns: [0, 0, 0],
  })),
];
