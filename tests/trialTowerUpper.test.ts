import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import type { SkillEffect } from "../src/core/skill.js";
import { findMonster, findMonsterById } from "../src/data/monsters.js";
import {
  TOWER_TRAIT_LABEL,
  TOWER_TRAIT_NOTE,
  TRIAL_TOWER_FLOORS,
  findTowerFloor,
  isTowerBossFloor,
  towerTraitProblem,
} from "../src/data/trialTower.js";
import {
  TOWER60_BOSS_ATK,
  TOWER60_BOSS_HP,
  TOWER60_BOSS_SPD,
  TOWER60_JUSHOU_DEATH_SPD,
  TOWER60_MASHOU_DEATH_ATK,
} from "../src/data/trialTowerFloor60.js";
import {
  TOWER_UPPER_BANDS,
  TOWER_UPPER_CONCEPT_NOTES,
  TOWER_UPPER_FLOOR_DEFS,
  towerUpperBandOf,
  towerUpperStrongCount,
} from "../src/data/trialTowerUpper.js";
import { buildDungeonEnemyTeam } from "../src/game/dungeonRunner.js";
import { buildAlly } from "../tools/battleLab/build.js";
import { mulberry32 } from "../tools/battleLab/rng.js";
import { TOWER60 } from "../tools/battleLab/scenarios/tower60.js";

/**
 * 試練の塔 51〜99階。
 *
 * ## ここで見張ること
 *
 * 50階までは「曲線の定数」が難易度そのものだったので、テストは
 * 実際に登らせて到達階を測る形になっている。51階以降は作りが違って、
 * **顔ぶれと属性を1階ずつ手で書いた固定データ**が難易度の本体。
 * だから見張る対象も変わる:
 *
 *   1. 書いたものがそのまま出ているか(固定編成の回帰)
 *   2. 階が名乗った狙いを、その顔ぶれが**実際のスキルで**実行できるか
 *   3. 実効ステータスが帯からはみ出していないか
 *   4. 上の階ほど、強いスキルを持つ顔ぶれが増えているか
 *   5. **50階までと70/80/90/100階に、指1本触れていないか**
 *
 * 2 が一番効く。属性ごとにスキル2・3の組み合わせが違うので、
 * 「ゴーレムを置いたから守りの階」と書いたつもりで
 * 盾を1枚も張らないゴーレムが立っている、が黙って起きる。
 */

const UPPER_FLOORS = Object.keys(TOWER_UPPER_FLOOR_DEFS).map(Number).sort((a, b) => a - b);

function effectsOf(templateId: string, element: string): SkillEffect[] {
  const dex = findMonster(templateId, element);
  if (!dex) throw new Error(`図鑑にない: ${templateId}_${element}`);
  return dex.skills.flatMap((skill) => skill.effects);
}

/** その階の敵のうち、`match` を満たす効果を1つでも持っている体数 */
function unitsWith(floor: number, match: (effect: SkillEffect) => boolean): number {
  const def = TOWER_UPPER_FLOOR_DEFS[floor];
  return def.units.filter((unit) => effectsOf(unit.templateId, unit.element).some(match)).length;
}

const is = (...kinds: SkillEffect["kind"][]) => (effect: SkillEffect) => kinds.includes(effect.kind);

/** 上げ下げの向きまで見る。`BUFF spd` と `DEBUFF spd` は別の手 */
const buffs = (stat: string) => (effect: SkillEffect) => effect.kind === "BUFF" && effect.stat === stat;
const debuffs = (stat: string) => (effect: SkillEffect) => effect.kind === "DEBUFF" && effect.stat === stat;
const gaugeUp = (effect: SkillEffect) => effect.kind === "GAUGE" && effect.amount > 0;
const gaugeDown = (effect: SkillEffect) => effect.kind === "GAUGE" && effect.amount < 0;

const any = (...matchers: ((effect: SkillEffect) => boolean)[]) => (effect: SkillEffect) =>
  matchers.some((match) => match(effect));

