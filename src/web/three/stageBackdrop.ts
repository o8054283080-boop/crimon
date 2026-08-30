import * as THREE from "three";
import { Element } from "../../core/element.js";

/**
 * 戦闘の舞台を1枚の絵で描く。
 *
 * ## なぜ3Dの闘技場を置き換えるのか
 *
 * モンスターは2Dの絵になった(`spriteAvatar.ts`)。
 * 舞台だけが3Dのまま残ると、**同じ画面に2つの世界が並ぶ。**
 * 手前の板は平たいのに、後ろの列柱には奥行きがあり、光の当たり方も違う。
 *
 * 描画回数の面でも大きい。闘技場は空・床・観客席・列柱・旗・松明で
 * 数十回を使っている。ここが1枚の板になると1回で済む。
 *
 * ## カメラの子にする理由
 *
 * 背景は「舞台の奥にある物」ではなく「画面そのもの」なので、
 * カメラが動いても付いて回らなければならない。
 * 世界に置くと、カメラの寄り引きで背景まで拡大縮小されてしまう。
 *
 * カメラの子にして、**表示範囲いっぱいに広げた板**を近くへ置く。
 * 正投影なので奥行きによる大きさの変化が無く、位置は好きに選べる。
 *
 * ## 絵の比と画面の比が合わない時
 *
 * `cover` で合わせる。**絵を引き伸ばさない。**
 * 縦長の絵を横長の画面に入れると上下が切れるが、
 * このゲームは縦持ち専用(`portraitOnly.css`)なので実害が無い。
 * 引き伸ばすと石畳が歪んで、一目で安っぽくなる。
 */

