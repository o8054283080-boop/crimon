import * as THREE from "three";
import { ATLAS_COLUMNS, particleAtlasTexture } from "./fxTextures.js";

/**
 * 粒(Points)のプール。
 *
 * ## 合成の設計(ここが「白い塊」を防ぐ要)
 *
 * 描画先は EffectComposer の半精度浮動小数バッファで、ブルームは
 * しきい値 1.15 を超えた分だけを拾い、最後に ACES でトーンマップされる。
 * つまり**1.0を超えた値がそのまま滲みの量になる。**
 * 素の加算合成は重ねた枚数だけ線形に足し算されるので、20枚重なれば
 * 平気で 8.0 に達し、ブルームが全面に広がり、ACESが高輝度を白へ寄せる。
 * これが「回復を撃つと画面の上半分が真っ白なもや」の正体だった。
 *
 * そこで層を3枚に分ける。
 *
 * - `glow`(既定): **スクリーン合成**。`s + d*(1-s)` なので何枚重ねても
 *   1.0を超えない。数も大きさも自由に盛れるが、決して飽和しない。
 *   エフェクトの「体積」はすべてここで作る。
 * - `add`: 素の加算に増幅を掛け、意図的に 1.15 を超えさせる。
 *   ブルームで滲ませたい**芯だけ**が入る層。画素サイズに厳しい上限を
 *   置いてあるので、飽和しても「小さく鋭い光点」にしかならない。
 * - `alpha`: 通常合成。煙・破片・葉。光らない「物」を担当する。
 *
 * 出力はすべて乗算済みアルファ(premultiplied)に統一してある。
 * スクリーン合成が `OneMinusSrcColor` を必要とするため、
 * 色にアルファを掛けた状態で書き出さないと式が成立しない。
 *
 * ## その他
 * - スプライトはアトラス1枚に集約し、セル番号を頂点属性で切り替える
 * - 回転と縦横比はフラグメントシェーダでUVを歪めて表現する
 *   (Pointsは板を回せないため)。速度方向へ伸ばした粒は
 *   「飛沫」「火の粉」「電光」の質の差をそのまま画にする
 */

const VERTEX = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute float aRot;
attribute float aCell;
attribute float aHot;
attribute float aStretch;
attribute vec3 aColor;
uniform float uMaxPixel;
varying float vAlpha;
varying float vRot;
varying float vCell;
varying float vHot;
varying float vStretch;
varying vec3 vColor;