describe("試練の塔 51〜99階: 骨格", () => {
  it("51〜59階の通常階は4体、61〜99階の通常階は5体", () => {
    for (const floor of UPPER_FLOORS) {
      expect(isTowerBossFloor(floor), `${floor}階がボス階になっている`).toBe(false);
      const expected = floor <= 59 ? 4 : 5;
      expect(findTowerFloor(floor)!.enemies, `${floor}階`).toHaveLength(expected);
    }
  });

  it("51〜99階の通常階すべてが表に載っている(60/70/80/90/100だけがボス階)", () => {
    const normal = [];
    for (let floor = 51; floor <= 99; floor += 1) if (!isTowerBossFloor(floor)) normal.push(floor);
    expect(UPPER_FLOORS).toEqual(normal);
  });

  it("51〜99階に「群れの階」は1つも無い", () => {
    // 数で押す階は、全体攻撃を持っているかどうかだけで決まってしまう。
    // 持っていない編成には手の打ちようが無いので、上層では配らない
    for (let floor = 51; floor <= 99; floor += 1) {
      expect(findTowerFloor(floor)!.trait, `${floor}階`).not.toBe("SWARM");
    }
  });

  it("階が名乗った傾向を、その顔ぶれが実際に実行できる", () => {
    const problems = TRIAL_TOWER_FLOORS.filter((f) => f.floor >= 51)
      .map((f) => (towerTraitProblem(f) ? `${f.floor}階: ${towerTraitProblem(f)}` : null))
      .filter((p): p is string => p !== null);
    expect(problems).toEqual([]);
  });

  it("全部の階に呼び名と説明が付いている", () => {
    /*
     * **画面が傾向から名札を引いていて、ここが空になっていた。**
     * 傾向は5種類しかないので、51階以降の「妨害」「鉄壁」「攻防一体」は
     * どれもNONE扱いで名札が消え、「加速の階」は「疾風の階」と出ていた。
     * 名札と説明は階そのものが持つ
     */
    for (const floor of UPPER_FLOORS) {
      const def = findTowerFloor(floor)!;
      expect(def.name, `${floor}階の名前`).toBe(`${floor}階 ${TOWER_UPPER_FLOOR_DEFS[floor].concept}`);
      expect(def.label, `${floor}階の名札`).toBe(TOWER_UPPER_FLOOR_DEFS[floor].concept);
      expect(def.note, `${floor}階の説明`).not.toBe("");
      // 「◯◯を持って行け」とは書かない。何を連れて行くかは考える所
      expect(def.note, `${floor}階の説明`).not.toMatch(/持って行|連れて行/);
    }
  });

  it("呼び名すべてに説明が用意されている", () => {
    const concepts = new Set(UPPER_FLOORS.map((f) => TOWER_UPPER_FLOOR_DEFS[f].concept));
    for (const concept of concepts) {
      expect(Object.keys(TOWER_UPPER_CONCEPT_NOTES), `${concept} の説明が無い`).toContain(concept);
    }
  });

  it("50階までの名札と説明は、傾向から引いていた頃と同じ", () => {
    // 名札を階へ移した時に、既存の階の文言が変わっていないこと
    for (const def of TRIAL_TOWER_FLOORS.filter((f) => f.floor <= 50 && !isTowerBossFloor(f.floor))) {
      expect(def.label, `${def.floor}階`).toBe(TOWER_TRAIT_LABEL[def.trait]);
      expect(def.note, `${def.floor}階`).toBe(TOWER_TRAIT_NOTE[def.trait]);
    }
  });
});

describe("試練の塔 51〜99階: 属性は実際のスキルを見て選んである", () => {
  it("癒やし・回復耐久の階には、本当に回復できる敵が2体以上いる", () => {
    for (const floor of UPPER_FLOORS.filter((f) => TOWER_UPPER_FLOOR_DEFS[f].trait === "HEALER")) {
      expect(unitsWith(floor, is("HEAL", "REGEN", "CLEANSE")), `${floor}階`).toBeGreaterThanOrEqual(2);
    }
  });

  it("守り・耐久・鉄壁の階には、本当に受けを固められる敵が2体以上いる", () => {
    for (const floor of UPPER_FLOORS.filter((f) => TOWER_UPPER_FLOOR_DEFS[f].trait === "WARD")) {
      const guards = unitsWith(floor, any(is("SHIELD", "MITIGATE", "PROTECT", "COUNTER_STANCE"), buffs("def")));
      expect(guards, `${floor}階`).toBeGreaterThanOrEqual(2);
    }
    // 「守り」を名乗る階には、盾を張れる敵が必ず1体はいること
    for (const floor of UPPER_FLOORS.filter((f) => TOWER_UPPER_FLOOR_DEFS[f].concept.startsWith("守り"))) {
      expect(unitsWith(floor, is("SHIELD")), `${floor}階`).toBeGreaterThanOrEqual(1);
    }
  });

  it("疾風・加速・速攻の階には、手番そのものを動かせる敵が3体以上いる", () => {
    for (const floor of UPPER_FLOORS.filter((f) => TOWER_UPPER_FLOOR_DEFS[f].trait === "SWIFT")) {
      const movers = unitsWith(floor, any(gaugeUp, gaugeDown, buffs("spd"), debuffs("spd"), is("STUN")));
      expect(movers, `${floor}階`).toBeGreaterThanOrEqual(3);
    }
  });

  it("妨害・弱体・阻害・制圧の階には、実際に妨害できる敵が3体以上いる", () => {
    const concepts = ["妨害", "弱体", "行動阻害", "制圧", "弱体攻撃", "弱体集中"];
    const floors = UPPER_FLOORS.filter((f) => concepts.some((c) => TOWER_UPPER_FLOOR_DEFS[f].concept.startsWith(c)));
    expect(floors.length).toBeGreaterThan(0);
    for (const floor of floors) {
      const jammers = unitsWith(floor, any(is("STRIP", "STEAL_BUFF", "COOLDOWN_EXTEND", "HEAL_BLOCK"), gaugeDown, debuffs("def"), debuffs("atk"), debuffs("spd")));
      expect(jammers, `${floor}階`).toBeGreaterThanOrEqual(3);
    }
  });

  it("火力を名乗る階は、4体以上がダメージを出せる", () => {
    const concepts = ["攻撃", "純火力", "火力支援", "強化火力", "高速攻撃", "加速攻撃"];
    const floors = UPPER_FLOORS.filter((f) => concepts.some((c) => TOWER_UPPER_FLOOR_DEFS[f].concept.startsWith(c)));
    expect(floors.length).toBeGreaterThan(0);
    for (const floor of floors) {
      expect(unitsWith(floor, is("DAMAGE")), `${floor}階`).toBeGreaterThanOrEqual(4);
    }
  });

  it("指定した属性の個体が図鑑に実在する(光/闇を通常階へ持ち込んでいない)", () => {
    for (const floor of UPPER_FLOORS) {
      for (const unit of TOWER_UPPER_FLOOR_DEFS[floor].units) {
        expect(findMonster(unit.templateId, unit.element), `${floor}階 ${unit.templateId}_${unit.element}`).toBeDefined();
        expect(["LIGHT", "DARK"]).not.toContain(unit.element);
      }
    }
  });

  it("99階は5つの役割が全部埋まっている", () => {
    // ゲージ・剥がし・火力・受け・回復。上層の狙いを1階に集めた形
    expect(unitsWith(99, any(gaugeUp, gaugeDown, is("COOLDOWN_EXTEND", "COOLDOWN_REDUCE")))).toBeGreaterThanOrEqual(1);
    expect(unitsWith(99, is("STRIP", "STEAL_BUFF"))).toBeGreaterThanOrEqual(1);
    expect(unitsWith(99, is("DAMAGE"))).toBeGreaterThanOrEqual(4);
    expect(unitsWith(99, any(is("MITIGATE", "SHIELD"), debuffs("atk")))).toBeGreaterThanOrEqual(1);
    expect(unitsWith(99, is("HEAL", "CLEANSE"))).toBeGreaterThanOrEqual(1);
  });
});

