import * as THREE from "three";
import { ribbonTexture } from "./fxTextures.js";

/**
 * 帯(リボン)状エフェクトのプール。
 *
 * 稲妻のジグザグ、斬撃の弧、蔦のうねり、クリティカルの放射線など
 * 「線に形がある」表現を担当する。GL の line は太さを持てないため、
 * 経路に沿って板を張った帯メッシュを毎回生成する。
 */

const MAX_SEGMENTS = 56;

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uHead;
uniform float uBand;
uniform float uGlow;
uniform float uCoreWhite;
varying vec2 vUv;

void main() {
  // 幅方向の減衰(帯の芯が明るい)
  float across = texture2D(uMap, vec2(0.5, vUv.y)).a;
  // 先端(uHead)から uBand ぶんだけが見えるように切り出す
  float head = smoothstep(uHead, uHead - 0.10, vUv.x);
  float tail = smoothstep(uHead - uBand, uHead - uBand + 0.18, vUv.x);
  float mask = head * tail;
  if (mask <= 0.002) discard;

  // 先端付近を白熱させて「走っている」感じを出す
  float leading = exp(-abs(vUv.x - uHead) * 9.0) * uGlow;
  vec3 color = mix(uColor, vec3(1.0), clamp(uCoreWhite * pow(1.0 - abs(vUv.y - 0.5) * 2.0, 2.0) + leading, 0.0, 1.0));
  float alpha = across * mask * uOpacity * (1.0 + leading * 0.8);
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(color, alpha);
}
`;

export interface StripSpec {
  /** ワールド座標の経路(2点以上) */
  points: THREE.Vector3[];
  color: THREE.Color;
  /** 帯の基準幅(ワールド単位) */
  width: number;
  life: number;
  opacity?: number;
  /** 先端が0→1へ走る秒数。0なら最初から全体が見える */
  revealSec?: number;
  /** 一度に見える長さ(1で全体) */
  band?: number;
  /** 先端の白熱の強さ */
  glow?: number;
  /** 芯の白さ(稲妻は高め) */
  coreWhite?: number;
  /** 毎フレームのちらつき(稲妻用) */
  flicker?: number;
  fadePower?: number;
  /** 幅の変化。既定は両端が細くなる紡錘形 */
  widthProfile?: "spindle" | "taperEnd" | "even" | "blade";
  /** 生存中に膨らむ倍率 */
  expand?: number;
  /**
   * 経路そのものを origin から外へ広げる最終倍率(1で広がらない)。
   *
   * 板は「画面を覆うと白飛びする」ため大きさに上限があり、
   * 大きな衝撃波を板で作ることはできない。帯は線であって面ではないので、
   * 半径をいくら大きくしても加算される面積はほとんど増えない。
   * 広がる輪はここで作る。1未満にすると逆に収束する(光の収束・闇の吸引)。
   */
  grow?: number;
  /** grow の中心。省略すると経路の重心 */
  origin?: THREE.Vector3;
  blending?: THREE.Blending;
}

interface StripItem {
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  material: THREE.ShaderMaterial;
  positions: Float32Array;
  basePositions: Float32Array;
  centers: Float32Array;
  life: number;
  maxLife: number;
  revealSec: number;
  band: number;
  flicker: number;
  fadePower: number;
  opacity: number;
  expand: number;
  grow: number;
  origin: THREE.Vector3;
  segments: number;
}

function widthAt(profile: StripSpec["widthProfile"], t: number): number {
  switch (profile) {
    case "even":
      return 1;
    case "taperEnd":
      return 1 - t * 0.85;
    case "blade":
      // 中央が最も太く、先端が鋭い刃のような形
      return Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 0.6);
    default:
      return Math.sin(Math.PI * t) * 0.85 + 0.15;
  }
}

export class StripField {
  readonly root = new THREE.Group();
  private readonly items: StripItem[] = [];
  private readonly pool: StripItem[] = [];
  private readonly texture = ribbonTexture();

  private readonly tangent = new THREE.Vector3();
  private readonly view = new THREE.Vector3();
  private readonly side = new THREE.Vector3();

  constructor(private readonly capacity = 42) {}

  private create(): StripItem {
    const geometry = new THREE.BufferGeometry();
    const vertexCount = (MAX_SEGMENTS + 1) * 2;
    const positions = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const indices = new Uint16Array(MAX_SEGMENTS * 6);
    for (let i = 0; i < MAX_SEGMENTS; i++) {
      const a = i * 2;
      indices.set([a, a + 1, a + 2, a + 2, a + 1, a + 3], i * 6);
    }
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));

    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uMap: { value: this.texture },
        uColor: { value: new THREE.Color(0xffffff) },
        uOpacity: { value: 1 },
        uHead: { value: 1 },
        uBand: { value: 1 },
        uGlow: { value: 0.6 },
        uCoreWhite: { value: 0.5 },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    return {
      mesh,
      geometry,
      material,
      positions,
      basePositions: new Float32Array(positions.length),
      centers: new Float32Array((MAX_SEGMENTS + 1) * 3),
      life: 0,
      maxLife: 1,
      revealSec: 0,
      band: 1,
      flicker: 0,
      fadePower: 1,
      opacity: 1,
      expand: 1,
      grow: 1,
      origin: new THREE.Vector3(),
      segments: 0,
    };
  }

  /** 帯の太さにかかる共通倍率(BillboardField/ParticleFieldと同じ考え方) */
  sizeScale = 1;

  /** ビルボードと同じ考え方で、混雑してきたら新しい帯を間引く */
  private readonly softLimit = 8;

  spawn(spec: StripSpec, cameraPosition: THREE.Vector3): void {
    if (this.items.length > this.softLimit) {
      const over = (this.items.length - this.softLimit) / Math.max(1, this.capacity - this.softLimit);
      if (Math.random() < Math.min(0.97, over)) return;
    }
    if (spec.points.length < 2) return;
    if (this.items.length >= this.capacity) {
      const oldest = this.items.shift();
      if (oldest) this.release(oldest);
    }
    const item = this.pool.pop() ?? this.create();

    const points = spec.points.length - 1 > MAX_SEGMENTS ? spec.points.slice(0, MAX_SEGMENTS + 1) : spec.points;
    const count = points.length;
    const segments = count - 1;
    const uvs = item.geometry.attributes.uv as THREE.BufferAttribute;

    for (let i = 0; i < count; i++) {
      const point = points[i];
      const prev = points[Math.max(0, i - 1)];
      const next = points[Math.min(count - 1, i + 1)];
      this.tangent.subVectors(next, prev);
      if (this.tangent.lengthSq() < 1e-8) this.tangent.set(0, 1, 0);
      this.tangent.normalize();
      this.view.subVectors(cameraPosition, point).normalize();
      this.side.crossVectors(this.tangent, this.view);
      if (this.side.lengthSq() < 1e-8) this.side.set(1, 0, 0);
      const t = i / segments;
      this.side.normalize().multiplyScalar((spec.width * this.sizeScale * widthAt(spec.widthProfile, t)) / 2);

      const base = i * 6;
      item.basePositions[base + 0] = point.x - this.side.x;
      item.basePositions[base + 1] = point.y - this.side.y;
      item.basePositions[base + 2] = point.z - this.side.z;
      item.basePositions[base + 3] = point.x + this.side.x;
      item.basePositions[base + 4] = point.y + this.side.y;
      item.basePositions[base + 5] = point.z + this.side.z;
      item.centers[i * 3 + 0] = point.x;
      item.centers[i * 3 + 1] = point.y;
      item.centers[i * 3 + 2] = point.z;

      uvs.array[i * 4 + 0] = t;
      uvs.array[i * 4 + 1] = 0;
      uvs.array[i * 4 + 2] = t;
      uvs.array[i * 4 + 3] = 1;
    }
    item.positions.set(item.basePositions.subarray(0, count * 6));
    (item.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    uvs.needsUpdate = true;
    item.geometry.setDrawRange(0, segments * 6);
    item.geometry.computeBoundingSphere();

    item.segments = segments;
    item.maxLife = Math.max(0.02, spec.life);
    item.life = item.maxLife;
    item.revealSec = spec.revealSec ?? 0;
    item.band = spec.band ?? 1.2;
    item.flicker = spec.flicker ?? 0;
    item.fadePower = spec.fadePower ?? 1.4;
    item.opacity = spec.opacity ?? 1;
    item.expand = spec.expand ?? 1;
    item.grow = spec.grow ?? 1;
    if (spec.origin) {
      item.origin.copy(spec.origin);
    } else {
      item.origin.set(0, 0, 0);
      for (let i = 0; i < count; i++) item.origin.add(points[i]);
      item.origin.divideScalar(count);
    }

    item.material.uniforms.uColor.value.copy(spec.color);
    item.material.uniforms.uOpacity.value = item.opacity;
    if (item.revealSec > 0) {
      item.material.uniforms.uHead.value = 0;
      item.material.uniforms.uBand.value = item.band;
    } else {
      // 走らせない帯は、最初から終わりまで全体が見えていてほしい。
      // 見える範囲は [uHead - uBand, uHead] なので、始点(0)より手前から
      // 終点(1)より先までを覆う値を入れる。ここに 1 + band を入れると
      // 窓が経路の外(1以降)へ出てしまい、帯が一度も描かれない。
      item.material.uniforms.uHead.value = 1.1;
      item.material.uniforms.uBand.value = Math.max(item.band, 1.4);
    }
    item.material.uniforms.uGlow.value = spec.glow ?? 0.6;
    item.material.uniforms.uCoreWhite.value = spec.coreWhite ?? 0.45;
    item.material.blending = spec.blending ?? THREE.AdditiveBlending;
    item.mesh.visible = true;

    this.root.add(item.mesh);
    this.items.push(item);
  }

  private release(item: StripItem): void {
    item.mesh.visible = false;
    this.root.remove(item.mesh);
    this.pool.push(item);
  }

  update(dt: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      item.life -= dt;
      if (item.life <= 0) {
        this.release(item);
        this.items.splice(i, 1);
        continue;
      }
      const t = 1 - item.life / item.maxLife;
      const age = item.maxLife - item.life;

      if (item.revealSec > 0) {
        const head = Math.min(1 + item.band, (age / item.revealSec) * (1 + item.band));
        item.material.uniforms.uHead.value = head;
      }
      let opacity = item.opacity * Math.pow(1 - t, item.fadePower);
      if (item.flicker > 0) opacity *= 1 - Math.random() * item.flicker;
      item.material.uniforms.uOpacity.value = opacity;

      if (item.expand !== 1 || item.grow !== 1) {
        // 幅: 中心線からの押し出し量(稲妻が太く弾ける)
        const widthFactor = 1 + (item.expand - 1) * t;
        // 半径: 経路そのものを origin から外へ押し出す(衝撃波が広がる)。
        // 序盤を速く、末期をゆっくりにすると「弾けて減速する」重さが出る
        const radialFactor = 1 + (item.grow - 1) * (1 - Math.pow(1 - t, 2.6));
        const count = item.segments + 1;
        const ox = item.origin.x;
        const oy = item.origin.y;
        const oz = item.origin.z;
        for (let v = 0; v < count; v++) {
          const cx = item.centers[v * 3 + 0];
          const cy = item.centers[v * 3 + 1];
          const cz = item.centers[v * 3 + 2];
          const gx = ox + (cx - ox) * radialFactor;
          const gy = oy + (cy - oy) * radialFactor;
          const gz = oz + (cz - oz) * radialFactor;
          for (let s = 0; s < 2; s++) {
            const base = v * 6 + s * 3;
            item.positions[base + 0] = gx + (item.basePositions[base + 0] - cx) * widthFactor;
            item.positions[base + 1] = gy + (item.basePositions[base + 1] - cy) * widthFactor;
            item.positions[base + 2] = gz + (item.basePositions[base + 2] - cz) * widthFactor;
          }
        }
        (item.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      }
    }
  }

  get activeCount(): number {
    return this.items.length;
  }

  dispose(): void {
    for (const item of [...this.items, ...this.pool]) {
      item.geometry.dispose();
      item.material.dispose();
    }
    this.items.length = 0;
    this.pool.length = 0;
  }
}

// ---------------------------------------------------------------------------
// 経路ジェネレータ
// ---------------------------------------------------------------------------

/** 稲妻のジグザグ経路。perpendicular方向へランダムに折れ曲がる */
export function zigzagPath(
  from: THREE.Vector3,
  to: THREE.Vector3,
  segments: number,
  jitter: number,
  cameraPosition: THREE.Vector3,
): THREE.Vector3[] {
  const direction = new THREE.Vector3().subVectors(to, from);
  const length = direction.length();
  if (length < 1e-5) return [from.clone(), to.clone()];
  direction.divideScalar(length);
  const view = new THREE.Vector3().subVectors(cameraPosition, from).normalize();
  const right = new THREE.Vector3().crossVectors(direction, view).normalize();
  const up = new THREE.Vector3().crossVectors(right, direction).normalize();

  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const point = new THREE.Vector3().copy(from).addScaledVector(direction, length * t);
    if (i > 0 && i < segments) {
      // 中央ほど大きく振れる
      const amount = jitter * Math.sin(Math.PI * t) * (Math.random() * 2 - 1);
      point.addScaledVector(right, amount);
      point.addScaledVector(up, amount * 0.35 * (Math.random() * 2 - 1));
    }
    points.push(point);
  }
  return points;
}

/** 円弧の経路。斬撃の三日月に使う */
export function arcPath(
  center: THREE.Vector3,
  radius: number,
  startAngle: number,
  sweep: number,
  segments: number,
  basis: { right: THREE.Vector3; up: THREE.Vector3 },
  bulge = 0,
): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const angle = startAngle + sweep * t;
    // 弧の中央を少し外へ膨らませて、平坦な円に見えないようにする
    const r = radius * (1 + Math.sin(Math.PI * t) * bulge);
    const point = new THREE.Vector3()
      .copy(center)
      .addScaledVector(basis.right, Math.cos(angle) * r)
      .addScaledVector(basis.up, Math.sin(angle) * r);
    points.push(point);
  }
  return points;
}

/**
 * 閉じた輪の経路。`grow` と組み合わせて衝撃波の輪に使う。
 * `jitter` を入れると真円でなくなり、手描きの勢いが出る。
 */
export function ringPath(
  center: THREE.Vector3,
  radius: number,
  basis: { right: THREE.Vector3; up: THREE.Vector3 },
  segments = 40,
  jitter = 0,
  phase = 0,
): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  const noise: number[] = [];
  for (let i = 0; i < segments; i++) noise.push(1 + (Math.random() * 2 - 1) * jitter);
  for (let i = 0; i <= segments; i++) {
    const index = i % segments;
    const angle = phase + (i / segments) * Math.PI * 2;
    const r = radius * noise[index];
    points.push(
      new THREE.Vector3()
        .copy(center)
        .addScaledVector(basis.right, Math.cos(angle) * r)
        .addScaledVector(basis.up, Math.sin(angle) * r),
    );
  }
  return points;
}

/** 螺旋状に立ち上がる経路。蔦・光の渦に使う */
export function helixPath(
  base: THREE.Vector3,
  radius: number,
  height: number,
  turns: number,
  segments: number,
  phase = 0,
  taper = 0.35,
): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const angle = phase + t * Math.PI * 2 * turns;
    const r = radius * (1 - taper * t);
    points.push(new THREE.Vector3(base.x + Math.cos(angle) * r, base.y + height * t, base.z + Math.sin(angle) * r));
  }
  return points;
}

/** ゆらぎのある直線(蔦の枝や煙の筋) */
export function wavyPath(
  from: THREE.Vector3,
  to: THREE.Vector3,
  segments: number,
  amplitude: number,
  cameraPosition: THREE.Vector3,
  frequency = 1.5,
): THREE.Vector3[] {
  const direction = new THREE.Vector3().subVectors(to, from);
  const length = direction.length();
  direction.divideScalar(Math.max(1e-5, length));
  const view = new THREE.Vector3().subVectors(cameraPosition, from).normalize();
  const right = new THREE.Vector3().crossVectors(direction, view).normalize();
  const points: THREE.Vector3[] = [];
  const phase = Math.random() * Math.PI * 2;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const point = new THREE.Vector3().copy(from).addScaledVector(direction, length * t);
    point.addScaledVector(right, Math.sin(phase + t * Math.PI * 2 * frequency) * amplitude * Math.sin(Math.PI * t));
    points.push(point);
  }
  return points;
}
