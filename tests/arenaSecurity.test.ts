import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

/*
 * アリーナの守り。**SQLは実行できないので、書いてあることを見張る。**
 *
 * ## なぜ「本文を読む」形なのか
 *
 * ここで守りたいのは「誰が何を呼べるか」で、それは grant / revoke の
 * 1行が決めている。**1行消えただけで穴になる**のに、消えても
 * 型チェックもテストも通ってしまう。だから本文そのものを見る。
 *
 * DBを立てて実際に叩くのが理想だが、それはCIにPostgresを載せる話になる。
 * ここで拾えるのは「約束が書かれているか」まで——それでも、
 * この案件で実際に起きた事故(**片方だけ直された**)は全部拾える。
 */

const MIGRATIONS = fileURLToPath(new URL("../supabase/migrations", import.meta.url));
const files = readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql")).sort();
const sql = files.map((name) => readFileSync(join(MIGRATIONS, name), "utf8")).join("\n");
const integrity = readFileSync(
  join(MIGRATIONS, files.find((n) => n.includes("match_integrity"))!), "utf8");

describe("migration の並び", () => {
  it("すべてタイムスタンプ形式になっている", () => {
    /*
     * 本番には既に migration の履歴がある。`0001_` のような番号だと
     * **既存の履歴の間に割り込む形になり、順番が決まらない。**
     */
    for (const name of files) {
      expect(name, `${name} がタイムスタンプ形式でない`).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
    }
  });

  it("照合表より後にRPCが来る", () => {
    // RPC は `arena_catalog_*` を読む。先に流れると存在しない表を指す
    const catalog = files.findIndex((n) => n.includes("catalog"));
    const rpc = files.findIndex((n) => n.includes("rpc"));
    const integrityAt = files.findIndex((n) => n.includes("match_integrity"));
    expect(catalog).toBeGreaterThan(-1);
    expect(rpc).toBeGreaterThan(catalog);
    expect(integrityAt).toBeGreaterThan(catalog);
  });

  it("何度流しても壊れない書き方になっている", () => {
    // 本番の履歴がどうなっていても積めるように
    expect(sql).toContain("create table if not exists");
    expect(sql).not.toMatch(/\ncreate table public\./);
    expect(sql).not.toMatch(/\ncreate function public\./);
  });
});

describe("勝敗を申告する道が無いこと", () => {
  it("精算は service_role にしか許していない", () => {
    /*
     * **これがこの案件でいちばん大事な1行。**
     * authenticated に渡すと、Edge Function を通さずに
     * 「勝った」と言えるようになる。
     */
    expect(integrity).toContain(
      "revoke execute on function public.arena_settle_match(uuid, boolean, integer) from public, anon, authenticated;");
    expect(integrity).toContain(
      "grant execute on function public.arena_settle_match(uuid, boolean, integer) to service_role;");
  });

  it("自己申告の旧RPCは誰にも実行させない", () => {
    // 消さずに閉じる。消すと古いクライアントが静かに失敗して原因が見えない
    expect(integrity).toMatch(
      /revoke execute on function\s*\n?\s*public\.arena_report_match\(text, boolean, uuid, text, text, integer\)\s*\n?\s*from public, anon, authenticated;/);
    expect(integrity).toContain("SELF_REPORT_DISABLED");
  });

  it("記録の一本道も内部専用にしてある", () => {
    // 直接呼べると、発行を通さずに戦績を作れる
    expect(integrity).toMatch(
      /revoke execute on function\s*\n?\s*public\.arena__record_match\([^)]*\)\s*\n?\s*from public, anon, authenticated;/);
    expect(integrity).not.toMatch(/grant execute on function\s*\n?\s*public\.arena__record_match/);
  });

  it("乱数の種はサーバが作る", () => {
    // クライアントに選ばせると、勝つまで引き直せる
    expect(integrity).toContain("v_seed := (('x' || substr(replace(gen_random_uuid()");
    expect(integrity).not.toContain("p_battle_seed");
  });

  it("置き場所が環境で変わる拡張に頼らない", () => {
    /*
     * `gen_random_bytes` は pgcrypto の関数で、スキーマの置き場所が環境で違う。
     * `set search_path = ''` にしてあるので場所を書く必要があり、
     * **書いた場所と違えばその場で落ちる。**
     * `gen_random_uuid()` は組み込みなので、どこにも依存しない。
     */
    const statements = integrity
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("*") && !line.trimStart().startsWith("--"))
      .join("\n");
    expect(statements).not.toContain("extensions.");
    expect(statements).not.toContain("gen_random_bytes");
  });

  it("照合表は読めるが、書き換えられない", () => {
    // ここを書き換えられると、検分そのものを緩められる
    for (const table of ["monsters", "latents", "slot_mains", "stat_caps", "star_rules", "sets", "limits"]) {
      expect(integrity, `arena_catalog_${table} の revoke`)
        .toMatch(new RegExp(`revoke all on public\\.arena_catalog_${table}\\s+from anon, authenticated;`));
      expect(integrity, `arena_catalog_${table} の grant`)
        .toMatch(new RegExp(`grant select on public\\.arena_catalog_${table}\\s+to anon, authenticated;`));
    }
  });

  it("対戦の卓そのものは誰にも触らせない", () => {
    expect(integrity).toContain("alter table public.arena_match_sessions enable row level security;");
    expect(integrity).toContain("revoke all on public.arena_match_sessions from anon, authenticated;");
  });
});