describe("試練の塔 51〜99階: 実効ステータスは帯の中", () => {
  it("HP・攻撃・防御・速度が、どの階も帯からはみ出していない", () => {
    for (const floor of UPPER_FLOORS) {
      const band = towerUpperBandOf(floor)!;
      const swift = TRIAL_TOWER_FLOORS[floor - 1].trait === "SWIFT" ? band.swiftSpdBonus : 0;
      for (const def of buildDungeonEnemyTeam(findTowerFloor(floor)!)) {
        const where = `${floor}階 ${def.name}`;
        expect(def.stats.hp, `${where} HP`).toBeGreaterThanOrEqual(band.hp[0]);
        expect(def.stats.hp, `${where} HP`).toBeLessThanOrEqual(band.hp[1]);
        expect(def.stats.atk, `${where} ATK`).toBeGreaterThanOrEqual(band.atk[0]);
        expect(def.stats.atk, `${where} ATK`).toBeLessThanOrEqual(band.atk[1]);
        expect(def.stats.def, `${where} DEF`).toBeGreaterThanOrEqual(band.def[0]);
        expect(def.stats.def, `${where} DEF`).toBeLessThanOrEqual(band.def[1]);
        // 疾風の階だけ、帯の上に加算ぶんだけ乗る
        expect(def.stats.spd, `${where} SPD`).toBeGreaterThanOrEqual(band.spd[0]);
        expect(def.stats.spd, `${where} SPD`).toBeLessThanOrEqual(band.spd[1] + swift);
      }
    }
  });

  it("疾風の階の敵は全員、その帯の下限+加算より速い", () => {
    for (const floor of UPPER_FLOORS.filter((f) => TRIAL_TOWER_FLOORS[f - 1].trait === "SWIFT")) {
      const band = towerUpperBandOf(floor)!;
      for (const def of buildDungeonEnemyTeam(findTowerFloor(floor)!)) {
        expect(def.stats.spd, `${floor}階 ${def.name}`).toBeGreaterThanOrEqual(band.spd[0] + band.swiftSpdBonus);
      }
    }
  });

  it("最上層の疾風でも速度は200を超えない", () => {
    /*
     * **ここが跳ねると階が読めなくなる。**速度250〜300の敵は、こちらの初手が来る前に
     * 2周する。それは「速い階」ではなく「手番が回ってこない階」で、
     * ゲージ操作や気絶を持って行っても間に合わない。
     */
    const fastest = Math.max(
      ...UPPER_FLOORS.flatMap((floor) => buildDungeonEnemyTeam(findTowerFloor(floor)!).map((d) => d.stats.spd)),
    );
    expect(fastest).toBeGreaterThanOrEqual(190);
    expect(fastest).toBeLessThanOrEqual(200);
  });

  it("50階までの急峻な曲線を持ち込んでいない(帯は10階で1.35倍以内)", () => {
    /*
     * 50階までの曲線は10階で約1.65倍(50→55 が 60→92)で、
     * そのまま続けると100階で1100=50階の20倍になる。
     * それは「育てば届く」ではなく別の単位の敵で、
     * docs/design-concept.md の芯と正面から衝突する。
     */
    for (let i = 1; i < TOWER_UPPER_BANDS.length; i += 1) {
      for (const stat of ["hp", "atk", "def", "spd"] as const) {
        for (const edge of [0, 1] as const) {
          const ratio = TOWER_UPPER_BANDS[i][stat][edge] / TOWER_UPPER_BANDS[i - 1][stat][edge];
          expect(ratio, `${stat}[${edge}] の伸び`).toBeGreaterThan(1);
          expect(ratio, `${stat}[${edge}] の伸び`).toBeLessThanOrEqual(1.35);
        }
      }
    }
  });

  it("同じ階の敵が全員同じ数値にならない", () => {
    // 全員を同じ数値にすると「誰から倒すか」を考える必要が無くなる
    for (const floor of UPPER_FLOORS) {
      const defs = buildDungeonEnemyTeam(findTowerFloor(floor)!);
      expect(new Set(defs.map((d) => d.stats.hp)).size, `${floor}階のHPの種類`).toBeGreaterThan(1);
      expect(new Set(defs.map((d) => d.stats.atk)).size, `${floor}階のATKの種類`).toBeGreaterThan(1);
    }
  });

  it("同じ階では、素のステータスの上下がそのまま実効値の上下になる", () => {
    /*
     * **ここが崩れると帯の意味が消える。**実効値を帯の中で配っているので、
     * 階の位置だけで決めると受け役と殴り役が同じ数字になり、
     * ベヒモスとコボルトが同じHPで同じ攻撃力の階が生まれる
     * (そうなると「誰から倒すか」を考える必要が無くなる)。
     * 素の値を混ぜてあるのはこれを起こさないためで、
     * 混ぜ方が壊れると**順番が入れ替わる**形で出る。
     */
    let compared = 0;
    for (const floor of UPPER_FLOORS) {
      const units = TOWER_UPPER_FLOOR_DEFS[floor].units;
      const defs = buildDungeonEnemyTeam(findTowerFloor(floor)!);
      for (const stat of ["hp", "atk", "def", "spd"] as const) {
        for (let a = 0; a < units.length; a += 1) {
          for (let b = a + 1; b < units.length; b += 1) {
            const baseA = findMonster(units[a].templateId, units[a].element)!.stats[stat];
            const baseB = findMonster(units[b].templateId, units[b].element)!.stats[stat];
            if (baseA === baseB) continue;
            compared += 1;
            const where = `${floor}階 ${defs[a].name} と ${defs[b].name} の ${stat}`;
            // **上下が入れ替わらないこと**を見る。素の差が1しかない組は
            // 丸めで同値になり得るので、そこは通す(逆転だけを落とす)
            const [high, low] = baseA > baseB ? [defs[a], defs[b]] : [defs[b], defs[a]];
            expect(high.stats[stat], where).toBeGreaterThanOrEqual(low.stats[stat]);
          }
        }
      }
    }
    expect(compared).toBeGreaterThan(200);
  });
});

