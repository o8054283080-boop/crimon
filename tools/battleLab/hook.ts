/**
 * 手番の境目へ観測点を差し込む。
 *
 * ## 何をしているか
 *
 * `BattleEngine` が1手番を解決するために呼ぶ `recordTurn` を、
 * **そのインスタンスに限って**包む。前後に観測点を呼ぶだけで、
 * 中で走るのは元のままの `recordTurn`(=本編の `takeTurn`)。
 *
 * ## なぜこの形か
 *
 *   ・`BattleEngine.prototype` を書き換えると、他のシナリオまで巻き添えになる
 *   ・エンジンを継承して override しようにも、`recordTurn` は private で
 *     TypeScript が許さない
 *   ・戦闘のループを外で組み直すと、**それはもう本編の戦闘ではない**
 *
 * インスタンスのプロパティとして関数を置けば、`this.recordTurn(...)` は
 * プロトタイプより先にそちらを見る。触るのは1体のエンジンだけで済む。
 *
 * ## 触れる範囲を型で狭めてある
 *
 * 観測点へ渡すのは `TrackedUnit`(HP・シールド・軽減・実数加算だけ)。
 * ダメージ計算にも命中判定にもAIにも手は届かない。
 */
import type { BattleEngine } from "../../src/battle/engine.js";
import type { BattleUnit } from "../../src/battle/unit.js";
import type { Skill } from "../../src/core/skill.js";
import type { ScenarioHook, ScenarioProbe, TrackedUnit } from "./types.js";

/** エンジンの中の、観測点から呼んでよいところ */
interface EngineInternals {
  units: BattleUnit[];
  log: string[];
  recordTurn: (unit: BattleUnit, choice?: unknown) => unknown;
  /** 手番もクールタイムも行動ゲージも消費せずにスキルを撃つ、本編の口 */
  counterWithSkill: (source: BattleUnit, index: 0 | 1 | 2) => void;
}

