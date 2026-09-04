/**
 * 80階「古代聖竜」の、手番の境目でだけ効く挙動と、その計測。
 *
 * ## この階の芯は「免疫をどう剥がすか」
 *
 * ボスは免疫を張り続け、免疫の間は硬く、剥がれた瞬間だけ柔らかい。
 * だから**剥がし(STRIP)と強化阻害(BUFF_BLOCK)が正攻法として機能するか**が
 * 測りたいことの全て。勝率だけでなく、
 * 「ボスが免疫を張ったまま何割の手番を過ごしたか」まで見ないと、
 * 勝てた/負けたの理由が読めない。
 *
 * ## ここが受け持つもの(本編のスキル定義では表せないもの)
 *
 *   1. 戦闘開始時、敵側全体に免疫2ターン
 *   2. ボスが免疫状態なら ATK +2,000(実質11,500)
 *   3. ボスの免疫が剥がれている間は被ダメージ +25%
 *   4. HP50%未満になったら、以後すべての攻撃スキルの倍率 ×1.5
 *   5. HP70%以下・HP40%以下への**初到達時**に、敵側全体へ免疫2ターン(各1回)
 *   6. ボスS3「聖域の咆哮」使用時、味方全体へ免疫2ターン
 *
 * どれも本編の口へ写している:
 *
 *   ・免疫 ……… `immuneTurns`(本編の免疫そのもの)
 *   ・ATK+2000 → `flatStatBonus.atk`(本編の実数加算そのもの)
 *   ・被ダメ+25% → `mitigateAmount` を**負の値**にする(軽減の裏返し)
 *   ・×1.5 …… → `setDamageMultiplierFactor`(素の定義から掛け直す)
 *
 * **ダメージ計算にも命中判定にも会心にもAIにも入らない。**
 *
 * ## 免疫を配る時は、強化阻害を必ず見る
 *
 * 本編の `IMMUNITY` 効果は `BUFF_BLOCK` がかかっている相手には乗らない
 * (`engine.ts` が「強化不可でBUFF付与を防いだ」と出す)。
 * ここで配る免疫も同じ扱いにしないと、**強化阻害という攻略が
 * 観測点によって黙って無効化される**。防いだ回数はそのまま数えて表に出す。
 */
import type { ScenarioProbe, TrackedUnit } from "../types.js";

/** 敵の並び。`E1`=ボス `E2`=護晶 `E3`=鼓舞晶 `E4`=破邪獣 `E5`=呪獣 */
const BOSS = "E1";
const GUARD = "E2";
const INSPIRE = "E3";
const BREAKER = "E4";
const CURSE = "E5";
const ENEMY_IDS = [BOSS, GUARD, INSPIRE, BREAKER, CURSE];
const PLAYER_IDS = ["P1", "P2", "P3", "P4", "P5"];

interface Context {
  unitOf(id: string): TrackedUnit | undefined;
  aliveOf(id: string): boolean;
}

/** 依頼で確定した数値。**測定の途中で動かさない** */
export const TOWER80_RULES = {
  /** 開始時・閾値・S3で配る免疫の長さ */
  immunityTurns: 2,
  /** 免疫中のボスに乗る実数ATK */
  immuneAtkBonus: 2_000,
  /** 免疫が剥がれている間の被ダメージ増加 */
  strippedDamageTaken: 0.25,
  /** HP50%未満で全攻撃スキルに掛かる倍率 */
  enragedMultiplier: 1.5,
  enrageHpRatio: 0.5,
  /** 初到達で免疫を配り直すHP割合 */
  immunityThresholds: [0.7, 0.4] as const,
} as const;

interface Counters {
  /** ボスが行動した手番の数と、その内訳 */
  bossActions: number;
  bossImmuneActions: number;
  bossBuffBlockedActions: number;

  /** ボスへの剥がし・強化阻害 */
  bossStrips: number;
  bossBuffBlocks: number;

  /** 閾値での免疫再展開 */
  thresholdImmunity70: number;
  thresholdImmunity40: number;
  /** S3による免疫供給 */
  roarImmunity: number;
  /** **強化阻害のせいで免疫が乗らなかった回数**(この階の主役) */
  immunityBlocked: number;

  /** ボスのHP */
  bossHpLeft: number;
  bossHpRatioLeft: number;
  reachedHalf: number;
  /** HP50%未満へ入った後にこちらが全滅した */
  wipedAfterHalf: number;

  /** お供が倒れた手番(倒れなければ0のまま) */
  guardDownTurn: number;
  breakerDownTurn: number;
  /** 数えた手番の総数 */
  turns: number;
}