describe("試練の塔 51〜99階: 新規11種が上層ほど増える", () => {
  it("61階以降のどの階にも新規11種が1体以上いる", () => {
    for (const floor of UPPER_FLOORS.filter((f) => f >= 61)) {
      expect(towerUpperStrongCount(floor), `${floor}階`).toBeGreaterThanOrEqual(1);
    }
  });

  it("11種すべてが51階以降のどこかに出てくる", () => {
    const used = new Set(UPPER_FLOORS.flatMap((f) => TOWER_UPPER_FLOOR_DEFS[f].units.map((u) => u.templateId)));
    for (const id of ["mushroon", "shellturtle", "kobold", "basilisk", "mimic", "valkyria", "thunderbeast", "abyssreaper", "fenrir", "chronos", "behemoth"]) {
      expect(used, `${id} が1階も出てこない`).toContain(id);
    }
  });

  it("帯ごとの平均が、上の帯へ行くほど増える", () => {
    // 1階ずつの上下は許す(階の狙いが先で、体数は結果)。帯の平均で見る
    const averages = TOWER_UPPER_BANDS.map((band) => {
      const floors = UPPER_FLOORS.filter((f) => f >= band.from && f <= band.to);
      return floors.reduce((sum, f) => sum + towerUpperStrongCount(f), 0) / floors.length;
    });
    for (let i = 1; i < averages.length; i += 1) {
      expect(averages[i], `${TOWER_UPPER_BANDS[i].from}階台の平均`).toBeGreaterThan(averages[i - 1]);
    }
    // 51階台は「たまに混ざる」、91階台は「ほとんど新規」
    expect(averages[0]).toBeLessThan(2);
    expect(averages[averages.length - 1]).toBeGreaterThanOrEqual(4);
  });

  it("★5の4種は上層に寄っている(51〜59階には出てこない)", () => {
    const fiveStars = ["abyssreaper", "fenrir", "chronos", "behemoth"];
    for (const floor of UPPER_FLOORS.filter((f) => f <= 59)) {
      for (const unit of TOWER_UPPER_FLOOR_DEFS[floor].units) {
        expect(fiveStars, `${floor}階に ${unit.templateId}`).not.toContain(unit.templateId);
      }
    }
  });
});

