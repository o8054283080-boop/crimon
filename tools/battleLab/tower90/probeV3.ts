import type { ScenarioProbe, TrackedUnit } from "../types.js";

const BOSS = "E1";
const ESCORTS = ["E2", "E3", "E4", "E5"] as const;
const PLAYERS = ["P1", "P2", "P3", "P4", "P5"] as const;

interface Context {
  unitOf(id: string): TrackedUnit | undefined;
  aliveOf(id: string): boolean;
}

export const TOWER90_V3_RULES = {
  hp70Atk: 1_000,
  hp70Spd: 20,
  hp40AtkExtra: 1_500,
  hp40SpdExtra: 30,
  hp40DamageFactor: 1.25,
  hp20AtkExtra: 2_000,
  hp20SpdExtra: 50,
  hp20DamageFactor: 1.5,
  escortAtk: 1_200,
  escortSpd: 15,
} as const;

export function tower90ProbeV3(context: Context): ScenarioProbe {
  let turns = 0;
  let reached70 = false;
  let reached40 = false;
  let reached20 = false;
  let wipedAfter40 = false;
  let wipedAfter20 = false;
  let bossActions = 0;
  let bossActions40 = 0;
  let bossActions20 = 0;
  let warDrumBuffUses = 0;
  let warDrumTempoUses = 0;
  let fangKills = 0;
  let playersAliveBeforeTurn = PLAYERS.length;
  const deathTurn: Record<string, number> = { E2: 0, E3: 0, E4: 0, E5: 0 };
  let previousAlive = new Set<string>(ESCORTS.filter((id) => context.aliveOf(id)));

  const boss = (): TrackedUnit | undefined => context.unitOf(BOSS);
  const playerAliveCount = (): number => PLAYERS.filter((id) => context.aliveOf(id)).length;
  const escortsDown = (): number => ESCORTS.filter((id) => !context.aliveOf(id)).length;

  const rageStage = (): 0 | 1 | 2 | 3 => {
    const unit = boss();
    if (!unit || !unit.alive) return 0;
    const ratio = unit.currentHp / unit.maxHp;
    if (ratio <= 0.20) return 3;
    if (ratio <= 0.40) return 2;
    if (ratio <= 0.70) return 1;
    return 0;
  };

  const syncBoss = (): void => {
    const unit = boss();
    if (!unit || !unit.alive) return;
    const ratio = unit.currentHp / unit.maxHp;
    const kills = escortsDown();
    let hpAtk = 0;
    let hpSpd = 0;
    let damageFactor = 1;
    if (ratio <= 0.70) {
      hpAtk += TOWER90_V3_RULES.hp70Atk;
      hpSpd += TOWER90_V3_RULES.hp70Spd;
    }
    if (ratio <= 0.40) {
      hpAtk += TOWER90_V3_RULES.hp40AtkExtra;
      hpSpd += TOWER90_V3_RULES.hp40SpdExtra;
      damageFactor = TOWER90_V3_RULES.hp40DamageFactor;
    }
    if (ratio <= 0.20) {
      hpAtk += TOWER90_V3_RULES.hp20AtkExtra;
      hpSpd += TOWER90_V3_RULES.hp20SpdExtra;
      damageFactor = TOWER90_V3_RULES.hp20DamageFactor;
    }
    unit.flatStatBonus.atk = hpAtk + kills * TOWER90_V3_RULES.escortAtk;
    unit.flatStatBonus.spd = hpSpd + kills * TOWER90_V3_RULES.escortSpd;
    unit.setDamageMultiplierFactor(damageFactor);
  };

  const observeThresholds = (): void => {
    const unit = boss();
    if (!unit) return;
    const ratio = unit.currentHp / unit.maxHp;
    if (ratio <= 0.70) reached70 = true;
    if (ratio <= 0.40) reached40 = true;
    if (ratio <= 0.20) reached20 = true;
    if (playerAliveCount() === 0 && reached40) wipedAfter40 = true;
    if (playerAliveCount() === 0 && reached20) wipedAfter20 = true;
  };

  const observeEscortDeaths = (): void => {
    for (const id of ESCORTS) {
      if (previousAlive.has(id) && !context.aliveOf(id) && deathTurn[id] === 0) deathTurn[id] = turns;
    }
    previousAlive = new Set<string>(ESCORTS.filter((id) => context.aliveOf(id)));
  };

  return {
    beforeTurn(unitId) {
      turns += 1;
      playersAliveBeforeTurn = playerAliveCount();
      syncBoss();
      observeThresholds();
      observeEscortDeaths();
      if (unitId === BOSS && context.aliveOf(BOSS)) {
        bossActions += 1;
        const stage = rageStage();
        if (stage >= 2) bossActions40 += 1;
        if (stage >= 3) bossActions20 += 1;
      }
    },
    afterTurn(unitId, lines) {
      if (unitId === "E3" && lines.some((line) => line.includes("狂戦の鼓動"))) warDrumBuffUses += 1;
      if (unitId === "E3" && lines.some((line) => line.includes("血戦共鳴"))) warDrumTempoUses += 1;
      observeEscortDeaths();
      syncBoss();
      observeThresholds();
      const playersAfter = playerAliveCount();
      if (unitId === "E4" && playersAfter < playersAliveBeforeTurn) fangKills += playersAliveBeforeTurn - playersAfter;
    },
    finish() {
      syncBoss();
      observeThresholds();
      observeEscortDeaths();
      const unit = boss();
      const hp = unit?.currentHp ?? 0;
      const max = unit?.maxHp ?? 1;
      const kills = escortsDown();
      return {
        "ボス残HP": hp,
        "ボス残HP割合": hp / max,
        "HP70%以下へ到達": reached70 ? 1 : 0,
        "HP40%以下へ到達": reached40 ? 1 : 0,
        "HP20%以下へ到達": reached20 ? 1 : 0,
        "HP40%以下後の全滅": wipedAfter40 ? 1 : 0,
        "HP20%以下後の全滅": wipedAfter20 ? 1 : 0,
        "倒したお供の数": kills,
        "お供死亡狂化ATK": kills * TOWER90_V3_RULES.escortAtk,
        "お供死亡狂化SPD": kills * TOWER90_V3_RULES.escortSpd,
        "ボス行動回数": bossActions,
        "HP40%以下でのボス行動": bossActions40,
        "HP20%以下でのボス行動": bossActions20,
        "戦鼓晶ATK/SPDバフ使用": warDrumBuffUses,
        "戦鼓晶加速使用": warDrumTempoUses,
        "狂牙獣による撃破数": fangKills,
        "裂晶が倒れた手番": deathTurn.E2,
        "戦鼓晶が倒れた手番": deathTurn.E3,
        "狂牙獣が倒れた手番": deathTurn.E4,
        "縛晶が倒れた手番": deathTurn.E5,
        "最終狂化段階": rageStage(),
      };
    },
  };
}
