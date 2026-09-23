/**
 * アクセサリー「攻撃」メインの仮値を決めるための、一撃ぶんの測定。
 *
 * **検証専用。本番のデータには何も書かない。**
 *
 * 知りたいのは「★6 Lv15 の攻撃メインを +1500 / +2000 / +2500 のどこに置けば、
 * 硬すぎる耐久防衛に攻撃特化が通るようになり、しかも全員ワンパンにはならないか」。
 *
 * ## 何を通しているか
 *
 * 攻撃側も防御側も Battle Lab の `buildAlly`(createMonsterInstance → 装備 →
 * toBattleDefinition)で組み、`createBattleUnit` で戦闘単位にして、
 * **本編の `calcDamage` をそのまま呼ぶ。**ダメージ式はここに1行も無い。
 * 防御式 `1000 / (1000 + 1.2 × DEF)` も、sw方式の属性も、本番の既定のまま。
 *
 * アクセサリーはまだ無いので、**最終ATKへの仮加算**で代える
 * (戦闘定義の `stats.atk` = 装備込みの攻撃力 + 加算値)。装備と同じく
 * 素の値に入るので、攻撃UPの30%はこの加算ぶんにも乗る。
 *
 * ## 着弾時の倍率も並べる
 *
 * `calcDamage` の後、本編は `applyIncomingDamage` で
 * 潜在覚醒の「受けるダメージ軽減」とパッシブの軽減を掛ける。
 * ワンパンかどうかはそちらで決まるので、**本番の `damageTakenMultiplier` と
 * 潜在の倍率を呼んで**、着弾後の値も別に出す(HP満タン・戦闘開始時点)。
 *
 *   npx tsx tools/accessoryAtkLab.ts            # Markdown で全表
 *   npx tsx tools/accessoryAtkLab.ts --seeds 30 # 装備の引きの揺れも出す
 */
import { calcDamage, getFinalCritRate } from "../src/battle/damage.js";
import {
  applyStatEffect,
  createBattleUnit,
  damageTakenMultiplier,
  getEffectiveStat,
  passiveSkillOf,
  type BattleUnit,
} from "../src/battle/unit.js";
import type { DamageEffect, Skill } from "../src/core/skill.js";
import { ATK_UP, DEF_DOWN } from "../src/core/statusValues.js";
import { balanceFlags } from "../src/core/balanceFlags.js";
import { LATENT_ABILITY_CANDIDATES } from "../src/data/latentAbilities.js";
import { buildAlly } from "./battleLab/build.js";
import { PRESETS } from "./battleLab/presets.js";
import { mulberry32 } from "./battleLab/rng.js";
import type { AllySpec, PresetName } from "./battleLab/types.js";

const ACCESSORY_ATK = [0, 1_500, 2_000, 2_500];
/** 代表の個体を作る種。**書けば必ず同じ個体になる** */
const SEED = 4242;

interface AttackerSpec {
  key: string;
  label: string;
  templateId: string;
  element: AllySpec["element"];
  preset: PresetName;
  skill: string;
}

/*
 * 攻撃側は全員「闇」、防御側は全員「水」(ミミックとトレントは闇)。
 *
 * sw方式の属性は倍率ではなく**クリ率とかすり**に出る。不利な組み合わせだと
 * 会心を固定したはずの一撃が50%でかすりに化け、表が読めなくなる。
 * 闇→水・闇→闇はどちらも中立なので、見たい差(攻撃値)だけが残る。
 */
const ATTACKERS: AttackerSpec[] = [
  { key: "dragon", label: "闇ドラゴン", templateId: "dragon", element: "DARK", preset: "MAX_ATTACKER", skill: "破壊の流星" },
  { key: "nemesis", label: "闇ネメシス", templateId: "nemesis", element: "DARK", preset: "MAX_ATTACKER", skill: "エンドオブオール" },
  /*
   * 追加の1体。**純ATK依存(HP/DEF比例・防御無視・条件付き上乗せなし)の単体技**で、
   * 闇属性(防御側と中立)、しかもふつうのモンスター。
   * 図鑑を全部走査した上位は、条件付き防御無視を持つグジラ火S3、
   * ダンジョン専用の古代獣、確定会心のスエゾーなどで、どれも「純ATK」の基準にならない。
   */
  { key: "wolf", label: "闇ウルフ", templateId: "wolf", element: "DARK", preset: "MAX_ATTACKER", skill: "シャドウレンド" },
];

