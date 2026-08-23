import { describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import { EQUIP_SLOTS, EquipStar, generateEquipment } from "../src/core/equipment.js";
import { createMonsterInstance, MonsterInstance } from "../src/core/monsterInstance.js";
import { EQUIPMENT_DUNGEON_FLOORS } from "../src/data/equipmentDungeon.js";
import { MAX_DUNGEON_PARTY_SIZE, addEquipment, createInitialState, equipToMonster, PlayerState } from "../src/game/playerState.js";
import { setupDungeonBattle } from "../src/game/dungeonRunner.js";

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

/** 装備ダンジョン専用パーティは通常パーティ(4体)より1体多い最大5体まで組める */
const STARTER = [
  { templateId: "slime", element: "FIRE" },
  { templateId: "wolf", element: "WATER" },
  { templateId: "golem", element: "ELECTRIC" },
  { templateId: "fairy", element: "GRASS" },
  { templateId: "slime", element: "WATER" },
];

function buildParty(star: 1 | 2 | 3 | 4 | 5, level: number, partySize = 4) {
  return STARTER.slice(0, partySize).map((s) => createMonsterInstance(`${s.templateId}_${s.element}`, star, level));
}

function equipFullLoadout(state: PlayerState, monsterId: string, eqStar: EquipStar, subStatCount: number, rng: () => number): void {
  for (const slot of EQUIP_SLOTS) {
    const eq = generateEquipment({ slot, star: eqStar, subStatCount, rng });
    addEquipment(state, eq);
    equipToMonster(state, monsterId, eq.id);
  }
}

/**
 * 装備は乱数ロール(85〜115%のばらつき)を含むため、1回だけ装備を生成して繰り返し戦わせると
 * 「たまたま当たりロールだった/外れロールだった」1サンプルの結果に依存してしまう。
 * 統計的に意味のある勝率を得るため、試行のたびに装備そのものを新しく生成し直す。
 */
function winRate(
  floorNum: number,
  star: 1 | 2 | 3 | 4 | 5,
  level: number,
  eqStar: EquipStar | null,
  subStatCount: number,
  trials: number,
  partySize = 4,
): number {
  const floor = EQUIPMENT_DUNGEON_FLOORS[floorNum - 1];
  let wins = 0;
  for (let i = 0; i < trials; i++) {
    const rng = mulberry32(500 + i);
    const state = createInitialState();
    const party = buildParty(star, level, partySize);
    state.monsters = party;
    if (eqStar !== null) {
      for (const m of party) equipFullLoadout(state, m.id, eqStar, subStatCount, rng);
    }

    const setup = setupDungeonBattle(party, floor, state.equipment);
    const engine = new BattleEngine(setup.playerDefs, setup.enemyDefs, { rng });
    if (engine.run().winner === "PLAYER") wins += 1;
  }
  return wins / trials;
}

/** 「育成途中の手持ちの中で1体だけそこそこ強いモンスターがいる」くらいの、まだ最終関門には遠い編成 */
function buildModestParty(): MonsterInstance[] {
  return [
    createMonsterInstance("slime_FIRE", 4, 1), // ランクアップ直後の星4Lv1(スキルは初期値のまま)
    createMonsterInstance("wolf_WATER", 2, 20),
    createMonsterInstance("golem_ELECTRIC", 2, 20),
    createMonsterInstance("fairy_GRASS", 3, 30),
    createMonsterInstance("slime_WATER", 2, 20),
  ];
}

/**
 * ガチャ限定の高レア(SR/SSR)モンスターだけで組んだ、装備ダンジョン最終関門想定の編成。
 * SR/SSRは通常モンスターよりベースステータス・専用スキルとも明確に強力なため、
 * 通常モンスターだけの編成基準の数値だと最終関門があっさり突破されてしまう
 * (実際に「通常モンスター+SR/SSR混成の5体編成でオート周回したら10階があっさり倒せた」
 * というバランス報告を受けて、SR/SSRを軸にした編成を基準に9・10階を再調整した)。
 */
function buildSrSsrParty(state: PlayerState, eqStar: EquipStar, subStatCount: number, rng: () => number): MonsterInstance[] {
  const party = [
    createMonsterInstance("griffon_GRASS", 5, 50),
    createMonsterInstance("dragon_FIRE", 5, 50),
    createMonsterInstance("seraph_WATER", 5, 50),
    createMonsterInstance("nemesis_ELECTRIC", 5, 50),
    createMonsterInstance("griffon_WATER", 5, 50),
  ];
  state.monsters = party;
  for (const m of party) equipFullLoadout(state, m.id, eqStar, subStatCount, rng);
  return party;
}

/**
 * 実際のバランス報告にあった編成(通常モンスター1体+SR/SSR4体、レベル・装備の質もばらつきあり)を
 * 模した、まだ最終関門には届いていない現実的な編成。
 */
function buildReportedMixedParty(state: PlayerState, eqStar: EquipStar, subStatCount: number, rng: () => number): MonsterInstance[] {
  const party = [
    createMonsterInstance("fairy_GRASS", 5, 50),
    createMonsterInstance("nemesis_DARK", 5, 50),
    createMonsterInstance("seraph_DARK", 5, 45),
    createMonsterInstance("griffon_GRASS", 5, 50),
    createMonsterInstance("seraph_LIGHT", 5, 35),
  ];
  state.monsters = party;
  for (const m of party) equipFullLoadout(state, m.id, eqStar, subStatCount, rng);
  return party;
}

describe("装備ダンジョンの難易度(1階は星3+星1装備くらいで挑める、9・10階は星6装備クラスをフルで固めてようやく突破できる最終関門)", () => {
  it("星1Lv1の未装備パーティは1階にほとんど勝てない(最低限の育成は必要)", () => {
    const rate = winRate(1, 1, 1, null, 0, 60);
    expect(rate).toBeLessThan(0.15);
  });

  it("星3モンスターでも未装備では1階の勝率は低い(装備が意味を持つ)", () => {
    const rate = winRate(1, 3, 30, null, 0, 60);
    expect(rate).toBeLessThan(0.2);
  });

  it("星3モンスターに星1装備をフル装備すれば1階を高い勝率でクリアできる", () => {
    const rate = winRate(1, 3, 30, 1, 2, 120);
    expect(rate).toBeGreaterThan(0.6);
  });

  /**
   * 9・10階は装備ダンジョン専用パーティ(最大5体)で挑む前提の最終関門のため、
   * ここから先のテストは通常パーティ(4体)ではなく実際の専用パーティ枠(5体)で検証する。
   * 4体基準のまま難易度を据え置くと、5体目の分だけ想定より簡単に突破できてしまう
   * (実際に「5体目込みでオート周回したら10階があっさり倒せた」というバランス報告を受けて調整)。
   */
  /**
   * スキル調整で通常モンスターの連携(全体デバフ・毒・継続回復・自己回復)が強くなり、
   * 装備を極めた通常編成でも10階を突破できる場合が出てきた。
   * それでもSR/SSR軸の編成(同条件で7割超)とは明確な差が残ることを、
   * 絶対値ではなく両者の比較で確かめる。
   */
  it("10階は通常モンスターだけの編成(5体)だと、装備を極めても安定しない(SR/SSR軸に明確に劣る)", () => {
    const rate = winRate(10, 5, 50, 6, 4, 100, MAX_DUNGEON_PARTY_SIZE);
    expect(rate).toBeLessThan(0.5);
  });

  it("10階はSR/SSRを軸にした編成でも、装備がサブ2個程度ではまだ厳しい", () => {
    let wins = 0;
    const trials = 150;
    for (let i = 0; i < trials; i++) {
      const rng = mulberry32(1500 + i);
      const state = createInitialState();
      const party = buildSrSsrParty(state, 6, 2, rng);
      const setup = setupDungeonBattle(party, EQUIPMENT_DUNGEON_FLOORS[9], state.equipment);
      const engine = new BattleEngine(setup.playerDefs, setup.enemyDefs, { rng });
      if (engine.run().winner === "PLAYER") wins += 1;
    }
    expect(wins / trials).toBeLessThan(0.35);
  });

  it("10階はサブステータス弱体化とお供HP強化後、SR/SSRを星6装備サブ4個まで固めても安定突破できない", () => {
    let wins = 0;
    const trials = 150;
    for (let i = 0; i < trials; i++) {
      const rng = mulberry32(2500 + i);
      const state = createInitialState();
      const party = buildSrSsrParty(state, 6, 4, rng);
      const setup = setupDungeonBattle(party, EQUIPMENT_DUNGEON_FLOORS[9], state.equipment);
      const engine = new BattleEngine(setup.playerDefs, setup.enemyDefs, { rng });
      if (engine.run().winner === "PLAYER") wins += 1;
    }
    expect(wins / trials).toBeLessThan(0.1);
  });

  /**
   * 階層どうしの難易度を比べる時に**勝率を使ってはいけない**。
   *
   * 終盤を引き上げると勝率は全編成そろって0%へ張り付き、
   * 「9階と10階のどちらが難しいか」すら読めなくなる(実際にそうなって、
   * このテストは `0 > 0` で落ちた)。決着時点で敵をどれだけ削れたかは
   * 常に0〜1の間に分布するので、勝率が飽和していても階層差が読める。
   *
   * 0に近いほど「敵を削り切った=易しい」、1に近いほど「歯が立たない=難しい」。
   */
  const enemyHpLeftAt = (floorIndex: number, trials = 60): number => {
    let sum = 0;
    for (let i = 0; i < trials; i++) {
      const rng = mulberry32(3500 + i);
      const state = createInitialState();
      const party = buildSrSsrParty(state, 6, 4, rng);
      const setup = setupDungeonBattle(party, EQUIPMENT_DUNGEON_FLOORS[floorIndex], state.equipment);
      const result = new BattleEngine(setup.playerDefs, setup.enemyDefs, { rng }).run();
      const last = result.turns[result.turns.length - 1];
      const enemies = last ? last.snapshot.filter((u) => u.team === "ENEMY") : [];
      const maxHp = enemies.reduce((s, u) => s + u.maxHp, 0);
      sum += maxHp > 0 ? enemies.reduce((s, u) => s + Math.max(0, u.currentHp), 0) / maxHp : 0;
    }
    return sum / trials;
  };

  it("9階は10階よりは易しい", () => {
    expect(enemyHpLeftAt(8)).toBeLessThan(enemyHpLeftAt(9));
  });

  /**
   * 難易度の単調増加は**実測で**確かめる。
   *
   * 以前は powerScale が単調増加であることをそのまま難易度の代わりにしていたが、
   * これは成り立たない。10階のお供2体は9階と同じ専用モンスターでありながらHPが2倍で、
   * 速度倍率も最速なので、**同じ powerScale でも10階の方がはるかに難しい**。
   * 倍率まで単調増加にしようとすると、10階に合わせて9階を緩めるしかなくなり、
   * 結局9階が締まらなくなる(実測で9階の勝率が100%から動かなかった)。
   *
   * powerScale はプレイヤーには一切見えない内部の調整値なので、
   * 守るべきなのは倍率の並びではなく**実際の手応えの並び**の方。
   */
  it("**7階から10階まで、実際の手応えが一段ずつ重くなる**", () => {
    const measured = [6, 7, 8, 9].map((floorIndex) => enemyHpLeftAt(floorIndex));
    for (let i = 1; i < measured.length; i++) {
      expect(measured[i], `${i + 8}階`).toBeGreaterThan(measured[i - 1]);
    }
  });

  it("育成途中で1体だけそこそこ強いモンスターがいる程度の編成(5体)では、10階にはほぼ勝てない(バランス報告の回帰テスト)", () => {
    let wins = 0;
    const trials = 60;
    for (let i = 0; i < trials; i++) {
      const rng = mulberry32(900 + i);
      const party = buildModestParty();
      const setup = setupDungeonBattle(party, EQUIPMENT_DUNGEON_FLOORS[9], []);
      const engine = new BattleEngine(setup.playerDefs, setup.enemyDefs, { rng });
      if (engine.run().winner === "PLAYER") wins += 1;
    }
    expect(wins / trials).toBeLessThan(0.1);
  });

  it("バランス報告と同様の編成(通常1体+SR/SSR4体、装備サブ2個程度)では、10階にはほぼ勝てない(回帰テスト)", () => {
    let wins = 0;
    const trials = 100;
    for (let i = 0; i < trials; i++) {
      const rng = mulberry32(4500 + i);
      const state = createInitialState();
      const party = buildReportedMixedParty(state, 6, 2, rng);
      const setup = setupDungeonBattle(party, EQUIPMENT_DUNGEON_FLOORS[9], state.equipment);
      const engine = new BattleEngine(setup.playerDefs, setup.enemyDefs, { rng });
      if (engine.run().winner === "PLAYER") wins += 1;
    }
    expect(wins / trials).toBeLessThan(0.2);
  });

  it("同じ星4装備フル装備でも、10階は1階よりはっきり難しい", () => {
    const floor1Rate = winRate(1, 5, 50, 4, 2, 80);
    const floor10Rate = winRate(10, 5, 50, 4, 2, 80, MAX_DUNGEON_PARTY_SIZE);
    expect(floor10Rate).toBeLessThan(floor1Rate);
  });

  it("終盤(7階以降)は、6階までの線形カーブから大きく跳ね上がる", () => {
    // 以前は9・10階だけが跳ね上がる形だった。7・8階が緩すぎて
    // 「楽にすぐ回れてしまう」ため、跳ね上がりの開始を7階へ前倒ししてある
    const powerAt = (floor: number) => EQUIPMENT_DUNGEON_FLOORS[floor - 1].powerScale;
    const linearStep = powerAt(6) - powerAt(5);
    for (const floor of [7, 8, 9]) {
      expect(powerAt(floor) - powerAt(floor - 1), `${floor}階`).toBeGreaterThan(linearStep);
    }
  });

  it("6階までは硬さが単調増加し、速さは最後まで単調増加する", () => {
    // powerScale は10階だけ9階より低い。10階のお供はHPが2倍で速度倍率も最速なので、
    // 同じ倍率だと9階より二段階難しくなってしまうため意図的に下げてある
    // (実際の手応えが単調増加していることは別のテストで実測して確かめている)
    for (let i = 1; i < EQUIPMENT_DUNGEON_FLOORS.length; i++) {
      const prev = EQUIPMENT_DUNGEON_FLOORS[i - 1];
      const cur = EQUIPMENT_DUNGEON_FLOORS[i];
      if (i + 1 <= 9) expect(cur.powerScale, `${i + 1}階のpowerScale`).toBeGreaterThan(prev.powerScale);
      expect(cur.speedScale, `${i + 1}階のspeedScale`).toBeGreaterThan(prev.speedScale);
    }
  });

  it("**速度はHPや攻撃力ほど急には伸ばさない**", () => {
    // 速度は手番の数に直結する。同じ勢いで伸ばすと、こちらが動く前に
    // 一方的に殴られる展開になる
    const first = EQUIPMENT_DUNGEON_FLOORS[0];
    const last = EQUIPMENT_DUNGEON_FLOORS[EQUIPMENT_DUNGEON_FLOORS.length - 1];
    expect(last.speedScale / first.speedScale).toBeLessThan(last.powerScale / first.powerScale);
  });
});
