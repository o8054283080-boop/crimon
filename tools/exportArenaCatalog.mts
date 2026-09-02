/**
 * ゲームの定義を、サーバが照合に使える形(SQL)へ書き出す。
 *
 * ## なぜ要るのか
 *
 * 防衛編成はクライアントが焼いて送る。**サーバがそれを検分できないと、
 * 送った通りの相手が並ぶ。** ★6・Lv60・強化15・能力ポイント満点の
 * 編成を名乗るのは、JSONを1行書き換えるだけでできてしまう。
 *
 * 検分するには「何が正しいか」をサーバが知っている必要がある。
 * だが定義を手でSQLへ書き写すと、**必ずずれる。**
 * この案件では既に、挑戦券と勝敗コインで同じ事故を出している。
 *
 * だから**書き写さず、生成する。**
 *
 * ## 使い方
 *
 *   npx tsx tools/exportArenaCatalog.mts          # 差分があれば新しい migration を書く
 *   npx tsx tools/exportArenaCatalog.mts --check  # 差分があれば異常終了する(CI用)
 *
 * ## なぜ「新しいファイル」を書くのか
 *
 * migration は一度しか流れない。同じファイルを書き換えても、
 * **本番のDBには届かない。** 定義が変わったら新しい migration が要る。
 * だから中身が変わった時だけ、新しいタイムスタンプでファイルを足す。
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  EQUIP_MAX_LEVEL,
  EQUIP_SLOTS,
  EQUIP_STARS,
  EquipStar,
  MAX_SUB_STATS,
  SUBSTAT_POWERUP_LEVELS,
  SET_TYPES,
  SLOT_MAIN_STAT_OPTIONS,
  STAT_TYPES,
  StatType,
  generateEquipment,
  enhanceEquipment,
} from "../src/core/equipment.js";
import { ABILITY_POINT_BUDGETS } from "../src/core/monsterDevelopment.js";
import { STAR_MAX_LEVEL, STARS } from "../src/core/rarity.js";
import { MAX_SKILL_LEVEL } from "../src/core/skill.js";
import { MONSTER_DEX } from "../src/data/monsters.js";
import { LATENT_ABILITY_CANDIDATES } from "../src/data/latentAbilities.js";
import { ARENA_TEAM_SIZE } from "../src/data/pvpArena.js";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
/** 生成したファイルの名前に必ず入れる印。**これで自分の作ったものを見分ける** */
const CATALOG_MARK = "arena_catalog";

/* ==========================================================================
 * 上限の求め方
 *
 * **生成器そのものを使って測る。** 式を書き写すと、
 * `roundStatValue` の丸めや、15レベル到達時の追加倍率を落としやすい。
 * ここでは「一番良い引きをした装備」を実際に作って、その値を上限にする。
 * ========================================================================== */

/**
 * 台本つきの乱数。
 *
 * **「常に1を返す」ではだめだった。** 生成器の `pick` は
 * `items[Math.floor(rng() * len)]` なので、1 を返すと配列の外を指して
 * `undefined` になる(実際にそれで落ちた)。
 *
 * それに、上限を測るには「狙った型を引かせる」必要がある。
 * だから引かせたい値を順に並べ、尽きたら**ばらつきの最大側**へ倒す。
 */
function scriptedRng(script: number[]): () => number {
  let i = 0;
  return () => (i < script.length ? script[i++] : MAX_ROLL);
}

/** ばらつき(0.85〜1.15倍)の最大側。1 ちょうどにしない理由は上のとおり */
const MAX_ROLL = 0.999999;

/** `pick` に添字 `index` を引かせる値 */
function pickAt(index: number, length: number): number {
  return (index + 0.5) / length;
}

/**
 * メインOPの上限。
 *
 * 生成 → 強化を `level` 回まわして、実際に到達しうる最大値を測る。
 * **式を書き写さない。** 丸めも、15レベル到達時の追加倍率も、
 * 生成器の側にしか正解が無い。
 */
function mainStatCap(type: StatType, star: EquipStar, level: number): number {
  const slot = EQUIP_SLOTS.find((s) => SLOT_MAIN_STAT_OPTIONS[s].includes(type));
  if (slot === undefined) return 0;
  const options = SLOT_MAIN_STAT_OPTIONS[slot];
  const rng = scriptedRng([pickAt(options.indexOf(type), options.length), MAX_ROLL]);
  const equipment = generateEquipment({ slot, star, subStatCount: 0, set: "CRIT", rng });
  if (equipment.mainStat.type !== type) {
    // 台本が生成器の呼び出し順とずれた。**黙って別の値を出さない**
    throw new Error(`メインOPの台本がずれている: ${type} を狙って ${equipment.mainStat.type} が出た`);
  }
  for (let i = 0; i < level; i += 1) enhanceEquipment(equipment, scriptedRng([]));
  return equipment.mainStat.value;
}

