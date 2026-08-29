/**
 * 背景の「絵」をPNGとして焼き出す。
 *
 *   node tools/bakeArt.mjs [出力先]        既定: src/web/assets
 *
 * ## なぜコードで描くのではなく画像にするのか
 *
 * CSSのグラデーションと多角形で作った背景は、遠目には通っても
 * **近くで見ると必ず「図形の重ね合わせ」に見える。**稜線は直線の連なりで、
 * 空は帯で、霧は一様な半透明にしかならない。絵に見える要素——
 * 雲の房、岩肌のざらつき、光が空気中の粒に散る様子——は、
 * ノイズを何層も積んで初めて出る。それを毎フレーム計算するのは無駄なので、
 * **一度だけ焼いてPNGにする。**
 *
 * ここではAIで絵を生成しているのではなく、
 * フラクタルノイズを積んだシェーダを1枚の板に貼って撮っている。
 * モンスターの肖像(src/web/three/portrait.ts)と同じ考え方で、
 * あちらは3Dモデルを、こちらは手続き的な風景を焼いている。
 *
 * 焼いたPNGは `src/web/assets/` に置き、CSSから background-image で参照する。
 */
import { chromium } from "playwright";
import { chromiumExecutablePath } from "./lib/chromium.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const outDir = process.argv[2] ?? "src/web/assets";
const log = (...args) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...args);

/**
 * 焼くもの一覧。
 * `seed` を変えると同じ作りのまま別の絵になる。`palette` は色の三段(空/山/靄)。
 */
const PIECES = [
  {
    name: "home-hero",
    width: 720,
    height: 1560,
    seed: 33.4,
    // ホームの地。**霧の奥に巨大な何かが居る**構図。
    // UIはこの絵の上に浮かぶので、絵そのものは暗く、輪郭だけを残す
    palette: { sky: [0.05, 0.04, 0.11], far: [0.22, 0.11, 0.34], near: [0.03, 0.02, 0.07], glow: [0.46, 0.2, 0.62] },
    horizon: 0.5,
    ridges: 4,
    starAmount: 0.7,
    beast: 1,
  },
  {
    name: "home-bg",
    width: 620,
    height: 1344,
    seed: 21.7,
    // ホームの地。紫〜藍。上ほど暗く、下で紫が灯る
    palette: { sky: [0.09, 0.07, 0.19], far: [0.28, 0.16, 0.42], near: [0.06, 0.05, 0.13], glow: [0.55, 0.26, 0.72] },
    horizon: 0.62,
    ridges: 4,
    starAmount: 0.85,
  },
  {
    // どの画面にも共通で敷く地。ホームより暗く、静かに。
    // 全画面が同じ世界の上にあると分かることで、UIが道具箱に見えなくなる
    name: "world-bg",
    width: 620,
    height: 1344,
    seed: 77.2,
    palette: { sky: [0.035, 0.028, 0.075], far: [0.14, 0.075, 0.23], near: [0.022, 0.016, 0.05], glow: [0.3, 0.14, 0.44] },
    horizon: 0.42,
    ridges: 5,
    starAmount: 0.55,
    beast: 1,
  },
  {
    name: "adventure-bg",
    width: 1000,
    height: 420,
    seed: 8.3,
    // 冒険へ出る帯。奥に灯りのある街、手前に紫の靄
    palette: { sky: [0.12, 0.07, 0.24], far: [0.42, 0.19, 0.5], near: [0.05, 0.03, 0.11], glow: [0.78, 0.33, 0.8] },
    horizon: 0.55,
    ridges: 5,
    starAmount: 0.35,
  },
  {
    name: "summon-bg",
    width: 620,
    height: 420,
    seed: 44.1,
    // 召喚。紫の光柱が立つ祭壇
    palette: { sky: [0.14, 0.06, 0.26], far: [0.52, 0.2, 0.66], near: [0.07, 0.03, 0.14], glow: [0.86, 0.42, 1.0] },
    horizon: 0.7,
    ridges: 2,
    starAmount: 0.5,
  },
  {
    name: "shop-bg",
    width: 620,
    height: 420,
    seed: 63.9,
    // ショップ。金と青。宝の気配
    palette: { sky: [0.06, 0.1, 0.22], far: [0.18, 0.34, 0.55], near: [0.03, 0.06, 0.14], glow: [0.95, 0.72, 0.36] },
    horizon: 0.66,
    ridges: 3,
    starAmount: 0.4,
  },
];

/**
 * 風景を1枚の板に描くフラグメントシェーダ。
 *
 * 層の順に:
 *   空のグラデーション → 星 → 雲(fbm) → 稜線を奥から手前へ → 靄 → 粒 → 四隅の落ち込み
 *
 * 稜線は「直線を折った多角形」ではなく**ノイズの等高線**で作る。
 * こうすると尾根の起伏に大小の差が出て、切り絵に見えない。
 */
const FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uSeed;
uniform float uHorizon;
uniform float uRidges;
uniform float uStars;
uniform vec3 uSky;
uniform vec3 uFar;
uniform vec3 uNear;
uniform vec3 uGlow;
uniform float uAspect;
uniform float uBeast;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21) + uSeed);
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

/** 重ねたノイズ。1枚では雲にも岩肌にもならない */
float fbm(vec2 p, int octaves) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    sum += noise(p) * amp;
    p *= 2.03;
    amp *= 0.5;
  }
  return sum;
}

void main() {
  vec2 uv = vUv;
  float h = uHorizon;

  // --- 空。上ほど暗く、地平の手前で色が灯る
  float sky = smoothstep(1.0, h, uv.y);
  vec3 color = mix(uSky, uFar, pow(sky, 1.9));
  // 地平線の光。空気の中で散っている感じを出す
  float bloomBand = exp(-pow((uv.y - h) * 5.0, 2.0));
  color += uGlow * bloomBand * 0.3;

  // --- 星。地平より上だけ。
  // 縦横比を掛けないと格子が伸びて、星が「短い線」になる(実際にそうなった)
  if (uv.y > h) {
    vec2 sp = vec2(uv.x * uAspect, uv.y) * 190.0;
    vec2 cell = floor(sp);
    float s = hash(cell);
    if (s > 0.9955) {
      // 格子の中心からの距離で丸く落とす。四角い点にしない
      float d = length(fract(sp) - 0.5);
      float star = smoothstep(0.34, 0.0, d) * uStars;
      color += vec3(0.88, 0.9, 1.0) * star * (0.45 + 0.55 * hash(cell + 7.0));
    }
  }

  // --- 雲。横に流れるよう縦を潰す
  float cloud = fbm(vec2(uv.x * 3.2, (uv.y - h) * 7.0) + uSeed, 6);
  cloud *= smoothstep(h - 0.02, h + 0.34, uv.y);
  color = mix(color, mix(uFar, uGlow, 0.35), cloud * 0.34);

  // --- 霧の奥の廃墟。
  //
  // 参考にした画面には「背景に大きな竜がぼんやり居る」層があった。
  // 竜を手続きで描こうとして頭と二本の角を置いたが、**兎の耳にしか見えなかった。**
  // 生き物の輪郭は少しの狂いで別の生き物になる。建物ならその危険がない。
  // 尖塔をいくつか立て、窓に灯りを入れて「まだ誰か居る廃墟」にする。
  if (uBeast > 0.5) {
    float towers = 0.0;
    float windows = 0.0;
    for (int t = 0; t < 4; t++) {
      float ft = float(t);
      // 等間隔に並べるとアンテナに見える。間隔も位置も崩す
      float cx = 0.2 + ft * 0.2 + (hash(vec2(ft, 3.0)) - 0.5) * 0.16;
      // 中央ほど高く、端は低い。並びに主従を作る
      float tall = 0.16 + (1.0 - abs(cx - 0.5) * 1.6) * 0.3 + hash(vec2(ft, 9.0)) * 0.22;
      float top = h + tall * 0.42;
      // 針のように細いと塔に見えない。太さも大きくばらけさせる
      float halfW = 0.026 + hash(vec2(ft, 5.0)) * 0.03;
      // 上へ向かって細る
      float taper = mix(1.0, 0.72, clamp((uv.y - h) / max(tall * 0.42, 0.001), 0.0, 1.0));
      float dx = abs(uv.x - cx);
      // 足元は地平よりずっと下から立ち上げる。手前の稜線に隠れて「奥にある」ことになる
      if (uv.y > h - 0.34 && uv.y < top && dx < halfW * taper) towers = 1.0;
      // 屋根。三角に尖らせる
      float roofH = 0.04 + hash(vec2(ft, 7.0)) * 0.055;
      if (uv.y >= top && uv.y < top + roofH) {
        float k = (uv.y - top) / roofH;
        if (dx < halfW * taper * (1.0 - k)) towers = 1.0;
      }
      // 窓。縦に並べる
      float wy = fract((uv.y - h) * 26.0);
      if (uv.y > h + 0.03 && uv.y < top - 0.02 && dx < halfW * taper * 0.3 && wy > 0.68) {
        windows = max(windows, hash(vec2(ft, floor((uv.y - h) * 26.0))) > 0.45 ? 1.0 : 0.0);
      }
    }
    if (towers > 0.5) {
      // 霧の中なので暗く沈める。石肌だけ少し割る
      float stone = fbm(vec2(uv.x * 40.0, uv.y * 40.0) + 6.0, 3);
      color = mix(color, uNear * (0.5 + stone * 0.5), 0.88);
      color += uGlow * windows * 0.9;
    }
  }

  // --- 稜線。奥から手前へ、暗く・大きく
  int ridgeCount = int(uRidges);
  for (int i = 0; i < 6; i++) {
    if (i >= ridgeCount) break;
    float t = float(i) / max(1.0, uRidges - 1.0);
    // 手前ほど低い位置から立ち上がり、起伏が大きい
    float base = h - 0.04 - t * h * 0.72;
    float scale = mix(2.4, 5.6, t);
    // 起伏。奥は低く、手前ほど高くそびえる
    float amp = mix(0.09, 0.30, t);
    // **稜線は「尾根ノイズ」で作る。**素のfbmだと起伏がなだらかな波にしかならず、
    // 山ではなく海の絵になる(実際にそうなった)。1-|2n-1| で折り返すと
    // 谷が尖り、大小の峰が混ざった輪郭になる
    float n = fbm(vec2(uv.x * scale + float(i) * 13.7, float(i) * 4.1), 5);
    float peaks = 1.0 - abs(n * 2.0 - 1.0);
    peaks = pow(peaks, 1.35);
    // 大きな起伏を1枚重ねて、峰の高さ自体に差を作る
    float sway = (fbm(vec2(uv.x * (scale * 0.32) + float(i) * 5.3, 2.0), 3) - 0.5) * 2.0;
    float ridge = base + peaks * amp + sway * amp * 0.75;
    if (uv.y < ridge) {
      // 奥は空の色に溶かし、手前は沈める(空気遠近)
      vec3 rock = mix(mix(uFar, uSky, 0.35), uNear, pow(t, 0.7));
      // 岩肌。細かいノイズで面を割る
      float grain = fbm(vec2(uv.x * 26.0, uv.y * 26.0) + float(i), 4);
      rock *= 0.82 + grain * 0.36;
      // 尾根の上端だけ光を拾う
      float rim = smoothstep(ridge - 0.012, ridge, uv.y);
      rock += uGlow * rim * (0.3 - t * 0.22);
      color = rock;
    }
  }

  // --- 靄。稜線の足元を溶かして、切り絵に見えないようにする
  float haze = smoothstep(h + 0.05, -0.05, uv.y);
  color = mix(color, mix(uNear, uGlow, 0.22), haze * 0.42);

  // --- 粒。均一な面が残ると印刷物のように見える
  color += (hash(uv * 900.0) - 0.5) * 0.022;

  // --- 四隅の落ち込み
  vec2 d = uv - 0.5;
  color *= 1.0 - dot(d, d) * 0.75;

  gl_FragColor = vec4(max(color, 0.0), 1.0);
}
`;

async function main() {
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch({
    executablePath: chromiumExecutablePath(),
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
  });

  try {
    const page = await browser.newPage({ viewport: { width: 100, height: 100 } });
    // three はローカルの node_modules から読ませる(外へ取りに行かない)
    await page.goto("about:blank");

    for (const piece of PIECES) {
      const dataUrl = await page.evaluate(
        async ({ piece, fragment }) => {
          const canvas = document.createElement("canvas");
          canvas.width = piece.width;
          canvas.height = piece.height;
          const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
          if (!gl) throw new Error("WebGLコンテキストを取得できませんでした");

          const compile = (type, source) => {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
              throw new Error("シェーダのコンパイルに失敗: " + gl.getShaderInfoLog(shader));
            }
            return shader;
          };

          const program = gl.createProgram();
          gl.attachShader(program, compile(gl.VERTEX_SHADER, `
            attribute vec2 aPos;
            varying vec2 vUv;
            void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }
          `));
          gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
          gl.linkProgram(program);
          if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            throw new Error("プログラムのリンクに失敗: " + gl.getProgramInfoLog(program));
          }
          gl.useProgram(program);

          const buffer = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
          const loc = gl.getAttribLocation(program, "aPos");
          gl.enableVertexAttribArray(loc);
          gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

          const u = (name) => gl.getUniformLocation(program, name);
          gl.uniform1f(u("uSeed"), piece.seed);
          gl.uniform1f(u("uHorizon"), piece.horizon);
          gl.uniform1f(u("uRidges"), piece.ridges);
          gl.uniform1f(u("uStars"), piece.starAmount);
          gl.uniform1f(u("uAspect"), piece.width / piece.height);
          gl.uniform1f(u("uBeast"), piece.beast ?? 0);
          gl.uniform3fv(u("uSky"), piece.palette.sky);
          gl.uniform3fv(u("uFar"), piece.palette.far);
          gl.uniform3fv(u("uNear"), piece.palette.near);
          gl.uniform3fv(u("uGlow"), piece.palette.glow);

          gl.viewport(0, 0, piece.width, piece.height);
          gl.drawArrays(gl.TRIANGLES, 0, 3);

          // 背景に透過は要らない。**PNGだとノイズが圧縮に乗らず数MBになる**
          // (実測で860x1864が2.5MB)。PWAで毎回落とす重さではない
          return canvas.toDataURL("image/jpeg", 0.86);
        },
        { piece, fragment: FRAGMENT },
      );

      const base64 = dataUrl.split(",")[1];
      const file = path.join(outDir, `${piece.name}.jpg`);
      await writeFile(file, Buffer.from(base64, "base64"));
      log(`${file} (${piece.width}x${piece.height})`);
    }
  } finally {
    await browser.close();
  }

  log("完了。CSSから background-image で参照してください");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
