import { scaledEnemyAtk } from "../battle/enemyPower.js";
import { BattleEngine } from "../battle/engine.js";
import { DEFAULT_COMBAT_MODIFIERS, Equipment } from "../core/equipment.js";
import { MonsterDefinition } from "../core/monster.js";
import { MonsterInstance, resolveEquippedItems, toBattleDefinition } from "../core/monsterInstance.js";
import { Star, STAR_MAX_LEVEL, computeEffectiveStats } from "../core/rarity.js";
import { Difficulty, DIFFICULTY_MODIFIERS, Wave, WaveEnemy } from "../data/stages.js";
import { findMonsterById } from "../data/monsters.js";

export function resolveDex(dexId: string): MonsterDefinition {
  const dex = findMonsterById(dexId);
  if (!dex) throw new Error(`図鑑に存在しないモンスターです: ${dexId}`);
  return dex;
}

/** 難易度に応じて敵の星・レベルを底上げする(星は6でクランプ、レベルは新しい星の最大レベルでクランプ) */
function applyDifficultyToEnemy(enemy: WaveEnemy, difficulty: Difficulty): WaveEnemy {
  const mod = DIFFICULTY_MODIFIERS[difficulty];
  if (mod.starBonus === 0 && mod.levelBonus === 0) return enemy;
  const star = Math.min(6, enemy.star + mod.starBonus) as Star;
  const level = Math.min(enemy.level + mod.levelBonus, STAR_MAX_LEVEL[star]);
  return { ...enemy, star, level };
}

/**
 * 章ボス固有の戦闘補正。
 * 腐食トレントは「遅い代わりに、手番を渡すほど再生する」ボスとして成立させる。
 * 装備由来のcombatModsとは独立した敵専用定義だが、BattleEngineの既存ターン回復処理を
 * そのまま使うためセーブ形式や通常モンスターの挙動には影響しない。
 */
function bossCombatMods(enemy: WaveEnemy, dex: MonsterDefinition, difficulty: Difficulty): MonsterDefinition["combatMods"] {
  if (enemy.displayName !== "腐食トレント") return dex.combatMods;
  const turnHealPercent: Record<Difficulty, number> = {
    NORMAL: 0.03,
    HARD: 0.05,
    HELL: 0.07,
  };
  return {
    ...(dex.combatMods ?? DEFAULT_COMBAT_MODIFIERS),
    turnHealPercent: turnHealPercent[difficulty],
  };
}

function defFromWaveEnemy(
  enemy: WaveEnemy,
  powerScale: number,
  speedScale: number,
  difficulty: Difficulty,
): MonsterDefinition {
  const dex = resolveDex(`${enemy.templateId}_${enemy.element}`);
  const base = computeEffectiveStats(dex.stats, enemy.star, enemy.level);
  const difficultySpeed = DIFFICULTY_MODIFIERS[difficulty].speedScaleMultiplier;
  // ボスのspeedOverrideはNORMAL時の最終実効速度。通常敵だけウェーブの速度カーブを使う。
  const normalSpeed = enemy.speedOverride ?? base.spd * speedScale;
  const stats = {
    ...base,
    hp: Math.round(base.hp * powerScale),
    atk: scaledEnemyAtk(base.atk * powerScale),
    def: Math.round(base.def * powerScale),
    spd: Math.round(normalSpeed * difficultySpeed),
  };

  const counterAfterHits = enemy.bossCounterAfterHits?.[difficulty];
  const bossTraits = counterAfterHits
    ? { ...dex.bossTraits, counterAfterHits, counterMultiplier: dex.bossTraits?.counterMultiplier ?? 1.4 }
    : dex.bossTraits;

  return {
    ...dex,
    id: `${dex.id}_wave`,
    name: `${enemy.displayName ?? dex.name}★${enemy.star} Lv${enemy.level}${enemy.isBoss ? " 【BOSS】" : ""}`,
    stats,
    combatMods: bossCombatMods(enemy, dex, difficulty),
    bossTraits,
  };
}