interface DefenderSpec {
  label: string;
  templateId: string;
  element: AllySpec["element"];
  preset: PresetName;
  group: "HP特化" | "DEF特化";
  /** 潜在の何番目を取るか。省略時は型紙どおり(0番=攻勢) */
  latentIndex?: number;
}

/*
 * アリーナNPCの防衛編成(`src/data/arena/npcTeams.ts`)で、HP型・防御型として
 * 実際に組まれているもの。1体で結論を出さないよう、両方の型から複数取る。
 */
const DEFENDERS: DefenderSpec[] = [
  { label: "ベヒモス[水]", templateId: "behemoth", element: "WATER", preset: "HP_SCALE_ENDURE", group: "HP特化" },
  { label: "ミミック[水]", templateId: "mimic", element: "WATER", preset: "HP_SCALE_ENDURE", group: "HP特化" },
  { label: "フェニックス[水]", templateId: "phoenix", element: "WATER", preset: "HP_SCALE_ENDURE", group: "HP特化" },
  { label: "トレント[闇]", templateId: "treant", element: "DARK", preset: "HP_SCALE_ENDURE", group: "HP特化" },
  /*
   * 型紙は潜在の0番(攻勢)を取る。この7体のうち**耐久の数値そのものを動かす潜在**を
   * 持つのはトレント[闇]の「不屈装甲」(HP×1.1・DEF×1.12・被ダメ×0.92)だけなので、
   * それを取った個体も並べる。他の6体は、どれを取っても最大HP・DEF・被ダメは変わらない。
   */
  { label: "トレント[闇]不屈装甲", templateId: "treant", element: "DARK", preset: "HP_SCALE_ENDURE", group: "HP特化", latentIndex: 2 },
  { label: "グレイヴナイト[水]", templateId: "knight", element: "WATER", preset: "DEF_SCALE_ENDURE", group: "DEF特化" },
  { label: "シェルタートル[水]", templateId: "shellturtle", element: "WATER", preset: "DEF_SCALE_ENDURE", group: "DEF特化" },
  { label: "ゴーレム[水]", templateId: "golem", element: "WATER", preset: "DEF_SCALE_ENDURE", group: "DEF特化" },
];

const argv = process.argv.slice(2);
const seedsIndex = argv.indexOf("--seeds");
const seedCount = seedsIndex >= 0 ? Number(argv[seedsIndex + 1]) : 0;

// 本番の既定から外れていたら、測った数字は本番のものではない
if (balanceFlags.defenseFormula !== "sw" || balanceFlags.elementMode !== "sw" || balanceFlags.swRatio !== 1.2) {
  throw new Error(`本番の既定ではない: ${JSON.stringify(balanceFlags)}`);
}

function attackerUnit(spec: AttackerSpec, accessory: number, seed = SEED): BattleUnit {
  const base = buildAlly({ label: spec.label, templateId: spec.templateId, element: spec.element, preset: spec.preset }, mulberry32(seed));
  // アクセサリーの仮加算。装備と同じく素の攻撃力へ入る(攻撃UPの%もここに乗る)
  const def = accessory > 0 ? { ...base, stats: { ...base.stats, atk: base.stats.atk + accessory } } : base;
  return createBattleUnit(def, "PLAYER", `atk_${spec.key}`);
}

function defenderUnit(spec: DefenderSpec, seed = SEED): BattleUnit {
  return createBattleUnit(
    buildAlly({
      label: spec.label, templateId: spec.templateId, element: spec.element, preset: spec.preset,
      ...(spec.latentIndex === undefined ? {} : { latentIndex: spec.latentIndex }),
    }, mulberry32(seed + 1)),
    "ENEMY",
    `def_${spec.templateId}`,
  );
}