describe("編成の検分", () => {
  it("防衛も攻撃も、同じ検分を通る", () => {
    // 片方だけ緩いと、そこから抜ける
    const setDefense = integrity.slice(integrity.indexOf("function public.arena_set_defense"));
    expect(setDefense).toContain("public.arena__validate_snapshot(p_snapshot)");
    const begin = integrity.slice(integrity.indexOf("function public.arena_begin_match"));
    expect(begin).toContain("public.arena__validate_snapshot(p_attacker_snapshot)");
  });

  it("依頼で挙がった項目をすべて見ている", () => {
    /*
     * 図鑑ID(属性込み)・★・Lv・能力ポイント・スキル・潜在覚醒・
     * 装備6枠・レアリティ・強化値・メインOP・サブOP。
     * どれか1つ抜けると、そこだけ盛り放題になる。
     */
    for (const marker of [
      "UNKNOWN_DEX_ID",            // 図鑑IDと属性
      "INVALID_STAR",              // ★
      "INVALID_LEVEL",             // Lv(星ごとの上限)
      "ABILITY_POINTS_OVER_BUDGET",// 能力ポイント
      "INVALID_SKILL_LEVEL",       // スキル
      "UNKNOWN_LATENT",            // 潜在覚醒
      "DUPLICATE_EQUIP_SLOT",      // 装備6枠(重複)
      "INVALID_EQUIP_STAR",        // レアリティ
      "INVALID_EQUIP_LEVEL",       // 強化値
      "UNKNOWN_SET",               // シリーズ
      "INVALID_MAIN_STAT_FOR_SLOT",// メインOPの型
      "MAIN_STAT_OVER_CAP",        // メインOPの値
      "DUPLICATE_SUB_STAT",        // サブOPの重複
      "SUB_STAT_OVER_CAP",         // サブOPの値
      "INVALID_MONSTER_TYPE",      // タイプ転生
    ]) {
      expect(integrity, `${marker} を見ていない`).toContain(marker);
    }
  });

  it("定義表が無い環境では通さない", () => {
    // 何も検分できていないのに通すのが、いちばん悪い
    expect(integrity).toContain("CATALOG_MISSING");
  });

  it("上限は表から引く。**検分の中に数字を書かない**", () => {
    const body = integrity.slice(
      integrity.indexOf("function public.arena__validate_snapshot"),
      integrity.indexOf("comment on function public.arena__validate_snapshot"));
    for (const key of ["max_skill_level", "skill_count", "equip_max_level", "max_sub_stats", "team_size"]) {
      expect(body, `${key} を表から引いていない`).toContain(`key = '${key}'`);
    }
  });
});

