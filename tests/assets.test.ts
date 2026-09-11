import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, extname } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 画像の置き場所を見張る。
 *
 * ## なぜ要ったのか
 *
 * 調べたら、**使われていない画像が5枚、置き場所の重複が1組**あった。
 *
 *   art/monsters-raw/       27MB  配信しない生PNG(リポジトリの半分)
 *   src/assets/             4枚   src/web/assets/home/ と中身が同じ重複
 *   app-icon.png            2.1MB どこからも参照されない元画像
 *   home-bottom-nav-frame-v2/v3   v5 だけ使われていた
 *
 * どれも**置いた時は意味があった**ものが、使われなくなった後も残った形。
 * 人が気づくのは難しい(2.1MBの画像が1年近く紛れていた)ので、機械に見張らせる。
 *
 * ## 見張るもの
 *
 *   1. 直下に画像を置かない(用途のフォルダへ入れる)
 *   2. どこからも参照されない画像を置かない
 *   3. 配信する画像を `art/`(元素材)へ置かない
 *   4. モンスターの絵の名前が、引く時の規則と合っている
 */

const ASSET_DIR = "src/web/assets";
const IMAGE_EXT = /\.(webp|jpg|jpeg|png|svg|gif|avif)$/i;

/**
 * git が知っているファイルだけを見る(ビルド成果物や作業中のものを拾わない)。
 *
 * **`-z` で区切る。**既定の `git ls-files` は非ASCIIの名前を
 * `"src/.../\343\201\237..."` とクォートして出すので、日本語名のファイルが
 * 拡張子の判定から漏れる。**試しに日本語名の未使用画像を置いたら、
 * このテストが素通りした。**見張りに穴が空いていた。
 */
function trackedFiles(): string[] {
  return execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
}

const TRACKED = trackedFiles();
const IMAGES = TRACKED.filter((f) => IMAGE_EXT.test(f));

/**
 * 使われていないが、理由があって残している画像。
 *
 * **理由を書くこと。**理由なく残っていると、次に触る人が
 * 消していいのか判断できず、そのまま増え続ける。
 */
const KEEP_UNUSED: Record<string, string> = {
  "src/web/assets/brand/crimon-emblem.svg": "ブランドの紋章。画面で使う時に備えて一式で残す",
  "src/web/assets/brand/crimon-logo.svg": "ブランドのロゴ。同上",
  "src/web/assets/brand/crimon-tower-hero.svg": "試練の塔の見出し絵。同上",
};

function readAll(files: string[]): string {
  return files.map((f) => {
    try { return readFileSync(f, "utf8"); } catch { return ""; }
  }).join("\n");
}

const CODE_LIKE = (f: string) => /\.(ts|tsx|js|mjs|mts|css|html|json)$/i.test(f) && !f.startsWith("art/");

/**
 * アプリ本体(画面に出るもの)。ここから参照されない画像が「使われていない画像」。
 *
 * **`tools/` と `docs/` は分ける。**元素材はアプリからは参照されないが、
 * 道具(アイコンを焼く等)からは参照される。混ぜると、
 * **元素材を `art/` へ移した途端に「配信に混ざっている」と誤判定する。**
 */
const HAYSTACK = readAll(TRACKED.filter((f) => CODE_LIKE(f) && !f.startsWith("tools/") && !f.startsWith("docs/")));

/** 道具と文書。元素材を指してよい側 */
const TOOLING = readAll(TRACKED.filter((f) => (CODE_LIKE(f) || f.endsWith(".md")) && (f.startsWith("tools/") || f.startsWith("docs/"))));

describe("画像は用途のフォルダに入れる", () => {
  it("assets の直下に画像を置いていない", () => {
    const loose = readdirSync(ASSET_DIR)
      .filter((name) => IMAGE_EXT.test(name) && statSync(`${ASSET_DIR}/${name}`).isFile());
    expect(loose, `直下にある画像: ${loose.join(", ")}`).toEqual([]);
  });

  it("置き場所は決めた6つだけ", () => {
    const dirs = readdirSync(ASSET_DIR).filter((name) => statSync(`${ASSET_DIR}/${name}`).isDirectory());
    expect([...dirs].sort()).toEqual(["backgrounds", "brand", "cards", "home", "monsters", "stages"]);
  });

  /*
   * **置き場所が2つに割れていた。**`src/assets/home/` に4枚あり、
   * `src/web/assets/home/` に中身の同じ4枚があった。
   * 参照されていたのは後者だけで、前者は丸ごと死んでいた。
   */
  it("配信する画像は src/web/assets だけに置く", () => {
    const stray = IMAGES.filter((f) =>
      f.startsWith("src/") && !f.startsWith(`${ASSET_DIR}/`));
    expect(stray, `よその場所にある画像: ${stray.join(", ")}`).toEqual([]);
  });
});

describe("使われていない画像を置かない", () => {
  it("どこからも参照されない画像が無い", () => {
    const unused = IMAGES
      .filter((f) => f.startsWith(`${ASSET_DIR}/`))
      .filter((f) => !(f in KEEP_UNUSED))
      .filter((f) => {
        const name = basename(f);
        const stem = name.slice(0, name.length - extname(name).length);
        // ファイル名そのものか、拡張子を外した名前(sprites.json のキー等)で探す
        return !HAYSTACK.includes(name) && !HAYSTACK.includes(stem);
      });
    expect(unused, `使われていない画像:\n  ${unused.join("\n  ")}`).toEqual([]);
  });

  it("残す理由を書いた画像は、実際に存在する", () => {
    for (const [path, reason] of Object.entries(KEEP_UNUSED)) {
      expect(TRACKED, `${path} は消えている。KEEP_UNUSED からも外すこと`).toContain(path);
      expect(reason.length, `${path} の理由が短すぎる`).toBeGreaterThan(5);
    }
  });
});

