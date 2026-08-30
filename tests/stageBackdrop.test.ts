import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { ELEMENTS } from "../src/core/element.js";

/*
 * 戦闘の舞台を1枚絵にした部分の見張り。
 *
 * ここも型チェックでは何も落ちない。**背景が出ない時、画面は真っ黒になる。**
 * 例外も警告も出ないので、目で見るまで気づけない。実際に一度、
 * 板をカメラの far の外側(300)へ置いて真っ黒にしている。
 */

const STAGE_DIR = "src/web/assets/stages";

function stageFiles(): string[] {
  try {
    return readdirSync(STAGE_DIR).filter((n) => n.endsWith(".webp"));
  } catch {
    return [];
  }
}

describe("戦闘背景のファイル名", () => {
  it("すべて読み込み側が知っている名前になっている", () => {
    /*
     * 綴りが1文字ずれると、読み込み側は代役(闘技場)へ落ちる。
     * **エラーにならず、その属性だけ違う舞台で戦う**という壊れ方をする。
     */
    const source = readFileSync("src/web/three/stageBackdrop.ts", "utf8");
    const unknown: string[] = [];
    for (const file of stageFiles()) {
      const name = file.replace(/\.webp$/, "");
      if (!source.includes(`"${name}"`)) unknown.push(`${file}: 読み込み側に「${name}」が無い`);
    }
    expect(unknown, `使われない背景:\n${unknown.join("\n")}`).toEqual([]);
  });

  it("6属性すべてに背景の名前が割り当ててある", () => {
    // 1つでも欠けると、その属性だけ実行時に undefined を引く
    const source = readFileSync("src/web/three/stageBackdrop.ts", "utf8");
    for (const element of ELEMENTS) {
      expect(source, `ELEMENT_BACKDROP に ${element} が無い`).toMatch(new RegExp(`${element}:\\s*"arena-`));
    }
  });
});

describe("背景の板の置き方", () => {
  const source = readFileSync("src/web/three/stageBackdrop.ts", "utf8");

  it("カメラの far より内側に置く", () => {
    /*
     * **深度を切っても、far の外は投影の段階で捨てられる。**
     * カメラの far は盤面の広さから160前後に決まるので、
     * ここが100を超えたら画面が真っ黒になる可能性がある。
     */
    const distance = Number(/const BACKDROP_DISTANCE = ([0-9.]+)/.exec(source)?.[1] ?? "0");
    expect(distance, "BACKDROP_DISTANCE が読めない").toBeGreaterThan(0);
    expect(distance, "far(160前後)の外側に置くと真っ黒になる").toBeLessThan(100);
    // near は 0.1。それより近いと今度は手前で切られる
    expect(distance).toBeGreaterThan(0.1);
  });

  it("深度を切って、いちばん先に描く", () => {
    // 深度で奥へ回すのではなく、描く順で奥にしている。両方が揃って初めて成立する
    expect(source).toContain("depthTest: false");
    expect(source).toContain("depthWrite: false");
    expect(source).toMatch(/renderOrder = -\d+/);
  });

  it("画面外と判定されて消えないようにしてある", () => {
    // カメラの子は境界の計算が効かず、視錐台の外と誤判定されることがある
    expect(source).toContain("frustumCulled = false");
  });
});

describe("背景と盤面の釣り合い", () => {
  const stage = readFileSync("src/web/three/battleStage.ts", "utf8");

  it("背景を出す時は3Dの闘技場を組まない", () => {
    // 両方出すと、絵の後ろに隠れる列柱や観客席を描き続けることになる
    expect(stage).toMatch(/this\.arena = this\.backdrop \? null : createArena/);
  });

  it("UIが覆う帯を避けて盤面を収める", () => {
    /*
     * 5体の戦い(装備ダンジョン)で、いちばん手前と奥の1体が
     * 階層名とスキルの操作欄の下へ潜って見えなくなっていた。
     */
    const top = Number(/const SAFE_BAND_TOP = ([0-9.]+)/.exec(stage)?.[1] ?? "0");
    const bottom = Number(/const SAFE_BAND_BOTTOM = ([0-9.]+)/.exec(stage)?.[1] ?? "0");
    expect(top, "上の帯が無い").toBeGreaterThan(0.03);
    expect(bottom, "下の帯が無い").toBeGreaterThan(0.08);
    // 避けすぎると盤面が潰れる。合計で3分の1を超えないこと
    expect(top + bottom).toBeLessThan(0.34);
  });

  it("エフェクトの基準が、広げた表示範囲に合わせてある", () => {
    /*
     * **片方だけ触らない。**
     * 帯を避けて表示範囲を広げると、画面の縦を基準にしたエフェクトだけが
     * 勝手に大きくなる。守りのドームが本体を丸ごと覆う白い泡になった。
     * 装備の速度と敵の速度カーブの時と同じ事故。
     */
    const reference = Number(/const VFX_REFERENCE_HEIGHT = ([0-9.]+)/.exec(stage)?.[1] ?? "0");
    expect(reference, "VFX_REFERENCE_HEIGHT が読めない").toBeGreaterThan(0);
    // 帯を避けたぶん(約1.35倍)と、絵を縮めたぶん(0.88)の積を織り込んだ値
    expect(reference, "エフェクトが本体より大きくなる").toBeGreaterThan(55);
  });
});
