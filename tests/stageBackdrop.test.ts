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

  it("隊列が片側2列の千鳥になっている", () => {
    /*
     * 依頼主の示した参考画面(AFK Arena)の構図。
     * 1列に戻すと盤面が倍の深さになり、カメラが引いて1体が半分になる。
     */
    expect(stage, "段ごとに列を替えていない").toMatch(/i % 2 === 0 \? laneGap : 0/);
    const inner = Number(/const LANE_INNER = ([0-9.]+)/.exec(stage)?.[1] ?? "0");
    const gap = Number(/const LANE_GAP = ([0-9.]+)/.exec(stage)?.[1] ?? "0");
    expect(inner, "内側の列が無い").toBeGreaterThan(0);
    expect(gap, "2列に分かれていない").toBeGreaterThan(0.5);
  });

  it("枠が板の幅を丸ごと数えている", () => {
    /*
     * 縦画面で枠を削ってカメラを寄せる細工が入っていた。
     * 千鳥にして外側の列が画面の端まで来たので、削ったぶんだけ
     * **外側の列が画面の外へはみ出した。**
     */
    expect(stage).toMatch(/halfWidth: maxAbsX \+ SPRITE_HALF_WIDTH,/);
  });

  it("エフェクトの大きさが、画面ではなく本体の背丈から決まる", () => {
    /*
     * **片方だけ触らない。**
     *
     * 画面の縦を基準にしていた頃、構図を変えるたびにエフェクトが動いた。
     * 2回続けて壊している。
     *   1. UIの帯を避けて表示範囲を1.35倍にしたら、守りのドームが
     *      本体を丸ごと覆う白い泡になった
     *   2. 隊列を千鳥にして表示範囲が半分になったら、今度は全部が半分になった
     *
     * 本体の背丈に比例させておけば、構図をどう変えても釣り合いが動かない。
     * 画面を覆わないための**上限だけ**は画面の縦から掛ける。
     */
    expect(stage, "本体の背丈から決めていない").toMatch(
      /this\.vfxSizeScale = SPRITE_MAX_HEIGHT \* VFX_PER_SPRITE_HEIGHT/,
    );
    expect(stage, "画面の縦を大きさそのものに使っている").not.toMatch(
      /vfxSizeScale = visibleHeight/,
    );
    // 画面を覆わないための上限は、引き続き画面の縦から掛ける
    expect(stage).toMatch(/setMaxBillboardScale\(visibleHeight \* VFX_MAX_SCREEN_RATIO\)/);
  });
});
