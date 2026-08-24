import * as THREE from "three";
import { StageMood } from "./elementTheme.js";
import { SIMPLEX_NOISE_3D } from "./shaderChunks.js";

/**
 * 闘技場「天空のコロッセウム」。
 *
 * 構造は外側へ向かって
 *   闘技床(r=13) → 観客席の段(r=13→18) → 周歩廊と欄干(r=19.3)
 *   → 列柱(r=18.5) → 外壁(r=20.4、**奥だけ開いている**)
 * の順に積み上がる。
 *
 * ## なぜ奥を開けたか(重要)
 *
 * 以前は全周を高さ8.4の壁で囲っていた。その結果、**画面に空も遠景も
 * 一切映らなかった。** 理由は幾何にある。カメラは常に見下ろしなので、
 * 画面のいちばん上の光線ですら水平より7〜15度下を向いている。
 * つまり地平線は永久に画面の外で、壁を高くする限り背景は壁しか映らない。
 *
 * 実測(横長: カメラ高さ約9、距離約24)では、画面上端の光線は
 * r=20 の位置で高さ約3.9を通る。ここに壁があれば、そこで絵が終わる。
 *
 * そこで**奥(-Z)側の130度だけ壁を落とし**、その先を「下へ広がる世界」にした。
 * 見下ろしている以上、遠景は必ず**闘技場より下**に置かないと映らない。
 * 闘技場は雲海の上に浮いた岩盤の上にあり、開口部の向こうには
 * 雲の海と、はるか下に沈む山稜が見える。
 *
 *   開口部を抜けた光線が到達する高さ(実測値):
 *     r=60  → y = -1 〜 -6     近い浮島
 *     r=105 → y = -6 〜 -17    中距離の山稜
 *     r=170 → y = -14 〜 -30   遠い山稜
 *
 * 遠景の各層はこの帯に合わせて高さを決めてある。**層の高さを動かす時は、
 * 実際に撮って帯から外れていないか確かめること。** 外れると、何も足して
 * いないのと同じ結果(霞だけの帯)になる。
 *
 * ## 色
 *
 * 空・霞・石・灯り・遠景の色は、すべて `StageMood`(elementTheme.ts)から来る。
 * 属性ごとに空気の色を変えるための仕組みで、ここに固定色を書き足すと
 * その要素だけステージが変わっても色が変わらなくなる。
 */

// --- 寸法 ---
const FLOOR_RADIUS = 13.0;
const TIER_INNER = 13.0;
const TIER_OUTER = 18.0;
const TIER_TOP_Y = 1.62;
/** 最上段の外に取る平らな周歩廊。ここに列柱と欄干が載る */
const WALK_OUTER = 19.3;
const COLUMN_RADIUS = 18.5;
const COLUMN_COUNT = 28;
const COLUMN_BASE_Y = TIER_TOP_Y;
const COLUMN_SHAFT_H = 3.4;
/** 柱頭の天端(アーキトレーブの下端) */
const COLUMN_TOP_Y = COLUMN_BASE_Y + 0.3 + COLUMN_SHAFT_H + 0.34 + 0.18;
const WALL_RADIUS = 20.4;
const WALL_TOP_Y = 8.2;

/**
 * 奥に開ける角度。
 *
 * **この闘技場の方位はすべて「+Z を 0 とし、x = sin θ / z = cos θ」で置く。**
 * CylinderGeometry の thetaStart がこの向きなので、壁の弧と柱・像・篝火の
 * 位置を同じ式で書けるようにするため。奥(-Z、敵チームの背後)は θ = π。
 *
 * 開口角は「広ければ良い」ものではない。±66度まで開けると、横長では
 * 視野に入る奥の弧(およそ±25度)が全部開口部になってしまい、
 * 建築が1つも映らず構図の枠が消える。±45度だと、横長では
 * 開口部の左右に壁と塔が入り、縦長(視野の横幅は±11度しかない)では
 * 開口部だけが正面に来る。両方の画面比で成立する値がここ。
 */
const OPEN_HALF_ANGLE = THREE.MathUtils.degToRad(45);

/** 方位角(+Zが0)からワールドのxz座標を作る */
function polar(theta: number, radius: number): { x: number; z: number } {
  return { x: Math.sin(theta) * radius, z: Math.cos(theta) * radius };
}

// --- 色(素材そのものの明暗。色相は StageMood 側で掛ける) ---
const STONE_LIGHT = "#8b8fa4";
const STONE_MID = "#63677c";
const STONE_DARK = "#3c4055";
const STONE_DEEP = "#22253a";
const GROUT = "#14161f";

const SKY_VERTEX = /* glsl */ `
varying vec3 vWorld;
void main() {
  vWorld = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * 空。
 *
 * **画面に映るのはほぼ地平線より下だけ**(上のコメント参照)なので、
 * 天頂側より「地平線の下がどう沈むか」を丁寧に作ってある。
 * 下へ行くほど霞が濃くなり、雲海の白へ繋がる。
 */
const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uMid;
uniform vec3 uHaze;
uniform vec3 uGlow;
uniform vec3 uDeep;
uniform float uStars;
uniform float uTime;
varying vec3 vWorld;

${SIMPLEX_NOISE_3D}

void main() {
  vec3 dir = normalize(vWorld);
  float h = dir.y;

  vec3 color = mix(uHaze, uMid, smoothstep(-0.02, 0.34, h));
  color = mix(color, uZenith, smoothstep(0.3, 0.95, h));

  // 地平線より下。ここが実際に画面へ映る領域。
  // すぐ下は霞そのもの、さらに下は深い青へ沈めて「底知れなさ」を作る
  color = mix(color, uHaze, smoothstep(0.04, -0.05, h));
  color = mix(color, uDeep, smoothstep(-0.05, -0.42, h));

  // 奥側の光源。方位で減衰させ、片側だけを暖かくする。
  // 地平線の少し下まで滲ませて、開口部の底が明るく見えるようにする
  float back = max(0.0, -dir.z);
  float glow = pow(back, 2.6) * exp(-abs(h + 0.02) * 4.2);
  color += uGlow * glow * 0.9;

  // ゆっくり流れる高層の雲
  float clouds = fbm(vec3(dir.xz * 1.7 + vec2(uTime * 0.006, 0.0), uTime * 0.01));
  color += uMid * smoothstep(0.15, 0.8, clouds) * 0.35 * smoothstep(0.0, 0.45, h);

  // 星。地平線近くは霞んで見えない
  float stars = snoise(dir * 120.0);
  color += vec3(0.75, 0.82, 1.0) * smoothstep(0.955, 1.0, stars) * smoothstep(0.25, 0.85, h) * 0.55 * uStars;

  gl_FragColor = vec4(color, 1.0);
}
`;

/** 追加合成のソフトなグラデーション板(光の柱・霞に使う) */
const GLOW_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SHAFT_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uTime;
uniform float uSeed;
varying vec2 vUv;

