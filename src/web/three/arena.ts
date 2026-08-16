import * as THREE from "three";
import { SIMPLEX_NOISE_3D } from "./shaderChunks.js";

/**
 * 闘技場「蒼穹のコロッセウム」。
 *
 * 構造は外側へ向かって
 *   闘技床(r=13) → 観客席の段(r=13→18.4) → 列柱(r=17.9) → 石壁(r=20)
 * の順に積み上がる。カメラは常に手前側の低い位置から見下ろすので、
 * 画面に映るのは「床・奥の段・奥の列柱・奥の壁」で、手前側の建築は
 * フレーム外に落ちる。それでも全周を作ってあるのは、画面比が変わっても
 * 破綻しないようにするため。
 *
 * 見た目の狙い:
 *  - 冷たい青の環境光 + 篝火の暖色、という寒暖のコントラスト
 *  - 奥のゲートから漏れる光でキャラのシルエットを背景から抜く
 *  - 霞・塵・光条で「空気」を作り、平坦な3D感を消す
 */

// --- 寸法 ---
const FLOOR_RADIUS = 13.0;
const TIER_INNER = 13.0;
const TIER_OUTER = 18.4;
/**
 * 観客席の頂点の高さ。ここが低いと段が床とほぼ同一平面に見え、
 * 「闘技場の底で戦っている」感じが出ない。奥の段がカメラの上方へ
 * せり上がるくらいまで起こして、画面上部の空白を情報で埋める。
 */
const TIER_TOP_Y = 3.05;
const TIER_STEPS = 7;
const COLUMN_RADIUS = 17.9;
const COLUMN_COUNT = 24;
const COLUMN_BASE_Y = TIER_TOP_Y;
const COLUMN_SHAFT_H = 2.95;
const WALL_RADIUS = 20.0;
const WALL_HEIGHT = 7.2;

// --- 色 ---
const STONE_LIGHT = "#6d7186";
const STONE_MID = "#4b4f63";
const STONE_DARK = "#2e3145";
const STONE_DEEP = "#191b2b";
const GROUT = "#14161f";
const RUNE = "#7fd4ff";
const EMBER = "#ff9a4a";

const SKY_VERTEX = /* glsl */ `
varying vec3 vWorld;
void main() {
  vWorld = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * 空。地平線より下は霧の色に寄せてあるので、遠景の建築が
 * そのまま霞に溶け込む。奥(-Z)側にだけ暖色の光源を置き、
 * 敵チームの背後が明るくなるようにしている。
 */
const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uMid;
uniform vec3 uHaze;
uniform vec3 uGlow;
uniform vec3 uOrbColor;
uniform vec3 uOrbDir;
uniform float uOrbSize;
uniform float uStars;
uniform float uTime;
varying vec3 vWorld;

${SIMPLEX_NOISE_3D}

void main() {
  vec3 dir = normalize(vWorld);
  float h = dir.y;

  vec3 color = mix(uHaze, uMid, smoothstep(-0.05, 0.34, h));
  color = mix(color, uZenith, smoothstep(0.3, 0.95, h));

  // 地平線のすぐ下は霧の色そのもの(遠景がシームレスに溶ける)
  color = mix(color, uHaze, smoothstep(0.02, -0.16, h));

  // 奥側の光源。方位で減衰させ、片側だけを暖かくする
  float back = max(0.0, -dir.z);
  float glow = pow(back, 3.0) * exp(-abs(h - 0.06) * 5.0);
  color += uGlow * glow * 0.85;

  // 天体。空に一点だけ「光源の実体」があると、逆光の理由が画の中で完結する。
  // 円盤そのものは小さく、外側の暈(かさ)を広く取って空気の厚みを見せる
  float toOrb = max(0.0, dot(dir, normalize(uOrbDir)));
  float disc = smoothstep(1.0 - uOrbSize, 1.0 - uOrbSize * 0.45, toOrb);
  float halo = pow(toOrb, 26.0) * 0.55 + pow(toOrb, 5.0) * 0.16;
  color += uOrbColor * (disc * 0.9 + halo);

  // ゆっくり流れる高層の雲。天体の側だけ縁が光り、層の前後関係が出る
  float clouds = fbm(vec3(dir.xz * 1.7 + vec2(uTime * 0.006, 0.0), uTime * 0.01));
  float deck = smoothstep(0.15, 0.8, clouds) * smoothstep(0.0, 0.45, h);
  color += uMid * deck * 0.30;
  color += uOrbColor * deck * pow(toOrb, 3.0) * 0.35;

  // 星。地平線近くは霞んで見えない
  float stars = snoise(dir * 120.0);
  color += vec3(0.75, 0.82, 1.0) * smoothstep(0.955, 1.0, stars) * smoothstep(0.25, 0.85, h) * uStars;

  gl_FragColor = vec4(color, 1.0);
}
`;