export function buildEnemyTeam(wave: Wave, difficulty: Difficulty = "NORMAL"): MonsterDefinition[] {
  const mod = DIFFICULTY_MODIFIERS[difficulty];
  const powerScale = wave.powerScale * mod.powerScaleMultiplier;
  return wave.enemies.map((enemy) =>
    defFromWaveEnemy(applyDifficultyToEnemy(enemy, difficulty), powerScale, wave.speedScale, difficulty),
  );
}

export interface WaveBattleSetup {
  playerDefs: MonsterDefinition[];
  enemyDefs: MonsterDefinition[];
  initialPlayerHp: number[] | undefined;
}

/**
 * partyInstances は現在生存しているパーティメンバー(このウェーブに参加する順)。
 * carryHp が渡された場合、そのインスタンスIDに対応する残りHPを引き継いで開始する。
 */
export function setupWaveBattle(
  partyInstances: MonsterInstance[],
  carryHp: Map<string, number> | null,
  wave: Wave,
  allEquipment: Equipment[] = [],
  difficulty: Difficulty = "NORMAL",
): WaveBattleSetup {
  const playerDefs = partyInstances.map((instance) =>
    toBattleDefinition(instance, resolveDex(instance.dexId), resolveEquippedItems(instance, allEquipment)),
  );
  const enemyDefs = buildEnemyTeam(wave, difficulty);
  const initialPlayerHp = carryHp
    ? partyInstances.map((instance, i) => carryHp.get(instance.id) ?? playerDefs[i].stats.hp)
    : undefined;

  return { playerDefs, enemyDefs, initialPlayerHp };
}

export interface WaveSurvivors {
  survivorInstances: MonsterInstance[];
  survivorHp: Map<string, number>;
}

/** バトル終了後、パーティ側の生存者と残りHPを取り出す(次ウェーブへの持ち越し用) */
export function extractSurvivors(engine: BattleEngine, partyInstances: MonsterInstance[]): WaveSurvivors {
  const units = engine.getUnits();
  const survivorInstances: MonsterInstance[] = [];
  const survivorHp = new Map<string, number>();

  partyInstances.forEach((instance, i) => {
    const unit = units[i];
    if (unit && unit.alive) {
      survivorInstances.push(instance);
      survivorHp.set(instance.id, unit.currentHp);
    }
  });

  return { survivorInstances, survivorHp };
}

/**
 * ステージの中間ウェーブ勝利は、結果ボタンを押させず短い間だけ「勝利」を見せて
 * 次のウェーブへ送る。最終ウェーブの報酬ボタンや敗北ボタンは対象外。
 *
 * 戦闘ビュー側の既存 onFinish をそのまま発火させるため、HP持ち越し・waveGold・
 * wavesCleared の更新経路は従来と同じで、報酬を二重に付与する別経路を作らない。
 */
const STAGE_WAVE_AUTO_ADVANCE_MS = 550;
const STAGE_WAVE_FINISH_SELECTOR = ".battle-controls__finish:not(.battle-controls__finish--hidden)";

export function isIntermediateStageWaveResultLabel(label: string): boolean {
  return label.includes("次のウェーブへ");
}

function installStageWaveAutoAdvance(): void {
  if (typeof document === "undefined" || typeof MutationObserver === "undefined") return;

  const scan = () => {
    const buttons = document.querySelectorAll<HTMLButtonElement>(STAGE_WAVE_FINISH_SELECTOR);
    for (const button of buttons) {
      if (!isIntermediateStageWaveResultLabel(button.textContent ?? "")) continue;
      if (button.dataset.stageWaveAutoAdvance === "scheduled") continue;

      button.dataset.stageWaveAutoAdvance = "scheduled";
      // 「次のウェーブへ」は操作として不要。勝利表示だけ残し、ボタン自体は見せない。
      button.classList.add("battle-controls__finish--hidden");
      window.setTimeout(() => {
        // 画面を離れた/別ウェーブへ進んだ後の古いボタンは絶対に押さない。
        if (!button.isConnected) return;
        button.click();
      }, STAGE_WAVE_AUTO_ADVANCE_MS);
    }
  };

  const observer = new MutationObserver(scan);
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["class"],
  });
  scan();
}

installStageWaveAutoAdvance();