function damageEffectOf(unit: BattleUnit, name: string): { skill: Skill; effect: DamageEffect } {
  // toBattleDefinition の時点でスキルLvは解決済み。**ここで重ねて上げない**
  const skill = unit.def.skills.find((s) => s?.name === name);
  if (!skill) throw new Error(`${unit.def.name} に ${name} が無い`);
  const effect = skill.effects.find((e): e is DamageEffect => e.kind === "DAMAGE");
  if (!effect) throw new Error(`${name} に攻撃が無い`);
  return { skill, effect };
}

/** 1Hitぶん。rng=0.999999 なら決して会心せず、rng=0 なら必ず会心する */
function oneHit(attacker: BattleUnit, defender: BattleUnit, effect: DamageEffect, crit: boolean): number {
  const rng = () => (crit ? 0 : 0.999999);
  const result = calcDamage(attacker, defender, { ...effect, hits: 1 }, rng);
  if (result.isCrit !== crit || result.isGlancing) throw new Error("会心/かすりの固定に失敗した(属性の組み合わせを見直すこと)");
  return result.damage;
}

/**
 * 着弾時の倍率。本編の `applyIncomingDamage` が掛けるもののうち、
 * 戦闘開始時点(HP満タン・軽減バフなし)で効くもの。
 */
function incomingFactor(defender: BattleUnit): number {
  const latent = Math.max(0, Math.min(1, defender.def.latentAbility?.damageTakenMultiplier ?? 1));
  return latent * damageTakenMultiplier(defender, false);
}

type Condition = "素" | "防御低下" | "攻撃UP" | "攻撃UP+防御低下";

function prepare(attacker: BattleUnit, defender: BattleUnit, condition: Condition): void {
  attacker.effects = [];
  defender.effects = [];
  if (condition === "攻撃UP" || condition === "攻撃UP+防御低下") applyStatEffect(attacker, "atk", ATK_UP, 2, "BUFF");
  if (condition === "防御低下" || condition === "攻撃UP+防御低下") applyStatEffect(defender, "def", -DEF_DOWN, 2, "DEBUFF");
}

interface Row {
  attacker: string;
  skill: string;
  hits: number;
  ignoreDefense: boolean;
  defender: string;
  group: string;
  accessory: number;
  condition: Condition;
  atk: number;
  critRate: number;
  critDmg: number;
  hp: number;
  def: number;
  normalHit: number;
  critHit: number;
  landedNormal: number;
  landedCrit: number;
  incoming: number;
}