void main() {
  // 横方向は中央が濃い、縦方向は上が強く下へ消える
  float across = 1.0 - abs(vUv.x - 0.5) * 2.0;
  across = pow(max(across, 0.0), 1.7);
  float along = smoothstep(0.0, 0.35, vUv.y) * (1.0 - smoothstep(0.45, 1.0, vUv.y));
  float flicker = 0.82 + 0.18 * sin(uTime * 0.7 + uSeed * 6.28);
  gl_FragColor = vec4(uColor, across * along * uOpacity * flicker);
}
`;

const MIST_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uTime;
uniform float uSeed;
varying vec2 vUv;

${SIMPLEX_NOISE_3D}

void main() {
  vec2 p = vUv - 0.5;
  float r = length(p);
  // **中央(闘技床)には掛けない。**
  // ここに加算の霞を敷くと、モンスターの足元の影が持ち上がって
  // 接地感が消える。実際にそれで「床に貼った絵」に見えていた
  float ring = smoothstep(0.20, 0.31, r) * (1.0 - smoothstep(0.38, 0.5, r));
  float n = fbm(vec3(p * 5.0, uTime * 0.05 + uSeed * 10.0));
  float a = ring * smoothstep(0.25, 0.85, n) * uOpacity;
  gl_FragColor = vec4(uColor, a);
}
`;

/**
 * 雲海。上から見下ろす前提で、うねる面として描く。
 * 加算にすると帯が白く飛ぶので**通常合成**。厚みは濃度で出す。
 */
const CLOUD_FRAGMENT = /* glsl */ `
uniform vec3 uLit;
uniform vec3 uShade;
uniform float uOpacity;
uniform float uScale;
uniform float uTime;
uniform float uSeed;
varying vec2 vUv;

${SIMPLEX_NOISE_3D}

void main() {
  vec2 p = (vUv - 0.5) * uScale;
  float r = length(vUv - 0.5) * 2.0;
  // 中心(闘技場の真下)は抜いて、外周だけを雲にする
  float ring = smoothstep(0.12, 0.3, r) * (1.0 - smoothstep(0.82, 1.0, r));
  float n = fbm(vec3(p + vec2(uTime * 0.004, uTime * 0.0025), uSeed));
  float body = smoothstep(0.28, 0.72, n);
  // 峰の明るいところだけを持ち上げ、谷は影に落とす
  vec3 color = mix(uShade, uLit, smoothstep(0.45, 0.85, n));
  gl_FragColor = vec4(color, body * ring * uOpacity);
}
`;

export interface ArenaHandles {
  group: THREE.Group;
  update: (elapsed: number) => void;
  dispose: () => void;
}

function makeCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2Dコンテキストを取得できませんでした");
  return { canvas, ctx };
}

/** 決定的な擬似乱数。テクスチャを毎回同じ絵にするため */
function makeRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** キャンバス全面に細かいノイズを乗せて、CGっぽい均一さを消す */
function sprinkleGrain(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, seed: number): void {
  const rand = makeRandom(seed);
  const image = ctx.getImageData(0, 0, w, h);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (rand() - 0.5) * amount;
    data[i] = Math.max(0, Math.min(255, data[i] + n));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + n));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + n));
  }
  ctx.putImageData(image, 0, 0);
}

/**
 * 闘技床のテクスチャ。CircleGeometryのUVは円が正方形に内接するので、
 * キャンバスの中心 = 床の中心としてそのまま極座標で描ける。
 * grayscale=true のときは粗さマップ用のグレースケールを返す。
 */