/**
 * 元素材は `art/` へ。
 *
 * 生PNGは1枚2MB前後ある。配信されないのにビルドとリポジトリを重くするので、
 * **画面に出す絵と同じ場所に置かない。**
 */
describe("元素材と配信する画像を混ぜない", () => {
  it("art の生PNGは、対応するwebpが配信側にある", () => {
    const raws = TRACKED.filter((f) => f.startsWith("art/monsters-raw/") && f.endsWith(".png"));
    expect(raws.length, "生PNGが1枚も無い").toBeGreaterThan(0);
    const missing = raws.filter((f) => {
      const stem = basename(f, ".png");
      return !TRACKED.includes(`${ASSET_DIR}/monsters/${stem}.webp`);
    });
    expect(missing, `webpに変換されていない生PNG: ${missing.join(", ")}`).toEqual([]);
  });

  it("art の中身がアプリ本体から参照されていない", () => {
    const referenced = TRACKED
      .filter((f) => f.startsWith("art/") && IMAGE_EXT.test(f))
      .filter((f) => HAYSTACK.includes(basename(f)));
    expect(referenced, `配信に混ざっている元素材: ${referenced.join(", ")}`).toEqual([]);
  });

  /*
   * **アイコンの元絵は、道具が名指しで使う。**
   *
   * 画面から参照されていないので「未使用」に見えるが、
   * `tools/bakeAppIcons.mjs` が `public/icons/*` を焼く元にしている。
   * 実際にこれを見落として art/ へ移し、**道具を黙って壊した。**
   * 移したら道具のパスも直すこと。ここがそれを見張る。
   */
  it("アイコンの元絵を、焼く道具が正しく指している", () => {
    const source = readFileSync("tools/bakeAppIcons.mjs", "utf8");
    const match = source.match(/const SOURCE = "([^"]+)"/);
    expect(match, "bakeAppIcons.mjs が元絵を指していない").not.toBeNull();
    expect(TRACKED, `元絵 ${match?.[1]} が無い`).toContain(match?.[1]);
  });

  it("道具から参照される元素材は、art に置かれている", () => {
    const fromTooling = TRACKED
      .filter((f) => IMAGE_EXT.test(f) && TOOLING.includes(basename(f)))
      .filter((f) => f.startsWith(`${ASSET_DIR}/`));
    expect(fromTooling, `道具が使う元素材が配信側にある: ${fromTooling.join(", ")}`).toEqual([]);
  });
});

/**
 * モンスターの絵は**名前だけで引かれる**(`spriteUrlFor`)。
 * 名前が規則から外れると、そのモンスターだけ絵が出ない。
 */
describe("モンスターの絵の名前", () => {
  const MONSTER_FILES = readdirSync(`${ASSET_DIR}/monsters`).filter((f) => f.endsWith(".webp"));

  it("すべて小文字の種族名で始まる(属性は大文字)", () => {
    const bad = MONSTER_FILES.filter((f) => !/^[a-z][a-z0-9_]*(-(?:FIRE|WATER|ELECTRIC|GRASS|LIGHT|DARK))?(-(?:idle|attack|hit|cast))?\.webp$/.test(f));
    expect(bad, `規則から外れた名前: ${bad.join(", ")}`).toEqual([]);
  });

  it("sprites.json のキーが、実在するファイル名と一致する", () => {
    const manifest = JSON.parse(readFileSync(`${ASSET_DIR}/monsters/sprites.json`, "utf8")) as Record<string, unknown>;
    const stems = new Set(MONSTER_FILES.map((f) => f.replace(/\.webp$/, "")));
    const orphan = Object.keys(manifest).filter((key) => !stems.has(key));
    expect(orphan, `実体の無いキー: ${orphan.join(", ")}`).toEqual([]);
  });
});

/**
 * 置き場所の決まりは README に書いてある。
 * **書いていないと、次に足す人が直下へ置く。**
 */
describe("置き場所の決まりが書いてある", () => {
  it("assets と art に README がある", () => {
    expect(TRACKED).toContain(`${ASSET_DIR}/README.md`);
    expect(TRACKED).toContain("art/README.md");
  });

  it("READMEに6つのフォルダが全部載っている", () => {
    const readme = readFileSync(`${ASSET_DIR}/README.md`, "utf8");
    for (const dir of ["monsters", "home", "stages", "backgrounds", "cards", "brand"]) {
      expect(readme, `${dir} の説明が無い`).toContain(`\`${dir}/\``);
    }
  });

  /*
   * **枚数も見張る。**書いてある数と実際がずれると、README が嘘をつく。
   * 嘘の書いてある目録は、無い目録より悪い(読んだ人が数え直すことになる)。
   * 画像を足したら README の数も直すこと。
   */
  it("READMEの枚数が実際と合っている", () => {
    const readme = readFileSync(`${ASSET_DIR}/README.md`, "utf8");
    for (const dir of ["monsters", "home", "stages", "backgrounds", "cards", "brand"]) {
      const actual = readdirSync(`${ASSET_DIR}/${dir}`).filter((f) => IMAGE_EXT.test(f)).length;
      const row = readme.split("\n").find((line) => line.includes(`\`${dir}/\``));
      const written = Number(row?.split("|").at(-2)?.trim());
      expect(written, `${dir}/ は実際 ${actual} 枚。READMEの数を直すこと`).toBe(actual);
    }
  });
});
