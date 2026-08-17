import * as THREE from "three";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

/**
 * 仕上げ用のワンパス。トーンマッピング済み(sRGB)の絵に対して、
 * 色収差 → カラーグレード → ビネット → グレイン の順で軽く化粧をする。
 *
 * OutputPass の後段に置くこと。ここでは色空間変換を行わないので、
 * 入力の sRGB 値がそのまま画面へ抜ける。
 *
 * 目的は「フィルムで撮った感じ」を薄く足すことで、効果を強く出すことではない。
 * どのパラメータも 0 にすればその要素だけ無効化できる。
 */
const CINEMATIC_SHADER = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    /** 画面周辺を落とす量 */
    uVignette: { value: 0.42 },
    /** 周辺での RGB のずれ(ピクセル数) */
    uAberration: { value: 1.1 },
    /** フィルムグレインの粒の強さ */
    uGrain: { value: 0.05 },
    /** 彩度(1で素通し) */
    uSaturation: { value: 1.08 },
    /** S字コントラストの強さ */
    uContrast: { value: 0.14 },
    /**
     * 暗部に乗せる色(寒色)。
     *
     * ここは**色調設計の本体**。ライト側で寒暖を割ろうとすると、
     * モンスターの体表シェーダが自前の固定光源で陰影を焼いている都合で
     * キャラと背景がずれる。合成後の1枚に対して掛けるこちらなら、
     * 全部が同じ色調に乗る。
     *
     * シェーダ側で 2.0 倍してから掛けるので、0.5 より暗い成分は
     * その分だけ暗部を沈める。接地感はここで作れる。
     */
    uShadowTint: { value: new THREE.Color(0x223d70) },
    /** 明部に乗せる色(暖色) */
    uHighlightTint: { value: new THREE.Color(0xffdfae) },
    /** スプリットトーンの効き */
    uTintStrength: { value: 0.16 },
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uVignette;
    uniform float uAberration;
    uniform float uGrain;
    uniform float uSaturation;
    uniform float uContrast;
    uniform vec3 uShadowTint;
    uniform vec3 uHighlightTint;
    uniform float uTintStrength;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    void main() {
      vec2 uv = vUv;
      vec2 centered = uv - 0.5;
      // 中心からの距離。周辺ほど効果を強める共通の重み
      float radius = length(centered * vec2(uResolution.x / max(uResolution.y, 1.0), 1.0)) * 1.25;
      float edge = clamp(radius * radius, 0.0, 1.0);

      // --- 色収差: 周辺だけ R と B を放射方向にずらす ---
      vec2 texel = 1.0 / max(uResolution, vec2(1.0));
      vec2 shift = normalize(centered + 1e-6) * uAberration * edge * texel;
      vec3 color;
      color.r = texture2D(tDiffuse, uv + shift).r;
      color.g = texture2D(tDiffuse, uv).g;
      color.b = texture2D(tDiffuse, uv - shift).b;

      // --- コントラスト(S字) ---
      color = mix(color, color * color * (3.0 - 2.0 * color), uContrast);

      // --- 彩度 ---
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(luma), color, uSaturation);

      // --- スプリットトーン: 暗部を寒色、明部を暖色へ ---
      vec3 shadowMix = color * uShadowTint * 2.0;
      vec3 highlightMix = color * uHighlightTint;
      vec3 toned = mix(shadowMix, highlightMix, smoothstep(0.15, 0.85, luma));
      color = mix(color, toned, uTintStrength);

      // --- ビネット ---
      float vig = 1.0 - uVignette * edge;
      color *= clamp(vig, 0.0, 1.0);

      // --- グレイン: 暗部に強く、明部には乗せない(白飛びを増やさない) ---
      float noise = hash(uv * uResolution + fract(uTime) * 137.0) - 0.5;
      color += noise * uGrain * (1.0 - smoothstep(0.35, 0.95, luma));

      gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);
    }
  `,
};

export interface CinematicOptions {
  vignette?: number;
  aberration?: number;
  grain?: number;
  saturation?: number;
  contrast?: number;
  tintStrength?: number;
  /** 暗部に乗せる色。数値(0xRRGGBB)で指定する */
  shadowTint?: number;
  /** 明部に乗せる色 */
  highlightTint?: number;
}

export class CinematicPass extends ShaderPass {
  constructor(options: CinematicOptions = {}) {
    super(CINEMATIC_SHADER);
    this.configure(options);
  }

  configure(options: CinematicOptions): void {
    const u = this.uniforms;
    if (options.vignette !== undefined) u.uVignette.value = options.vignette;
    if (options.aberration !== undefined) u.uAberration.value = options.aberration;
    if (options.grain !== undefined) u.uGrain.value = options.grain;
    if (options.saturation !== undefined) u.uSaturation.value = options.saturation;
    if (options.contrast !== undefined) u.uContrast.value = options.contrast;
    if (options.tintStrength !== undefined) u.uTintStrength.value = options.tintStrength;
    if (options.shadowTint !== undefined) (u.uShadowTint.value as THREE.Color).setHex(options.shadowTint);
    if (options.highlightTint !== undefined) (u.uHighlightTint.value as THREE.Color).setHex(options.highlightTint);
  }

  setResolution(width: number, height: number): void {
    (this.uniforms.uResolution.value as THREE.Vector2).set(width, height);
  }

  setTime(seconds: number): void {
    this.uniforms.uTime.value = seconds;
  }
}