describe("試練の塔 51〜99階: 固定編成の回帰", () => {
  /*
   * **ここは丸写しで良い。**属性まで含めた顔ぶれが「意図したもの」であること自体が
   * 守りたい中身なので、実装から引いてきた値と比べては何も守らない。
   * 階を作り直す時は、この表も一緒に書き換える。
   */
  const EXPECTED: Readonly<Record<number, string>> = {
    51: "wolf_FIRE imp_FIRE knight_GRASS kobold_WATER",
    52: "fairy_WATER knight_GRASS wolf_FIRE mushroon_FIRE",
    53: "golem_FIRE griffon_GRASS imp_WATER kobold_FIRE",
    54: "golem_WATER treant_ELECTRIC wolf_FIRE shellturtle_GRASS",
    55: "wolf_ELECTRIC imp_ELECTRIC thunderbeast_ELECTRIC knight_ELECTRIC",
    56: "griffon_GRASS seraph_FIRE kobold_WATER mushroon_FIRE",
    57: "wisp_WATER treant_FIRE griffon_FIRE mimic_WATER",
    58: "wisp_WATER golem_GRASS shellturtle_ELECTRIC kobold_FIRE",
    59: "basilisk_ELECTRIC thunderbeast_WATER valkyria_ELECTRIC griffon_FIRE",
    61: "kobold_FIRE griffon_GRASS mimic_FIRE seraph_FIRE knight_WATER",
    62: "fairy_ELECTRIC valkyria_ELECTRIC thunderbeast_WATER treant_FIRE kobold_WATER",
    63: "basilisk_FIRE kobold_ELECTRIC nemesis_GRASS griffon_ELECTRIC mushroon_ELECTRIC",
    64: "shellturtle_ELECTRIC wisp_WATER mimic_ELECTRIC nemesis_FIRE golem_WATER",
    65: "thunderbeast_ELECTRIC basilisk_ELECTRIC wolf_ELECTRIC griffon_ELECTRIC imp_ELECTRIC",
    66: "dragon_FIRE mushroon_FIRE kobold_WATER mimic_FIRE griffon_GRASS",
    67: "valkyria_ELECTRIC treant_FIRE fenrir_FIRE seraph_WATER shellturtle_WATER",
    68: "behemoth_GRASS shellturtle_ELECTRIC nemesis_WATER wisp_WATER mimic_ELECTRIC",
    69: "fenrir_ELECTRIC valkyria_ELECTRIC basilisk_ELECTRIC dragon_FIRE thunderbeast_WATER",
    71: "dragon_GRASS fenrir_ELECTRIC kobold_FIRE valkyria_FIRE griffon_FIRE",
    72: "basilisk_FIRE mushroon_ELECTRIC nemesis_GRASS mimic_FIRE kobold_ELECTRIC",
    73: "behemoth_ELECTRIC shellturtle_GRASS valkyria_ELECTRIC seraph_WATER wisp_WATER",
    74: "thunderbeast_WATER valkyria_FIRE griffon_ELECTRIC fenrir_ELECTRIC kobold_ELECTRIC",
    75: "chronos_ELECTRIC thunderbeast_ELECTRIC basilisk_ELECTRIC fenrir_ELECTRIC wolf_ELECTRIC",
    76: "abyssreaper_ELECTRIC mushroon_ELECTRIC basilisk_FIRE dragon_FIRE kobold_FIRE",
    77: "behemoth_GRASS mimic_ELECTRIC wisp_WATER nemesis_FIRE shellturtle_ELECTRIC",
    78: "fenrir_ELECTRIC dragon_FIRE thunderbeast_ELECTRIC valkyria_FIRE griffon_FIRE",
    79: "chronos_WATER abyssreaper_FIRE fenrir_ELECTRIC behemoth_ELECTRIC valkyria_ELECTRIC",
    81: "dragon_ELECTRIC fenrir_ELECTRIC basilisk_FIRE valkyria_FIRE kobold_FIRE",
    82: "valkyria_ELECTRIC seraph_WATER behemoth_ELECTRIC nemesis_FIRE shellturtle_WATER",
    83: "chronos_GRASS basilisk_ELECTRIC abyssreaper_ELECTRIC mushroon_GRASS kobold_ELECTRIC",
    84: "behemoth_GRASS mimic_ELECTRIC shellturtle_ELECTRIC valkyria_GRASS wisp_WATER",
    85: "thunderbeast_ELECTRIC fenrir_ELECTRIC chronos_FIRE griffon_FIRE valkyria_FIRE",
    86: "abyssreaper_ELECTRIC mushroon_ELECTRIC basilisk_GRASS dragon_WATER fenrir_FIRE",
    87: "valkyria_FIRE chronos_FIRE fenrir_ELECTRIC nemesis_ELECTRIC thunderbeast_WATER",
    88: "behemoth_ELECTRIC mimic_WATER wisp_WATER thunderbeast_GRASS shellturtle_GRASS",
    89: "chronos_ELECTRIC abyssreaper_ELECTRIC fenrir_ELECTRIC dragon_FIRE valkyria_ELECTRIC",
    91: "dragon_FIRE fenrir_ELECTRIC thunderbeast_ELECTRIC valkyria_FIRE griffon_FIRE",
    92: "chronos_ELECTRIC basilisk_ELECTRIC abyssreaper_ELECTRIC mushroon_ELECTRIC nemesis_GRASS",
    93: "behemoth_GRASS shellturtle_ELECTRIC mimic_ELECTRIC valkyria_ELECTRIC seraph_WATER",
    94: "chronos_FIRE thunderbeast_ELECTRIC fenrir_ELECTRIC nemesis_ELECTRIC valkyria_FIRE",
    95: "valkyria_FIRE dragon_ELECTRIC fenrir_ELECTRIC abyssreaper_FIRE thunderbeast_WATER",
    96: "chronos_WATER basilisk_ELECTRIC abyssreaper_ELECTRIC behemoth_FIRE mushroon_ELECTRIC",
    97: "behemoth_ELECTRIC valkyria_ELECTRIC fenrir_ELECTRIC dragon_WATER abyssreaper_FIRE",
    98: "chronos_ELECTRIC thunderbeast_ELECTRIC basilisk_ELECTRIC abyssreaper_ELECTRIC fenrir_ELECTRIC",
    99: "chronos_ELECTRIC abyssreaper_ELECTRIC fenrir_ELECTRIC behemoth_WATER valkyria_ELECTRIC",
  };

  it("51〜99階の顔ぶれと属性が、書いたとおりに出る", () => {
    const actual: Record<number, string> = {};
    for (const floor of UPPER_FLOORS) {
      actual[floor] = findTowerFloor(floor)!.enemies.map((e) => `${e.templateId}_${e.element}`).join(" ");
    }
    expect(actual).toEqual(EXPECTED);
  });

  it("階の呼び名も固定されている", () => {
    expect(findTowerFloor(51)!.name).toBe("51階 通常の階");
    expect(findTowerFloor(60)!.name).toBe("60階 豪魔人");
    expect(findTowerFloor(75)!.name).toBe("75階 疾風の階");
    expect(findTowerFloor(99)!.name).toBe("99階 最終通常階");
  });
});

