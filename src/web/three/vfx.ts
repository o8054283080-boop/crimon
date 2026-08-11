import * as THREE from "three";
import { radialGlowTexture, ringGlowTexture, streakTexture } from "./textures.js";

const MAX_PARTICLES = 1400;
const MAX_RINGS = 28;

const PARTICLE_VERTEX = /* glsl */ `
attribute float aSize;
attribute float aLife;
attribute vec3 aColor;
varying float vLife;
varying vec3 vColor;

void main() {
  vLife = aLife;
  vColor = aColor;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  // 遠近に応じて粒の大きさを変える。寿命末期ほど小さくなる
  gl_PointSize = aSize * (300.0 / -mvPosition.z) * (0.35 + aLife * 0.65);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const PARTICLE_FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
varying float vLife;
varying vec3 vColor;

void main() {
  vec4 tex = texture2D(uMap, gl_PointCoord);
  if (tex.a < 0.01) discard;
  // 生まれたては白熱し、消え際に属性色へ落ちていく
  vec3 color = mix(vColor, vec3(1.0), pow(vLife, 3.0) * 0.7);
  gl_FragColor = vec4(color, tex.a * vLife);
}
`;

interface Particle {
  life: number;
  maxLife: number;
  velocity: THREE.Vector3;
  gravity: number;
  drag: number;
  size: number;
}

interface Ring {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  startScale: number;
  endScale: number;
  billboard: boolean;
}

export interface ProjectileOptions {
  from: THREE.Vector3;
  to: THREE.Vector3;
  color: THREE.Color;
  /** 山なりの高さ。0で直線 */
  arcHeight?: number;
  durationSec?: number;
  onArrive?: () => void;
}

interface Projectile {
  sprite: THREE.Sprite;
  from: THREE.Vector3;
  to: THREE.Vector3;
  color: THREE.Color;
  arcHeight: number;
  elapsed: number;
  duration: number;
  onArrive?: () => void;
}

/**
 * バトル演出用のパーティクル/リング/弾のプール。
 * 毎フレームCPU側で更新して単一のPointsに書き戻すことで、
 * ドローコールを増やさずに大量の粒を扱う。
 */
export class VfxSystem {
  readonly root = new THREE.Group();

  private readonly particles: Particle[] = [];
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly sizes: Float32Array;
  private readonly lifes: Float32Array;
  private readonly geometry: THREE.BufferGeometry;
  private readonly points: THREE.Points;
  private readonly particleMaterial: THREE.ShaderMaterial;
  private cursor = 0;

  private readonly rings: Ring[] = [];
  private readonly ringPool: THREE.Mesh[] = [];
  private readonly ringGeometry: THREE.PlaneGeometry;

  private readonly projectiles: Projectile[] = [];
  private readonly spritePool: THREE.Sprite[] = [];

  private readonly disposables: { dispose: () => void }[] = [];
  private readonly tmp = new THREE.Vector3();

