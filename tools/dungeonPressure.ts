/**
 * 装備ダンジョン終盤(7〜10階)の難易度を、**飽和しない連続値**で測る。
 *
 * 勝率だけで難易度を見ると、上げすぎた時に全編成が0%へ張り付いて
 * 「9階と10階のどちらが難しいか」すら分からなくなる。
 * 決着時点で敵をどこまで削れたか(残HP割合)は常に0〜1の間に分布するので、
 * 勝率が0でも1でも階層どうしの差が読める。
 *
 * 攻略の型ごとに測るのは、特定の型(毒重ね・耐久)だけが抜け道になっていないかを
 * 見るため。巨人ダンジョン式の仕掛け(反撃・継続ダメージ耐性・バフ剥がし・回復阻害)は
 * まさにこの2つを潰すために入れてある。
 *
 *   npx tsx tools/dungeonPressure.ts
 */
import { BattleEngine } from "../src/battle/engine.js";
import { EQUIP_SLOTS, Equipment, generateEquipment } from "../src/core/equipment.js";
import { createMonsterInstance } from "../src/core/monsterInstance.js";
import { EQUIPMENT_DUNGEON_FLOORS } from "../src/data/equipmentDungeon.js";
import { setupDungeonBattle } from "../src/game/dungeonRunner.js";
import { addEquipment, createInitialState, equipToMonster } from "../src/game/playerState.js";

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 速度に寄せた副効果の装備を選び直す(実際のプレイヤーがやる装備の詰め方の再現)。
 * ランダムに生成した装備をそのまま着けるだけだと、速度を詰めた編成の強さを過小評価する。
 */
function speedGear(rng: () => number): Equipment[] {
  const best: Record<number, { eq: Equipment; spd: number }> = {};
  for (let r = 0; r < 40; r++) {
    for (const slot of EQUIP_SLOTS) {
      const eq = generateEquipment({ slot, star: 6, subStatCount: 4, rng });
      const spd = [eq.mainStat, ...eq.subStats].reduce((s, x) => s + (x.type === "SPD" ? x.value : 0), 0);
      if (!best[slot] || spd > best[slot].spd) best[slot] = { eq, spd };
    }
  }
  return Object.values(best).map((b) => b.eq);
}

const TEAMS: Record<string, { ids: string[]; tuned: boolean }> = {
  "高レア(速度詰め)": { ids: ["griffon_GRASS", "dragon_FIRE", "seraph_WATER", "nemesis_ELECTRIC", "griffon_WATER"], tuned: true },
  "高レア(素装備)": { ids: ["griffon_GRASS", "dragon_FIRE", "seraph_WATER", "nemesis_ELECTRIC", "griffon_WATER"], tuned: false },
  // 通常モンスターだけで役割を分けて組み、速度も詰めた「本気の通常編成」。
  // docs/design-concept.md の「ふつうのモンスターでも努力で強くなれる」を守れているかは、
  // 極端な毒重ね・耐久ではなくこの編成で見る
  "通常バランス(速度詰め)": { ids: ["knight_WATER", "wolf_GRASS", "imp_ELECTRIC", "fairy_WATER", "wisp_GRASS"], tuned: true },
  // **毒を持っているのは属性違いのごく一部だけ。** ここを適当に選ぶと、
  // 毒を一度も撒けない編成で「毒は通用しない」という嘘の結論が出る(実際に出した)
  "毒重ね": { ids: ["slime_GRASS", "slime_DARK", "wolf_DARK", "wolf_ELECTRIC", "imp_DARK"], tuned: true },
  "耐久": { ids: ["golem_LIGHT", "treant_LIGHT", "fairy_DARK", "wisp_DARK", "knight_LIGHT"], tuned: false },
};

export interface PressureResult {
  /** 勝率。上げすぎると0へ張り付くので、単体では難易度の指標にしない */
  rate: number;
  /** 決着時点で敵に残っているHPの割合(0=完全に削り切った、1=まったく削れていない) */
  enemyHpLeft: number;
  /** 決着までの行動数の中央値 */
  actions: number;
  /** 戦闘中に敵へ乗った毒スタックの最大値。毒編成でこれが0なら測定が成立していない */
  maxPoisonOnEnemy: number;
}

export function measurePressure(ids: string[], floorNum: number, tuned: boolean, trials = 50): PressureResult {
  const floor = EQUIPMENT_DUNGEON_FLOORS[floorNum - 1];
  let wins = 0;
  let hpLeftSum = 0;
  let maxPoisonOnEnemy = 0;
  const actions: number[] = [];
  for (let i = 0; i < trials; i++) {
    const rng = mulberry32(900 + i);
    const state = createInitialState();
    const party = ids.map((id) => createMonsterInstance(id, 6, 60));
    state.monsters = party;
    for (const m of party) {
      const gear = tuned ? speedGear(rng) : EQUIP_SLOTS.map((slot) => generateEquipment({ slot, star: 6, subStatCount: 4, rng }));
      for (const eq of gear) {
        addEquipment(state, eq);
        equipToMonster(state, m.id, eq.id);
      }
    }
    const setup = setupDungeonBattle(party, floor, state.equipment);
    const result = new BattleEngine(setup.playerDefs, setup.enemyDefs, { rng }).run();
    if (result.winner === "PLAYER") wins += 1;
    actions.push(result.turnsTaken);
    for (const turn of result.turns) {
      for (const u of turn.snapshot) {
        if (u.team === "ENEMY") maxPoisonOnEnemy = Math.max(maxPoisonOnEnemy, u.poisonStacks);
      }
    }
    const last = result.turns[result.turns.length - 1];
    const enemies = last ? last.snapshot.filter((u) => u.team === "ENEMY") : [];
    const maxHp = enemies.reduce((s, u) => s + u.maxHp, 0);
    hpLeftSum += maxHp > 0 ? enemies.reduce((s, u) => s + Math.max(0, u.currentHp), 0) / maxHp : 0;
  }
  actions.sort((a, b) => a - b);
  return { rate: wins / trials, enemyHpLeft: hpLeftSum / trials, actions: actions[Math.floor(trials / 2)], maxPoisonOnEnemy };
}

if (process.argv[1]?.endsWith("dungeonPressure.ts")) {
  const floors = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n));
  for (const f of floors.length > 0 ? floors : [7, 8, 9, 10]) {
    console.log(`\n=== ${f}階 (powerScale ${EQUIPMENT_DUNGEON_FLOORS[f - 1].powerScale.toFixed(3)}) ===`);
    console.log("編成".padEnd(18) + "勝率".padStart(8) + "敵残HP".padStart(10) + "行動".padStart(7) + "最大毒".padStart(8));
    for (const [name, team] of Object.entries(TEAMS)) {
      const r = measurePressure(team.ids, f, team.tuned);
      console.log(
        name.padEnd(18) +
          `${(r.rate * 100).toFixed(0)}%`.padStart(8) +
          `${(r.enemyHpLeft * 100).toFixed(1)}%`.padStart(10) +
          String(r.actions).padStart(7) +
          String(r.maxPoisonOnEnemy).padStart(8),
      );
      // 毒編成が一度も毒を撒けていなければ、その行の勝率は難易度ではなく編成ミスを測っている。
      // 毒を持つのは属性違いのごく一部だけなので、黙って0%が並ぶと本当に見落とす
      if (name.includes("毒") && r.maxPoisonOnEnemy === 0) {
        console.log("  ⚠ 毒編成が一度も毒を入れていない。この行の数字は難易度ではなく編成ミスを測っている");
      }
    }
  }
}
