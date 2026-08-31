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

  it("段の間隔に、本体の背丈とHPの札の両方が収まる", () => {
    /*
     * 依頼主から**「HPバーがモンスターと被っている」**という指摘を受けた。
     *
     * 段の間隔・絵の表示倍率・列の隔たり・札の高さは、**4つで1組**。
     * どれか1つを触ると、画面上の余地が変わって必ずまた被る。
     * 目で見て気づくしかない類の壊れ方なので、ここで数値にして見張る。
     *
     * 計算は縦持ちの実機(390×844)に対して行う。横持ちは廃止済み。
     */
    const sprite = readFileSync("src/web/three/spriteAvatar.ts", "utf8");
    const num = (source: string, name: string) =>
      Number(new RegExp(`const ${name} = ([0-9.]+)`).exec(source)?.[1] ?? "0");

    const rung = num(stage, "RUNG");
    const laneInner = num(stage, "LANE_INNER");
    const laneGap = num(stage, "LANE_GAP");
    const spriteHalfWidth = num(stage, "SPRITE_HALF_WIDTH");
    const safeTop = num(stage, "SAFE_BAND_TOP");
    const safeBottom = num(stage, "SAFE_BAND_BOTTOM");
    const scale = num(sprite, "SPRITE_SCALE");
    for (const [name, value] of Object.entries({ rung, laneInner, laneGap, spriteHalfWidth, scale })) {
      expect(value, `${name} が読めない`).toBeGreaterThan(0);
    }

    const screenW = 390;
    const screenH = 844;
    const aspect = screenW / screenH;
    // 見下ろし角44〜48度ぶんの、奥行き→画面の縦への変換率(battleStage の TILT_COS と対)
    const tiltUp = 0.695;
    const padding = 1.06;
    const seats = 5;

    // 盤面の広さ。幅と縦の必要量を出し、大きい方が表示範囲を決める
    const halfWidthNeed = (laneInner + laneGap + spriteHalfWidth) * padding;
    const halfDepth = ((seats - 1) * rung) / 2;
    const spriteHeight = 2.95 * scale; // いちばん背の高いボスを基準にする
    const boardUp = (spriteHeight / 0.70) * 0.719 + (halfDepth + 0.3) * tiltUp + 0.3 * 0.719 + (halfDepth + 0.3) * tiltUp;
    const halfHeightNeed = (boardUp / 2) * padding / (1 - safeTop - safeBottom);

    const halfW = Math.max(halfWidthNeed, halfHeightNeed * aspect);
    const pxPerWorld = screenW / (2 * halfW);

    // ディフェンダー(背丈2.45)がいちばん幅を食う。段の中身はこれで測る
    const bodyPx = 2.45 * scale * pxPerWorld;
    const rungPx = rung * tiltUp * pxPerWorld;
    /*
     * 札の高さ。style.css の `.unit-hud--slim` の実寸から積む。
     *   状態異常18 + 隙間2 + HP 7 + 隙間2 + ゲージ4 = 33
     * 本体の頭との隙間(HUD_HEAD_GAP)16pxを足して49px。
     *
     * 隙間は2度上げている。数字の上では重なっていなくても、
     * 羽や角の輪郭はぼけているので**触れていなくても近く見える。**
     * 実機を見た依頼主の指摘で 4 → 8 → 16 と広げた。
     */
    const plateHeightPx = 49;

    expect(
      Math.round(rungPx - bodyPx),
      `段の間隔${rungPx.toFixed(0)}pxに、本体${bodyPx.toFixed(0)}px＋札${plateHeightPx}pxが入らない`,
    ).toBeGreaterThanOrEqual(plateHeightPx);
  });

  it("HPの札は、モーションで動かない立ち位置から置く", () => {
    /*
     * 依頼主から**「キャラの位置が動いていて見づらい」**という指摘を受けた。
     * 本体の現在位置に札を合わせていたので、待機の漂いと攻撃の踏み込みが
     * そのまま札へ伝わり、画面全体がガタついていた。
     *
     * ダメージの数字は殴られた場所に出したいので、あちらは追従したまま。
     * **2つを取り違えると、直したはずの揺れが戻る。**
     */
    const view = readFileSync("src/web/views/battleView.ts", "utf8");
    expect(view, "札の縦位置が本体の現在位置のまま").toMatch(/let top = anchor\.slotY/);
    expect(view, "札の横位置が本体の現在位置のまま").toMatch(/Math\.max\(HUD_EDGE \+ width \/ 2, anchor\.slotX\)/);
    // 並び順も動かない値から決める。現在位置だと漂いで順序が入れ替わって札が飛ぶ
    expect(view, "並び順が本体の現在位置のまま").toMatch(/sort\(\(a, b\) => a\.slotY - b\.slotY\)/);
  });

  it("カメラを勝手に動かさない(盤面が画面上で静止する)", () => {
    /*
     * 依頼主から**「キャラの位置が動いていて見づらい」**
     * **「HPバーも動いているとごちゃごちゃして見にくい」**と2度指摘を受けた。
     *
     * 札を立ち位置へ固定してもまだ揺れており、実測すると
     * **一時停止しているのに札が横に12px動いていた。**真犯人はカメラで、
     *
     *   1. 待機中の常時の揺れ(sin波でx±0.16 / y±0.08)
     *   2. 行動者の方向へのパンと寄り(画面上で25pxの平行移動)
     *
     * の2つが画面全体を動かしていた。3Dの頃は視差が出て立体感になったが、
     * **正投影の2Dでは全部が同じだけ平行移動するだけ。**
     *
     * 着弾の揺れ(shakeStrength)は残す。一瞬で収まるし、
     * 盤面が静止しているからこそ効いたと分かる。
     */
    expect(stage, "待機中のカメラの揺れが戻っている").not.toMatch(/const idleX = Math\.sin/);
    // 立ち位置に応じてカメラを振る書き方が1つでも残っていたら落とす
    expect(stage, "本体の位置に応じたカメラのパンが残っている").not.toMatch(
      /desired(Camera|Look)Offset\.set\(position\.x/,
    );
    expect(stage, "着弾の揺れまで消してはいけない").toContain("shakeStrength");
  });

  it("札の拡大率を距離で変えない", () => {
    /*
     * 距離は**本体の現在位置**までのものだった。待機で漂うたびに
     * 距離が変わり、札が毎フレームわずかに伸び縮みしていた。
     * 位置を固定しても、大きさが脈打てば結局ちらついて読めない。
     *
     * 正投影では奥も手前も同じ大きさで映るので、そもそも縮める理由が無い。
     */
    expect(stage, "拡大率がまだ距離から決まっている").not.toMatch(/scale: THREE\.MathUtils\.clamp\(this\.frameDistance/);
    expect(stage).toMatch(/scale: 1,/);
  });

  it("状態異常のオーラも本体の背丈に合わせてある", () => {
    /*
     * **3件目の「片方だけ触らない」。**
     * オーラだけ大きさを渡さずに呼んでいたので、既定の1のまま固定されていた。
     * 絵を0.52倍にした時、守りのドームが本体の2倍以上の白い球になり、
     * 味方5体が丸ごと泡に包まれた。
     */
    expect(stage).toMatch(/attachStatusAura\([^)]*\{ scale: AURA_SCALE \}\)/);
    expect(stage).toMatch(/const AURA_SCALE = SPRITE_MAX_HEIGHT \/ 2\.95;/);
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