/** その型・その星で、サブOPが1回に乗せる最大値 */
function measureSubRoll(type: StatType, star: EquipStar): number {
  const slot = EQUIP_SLOTS.find((s) => !SLOT_MAIN_STAT_OPTIONS[s].includes(type));
  if (slot === undefined) return 0;
  const mainOptions = SLOT_MAIN_STAT_OPTIONS[slot];
  const mainType = mainOptions[0];
  const pool = STAT_TYPES.filter((t) => t !== mainType);
  const rng = scriptedRng([
    pickAt(0, mainOptions.length), // メインOPの型
    MAX_ROLL,                      // メインOPのばらつき
    pickAt(pool.indexOf(type), pool.length), // 1つ目のサブOPの型
    MAX_ROLL,                      // そのばらつき
  ]);
  const probe = generateEquipment({ slot, star, subStatCount: 1, set: "CRIT", rng });
  const sample = probe.subStats[0];
  if (!sample || sample.type !== type) {
    throw new Error(`サブOPの台本がずれている: ${type} を狙って ${sample?.type ?? "無し"} が出た`);
  }
  return sample.value;
}

/**
 * サブOPの上限。
 *
 * 初期値 + 3レベルごとの強化ぶん。**枠が埋まっている個体が、
 * 毎回同じ枠を引き当て続けた場合**が最大なので、そこを上限にする。
 * 実際にそうなる確率は低いが、**上限は「起こりうる最大」でなければ
 * 正しい装備を弾いてしまう。**
 */
function subStatCap(type: StatType, star: EquipStar, level: number): number {
  const one = measureSubRoll(type, star);
  if (one <= 0) return 0;
  const powerups = SUBSTAT_POWERUP_LEVELS.filter((l) => l <= level).length;
  return roundLike(type, one * (1 + powerups));
}

/** 実数系は整数、割合系は小数3桁。`roundStatValue` と同じ扱い */
const FLAT = new Set<StatType>(["ATK_FLAT", "DEF_FLAT", "HP_FLAT", "SPD"]);
function roundLike(type: StatType, raw: number): number {
  return FLAT.has(type) ? Math.max(1, Math.round(raw)) : Math.round(raw * 1000) / 1000;
}

/* ==========================================================================
 * SQL を組み立てる
 * ========================================================================== */