/** `BattleUnit` の、観測点に見せてよいところだけを開く */
function track(unit: BattleUnit, engine: EngineInternals): TrackedUnit {
  /*
   * 素のスキル定義。**段階の倍率は必ずここから計算する。**
   * 現在値へ掛け続けると、段が上がるたびに倍率が積み重なり、
   * HPが戻っても弱い段へ下がれなくなる(第1回の実装がこれだった)
   */
  const baseSkills = unit.def.skills.map((skill) => ({
    ...skill,
    effects: skill.effects.map((effect) => ({ ...effect })),
  })) as [Skill, Skill, Skill];
  return {
    get currentHp() { return unit.currentHp; },
    set currentHp(value: number) { unit.currentHp = value; },
    get maxHp() { return unit.maxHp; },
    get shieldValue() { return unit.shieldValue; },
    set shieldValue(value: number) { unit.shieldValue = value; },
    get shieldTurns() { return unit.shieldTurns; },
    set shieldTurns(value: number) { unit.shieldTurns = value; },
    get mitigateTurns() { return unit.mitigateTurns; },
    set mitigateTurns(value: number) { unit.mitigateTurns = value; },
    get mitigateAmount() { return unit.mitigateAmount; },
    set mitigateAmount(value: number) { unit.mitigateAmount = value; },
    get flatStatBonus() { return unit.flatStatBonus as { spd?: number; atk?: number; def?: number }; },
    get poisonStacks() { return unit.poisonStacks; },
    get alive() { return unit.alive; },
    /*
     * 弱体の数え方は本編の `cleanseDebuffs` が消す対象に合わせてある。
     * ここがずれると「解除で何個消えたか」が実際と食い違う
     */
    get debuffCount() {
      let count = unit.effects.filter((effect) => effect.kind === "DEBUFF").length;
      count += unit.statusEffects.filter((effect) => effect.category === "DEBUFF").length;
      if (unit.poisonStacks > 0 || unit.poisonTurns > 0) count += 1;
      if (unit.healBlockTurns > 0) count += 1;
      if (unit.stunTurns > 0) count += 1;
      if (unit.burnTurns > 0) count += 1;
      if (unit.blindTurns > 0) count += 1;
      return count;
    },
    get skills() {
      return unit.def.skills.map((skill) => ({
        name: skill.name,
        hpCoefficients: skill.effects
          .filter((effect) => effect.kind === "DAMAGE" && effect.hpCoefficient !== undefined)
          .map((effect) => (effect as { hpCoefficient: number }).hpCoefficient),
      }));
    },
    /*
     * HP比例ダメージの係数を、**素の定義から**この倍率で置き直す。
     *
     * 本編は `hpCoefficient × (1 + パッシブの上乗せ)` で計算するので、
     * 係数そのものを1.2倍するのと**数式として同じ**
     * (0.03 × 1.2 と 0.03 × (1 + 0.2) は同じ値)。
     * パッシブ枠が空いていない敵で「HP比例部分だけ+N%」を測るための口で、
     * 置き直すのは**この1体の定義**だけ。図鑑にも他の敵にも波及しない。
     *
     * **累積しない。**`1` を渡せば補正なしへ戻るので、
     * HPが回復して弱い段へ下がる動きもそのまま作れる。
     */
    setHpCoefficientFactor(factor: number) {
      const skills = baseSkills.map((skill) => ({
        ...skill,
        effects: skill.effects.map((effect) =>
          effect.kind === "DAMAGE" && effect.hpCoefficient !== undefined
            ? { ...effect, hpCoefficient: effect.hpCoefficient * factor }
            : effect,
        ),
      }));
      (unit.def as { skills: unknown }).skills = skills;
    },
    /*
     * 手番・クールタイム・行動ゲージを消費せずに1回撃つ。
     *
     * 本編の `counterWithSkill` は**枠の番号でしかスキルを選べない**ので、
     * 撃つ間だけ3番目の枠へ差し込み、終わったら元へ戻す。
     * クールタイムには一切触らない機構なので、戻せば何も残らない。
     *
     * **ダメージも命中も抵抗も会心も防御計算も、全部エンジンが決める。**
     * ここでやっているのは差し替えと呼び出しだけ。
     */
    fireImmediate(skill: Skill): string[] {
      const current = unit.def.skills;
      const swapped = [current[0], current[1], skill] as [Skill, Skill, Skill];
      (unit.def as { skills: unknown }).skills = swapped;
      const before = engine.log.length;
      try {
        engine.counterWithSkill(unit, 2);
      } finally {
        (unit.def as { skills: unknown }).skills = current;
      }
      return engine.log.slice(before);
    },
  };
}

/**
 * エンジンへ観測点を取り付ける。返り値の `finish()` が階固有の集計を返す。
 * `hook` が無ければ何もしない(これまでどおりのエンジンが動く)。
 */
export function attachProbe(engine: BattleEngine, hook: ScenarioHook | undefined): ScenarioProbe | null {
  if (!hook) return null;

  const engineAny = engine as unknown as EngineInternals;
  const units = engineAny.units;
  const idOf = (unit: BattleUnit): string => unit.instanceId;
  const find = (id: string): BattleUnit | undefined => units.find((unit) => idOf(unit) === id);

  /*
   * `TrackedUnit` は素のスキル定義を抱えるので、1体につき1つだけ作って使い回す。
   * 毎回作り直すと「素の定義」が段階適用後のものになり、倍率が積み重なる
   */
  const tracked = new Map<string, TrackedUnit>();
  const trackedOf = (id: string): TrackedUnit | undefined => {
    const unit = find(id);
    if (!unit) return undefined;
    let entry = tracked.get(id);
    if (!entry) { entry = track(unit, engineAny); tracked.set(id, entry); }
    return entry;
  };

  const probe = hook({
    unitOf: trackedOf,
    aliveOf: (id) => find(id)?.alive ?? false,
  });

  const original = engineAny.recordTurn.bind(engineAny);
  engineAny.recordTurn = (unit: BattleUnit, choice?: unknown) => {
    probe.beforeTurn(idOf(unit));
    const before = engineAny.log.length;
    const record = original(unit, choice);
    probe.afterTurn(idOf(unit), engineAny.log.slice(before));
    return record;
  };

  return probe;
}