function measure(attackerSpec: AttackerSpec, defenderSpec: DefenderSpec, accessory: number, condition: Condition): Row {
  const attacker = attackerUnit(attackerSpec, accessory);
  const defender = defenderUnit(defenderSpec);
  const { effect } = damageEffectOf(attacker, attackerSpec.skill);
  prepare(attacker, defender, condition);
  const hits = Math.max(1, Math.floor(effect.hits ?? 1));
  const normalHit = oneHit(attacker, defender, effect, false);
  const critHit = oneHit(attacker, defender, effect, true);
  const incoming = incomingFactor(defender);
  return {
    attacker: attackerSpec.label,
    skill: attackerSpec.skill,
    hits,
    ignoreDefense: effect.ignoreDefense === true,
    defender: defenderSpec.label,
    group: defenderSpec.group,
    accessory,
    condition,
    atk: Math.round(getEffectiveStat(attacker, "atk")),
    critRate: getFinalCritRate(attacker, defender),
    critDmg: getEffectiveStat(attacker, "criDmg"),
    hp: defender.maxHp,
    def: Math.round(getEffectiveStat(defender, "def")),
    normalHit,
    critHit,
    // 本編と同じく、着弾時は1Hitごとに丸める
    landedNormal: Math.round(normalHit * incoming),
    landedCrit: Math.round(critHit * incoming),
    incoming,
  };
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const n = (v: number) => Math.round(v).toLocaleString("en-US");

/* ---------------------------------------------------------------- 出力 */

console.log("# アクセサリー攻撃値の検証(一撃ぶん)\n");
console.log(`防御式: 1000/(1000+${balanceFlags.swRatio}×DEF) / 属性: ${balanceFlags.elementMode}方式 / 防御低下 ${DEF_DOWN * 100}% / 攻撃UP ${ATK_UP * 100}%`);
console.log(`代表個体の種: ${SEED}(装備の値は本番の抽選関数で引く)\n`);

console.log("## 攻撃側(アクセ+0)\n");
console.log("| モンスター | 型紙 | 最終ATK | クリ率 | クリダメ | スキル(Lv最大の実効) | CT |");
console.log("|---|---|---:|---:|---:|---|---:|");
for (const spec of ATTACKERS) {
  const unit = attackerUnit(spec, 0);
  const { skill, effect } = damageEffectOf(unit, spec.skill);
  const hits = Math.max(1, Math.floor(effect.hits ?? 1));
  console.log(`| ${spec.label} | ${spec.preset} | ${n(getEffectiveStat(unit, "atk"))} | ${pct(getEffectiveStat(unit, "criRate"))} | ${pct(getEffectiveStat(unit, "criDmg"))} | ${spec.skill} ${skill.target === "ALL_ENEMIES" ? "全体" : "単体"} ATK×${effect.multiplier.toFixed(3)}${hits > 1 ? `×${hits}Hit` : ""}${effect.ignoreDefense ? " 完全防御無視" : ""} | ${skill.cooldownTurns} |`);
}

console.log("\n## 防御側\n");
console.log("| モンスター | 型 | タイプ | 最大HP | DEF | 装備(4セット+2セット / 2・4・6メイン) | 潜在 | パッシブ | 着弾倍率 |");
console.log("|---|---|---|---:|---:|---|---|---|---:|");
for (const spec of DEFENDERS) {
  const unit = defenderUnit(spec);
  const preset = PRESETS[spec.preset];
  const sets = `${preset.gear[0].set}4+${preset.gear[5].set}2`;
  const mains = [preset.gear[1].main, preset.gear[3].main, preset.gear[5].main].join("/");
  const latent = (LATENT_ABILITY_CANDIDATES[`${spec.templateId}_${spec.element}`] ?? [])[spec.latentIndex ?? preset.latentIndex];
  const passive = passiveSkillOf(unit);
  console.log(`| ${spec.label} | ${spec.group} | ${preset.type} | ${n(unit.maxHp)} | ${n(getEffectiveStat(unit, "def"))} | ${sets} / ${mains} | ${latent?.name ?? "なし"} | ${passive?.name ?? "なし"} | ×${incomingFactor(unit).toFixed(2)} |`);
}

const CONDITIONS_DEF: Condition[] = ["素", "防御低下"];

for (const attackerSpec of ATTACKERS) {
  const probe = damageEffectOf(attackerUnit(attackerSpec, 0), attackerSpec.skill).effect;
  const conditions: Condition[] = probe.ignoreDefense ? ["素"] : CONDITIONS_DEF;
  const hits = Math.max(1, Math.floor(probe.hits ?? 1));
  for (const condition of conditions) {
    console.log(`\n## ${attackerSpec.label}「${attackerSpec.skill}」 / ${condition === "素" ? "防御低下なし" : `防御${DEF_DOWN * 100}%低下あり`} / 攻撃バフなし\n`);
    console.log(`全体攻撃は**1体あたり**。${hits > 1 ? `${hits}Hitなので「1Hit」と「全Hit合計」を分けて出す。` : ""}`);
    console.log("割合と必要回数は**着弾後**(潜在・パッシブの軽減込み)。必要回数は満タンから倒すのに要るスキル使用回数。\n");
    console.log(`| 防御側 | アクセ | 最終ATK | クリ率 | クリダメ | HP | DEF | 非クリ${hits > 1 ? "1Hit" : ""} | クリ${hits > 1 ? "1Hit" : ""} |${hits > 1 ? " 非クリ合計 | クリ合計 |" : ""} 着弾 非クリ/クリ | 最大HP比 非クリ/クリ | 期待値比 | 必要回数 非クリ/クリ | 必要Hit数 非クリ/クリ |`);
    console.log(`|---|---:|---:|---:|---:|---:|---:|---:|---:|${hits > 1 ? "---:|---:|" : ""}---:|---:|---:|---:|---:|`);
    for (const defenderSpec of DEFENDERS) {
      for (const accessory of ACCESSORY_ATK) {
        const r = measure(attackerSpec, defenderSpec, accessory, condition);
        const totalN = r.landedNormal * hits;
        const totalC = r.landedCrit * hits;
        const expected = (totalN * (1 - r.critRate) + totalC * r.critRate) / r.hp;
        console.log(`| ${r.defender} | +${n(accessory)} | ${n(r.atk)} | ${pct(r.critRate)} | ${pct(r.critDmg)} | ${n(r.hp)} | ${n(r.def)} | ${n(r.normalHit)} | ${n(r.critHit)} |`
          + `${hits > 1 ? ` ${n(r.normalHit * hits)} | ${n(r.critHit * hits)} |` : ""}`
          + ` ${n(totalN)} / ${n(totalC)} | ${pct(totalN / r.hp)} / ${pct(totalC / r.hp)} | ${pct(expected)} |`
          + ` ${Math.ceil(r.hp / totalN)} / ${Math.ceil(r.hp / totalC)} | ${Math.ceil(r.hp / r.landedNormal)} / ${Math.ceil(r.hp / r.landedCrit)} |`);
      }
    }
  }
}

/* 攻撃バフありは別表。防御低下の有無と組み合わせる */
console.log("\n## 攻撃UPあり(別表)\n");
console.log("着弾後・スキル1回ぶん(全Hit合計)の最大HP比。左が非クリ、右がクリ。\n");
console.log("| 攻撃側 | 防御側 | 条件 | +0 | +1,500 | +2,000 | +2,500 |");
console.log("|---|---|---|---:|---:|---:|---:|");
for (const attackerSpec of ATTACKERS) {
  const probe = damageEffectOf(attackerUnit(attackerSpec, 0), attackerSpec.skill).effect;
  const conditions: Condition[] = probe.ignoreDefense ? ["素", "攻撃UP"] : ["素", "攻撃UP", "防御低下", "攻撃UP+防御低下"];
  const hits = Math.max(1, Math.floor(probe.hits ?? 1));
  for (const defenderSpec of DEFENDERS) {
    for (const condition of conditions) {
      const cells = ACCESSORY_ATK.map((accessory) => {
        const r = measure(attackerSpec, defenderSpec, accessory, condition);
        return `${pct(r.landedNormal * hits / r.hp)} / ${pct(r.landedCrit * hits / r.hp)}`;
      });
      console.log(`| ${attackerSpec.label} | ${defenderSpec.label} | ${condition} | ${cells.join(" | ")} |`);
    }
  }
}

/* 型ごとの要約。1体で結論を出さないため、同じ型の平均と最小・最大を出す */
console.log("\n## 要約: 型ごとのクリ1回ぶんの削り率(着弾後・全Hit合計)\n");
console.log("| 攻撃側 | 相手の型 | 条件 | +0 | +1,500 | +2,000 | +2,500 |");
console.log("|---|---|---|---:|---:|---:|---:|");
for (const attackerSpec of ATTACKERS) {
  const probe = damageEffectOf(attackerUnit(attackerSpec, 0), attackerSpec.skill).effect;
  const conditions: Condition[] = probe.ignoreDefense ? ["素", "攻撃UP"] : ["素", "防御低下", "攻撃UP+防御低下"];
  const hits = Math.max(1, Math.floor(probe.hits ?? 1));
  for (const group of ["HP特化", "DEF特化"] as const) {
    for (const condition of conditions) {
      const cells = ACCESSORY_ATK.map((accessory) => {
        const ratios = DEFENDERS.filter((d) => d.group === group).map((d) => {
          const r = measure(attackerSpec, d, accessory, condition);
          return r.landedCrit * hits / r.hp;
        });
        const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
        return `${pct(avg)} (${pct(Math.min(...ratios))}〜${pct(Math.max(...ratios))})`;
      });
      console.log(`| ${attackerSpec.label} | ${group} | ${condition} | ${cells.join(" | ")} |`);
    }
  }
}

/* 装備の引きによる揺れ。代表の1個体だけで決めないため */
if (seedCount > 0) {
  console.log(`\n## 装備の引きによる揺れ(種 ${seedCount} 通り)\n`);
  console.log("| 個体 | 項目 | 最小 | 中央 | 最大 |");
  console.log("|---|---|---:|---:|---:|");
  const spread = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return [sorted[0], sorted[Math.floor(sorted.length / 2)], sorted[sorted.length - 1]].map(n).join(" | ");
  };
  for (const spec of ATTACKERS) {
    const units = Array.from({ length: seedCount }, (_, i) => attackerUnit(spec, 0, 1000 + i));
    console.log(`| ${spec.label} | ATK | ${spread(units.map((u) => getEffectiveStat(u, "atk")))} |`);
    console.log(`| ${spec.label} | クリダメ% | ${spread(units.map((u) => getEffectiveStat(u, "criDmg") * 100))} |`);
  }
  for (const spec of DEFENDERS) {
    const units = Array.from({ length: seedCount }, (_, i) => defenderUnit(spec, 1000 + i));
    console.log(`| ${spec.label} | HP | ${spread(units.map((u) => u.maxHp))} |`);
    console.log(`| ${spec.label} | DEF | ${spread(units.map((u) => getEffectiveStat(u, "def")))} |`);
  }
}

