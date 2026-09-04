import { describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import type { DamageEffect } from "../src/core/skill.js";
import { findMonster } from "../src/data/monsters.js";
import { TRIAL_TOWER_FLOORS, findTowerFloor } from "../src/data/trialTower.js";
import {
  TOWER90_ACCURACY,
  TOWER90_BOSS_ATK,
  TOWER90_BOSS_DEF,
  TOWER90_BOSS_HP,
  TOWER90_BOSS_SPD,
  TOWER90_EARLY_DAMAGE_FACTOR,
  TOWER90_ENEMIES,
  TOWER90_ESCORT_DEATH_ATK,
  TOWER90_ESCORT_DEATH_CRI_DMG,
  TOWER90_ESCORT_DEATH_CRI_RATE,
  TOWER90_ESCORT_DEATH_SPD,
  TOWER90_FANG_EXECUTE_MULTIPLIER,
  TOWER90_FANG_EXECUTE_RAGE_MULTIPLIER,
  TOWER90_FANG_RAGE_ATK,
  TOWER90_FANG_RAGE_SPD,
  TOWER90_RAGE_HP20_DAMAGE_FACTOR,
  TOWER90_RAGE_HP40_DAMAGE_FACTOR,
  TOWER90_RESISTANCE,
  TOWER90_WAR_DRUM_BOSS_GAUGE,
} from "../src/data/trialTowerFloor90.js";
import { buildDungeonEnemyTeam } from "../src/game/dungeonRunner.js";
import { mulberry32 } from "../tools/battleLab/rng.js";

/*
 * 試練の塔90階「狂化」。Battle Lab V7 を本編へ移した回。
 *
 * ## ここで見張ること
 *
 * この階の芯は**お供を倒すとボスが強くなる**こと。だから
 * 「狂化が本当に乗っているか」「二重に乗っていないか」を数で確かめないと、
 * 勝率を測っても何の勝率なのか分からなくなる。
 *
 * 基準値(TYPICAL装備・各1000戦・安全処理型)。左がBattle Lab V7、右がこの実装:
 *   狂牙獣→戦鼓晶→ボス 25.3% → **27.8%**
 *   戦鼓晶→狂牙獣→ボス 32.0% → **34.9%**
 *   狂牙獣→ボス        25.3% → **28.9%**
 * 差はV7の盤面が戦鼓晶のCT-1を敵5体へ配っていたせい(正式仕様はボスだけ)。
 * 測り直しは `npx tsx tools/battleLab/tower90/measureLive.ts`。
 *
 * ## 90階以外へ漏れていないことも見張る
 *
 * 狂化も脆弱もこの階だけの仕掛け。他の階の戦闘へ effect が乗ったら、
 * 塔の他の階と通常ステージが黙って別物になる。
 */

/** 90階の盤面を組む。`trialTowerFloor: 90` を渡さないと階固有の処理は動かない */
function rig(options: { floor?: number } = {}) {
  const floor = options.floor ?? 90;
  const enemies = buildDungeonEnemyTeam(findTowerFloor(floor)!);
  const player = findMonster("wolf", "FIRE")!;
  const engine = new BattleEngine([player, player, player], enemies, {
    rng: mulberry32(1),
    maxTurns: 1,
    trialTowerFloor: floor,
  });
  const units = engine.getUnits();
  const foes = units.filter((unit) => unit.team === "ENEMY");
  return { engine, units, foes, boss: foes[0], rift: foes[1], warDrum: foes[2], fang: foes[3], bind: foes[4] };
}

/** ボスの狂化を張り直す(engine の private を呼ぶ。テストだけの入口) */
const sync = (rigged: ReturnType<typeof rig>): void => {
  (rigged.engine as unknown as { applyTrialBossAction(u: unknown): void }).applyTrialBossAction(rigged.boss);
};

const kill = (unit: { alive: boolean; currentHp: number }): void => { unit.alive = false; unit.currentHp = 0; };

describe("90階: 編成とステータス", () => {
  it("敵は5体で、古代ネメシスを倒せば勝ち", () => {
    const def = findTowerFloor(90)!;
    expect(def.enemies).toHaveLength(5);
    expect(def.enemies.map((enemy) => enemy.displayName)).toEqual([
      "古代ネメシス", "古代の裂晶", "古代の戦鼓晶", "古代の狂牙獣", "古代の縛晶",
    ]);
    // 勝利条件は1体だけ。お供を全滅させる必要はない
    expect(def.enemies.filter((enemy) => enemy.victoryTarget)).toHaveLength(1);
    expect(def.enemies[0].victoryTarget).toBe(true);
  });

  it("ボスを倒した時点で勝利になる(お供が4体残っていても)", () => {
    const r = rig();
    kill(r.boss);
    const result = r.engine.run();
    expect(result.winner).toBe("PLAYER");
    expect(r.foes.filter((foe) => foe.alive)).toHaveLength(4);
  });

  it("敵全員が的中65% / 抵抗50%", () => {
    for (const enemy of TOWER90_ENEMIES) {
      expect(enemy.fixedStats?.accuracy, enemy.displayName).toBe(TOWER90_ACCURACY);
      expect(enemy.fixedStats?.resistance, enemy.displayName).toBe(TOWER90_RESISTANCE);
    }
  });

  it("ボスは HP350,000 / ATK9,000 / DEF4,200 / SPD200", () => {
    expect(TOWER90_ENEMIES[0].fixedStats).toMatchObject({
      hp: TOWER90_BOSS_HP, atk: TOWER90_BOSS_ATK, def: TOWER90_BOSS_DEF, spd: TOWER90_BOSS_SPD,
    });
    expect([TOWER90_BOSS_HP, TOWER90_BOSS_ATK, TOWER90_BOSS_DEF, TOWER90_BOSS_SPD]).toEqual([350_000, 9_000, 4_200, 200]);
  });

  it("戦鼓晶は HP250,000 / DEF4,000 / SPD205、狂牙獣は ATK9,500 / SPD205", () => {
    expect(TOWER90_ENEMIES[2].fixedStats).toMatchObject({ hp: 250_000, def: 4_000, spd: 205 });
    expect(TOWER90_ENEMIES[3].fixedStats).toMatchObject({ atk: 9_500, spd: 205 });
  });

  it("残りのお供も依頼どおりの実数", () => {
    expect(TOWER90_ENEMIES[1].fixedStats).toMatchObject({ hp: 210_000, atk: 7_000, def: 3_200, spd: 175 });
    expect(TOWER90_ENEMIES[4].fixedStats).toMatchObject({ hp: 220_000, atk: 6_500, def: 3_800, spd: 165 });
  });
});

describe("90階: ボスの狂化(HP帯)", () => {
  it("HP70%以下で ATK+1,000 / SPD+20", () => {
    const r = rig();
    r.boss.currentHp = Math.round(r.boss.maxHp * 0.65);
    sync(r);
    expect(r.boss.flatStatBonus.atk).toBe(1_000);
    expect(r.boss.flatStatBonus.spd).toBe(20);
  });

  it("HP40%以下では**加算されて** ATK+3,000 / SPD+50", () => {
    // V6の+1,500にV7で+500を足した結果。70%以下のぶんと合わせて3,000
    const r = rig();
    r.boss.currentHp = Math.round(r.boss.maxHp * 0.35);
    sync(r);
    expect(r.boss.flatStatBonus.atk).toBe(3_000);
    expect(r.boss.flatStatBonus.spd).toBe(50);
  });

  it("HP20%以下では ATK+5,000 / SPD+100", () => {
    const r = rig();
    r.boss.currentHp = Math.round(r.boss.maxHp * 0.15);
    sync(r);
    expect(r.boss.flatStatBonus.atk).toBe(5_000);
    expect(r.boss.flatStatBonus.spd).toBe(100);
  });

  it("HPが戻れば狂化も戻る(HP帯の側は据え置きにしない)", () => {
    const r = rig();
    r.boss.currentHp = Math.round(r.boss.maxHp * 0.15);
    sync(r);
    expect(r.boss.flatStatBonus.atk).toBe(5_000);
    r.boss.currentHp = r.boss.maxHp;
    sync(r);
    expect(r.boss.flatStatBonus.atk).toBe(0);
  });
});

describe("90階: お供の死亡による永久狂化", () => {
  it("1体倒すごとに ATK+1,200 / SPD+15 / クリ率+10% / クリダメ+20%", () => {
    const r = rig();
    for (let killed = 1; killed <= 4; killed += 1) {
      kill(r.foes[killed]);
      sync(r);
      expect(r.boss.flatStatBonus.atk, `${killed}体`).toBe(killed * TOWER90_ESCORT_DEATH_ATK);
      expect(r.boss.flatStatBonus.spd, `${killed}体`).toBe(killed * TOWER90_ESCORT_DEATH_SPD);
      expect(r.boss.flatStatBonus.criRate, `${killed}体`).toBeCloseTo(killed * TOWER90_ESCORT_DEATH_CRI_RATE, 6);
      expect(r.boss.flatStatBonus.criDmg, `${killed}体`).toBeCloseTo(killed * TOWER90_ESCORT_DEATH_CRI_DMG, 6);
    }
    // 4体すべてなら ATK+4,800 / SPD+60 / クリ率+40% / クリダメ+80%
    expect(r.boss.flatStatBonus.atk).toBe(4_800);
    expect(r.boss.flatStatBonus.spd).toBe(60);
  });

  it("**同じお供の死亡を二重に数えない**(何度張り直しても増えない)", () => {
    const r = rig();
    kill(r.foes[1]);
    for (let i = 0; i < 10; i += 1) sync(r);
    expect(r.boss.flatStatBonus.atk).toBe(TOWER90_ESCORT_DEATH_ATK);
    expect(r.boss.flatStatBonus.spd).toBe(TOWER90_ESCORT_DEATH_SPD);
  });

  it("**倒したお供が生き返っても狂化は戻らない**(永久加算)", () => {
    /*
     * 生存数から引く形にすると、蘇生や再計算で狂化が戻ってしまう。
     * 「1体倒すごとに永久」なので、戻らないことが仕様の一部
     */
    const r = rig();
    kill(r.foes[1]);
    sync(r);
    r.foes[1].alive = true;
    r.foes[1].currentHp = r.foes[1].maxHp;
    sync(r);
    expect(r.boss.flatStatBonus.atk).toBe(TOWER90_ESCORT_DEATH_ATK);
  });

  it("HP帯の狂化とお供死亡の狂化は同時に効く", () => {
    // 依頼の例: HP20%以下 + お供4体 → SPD 200 + 20 + 30 + 50 + 60 = 360
    const r = rig();
    for (let i = 1; i <= 4; i += 1) kill(r.foes[i]);
    r.boss.currentHp = Math.round(r.boss.maxHp * 0.15);
    sync(r);
    expect(r.boss.flatStatBonus.spd).toBe(100 + 60);
    expect(TOWER90_BOSS_SPD + (r.boss.flatStatBonus.spd ?? 0)).toBe(360);
    expect(r.boss.flatStatBonus.atk).toBe(5_000 + 4_800);
  });

  it("**戦闘をやり直せば狂化は白紙から始まる**(二重適用しない)", () => {
    const first = rig();
    for (let i = 1; i <= 4; i += 1) kill(first.foes[i]);
    sync(first);
    expect(first.boss.flatStatBonus.atk).toBe(4_800);

    // 記録はエンジン1戦ぶん。新しいエンジンには持ち越さない
    const second = rig();
    sync(second);
    expect(second.boss.flatStatBonus.atk).toBe(0);
    expect(second.boss.flatStatBonus.criRate ?? 0).toBe(0);
  });
});

describe("90階: ボスの与ダメージ倍率は段階式", () => {
  const factorOf = (r: ReturnType<typeof rig>, ratio: number): number => {
    r.boss.currentHp = Math.round(r.boss.maxHp * ratio);
    return (r.engine as unknown as { tower90BossDamageFactor(u: unknown): number }).tower90BossDamageFactor(r.boss);
  };

  it("HP40%より上は×0.90、40%以下は×1.25、20%以下は×1.5", () => {
    const r = rig();
    expect(factorOf(r, 1.0)).toBe(TOWER90_EARLY_DAMAGE_FACTOR);
    expect(factorOf(r, 0.5)).toBe(TOWER90_EARLY_DAMAGE_FACTOR);
    expect(factorOf(r, 0.35)).toBe(TOWER90_RAGE_HP40_DAMAGE_FACTOR);
    expect(factorOf(r, 0.15)).toBe(TOWER90_RAGE_HP20_DAMAGE_FACTOR);
  });

  it("**掛け算で積まない**(1.25×1.5=1.875 にはしない)", () => {
    const r = rig();
    expect(factorOf(r, 0.15)).toBe(1.5);
    expect(factorOf(r, 0.15)).not.toBeCloseTo(1.25 * 1.5, 6);
  });
});

describe("90階: 絶・終焉の波動", () => {
  const s3 = TOWER90_ENEMIES[0].skills![2];

  it("名前とCTが仕様どおり", () => {
    expect(s3.name).toBe("絶・終焉の波動");
    expect(s3.cooldownTurns).toBe(5);
    expect(s3.target).toBe("ALL_ENEMIES");
  });

  it("**全バフ解除**(1個解除ではない)。解除率100%", () => {
    // engine は `count ?? Number.POSITIVE_INFINITY` で解くので、count を書かないのが全解除
    const strip = s3.effects.find((effect) => effect.kind === "STRIP") as { chance: number; count?: number };
    expect(strip).toBeDefined();
    expect(strip.chance).toBe(1);
    expect(strip.count).toBeUndefined();
  });

  it("処理順は ダメージ → 全解除 → ゲージ-50% → 防御-50%3ターン", () => {
    expect(s3.effects.map((effect) => effect.kind)).toEqual(["DAMAGE", "STRIP", "GAUGE", "DEBUFF"]);
    expect(s3.effects[0]).toMatchObject({ multiplier: 1.35 });
    expect(s3.effects[2]).toMatchObject({ amount: -0.5 });
    expect(s3.effects[3]).toMatchObject({ stat: "def", amount: 0.5, durationTurns: 3, chance: 1 });
  });

  it("旧仕様の速度ダウンは入っていない", () => {
    expect(s3.effects.some((effect) => effect.kind === "DEBUFF" && effect.stat === "spd")).toBe(false);
  });
});

describe("90階: 裂晶の脆弱刻印は被ダメージを増やす", () => {
  it("負の MITIGATE が「40%軽減」ではなく「40%増加」になる", () => {
    /*
     * **正負の向きを間違えると、狙いと真逆の効果になる。**
     * `damageTakenMultiplier` は `1 - reduction` なので、
     * -0.4 が入って初めて 1.4倍(4割増し)になる
     */
    const r = rig();
    const target = r.units.find((unit) => unit.team === "PLAYER")!;
    (r.engine as unknown as { applySkillEffects(s: unknown, t: unknown, k: unknown, m: boolean, p: boolean): void })
      .applySkillEffects(r.rift, target, TOWER90_ENEMIES[1].skills![2], false, true);
    expect(target.mitigateAmount).toBeCloseTo(-0.4, 6);
    expect(target.mitigateTurns).toBeGreaterThan(0);
  });

  it("実際に受けるダメージの倍率が1.4倍になる", async () => {
    const { damageTakenMultiplier } = await import("../src/battle/unit.js");
    const r = rig();
    const target = r.units.find((unit) => unit.team === "PLAYER")!;
    expect(damageTakenMultiplier(target)).toBeCloseTo(1, 6);
    target.mitigateAmount = -0.4;
    target.mitigateTurns = 2;
    expect(damageTakenMultiplier(target)).toBeCloseTo(1.4, 6);
  });
});

describe("90階: 戦鼓晶S3はボスにだけ追加を渡す", () => {
  const s3 = TOWER90_ENEMIES[2].skills![2];

  it("スキル定義が配るのは全体ゲージ+30%だけ(CT短縮は入れない)", () => {
    /*
     * ここに `COOLDOWN_REDUCE` を書くとお供4体にも配られ、
     * 妨害役の縛晶まで回転が上がって別物の階になる
     */
    expect(s3.effects).toEqual([{ kind: "GAUGE", amount: 0.3 }]);
    expect(s3.effects.some((effect) => effect.kind === "COOLDOWN_REDUCE")).toBe(false);
  });

  it("ボスにだけ 行動ゲージ+15% と スキルCT-1 が乗る", () => {
    const r = rig();
    r.boss.cooldowns = [0, 3, 5];
    r.fang.cooldowns = [0, 3, 4];
    const gaugeBefore = r.boss.gauge;
    (r.engine as unknown as { applyTower90WarDrumTempo(): void }).applyTower90WarDrumTempo();

    expect(r.boss.gauge).toBeGreaterThan(gaugeBefore);
    expect(r.boss.cooldowns).toEqual([0, 2, 4]);
    // **お供のCTは1つも動かない**
    expect(r.fang.cooldowns).toEqual([0, 3, 4]);
  });

  it("追加ゲージの量は15%ぶん", () => {
    const r = rig();
    r.boss.gauge = 0;
    (r.engine as unknown as { applyTower90WarDrumTempo(): void }).applyTower90WarDrumTempo();
    // 行動ゲージは満タンが100
    expect(r.boss.gauge).toBeCloseTo(TOWER90_WAR_DRUM_BOSS_GAUGE * 100, 6);
  });
});

describe("90階: 戦鼓晶死亡後の狂牙獣", () => {
  it("戦鼓晶が生きている間は強化されない", () => {
    const r = rig();
    (r.engine as unknown as { syncTower90Fang(): void }).syncTower90Fang();
    expect(r.fang.flatStatBonus.atk ?? 0).toBe(0);
    expect(r.fang.flatStatBonus.spd ?? 0).toBe(0);
  });

  it("戦鼓晶が倒れ、狂牙獣が生きている間だけ ATK+1,500 / SPD+15", () => {
    const r = rig();
    kill(r.warDrum);
    (r.engine as unknown as { syncTower90Fang(): void }).syncTower90Fang();
    expect(r.fang.flatStatBonus.atk).toBe(TOWER90_FANG_RAGE_ATK);
    expect(r.fang.flatStatBonus.spd).toBe(TOWER90_FANG_RAGE_SPD);
  });

  it("狂牙獣が先に倒れていれば発動しない", () => {
    const r = rig();
    kill(r.fang);
    kill(r.warDrum);
    (r.engine as unknown as { syncTower90Fang(): void }).syncTower90Fang();
    expect(r.fang.flatStatBonus.atk ?? 0).toBe(0);
  });

  it("**処刑突撃だけ 2.6 → 2.9 倍。S1・S2は据え置き**", () => {
    const r = rig();
    const enraged = (): boolean =>
      (r.engine as unknown as { isTower90FangEnraged(u: unknown): boolean }).isTower90FangEnraged(r.fang);
    expect(enraged()).toBe(false);
    kill(r.warDrum);
    expect(enraged()).toBe(true);

    // 素の定義は2.6のまま。倍率の差し替えは撃つ瞬間だけ
    const skills = TOWER90_ENEMIES[3].skills!;
    expect((skills[2].effects[0] as DamageEffect).multiplier).toBe(TOWER90_FANG_EXECUTE_MULTIPLIER);
    expect(TOWER90_FANG_EXECUTE_RAGE_MULTIPLIER).toBe(2.9);
    // S1・S2の倍率は強化後も変わらない
    expect((skills[0].effects[0] as DamageEffect).multiplier).toBe(1.1);
    expect((skills[1].effects[0] as DamageEffect).multiplier).toBe(0.8);
  });
});

describe("90階の仕掛けは90階の外へ漏れていない", () => {
  it("他の階では狂化も脆弱も動かない", () => {
    for (const floor of [60, 70, 80, 100]) {
      const r = rig({ floor });
      const boss = r.foes[0];
      boss.currentHp = Math.round(boss.maxHp * 0.15);
      const before = { ...boss.flatStatBonus };
      (r.engine as unknown as { syncTower90Boss(u: unknown): void }).syncTower90Boss(boss);
      // 90階以外では何も足さない(70階は自前の段階を持つので、そちらの値は触らない)
      expect(boss.flatStatBonus.criRate ?? 0, `${floor}階`).toBe(before.criRate ?? 0);
      expect(boss.flatStatBonus.criDmg ?? 0, `${floor}階`).toBe(before.criDmg ?? 0);
    }
  });

  it("60/70/80/100階の敵の数は変わっていない", () => {
    expect(findTowerFloor(60)!.enemies).toHaveLength(3);
    expect(findTowerFloor(70)!.enemies).toHaveLength(3);
    expect(findTowerFloor(80)!.enemies).toHaveLength(3);
    expect(findTowerFloor(100)!.enemies).toHaveLength(3);
  });

  it("90階の仮スキルIDが他の階へ紛れていない", () => {
    const others = TRIAL_TOWER_FLOORS.filter((floor) => floor.floor !== 90);
    expect(JSON.stringify(others)).not.toContain("tower90_");
  });

  it("報酬は他のボス階と同じ式のまま(今回は触っていない)", () => {
    // 90階は節(10階ごと)の報酬。**敵編成を作り替えても報酬式には手を入れていない**
    expect(findTowerFloor(90)!.firstClearReward).toEqual({ crystal: 350, skillPigs: 3, awakeningOrbs: 3 });
  });
});

describe("90階: 実際に戦って狂化が効いていることを見る", () => {
  /*
   * ## なぜ勝率で見張らないのか
   *
   * 通しの勝率(27.8% / 34.9% / 28.9%)を見張るには各1000戦が要り、
   * ここへ置くと通常のテストが分単位になる。それは
   * `npx tsx tools/battleLab/tower90/measureLive.ts` の仕事。
   *
   * ここが見張るのは**仕掛けが1つでも黙って死んでいないか**。
   * engine の90階分岐が丸ごと外れても、上のテストは private を直接叩いているので
   * 全部通ってしまう。実戦を1本走らせて、盤面に痕跡が出ることまで確かめる。
   */
  /** 90階の盤面を実際に最後まで走らせる。`floor` を渡さないと階固有の処理は動かない */
  const play = (floor?: number): { log: string[]; foes: ReturnType<BattleEngine["getUnits"]> } => {
    const enemies = buildDungeonEnemyTeam(findTowerFloor(90)!);
    const player = findMonster("wolf", "FIRE")!;
    const engine = new BattleEngine([player, player, player, player], enemies, {
      // **同じ種・同じ盤面。**違うのは階番号を渡したかどうかだけ
      rng: mulberry32(20260990),
      maxTurns: 60,
      trialTowerFloor: floor,
    });
    const result = engine.run();
    return { log: result.log, foes: engine.getUnits().filter((unit) => unit.team === "ENEMY") };
  };

  it("階番号を渡した時だけ戦いの中身が変わる(engine の90階処理が生きている)", () => {
    /*
     * engine の90階分岐が丸ごと外れても、上のテストは private を直接叩いているので
     * 全部通ってしまう。**同じ種で階番号だけ変えて、結果が違うこと**を見る。
     * 狂化も脆弱も戦鼓晶の追加テンポも全部 `trialTowerFloor` を鍵にしているので、
     * 1つでも生きていればログは必ず食い違う
     */
    const withFloor = play(90);
    const without = play(undefined);
    expect(withFloor.log).not.toEqual(without.log);
  });

  it("戦鼓晶とボスのS3が実戦で撃たれている(撃たれない技を測っても意味がない)", () => {
    const r = play(90);
    expect(r.log.some((line) => line.includes("血戦共鳴"))).toBe(true);
    expect(r.log.some((line) => line.includes("絶・終焉の波動"))).toBe(true);
  });

  it("お供を1体でも倒せばボスの狂化が盤面に残る", () => {
    const r = rig();
    kill(r.rift);
    sync(r);
    expect(r.boss.flatStatBonus.atk).toBeGreaterThanOrEqual(TOWER90_ESCORT_DEATH_ATK);
  });
});