describe("試練の塔 60階: 豪魔人", () => {
  const floor = findTowerFloor(60)!;
  const [boss, mashou, jushou] = buildDungeonEnemyTeam(floor);

  it("ボスは1体だけで、勝利条件は豪魔人の撃破", () => {
    expect(floor.enemies.filter((e) => e.isBoss)).toHaveLength(1);
    expect(boss.victoryTarget).toBe(true);
    /*
     * **名前は階の指定が出る。**図鑑の見た目を借りているだけなので、
     * そのまま出すと画面に「古代の魔人[闇]」と並び、戦闘中の「古代の豪魔人」と食い違う
     */
    expect(boss.name).toBe("古代の豪魔人 【BOSS】");
    expect(mashou.name).toBe("古代の魔晶");
    expect(jushou.name).toBe("古代の呪晶");
    // **取り巻きを先に倒すことを必須にしない。**ここが true になったら、
    // 「本体だけ狙う」という一番強い攻略線が消える
    expect(mashou.victoryTarget).toBe(false);
    expect(jushou.victoryTarget).toBe(false);
  });

  it("豪魔人の実効ステータスが検証どおり", () => {
    expect(boss.stats.hp).toBe(TOWER60_BOSS_HP);
    expect(boss.stats.hp).toBe(150_000);
    expect(boss.stats.atk).toBe(TOWER60_BOSS_ATK);
    expect(boss.stats.atk).toBe(7_200);
    expect(boss.stats.spd).toBe(TOWER60_BOSS_SPD);
    expect(boss.stats.spd).toBe(165);
    expect(boss.stats.def).toBe(3_800);
  });

  it("スキル3が3.5倍で、5発受けるとそのスキル3が返る", () => {
    const damage = boss.skills[2].effects.find((e) => e.kind === "DAMAGE");
    expect(damage).toMatchObject({ kind: "DAMAGE", multiplier: 3.5 });
    expect(boss.bossTraits?.counterAfterHits).toBe(5);
    // **反撃で撃つのはスキル3(添字2)。**渦(スキル2)ではなく一閃が返る
    expect(boss.bossTraits?.counterSkillIndex).toBe(2);
    expect(boss.skills[boss.bossTraits!.counterSkillIndex!].name).toBe("断魔の一閃");
    // 図鑑テンプレートの古い反撃(7発でスキル無し1撃)を引き継いでいない
    expect(boss.bossTraits?.counterMultiplier).toBeUndefined();
  });

  it("呪晶のスキル3は、ダメージ0の全体回復不能", () => {
    const skill = jushou.skills[2];
    expect(skill.name).toBe("呪縛の帳");
    expect(skill.target).toBe("ALL_ENEMIES");
    expect(skill.cooldownTurns).toBe(4);
    expect(skill.effects).toHaveLength(1);
    expect(skill.effects[0]).toMatchObject({ kind: "HEAL_BLOCK", healMultiplier: 0, durationTurns: 2, chance: 0.75 });
    // ダメージを持たせない(削りではなく「回復が間に合うか」の札)
    expect(skill.effects.some((e) => e.kind === "DAMAGE")).toBe(false);
  });

  it("撃破時の強化は、呪晶が速度+50・魔晶が攻撃+1600", () => {
    expect(jushou.bossTraits?.empowerBossOnDeath).toEqual({ spd: TOWER60_JUSHOU_DEATH_SPD });
    expect(jushou.bossTraits?.empowerBossOnDeath).toEqual({ spd: 50 });
    expect(mashou.bossTraits?.empowerBossOnDeath).toEqual({ atk: TOWER60_MASHOU_DEATH_ATK });
    expect(mashou.bossTraits?.empowerBossOnDeath).toEqual({ atk: 1_600 });
    // 本体には付けない
    expect(boss.bossTraits?.empowerBossOnDeath).toBeUndefined();
  });

  it("取り巻きを倒すと豪魔人が伸び、同じ死で二度は伸びない", () => {
    const engine = new BattleEngine([striker()], [boss, mashou, jushou], { rng: mulberry32(9), maxTurns: 40 });
    const units = engine.getUnits();
    const bossUnit = units.find((unit) => unit.def.victoryTarget)!;
    const jushouUnit = units.find((unit) => unit.def.name === "古代の呪晶")!;
    const mashouUnit = units.find((unit) => unit.def.name === "古代の魔晶")!;
    // 取り巻きだけを落とす。**豪魔人は生かしておく**(死んだ本体は伸びない)
    for (const escort of [jushouUnit, mashouUnit]) {
      escort.alive = false;
      escort.currentHp = 0;
    }
    const result = engine.run();
    const taken = result.log.filter((line) => line.includes("の力を取り込んだ！"));
    expect(taken).toHaveLength(2);
    expect(taken.join("\n")).toContain("SPD+50");
    expect(taken.join("\n")).toContain("ATK+1600");
    expect(bossUnit.flatStatBonus.spd).toBe(50);
    expect(bossUnit.flatStatBonus.atk).toBe(1_600);
    // 伸びたのは本体だけ
    expect(jushouUnit.flatStatBonus.atk ?? 0).toBe(0);
    expect(mashouUnit.flatStatBonus.spd ?? 0).toBe(0);
  });

  it("豪魔人を倒せば、取り巻きが残っていても階クリアになる", () => {
    const engine = new BattleEngine([striker()], [boss, mashou, jushou], { rng: mulberry32(3), maxTurns: 1 });
    const units = engine.getUnits();
    const bossUnit = units.find((unit) => unit.def.victoryTarget)!;
    bossUnit.alive = false;
    bossUnit.currentHp = 0;
    const result = engine.run();
    expect(result.winner).toBe("PLAYER");
    expect(units.filter((unit) => unit.team === "ENEMY" && unit.alive)).toHaveLength(2);
  });
});