const BACKDROP_URLS = import.meta.glob<string>("../assets/stages/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});

/** ファイル名(拡張子なし) → URL */
const BY_NAME = new Map<string, string>();
for (const path of Object.keys(BACKDROP_URLS)) {
  const name = path.slice(path.lastIndexOf("/") + 1).replace(/\.webp$/, "");
  BY_NAME.set(name, BACKDROP_URLS[path]);
}

/** 属性 → 背景の名前 */
const ELEMENT_BACKDROP: Record<Element, string> = {
  FIRE: "arena-fire",
  WATER: "arena-water",
  GRASS: "arena-grass",
  ELECTRIC: "arena-electric",
  LIGHT: "arena-light",
  DARK: "arena-dark",
};

/**
 * その戦いの背景を探す。
 *
 * **属性専用 → 闘技場(万能の代役)** の順。
 * 6属性ぶんを描き切らないと何も出せない、という形にしない。
 * 絵が届いた属性から順に、その属性だけが専用の絵へ切り替わる。
 *
 * 1枚も無ければ null。呼び出し側はその時だけ3Dの闘技場のままになる。
 */
export function backdropUrlFor(element: Element | null): string | null {
  if (element) {
    const own = BY_NAME.get(ELEMENT_BACKDROP[element]);
    if (own) return own;
  }
  return BY_NAME.get("arena-duel") ?? null;
}

export interface BackdropOptions {
  url: string;
  /**
   * 全体を暗く落とす量(0〜1)。
   *
   * **届いた闘技場は床の明るさが0.75あった。**
   * 明るい背景の上に彩度の高いデフォルメの絵を置くと、
   * 輪郭が背景に埋もれて「何がいるか」が読めなくなる。
   * ここで落とすぶんは、絵を描き直さずに調整できる。
   */
  dim: number;
  /**
   * 左右の端を落とす量(0〜1)。
   *
   * HPと行動ゲージの札が左右の端に乗る(`docs/battle-background-art.md`)。
   * 明るい石畳の上に白い文字の札が乗ると読めない。
   * 絵の側で落としてもらう約束にしてあるが、**届いた絵は落ちていなかった。**
   * 描き直しを頼むより、載せる側で落とす方が速いし確実。
   */
  edge: number;
}

export interface BackdropHandles {
  /** カメラの子にする板 */
  mesh: THREE.Mesh;
  /** 表示範囲が変わった時に呼ぶ。板を画面いっぱいへ合わせ直す */
  fit(camera: THREE.OrthographicCamera): void;
  dispose(): void;
}

/**
 * 板をカメラから離す距離。
 *
 * **わざと近くに置く。** 深度で奥へ回すのではなく、
 * 深度を切って(`depthTest: false`)いちばん先に描くことで奥にしている。
 *
 * 最初は300離した所へ置いて、**背景が真っ黒になった。**
 * カメラの far は盤面の大きさから 160 前後に決まるので、
 * 300は far の外側。深度を切っても、**far の外は投影の段階で捨てられる。**
 * near(0.1)と far の間に必ず入る、小さな値にしておく。
 */
const BACKDROP_DISTANCE = 1;

export function createBackdrop(options: BackdropOptions): BackdropHandles {
  /*
   * 読み込みが終わるまで絵の縦横比が分からない。
   * 終わった時点でもう一度合わせ直さないと、**切り出しが 1:1 のまま**になり
   * 背景が横へ潰れる。最後に渡されたカメラを覚えておいて、そこで合わせ直す。
   */
  let lastCamera: THREE.OrthographicCamera | null = null;
  const texture = new THREE.TextureLoader().load(options.url, () => {
    if (lastCamera) fit(lastCamera);
  });
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  /*
   * **端を伸ばす。** cover で合わせるので普通は端が見えないが、
   * 画素のずれで1列だけ反対側の端が回り込むことがある(繰り返しの既定値)。
   * 石畳の背景で空の色が下端に1本入ると、はっきり分かる。
   */
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: texture },
      /** 絵の中で実際に使う範囲(cover の切り出し)。x,y が原点、z,w が大きさ */
      uCrop: { value: new THREE.Vector4(0, 0, 1, 1) },
      uDim: { value: options.dim },
      uEdge: { value: options.edge },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform vec4 uCrop;
      uniform float uDim;
      uniform float uEdge;
      varying vec2 vUv;

      void main() {
        vec4 texel = texture2D(uMap, uCrop.xy + vUv * uCrop.zw);

        // 左右の端を落として、HPの札が読めるようにする。
        // 0.13 は docs/battle-background-art.md で絵の側にも頼んでいる幅
        float side = min(vUv.x, 1.0 - vUv.x) / 0.13;
        float rail = mix(1.0 - uEdge, 1.0, clamp(side, 0.0, 1.0));

        // 下は操作欄が覆うので、そこへ向かって少し沈める。
        // 段差にすると帯が見えるので、なだらかに繋ぐ
        float foot = mix(1.0 - uEdge * 0.7, 1.0, clamp(vUv.y / 0.14, 0.0, 1.0));

        gl_FragColor = vec4(texel.rgb * (1.0 - uDim) * rail * foot, 1.0);
      }
    `,
    /*
     * **深度は書かず、読まない。** 背景は必ず最初に描かれて、
     * その後の全部がその上へ乗る。renderOrder と合わせて、
     * 「一番奥にある」ことを深度に頼らず保証する。
     */
    depthWrite: false,
    depthTest: false,
    // 霧は舞台を奥へ退かせるための仕掛け。背景そのものに掛けると全体が霞む
    fog: false,
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  mesh.position.z = -BACKDROP_DISTANCE;
  mesh.renderOrder = -1000;
  // 画面外と判定されて消えることがある(カメラの子は境界の計算が効かない)
  mesh.frustumCulled = false;

  /**
   * 板を画面いっぱいへ合わせ、絵の切り出しを決める。
   *
   * 板は常に表示範囲ちょうどの大きさにし、**絵の側を切る。**
   * 板を絵の比に合わせると画面に隙間ができる。
   */
  function fit(camera: THREE.OrthographicCamera): void {
    const viewW = (camera.right - camera.left) / camera.zoom;
    const viewH = (camera.top - camera.bottom) / camera.zoom;
    mesh.scale.set(viewW, viewH, 1);
    // カメラの表示範囲が左右上下で非対称な時のために、中心をずらす
    mesh.position.x = (camera.right + camera.left) / 2 / camera.zoom;
    mesh.position.y = (camera.top + camera.bottom) / 2 / camera.zoom;

    const image = texture.image as { width?: number; height?: number } | null;
    if (!image?.width || !image?.height) return;

    // cover: 画面より絵が横長なら左右を切り、縦長なら上下を切る
    const viewRatio = viewW / viewH;
    const imageRatio = image.width / image.height;
    const crop = material.uniforms.uCrop.value as THREE.Vector4;
    if (imageRatio > viewRatio) {
      const w = viewRatio / imageRatio;
      crop.set((1 - w) / 2, 0, w, 1);
    } else {
      const h = imageRatio / viewRatio;
      /*
       * 縦を切る時は**下を残す。**
       * 床にモンスターが立つので、切ってよいのは空の側。
       * 中央で切ると、空と床の境目が画面の真ん中へ来て構図が崩れる。
       */
      crop.set(0, 0, 1, h);
    }
  }

  return {
    mesh,
    fit(camera) {
      lastCamera = camera;
      fit(camera);
    },
    dispose() {
      mesh.geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}
