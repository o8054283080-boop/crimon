import * as THREE from "three";
import { ATLAS_COLUMNS, particleAtlasTexture } from "./fxTextures.js";

/**
 * 粒(Points)のプール。
 *
 * - スプライトはアトラス1枚に集約し、セル番号を頂点属性で切り替える
 * - 加算合成レイヤ(火花・光)と通常合成レイヤ(煙・破片・葉)の2枚を持つ
 *   加算だけだと煙が「光る雲」になってしまい、余韻の重さが出ないため
 * - 回転はフラグメントシェーダでUVを回して表現する(Pointsは板を回せないため)
 */

const VERTEX = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute float aRot;
attribute float aCell;
attribute vec3 aColor;
varying float vAlpha;
varying float vRot;
varying float vCell;
varying vec3 vColor;

void main() {
  vRot = aRot;
  vCell = aCell;
  vColor = aColor;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

  // ビュー空間の奥行き(前方が正)。カメラ位置に近づくほど点は大きく描かれる。
  float depth = -mvPosition.z;

  // カメラの手前や背後に来た粒は描かない。
  // ここを許すと depth がほぼ0になり、次の割り算で点が画面全体を覆うほど巨大化する。
  vAlpha = depth > 0.2 ? aAlpha : 0.0;

  // 遠近に応じた大きさ。分母を下限で守ったうえで、最終的な画素サイズにも
  // 上限を設ける(1粒が画面を覆い尽くして白飛びするのを構造的に防ぐ)。
  gl_PointSize = clamp(aSize * (300.0 / max(0.2, depth)), 0.0, 44.0);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D uAtlas;
uniform float uColumns;
uniform float uWhiteHot;
varying float vAlpha;
varying float vRot;
varying float vCell;
varying vec3 vColor;

void main() {
  if (vAlpha <= 0.002) discard;
  // gl_PointCoord は左上原点。テクスチャ座標へ変換しつつ、粒ごとの回転をかける
  vec2 p = vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y) - 0.5;
  float s = sin(vRot);
  float c = cos(vRot);
  p = vec2(p.x * c - p.y * s, p.x * s + p.y * c) + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) discard;

  float col = mod(vCell, uColumns);
  float row = floor(vCell / uColumns);
  vec2 uv = (vec2(col, uColumns - 1.0 - row) + p) / uColumns;

  vec4 tex = texture2D(uAtlas, uv);
  if (tex.a < 0.004) discard;
  // 生まれたては白熱させる(uWhiteHot=0なら素の色のまま)
  vec3 color = mix(vColor, vec3(1.0), clamp(uWhiteHot * pow(vAlpha, 2.0), 0.0, 1.0));
  gl_FragColor = vec4(color, tex.a * vAlpha);
}
`;

export type ParticleLayerKind = "add" | "alpha";

export interface ParticleSpec {
  position: THREE.Vector3;
  velocity?: THREE.Vector3;
  color: THREE.Color;
  /** 画面上のおおよその大きさ(px相当) */
  size: number;
  life: number;
  cell: number;
  /** 通常合成レイヤへ出す(煙・破片・葉など) */
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
  attractor: THREE.Vector3 | null;
  attract: number;
  /** 原点からの水平距離(旋回計算に使う) */
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
  private readonly particles: Particle[] = [];
  private cursor = 0;
  private liveCount = 0;

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
        attractor: null,
        attract: 0,
        active: false,
      });
      this.positions[i * 3 + 1] = -9999;
    }

    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute("aColor", new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute("aSize", new THREE.BufferAttribute(this.sizes, 1));
    this.geometry.setAttribute("aAlpha", new THREE.BufferAttribute(this.alphas, 1));
    this.geometry.setAttribute("aRot", new THREE.BufferAttribute(this.rots, 1));
    this.geometry.setAttribute("aCell", new THREE.BufferAttribute(this.cells, 1));

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uAtlas: { value: particleAtlasTexture() },
        uColumns: { value: ATLAS_COLUMNS },
        uWhiteHot: { value: kind === "add" ? 0.65 : 0.0 },
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: kind === "add" ? THREE.AdditiveBlending : THREE.NormalBlending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = kind === "add" ? 3 : 2;
  }

  /** 粒の大きさにかかる共通倍率(BillboardFieldと同じ考え方) */
  sizeScale = 1;

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
    particle.attractor = spec.attractor ?? null;
    particle.attract = spec.attract ?? 0;
    particle.active = true;
    if (spec.velocity) particle.velocity.copy(spec.velocity);
    else particle.velocity.set(0, 0, 0);

    this.positions[index * 3 + 0] = spec.position.x;
    this.positions[index * 3 + 1] = spec.position.y;
    this.positions[index * 3 + 2] = spec.position.z;
    this.colors[index * 3 + 0] = spec.color.r;
    this.colors[index * 3 + 1] = spec.color.g;
    this.colors[index * 3 + 2] = spec.color.b;
    this.sizes[index] = spec.size;
    this.alphas[index] = spec.fadeIn && spec.fadeIn > 0 ? 0 : particle.alpha;
    this.rots[index] = spec.rotation ?? 0;
    this.cells[index] = spec.cell;
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
    }
    this.liveCount = live;

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aAlpha.needsUpdate = true;
    this.geometry.attributes.aSize.needsUpdate = true;
    this.geometry.attributes.aRot.needsUpdate = true;
    this.geometry.attributes.aColor.needsUpdate = true;
    this.geometry.attributes.aCell.needsUpdate = true;
  }

  get activeCount(): number {
    return this.liveCount;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

/** 加算/通常の2レイヤをまとめて扱う窓口 */
export class ParticleField {
  readonly root = new THREE.Group();
  private readonly additive: ParticleLayer;
  private readonly alpha: ParticleLayer;

  constructor(additiveCapacity = 1700, alphaCapacity = 900) {
    this.additive = new ParticleLayer(additiveCapacity, "add");
    this.alpha = new ParticleLayer(alphaCapacity, "alpha");
    this.root.add(this.additive.points, this.alpha.points);
  }

  /** 粒の大きさにかかる共通倍率。内部の2レイヤーへまとめて配る */
  setSizeScale(scale: number): void {
    this.alpha.sizeScale = scale;
    this.additive.sizeScale = scale;
  }

  spawn(spec: ParticleSpec): void {
    if (spec.layer === "alpha") this.alpha.spawn(spec);
    else this.additive.spawn(spec);
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
    this.additive.update(dt);
    this.alpha.update(dt);
  }

  get activeCount(): number {
    return this.additive.activeCount + this.alpha.activeCount;
  }

  dispose(): void {
    this.additive.dispose();
    this.alpha.dispose();
  }
}