describe("自分と他人の切り分け", () => {
  it("対戦候補から自分を外すのは auth.uid()", () => {
    // クライアントの `user_id=neq.<申告>` は、申告を変えれば外れる
    expect(integrity).toContain("s.user_id <> auth.uid()");
  });

  it("精算できるのは対戦の持ち主だけ", () => {
    const edge = readFileSync(
      fileURLToPath(new URL("../supabase/functions/arena-settle/index.ts", import.meta.url)), "utf8");
    expect(edge).toContain("NOT_YOUR_MATCH");
    // JWT を自前で読まない。署名の検証を間違えると誰でも誰にでもなれる
    expect(edge).toContain("/auth/v1/user");
  });

  it("二度は精算しない", () => {
    expect(integrity).toContain("ALREADY_SETTLED");
    expect(integrity).toContain("MATCH_EXPIRED");
  });
});

describe("security definer の書き方", () => {
  it("すべて search_path を空にしている", () => {
    /*
     * `security definer` は定義者の権限で動く。`search_path` を
     * 空にしないと、呼ぶ側が同じ名前の関数を自分のスキーマへ置くだけで
     * **その関数が定義者の権限で走る。**
     *
     * **数を数えるだけでは駄目だった。** 最初はファイル全体で
     * "security definer" を数えていて、注釈の中に出てくる同じ言葉まで
     * 拾い、5件が守られていないと報告した。実際は全部守られていた。
     * 関数の定義そのものを取り出して、その中で見る。
     */
    const bodies = [...sql.matchAll(
      /create or replace function public\.([a-z_0-9]+)\(([\s\S]*?)\bas \$\$/g)];
    expect(bodies.length, "関数の定義が1つも取れていない").toBeGreaterThan(10);

    const unguarded: string[] = [];
    for (const [, name, head] of bodies) {
      if (!/^\s*security definer\s*$/m.test(head)) continue;
      if (!/^\s*set search_path = ''\s*$/m.test(head)) unguarded.push(name);
    }
    expect(unguarded).toEqual([]);
  });

  it("すべてのアリーナ表で行レベルの守りが入っている", () => {
    const tables = [...sql.matchAll(/create table if not exists public\.(arena_[a-z_]+)/g)]
      .map((m) => m[1]);
    expect(tables.length).toBeGreaterThan(10);
    /*
     * 表の名前は桁を揃えて書いてあるので(`public.arena_config     enable ...`)、
     * 文字列そのままでは一致しない。**空白は数えない。**
     */
    const enabled = new Set(
      [...sql.matchAll(/alter table public\.(arena_[a-z_]+)\s+enable row level security;/g)]
        .map((m) => m[1]));
    for (const table of tables) {
      // 照合表は定義そのもの(誰が読んでも困らない)なので、読みだけ開ける
      if (table.startsWith("arena_catalog_")) continue;
      expect(enabled.has(table), `${table} に RLS が入っていない`).toBe(true);
    }
  });
});

describe("秘密の鍵がフロントに無いこと", () => {
  const front = readdirSync(fileURLToPath(new URL("../src", import.meta.url)), { recursive: true })
    .filter((name): name is string => typeof name === "string" && name.endsWith(".ts"))
    .map((name) => readFileSync(join(fileURLToPath(new URL("../src", import.meta.url)), name), "utf8"))
    .join("\n");

  it("service_role のキーを src/ が一切知らない", () => {
    /*
     * **1か所でも入ると、他の守りが全部無意味になる。**
     * ここに置いてよいのは anon key だけ(公開前提の鍵)。
     */
    expect(front).not.toContain("SERVICE_ROLE");
    expect(front).not.toContain("service_role");
  });

  it("使ってよい環境変数は URL と anon key だけ", () => {
    expect(front).toContain("VITE_SUPABASE_URL");
    expect(front).toContain("VITE_SUPABASE_ANON_KEY");
    expect(front).not.toMatch(/VITE_[A-Z_]*SECRET/);
  });
});