function q(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function buildSql(): string {
  const lines: string[] = [];
  const push = (line = "") => lines.push(line);

  push("--");
  push("-- アリーナ: 照合用のゲーム定義");
  push("--");
  push("-- **このファイルは生成物です。手で書き換えないでください。**");
  push("--   npx tsx tools/exportArenaCatalog.mts");
  push("--");
  push("-- 防衛編成をサーバが検分するための表。ここに無い図鑑ID・属性・");
  push("-- メインOP・潜在覚醒は、すべて拒否されます。");
  push("-- 値の上限は式を書き写さず、生成器そのものを回して測ってあります。");
  push("--");
  push();

  /* --- 表 --- */
  push("create table if not exists public.arena_catalog_monsters (");
  push("  dex_id      text primary key,");
  push("  template_id text not null,");
  push("  element     text not null");
  push(");");
  push();
  push("create table if not exists public.arena_catalog_latents (");
  push("  dex_id    text not null,");
  push("  latent_id text not null,");
  push("  primary key (dex_id, latent_id)");
  push(");");
  push();
  push("create table if not exists public.arena_catalog_slot_mains (");
  push("  slot      smallint not null,");
  push("  stat_type text     not null,");
  push("  primary key (slot, stat_type)");
  push(");");
  push();
  push("-- メインOP・サブOPが到達しうる最大値。**これを超える装備は存在しない**");
  push("create table if not exists public.arena_catalog_stat_caps (");
  push("  stat_type text     not null,");
  push("  star      smallint not null,");
  push("  level     smallint not null,");
  push("  main_max  numeric  not null,");
  push("  sub_max   numeric  not null,");
  push("  primary key (stat_type, star, level)");
  push(");");
  push();
  push("create table if not exists public.arena_catalog_star_rules (");
  push("  star           smallint primary key,");
  push("  max_level      smallint not null,");
  push("  ability_points integer  not null");
  push(");");
  push();
  push("create table if not exists public.arena_catalog_sets (");
  push("  set_type text primary key");
  push(");");
  push();
  push("create table if not exists public.arena_catalog_limits (");
  push("  key   text    primary key,");
  push("  value numeric not null");
  push(");");
  push();

  /*
   * 入れ替えは delete → insert。**古い定義を残さない。**
   * 残すと「もう存在しない図鑑IDの編成」が通り続ける。
   */
  push("-- 入れ替え。古い定義を残すと、消えたはずの図鑑IDが通り続ける");
  push("delete from public.arena_catalog_monsters;");
  push("delete from public.arena_catalog_latents;");
  push("delete from public.arena_catalog_slot_mains;");
  push("delete from public.arena_catalog_stat_caps;");
  push("delete from public.arena_catalog_star_rules;");
  push("delete from public.arena_catalog_sets;");
  push("delete from public.arena_catalog_limits;");
  push();

  /* --- モンスター --- */
  push(`-- 図鑑 ${MONSTER_DEX.length} 件`);
  push("insert into public.arena_catalog_monsters (dex_id, template_id, element) values");
  push(MONSTER_DEX
    .map((m) => `  (${q(m.id)}, ${q(m.templateId)}, ${q(m.element)})`)
    .join(",\n") + ";");
  push();

  /* --- 潜在覚醒 --- */
  const latentRows: string[] = [];
  for (const [dexId, candidates] of Object.entries(LATENT_ABILITY_CANDIDATES)) {
    for (const candidate of candidates) latentRows.push(`  (${q(dexId)}, ${q(candidate.id)})`);
  }
  push(`-- 潜在覚醒の候補 ${latentRows.length} 件。**ここに無いIDは名乗れない**`);
  push("insert into public.arena_catalog_latents (dex_id, latent_id) values");
  push(latentRows.join(",\n") + ";");
  push();

  /* --- スロットごとのメインOP候補 --- */
  const slotRows: string[] = [];
  for (const slot of EQUIP_SLOTS) {
    for (const type of SLOT_MAIN_STAT_OPTIONS[slot]) slotRows.push(`  (${slot}, ${q(type)})`);
  }
  push("-- スロットごとに付きうるメインOP。**枠3に速度は付かない**、等");
  push("insert into public.arena_catalog_slot_mains (slot, stat_type) values");
  push(slotRows.join(",\n") + ";");
  push();

  /* --- 値の上限 --- */
  const capRows: string[] = [];
  for (const type of STAT_TYPES) {
    for (const star of EQUIP_STARS) {
      for (let level = 0; level <= EQUIP_MAX_LEVEL; level += 1) {
        const main = mainStatCap(type, star, level);
        const sub = subStatCap(type, star, level);
        capRows.push(`  (${q(type)}, ${star}, ${level}, ${main}, ${sub})`);
      }
    }
  }
  push(`-- 到達しうる最大値 ${capRows.length} 行(型 × 星 × 強化)`);
  push("insert into public.arena_catalog_stat_caps (stat_type, star, level, main_max, sub_max) values");
  push(capRows.join(",\n") + ";");
  push();

  /* --- 星ごとの上限 --- */
  push("-- 星ごとのレベル上限と能力ポイントの予算");
  push("insert into public.arena_catalog_star_rules (star, max_level, ability_points) values");
  push(STARS
    .map((star) => `  (${star}, ${STAR_MAX_LEVEL[star]}, ${ABILITY_POINT_BUDGETS[star]})`)
    .join(",\n") + ";");
  push();

  /* --- シリーズ --- */
  push("insert into public.arena_catalog_sets (set_type) values");
  push(SET_TYPES.map((set) => `  (${q(set)})`).join(",\n") + ";");
  push();

  /* --- そのほかの上限 --- */
  const limits: [string, number][] = [
    ["equip_max_level", EQUIP_MAX_LEVEL],
    ["equip_slots", EQUIP_SLOTS.length],
    ["equip_star_max", Math.max(...EQUIP_STARS)],
    ["max_sub_stats", MAX_SUB_STATS],
    ["max_skill_level", MAX_SKILL_LEVEL],
    ["skill_count", 3],
    ["team_size", ARENA_TEAM_SIZE],
    ["star_max", Math.max(...STARS)],
  ];
  push("-- そのほかの上限。**数を2か所に置かないため、ここも生成する**");
  push("insert into public.arena_catalog_limits (key, value) values");
  push(limits.map(([key, value]) => `  (${q(key)}, ${value})`).join(",\n") + ";");
  push();

  return lines.join("\n");
}

/* ==========================================================================
 * 書き出し
 * ========================================================================== */

/** 中身から作る短い指紋。ファイル名に入れて、同じ内容を二度書かないようにする */
function fingerprint(sql: string): string {
  return createHash("sha256").update(sql).digest("hex").slice(0, 8);
}

function existingCatalogFiles(): string[] {
  try {
    return readdirSync(MIGRATIONS_DIR)
      .filter((name) => name.includes(CATALOG_MARK) && name.endsWith(".sql"))
      .sort();
  } catch {
    return [];
  }
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`
    + `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

function main(): void {
  const sql = buildSql() + "\n";
  const mark = fingerprint(sql);
  const files = existingCatalogFiles();
  const current = files.length > 0 ? readFileSync(join(MIGRATIONS_DIR, files[files.length - 1]), "utf8") : null;
  const check = process.argv.includes("--check");

  if (current === sql) {
    console.log(`定義は最新です(${files[files.length - 1]})`);
    return;
  }

  if (check) {
    console.error("ゲームの定義とSQLがずれています。");
    console.error("  npx tsx tools/exportArenaCatalog.mts");
    console.error("を実行して、生成された migration をコミットしてください。");
    process.exit(1);
  }

  mkdirSync(MIGRATIONS_DIR, { recursive: true });
  const name = `${timestamp()}_${CATALOG_MARK}_${mark}.sql`;
  writeFileSync(join(MIGRATIONS_DIR, name), sql, "utf8");
  console.log(`書き出しました: supabase/migrations/${name}`);
  if (files.length > 0) {
    console.log("※ 前の版は消していません。migration は積み上げるものなので、それで正しい。");
  }
}

main();
