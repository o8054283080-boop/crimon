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
import type { ScenarioHook, ScenarioProbe, TrackedUnit } from "./types.js";

/** `BattleUnit` の、観測点に見せてよいところだけを開く */
function track(unit: BattleUnit): TrackedUnit {
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
     * HP比例ダメージの係数だけを掛け直す。
     *
     * 本編は `hpCoefficient × (1 + パッシブの上乗せ)` で計算するので、
     * 係数そのものを1.2倍するのと**数式として同じ**
     * (0.03 × 1.2 と 0.03 × (1 + 0.2) は同じ値)。
     * パッシブ枠が空いていない敵で「HP比例部分だけ+20%」を測るための口で、
     * 掛け直すのは**この1体の定義**だけ。図鑑にも他の敵にも波及しない。
     */
    scaleHpCoefficients(factor: number) {
      const skills = unit.def.skills.map((skill) => ({
        ...skill,
        effects: skill.effects.map((effect) =>
          effect.kind === "DAMAGE" && effect.hpCoefficient !== undefined
            ? { ...effect, hpCoefficient: effect.hpCoefficient * factor }
            : effect,
        ),
      }));
      (unit.def as { skills: unknown }).skills = skills;
    },
  };
}

/**
 * エンジンへ観測点を取り付ける。返り値の `finish()` が階固有の集計を返す。
 * `hook` が無ければ何もしない(これまでどおりのエンジンが動く)。
 */
export function attachProbe(engine: BattleEngine, hook: ScenarioHook | undefined): ScenarioProbe | null {
  if (!hook) return null;

  const engineAny = engine as unknown as {
    units: BattleUnit[];
    log: string[];
    recordTurn: (unit: BattleUnit, choice?: unknown) => unknown;
  };
  const units = engineAny.units;
  const idOf = (unit: BattleUnit): string => unit.instanceId;
  const find = (id: string): BattleUnit | undefined => units.find((unit) => idOf(unit) === id);

  const probe = hook({
    unitOf: (id) => { const unit = find(id); return unit ? track(unit) : undefined; },
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