/*
 * **代表の1組だけで境目を決めない。**
 *
 * 種4242の個体は、攻撃側のATKが中央値より高く、防御側のHPが中央値より低い
 * (= ワンパンが起きやすい側)に寄っていた。装備の引きによるATKの揺れは±15%ほどあり、
 * アクセの3案の差(+1500と+2500で約8%)より大きい。
 * 攻撃側30個体 × 防御側30個体の全組で、「クリ1回で落ちる組の割合」を数える。
 */
if (argv.includes("--pairs")) {
  const COUNT = 30;
  const scenarios: { attacker: AttackerSpec; condition: Condition }[] = [
    { attacker: ATTACKERS[0], condition: "素" },
    { attacker: ATTACKERS[0], condition: "攻撃UP" },
    { attacker: ATTACKERS[1], condition: "素" },
    { attacker: ATTACKERS[1], condition: "防御低下" },
    { attacker: ATTACKERS[1], condition: "攻撃UP+防御低下" },
    { attacker: ATTACKERS[2], condition: "防御低下" },
  ];
  console.log(`\n## 個体差込み: クリ1回で落ちる組の割合(攻撃側${COUNT} × 防御側${COUNT} = ${COUNT * COUNT}組)\n`);
  console.log("括弧内は削り率(着弾後・全Hit合計・クリ)の中央値。\n");
  console.log("| 攻撃側 | 条件 | 防御側 | +0 | +1,500 | +2,000 | +2,500 |");
  console.log("|---|---|---|---:|---:|---:|---:|");
  const defenderPool = new Map(DEFENDERS.map((d) => [d.label, Array.from({ length: COUNT }, (_, i) => defenderUnit(d, 2000 + i))]));
  for (const { attacker: spec, condition } of scenarios) {
    const hits = Math.max(1, Math.floor(damageEffectOf(attackerUnit(spec, 0), spec.skill).effect.hits ?? 1));
    for (const defenderSpec of DEFENDERS) {
      const cells = ACCESSORY_ATK.map((accessory) => {
        const attackers = Array.from({ length: COUNT }, (_, i) => attackerUnit(spec, accessory, 1000 + i));
        const ratios: number[] = [];
        for (const attacker of attackers) {
          const { effect } = damageEffectOf(attacker, spec.skill);
          for (const defender of defenderPool.get(defenderSpec.label)!) {
            prepare(attacker, defender, condition);
            const landed = Math.round(oneHit(attacker, defender, effect, true) * incomingFactor(defender));
            ratios.push(landed * hits / defender.maxHp);
          }
        }
        ratios.sort((a, b) => a - b);
        const killed = ratios.filter((r) => r >= 1).length / ratios.length;
        return `${pct(killed)} (${pct(ratios[Math.floor(ratios.length / 2)])})`;
      });
      console.log(`| ${spec.label} | ${condition} | ${defenderSpec.label} | ${cells.join(" | ")} |`);
    }
  }
}