/** 追加合成のソフトなグラデーション板(光の柱・霞・ゲートの光に使う) */
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
  float radial = 1.0 - smoothstep(0.16, 0.5, length(p));
  float n = fbm(vec3(p * 5.0, uTime * 0.05 + uSeed * 10.0));
  float a = radial * smoothstep(0.25, 0.85, n) * uOpacity;
  gl_FragColor = vec4(uColor, a);
}
`;

const GATE_FRAGMENT = /* glsl */ `
uniform vec3 uInner;
uniform vec3 uOuter;
uniform float uOpacity;
uniform float uTime;
varying vec2 vUv;

void main() {
  vec2 p = (vUv - vec2(0.5, 0.42)) * vec2(2.1, 1.55);
  float d = length(p);
  float core = 1.0 - smoothstep(0.0, 0.55, d);
  float halo = 1.0 - smoothstep(0.2, 1.0, d);
  float pulse = 0.9 + 0.1 * sin(uTime * 0.5);
  vec3 color = mix(uOuter, uInner, core);
  gl_FragColor = vec4(color, (core * 0.75 + halo * 0.45) * uOpacity * pulse);
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
function drawFloorTexture(size: number, grayscale: boolean): HTMLCanvasElement {
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
    ctx.fillStyle = grayscale
      ? tone > 0.5
        ? "#cfcfcf"
        : "#9a9a9a"
      : tone > 0.5
        ? STONE_LIGHT
        : STONE_DARK;
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

  // 中央の紋章。うっすらとした線画で、床の主役になりすぎない濃さにする
  ctx.save();
  ctx.translate(c, c);
  ctx.strokeStyle = pick(RUNE, "#d8d8d8");
  ctx.globalAlpha = grayscale ? 0.25 : 0.32;
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
  for (let i = 0; i < 90; i++) {
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
    vignette.addColorStop(0, "rgba(150,164,214,0.16)");
    vignette.addColorStop(0.45, "rgba(0,0,0,0)");
    vignette.addColorStop(0.8, "rgba(6,7,16,0.42)");
    vignette.addColorStop(1, "rgba(4,5,12,0.78)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, size, size);
  }

  sprinkleGrain(ctx, size, size, grayscale ? 14 : 20, 4471);
  return canvas;
}

/**
 * 外周の壁。円柱の内側に貼るので、横1タイル分にアーチ2連を描き、
 * 周方向に12回繰り返す。emissive側はアーチの奥だけを光らせる。
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
        ctx.fillStyle = `rgba(${Math.round(58 * tone)},${Math.round(62 * tone)},${Math.round(84 * tone)},1)`;
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

    // 全体を下ほど暗くして、床との接地を締める
    const shade = ctx.createLinearGradient(0, 0, 0, h);
    shade.addColorStop(0, "rgba(120,140,210,0.12)");
    shade.addColorStop(0.55, "rgba(0,0,0,0)");
    shade.addColorStop(1, "rgba(3,4,10,0.55)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, w, h);

    sprinkleGrain(ctx, w, h, 16, 8823);
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

export function createArena(): ArenaHandles {
  const group = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];
  const animatedUniforms: { uTime: { value: number } }[] = [];

  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  // ============================== 空 ==============================
  const skyGeometry = track(new THREE.SphereGeometry(160, 32, 20));
  const skyMaterial = track(
    new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      uniforms: {
        uZenith: { value: new THREE.Color(0x060814) },
        uMid: { value: new THREE.Color(0x1b2245) },
        uHaze: { value: new THREE.Color(0x2a3055) },
        uGlow: { value: new THREE.Color(0x8a5570) },
        uOrbColor: { value: new THREE.Color(0xffc98f) },
        uOrbDir: { value: new THREE.Vector3(-0.34, 0.15, -1).normalize() },
        uOrbSize: { value: 0.014 },
        uStars: { value: 0.55 },
        uTime: { value: 0 },
      },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    }),
  );
  const sky = new THREE.Mesh(skyGeometry, skyMaterial);
  sky.renderOrder = -10;
  group.add(sky);
  animatedUniforms.push(skyMaterial.uniforms as { uTime: { value: number } });

  // ============================== 闘技床 ==============================
  const floorMap = track(textureFrom(drawFloorTexture(1024, false), true));
  const floorRough = track(textureFrom(drawFloorTexture(512, true), false));
  const floorGeometry = track(new THREE.CircleGeometry(FLOOR_RADIUS, 96));
  const floorMaterial = track(
    new THREE.MeshStandardMaterial({
      map: floorMap,
      roughnessMap: floorRough,
      // 磨かれた石。ここを 0.8 台に上げると床が紙のように沈み、
      // 空や篝火の映り込みが一切出なくなる。0.5 前後が
      // 「艶はあるが鏡ではない」ちょうどの値
      roughness: 0.52,
      metalness: 0.14,
      envMapIntensity: 1.25,
      color: 0xffffff,
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
      color: new THREE.Color(RUNE),
      transparent: true,
      opacity: 0.34,
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
  // 内側から外側へ、4段の階段状に立ち上げる(LatheGeometryで一体成型)
  const tierProfile: THREE.Vector2[] = [];
  const tierSteps = TIER_STEPS;
  /** i段目の踏み面の半径と高さ。観客の配置と共有する */
  const tierAt = (i: number): { r: number; y: number } => ({
    r: THREE.MathUtils.lerp(TIER_INNER, TIER_OUTER, i / tierSteps),
    y: TIER_TOP_Y * (i / tierSteps),
  });
  for (let i = 0; i <= tierSteps; i++) {
    const { r, y } = tierAt(i);
    const rPrev = tierAt(Math.max(0, i - 1)).r;
    if (i > 0) tierProfile.push(new THREE.Vector2(rPrev, y)); // 蹴上げ
    tierProfile.push(new THREE.Vector2(r, y)); // 踏み面
  }
  tierProfile.unshift(new THREE.Vector2(TIER_INNER, -0.4));
  const tierGeometry = track(new THREE.LatheGeometry(tierProfile, 64));
  const tierMaterial = track(
    new THREE.MeshStandardMaterial({
      color: 0x353a51,
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
  // 段だけを立てても、それは「空っぽの階段」にしか見えない。
  // 人影が乗って初めて奥行きの目盛りになる。1人ずつは判別できない距離なので、
  // 形は作り込まず**背の高さと肩幅をばらけさせる**ことに全部を使う。
  // 個体を動かすと1000近い行列を毎フレーム書くことになるので、
  // 群衆は静止させ、動きは手持ちの灯り(下の点群)の明滅だけで見せる。
  {
    const crowdRandom = makeRandom(60313);
    const bodies: { position: THREE.Vector3; scale: THREE.Vector3; angle: number }[] = [];
    const torchPositions: number[] = [];
    for (let i = 1; i <= tierSteps; i++) {
      const { r, y } = tierAt(i);
      // 半径に比例して人数を決め、どの段でも肩の詰まり具合が同じになるようにする
      const seats = Math.round((2 * Math.PI * r) / 0.62);
      for (let s = 0; s < seats; s++) {
        // 席をわずかに乱して、整列した点線に見えないようにする
        const angle = ((s + (crowdRandom() - 0.5) * 0.55) / seats) * Math.PI * 2;
        const radius = r - 0.28 - crowdRandom() * 0.5;
        const height = 0.62 + crowdRandom() * 0.42;
        bodies.push({
          position: new THREE.Vector3(Math.cos(angle) * radius, y + height * 0.5, Math.sin(angle) * radius),
          scale: new THREE.Vector3(0.8 + crowdRandom() * 0.45, height / 0.9, 0.8 + crowdRandom() * 0.45),
          angle,
        });
        // 12人に1人くらいが灯りを掲げている
        if (crowdRandom() < 0.085) {
          torchPositions.push(
            Math.cos(angle) * (radius - 0.12),
            y + height + 0.16,
            Math.sin(angle) * (radius - 0.12),
          );
        }
      }
    }

    const crowdGeometry = track(new THREE.CapsuleGeometry(0.19, 0.52, 3, 6));
    const crowdMaterial = track(
      new THREE.MeshStandardMaterial({ color: 0x1d1f2e, roughness: 0.95, metalness: 0.0 }),
    );
    const crowd = new THREE.InstancedMesh(crowdGeometry, crowdMaterial, bodies.length);
    const crowdColor = new THREE.Color();
    const crowdMatrix = new THREE.Matrix4();
    const crowdQuat = new THREE.Quaternion();
    const upAxis = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i];
      crowdQuat.setFromAxisAngle(upAxis, -body.angle);
      crowdMatrix.compose(body.position, crowdQuat, body.scale);
      crowd.setMatrixAt(i, crowdMatrix);
      // 濃さを散らす。全部同じ黒だと、切り絵を並べたように平らになる
      const tone = 0.55 + crowdRandom() * 0.9;
      crowdColor.setRGB(0.42 * tone, 0.40 * tone, 0.52 * tone);
      crowd.setColorAt(i, crowdColor);
    }
    crowd.instanceMatrix.needsUpdate = true;
    if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true;
    crowd.castShadow = false;
    crowd.receiveShadow = true;
    group.add(crowd);
    disposables.push({ dispose: () => crowd.dispose() });

    // 観客の手持ちの灯り。遠景に散った小さな暖色の点は、
    // 「そこに人がいる」ことを形より確実に伝える
    const torchGeometry = track(new THREE.BufferGeometry());
    torchGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(torchPositions), 3));
    const torchMaterial = track(
      new THREE.PointsMaterial({
        color: 0xffb469,
        size: 0.24,
        map: track(softDotTexture(32)),
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      }),
    );
    const torches = new THREE.Points(torchGeometry, torchMaterial);
    group.add(torches);
  }

  // ============================== 外周の壁 ==============================
  const wallColor = track(textureFrom(drawWallTexture(512, 340, "color"), true));
  const wallEmissive = track(textureFrom(drawWallTexture(512, 340, "emissive"), true));
  const wallRough = track(textureFrom(drawWallTexture(256, 170, "rough"), false));
  for (const texture of [wallColor, wallEmissive, wallRough]) texture.repeat.set(12, 1);
  const wallGeometry = track(new THREE.CylinderGeometry(WALL_RADIUS, WALL_RADIUS, WALL_HEIGHT, 72, 1, true));
  const wallMaterial = track(
    new THREE.MeshStandardMaterial({
      map: wallColor,
      emissiveMap: wallEmissive,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.85,
      roughnessMap: wallRough,
      roughness: 0.95,
      metalness: 0.02,
      side: THREE.BackSide,
    }),
  );
  const wall = new THREE.Mesh(wallGeometry, wallMaterial);
  wall.position.y = TIER_TOP_Y + WALL_HEIGHT / 2 - 0.6;
  group.add(wall);

  // 壁のさらに上、天へ抜ける胸壁。切れているように見せないための帯
  const parapetGeometry = track(new THREE.CylinderGeometry(WALL_RADIUS + 0.45, WALL_RADIUS + 0.45, 1.2, 72, 1, true));
  const parapetMaterial = track(
    new THREE.MeshStandardMaterial({ color: 0x262a3e, roughness: 0.95, metalness: 0.02, side: THREE.DoubleSide }),
  );
  const parapet = new THREE.Mesh(parapetGeometry, parapetMaterial);
  parapet.position.y = TIER_TOP_Y + WALL_HEIGHT - 0.05;
  group.add(parapet);

  // ============================== 遠景の尖塔 ==============================
  // 空気遠近は「霞ませる」だけでは出ない。**霞の中に見えるもの**が要る。
  // 壁の向こうに塔を立てると、そこまでの距離を測る目盛りになり、
  // 同時に画面上部の空白が埋まる。近い塔は輪郭が立ち、遠い塔は霧に沈む
  // ——この差そのものが奥行きの情報になる。
  {
    const spireRandom = makeRandom(31771);
    const spireMaterial = track(
      new THREE.MeshStandardMaterial({ color: 0x232741, roughness: 1.0, metalness: 0.0, flatShading: true }),
    );
    const spireGeometry = track(new THREE.CylinderGeometry(0.62, 1.05, 1, 6, 1));
    const roofGeometry = track(new THREE.ConeGeometry(0.92, 1, 6, 1));
    const spires: { x: number; z: number; h: number; w: number }[] = [];
    for (let i = 0; i < 34; i++) {
      const angle = spireRandom() * Math.PI * 2;
      const radius = 27 + spireRandom() * 26;
      spires.push({
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        // 遠いものほど高くないと壁に隠れるので、半径に応じて背を伸ばす
        h: 11 + (radius - 27) * 0.55 + spireRandom() * 13,
        w: 0.75 + spireRandom() * 1.5,
      });
    }
    const spireMatrix = new THREE.Matrix4();
    const spireQuat = new THREE.Quaternion();
    const towers = new THREE.InstancedMesh(spireGeometry, spireMaterial, spires.length);
    const roofs = new THREE.InstancedMesh(roofGeometry, spireMaterial, spires.length);
    for (let i = 0; i < spires.length; i++) {
      const s = spires[i];
      spireQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), spireRandom() * Math.PI);
      spireMatrix.compose(
        new THREE.Vector3(s.x, s.h * 0.5, s.z),
        spireQuat,
        new THREE.Vector3(s.w, s.h, s.w),
      );
      towers.setMatrixAt(i, spireMatrix);
      spireMatrix.compose(
        new THREE.Vector3(s.x, s.h + s.w * 1.35, s.z),
        spireQuat,
        new THREE.Vector3(s.w, s.w * 2.7, s.w),
      );
      roofs.setMatrixAt(i, spireMatrix);
    }
    towers.instanceMatrix.needsUpdate = true;
    roofs.instanceMatrix.needsUpdate = true;
    group.add(towers, roofs);
    disposables.push({ dispose: () => towers.dispose() }, { dispose: () => roofs.dispose() });
  }

  // ============================== 列柱 ==============================
  // 基礎・柱身・柱頭をそれぞれInstancedMeshにして、描画回数を3回に抑える
  const columnMaterial = track(
    new THREE.MeshStandardMaterial({ color: 0x585d75, roughness: 0.78, metalness: 0.08, flatShading: true }),
  );
  const baseGeometry = track(new THREE.CylinderGeometry(0.46, 0.52, 0.34, 10));
  const shaftGeometry = track(new THREE.CylinderGeometry(0.29, 0.34, COLUMN_SHAFT_H, 10, 1));
  const capGeometry = track(new THREE.CylinderGeometry(0.44, 0.32, 0.34, 10));
  const abacusGeometry = track(new THREE.BoxGeometry(0.94, 0.16, 0.94));

  const columnParts: { geometry: THREE.BufferGeometry; y: number }[] = [
    { geometry: baseGeometry, y: COLUMN_BASE_Y + 0.17 },
    { geometry: shaftGeometry, y: COLUMN_BASE_Y + 0.34 + COLUMN_SHAFT_H / 2 },
    { geometry: capGeometry, y: COLUMN_BASE_Y + 0.34 + COLUMN_SHAFT_H + 0.17 },
    { geometry: abacusGeometry, y: COLUMN_BASE_Y + 0.34 + COLUMN_SHAFT_H + 0.42 },
  ];
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const position = new THREE.Vector3();
  for (const part of columnParts) {
    const mesh = new THREE.InstancedMesh(part.geometry, columnMaterial, COLUMN_COUNT);
    for (let i = 0; i < COLUMN_COUNT; i++) {
      const angle = (i / COLUMN_COUNT) * Math.PI * 2 + Math.PI / COLUMN_COUNT;
      position.set(Math.cos(angle) * COLUMN_RADIUS, part.y, Math.sin(angle) * COLUMN_RADIUS);
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -angle);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(i, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    disposables.push({ dispose: () => mesh.dispose() });
  }

  // 柱の上に載る水平材(アーキトレーブ)。柱がバラバラの棒に見えないようつなぐ
  const architraveGeometry = track(
    new THREE.CylinderGeometry(COLUMN_RADIUS + 0.42, COLUMN_RADIUS + 0.42, 0.62, 64, 1, true),
  );
  const architraveMaterial = track(
    new THREE.MeshStandardMaterial({ color: 0x4a4f66, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide }),
  );
  const architrave = new THREE.Mesh(architraveGeometry, architraveMaterial);
  architrave.position.y = COLUMN_BASE_Y + 0.34 + COLUMN_SHAFT_H + 0.5 + 0.31;
  architrave.castShadow = true;
  group.add(architrave);

  // ============================== 奥のゲートの光 ==============================
  const gateGeometry = track(new THREE.PlaneGeometry(11.5, 8.5));
  const gateMaterial = track(
    new THREE.ShaderMaterial({
      vertexShader: GLOW_VERTEX,
      fragmentShader: GATE_FRAGMENT,
      uniforms: {
        uInner: { value: new THREE.Color(0xffd9a8) },
        uOuter: { value: new THREE.Color(0x7d5bb0) },
        uOpacity: { value: 0.5 },
        uTime: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    }),
  );
  const gate = new THREE.Mesh(gateGeometry, gateMaterial);
  gate.position.set(0, 3.6, -(WALL_RADIUS - 1.4));
  group.add(gate);
  animatedUniforms.push(gateMaterial.uniforms as { uTime: { value: number } });

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
          uColor: { value: new THREE.Color(i < 5 ? 0xbcd0ff : 0xffb073) },
          uOpacity: { value: i === 2 ? 0.16 : 0.1 },
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
  const braziers: { sprite: THREE.Sprite; light: THREE.PointLight | null; phase: number }[] = [];
  const brazierBowlGeometry = track(new THREE.CylinderGeometry(0.42, 0.24, 0.5, 10));
  const brazierStemGeometry = track(new THREE.CylinderGeometry(0.12, 0.2, 1.5, 8));
  const brazierMaterial = track(new THREE.MeshStandardMaterial({ color: 0x2b2f45, roughness: 0.85, metalness: 0.3 }));
  const flameMaterial = track(
    new THREE.SpriteMaterial({
      map: dotTexture,
      color: new THREE.Color(EMBER),
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  const brazierAngles = [Math.PI * 0.72, Math.PI * 1.28, Math.PI * 0.5, Math.PI * 1.5];
  brazierAngles.forEach((angle, index) => {
    const radius = TIER_OUTER - 2.4;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const y = TIER_TOP_Y * 0.78;

    const stem = new THREE.Mesh(brazierStemGeometry, brazierMaterial);
    stem.position.set(x, y + 0.75, z);
    stem.castShadow = true;
    group.add(stem);

    const bowl = new THREE.Mesh(brazierBowlGeometry, brazierMaterial);
    bowl.position.set(x, y + 1.7, z);
    bowl.castShadow = true;
    group.add(bowl);

    const sprite = new THREE.Sprite(flameMaterial);
    sprite.position.set(x, y + 2.1, z);
    sprite.scale.setScalar(2.4);
    group.add(sprite);

    // ポイントライトは奥側の2基だけ。モバイルGPUでのライト数を抑える
    let light: THREE.PointLight | null = null;
    if (index < 2) {
      light = new THREE.PointLight(0xff9a52, 14, 17, 2);
      light.position.set(x, y + 2.2, z);
      group.add(light);
    }
    braziers.push({ sprite, light, phase: index * 1.7 });
  });

  // ============================== 地表の霞 ==============================
  const mistGeometry = track(new THREE.PlaneGeometry(46, 46));
  const mistLayers: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const material = track(
      new THREE.ShaderMaterial({
        vertexShader: GLOW_VERTEX,
        fragmentShader: MIST_FRAGMENT,
        uniforms: {
          uColor: { value: new THREE.Color(i === 2 ? 0x8f7fb8 : 0x6d86c8) },
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
    color: number,
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
        color,
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

  const dust = makePoints(300, 0x9fb6ff, 0.09, 0.4, [2, 20], [0, 11]);
  const embers = makePoints(110, 0xff9c4e, 0.13, 0.62, [6, 18], [0.5, 9]);

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

    // 篝火のゆらぎ
    for (const brazier of braziers) {
      const flicker = 0.86 + Math.sin(elapsed * 6.1 + brazier.phase) * 0.08 + Math.sin(elapsed * 11.3 + brazier.phase) * 0.05;
      brazier.sprite.scale.setScalar(2.4 * flicker);
      if (brazier.light) brazier.light.intensity = 14 * flicker;
    }
  }

  function dispose(): void {
    for (const item of disposables) item.dispose();
  }

  return { group, update, dispose };
}
