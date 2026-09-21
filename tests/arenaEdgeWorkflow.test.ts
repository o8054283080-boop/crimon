import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/**
 * 精算の Edge Function が本番へ届く道。
 *
 * ## なぜ見張るのか
 *
 * `arena-settle` は**戦闘エンジンとモンスター定義を同梱して動く。**
 * 新しいモンスターや戦闘の直しが main へ入っても流し直さないと、
 * クライアントでは決着しているのにサーバ側の再戦闘が落ち、対戦が OPEN のまま残る
 * ——**挑戦券だけ減って、レートもコインも入らない。**
 * 照合表と同じ「押し忘れが事故になる」形だったので、自動で流すようにしてある。
 *
 * ## ここで見るのは、仕掛けが外れていないことと、スクリプトが通る形か
 *
 * 実際に**壊れたまま3回 main へ入った。**`'^[a-z0-9]{20}$'` の
 * **閉じ引用符が抜けた**まま流れ、そのステップが
 * `unexpected EOF while looking for matching '` で落ちていた。
 * **型検査もテストも yml を見ていない。**押した先は本番なので、
 * 気づくのは「入っていない」と分かってから。
 */

const read = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../.github/workflows/${name}`, import.meta.url)), "utf8");

const EDGE = read("arena-edge.yml");

describe("精算のEdge Functionが本番へ届く道", () => {
  it("精算へ影響するものが main へ入ったら、押さなくても流れる", () => {
    expect(EDGE).toMatch(/on:\s*\n\s*push:\s*\n\s*branches:\s*\[main\]/);
    // 戦闘エンジン・モンスター定義・関数そのもの。どれが動いても流し直す
    for (const path of ["src/core/**", "src/data/**", "src/battle/**", "supabase/functions/arena-settle/**"]) {
      expect(EDGE, `${path} が paths から抜けている`).toContain(path);
    }
  });

  it("同梱するコードを最新にしてから deploy する", () => {
    const build = EDGE.indexOf("npm run build:edge");
    const deploy = EDGE.indexOf("functions deploy arena-settle");
    expect(build, "build:edge が無い").toBeGreaterThan(-1);
    expect(deploy, "deploy のステップが無い(消えても成功と出る)").toBeGreaterThan(-1);
    // 順が逆だと、古い `_shared` を積んだまま本番へ入る
    expect(build).toBeLessThan(deploy);
  });

  it("鍵が無い時は、黙って素通りせずに落とす", () => {
    expect(EDGE).toContain("SUPABASE_ACCESS_TOKEN が未登録です");
  });

  it("流した後、本当に入ったかを確かめる", () => {
    expect(EDGE).toContain("functions list --project-ref");
  });

  it("接続先は公開設定から取る(二重管理しない)", () => {
    expect(EDGE).toContain(".env.production");
    // 取り違えたまま流さないよう、形を検める
    expect(EDGE).toContain("Supabase project ref の抽出に失敗しました");
  });

  it("同時に2本流れないようにしてある", () => {
    expect(EDGE).toMatch(/concurrency:\s*\n\s*group:/);
  });
});

/**
 * **`run:` のスクリプトが、シェルとして通る形か。**
 *
 * 実際に壊れたまま3回 main へ入っている。`'^[a-z0-9]{20}$'` の
 * **閉じ引用符が抜けた**まま流れ、そのステップが
 * `unexpected EOF while looking for matching '` で落ちていた。
 *
 * **型検査もテストも yml を見ていない。**押してみるまで分からず、
 * 押した先は本番なので、気づくのは「入っていない」と分かってから。
 * ここで `bash -n` に通しておけば、手元で落ちる。
 */
function runBlocks(source: string): string[] {
  const lines = source.split("\n");
  const blocks: string[] = [];
  let current: string[] | null = null;
  let indent: number | null = null;

  for (const line of lines) {
    if (indent !== null && current !== null) {
      const depth = line.length - line.trimStart().length;
      if (line.trim() !== "" && depth <= indent) {
        blocks.push(current.join("\n"));
        current = null;
        indent = null;
      } else {
        current.push(line.slice(Math.min(indent + 2, line.length)));
        continue;
      }
    }
    const head = /^(\s*)run:\s*\|/.exec(line);
    if (head) {
      indent = head[1].length;
      current = [];
    }
  }
  if (current !== null) blocks.push(current.join("\n"));
  return blocks;
}

describe("ワークフローのスクリプトがシェルとして通る", () => {
  for (const name of ["arena-edge.yml", "arena-catalog.yml"]) {
    it(`${name} の run が、どれも構文として正しい`, () => {
      const blocks = runBlocks(read(name));
      expect(blocks.length, `${name} に run: | が1つも無い`).toBeGreaterThan(0);

      for (const [index, block] of blocks.entries()) {
        // `${{ ... }}` は GitHub が先に差し替える。シェルから見れば ただの文字列
        const script = block.replace(/\$\{\{[^}]*\}\}/g, "GHA_EXPR");
        let error: string | null = null;
        try {
          execFileSync("bash", ["-n"], { input: script, stdio: ["pipe", "pipe", "pipe"] });
        } catch (e) {
          error = String((e as { stderr?: Buffer }).stderr ?? e).trim();
        }
        expect(error, `${name} の ${index + 1} 番目の run が壊れている`).toBeNull();
      }
    });

    it(`${name} のトップレベルの項目が揃っている`, () => {
      const source = read(name);
      for (const key of ["name:", "on:", "jobs:"]) {
        expect(source, `${key} が無い`).toMatch(new RegExp(`^${key}`, "m"));
      }
      // 書き込む先が本番なので、要る権限だけに絞ってあること
      expect(source).toMatch(/^permissions:/m);
    });
  }
});

/*
 * **この見張りが骨抜きになっていないこと。**
 *
 * 実際に起きた壊れ方(閉じ引用符の抜け)を、そのままの形で通してみる。
 * ここが緑のまま通ってしまうなら、上の検査は何も守っていない。
 */
describe("壊れたスクリプトを、ちゃんと落とせる", () => {
  it("閉じ引用符が抜けた run を拾う", () => {
    const broken = [
      "jobs:",
      "  deploy:",
      "    steps:",
      "      - name: 取得",
      "        run: |",
      "          set -euo pipefail",
      // 実際に main へ3回入った形。`$` の後で改行し、引用符が閉じていない
      "          if ! printf '%s' \"$ref\" | grep -Eq '^[a-z0-9]{20}$",
      "      - name: deploy",
      "        run: echo ok",
    ].join("\n");

    const blocks = runBlocks(broken);
    expect(blocks.length).toBeGreaterThan(0);

    let caught = false;
    for (const block of blocks) {
      try {
        execFileSync("bash", ["-n"], { input: block, stdio: ["pipe", "pipe", "pipe"] });
      } catch {
        caught = true;
      }
    }
    expect(caught, "壊れたスクリプトを見逃している").toBe(true);
  });
});
