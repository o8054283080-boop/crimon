/**
 * 試練の塔 60階 v2(検討中)。
 *
 * ## v1 で分かったこと
 *
 * v1(HP300,000・S3倍率2.5・6回で反撃・反撃はS2)は、**1000戦やって敗北0**だった。
 * 負けているのではなく「300ターンで削りきれず引き分け」ばかりで、
 * 支え役3体は敵の攻撃力を+1000しても**生存率100%**のまま。
 *
 * 理由は3つ揃っていた。
 *
 *   1. ボスの最大打点(1発10,399)が、支え役のHP(54,000〜60,000)に対して小さい
 *   2. 回復が被ダメージを大きく上回る(クロノスは126,567受けて146,367回復)
 *   3. 立て直す手段(毎ターン回復・被ダメ軽減)が支え役にしか付いていない
 *
 * ## v2 が触ったところ
 *
 * **「削りきれない」を「間に合うかどうか」へ変える**のが狙い。
 *
 *   ・HP 300,000 → 150,000     …… 削りきれる長さにする
 *   ・攻撃力 6,200 → 7,700     …… 一撃を重くする
 *   ・S3倍率 2.5 → 3.5         …… 同上
 *   ・反撃を S2 → S3、6回 → 5回 …… 手数への代償を、渦ではなく一閃で返す
 *   ・呪晶のS3を**回復不能**へ  …… 支え役が落ちない一番の理由へ直接触る
 *   ・呪晶/魔晶が倒れると本体が伸びる …… 取り巻きを置物で終わらせない
 *
 * **取り巻き自身のステータスは1つも触っていない。**倒された時に本体が得る量
 * (呪晶→速度+100 / 魔晶→攻撃+2000)だけが v1 との違い。
 *
 * 回復不能は、耐久という戦術を**封じる**ものではない。かかるのは2ターンで、
 * 抵抗もできる。「回復が間に合うか」を勝負にするための札で、
 * 継続ダメージや耐久そのものへ罰を与えるものではない
 * (`docs/design-concept.md` / `tests/continuousDamage.test.ts`)。
 *
 * **本編の `src/data/trialTower.ts` には一切触れていない。**
 */
import type { Skill } from "../../../src/core/skill.js";
import type { Scenario } from "../types.js";
import { TOWER60 } from "./tower60.js";

/** v1 の技をそのまま借りる。変えたところだけを下で上書きする */
const V1_BOSS = TOWER60.enemies[0];
const V1_MASHOU = TOWER60.enemies[1];
const V1_JUSHOU = TOWER60.enemies[2];

const BOSS_SKILLS: [Skill, Skill, Skill] = [
  V1_BOSS.skills![0],
  V1_BOSS.skills![1],
  {
    ...V1_BOSS.skills![2],
    description: "単体へ渾身の一撃。50%で1ターンスタン。",
    effects: V1_BOSS.skills![2].effects.map((effect) => (
      effect.kind === "DAMAGE" ? { ...effect, multiplier: 3.5 } : effect
    )),
  },
];

const JUSHOU_SKILLS: [Skill, Skill, Skill] = [
  V1_JUSHOU.skills![0],
  V1_JUSHOU.skills![1],
  {
    id: "lab_jushou_s3_v2",
    name: "呪縛の帳",
    description: "敵全体へ、75%で2ターン回復不能を付与する。",
    target: "ALL_ENEMIES",
    cooldownTurns: 4,
    effects: [
      /*
       * **回復量を減らすのではなく、止める。**
       * 半減では「回復が間に合うか」の勝負にならず、ただ時間が伸びるだけだった
       * (v1でクロノスは受けた量より多く回復していた)。
       */
      { kind: "HEAL_BLOCK", healMultiplier: 0, durationTurns: 2, chance: 0.75 },
    ],
  },
];

export const TOWER60_V2: Scenario = {
  id: "tower-60-v2",
  title: "試練の塔 60階 v2(検討中)",
  note: "HPを半分にして削りきれる長さにし、一撃と回復不能で「間に合うか」を勝負にする",
  maxTurns: 300,
  expect: { minWinRate: 0.6, maxWinRate: 0.85 },
  allies: TOWER60.allies,
  enemies: [
    {
      ...V1_BOSS,
      label: "古代の豪魔人",
      stats: { ...V1_BOSS.stats, hp: 150_000, atk: 7_700 },
      skills: BOSS_SKILLS,
      bossTraits: {
        // 5発受けるたびに、渦ではなく**一閃**が返る。クールタイムは動かない
        counterAfterHits: 5,
        counterSkillIndex: 2,
      },
      victoryTarget: true,
    },
    {
      ...V1_MASHOU,
      label: "古代の魔晶",
      bossTraits: {
        /*
         * **倒すと本体が強くなる。**
         *
         * v2 までは「魔晶を先に消す」が明確な最適解で、読み合いが1手で終わっていた。
         * 消した見返りに本体が伸びるなら、**急いで消すか、殴られながら本体を削るか**
         * を選ぶことになる。取り巻きが置物でなくなる。
         */
        empowerBossOnDeath: { atk: 2_000 },
      },
    },
    {
      ...V1_JUSHOU,
      label: "古代の呪晶",
      skills: JUSHOU_SKILLS,
      // 倒すと本体の速度が伸びる。回復不能を止めた代償が手番の数で返る
      bossTraits: { empowerBossOnDeath: { spd: 100 } },
    },
  ],
  focusPatterns: TOWER60.focusPatterns,
};