function drawFloorTexture(size: number, grayscale: boolean, rune: string): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(size, size);
  const c = size / 2;
  const rand = makeRandom(9137);
  const pick = (color: string, gray: string) => (grayscale ? gray : color);

  ctx.fillStyle = pick(STONE_MID, "#b4b4b4");
  ctx.fillRect(0, 0, size, size);

  // 石のムラ。大きめの斑を重ねて自然な色ムラを作る
  for (let i = 0; i < 260; i++) {
    const r = (0.02 + rand() * 0.12) * size;
    const x = rand() * size;
    const y = rand() * size;
    const tone = rand();
    ctx.globalAlpha = 0.05 + rand() * 0.09;
    ctx.fillStyle = grayscale ? (tone > 0.5 ? "#cfcfcf" : "#9a9a9a") : tone > 0.5 ? STONE_LIGHT : STONE_DARK;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 同心円の目地。内側ほど密にして、中央に視線が集まるようにする
  const ringFractions = [0.13, 0.24, 0.36, 0.5, 0.63, 0.76, 0.88, 0.955];
  const drawRing = (fr: number, width: number, color: string, alpha: number) => {
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(c, c, fr * c, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  };

  for (const fr of ringFractions) {
    // 目地の影 + そのすぐ外側に光る面取り、の2本で立体感を出す
    drawRing(fr, size * 0.006, pick(GROUT, "#f0f0f0"), 0.85);
    drawRing(fr + 0.004, size * 0.0035, pick(STONE_LIGHT, "#8c8c8c"), 0.5);
  }

  // 放射方向の目地。リングごとに分割数を変えて石畳らしくする
  const sectorsFor = (fr: number) => (fr < 0.3 ? 12 : fr < 0.65 ? 24 : 36);
  ctx.lineCap = "butt";
  for (let ri = 0; ri < ringFractions.length - 1; ri++) {
    const inner = ringFractions[ri] * c;
    const outer = ringFractions[ri + 1] * c;
    const sectors = sectorsFor(ringFractions[ri]);
    // リングごとに半セクタずらして、目地が一直線に通らないようにする
    const phase = (ri % 2) * (Math.PI / sectors);
    for (let s = 0; s < sectors; s++) {
      const a = (s / sectors) * Math.PI * 2 + phase;
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = pick(GROUT, "#f0f0f0");
      ctx.lineWidth = size * 0.005;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * inner, c + Math.sin(a) * inner);
      ctx.lineTo(c + Math.cos(a) * outer, c + Math.sin(a) * outer);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  // 割れ目。円の目地とは無関係に走らせて、経年で割れた石に見せる
  for (let i = 0; i < 14; i++) {
    const a0 = rand() * Math.PI * 2;
    let x = c + Math.cos(a0) * rand() * 0.5 * c;
    let y = c + Math.sin(a0) * rand() * 0.5 * c;
    let dir = rand() * Math.PI * 2;
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = pick(GROUT, "#fafafa");
    ctx.lineWidth = size * 0.0022;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 9; s++) {
      dir += (rand() - 0.5) * 1.1;
      x += Math.cos(dir) * size * 0.03;
      y += Math.sin(dir) * size * 0.03;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // 中央の紋章。うっすらとした線画で、床の主役になりすぎない濃さにする
  ctx.save();
  ctx.translate(c, c);
  ctx.strokeStyle = pick(rune, "#d8d8d8");
  ctx.globalAlpha = grayscale ? 0.25 : 0.34;
  ctx.lineWidth = size * 0.0045;
  for (const fr of [0.045, 0.075, 0.105]) {
    ctx.beginPath();
    ctx.arc(0, 0, fr * c, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    const r = 0.105 * c;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
  // 外周へ伸びる短いルーン線
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 0.115 * c, Math.sin(a) * 0.115 * c);
    ctx.lineTo(Math.cos(a) * 0.155 * c, Math.sin(a) * 0.155 * c);
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;

  // 傷・欠け。数を絞って「汚しすぎない」程度に
  for (let i = 0; i < 120; i++) {
    const a = rand() * Math.PI * 2;
    const rr = (0.1 + rand() * 0.85) * c;
    const len = (0.01 + rand() * 0.05) * size;
    const dir = rand() * Math.PI * 2;
    ctx.globalAlpha = 0.14 + rand() * 0.16;
    ctx.strokeStyle = pick(STONE_DARK, "#dcdcdc");
    ctx.lineWidth = size * (0.001 + rand() * 0.002);
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * rr, c + Math.sin(a) * rr);
    ctx.lineTo(c + Math.cos(a) * rr + Math.cos(dir) * len, c + Math.sin(a) * rr + Math.sin(dir) * len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  if (!grayscale) {
    // 外周を落として中央を持ち上げるビネット。視線を中央の戦闘へ寄せる
    const vignette = ctx.createRadialGradient(c, c, c * 0.12, c, c, c);
    vignette.addColorStop(0, "rgba(170,180,220,0.14)");
    vignette.addColorStop(0.45, "rgba(0,0,0,0)");
    vignette.addColorStop(0.8, "rgba(6,7,16,0.4)");
    vignette.addColorStop(1, "rgba(4,5,12,0.76)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, size, size);
  }

  sprinkleGrain(ctx, size, size, grayscale ? 14 : 20, 4471);
  return canvas;
}

/**
 * 外周の壁。円柱の内側に貼るので、横1タイル分にアーチ2連を描き、
 * 周方向に繰り返す。emissive側はアーチの奥だけを光らせる。
 */
function drawWallTexture(w: number, h: number, mode: "color" | "emissive" | "rough"): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(w, h);
  const rand = makeRandom(2255);

  if (mode === "emissive") {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, w, h);
  } else if (mode === "rough") {
    ctx.fillStyle = "#c8c8c8";
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.fillStyle = STONE_DARK;
    ctx.fillRect(0, 0, w, h);
    // 石積み。段ごとに半個ずらす
    const rows = 22;
    const rowH = h / rows;
    for (let r = 0; r < rows; r++) {
      const cols = 10;
      const colW = w / cols;
      const offset = (r % 2) * colW * 0.5;
      for (let cI = -1; cI < cols + 1; cI++) {
        const x = cI * colW + offset;
        const y = r * rowH;
        const tone = 0.72 + rand() * 0.5;
        ctx.fillStyle = `rgba(${Math.round(78 * tone)},${Math.round(82 * tone)},${Math.round(104 * tone)},1)`;
        ctx.fillRect(x + 1, y + 1, colW - 2, rowH - 2);
      }
    }
  }

  const archCount = 2;
  const tileW = w / archCount;
  for (let i = 0; i < archCount; i++) {
    const cx = tileW * (i + 0.5);
    const archW = tileW * 0.52;
    const springY = h * 0.68; // アーチの起拱点(下ほど大きいy)
    const baseY = h * 0.93;
    const topY = springY - archW * 0.5;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx - archW / 2, baseY);
    ctx.lineTo(cx - archW / 2, springY);
    ctx.arc(cx, springY, archW / 2, Math.PI, 0);
    ctx.lineTo(cx + archW / 2, baseY);
    ctx.closePath();

    if (mode === "emissive") {
      // 奥から漏れる灯り。下ほど明るく、上は闇に沈む
      const g = ctx.createLinearGradient(0, baseY, 0, topY);
      g.addColorStop(0, "rgba(255,150,72,0.95)");
      g.addColorStop(0.35, "rgba(150,96,70,0.45)");
      g.addColorStop(1, "rgba(20,24,50,0.0)");
      ctx.fillStyle = g;
      ctx.fill();
    } else if (mode === "rough") {
      ctx.fillStyle = "#f4f4f4";
      ctx.fill();
    } else {
      const g = ctx.createLinearGradient(0, baseY, 0, topY);
      g.addColorStop(0, "#3a2b28");
      g.addColorStop(0.4, "#161726");
      g.addColorStop(1, "#0a0b15");
      ctx.fillStyle = g;
      ctx.fill();
      // アーチ枠の迫石
      ctx.strokeStyle = STONE_LIGHT;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = h * 0.012;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  if (mode === "color") {
    // 付柱(ピラスター)。アーチの間に縦の帯を入れてリズムを作る
    for (let i = 0; i <= archCount; i++) {
      const x = tileW * i;
      const pw = tileW * 0.14;
      const g = ctx.createLinearGradient(x - pw / 2, 0, x + pw / 2, 0);
      g.addColorStop(0, STONE_DEEP);
      g.addColorStop(0.35, STONE_MID);
      g.addColorStop(0.55, STONE_LIGHT);
      g.addColorStop(1, STONE_DEEP);
      ctx.fillStyle = g;
      ctx.fillRect(x - pw / 2, h * 0.06, pw, h * 0.87);
    }

    // 上部のコーニス(軒)とデンティル(歯飾り)
    ctx.fillStyle = STONE_MID;
    ctx.fillRect(0, 0, w, h * 0.06);
    ctx.fillStyle = STONE_LIGHT;
    ctx.fillRect(0, h * 0.045, w, h * 0.012);
    for (let x = 0; x < w; x += w / 48) {
      ctx.fillStyle = STONE_DEEP;
      ctx.fillRect(x + w / 160, h * 0.062, w / 110, h * 0.026);
    }
    // 下部の基壇
    ctx.fillStyle = STONE_DEEP;
    ctx.fillRect(0, h * 0.93, w, h * 0.07);
    ctx.fillStyle = STONE_MID;
    ctx.fillRect(0, h * 0.925, w, h * 0.012);

    // 経年。上から垂れる雨だれの筋と、下端に溜まる汚れ
    const rand2 = makeRandom(5521);
    for (let i = 0; i < 60; i++) {
      const x = rand2() * w;
      const top = h * (0.06 + rand2() * 0.2);
      const len = h * (0.1 + rand2() * 0.45);
      const g = ctx.createLinearGradient(0, top, 0, top + len);
      g.addColorStop(0, "rgba(12,14,24,0.34)");
      g.addColorStop(1, "rgba(12,14,24,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x, top, w * (0.002 + rand2() * 0.006), len);
    }

    // 全体を下ほど暗くして、床との接地を締める
    const shade = ctx.createLinearGradient(0, 0, 0, h);
    shade.addColorStop(0, "rgba(140,160,220,0.14)");
    shade.addColorStop(0.55, "rgba(0,0,0,0)");
    shade.addColorStop(1, "rgba(3,4,10,0.55)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, w, h);

    sprinkleGrain(ctx, w, h, 16, 8823);
  }

  return canvas;
}

/**
 * 欄干(バルストレード)。透ける柵にしないと、開口部の向こうの景色を
 * 自分で塞いでしまう。手すりと束柱だけを描き、間は抜く。
 */
function drawRailTexture(w: number, h: number): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.clearRect(0, 0, w, h);
  // 上端の手すりと下端の台輪
  ctx.fillStyle = STONE_LIGHT;
  ctx.fillRect(0, 0, w, h * 0.16);
  ctx.fillStyle = STONE_MID;
  ctx.fillRect(0, h * 0.16, w, h * 0.05);
  ctx.fillStyle = STONE_DARK;
  ctx.fillRect(0, h * 0.86, w, h * 0.14);
  // 束柱。壺型にくびれさせる
  const count = 10;
  for (let i = 0; i < count; i++) {
    const cx = ((i + 0.5) / count) * w;
    for (let y = h * 0.21; y < h * 0.86; y += 1) {
      const t = (y - h * 0.21) / (h * 0.65);
      const waist = 0.55 + 0.45 * Math.abs(Math.cos(t * Math.PI));
      const half = w * 0.028 * waist;
      ctx.fillStyle = t < 0.5 ? STONE_MID : STONE_DARK;
      ctx.fillRect(cx - half, y, half * 2, 1);
    }
  }
  return canvas;
}

/**
 * 遠景の山稜。円筒の内側へ貼る1枚絵。
 *
 * 横方向は整数周期の正弦を足して作るので、円筒を一周しても継ぎ目が出ない。
 * 縦は「稜線から下」を塗り、下へ行くほど霞へ寄せる(空気遠近)。
 * ここで霞へ寄せておかないと、遠景が手前と同じ濃さで出て
 * 「書き割りが立っている」ように見える。
 */
function drawRidgeTexture(
  w: number,
  h: number,
  seed: number,
  ridge: string,
  haze: string,
  /** キャンバス上端からの稜線の基準位置(0=上端) */
  ridgeBase: number,
  ridgeAmp: number,
  peaks: number,
): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.clearRect(0, 0, w, h);
  const rand = makeRandom(seed);
  // 整数周期の波を重ねる(継ぎ目が出ない)
  const waves = Array.from({ length: 5 }, (_, i) => ({
    freq: peaks * (i + 1),
    amp: ridgeAmp / (i + 1.35),
    phase: rand() * Math.PI * 2,
  }));
  const heightAt = (u: number): number => {
    let y = ridgeBase;
    for (const wv of waves) y += Math.sin(u * Math.PI * 2 * wv.freq + wv.phase) * wv.amp;
    return y;
  };

  for (let x = 0; x < w; x++) {
    const y = heightAt(x / w);
    const g = ctx.createLinearGradient(0, y, 0, h);
    g.addColorStop(0, ridge);
    g.addColorStop(0.55, haze);
    g.addColorStop(1, haze);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, 1, h - y);
  }

  // 稜線のすぐ下に一段暗い面を入れて、平板な塗りに陰を作る
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = "rgba(0,0,0,1)";
  for (let x = 0; x < w; x += 2) {
    const y = heightAt(x / w);
    const y2 = heightAt((x + 2) / w);
    // 稜線が下る側(光の当たらない側)だけを暗くする
    if (y2 > y) ctx.fillRect(x, y, 2, Math.min(h - y, h * 0.09));
  }
  ctx.globalAlpha = 1;
  return canvas;
}

/**
 * 手前の浮島。山稜と違って**下が閉じている**シルエットを描く。
 * 岩塊が宙に浮いている、という一目で分かる形にすることで
 * 「ここは空の上だ」という設定を絵だけで伝える。
 */
function drawIsletTexture(w: number, h: number, seed: number, rock: string, haze: string): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.clearRect(0, 0, w, h);
  const rand = makeRandom(seed);
  const count = 7;
  for (let i = 0; i < count; i++) {
    const cx = ((i + 0.35 + rand() * 0.3) / count) * w;
    const topY = h * (0.12 + rand() * 0.3);
    const width = w * (0.035 + rand() * 0.055);
    const depth = h * (0.3 + rand() * 0.45);

    const g = ctx.createLinearGradient(0, topY, 0, topY + depth);
    g.addColorStop(0, rock);
    g.addColorStop(0.45, haze);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;

    // 上面は平ら、下は錐状に尖る。角をわずかに崩して岩に見せる
    ctx.beginPath();
    ctx.moveTo(cx - width, topY + h * 0.02);
    ctx.lineTo(cx - width * 0.72, topY);
    ctx.lineTo(cx + width * 0.6, topY + h * 0.01);
    ctx.lineTo(cx + width, topY + h * 0.03);
    ctx.lineTo(cx + width * 0.45, topY + depth * 0.55);
    ctx.lineTo(cx + width * 0.1, topY + depth);
    ctx.lineTo(cx - width * 0.5, topY + depth * 0.5);
    ctx.closePath();
    ctx.fill();
  }
  return canvas;
}

function textureFrom(canvas: HTMLCanvasElement, srgb: boolean): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.anisotropy = 4;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/** ふわっとした円形のアルファ。塵や篝火のスプライトに使う */
function softDotTexture(size = 64): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** 旗の絵。縦長の垂れ幕に、紋章と房を入れる */
function drawBannerTexture(w: number, h: number, main: string, trim: string): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.clearRect(0, 0, w, h);
  // 布の本体。下端はV字に切る
  ctx.fillStyle = main;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(w, 0);
  ctx.lineTo(w, h * 0.88);
  ctx.lineTo(w * 0.5, h);
  ctx.lineTo(0, h * 0.88);
  ctx.closePath();
  ctx.fill();
  // 縁取り
  ctx.strokeStyle = trim;
  ctx.lineWidth = w * 0.07;
  ctx.stroke();
  // 紋章(菱形と縦線)
  ctx.fillStyle = trim;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.moveTo(w * 0.5, h * 0.22);
  ctx.lineTo(w * 0.78, h * 0.4);
  ctx.lineTo(w * 0.5, h * 0.58);
  ctx.lineTo(w * 0.22, h * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  // 縦の折り目。平らな板に見せないための陰
  for (let i = 1; i < 5; i++) {
    const x = (i / 5) * w;
    const g = ctx.createLinearGradient(x - w * 0.08, 0, x + w * 0.08, 0);
    g.addColorStop(0, "rgba(0,0,0,0.28)");
    g.addColorStop(0.5, "rgba(255,255,255,0.10)");
    g.addColorStop(1, "rgba(0,0,0,0.28)");
    ctx.fillStyle = g;
    ctx.fillRect(x - w * 0.08, 0, w * 0.16, h);
  }
  return canvas;
}

export function createArena(mood: StageMood): ArenaHandles {
  const group = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];
  const animatedUniforms: { uTime: { value: number } }[] = [];

  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  /** 色を霞へ寄せる。遠いものほど t を大きくして空気遠近を作る */
  const hazed = (color: THREE.Color, t: number): THREE.Color => color.clone().lerp(mood.haze, t);
  const css = (color: THREE.Color): string => `#${color.getHexString()}`;

  // ============================== 空 ==============================
  const skyGeometry = track(new THREE.SphereGeometry(250, 32, 20));
  const skyMaterial = track(
    new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      uniforms: {
        uZenith: { value: mood.zenith.clone() },
        uMid: { value: mood.mid.clone() },
        // 地平線の霞。battleStage.ts の FogExp2 の色と必ず揃えること
        uHaze: { value: mood.haze.clone() },
        uGlow: { value: mood.glow.clone() },
        // 地平線より下。見下ろしの画面で実際に映るのはここ
        uDeep: { value: mood.haze.clone().lerp(mood.zenith, 0.62) },
        uStars: { value: mood.stars },
        uTime: { value: 0 },
      },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    }),
  );
  const sky = new THREE.Mesh(skyGeometry, skyMaterial);
  sky.renderOrder = -20;
  group.add(sky);
  animatedUniforms.push(skyMaterial.uniforms as { uTime: { value: number } });

  // ============================== 遠景 ==============================
  // 闘技場は雲海の上に浮いている。開口部から見えるのは「下へ広がる世界」で、
  // 遠いものほど低く、霞に寄る。3層に分けて視差と空気遠近を作る。
  //
  // **高さの帯は上のコメントの実測値に合わせてある。** 動かす時は撮って確かめること。
  const addRing = (
    radius: number,
    height: number,
    centerY: number,
    canvas: HTMLCanvasElement,
    order: number,
  ): void => {
    const texture = track(textureFrom(canvas, true));
    texture.wrapS = THREE.RepeatWrapping;
    const geometry = track(new THREE.CylinderGeometry(radius, radius, height, 96, 1, true));
    const material = track(
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        side: THREE.BackSide,
        fog: false,
        toneMapped: true,
      }),
    );
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = centerY;
    mesh.renderOrder = order;
    group.add(mesh);
  };

  // 遠い山稜(いちばん霞む)
  addRing(
    178,
    62,
    -34,
    drawRidgeTexture(2048, 320, 771, css(hazed(mood.distant, 0.82)), css(hazed(mood.haze, 0.1)), 74, 30, 3),
    -18,
  );
  // 中距離の山稜
  addRing(
    108,
    46,
    -19,
    drawRidgeTexture(2048, 320, 4413, css(hazed(mood.distant, 0.55)), css(hazed(mood.haze, 0.06)), 92, 44, 5),
    -16,
  );
  // 手前の浮島。ここだけシルエットが宙に浮く
  addRing(58, 26, -9.5, drawIsletTexture(2048, 320, 199, css(hazed(mood.distant, 0.3)), css(mood.haze)), -12);

  // ============================== 雲海 ==============================
  // 浮遊感はここが作る。加算にすると帯が白飛びするので通常合成で、
  // 明部/暗部の2色を持たせて「厚み」を出す
  const cloudLayers: { mesh: THREE.Mesh; spin: number }[] = [];
  const cloudSpec = [
    { y: -11.5, radius: 120, opacity: 0.62, scale: 3.2, seed: 1.7, order: -15 },
    { y: -19, radius: 190, opacity: 0.72, scale: 2.4, seed: 5.3, order: -17 },
    { y: -30, radius: 230, opacity: 0.8, scale: 1.8, seed: 9.1, order: -19 },
  ];
  for (const spec of cloudSpec) {
    const geometry = track(new THREE.CircleGeometry(spec.radius, 64));
    const material = track(
      new THREE.ShaderMaterial({
        vertexShader: GLOW_VERTEX,
        fragmentShader: CLOUD_FRAGMENT,
        uniforms: {
          uLit: { value: mood.cloud.clone().lerp(mood.glow, 0.22) },
          uShade: { value: mood.haze.clone().lerp(mood.zenith, 0.3) },
          uOpacity: { value: spec.opacity },
          uScale: { value: spec.scale },
          uTime: { value: 0 },
          uSeed: { value: spec.seed },
        },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      }),
    );
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = spec.y;
    mesh.renderOrder = spec.order;
    group.add(mesh);
    cloudLayers.push({ mesh, spin: spec.y * 0.0004 });
    animatedUniforms.push(material.uniforms as { uTime: { value: number } });
  }

  // ============================== 闘技床 ==============================
  const runeCss = `#${mood.rune.getHexString()}`;
  const floorMap = track(textureFrom(drawFloorTexture(1024, false, runeCss), true));
  const floorRough = track(textureFrom(drawFloorTexture(512, true, runeCss), false));
  const floorGeometry = track(new THREE.CircleGeometry(FLOOR_RADIUS, 96));
  const floorMaterial = track(
    new THREE.MeshStandardMaterial({
      map: floorMap,
      roughnessMap: floorRough,
      // 磨かれた石。ここを 0.8 台に上げると床が紙のように沈み、
      // 空や篝火の映り込みが一切出なくなる。0.5 前後が
      // 「艶はあるが鏡ではない」ちょうどの値
      roughness: 0.5,
      metalness: 0.15,
      envMapIntensity: 1.2,
      color: mood.stone.clone(),
    }),
  );
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  // 床の外周を縁取る発光リング。細く抑えて、安っぽい線に見せない
  const runeGeometry = track(new THREE.RingGeometry(FLOOR_RADIUS - 0.16, FLOOR_RADIUS - 0.02, 128));
  const runeMaterial = track(
    new THREE.MeshBasicMaterial({
      color: mood.rune.clone(),
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  const runeRing = new THREE.Mesh(runeGeometry, runeMaterial);
  runeRing.rotation.x = -Math.PI / 2;
  runeRing.position.y = 0.015;
  group.add(runeRing);

  // ============================== 観客席の段 ==============================
  // 内側から外側へ階段状に立ち上げ、最上段の外に平らな周歩廊を足す
  const tierProfile: THREE.Vector2[] = [];
  const tierSteps = 5;
  for (let i = 0; i <= tierSteps; i++) {
    const t = i / tierSteps;
    const r = THREE.MathUtils.lerp(TIER_INNER, TIER_OUTER, t);
    const y = TIER_TOP_Y * t;
    const rPrev = THREE.MathUtils.lerp(TIER_INNER, TIER_OUTER, Math.max(0, (i - 1) / tierSteps));
    if (i > 0) tierProfile.push(new THREE.Vector2(rPrev, y)); // 蹴上げ
    tierProfile.push(new THREE.Vector2(r, y)); // 踏み面
  }
  // 周歩廊(列柱と欄干が載る平らな帯)
  tierProfile.push(new THREE.Vector2(WALK_OUTER, TIER_TOP_Y));
  tierProfile.push(new THREE.Vector2(WALK_OUTER, TIER_TOP_Y - 0.55));
  tierProfile.unshift(new THREE.Vector2(TIER_INNER, -0.4));
  const tierGeometry = track(new THREE.LatheGeometry(tierProfile, 72));
  const tierMaterial = track(
    new THREE.MeshStandardMaterial({
      color: mood.stone.clone().multiplyScalar(0.42),
      roughness: 0.9,
      metalness: 0.04,
      side: THREE.DoubleSide,
      flatShading: true,
    }),
  );
  const tiers = new THREE.Mesh(tierGeometry, tierMaterial);
  tiers.receiveShadow = true;
  group.add(tiers);

  // ============================== 観客 ==============================
  // 段の上に小さな影を並べる。1つ1つは11px程度にしか映らないが、
  // 「席が埋まっている」ことが分かるだけで闘技場が生きた場所になる。
  // InstancedMesh 1回で済むので描画負荷は無視できる
  const crowdGeometry = track(new THREE.CapsuleGeometry(0.16, 0.3, 3, 6));
  const crowdMaterial = track(
    new THREE.MeshStandardMaterial({ color: 0x1a1c2c, roughness: 0.95, metalness: 0, flatShading: true }),
  );
  const CROWD_COUNT = 260;
  const crowd = new THREE.InstancedMesh(crowdGeometry, crowdMaterial, CROWD_COUNT);
  {
    const rand = makeRandom(3391);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const position = new THREE.Vector3();
    const tint = new THREE.Color();
    for (let i = 0; i < CROWD_COUNT; i++) {
      const step = Math.floor(rand() * tierSteps);
      const t = (step + 0.55) / tierSteps;
      const r = THREE.MathUtils.lerp(TIER_INNER, TIER_OUTER, t) + (rand() - 0.5) * 0.35;
      const y = TIER_TOP_Y * t + 0.28;
      const angle = rand() * Math.PI * 2;
      position.set(Math.cos(angle) * r, y, Math.sin(angle) * r);
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -angle);
      scale.set(1, 0.85 + rand() * 0.4, 1);
      matrix.compose(position, quaternion, scale);
      crowd.setMatrixAt(i, matrix);
      // 服の色に幅を持たせる。全部同じ黒だと帯にしか見えない
      const warm = rand();
      tint.setHSL(warm > 0.7 ? 0.08 : 0.62, 0.25, 0.1 + rand() * 0.14);
      crowd.setColorAt(i, tint);
    }
    crowd.instanceMatrix.needsUpdate = true;
    if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true;
  }
  group.add(crowd);
  disposables.push({ dispose: () => crowd.dispose() });

  // 観客が持つ小さな灯り。点で散らすと席のざわめきに見える
  {
    const count = 90;
    const positions = new Float32Array(count * 3);
    const rand = makeRandom(7717);
    for (let i = 0; i < count; i++) {
      const step = Math.floor(rand() * tierSteps);
      const t = (step + 0.55) / tierSteps;
      const r = THREE.MathUtils.lerp(TIER_INNER, TIER_OUTER, t);
      const angle = rand() * Math.PI * 2;
      positions[i * 3 + 0] = Math.cos(angle) * r;
      positions[i * 3 + 1] = TIER_TOP_Y * t + 0.5;
      positions[i * 3 + 2] = Math.sin(angle) * r;
    }
    const geometry = track(new THREE.BufferGeometry());
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = track(
      new THREE.PointsMaterial({
        color: mood.ember.clone(),
        size: 0.16,
        map: softDotTexture(32),
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      }),
    );
    group.add(new THREE.Points(geometry, material));
  }

  // ============================== 欄干 ==============================
  // 透ける柵。ここを板で塞ぐと、開口部の向こうの景色を自分で消してしまう
  const railTexture = track(textureFrom(drawRailTexture(256, 128), true));
  railTexture.repeat.set(46, 1);
  const railGeometry = track(new THREE.CylinderGeometry(WALK_OUTER - 0.1, WALK_OUTER - 0.1, 0.76, 96, 1, true));
  const railMaterial = track(
    new THREE.MeshStandardMaterial({
      map: railTexture,
      color: mood.stone.clone().multiplyScalar(0.85),
      roughness: 0.85,
      metalness: 0.05,
      side: THREE.DoubleSide,
      transparent: false,
      alphaTest: 0.45,
    }),
  );
  const rail = new THREE.Mesh(railGeometry, railMaterial);
  rail.position.y = TIER_TOP_Y + 0.38;
  rail.castShadow = true;
  group.add(rail);

  // ============================== 外周の壁(奥は開ける) ==============================
  const wallColor = track(textureFrom(drawWallTexture(512, 340, "color"), true));
  const wallEmissive = track(textureFrom(drawWallTexture(512, 340, "emissive"), true));
  const wallRough = track(textureFrom(drawWallTexture(256, 170, "rough"), false));
  const wallArc = Math.PI * 2 - OPEN_HALF_ANGLE * 2;
  const wallRepeat = Math.round((12 * wallArc) / (Math.PI * 2));
  for (const texture of [wallColor, wallEmissive, wallRough]) texture.repeat.set(wallRepeat, 1);
  const wallHeight = WALL_TOP_Y - 0.4;
  const wallGeometry = track(
    new THREE.CylinderGeometry(
      WALL_RADIUS,
      WALL_RADIUS,
      wallHeight,
      64,
      1,
      true,
      Math.PI + OPEN_HALF_ANGLE,
      wallArc,
    ),
  );
  const wallMaterial = track(
    new THREE.MeshStandardMaterial({
      map: wallColor,
      color: mood.stone.clone(),
      emissiveMap: wallEmissive,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.8,
      roughnessMap: wallRough,
      roughness: 0.95,
      metalness: 0.02,
      // **BackSide を外さないこと。** カメラは壁の外側(r≈23)にいて
      // 手前の壁ごしに闘技場を覗いている。両面にすると、手前の壁の外面が
      // 画面の下半分を塞ぐ(横長で実際に起きる)
      side: THREE.BackSide,
    }),
  );
  const wall = new THREE.Mesh(wallGeometry, wallMaterial);
  wall.position.y = 0.4 + wallHeight / 2;
  group.add(wall);

  // ============================== 開口部を挟む塔 ==============================
  // 壁を切ると断面がむき出しになる。両端に塔を立てて端を隠しつつ、
  // 「門」として構図の枠にする。視線が自然に開口部の中央へ落ちる
  const towerMaterial = track(
    new THREE.MeshStandardMaterial({
      map: wallColor.clone(),
      color: mood.stone.clone().multiplyScalar(0.9),
      roughness: 0.92,
      metalness: 0.03,
      flatShading: false,
    }),
  );
  (towerMaterial.map as THREE.Texture).repeat.set(1.2, 1);
  (towerMaterial.map as THREE.Texture).needsUpdate = true;
  disposables.push({ dispose: () => (towerMaterial.map as THREE.Texture).dispose() });
  const towerHeight = WALL_TOP_Y + 2.6;
  const towerGeometry = track(new THREE.BoxGeometry(3.2, towerHeight, 2.8));
  const towerCapGeometry = track(new THREE.ConeGeometry(2.5, 2.4, 6));
  const towerCapMaterial = track(
    new THREE.MeshStandardMaterial({ color: mood.stone.clone().multiplyScalar(0.5), roughness: 0.9, metalness: 0.05 }),
  );
  for (const sign of [-1, 1]) {
    const angle = Math.PI + sign * OPEN_HALF_ANGLE;
    const at = polar(angle, WALL_RADIUS + 0.2);
    const tower = new THREE.Mesh(towerGeometry, towerMaterial);
    tower.position.set(at.x, towerHeight / 2 - 0.4, at.z);
    tower.rotation.y = angle;
    tower.castShadow = true;
    group.add(tower);

    const cap = new THREE.Mesh(towerCapGeometry, towerCapMaterial);
    cap.position.set(at.x, towerHeight - 0.4 + 1.2, at.z);
    cap.rotation.y = angle;
    group.add(cap);
  }

  // ============================== 列柱 ==============================
  // 基礎・柱身・柱頭をそれぞれInstancedMeshにして、描画回数を抑える。
  // 開口部側の柱は空を背にして立つので、輪郭がいちばん強く出る
  const columnMaterial = track(
    new THREE.MeshStandardMaterial({
      color: mood.stone.clone().multiplyScalar(0.78),
      roughness: 0.76,
      metalness: 0.08,
      flatShading: true,
    }),
  );
  const baseGeometry = track(new THREE.CylinderGeometry(0.46, 0.54, 0.3, 10));
  const shaftGeometry = track(new THREE.CylinderGeometry(0.29, 0.35, COLUMN_SHAFT_H, 12, 1));
  const capGeometry = track(new THREE.CylinderGeometry(0.44, 0.32, 0.34, 10));
  const abacusGeometry = track(new THREE.BoxGeometry(0.94, 0.18, 0.94));

  const columnParts: { geometry: THREE.BufferGeometry; y: number; full: boolean }[] = [
    { geometry: baseGeometry, y: COLUMN_BASE_Y + 0.15, full: false },
    { geometry: shaftGeometry, y: COLUMN_BASE_Y + 0.3 + COLUMN_SHAFT_H / 2, full: true },
    { geometry: capGeometry, y: COLUMN_BASE_Y + 0.3 + COLUMN_SHAFT_H + 0.17, full: true },
    { geometry: abacusGeometry, y: COLUMN_BASE_Y + 0.3 + COLUMN_SHAFT_H + 0.43, full: true },
  ];
  // 経年。何本かは折れているほうが「長く使われてきた場所」に見える
  const brokenRand = makeRandom(6101);
  const brokenAt = new Set<number>();
  for (let i = 0; i < COLUMN_COUNT; i++) if (brokenRand() < 0.14) brokenAt.add(i);

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const position = new THREE.Vector3();
  for (const part of columnParts) {
    const mesh = new THREE.InstancedMesh(part.geometry, columnMaterial, COLUMN_COUNT);
    for (let i = 0; i < COLUMN_COUNT; i++) {
      const angle = (i / COLUMN_COUNT) * Math.PI * 2 + Math.PI / COLUMN_COUNT;
      const at = polar(angle, COLUMN_RADIUS);
      const broken = brokenAt.has(i);
      if (broken && part.full) {
        // 折れた柱は柱身を途中で止め、柱頭より上は消す
        if (part.geometry === shaftGeometry) {
          const cut = 0.42;
          position.set(at.x, COLUMN_BASE_Y + 0.3 + (COLUMN_SHAFT_H * cut) / 2, at.z);
          scale.set(1, cut, 1);
        } else {
          scale.set(0, 0, 0);
          position.set(0, -999, 0);
        }
      } else {
        scale.set(1, 1, 1);
        position.set(at.x, part.y, at.z);
      }
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(i, matrix);
    }
    scale.set(1, 1, 1);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    disposables.push({ dispose: () => mesh.dispose() });
  }

  // 柱の上に載る水平材(アーキトレーブ)。**開口部の上では途切れさせる。**
  // ここを一周させると、せっかく開けた空に横棒が渡って景色が切れる
  const architraveGeometry = track(
    new THREE.CylinderGeometry(
      COLUMN_RADIUS + 0.42,
      COLUMN_RADIUS + 0.42,
      0.66,
      64,
      1,
      true,
      Math.PI + OPEN_HALF_ANGLE * 0.92,
      Math.PI * 2 - OPEN_HALF_ANGLE * 1.84,
    ),
  );
  const architraveMaterial = track(
    new THREE.MeshStandardMaterial({
      color: mood.stone.clone().multiplyScalar(0.62),
      roughness: 0.85,
      metalness: 0.05,
      side: THREE.DoubleSide,
    }),
  );
  const architrave = new THREE.Mesh(architraveGeometry, architraveMaterial);
  architrave.position.y = COLUMN_TOP_Y + 0.33;
  architrave.castShadow = true;
  group.add(architrave);

  // ============================== 垂れ幕 ==============================
  // 柱の間に下げる。石ばかりの画面に布が入ると、素材の対比で情報量が上がる
  const bannerTexture = track(
    textureFrom(
      drawBannerTexture(128, 320, `#${mood.distant.clone().lerp(mood.rune, 0.35).getHexString()}`, `#${mood.rune.getHexString()}`),
      true,
    ),
  );
  bannerTexture.wrapS = THREE.ClampToEdgeWrapping;
  const bannerGeometry = track(new THREE.PlaneGeometry(1.15, 2.6, 1, 6));
  const bannerMaterial = track(
    new THREE.MeshStandardMaterial({
      map: bannerTexture,
      roughness: 0.95,
      metalness: 0,
      side: THREE.DoubleSide,
      transparent: true,
      alphaTest: 0.35,
    }),
  );
  const bannerAngles: number[] = [];
  for (let i = 0; i < COLUMN_COUNT; i++) {
    const angle = (i / COLUMN_COUNT) * Math.PI * 2;
    // 開口部の内側には下げない(景色を塞ぐため)
    const delta = Math.abs(((angle - Math.PI + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (delta < OPEN_HALF_ANGLE * 0.9) continue;
    if (i % 2 !== 0) continue;
    bannerAngles.push(angle);
  }
  const banners: THREE.Mesh[] = [];
  for (const angle of bannerAngles) {
    const mesh = new THREE.Mesh(bannerGeometry, bannerMaterial);
    const at = polar(angle, COLUMN_RADIUS + 0.62);
    mesh.position.set(at.x, COLUMN_TOP_Y - 1.0, at.z);
    mesh.lookAt(0, COLUMN_TOP_Y - 1.0, 0);
    group.add(mesh);
    banners.push(mesh);
  }

  // ============================== 開口部を守る石像 ==============================
  // 縦画面では視野の横幅が±11度しかなく、塔(±45度)は画面に入らない。
  // 開口部の中心寄りに1対だけ大きな像を置いて、**どの画面比でも**
  // 「向こうへ抜ける景色」に枠が付くようにする。
  // 掲げた炎が門の位置を光で示し、視線が自然に敵チームへ落ちる
  const statueMaterial = track(
    new THREE.MeshStandardMaterial({
      color: mood.stone.clone().multiplyScalar(0.66),
      roughness: 0.88,
      metalness: 0.06,
      flatShading: true,
    }),
  );
  const plinthGeometry = track(new THREE.BoxGeometry(1.7, 1.0, 1.7));
  const robeGeometry = track(new THREE.CylinderGeometry(0.42, 0.78, 2.5, 8));
  const shoulderGeometry = track(new THREE.BoxGeometry(1.1, 0.4, 0.7));
  const headGeometry = track(new THREE.SphereGeometry(0.28, 10, 8));
  const armGeometry = track(new THREE.CylinderGeometry(0.13, 0.16, 1.5, 6));
  const bowlGeometry = track(new THREE.CylinderGeometry(0.5, 0.28, 0.42, 10));
  /** 像が掲げる鉢の位置。篝火の炎はここに載せる(下の篝火の節で使う) */
  const statueBowls: THREE.Vector3[] = [];
  for (const sign of [-1, 1]) {
    const angle = Math.PI + sign * THREE.MathUtils.degToRad(21);
    const at = polar(angle, WALK_OUTER - 1.35);
    const pivot = new THREE.Group();
    pivot.position.set(at.x, TIER_TOP_Y, at.z);
    pivot.rotation.y = angle + Math.PI; // 闘技場の中心を向く
    group.add(pivot);

    const plinth = new THREE.Mesh(plinthGeometry, statueMaterial);
    plinth.position.y = 0.5;
    plinth.castShadow = true;
    pivot.add(plinth);

    const robe = new THREE.Mesh(robeGeometry, statueMaterial);
    robe.position.y = 2.25;
    robe.castShadow = true;
    pivot.add(robe);

    const shoulder = new THREE.Mesh(shoulderGeometry, statueMaterial);
    shoulder.position.y = 3.55;
    shoulder.castShadow = true;
    pivot.add(shoulder);

    const head = new THREE.Mesh(headGeometry, statueMaterial);
    head.position.y = 3.98;
    head.castShadow = true;
    pivot.add(head);

    for (const armSign of [-1, 1]) {
      const arm = new THREE.Mesh(armGeometry, statueMaterial);
      arm.position.set(armSign * 0.52, 4.15, 0);
      arm.rotation.z = -armSign * 0.34;
      arm.castShadow = true;
      pivot.add(arm);
    }

    const bowl = new THREE.Mesh(bowlGeometry, statueMaterial);
    bowl.position.y = 5.05;
    bowl.castShadow = true;
    pivot.add(bowl);
    statueBowls.push(new THREE.Vector3(at.x, TIER_TOP_Y + 5.3, at.z));
  }

  // ============================== 光条(ゴッドレイ風) ==============================
  // 列柱の隙間から差し込む光を、加算合成の板で擬似的に作る
  const shaftGeo = track(new THREE.PlaneGeometry(3.4, 13));
  const shaftAngles = [-0.62, -0.3, 0.0, 0.3, 0.62, 2.6, 3.68];
  for (let i = 0; i < shaftAngles.length; i++) {
    const angle = shaftAngles[i] + Math.PI; // 基準を奥(-Z)側にする
    const material = track(
      new THREE.ShaderMaterial({
        vertexShader: GLOW_VERTEX,
        fragmentShader: SHAFT_FRAGMENT,
        uniforms: {
          uColor: { value: i < 5 ? mood.glow.clone().lerp(mood.hemiSky, 0.4) : mood.ember.clone() },
          uOpacity: { value: i === 2 ? 0.17 : 0.11 },
          uTime: { value: 0 },
          uSeed: { value: i * 0.37 },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        fog: false,
      }),
    );
    const mesh = new THREE.Mesh(shaftGeo, material);
    const radius = COLUMN_RADIUS - 1.5;
    mesh.position.set(Math.cos(angle + Math.PI / 2) * radius, 5.4, Math.sin(angle + Math.PI / 2) * radius);
    mesh.lookAt(0, 3.0, 0);
    // 上から降ってくる角度に寝かせる
    mesh.rotateX(-0.42);
    group.add(mesh);
    animatedUniforms.push(material.uniforms as { uTime: { value: number } });
  }

  // ============================== 篝火 ==============================
  const dotTexture = track(softDotTexture(64));
  const braziers: {
    sprite: THREE.Sprite;
    light: THREE.PointLight | null;
    phase: number;
    baseScale: number;
  }[] = [];
  const brazierBowlGeometry = track(new THREE.CylinderGeometry(0.42, 0.24, 0.5, 10));
  const brazierStemGeometry = track(new THREE.CylinderGeometry(0.12, 0.2, 1.5, 8));
  const brazierMaterial = track(
    new THREE.MeshStandardMaterial({ color: 0x2b2f45, roughness: 0.85, metalness: 0.35 }),
  );
  const flameMaterial = track(
    new THREE.SpriteMaterial({
      map: dotTexture,
      color: mood.ember.clone(),
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  // 像が掲げる炎(開口部の両脇)と、左右の壁ぎわに立つ燭台。
  // 前者は「門」を光で示し、後者は闘技場の横方向に暖色の起点を作る
  const addFlame = (at: THREE.Vector3, scale: number, withLight: boolean, phase: number): void => {
    const sprite = new THREE.Sprite(flameMaterial);
    sprite.position.copy(at);
    sprite.scale.setScalar(scale);
    group.add(sprite);
    let light: THREE.PointLight | null = null;
    if (withLight) {
      // ポイントライトは2基まで。モバイルGPUでのライト数を抑える
      light = new THREE.PointLight(mood.ember.clone(), 18, 20, 2);
      light.position.copy(at).add(new THREE.Vector3(0, 0.2, 0));
      group.add(light);
    }
    braziers.push({ sprite, light, phase, baseScale: scale });
  };

  statueBowls.forEach((at, index) => addFlame(at, 2.1, true, index * 1.7));

  for (const [index, angle] of [Math.PI * 0.5, Math.PI * 1.5].entries()) {
    const at = polar(angle, WALK_OUTER - 1.2);
    const stem = new THREE.Mesh(brazierStemGeometry, brazierMaterial);
    stem.position.set(at.x, TIER_TOP_Y + 0.75, at.z);
    stem.castShadow = true;
    group.add(stem);

    const bowl = new THREE.Mesh(brazierBowlGeometry, brazierMaterial);
    bowl.position.set(at.x, TIER_TOP_Y + 1.7, at.z);
    bowl.castShadow = true;
    group.add(bowl);

    addFlame(new THREE.Vector3(at.x, TIER_TOP_Y + 2.1, at.z), 1.9, false, 3.4 + index * 1.7);
  }

  // ============================== 地表の霞 ==============================
  // **闘技床の上には掛けない。**(MIST_FRAGMENT のコメント参照)
  const mistGeometry = track(new THREE.PlaneGeometry(52, 52));
  const mistLayers: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const material = track(
      new THREE.ShaderMaterial({
        vertexShader: GLOW_VERTEX,
        fragmentShader: MIST_FRAGMENT,
        uniforms: {
          uColor: { value: mood.mist.clone().multiplyScalar(i === 2 ? 0.8 : 1) },
          uOpacity: { value: i === 0 ? 0.3 : 0.2 },
          uTime: { value: 0 },
          uSeed: { value: i * 3.1 },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        fog: false,
      }),
    );
    const mesh = new THREE.Mesh(mistGeometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.22 + i * 0.55;
    group.add(mesh);
    mistLayers.push(mesh);
    animatedUniforms.push(material.uniforms as { uTime: { value: number } });
  }

  // ============================== 塵と火の粉 ==============================
  const makePoints = (
    count: number,
    color: THREE.Color,
    size: number,
    opacity: number,
    radiusRange: [number, number],
    heightRange: [number, number],
  ) => {
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    const swing = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const radius = radiusRange[0] + Math.random() * (radiusRange[1] - radiusRange[0]);
      const angle = Math.random() * Math.PI * 2;
      positions[i * 3 + 0] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = heightRange[0] + Math.random() * (heightRange[1] - heightRange[0]);
      positions[i * 3 + 2] = Math.sin(angle) * radius;
      speeds[i] = 0.12 + Math.random() * 0.4;
      swing[i] = Math.random() * Math.PI * 2;
    }
    const geometry = track(new THREE.BufferGeometry());
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = track(
      new THREE.PointsMaterial({
        color: color.clone(),
        size,
        map: dotTexture,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      }),
    );
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    group.add(points);
    return { geometry, positions, speeds, swing, count, top: heightRange[1] };
  };

  const dust = makePoints(300, mood.dust, 0.09, 0.4, [2, 20], [0, 11]);
  const embers = makePoints(110, mood.ember, 0.13, 0.62, [6, 18], [0.5, 9]);

  function update(elapsed: number): void {
    for (const uniforms of animatedUniforms) uniforms.uTime.value = elapsed;

    const drift = (set: typeof dust, rise: number, sway: number) => {
      const { positions, speeds, swing, count, geometry, top } = set;
      for (let i = 0; i < count; i++) {
        positions[i * 3 + 1] += speeds[i] * rise;
        positions[i * 3 + 0] += Math.sin(elapsed * 0.6 + swing[i]) * sway;
        if (positions[i * 3 + 1] > top) positions[i * 3 + 1] = 0;
      }
      geometry.attributes.position.needsUpdate = true;
    };
    drift(dust, 0.011, 0.0016);
    drift(embers, 0.02, 0.0032);

    // 霞をゆっくり逆回転させ、層の重なりで動きを見せる
    for (let i = 0; i < mistLayers.length; i++) {
      mistLayers[i].rotation.z = elapsed * (i % 2 === 0 ? 0.012 : -0.009);
    }
    // 雲海は層ごとに違う速さで回す。視差で「厚み」が出る
    for (const layer of cloudLayers) layer.mesh.rotation.z = elapsed * layer.spin;

    // 垂れ幕の揺れ。石だけの画面に動く布があると生きた場所に見える
    for (let i = 0; i < banners.length; i++) {
      banners[i].rotation.z = Math.sin(elapsed * 0.9 + i * 1.3) * 0.035;
    }

    // 篝火のゆらぎ
    for (const brazier of braziers) {
      const flicker =
        0.86 + Math.sin(elapsed * 6.1 + brazier.phase) * 0.08 + Math.sin(elapsed * 11.3 + brazier.phase) * 0.05;
      brazier.sprite.scale.setScalar(brazier.baseScale * flicker);
      if (brazier.light) brazier.light.intensity = 18 * flicker;
    }
  }

  function dispose(): void {
    for (const item of disposables) item.dispose();
  }

  return { group, update, dispose };
}