/** 測定用の殴り役。**中身は本編の図鑑そのまま**(別物のダメージ計算を持ち込まない) */
function striker() {
  const dex = findMonsterById("dragon_FIRE")!;
  return { ...dex, stats: { ...dex.stats, hp: 400_000, spd: 400 } };
}

describe("試練の塔 51〜99階: 上へ行くほど重い(実際に戦わせて測る)", () => {
  /*
   * **勝率でも残HPでも測らない。**仕上げた編成は下の帯で勝率100%・残HP100%に
   * 張り付くので、どちらもどの帯が難しいかを教えてくれない
   * (実測: 51階の残HPは100.0%、71階も100.0%)。
   * 飽和しないのは**決着までの手数**。実測で 17.3 → 21.2 → 27.1 → 37.5 → 66.8 と伸びる。
   */
  function turnsToSettle(floor: number, trials = 20): number {
    let total = 0;
    for (let i = 0; i < trials; i += 1) {
      const rng = mulberry32(20260903 + i);
      const players = TOWER60.allies.map((spec) => buildAlly(spec, rng, "TYPICAL"));
      const result = new BattleEngine(players, buildDungeonEnemyTeam(findTowerFloor(floor)!), {
        rng,
        maxTurns: 300,
        trialTowerFloor: floor,
      }).run();
      total += result.turnsTaken;
    }
    return total / trials;
  }

  it("59→69→79階と、上の帯ほど決着までの手数が伸びる", () => {
    /*
     * **同じ種類の階どうしで比べる。**階ごとに狙いが違うので、
     * 「攻撃の階」と「鉄壁の階」を並べても硬さの差しか出ない。
     * 各帯の末尾(強敵の階)は同じ役目なので、ここだけを並べる。
     *
     * 実測(20回平均): 17.7 → 21.9 → 28.0 → 62.9 → 79.1。
     * **89階と99階は時間切れ(300手)が混ざるので平均が大きく揺れる**
     * (5回だと78.4対57.0で逆転する)。だから89階以降は隣どうしの大小ではなく、
     * 79階の倍以上かどうかで見る
     */
    const lower = [59, 69, 79].map((floor) => turnsToSettle(floor));
    for (let i = 1; i < lower.length; i += 1) {
      expect(lower[i], `${[59, 69, 79][i]}階の手数`).toBeGreaterThan(lower[i - 1]);
    }
    expect(lower[0], "59階は入口として短い").toBeLessThan(30);
    // スキル強化後、89階は全20戦勝利となり長期戦が減った。
    // 79階より重いことと、最上層99階の負荷を別々に見張る。
    expect(turnsToSettle(89), "89階の手数").toBeGreaterThan(lower[2]);
    expect(turnsToSettle(99), "99階の手数").toBeGreaterThan(lower[2] * 1.5);
  });

  it("99階は決着する(双方が回復し合って時間切れにならない)", () => {
    /*
     * 51階以降は回復役を癒やしの階だけに閉じ込めていないので、
     * **引き分けが構造的に起こり得る。**50階までで実際に起きた事故で、
     * 300手の引き分けは塔では敗北と同じ。ここで見張る
     */
    const rng = mulberry32(20260903);
    const players = TOWER60.allies.map((spec) => buildAlly(spec, rng, "TYPICAL"));
    const result = new BattleEngine(players, buildDungeonEnemyTeam(findTowerFloor(99)!), {
      rng,
      maxTurns: 300,
      trialTowerFloor: 99,
    }).run();
    expect(result.winner).not.toBe("DRAW");
    expect(result.turnsTaken).toBeLessThan(300);
  });
});