function newCounters(): Counters {
  return {
    bossActions: 0, bossImmuneActions: 0, bossBuffBlockedActions: 0,
    bossStrips: 0, bossBuffBlocks: 0,
    thresholdImmunity70: 0, thresholdImmunity40: 0, roarImmunity: 0, immunityBlocked: 0,
    bossHpLeft: 0, bossHpRatioLeft: 0, reachedHalf: 0, wipedAfterHalf: 0,
    guardDownTurn: 0, breakerDownTurn: 0, turns: 0,
  };
}

/**
 * 剥がしのログ。本編が出す文言に合わせてある。
 *
 * **奪取(STEAL_BUFF)も数える。**草アビスリーパーのS2は「奪った」と出るが、
 * ボスから強化が1つ消えることに変わりはない。ここを落とすと
 * 「剥がし役なのに剥がし回数0」という嘘の表になる(実際に一度そう出した)。
 */
const STRIP_LINE = /の(強化効果|有利な効果)/;
const STRIP_VERB = /(剥が|解除|奪)/;

/**
 * 切り分け用のつまみ。**既定は全部オフ(=依頼どおりの仕様)。**
 *
 * 何が効いているのかを1つずつ外して測るためだけにある。
 * ここを既定で有効にしてはいけない——「仕様を測ったつもりで
 * 別のものを測っていた」が起きる。
 */
export interface Tower80ProbeOptions {
  /** HP70%/40%の免疫再展開を止める */
  noThresholdImmunity?: boolean;
  /** ボスS3の免疫供給を止める */
  noRoarImmunity?: boolean;
  /** HP50%未満の全攻撃×1.5を止める */
  noEnrage?: boolean;
  /** 免疫中のATK+2,000を止める */
  noImmuneAtk?: boolean;
  /** 免疫が剥がれている間の被ダメージ+25%を止める */
  noStrippedWeakness?: boolean;
}

