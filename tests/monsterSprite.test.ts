import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { ELEMENTS } from "../src/core/element.js";
import { ALL_MONSTER_TEMPLATES, EXP_PIG, REINCARNATION_PIG, SKILL_PIG } from "../src/data/monsters.js";

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
/*
 * 絵を持てる種族の全部。
 *
 * **ピッグ3種は `ALL_MONSTER_TEMPLATES` に入っていない。**
 * ガチャにもステージにも出ない特別枠なので、そちらの一覧からは外れている。
 * ここでそれを忘れると、正しく置いた絵を「使われない絵」と誤って落とす
 * (実際に一度落ちた)。
 */
const TEMPLATE_IDS = new Set([
  ...ALL_MONSTER_TEMPLATES.map((t) => t.templateId),
  EXP_PIG.templateId,
  REINCARNATION_PIG.templateId,
  SKILL_PIG.templateId,
]);
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
   * 増やす時は必ず両方へ足す。
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
    // 勝利と、演出の畳み込み
    "playVictory",
    "resetMotion",
    // カメラの見下ろし角(2Dは板を倒し、3Dは何もしない)
    "setCameraPitch",
  ];

  const sources = {
    "3D (monsterAvatar.ts)": readFileSync("src/web/three/monsterAvatar.ts", "utf8"),
    "2D (spriteAvatar.ts)": readFileSync("src/web/three/spriteAvatar.ts", "utf8"),
  };

  for (const [label, source] of Object.entries(sources)) {
    it(`${label} が約束事を全部持っている`, () => {
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

  it("6属性すべてに明度の作り方が決まっている", () => {
    // 光を白に、闇を黒にするには明度の指定が要る。
    // 欠けると「色相だけ違う同じ明るさ」になり、光と闇が読めない
    const source = readFileSync("src/web/three/spriteArt.ts", "utf8");
    for (const element of ELEMENTS) {
      const line = source.split("\n").find((l) => l.trim().startsWith(`${element}:`));
      expect(line, `ELEMENT_TINT に ${element} が無い`).toBeDefined();
      expect(line, `${element} に valueMul が無い`).toContain("valueMul");
      expect(line, `${element} に valueAdd が無い`).toContain("valueAdd");
    }
  });

  it("光は明るく、闇は暗くなる向きに設定されている", () => {
    /*
     * 依頼主の指定は「光=白 / 闇=黒、ただし潰さず陰影を残す」。
     * 向きを取り違えると光が黒くなるので、符号だけは機械で見張る。
     */
    const source = readFileSync("src/web/three/spriteArt.ts", "utf8");
    const light = source.split("\n").find((l) => l.trim().startsWith("LIGHT:")) ?? "";
    const dark = source.split("\n").find((l) => l.trim().startsWith("DARK:")) ?? "";
    const valueAdd = (line: string) => Number(/valueAdd:\s*([0-9.]+)/.exec(line)?.[1] ?? "0");
    const valueMul = (line: string) => Number(/valueMul:\s*([0-9.]+)/.exec(line)?.[1] ?? "1");
    expect(valueAdd(light), "光は明度を持ち上げる").toBeGreaterThan(0.05);
    expect(valueMul(dark), "闇は明度を落とす").toBeLessThan(0.7);
    // 真っ黒に潰すと影絵になる。陰影が残る余地を必ず持たせる
    expect(valueMul(dark), "闇を潰しすぎない").toBeGreaterThan(0.15);
  });

  it("転生ピッグは属性で色を変えない", () => {
    const source = readFileSync("src/web/three/spriteArt.ts", "utf8");
    expect(source).toContain("NO_TINT_TEMPLATES");
    expect(source).toContain("reincarnation_pig");
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