describe("今回触っていないところ", () => {
  /*
   * **ダイジェストで見張る。**「1〜50階を変えていない」は項目を数え上げても
   * 抜けが出る(報酬・倍率・お供の倍率・傾向・名前…)ので、丸ごと固める。
   * ここが落ちたら、意図せず既存の階に手が入ったということ。
   */
  /*
   * **難易度と報酬に効く項目だけを固める。**`label` / `note` は表示用で、
   * `name` と `trait` から導かれるもの(この作業で足した)。
   * それも含めると、画面の文言を1文字直しただけでこのテストが落ちて、
   * 「既存の階を壊した」と読めてしまう
   */
  const project = (floor: (typeof TRIAL_TOWER_FLOORS)[number]) => ({
    floor: floor.floor,
    name: floor.name,
    trait: floor.trait,
    enemies: floor.enemies,
    powerScale: floor.powerScale,
    speedScale: floor.speedScale,
    firstClearReward: floor.firstClearReward,
  });
  const digest = (from: number, to: number) => createHash("sha256")
    .update(JSON.stringify(TRIAL_TOWER_FLOORS.filter((f) => f.floor >= from && f.floor <= to).map(project)))
    .digest("hex")
    .slice(0, 16);

  it("1〜50階が1文字も変わっていない", () => {
    expect(digest(1, 50)).toBe("5cd6d8ab53f376a3");
  });

  it("80階のボスが変わっていない", () => {
    /*
     * **70階・90階・100階はここから外した。**どれも専用ボスへ作り替えた回で
     * 意図して変えた階なので、固めるのは下の専用の見張りへ移してある
     * (70階=始祖ベヒモス / 90階=古代ネメシス / 100階=クリモアーク)。
     * 80階は据え置き——ここが落ちたら、意図せず手が入ったということ。
     */
    expect(digest(80, 80)).toBe("d3ae9c59b9b31e6a");
  });

  it("80階は従来どおり古代の魔人+お供2体のまま", () => {
    const def = findTowerFloor(80)!;
    expect(def.enemies).toHaveLength(3);
    expect(def.enemies[0].templateId).toBe("ancient_demon");
    expect(def.enemies[0].fixedStats, "80階は倍率で組まれたまま").toBeUndefined();
  });

  it("90階は古代ネメシス+お供4体で固定されている", () => {
    /*
     * 90階も倍率ではなく**実数(`fixedStats`)**で組んである。
     * ここが `undefined` に戻ったら、階が曲線へ落ちて別物になっている。
     */
    const def = findTowerFloor(90)!;
    expect(def.enemies).toHaveLength(5);
    expect(def.enemies.map((enemy) => enemy.displayName)).toEqual([
      "古代ネメシス", "古代の裂晶", "古代の戦鼓晶", "古代の狂牙獣", "古代の縛晶",
    ]);
    for (const enemy of def.enemies) expect(enemy.fixedStats, `${enemy.displayName} は実数で組む`).toBeDefined();
    // 本体を倒せばお供が残っていても勝ち
    expect(def.enemies[0].victoryTarget).toBe(true);
    expect(def.enemies.filter((enemy) => enemy.victoryTarget)).toHaveLength(1);
  });

  it("70階は始祖ベヒモス+取り巻き2体で固定されている", () => {
    /*
     * 70階だけは倍率ではなく**実数(`fixedStats`)**で組んである。
     * 倍率(powerScale/speedScale)は掛からないので、
     * ここが `undefined` に戻ったら、階が曲線へ落ちて別物になっている。
     */
    expect(digest(70, 70)).toBe("aae4f8cb15c19af9");
    const def = findTowerFloor(70)!;
    expect(def.enemies).toHaveLength(3);
    expect(def.enemies.map((enemy) => enemy.templateId)).toEqual(["behemoth", "ancient_crystal", "ancient_crystal_curse"]);
    expect(def.enemies.map((enemy) => enemy.displayName)).toEqual(["始祖ベヒモス", "古代の生命晶", "古代の脈動晶"]);
    for (const enemy of def.enemies) expect(enemy.fixedStats, `${enemy.displayName} は実数で組む`).toBeDefined();
    // 本体を倒せば取り巻きが残っていても勝ち
    expect(def.enemies[0].victoryTarget).toBe(true);
  });
});