export function tower80Probe(context: Context, options: Tower80ProbeOptions = {}): ScenarioProbe {
  const counters = newCounters();
  const boss = () => context.unitOf(BOSS);

  /** すでに配った閾値 */
  const fired = new Set<number>();
  let bossWasBuffBlocked = false;
  let started = false;
  let sawHalf = false;

  /**
   * 敵側全体へ免疫を配る。
   *
   * **強化阻害を無視しない。**本編の `IMMUNITY` 効果は `BUFF_BLOCK` の
   * かかった相手には乗らないので、ここも同じ扱いにする。
   * そうしないと「強化阻害で免疫を止める」という攻略が、
   * 観測点の側から黙って潰される。防いだ数はそのまま数える。
   */
  const grantTeamImmunity = (): void => {
    for (const id of ENEMY_IDS) {
      const unit = context.unitOf(id);
      if (!unit || !unit.alive) continue;
      if (unit.hasStatus("BUFF_BLOCK")) {
        counters.immunityBlocked += 1;
        continue;
      }
      // 本編と同じく Math.max。短い値で上書きして縮めない
      unit.immuneTurns = Math.max(unit.immuneTurns, TOWER80_RULES.immunityTurns);
    }
  };

  /**
   * ボスの状態から、免疫まわりの補正を張り直す。**毎手番の前後で呼ぶ。**
   * 免疫は手番の中で剥がされるので、行動前だけ見ていると
   * 「剥がれているのに硬いまま」の手番ができてしまう。
   */
  const syncBossState = (): void => {
    const unit = boss();
    if (!unit || !unit.alive) return;
    const immune = unit.immuneTurns > 0;

    unit.flatStatBonus.atk = immune && !options.noImmuneAtk ? TOWER80_RULES.immuneAtkBonus : 0;
    /*
     * 被ダメージ増加は**軽減の裏返し**で表す(本編に「被ダメ増加」の口が無い)。
     * 期限は切らさない——切れた瞬間だけ硬くなる盤面ができると、
     * 測っているのが何なのか分からなくなる
     */
    unit.mitigateTurns = 999;
    unit.mitigateAmount = immune || options.noStrippedWeakness ? 0 : -TOWER80_RULES.strippedDamageTaken;

    const ratio = unit.currentHp / unit.maxHp;
    const enraged = ratio < TOWER80_RULES.enrageHpRatio && !options.noEnrage;
    unit.setDamageMultiplierFactor(enraged ? TOWER80_RULES.enragedMultiplier : 1);
  };

  const playersAlive = (): number => PLAYER_IDS.filter((id) => context.aliveOf(id)).length;

  return {
    beforeTurn(unitId) {
      const unit = boss();
      if (!unit) return;

      // 戦闘開始時の全体免疫。**最初の手番の直前に1回だけ**
      if (!started) {
        started = true;
        grantTeamImmunity();
      }

      counters.turns += 1;
      syncBossState();

      if (unitId === BOSS && unit.alive) {
        counters.bossActions += 1;
        if (unit.immuneTurns > 0) counters.bossImmuneActions += 1;
        if (unit.hasStatus("BUFF_BLOCK")) counters.bossBuffBlockedActions += 1;
      }
    },

    afterTurn(_unitId, lines) {
      const unit = boss();
      if (!unit) return;

      // ボスへの剥がし。ログの主語がボスの行にだけ反応する
      for (const line of lines) {
        if (!line.includes(`[敵:${BOSS}]`)) continue;
        if (STRIP_LINE.test(line) && STRIP_VERB.test(line)) counters.bossStrips += 1;
      }
      // 強化阻害は「かかっていなかったものが、かかった」瞬間だけ数える
      const blockedNow = unit.hasStatus("BUFF_BLOCK");
      if (!bossWasBuffBlocked && blockedNow) counters.bossBuffBlocks += 1;
      bossWasBuffBlocked = blockedNow;

      // ボスS3の免疫供給(スキル定義では味方全体へ配れないので、ここで受ける)
      if (lines.some((line) => line.includes("「聖域の咆哮」"))) {
        counters.roarImmunity += 1;
        if (!options.noRoarImmunity) grantTeamImmunity();
      }

      if (unit.alive) {
        const ratio = unit.currentHp / unit.maxHp;
        // 閾値の免疫再展開。**初到達の1回だけ**
        for (const threshold of TOWER80_RULES.immunityThresholds) {
          if (fired.has(threshold) || ratio > threshold) continue;
          fired.add(threshold);
          if (threshold === 0.7) counters.thresholdImmunity70 += 1;
          else counters.thresholdImmunity40 += 1;
          if (!options.noThresholdImmunity) grantTeamImmunity();
        }
        if (ratio < TOWER80_RULES.enrageHpRatio) sawHalf = true;
      }

      syncBossState();

      // お供が倒れた手番を控える(上書きしない=最初に倒れた時だけ)
      if (counters.guardDownTurn === 0 && !context.aliveOf(GUARD)) counters.guardDownTurn = counters.turns;
      if (counters.breakerDownTurn === 0 && !context.aliveOf(BREAKER)) counters.breakerDownTurn = counters.turns;

      if (sawHalf && playersAlive() === 0) counters.wipedAfterHalf = 1;
    },

    finish() {
      const unit = boss();
      const acted = counters.bossActions;
      counters.bossHpLeft = unit ? Math.max(0, unit.currentHp) : 0;
      counters.bossHpRatioLeft = unit && unit.maxHp > 0 ? Math.max(0, unit.currentHp) / unit.maxHp : 0;
      counters.reachedHalf = sawHalf ? 1 : 0;
      return {
        ボス行動回数: acted,
        免疫中の行動割合: acted > 0 ? counters.bossImmuneActions / acted : 0,
        強化阻害中の行動割合: acted > 0 ? counters.bossBuffBlockedActions / acted : 0,

        ボスへの剥がし回数: counters.bossStrips,
        ボスへの強化阻害回数: counters.bossBuffBlocks,

        "免疫再展開70%": counters.thresholdImmunity70,
        "免疫再展開40%": counters.thresholdImmunity40,
        免疫再展開の合計: counters.thresholdImmunity70 + counters.thresholdImmunity40,
        S3の免疫供給: counters.roarImmunity,
        強化阻害で防いだ免疫: counters.immunityBlocked,

        ボス残HP: counters.bossHpLeft,
        ボス残HP割合: counters.bossHpRatioLeft,
        "HP50%未満へ到達": counters.reachedHalf,
        "HP50%未満後の全滅": counters.wipedAfterHalf,

        護晶が倒れた手番: counters.guardDownTurn,
        破邪獣が倒れた手番: counters.breakerDownTurn,
        護晶を倒せた: counters.guardDownTurn > 0 ? 1 : 0,
        破邪獣を倒せた: counters.breakerDownTurn > 0 ? 1 : 0,

        鼓舞晶の生存: context.aliveOf(INSPIRE) ? 1 : 0,
        呪獣の生存: context.aliveOf(CURSE) ? 1 : 0,
      };
    },
  };
}
