import * as THREE from "three";
import { BillboardField } from "./billboards.js";
import { SPRITE, flashStarTexture, hexGridTexture, runeCircleTexture, shockRingTexture, smokePuffTexture, vortexTexture } from "./fxTextures.js";
import { ParticleField } from "./particles.js";
import { StripField, zigzagPath } from "./strips.js";

/**
 * 状態異常などの「継続中ずっと出ている」ループエフェクト。
 *
 * 単発のヒットエフェクトと違い、付与から解除までの間ずっと更新され続ける。
 * 生成時にふわっと立ち上がり、解除時にふわっと消えるフェードを内蔵している。
 */

export type StatusAuraKind =
  /** 毒: 紫の泡が身体に纏わりつく */
  | "poison"
  /** 火傷: 炎が身体を舐める */
  | "burn"
  /** 凍結: 氷塊に包まれる */
  | "freeze"
  /** 感電: 微細な電弧が走る */
  | "shock"
  /** シールド: 六角形の結界ドーム */
  | "shield"
  /** 免疫: 金色の輪が回る */
  | "immunity"
  /** 気絶: 頭上を星が回る */
  | "stun"
  /** 継続回復: 緑の光が立ち上る */
  | "regen"
  /** 強化: 足元の陣と上昇する光 */
  | "buff"
  /** 呪い/弱体: 逆回転の暗い陣と落ちる靄 */
  | "curse"
  /** 出血: 赤い雫が滴る */
  | "bleed";

export interface AuraContext {
  particles: ParticleField;
  billboards: BillboardField;
  strips: StripField;
  cameraPosition: THREE.Vector3;
  /** 0.5〜1.5 の負荷スケール */
  quality: number;
}

interface AuraParts {
  update: (dt: number, elapsed: number, ctx: AuraContext, intensity: number, aura: StatusAura) => void;
}

const DEFAULT_COLORS: Record<StatusAuraKind, number> = {
  poison: 0xa64dff,
  burn: 0xff7a1a,
  freeze: 0x7fd8ff,
  shock: 0xffe14d,
  shield: 0x6fd8ff,
  immunity: 0xffd76b,
  stun: 0xffe98a,
  regen: 0x6ef08a,
  buff: 0xffd98a,
  curse: 0x9b4dff,
  bleed: 0xff4d5e,
};

const DOME_VERTEX = /* glsl */ `
varying vec3 vNormalV;
varying vec3 vViewDir;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vNormalV = normalize(normalMatrix * normal);
  vViewDir = normalize(-mvPosition.xyz);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const DOME_FRAGMENT = /* glsl */ `
uniform sampler2D uHex;
uniform vec3 uColor;
uniform float uTime;
uniform float uIntensity;
uniform float uImpact;
varying vec3 vNormalV;
varying vec3 vViewDir;
varying vec2 vUv;