void main() {
  vRot = aRot;
  vCell = aCell;
  vColor = aColor;
  vHot = aHot;
  vStretch = aStretch;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

  // ビュー空間の奥行き(前方が正)。カメラ位置に近づくほど点は大きく描かれる。
  float depth = -mvPosition.z;

  // カメラの手前や背後に来た粒は描かない。
  // ここを許すと depth がほぼ0になり、次の割り算で点が画面全体を覆うほど巨大化する。
  vAlpha = depth > 0.2 ? aAlpha : 0.0;

  // 遠近に応じた大きさ。分母を下限で守ったうえで、最終的な画素サイズにも
  // 層ごとの上限を設ける(芯の層だけは特に小さく抑える)。
  gl_PointSize = clamp(aSize * (300.0 / max(0.2, depth)), 0.0, uMaxPixel);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D uAtlas;
uniform float uColumns;
uniform float uGain;
varying float vAlpha;
varying float vRot;
varying float vCell;
varying float vHot;
varying float vStretch;
varying vec3 vColor;

void main() {
  if (vAlpha <= 0.002) discard;
  // gl_PointCoord は左上原点。テクスチャ座標へ変換しつつ、粒ごとの回転をかける
  vec2 p = vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y) - 0.5;
  float s = sin(vRot);
  float c = cos(vRot);
  p = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
  // 縦横比。1.0 なら等方、大きいほど回転後のローカルX方向へ細長く伸びる
  p = vec2(p.x / vStretch, p.y * vStretch) + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) discard;

  float col = mod(vCell, uColumns);
  float row = floor(vCell / uColumns);
  vec2 uv = (vec2(col, uColumns - 1.0 - row) + p) / uColumns;

  vec4 tex = texture2D(uAtlas, uv);
  if (tex.a < 0.004) discard;
  // 白熱は粒ごとに持たせる。一律に白を混ぜると、どの属性も同じ白い粒になる
  vec3 color = mix(vColor, vec3(1.0), clamp(vHot, 0.0, 1.0));
  float a = tex.a * vAlpha;
  // 乗算済みアルファで書き出す(スクリーン合成の前提)
  gl_FragColor = vec4(color * a * uGain, a);
}
`;

/**
 * 粒を出す層。
 *
 * - `glow`: スクリーン合成。飽和しない発光。既定はこれ
 * - `add`: 加算+増幅。ブルームを狙う「芯」専用。小さく短命なものだけ
 * - `alpha`: 通常合成。煙・破片・葉
 */
export type ParticleLayerKind = "add" | "glow" | "alpha";

export interface ParticleSpec {
  position: THREE.Vector3;
  velocity?: THREE.Vector3;
  color: THREE.Color;
  /** 画面上のおおよその大きさ(px相当) */
  size: number;
  life: number;
  cell: number;
  /** 出す層。既定は飽和しない `glow` */
  layer?: ParticleLayerKind;
  gravity?: number;
  drag?: number;
  /** 寿命末期の大きさ倍率。1で等倍、>1で膨らむ */
  growth?: number;
  /** 最大不透明度 */
  alpha?: number;
  /** 立ち上がりにかける秒数(煙をふわっと出す) */
  fadeIn?: number;
  rotation?: number;
  /** 毎秒の回転量 */
  spin?: number;
  /** 上向き軸まわりの旋回速度(渦を巻かせる) */
  swirl?: number;
  /** 引き寄せ先。詠唱の吸い込みなどに使う */
  attractor?: THREE.Vector3;
  attract?: number;
  /** ふわふわ揺れる強さ(泡・葉) */
  wobble?: number;
  /** 減衰カーブ。2で「最後にすっと消える」 */
  fadePower?: number;
  /**
   * 生まれた瞬間の白熱(0..1)。寿命とともに素の色へ戻る。
   * 一律に白を混ぜると属性の色が消えるので、**芯にだけ**使うこと。
   */
  hot?: number;
  /** 白熱が引くまでの秒数(既定は寿命の25%) */
  hotDecay?: number;
  /** 縦横比。1で等方、2で回転方向へ2倍細長い(飛沫・火の粉・電光) */
  stretch?: number;
  /** 速度の向きへ粒を寝かせる。stretch と組み合わせて「流れ」を作る */
  alignVelocity?: boolean;
}

interface Particle {
  life: number;
  maxLife: number;
  velocity: THREE.Vector3;
  gravity: number;
  drag: number;
  size: number;
  growth: number;
  alpha: number;
  fadeIn: number;
  spin: number;
  swirl: number;
  wobble: number;
  wobblePhase: number;
  fadePower: number;
  hot: number;
  hotDecay: number;
  attractor: THREE.Vector3 | null;
  attract: number;
  align: boolean;
  active: boolean;
}

class ParticleLayer {
  readonly points: THREE.Points;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.ShaderMaterial;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly sizes: Float32Array;
  private readonly alphas: Float32Array;
  private readonly rots: Float32Array;
  private readonly cells: Float32Array;
  private readonly hots: Float32Array;
  private readonly stretches: Float32Array;
  private readonly particles: Particle[] = [];
  private cursor = 0;
  private liveCount = 0;

  /** 速度方向を画面上の角度へ落とすためのカメラ基底 */
  private readonly camRight = new THREE.Vector3(1, 0, 0);
  private readonly camUp = new THREE.Vector3(0, 1, 0);

  constructor(
    private readonly capacity: number,
    kind: ParticleLayerKind,
  ) {
    this.positions = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 3);
    this.sizes = new Float32Array(capacity);
    this.alphas = new Float32Array(capacity);
    this.rots = new Float32Array(capacity);
    this.cells = new Float32Array(capacity);
    this.hots = new Float32Array(capacity);
    this.stretches = new Float32Array(capacity);

    for (let i = 0; i < capacity; i++) {
      this.particles.push({
        life: 0,
        maxLife: 1,
        velocity: new THREE.Vector3(),
        gravity: 0,
        drag: 0.9,
        size: 1,
        growth: 1,
        alpha: 1,
        fadeIn: 0,
        spin: 0,
        swirl: 0,
        wobble: 0,
        wobblePhase: 0,
        fadePower: 1,
        hot: 0,
        hotDecay: 0.1,
        attractor: null,
        attract: 0,
        align: false,
        active: false,
      });
      this.positions[i * 3 + 1] = -9999;
      this.stretches[i] = 1;
    }

    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute("aColor", new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute("aSize", new THREE.BufferAttribute(this.sizes, 1));
    this.geometry.setAttribute("aAlpha", new THREE.BufferAttribute(this.alphas, 1));
    this.geometry.setAttribute("aRot", new THREE.BufferAttribute(this.rots, 1));
    this.geometry.setAttribute("aCell", new THREE.BufferAttribute(this.cells, 1));
    this.geometry.setAttribute("aHot", new THREE.BufferAttribute(this.hots, 1));
    this.geometry.setAttribute("aStretch", new THREE.BufferAttribute(this.stretches, 1));

    // 層ごとの画素上限。芯の層だけは「小さく鋭い光点」に留める
    const maxPixel = kind === "add" ? 24 : kind === "alpha" ? 130 : 62;
    // 加算層だけは意図的にブルームのしきい値(1.15)を越えさせる
    const gain = kind === "add" ? 2.1 : 1;

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uAtlas: { value: particleAtlasTexture() },
        uColumns: { value: ATLAS_COLUMNS },
        uGain: { value: gain },
        uMaxPixel: { value: maxPixel },
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      // 乗算済みアルファで書き出しているので、各層の合成は次のとおり。
      //   glow : s + d*(1-s)  … スクリーン。1.0を越えない
      //   add  : s + d        … 素の加算。芯だけが使う
      //   alpha: s + d*(1-a)  … 通常合成
      blendSrc: THREE.OneFactor,
      blendDst:
        kind === "add" ? THREE.OneFactor : kind === "alpha" ? THREE.OneMinusSrcAlphaFactor : THREE.OneMinusSrcColorFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: kind === "add" ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = kind === "add" ? 4 : kind === "glow" ? 3 : 2;
  }

  /** 粒の大きさにかかる共通倍率(BillboardFieldと同じ考え方) */
  sizeScale = 1;

  setCameraBasis(right: THREE.Vector3, up: THREE.Vector3): void {
    this.camRight.copy(right);
    this.camUp.copy(up);
  }

  spawn(spec: ParticleSpec): void {
    const index = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    const particle = this.particles[index];
    if (!particle.active) this.liveCount++;

    particle.maxLife = Math.max(0.01, spec.life);
    particle.life = particle.maxLife;
    particle.gravity = spec.gravity ?? 0;
    particle.drag = spec.drag ?? 0.9;
    particle.size = spec.size * this.sizeScale;
    particle.growth = spec.growth ?? 1;
    particle.alpha = spec.alpha ?? 1;
    particle.fadeIn = spec.fadeIn ?? 0;
    particle.spin = spec.spin ?? 0;
    particle.swirl = spec.swirl ?? 0;
    particle.wobble = spec.wobble ?? 0;
    particle.wobblePhase = Math.random() * Math.PI * 2;
    particle.fadePower = spec.fadePower ?? 1;
    particle.hot = spec.hot ?? 0;
    particle.hotDecay = Math.max(0.02, spec.hotDecay ?? particle.maxLife * 0.25);
    particle.attractor = spec.attractor ?? null;
    particle.attract = spec.attract ?? 0;
    particle.align = spec.alignVelocity ?? false;
    particle.active = true;
    if (spec.velocity) particle.velocity.copy(spec.velocity);
    else particle.velocity.set(0, 0, 0);

    this.positions[index * 3 + 0] = spec.position.x;
    this.positions[index * 3 + 1] = spec.position.y;
    this.positions[index * 3 + 2] = spec.position.z;
    this.colors[index * 3 + 0] = spec.color.r;
    this.colors[index * 3 + 1] = spec.color.g;
    this.colors[index * 3 + 2] = spec.color.b;
    // 共通倍率をかけた値を入れる。ここで素の spec.size を入れると、
    // 最初の1フレームだけ粒が数倍に膨らんで白く弾けて見える
    this.sizes[index] = particle.size * particle.growth;
    this.alphas[index] = spec.fadeIn && spec.fadeIn > 0 ? 0 : particle.alpha;
    this.rots[index] = particle.align ? this.screenAngle(particle.velocity) : (spec.rotation ?? 0);
    this.cells[index] = spec.cell;
    this.hots[index] = particle.hot;
    this.stretches[index] = Math.max(0.2, spec.stretch ?? 1);
  }

  /** 速度ベクトルを、カメラから見た画面上の角度へ落とす */
  private screenAngle(velocity: THREE.Vector3): number {
    const x = velocity.dot(this.camRight);
    const y = velocity.dot(this.camUp);
    if (x * x + y * y < 1e-8) return 0;
    return Math.atan2(y, x);
  }

  update(dt: number): void {
    if (this.liveCount === 0) return;
    let live = 0;
    for (let i = 0; i < this.capacity; i++) {
      const particle = this.particles[i];
      if (!particle.active) continue;
      particle.life -= dt;
      if (particle.life <= 0) {
        particle.active = false;
        this.alphas[i] = 0;
        this.positions[i * 3 + 1] = -9999;
        continue;
      }
      live++;
      const t = particle.life / particle.maxLife;
      const age = particle.maxLife - particle.life;

      particle.velocity.y += particle.gravity * dt;
      if (particle.attractor && particle.attract !== 0) {
        const ax = particle.attractor.x - this.positions[i * 3 + 0];
        const ay = particle.attractor.y - this.positions[i * 3 + 1];
        const az = particle.attractor.z - this.positions[i * 3 + 2];
        particle.velocity.x += ax * particle.attract * dt;
        particle.velocity.y += ay * particle.attract * dt;
        particle.velocity.z += az * particle.attract * dt;
      }
      if (particle.swirl !== 0) {
        // XZ平面で速度ベクトルを回して渦を作る
        const angle = particle.swirl * dt;
        const s = Math.sin(angle);
        const c = Math.cos(angle);
        const vx = particle.velocity.x;
        const vz = particle.velocity.z;
        particle.velocity.x = vx * c - vz * s;
        particle.velocity.z = vx * s + vz * c;
      }
      const damping = Math.pow(particle.drag, dt * 60);
      particle.velocity.multiplyScalar(damping);

      this.positions[i * 3 + 0] += particle.velocity.x * dt;
      this.positions[i * 3 + 1] += particle.velocity.y * dt;
      this.positions[i * 3 + 2] += particle.velocity.z * dt;
      if (particle.wobble !== 0) {
        const phase = particle.wobblePhase + age * 5.5;
        this.positions[i * 3 + 0] += Math.sin(phase) * particle.wobble * dt;
        this.positions[i * 3 + 2] += Math.cos(phase * 0.8) * particle.wobble * dt;
      }

      let alpha = particle.alpha * Math.pow(t, particle.fadePower);
      if (particle.fadeIn > 0 && age < particle.fadeIn) alpha *= age / particle.fadeIn;
      this.alphas[i] = alpha;
      this.sizes[i] = particle.size * (1 + (particle.growth - 1) * (1 - t));
      if (particle.spin !== 0) this.rots[i] += particle.spin * dt;
      else if (particle.align) this.rots[i] = this.screenAngle(particle.velocity);
      if (particle.hot > 0) {
        // 白熱は生まれた瞬間だけ。すぐ属性の色へ戻すことで
        // 「閃いてから色が乗る」という順序が読める
        this.hots[i] = particle.hot * Math.max(0, 1 - age / particle.hotDecay);
      }
    }
    this.liveCount = live;

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aAlpha.needsUpdate = true;
    this.geometry.attributes.aSize.needsUpdate = true;
    this.geometry.attributes.aRot.needsUpdate = true;
    this.geometry.attributes.aColor.needsUpdate = true;
    this.geometry.attributes.aCell.needsUpdate = true;
    this.geometry.attributes.aHot.needsUpdate = true;
    this.geometry.attributes.aStretch.needsUpdate = true;
  }

  get activeCount(): number {
    return this.liveCount;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

/** 加算(芯)/スクリーン(発光)/通常(物)の3レイヤをまとめて扱う窓口 */
export class ParticleField {
  readonly root = new THREE.Group();
  private readonly core: ParticleLayer;
  private readonly glow: ParticleLayer;
  private readonly alpha: ParticleLayer;

  constructor(glowCapacity = 1700, alphaCapacity = 900, coreCapacity = 320) {
    this.glow = new ParticleLayer(glowCapacity, "glow");
    this.core = new ParticleLayer(coreCapacity, "add");
    this.alpha = new ParticleLayer(alphaCapacity, "alpha");
    this.root.add(this.alpha.points, this.glow.points, this.core.points);
  }

  /** 粒の大きさにかかる共通倍率。内部のレイヤーへまとめて配る */
  setSizeScale(scale: number): void {
    this.alpha.sizeScale = scale;
    this.glow.sizeScale = scale;
    this.core.sizeScale = scale;
  }

  /** 速度方向へ粒を寝かせるためのカメラ基底を配る */
  setCameraBasis(right: THREE.Vector3, up: THREE.Vector3): void {
    this.alpha.setCameraBasis(right, up);
    this.glow.setCameraBasis(right, up);
    this.core.setCameraBasis(right, up);
  }

  spawn(spec: ParticleSpec): void {
    if (spec.layer === "alpha") this.alpha.spawn(spec);
    else if (spec.layer === "add") this.core.spawn(spec);
    else this.glow.spawn(spec);
  }

  /** 球状/円錐状にまとめて撒く。方向を与えると指向性を持たせられる */
  burst(
    origin: THREE.Vector3,
    color: THREE.Color,
    options: Omit<ParticleSpec, "position" | "color" | "velocity"> & {
      count: number;
      speed: number;
      speedJitter?: number;
      /** 0で全方向、1で direction 方向のみ */
      focus?: number;
      direction?: THREE.Vector3;
      /** 縦方向の押し出し */
      upBias?: number;
      /** 水平円盤状に撒く(0..1で扁平度) */
      flatten?: number;
      spawnRadius?: number;
      sizeJitter?: number;
      lifeJitter?: number;
      randomSpin?: number;
    },
  ): void {
    const {
      count,
      speed,
      speedJitter = 0.5,
      focus = 0,
      direction,
      upBias = 0,
      flatten = 0,
      spawnRadius = 0.12,
      sizeJitter = 0.45,
      lifeJitter = 0.35,
      randomSpin = 0,
      ...rest
    } = options;

    const velocity = new THREE.Vector3();
    const position = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      velocity.set(Math.sin(phi) * Math.cos(theta), Math.cos(phi) * (1 - flatten), Math.sin(phi) * Math.sin(theta));
      if (direction && focus > 0) velocity.lerp(direction, focus);
      velocity.normalize().multiplyScalar(speed * (1 - speedJitter + Math.random() * speedJitter * 2));
      velocity.y += upBias;

      position.set(
        origin.x + (Math.random() - 0.5) * spawnRadius * 2,
        origin.y + (Math.random() - 0.5) * spawnRadius * 2,
        origin.z + (Math.random() - 0.5) * spawnRadius * 2,
      );

      this.spawn({
        ...rest,
        position,
        velocity,
        color,
        size: rest.size * (1 - sizeJitter + Math.random() * sizeJitter * 2),
        life: rest.life * (1 - lifeJitter + Math.random() * lifeJitter * 2),
        rotation: rest.rotation ?? Math.random() * Math.PI * 2,
        spin: randomSpin > 0 ? (Math.random() - 0.5) * randomSpin : rest.spin,
      });
    }
  }

  /** リング状(水平円周)に撒く。着弾の水しぶきや衝撃の砂埃に使う */
  ringBurst(
    origin: THREE.Vector3,
    color: THREE.Color,
    options: Omit<ParticleSpec, "position" | "color" | "velocity"> & {
      count: number;
      speed: number;
      radius?: number;
      upBias?: number;
      upJitter?: number;
      sizeJitter?: number;
      randomSpin?: number;
      angleOffset?: number;
    },
  ): void {
    const { count, speed, radius = 0, upBias = 0, upJitter = 0.4, sizeJitter = 0.4, randomSpin = 0, angleOffset = 0, ...rest } = options;
    const velocity = new THREE.Vector3();
    const position = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const angle = angleOffset + (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
      const dx = Math.cos(angle);
      const dz = Math.sin(angle);
      const magnitude = speed * (0.7 + Math.random() * 0.6);
      velocity.set(dx * magnitude, upBias + (Math.random() - 0.5) * upJitter * speed, dz * magnitude);
      position.set(origin.x + dx * radius, origin.y + (Math.random() - 0.5) * 0.1, origin.z + dz * radius);
      this.spawn({
        ...rest,
        position,
        velocity,
        color,
        size: rest.size * (1 - sizeJitter + Math.random() * sizeJitter * 2),
        rotation: rest.rotation ?? Math.random() * Math.PI * 2,
        spin: randomSpin > 0 ? (Math.random() - 0.5) * randomSpin : rest.spin,
      });
    }
  }

  update(dt: number): void {
    this.glow.update(dt);
    this.core.update(dt);
    this.alpha.update(dt);
  }

  get activeCount(): number {
    return this.glow.activeCount + this.core.activeCount + this.alpha.activeCount;
  }

  dispose(): void {
    this.glow.dispose();
    this.core.dispose();
    this.alpha.dispose();
  }
}