  constructor() {
    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.colors = new Float32Array(MAX_PARTICLES * 3);
    this.sizes = new Float32Array(MAX_PARTICLES);
    this.lifes = new Float32Array(MAX_PARTICLES);

    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({ life: 0, maxLife: 1, velocity: new THREE.Vector3(), gravity: 0, drag: 0.9, size: 1 });
      // 未使用の粒は原点に置かず、カメラ外へ逃がしておく
      this.positions[i * 3 + 1] = -9999;
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute("aColor", new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute("aSize", new THREE.BufferAttribute(this.sizes, 1));
    this.geometry.setAttribute("aLife", new THREE.BufferAttribute(this.lifes, 1));

    this.particleMaterial = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VERTEX,
      fragmentShader: PARTICLE_FRAGMENT,
      uniforms: { uMap: { value: radialGlowTexture() } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, this.particleMaterial);
    this.points.frustumCulled = false;
    this.root.add(this.points);
    this.disposables.push(this.geometry, this.particleMaterial);

    this.ringGeometry = new THREE.PlaneGeometry(1, 1);
    this.disposables.push(this.ringGeometry);
  }

  private acquireParticle(): number {
    // 一番古い粒から順に使い回すリングバッファ
    const index = this.cursor;
    this.cursor = (this.cursor + 1) % MAX_PARTICLES;
    return index;
  }

  private emit(
    origin: THREE.Vector3,
    color: THREE.Color,
    options: { count: number; speed: number; spread: number; size: number; life: number; gravity?: number; drag?: number; upBias?: number },
  ): void {
    const { count, speed, spread, size, life } = options;
    for (let i = 0; i < count; i++) {
      const index = this.acquireParticle();
      const particle = this.particles[index];

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const magnitude = speed * (0.45 + Math.random() * 0.75);
      particle.velocity.set(
        Math.sin(phi) * Math.cos(theta) * spread,
        Math.cos(phi) * spread + (options.upBias ?? 0),
        Math.sin(phi) * Math.sin(theta) * spread,
      );
      particle.velocity.normalize().multiplyScalar(magnitude);
      particle.velocity.y += options.upBias ?? 0;

      particle.maxLife = life * (0.7 + Math.random() * 0.6);
      particle.life = particle.maxLife;
      particle.gravity = options.gravity ?? -3.2;
      particle.drag = options.drag ?? 0.88;
      particle.size = size * (0.6 + Math.random() * 0.8);

      this.positions[index * 3 + 0] = origin.x + (Math.random() - 0.5) * 0.25;
      this.positions[index * 3 + 1] = origin.y + (Math.random() - 0.5) * 0.25;
      this.positions[index * 3 + 2] = origin.z + (Math.random() - 0.5) * 0.25;
      this.colors[index * 3 + 0] = color.r;
      this.colors[index * 3 + 1] = color.g;
      this.colors[index * 3 + 2] = color.b;
    }
  }

  private spawnRing(
    position: THREE.Vector3,
    color: THREE.Color,
    options: { startScale: number; endScale: number; life: number; billboard: boolean; opacity?: number },
  ): void {
    if (this.rings.length >= MAX_RINGS) {
      const oldest = this.rings.shift();
      if (oldest) this.recycleRing(oldest.mesh);
    }
    let mesh = this.ringPool.pop();
    if (!mesh) {
      const material = new THREE.MeshBasicMaterial({
        map: ringGlowTexture(),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      mesh = new THREE.Mesh(this.ringGeometry, material);
      this.disposables.push(material);
    }
    const material = mesh.material as THREE.MeshBasicMaterial;
    material.color.copy(color);
    material.opacity = options.opacity ?? 1;
    mesh.position.copy(position);
    mesh.scale.setScalar(options.startScale);
    mesh.visible = true;
    if (!options.billboard) mesh.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI);
    this.root.add(mesh);
    this.rings.push({
      mesh,
      life: options.life,
      maxLife: options.life,
      startScale: options.startScale,
      endScale: options.endScale,
      billboard: options.billboard,
    });
  }

  private recycleRing(mesh: THREE.Mesh): void {
    mesh.visible = false;
    this.root.remove(mesh);
    this.ringPool.push(mesh);
  }

  /** 通常ヒット。火花が弾け、地面と正対する衝撃リングが広がる */
  spawnImpact(position: THREE.Vector3, color: THREE.Color, power = 1): void {
    this.emit(position, color, {
      count: Math.round(34 * power),
      speed: 6.5 * power,
      spread: 1,
      size: 13 * power,
      life: 0.55,
      gravity: -6,
      drag: 0.86,
    });
    this.spawnRing(position, color, { startScale: 0.4, endScale: 3.4 * power, life: 0.4, billboard: true });
  }

  /** クリティカル。白熱した破裂と二重リングで「効いた感」を強調する */
  spawnCriticalImpact(position: THREE.Vector3, color: THREE.Color): void {
    this.emit(position, color, { count: 70, speed: 11, spread: 1, size: 20, life: 0.7, gravity: -5, drag: 0.9 });
    this.emit(position, new THREE.Color(0xffffff), { count: 26, speed: 14, spread: 1, size: 12, life: 0.35, gravity: 0, drag: 0.8 });
    this.spawnRing(position, new THREE.Color(0xffffff), { startScale: 0.5, endScale: 5.2, life: 0.34, billboard: true });
    this.spawnRing(position, color, { startScale: 0.3, endScale: 3.6, life: 0.55, billboard: true });
  }

  /** 回復。下から上へ光の粒が立ち上り、足元にリングが出る */
  spawnHeal(position: THREE.Vector3, color: THREE.Color): void {
    const ground = this.tmp.copy(position).setY(0.05);
    this.emit(ground, color, { count: 46, speed: 2.4, spread: 0.55, size: 12, life: 1.15, gravity: 2.6, drag: 0.96, upBias: 1.4 });
    this.spawnRing(ground, color, { startScale: 3.2, endScale: 0.6, life: 0.75, billboard: false });
  }

  /** 強化バフ。足元から上昇する光と、閉じていくリング */
  spawnBuff(position: THREE.Vector3, color: THREE.Color): void {
    const ground = this.tmp.copy(position).setY(0.05);
    this.emit(ground, color, { count: 34, speed: 2.0, spread: 0.4, size: 10, life: 1.0, gravity: 2.2, drag: 0.97, upBias: 1.6 });
    this.spawnRing(ground, color, { startScale: 2.8, endScale: 0.8, life: 0.6, billboard: false });
  }

  /** 弱体デバフ。重く沈む粒と、広がる暗いリング */
  spawnDebuff(position: THREE.Vector3, color: THREE.Color): void {
    this.emit(position, color, { count: 34, speed: 2.2, spread: 0.9, size: 11, life: 0.95, gravity: -3.4, drag: 0.93 });
    this.spawnRing(this.tmp.copy(position).setY(0.05), color, { startScale: 0.7, endScale: 3.0, life: 0.7, billboard: false });
  }

  /** シールド展開。球状に粒が張り付き、正対リングが縮んで結界になる */
  spawnShield(position: THREE.Vector3, color: THREE.Color): void {
    this.emit(position, color, { count: 52, speed: 3.0, spread: 1, size: 11, life: 0.9, gravity: 0, drag: 0.9 });
    this.spawnRing(position, color, { startScale: 4.0, endScale: 1.6, life: 0.55, billboard: true });
  }

  /** 撃破。大量の破片が飛散し、地面に衝撃が走る */
  spawnDeath(position: THREE.Vector3, color: THREE.Color): void {
    this.emit(position, color, { count: 110, speed: 9, spread: 1, size: 16, life: 1.25, gravity: -7, drag: 0.9 });
    this.emit(position, new THREE.Color(0xffffff), { count: 30, speed: 12, spread: 1, size: 10, life: 0.5, gravity: -2, drag: 0.85 });
    this.spawnRing(this.tmp.copy(position).setY(0.06), color, { startScale: 0.5, endScale: 6.0, life: 0.8, billboard: false });
  }

  /** 詠唱の溜め。術者の周りに光が集まってくる */
  spawnCastCharge(position: THREE.Vector3, color: THREE.Color): void {
    for (let i = 0; i < 40; i++) {
      const index = this.acquireParticle();
      const particle = this.particles[index];
      const angle = Math.random() * Math.PI * 2;
      const radius = 2.2 + Math.random() * 1.4;
      const height = (Math.random() - 0.3) * 2;
      this.positions[index * 3 + 0] = position.x + Math.cos(angle) * radius;
      this.positions[index * 3 + 1] = position.y + height;
      this.positions[index * 3 + 2] = position.z + Math.sin(angle) * radius;
      // 中心へ吸い込まれる速度を与える
      particle.velocity.set(-Math.cos(angle) * radius, -height * 0.6, -Math.sin(angle) * radius).multiplyScalar(1.5);
      particle.maxLife = 0.65;
      particle.life = particle.maxLife;
      particle.gravity = 0;
      particle.drag = 1.0;
      particle.size = 9 + Math.random() * 6;
      this.colors[index * 3 + 0] = color.r;
      this.colors[index * 3 + 1] = color.g;
      this.colors[index * 3 + 2] = color.b;
    }
  }

  /** 飛び道具。到達時にonArriveでヒット演出へつなぐ */
  spawnProjectile(options: ProjectileOptions): void {
    let sprite = this.spritePool.pop();
    if (!sprite) {
      const material = new THREE.SpriteMaterial({
        map: streakTexture(),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      sprite = new THREE.Sprite(material);
      this.disposables.push(material);
    }
    (sprite.material as THREE.SpriteMaterial).color.copy(options.color);
    (sprite.material as THREE.SpriteMaterial).opacity = 1;
    sprite.scale.set(0.7, 1.5, 1);
    sprite.position.copy(options.from);
    sprite.visible = true;
    this.root.add(sprite);

    this.projectiles.push({
      sprite,
      from: options.from.clone(),
      to: options.to.clone(),
      color: options.color.clone(),
      arcHeight: options.arcHeight ?? 1.2,
      elapsed: 0,
      duration: options.durationSec ?? 0.32,
      onArrive: options.onArrive,
    });
  }

  update(dt: number): void {
    // --- パーティクル ---
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const particle = this.particles[i];
      if (particle.life <= 0) {
        if (this.lifes[i] !== 0) this.lifes[i] = 0;
        continue;
      }
      particle.life -= dt;
      if (particle.life <= 0) {
        this.lifes[i] = 0;
        this.positions[i * 3 + 1] = -9999;
        continue;
      }
      particle.velocity.y += particle.gravity * dt;
      const damping = Math.pow(particle.drag, dt * 60);
      particle.velocity.multiplyScalar(damping);
      this.positions[i * 3 + 0] += particle.velocity.x * dt;
      this.positions[i * 3 + 1] += particle.velocity.y * dt;
      this.positions[i * 3 + 2] += particle.velocity.z * dt;
      this.lifes[i] = particle.life / particle.maxLife;
      this.sizes[i] = particle.size;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aLife.needsUpdate = true;
    this.geometry.attributes.aSize.needsUpdate = true;
    this.geometry.attributes.aColor.needsUpdate = true;

    // --- リング ---
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i];
      ring.life -= dt;
      if (ring.life <= 0) {
        this.recycleRing(ring.mesh);
        this.rings.splice(i, 1);
        continue;
      }
      const t = 1 - ring.life / ring.maxLife;
      // 立ち上がりを速く、終盤をゆるやかに
      const eased = 1 - Math.pow(1 - t, 3);
      const scale = ring.startScale + (ring.endScale - ring.startScale) * eased;
      ring.mesh.scale.setScalar(scale);
      (ring.mesh.material as THREE.MeshBasicMaterial).opacity = Math.pow(1 - t, 1.5);
    }

    // --- 飛び道具 ---
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const projectile = this.projectiles[i];
      projectile.elapsed += dt;
      const t = Math.min(1, projectile.elapsed / projectile.duration);
      projectile.sprite.position.lerpVectors(projectile.from, projectile.to, t);
      // 放物線状に持ち上げる
      projectile.sprite.position.y += Math.sin(t * Math.PI) * projectile.arcHeight;
      // 進行方向へ軌跡を残す
      if (Math.random() < 0.8) {
        this.emit(projectile.sprite.position, projectile.color, {
          count: 2,
          speed: 1.2,
          spread: 1,
          size: 8,
          life: 0.3,
          gravity: -1,
          drag: 0.85,
        });
      }
      if (t >= 1) {
        projectile.sprite.visible = false;
        this.root.remove(projectile.sprite);
        this.spritePool.push(projectile.sprite);
        this.projectiles.splice(i, 1);
        projectile.onArrive?.();
      }
    }
  }

  /** ビルボードのリングを常にカメラへ向ける */
  faceCamera(camera: THREE.Camera): void {
    for (const ring of this.rings) {
      if (ring.billboard) ring.mesh.quaternion.copy(camera.quaternion);
    }
  }

  dispose(): void {
    for (const item of this.disposables) item.dispose();
  }
}