void main() {
  float facing = abs(dot(normalize(vNormalV), normalize(vViewDir)));
  // 輪郭ほど強く光らせて、球であることを伝える
  float fresnel = pow(1.0 - facing, 2.2);
  vec2 uv = vUv * vec2(5.0, 3.0) + vec2(uTime * 0.03, 0.0);
  float hex = texture2D(uHex, uv).a;
  // 上から下へ走るスキャンライン
  float scan = smoothstep(0.45, 0.5, abs(fract(vUv.y * 2.0 - uTime * 0.25) - 0.5));
  float alpha = (fresnel * 0.85 + hex * (0.22 + fresnel * 0.5) + scan * 0.05) * uIntensity;
  alpha += uImpact * (fresnel * 0.8 + hex * 0.5);
  vec3 color = mix(uColor, vec3(1.0), fresnel * 0.55 + uImpact * 0.4);
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
}
`;

function planeMesh(texture: THREE.Texture, color: THREE.Color, size: number, blending: THREE.Blending = THREE.AdditiveBlending): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    color,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.setScalar(size);
  mesh.renderOrder = 4;
  return mesh;
}

export class StatusAura {
  readonly root = new THREE.Group();
  readonly position = new THREE.Vector3();
  readonly color: THREE.Color;
  readonly scale: number;

  private readonly parts: AuraParts;
  private readonly ownedMaterials: THREE.Material[] = [];
  private readonly ownedGeometries: THREE.BufferGeometry[] = [];
  private intensity = 0;
  private detaching = false;
  private timer = 0;
  private phase = Math.random() * 10;
  /** シールドが被弾した時の一瞬の強調 */
  private impact = 0;

  constructor(
    readonly kind: StatusAuraKind,
    position: THREE.Vector3,
    options?: { color?: THREE.Color; scale?: number },
  ) {
    this.position.copy(position);
    this.color = options?.color?.clone() ?? new THREE.Color(DEFAULT_COLORS[kind]);
    this.scale = options?.scale ?? 1;
    this.root.position.copy(position);
    this.parts = this.build();
  }

  private own<T extends THREE.Object3D>(object: T): T {
    object.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        this.ownedGeometries.push(mesh.geometry);
        const material = mesh.material as THREE.Material | THREE.Material[];
        if (Array.isArray(material)) this.ownedMaterials.push(...material);
        else this.ownedMaterials.push(material);
      }
    });
    this.root.add(object);
    return object;
  }

  private build(): AuraParts {
    const s = this.scale;
    switch (this.kind) {
      case "poison": {
        // 足元によどんだ紫の沼。上から見ると渦を巻いている
        const puddle = this.own(planeMesh(vortexTexture(), this.color, 2.6 * s));
        puddle.rotation.x = -Math.PI / 2;
        puddle.position.y = -1.02 * s;
        const haze = this.own(planeMesh(smokePuffTexture(), this.color.clone().multiplyScalar(0.55), 2.2 * s, THREE.NormalBlending));
        haze.position.y = -0.3 * s;
        let emit = 0;
        return {
          update: (dt, elapsed, ctx, intensity, aura) => {
            puddle.rotation.z += dt * 0.5;
            (puddle.material as THREE.MeshBasicMaterial).opacity = (0.32 + Math.sin(elapsed * 2.2 + aura.phase) * 0.08) * intensity;
            (haze.material as THREE.MeshBasicMaterial).opacity = 0.18 * intensity;
            haze.quaternion.copy(aura.faceQuaternion);
            emit -= dt;
            if (emit > 0) return;
            emit = 0.085 / ctx.quality;
            // 身体に纏わりつくように、少し内側から泡が湧いて登っていく
            const angle = Math.random() * Math.PI * 2;
            const radius = (0.35 + Math.random() * 0.6) * s;
            ctx.particles.spawn({
              position: new THREE.Vector3(
                aura.position.x + Math.cos(angle) * radius,
                aura.position.y - (0.9 - Math.random() * 0.6) * s,
                aura.position.z + Math.sin(angle) * radius,
              ),
              velocity: new THREE.Vector3(0, 0.55 + Math.random() * 0.5, 0),
              color: aura.color,
              size: (10 + Math.random() * 12) * s,
              life: 1.1 + Math.random() * 0.5,
              cell: SPRITE.BUBBLE,
              layer: "alpha",
              alpha: 0.85 * intensity,
              drag: 0.995,
              wobble: 0.5,
              growth: 1.35,
              fadeIn: 0.15,
              spin: (Math.random() - 0.5) * 1.2,
            });
          },
        };
      }

      case "burn": {
        const emberGlow = this.own(planeMesh(smokePuffTexture(), new THREE.Color(0xff5a1f), 2.0 * s));
        emberGlow.rotation.x = -Math.PI / 2;
        emberGlow.position.y = -1.0 * s;
        let emit = 0;
        return {
          update: (dt, elapsed, ctx, intensity, aura) => {
            const flicker = 0.35 + Math.sin(elapsed * 13 + aura.phase) * 0.12 + Math.sin(elapsed * 27) * 0.06;
            (emberGlow.material as THREE.MeshBasicMaterial).opacity = flicker * intensity;
            emit -= dt;
            if (emit > 0) return;
            emit = 0.045 / ctx.quality;
            const angle = Math.random() * Math.PI * 2;
            const radius = (0.2 + Math.random() * 0.55) * s;
            const height = -0.95 + Math.random() * 1.5;
            // 身体を舐めるように、下から上へ舌が伸びる
            ctx.particles.spawn({
              position: new THREE.Vector3(
                aura.position.x + Math.cos(angle) * radius,
                aura.position.y + height * s,
                aura.position.z + Math.sin(angle) * radius,
              ),
              velocity: new THREE.Vector3((Math.random() - 0.5) * 0.3, 1.5 + Math.random() * 1.4, (Math.random() - 0.5) * 0.3),
              color: aura.color.clone().lerp(new THREE.Color(0xffe07a), Math.random() * 0.6),
              size: (13 + Math.random() * 12) * s,
              life: 0.42 + Math.random() * 0.28,
              cell: SPRITE.FLAME,
              alpha: 0.95 * intensity,
              drag: 0.9,
              growth: 0.55,
              fadePower: 1.4,
            });
            if (Math.random() < 0.25) {
              ctx.particles.spawn({
                position: new THREE.Vector3(aura.position.x, aura.position.y + 0.7 * s, aura.position.z),
                velocity: new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.9 + Math.random() * 0.5, (Math.random() - 0.5) * 0.4),
                color: new THREE.Color(0x2a2028),
                size: (22 + Math.random() * 16) * s,
                life: 1.1,
                cell: SPRITE.SMOKE,
                layer: "alpha",
                alpha: 0.35 * intensity,
                drag: 0.96,
                growth: 2.0,
                fadeIn: 0.2,
                spin: (Math.random() - 0.5) * 0.8,
              });
            }
          },
        };
      }

      case "freeze": {
        // 実ジオメトリの氷塊で「固まっている」重さを出す
        const group = new THREE.Group();
        const shardGeometry = new THREE.OctahedronGeometry(0.34 * s, 0);
        const shardMaterial = new THREE.MeshBasicMaterial({
          color: this.color,
          transparent: true,
          opacity: 0.55,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        for (let i = 0; i < 7; i++) {
          const shard = new THREE.Mesh(shardGeometry, shardMaterial);
          const angle = (i / 7) * Math.PI * 2 + Math.random();
          const radius = (0.55 + Math.random() * 0.4) * s;
          shard.position.set(Math.cos(angle) * radius, (Math.random() - 0.45) * 1.5 * s, Math.sin(angle) * radius);
          shard.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
          shard.scale.setScalar(0.7 + Math.random() * 0.9);
          group.add(shard);
        }
        this.own(group);
        this.ownedGeometries.push(shardGeometry);
        this.ownedMaterials.push(shardMaterial);
        let emit = 0;
        return {
          update: (dt, elapsed, ctx, intensity, aura) => {
            group.rotation.y += dt * 0.25;
            shardMaterial.opacity = 0.5 * intensity;
            group.scale.setScalar(0.9 + intensity * 0.1 + Math.sin(elapsed * 3) * 0.02);
            emit -= dt;
            if (emit > 0) return;
            emit = 0.14 / ctx.quality;
            const angle = Math.random() * Math.PI * 2;
            ctx.particles.spawn({
              position: new THREE.Vector3(
                aura.position.x + Math.cos(angle) * 0.8 * s,
                aura.position.y + (0.4 - Math.random()) * s,
                aura.position.z + Math.sin(angle) * 0.8 * s,
              ),
              velocity: new THREE.Vector3(0, -0.5 - Math.random() * 0.4, 0),
              color: aura.color,
              size: (7 + Math.random() * 7) * s,
              life: 1.0,
              cell: Math.random() < 0.4 ? SPRITE.CRYSTAL : SPRITE.MOTE,
              alpha: 0.8 * intensity,
              drag: 0.99,
              spin: (Math.random() - 0.5) * 1.5,
            });
          },
        };
      }

      case "shock": {
        let emit = 0;
        return {
          update: (dt, elapsed, ctx, intensity, aura) => {
            emit -= dt;
            if (emit > 0) return;
            emit = 0.13 / ctx.quality;
            // 身体の表面を短い電弧が走る
            const a0 = Math.random() * Math.PI * 2;
            const a1 = a0 + 1.2 + Math.random() * 1.6;
            const r = 0.75 * s;
            const from = new THREE.Vector3(
              aura.position.x + Math.cos(a0) * r,
              aura.position.y + (Math.random() - 0.5) * 1.4 * s,
              aura.position.z + Math.sin(a0) * r,
            );
            const to = new THREE.Vector3(
              aura.position.x + Math.cos(a1) * r,
              aura.position.y + (Math.random() - 0.5) * 1.4 * s,
              aura.position.z + Math.sin(a1) * r,
            );
            ctx.strips.spawn(
              {
                points: zigzagPath(from, to, 7, 0.18 * s, ctx.cameraPosition),
                color: aura.color,
                width: 0.07 * s,
                life: 0.14,
                coreWhite: 0.8,
                glow: 0.4,
                flicker: 0.4,
                opacity: intensity,
              },
              ctx.cameraPosition,
            );
            ctx.particles.spawn({
              position: from,
              velocity: new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2),
              color: aura.color,
              size: 8 * s,
              life: 0.25,
              cell: SPRITE.SPARK,
              alpha: intensity,
              drag: 0.85,
            });
          },
        };
      }

      case "shield": {
        const geometry = new THREE.SphereGeometry(1.35 * s, 26, 18);
        const material = new THREE.ShaderMaterial({
          vertexShader: DOME_VERTEX,
          fragmentShader: DOME_FRAGMENT,
          uniforms: {
            uHex: { value: hexGridTexture() },
            uColor: { value: this.color.clone() },
            uTime: { value: 0 },
            uIntensity: { value: 0 },
            uImpact: { value: 0 },
          },
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        });
        const dome = new THREE.Mesh(geometry, material);
        dome.renderOrder = 4;
        this.own(dome);
        // 赤道を回るリングで「装置感」を足す
        const equator = this.own(planeMesh(shockRingTexture(), this.color, 3.1 * s));
        equator.rotation.x = -Math.PI / 2;
        let emit = 0;
        return {
          update: (dt, elapsed, ctx, intensity, aura) => {
            material.uniforms.uTime.value = elapsed;
            material.uniforms.uIntensity.value = intensity * (0.55 + Math.sin(elapsed * 1.7 + aura.phase) * 0.08);
            material.uniforms.uImpact.value = aura.impact;
            dome.scale.setScalar(1 + aura.impact * 0.06);
            equator.position.y = Math.sin(elapsed * 0.9) * 0.9 * s;
            equator.rotation.z += dt * 0.4;
            (equator.material as THREE.MeshBasicMaterial).opacity = 0.32 * intensity;
            emit -= dt;
            if (emit > 0) return;
            emit = 0.18 / ctx.quality;
            const angle = Math.random() * Math.PI * 2;
            const y = (Math.random() - 0.5) * 2;
            const r = Math.sqrt(Math.max(0, 1 - y * y)) * 1.35 * s;
            ctx.particles.spawn({
              position: new THREE.Vector3(aura.position.x + Math.cos(angle) * r, aura.position.y + y * 1.35 * s, aura.position.z + Math.sin(angle) * r),
              velocity: new THREE.Vector3(0, 0.1, 0),
              color: aura.color,
              size: 12 * s,
              life: 0.6,
              cell: SPRITE.HEX,
              alpha: 0.75 * intensity,
              drag: 0.98,
              spin: 0.6,
              growth: 1.4,
              fadeIn: 0.12,
            });
          },
        };
      }

      case "immunity": {
        // 金の輪が2枚、傾きを変えて逆回転する
        const ringA = this.own(planeMesh(shockRingTexture(), this.color, 2.7 * s));
        const ringB = this.own(planeMesh(shockRingTexture(), this.color, 2.2 * s));
        ringA.rotation.x = -Math.PI / 2;
        ringB.rotation.x = -Math.PI / 2 + 0.55;
        let emit = 0;
        return {
          update: (dt, elapsed, ctx, intensity, aura) => {
            ringA.position.y = Math.sin(elapsed * 1.1) * 0.75 * s;
            ringB.position.y = Math.sin(elapsed * 1.1 + Math.PI) * 0.75 * s;
            ringA.rotation.z += dt * 1.1;
            ringB.rotation.z -= dt * 0.8;
            ringB.rotation.y += dt * 0.6;
            const alpha = (0.5 + Math.sin(elapsed * 2.4) * 0.12) * intensity;
            (ringA.material as THREE.MeshBasicMaterial).opacity = alpha;
            (ringB.material as THREE.MeshBasicMaterial).opacity = alpha * 0.8;
            emit -= dt;
            if (emit > 0) return;
            emit = 0.16 / ctx.quality;
            const angle = Math.random() * Math.PI * 2;
            ctx.particles.spawn({
              position: new THREE.Vector3(
                aura.position.x + Math.cos(angle) * 1.2 * s,
                aura.position.y + (Math.random() - 0.5) * 1.6 * s,
                aura.position.z + Math.sin(angle) * 1.2 * s,
              ),
              velocity: new THREE.Vector3(0, 0.5, 0),
              color: aura.color,
              size: 9 * s,
              life: 0.8,
              cell: SPRITE.FLARE,
              alpha: 0.9 * intensity,
              drag: 0.97,
              spin: 1.2,
            });
          },
        };
      }

      case "stun": {
        const group = new THREE.Group();
        const stars: THREE.Mesh[] = [];
        for (let i = 0; i < 4; i++) {
          const star = planeMesh(flashStarTexture(), this.color, 0.75 * s);
          group.add(star);
          stars.push(star);
        }
        this.own(group);
        group.position.y = 1.15 * s;
        return {
          update: (dt, elapsed, ctx, intensity, aura) => {
            stars.forEach((star, i) => {
              const angle = elapsed * 3.2 + (i / stars.length) * Math.PI * 2;
              star.position.set(Math.cos(angle) * 0.85 * s, Math.sin(angle * 2) * 0.12 * s, Math.sin(angle) * 0.5 * s);
              star.quaternion.copy(aura.faceQuaternion);
              star.rotateZ(elapsed * 2 + i);
              (star.material as THREE.MeshBasicMaterial).opacity = intensity * (0.75 + Math.sin(elapsed * 6 + i) * 0.2);
            });
          },
        };
      }

      case "regen": {
        const sigil = this.own(planeMesh(runeCircleTexture(), this.color, 2.4 * s));
        sigil.rotation.x = -Math.PI / 2;
        sigil.position.y = -1.05 * s;
        let emit = 0;
        return {
          update: (dt, elapsed, ctx, intensity, aura) => {
            sigil.rotation.z += dt * 0.35;
            (sigil.material as THREE.MeshBasicMaterial).opacity = (0.35 + Math.sin(elapsed * 2) * 0.1) * intensity;
            emit -= dt;
            if (emit > 0) return;
            emit = 0.1 / ctx.quality;
            const angle = Math.random() * Math.PI * 2;
            const radius = (0.3 + Math.random() * 0.8) * s;
            ctx.particles.spawn({
              position: new THREE.Vector3(
                aura.position.x + Math.cos(angle) * radius,
                aura.position.y - 1.0 * s,
                aura.position.z + Math.sin(angle) * radius,
              ),
              velocity: new THREE.Vector3(0, 1.1 + Math.random() * 0.7, 0),
              color: aura.color,
              size: (8 + Math.random() * 6) * s,
              life: 1.3,
              cell: SPRITE.MOTE,
              alpha: 0.9 * intensity,
              drag: 0.99,
              wobble: 0.35,
              fadePower: 1.5,
            });
          },
        };
      }

      case "buff": {
        const sigil = this.own(planeMesh(runeCircleTexture(), this.color, 2.6 * s));
        sigil.rotation.x = -Math.PI / 2;
        sigil.position.y = -1.05 * s;
        let emit = 0;
        return {
          update: (dt, elapsed, ctx, intensity, aura) => {
            sigil.rotation.z += dt * 0.55;
            (sigil.material as THREE.MeshBasicMaterial).opacity = (0.4 + Math.sin(elapsed * 2.6) * 0.12) * intensity;
            emit -= dt;
            if (emit > 0) return;
            emit = 0.12 / ctx.quality;
            const angle = elapsed * 2.5 + Math.random() * 0.6;
            const radius = 1.0 * s;
            ctx.particles.spawn({
              position: new THREE.Vector3(
                aura.position.x + Math.cos(angle) * radius,
                aura.position.y - 1.0 * s,
                aura.position.z + Math.sin(angle) * radius,
              ),
              velocity: new THREE.Vector3(0, 1.6 + Math.random() * 0.8, 0),
              color: aura.color,
              size: (9 + Math.random() * 7) * s,
              life: 1.0,
              cell: SPRITE.STREAK,
              alpha: 0.85 * intensity,
              drag: 0.99,
              swirl: 2.2,
              rotation: Math.PI / 2,
            });
          },
        };
      }

      case "curse": {
        const sigil = this.own(planeMesh(runeCircleTexture(), this.color, 2.5 * s));
        sigil.rotation.x = -Math.PI / 2;
        sigil.position.y = -1.05 * s;
        const halo = this.own(planeMesh(vortexTexture(), this.color.clone().multiplyScalar(0.7), 1.8 * s));
        halo.position.y = 1.3 * s;
        halo.rotation.x = -Math.PI / 2;
        let emit = 0;
        return {
          update: (dt, elapsed, ctx, intensity, aura) => {
            sigil.rotation.z -= dt * 0.5;
            halo.rotation.z += dt * 0.9;
            (sigil.material as THREE.MeshBasicMaterial).opacity = 0.4 * intensity;
            (halo.material as THREE.MeshBasicMaterial).opacity = (0.28 + Math.sin(elapsed * 3) * 0.08) * intensity;
            emit -= dt;
            if (emit > 0) return;
            emit = 0.11 / ctx.quality;
            const angle = Math.random() * Math.PI * 2;
            ctx.particles.spawn({
              position: new THREE.Vector3(
                aura.position.x + Math.cos(angle) * 0.9 * s,
                aura.position.y + 1.1 * s,
                aura.position.z + Math.sin(angle) * 0.9 * s,
              ),
              velocity: new THREE.Vector3(0, -0.9 - Math.random() * 0.5, 0),
              color: aura.color,
              size: (16 + Math.random() * 14) * s,
              life: 1.2,
              cell: SPRITE.SMOKE,
              layer: "alpha",
              alpha: 0.5 * intensity,
              drag: 0.98,
              growth: 1.6,
              fadeIn: 0.2,
              spin: (Math.random() - 0.5) * 0.6,
            });
          },
        };
      }

      case "bleed":
      default: {
        let emit = 0;
        return {
          update: (dt, elapsed, ctx, intensity, aura) => {
            emit -= dt;
            if (emit > 0) return;
            emit = 0.12 / ctx.quality;
            const angle = Math.random() * Math.PI * 2;
            ctx.particles.spawn({
              position: new THREE.Vector3(
                aura.position.x + Math.cos(angle) * 0.5 * s,
                aura.position.y + (Math.random() - 0.2) * 0.8 * s,
                aura.position.z + Math.sin(angle) * 0.5 * s,
              ),
              velocity: new THREE.Vector3(0, -0.2, 0),
              color: aura.color,
              size: (9 + Math.random() * 6) * s,
              life: 0.9,
              cell: SPRITE.DROP,
              layer: "alpha",
              alpha: 0.9 * intensity,
              gravity: -6,
              drag: 1,
            });
          },
        };
      }
    }
  }

  /** ビルボード用のカメラ姿勢(update前にVfxSystemが更新する) */
  readonly faceQuaternion = new THREE.Quaternion();

  setPosition(position: THREE.Vector3): void {
    this.position.copy(position);
    this.root.position.copy(position);
  }

  /** 被弾など、一瞬だけ強く光らせる(主にシールド) */
  pulse(strength = 1): void {
    this.impact = Math.min(1.5, this.impact + strength);
  }

  beginDetach(): void {
    this.detaching = true;
  }

  get isDetaching(): boolean {
    return this.detaching;
  }

  /** 生きている間 true。フェードアウトし切ったら false */
  update(dt: number, elapsed: number, ctx: AuraContext, faceQuaternion: THREE.Quaternion): boolean {
    this.faceQuaternion.copy(faceQuaternion);
    this.timer += dt;
    const target = this.detaching ? 0 : 1;
    this.intensity += (target - this.intensity) * Math.min(1, dt * 6);
    this.impact *= Math.pow(0.02, dt);
    if (this.detaching && this.intensity < 0.02) return false;
    // 消えかけのオーラからは粒を出さない
    this.parts.update(dt, elapsed + this.phase, ctx, this.intensity, this);
    return true;
  }

  dispose(): void {
    for (const geometry of this.ownedGeometries) geometry.dispose();
    for (const material of this.ownedMaterials) material.dispose();
    this.ownedGeometries.length = 0;
    this.ownedMaterials.length = 0;
    this.root.clear();
  }
}
