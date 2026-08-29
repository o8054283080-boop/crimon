import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { ELEMENTS } from "../src/core/element.js";
import { ALL_MONSTER_TEMPLATES } from "../src/data/monsters.js";

/*
 * モンスターの2Dの絵まわり。
 *
 * ここで見張るのは主に2つ。
 *
 * 1. **ファイル名の綴りが1文字ずれると、絵は黙って使われない。**
 *    エラーにならず、その種族だけ3Dのまま出る。気づくのは目で見た時だけ。
 * 2. **2Dと3Dは同じ約束事を持たなければならない。**
 *    戦闘画面はどちらが立っているかを気にせず扱うので、片方にだけ
 *    メソッドが足されると、もう片方の種族で実行時に落ちる。
 *    型チェックは `BattleAvatar` の合併型で拾えるが、
 *    「約束事そのものが何だったか」を残しておく方が読み手に親切。
 */

const SPRITE_DIR = "src/web/assets/monsters";
const TEMPLATE_IDS = new Set(ALL_MONSTER_TEMPLATES.map((t) => t.templateId));
const ELEMENT_NAMES = new Set<string>(ELEMENTS);
const POSES = new Set(["attack", "hit", "cast"]);

function spriteFiles(): string[] {
  try {
    return readdirSync(SPRITE_DIR).filter((n) => n.endsWith(".webp"));
  } catch {
    return [];
  }
}

describe("2Dの絵のファイル名", () => {
  it("すべて実在する種族を指している", () => {
    /*
     * `wolves.webp` のような綴り違いは、読み込み側が null を返すだけで
     * 何も言わない。**その種族だけ3Dのまま出る**という壊れ方をする。
     */
    const unknown: string[] = [];
    for (const file of spriteFiles()) {
      const base = file.replace(/\.webp$/, "");
      const parts = base.split("-");
      // <種族> / <種族>-<属性> / <種族>-<属性>-<ポーズ> / <種族>-<ポーズ>
      // 種族名にも `_` は使うが `-` は使わない規約なので、先頭が種族
      const templateId = parts[0];
      if (!TEMPLATE_IDS.has(templateId)) {
        unknown.push(`${file}: 「${templateId}」という種族は無い`);
        continue;
      }
      for (const rest of parts.slice(1)) {
        if (!ELEMENT_NAMES.has(rest) && !POSES.has(rest)) {
          unknown.push(`${file}: 「${rest}」は属性でもポーズでもない`);
        }
      }
    }
    expect(unknown, `使われない絵:\n${unknown.join("\n")}`).toEqual([]);
  });

  it("種族名に「-」を使っていない(ファイル名の区切りと衝突する)", () => {
    const bad = [...TEMPLATE_IDS].filter((id) => id.includes("-"));
    expect(bad, `種族名に「-」がある: ${bad.join(", ")}`).toEqual([]);
  });
});

describe("2Dと3Dの約束事", () => {
  /**
   * 戦闘画面がモンスターに求めること。**ここが2つの実装の契約。**
   * 片方にだけ足すと、絵のある種族と無い種族で挙動が分かれる。
   */
  const CONTRACT = [
    "root",
    "theme",
    "hitArea",
    "setSlotPosition",
    "getAnchorWorldPosition",
    "setActive",
    "setTargeted",
    "setHpRatio",
    "playAttack",
    "playCast",
    "playHit",
    "playDeath",
    "revive",
    "isDying",
    "faceToward",
    "update",
    "dispose",
  ];

  const sources = {
    "3D (monsterAvatar.ts)": readFileSync("src/web/three/monsterAvatar.ts", "utf8"),
    "2D (spriteAvatar.ts)": readFileSync("src/web/three/spriteAvatar.ts", "utf8"),
  };

  for (const [label, source] of Object.entries(sources)) {
    it(`${label} が13個の約束を全部持っている`, () => {
      const missing = CONTRACT.filter((name) => !new RegExp(`(^|[^\\w.])${name}\\b`, "m").test(source));
      expect(missing, `${label} に無い: ${missing.join(", ")}`).toEqual([]);
    });
  }
});

describe("色を寄せる設定", () => {
  it("6属性すべてに色相が決まっている", () => {
    // 1つでも欠けると、その属性のモンスターだけ基本の絵の色のまま出る
    const source = readFileSync("src/web/three/spriteArt.ts", "utf8");
    for (const element of ELEMENTS) {
      expect(source, `ELEMENT_TINT に ${element} が無い`).toContain(`${element}:`);
    }
  });

  it("戦闘画面とカードで、寄せる強さを共有している", () => {
    /*
     * 別々に持つと、カードで見た色と戦闘で見た色が食い違う。
     * 実際に一度、混ぜる方式のまま強さだけ変えて食い違わせている。
     */
    const battle = readFileSync("src/web/three/spriteAvatar.ts", "utf8");
    const card = readFileSync("src/web/three/portrait.ts", "utf8");
    expect(battle).toContain("SPRITE_TINT");
    expect(card).toContain("SPRITE_TINT");
    expect(battle).toContain("ELEMENT_TINT");
    expect(card).toContain("ELEMENT_TINT");
  });
});
