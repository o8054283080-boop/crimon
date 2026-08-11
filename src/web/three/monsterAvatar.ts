import * as THREE from "three";
import { Element } from "../../core/element.js";
import { ElementTheme, themeFor } from "./elementTheme.js";
import { SIMPLEX_NOISE_3D } from "./shaderChunks.js";
import { radialGlowTexture, ringGlowTexture, shadowTexture, sigilTexture } from "./textures.js";

/**
 * 役割ごとのシルエット差。実写アセットを持たない代わりに、
 * 「アタッカーは鋭く前傾」「ディフェンダーは重く大きい」のように
 * プロシージャル形状のパラメータで役割を読み取れるようにする。
 */
interface ShapeProfile {
  /** 本体の基準スケール */
  scale: number;
  /** 表面のトゲtrackの強さ(大きいほど鋭い) */
  spikiness: number;
  /** 本体ジオメトリの分割(低いほどローポリで硬質) */
  detail: number;
  /** 周囲を回る破片の数 */
  shardCount: number;
  /** 破片の大きさ */
  shardScale: number;
  /** 破片が回る軌道半径 */
  orbitRadius: number;
  /** 浮遊アニメの速さ */
  bobSpeed: number;
  /** 浮遊アニメの振れ幅 */
  bobAmount: number;
  /** 頭上にリング(光輪)を出すか */
  halo: boolean;
  /** 台座の魔法陣の大きさ */
  sigilScale: number;
}

const DEFAULT_PROFILE: ShapeProfile = {
  scale: 1,
  spikiness: 0.16,
  detail: 3,
  shardCount: 5,
  shardScale: 0.13,
  orbitRadius: 1.35,
  bobSpeed: 1.1,
  bobAmount: 0.09,
  halo: false,
  sigilScale: 1,
};

const ROLE_PROFILE: Record<string, Partial<ShapeProfile>> = {
  アタッカー: { spikiness: 0.3, detail: 2, shardCount: 7, shardScale: 0.16, bobSpeed: 1.5, orbitRadius: 1.45 },
  ディフェンダー: { scale: 1.22, spikiness: 0.1, detail: 1, shardCount: 4, shardScale: 0.24, bobSpeed: 0.7, bobAmount: 0.05, orbitRadius: 1.5 },
  ヒーラー: { scale: 0.92, spikiness: 0.07, detail: 4, shardCount: 6, shardScale: 0.1, bobSpeed: 1.3, bobAmount: 0.13, halo: true },
  サポート: { scale: 0.95, spikiness: 0.12, detail: 2, shardCount: 8, shardScale: 0.11, bobSpeed: 1.2, bobAmount: 0.11, halo: true },
  デバッファー: { spikiness: 0.34, detail: 2, shardCount: 9, shardScale: 0.12, bobSpeed: 1.35, orbitRadius: 1.5 },
  バランス型: { spikiness: 0.18, detail: 3, shardCount: 6, shardScale: 0.14, halo: true },
  ボス: { scale: 1.5, spikiness: 0.26, detail: 3, shardCount: 12, shardScale: 0.2, orbitRadius: 1.95, bobSpeed: 0.65, bobAmount: 0.07, sigilScale: 1.45 },
  素材: { scale: 0.7, spikiness: 0.05, detail: 4, shardCount: 3, shardScale: 0.08, bobSpeed: 1.8, bobAmount: 0.12, orbitRadius: 1.0, sigilScale: 0.8 },
};

function profileFor(role: string): ShapeProfile {
  return { ...DEFAULT_PROFILE, ...(ROLE_PROFILE[role] ?? {}) };
}

const SHELL_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uSpikiness;
uniform float uWound;
varying vec3 vNormalW;
varying vec3 vViewDir;
varying vec3 vLocal;

${SIMPLEX_NOISE_3D}

void main() {
  vLocal = position;
  // 表面をノイズで押し出して、有機的でありながら硬質なシルエットを作る。
  // uWound(手負い度)が上がるほど揺らぎが強くなり、不安定に見える。
  float n = snoise(normal * 1.7 + vec3(0.0, uTime * 0.18, 0.0));
  float wobble = snoise(position * 3.1 + uTime * 0.9) * uWound * 0.06;
  vec3 displaced = position + normal * (n * uSpikiness + wobble);

  vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vViewDir = normalize(cameraPosition - worldPosition.xyz);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const SHELL_FRAGMENT = /* glsl */ `
uniform vec3 uShell;
uniform vec3 uRim;
uniform vec3 uCore;
uniform float uTime;
uniform float uFlash;
uniform float uDissolve;
uniform float uGlow;
uniform float uWound;
varying vec3 vNormalW;
varying vec3 vViewDir;
varying vec3 vLocal;

${SIMPLEX_NOISE_3D}

void main() {
  vec3 normal = normalize(vNormalW);
  vec3 viewDir = normalize(vViewDir);
  float facing = max(dot(normal, viewDir), 0.0);

  // フレネル: 輪郭ほど強く光らせて、暗い背景からシルエットを浮かび上がらせる
  float fresnel = pow(1.0 - facing, 3.0);

  // 簡易的な三点ライティング(キー/フィル/リム)を色で作る
  vec3 keyDir = normalize(vec3(0.55, 0.85, 0.4));
  vec3 fillDir = normalize(vec3(-0.7, 0.25, 0.5));
  float key = max(dot(normal, keyDir), 0.0);
  float fill = max(dot(normal, fillDir), 0.0);

  vec3 color = uShell * (0.28 + key * 0.75 + fill * 0.28);
  color += uRim * fresnel * (1.6 + uGlow * 2.4);
  // 内部の発光が薄い殻越しに透けるような表現
  color += uCore * pow(facing, 2.5) * (0.22 + uGlow * 0.5);

  // 体力が減るほど表面に走る亀裂の発光
  float crack = snoise(vLocal * 5.5 + uTime * 0.15);
  float crackMask = smoothstep(0.55 - uWound * 0.45, 0.62, crack) * uWound;
  color += uCore * crackMask * 2.2;

  color = mix(color, vec3(1.35), uFlash);

  // 撃破時のディゾルブ。ノイズの低い所から順に消え、境界が強く発光する
  float dissolveNoise = snoise(vLocal * 2.6) * 0.5 + 0.5;
  if (dissolveNoise < uDissolve) discard;
  float edge = smoothstep(uDissolve, uDissolve + 0.09, dissolveNoise);
  color = mix(uRim * 4.0, color, edge);

  gl_FragColor = vec4(color, 1.0);
}
`;

/** 攻撃・被弾などの短時間アニメを、経過時間ベースで管理する簡易トラック */
interface AnimTrack {
  elapsed: number;
  duration: number;
  active: boolean;
}

function newTrack(): AnimTrack {
  return { elapsed: 0, duration: 0, active: false };
}

function trigger(track: AnimTrack, duration: number): void {
  track.elapsed = 0;
  track.duration = duration;
  track.active = true;
}

/** 0→1→0 と山なりに動く。跳ねるような動きに使う */
function arc(t: number): number {
  return Math.sin(Math.min(1, Math.max(0, t)) * Math.PI);
}

/** 勢いよく立ち上がってゆっくり戻る。攻撃の踏み込みに使う */
function lungeCurve(t: number): number {
  if (t < 0.28) return Math.pow(t / 0.28, 0.55);
  return Math.pow(1 - (t - 0.28) / 0.72, 1.6);
}

export interface MonsterAvatarOptions {
  element: Element;
  role: string;
  /** PLAYER側は+Z(手前)、ENEMY側は-Z(奥)に立つ */
  facing: 1 | -1;
}

/**
 * 1体分のモンスターを表す3Dアバター。
 * 外殻(フレネルシェーダ)・発光コア・周回する破片・光輪・魔法陣・接地影で構成し、
 * 待機/攻撃/被弾/撃破のアニメーションを持つ。
 */
export class MonsterAvatar {
  readonly root = new THREE.Group();
  readonly theme: ElementTheme;

  private readonly profile: ShapeProfile;
  private readonly body = new THREE.Group();
  private readonly shellMaterial: THREE.ShaderMaterial;
  private readonly coreMesh: THREE.Mesh;
  private readonly coreMaterial: THREE.MeshBasicMaterial;
  private readonly auraSprite: THREE.Sprite;
  private readonly haloMesh: THREE.Mesh | null;
  private readonly sigilMesh: THREE.Mesh;
  private readonly shadowMesh: THREE.Mesh;
  private readonly shards: { mesh: THREE.Mesh; radius: number; speed: number; phase: number; tilt: number; height: number }[] = [];
  private readonly disposables: { dispose: () => void }[] = [];

  private readonly facing: number;
  private readonly phase = Math.random() * Math.PI * 2;

  private readonly attackTrack = newTrack();
  private readonly hitTrack = newTrack();
  private readonly castTrack = newTrack();
  private deathProgress = 0;
  private dying = false;
  private hpRatio = 1;
  private activeGlow = 0;
  private targetActiveGlow = 0;
  private flash = 0;
  private elapsed = 0;

  constructor(options: MonsterAvatarOptions) {
    const { element, role, facing } = options;
    this.theme = themeFor(element);
    this.profile = profileFor(role);
    this.facing = facing;

    const scale = this.profile.scale;

    // --- 外殻 ---
    const shellGeometry = new THREE.IcosahedronGeometry(0.82 * scale, this.profile.detail);
    this.shellMaterial = new THREE.ShaderMaterial({
      vertexShader: SHELL_VERTEX,
      fragmentShader: SHELL_FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uSpikiness: { value: this.profile.spikiness * scale },
        uShell: { value: this.theme.shell.clone() },
        uRim: { value: this.theme.rim.clone() },
        uCore: { value: this.theme.core.clone() },
        uFlash: { value: 0 },
        uDissolve: { value: 0 },
        uGlow: { value: 0 },
        uWound: { value: 0 },
      },
    });
    const shellMesh = new THREE.Mesh(shellGeometry, this.shellMaterial);
    shellMesh.castShadow = true;
    this.body.add(shellMesh);
    this.disposables.push(shellGeometry, this.shellMaterial);

    // --- 発光コア(殻の内側で脈打つ) ---
    const coreGeometry = new THREE.IcosahedronGeometry(0.4 * scale, 1);
    this.coreMaterial = new THREE.MeshBasicMaterial({
      color: this.theme.core,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.coreMesh = new THREE.Mesh(coreGeometry, this.coreMaterial);
    this.body.add(this.coreMesh);
    this.disposables.push(coreGeometry, this.coreMaterial);

    // --- 周囲を回る破片 ---
    const shardGeometry = new THREE.OctahedronGeometry(this.profile.shardScale * scale, 0);
    const shardMaterial = new THREE.MeshBasicMaterial({ color: this.theme.rim, transparent: true, opacity: 0.9 });
    this.disposables.push(shardGeometry, shardMaterial);
    for (let i = 0; i < this.profile.shardCount; i++) {
      const mesh = new THREE.Mesh(shardGeometry, shardMaterial);
      const ratio = i / this.profile.shardCount;
      this.shards.push({
        mesh,
        radius: this.profile.orbitRadius * scale * (0.82 + Math.random() * 0.36),
        speed: 0.5 + Math.random() * 0.6,
        phase: ratio * Math.PI * 2,
        tilt: (Math.random() - 0.5) * 0.9,
        height: (Math.random() - 0.35) * 1.1 * scale,
      });
      this.body.add(mesh);
    }

    // --- 全体を包むソフトなオーラ(ブルームの種になる) ---
    const auraMaterial = new THREE.SpriteMaterial({
      map: radialGlowTexture(),
      color: this.theme.vfx,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.auraSprite = new THREE.Sprite(auraMaterial);
    this.auraSprite.scale.setScalar(4.2 * scale);
    this.body.add(this.auraSprite);
    this.disposables.push(auraMaterial);

    // --- 光輪(支援系のみ) ---
    if (this.profile.halo) {
      const haloGeometry = new THREE.TorusGeometry(0.62 * scale, 0.022 * scale, 8, 64);
      const haloMaterial = new THREE.MeshBasicMaterial({
        color: this.theme.rim,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      this.haloMesh = new THREE.Mesh(haloGeometry, haloMaterial);
      this.haloMesh.rotation.x = Math.PI / 2;
      this.haloMesh.position.y = 1.05 * scale;
      this.body.add(this.haloMesh);
      this.disposables.push(haloGeometry, haloMaterial);
    } else {
      this.haloMesh = null;
    }

    this.root.add(this.body);

    // --- 足元の魔法陣 ---
    const sigilGeometry = new THREE.PlaneGeometry(2.6 * scale * this.profile.sigilScale, 2.6 * scale * this.profile.sigilScale);
    const sigilMaterial = new THREE.MeshBasicMaterial({
      map: sigilTexture(),
      color: this.theme.ground,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.sigilMesh = new THREE.Mesh(sigilGeometry, sigilMaterial);
    this.sigilMesh.rotation.x = -Math.PI / 2;
    this.sigilMesh.position.y = 0.02;
    this.root.add(this.sigilMesh);
    this.disposables.push(sigilGeometry, sigilMaterial);

    // --- 接地影 ---
    const shadowGeometry = new THREE.PlaneGeometry(2.0 * scale, 2.0 * scale);
    const shadowMaterial = new THREE.MeshBasicMaterial({
      map: shadowTexture(),
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    this.shadowMesh = new THREE.Mesh(shadowGeometry, shadowMaterial);
    this.shadowMesh.rotation.x = -Math.PI / 2;
    this.shadowMesh.position.y = 0.012;
    this.root.add(this.shadowMesh);
    this.disposables.push(shadowGeometry, shadowMaterial);

    // 敵味方で向かい合わせる
    this.root.rotation.y = facing > 0 ? 0 : Math.PI;
  }

  /** 台座も含めた立ち位置 */
  setSlotPosition(x: number, z: number): void {
    this.root.position.set(x, 0, z);
  }

  /** ダメージ表示などをぶら下げるための、頭上あたりのワールド座標 */
  getAnchorWorldPosition(target: THREE.Vector3): THREE.Vector3 {
    return this.body.getWorldPosition(target).add(new THREE.Vector3(0, 1.15 * this.profile.scale, 0));
  }

  /** 行動順が回ってきた時のハイライト */
  setActive(active: boolean): void {
    this.targetActiveGlow = active ? 1 : 0;
  }

  /** HP割合。低いほど表面の亀裂が強く光る */
  setHpRatio(ratio: number): void {
    this.hpRatio = Math.max(0, Math.min(1, ratio));
  }

  playAttack(): void {
    trigger(this.attackTrack, 0.62);
  }

  /** 支援・バフスキルなど、その場で力を溜める演出 */
  playCast(): void {
    trigger(this.castTrack, 0.75);
  }

  playHit(): void {
    trigger(this.hitTrack, 0.36);
    this.flash = 1;
  }

  playDeath(): void {
    this.dying = true;
  }

  /** 撃破状態から復帰させる(復活・再挑戦時) */
  revive(): void {
    this.dying = false;
    this.deathProgress = 0;
  }

  isDying(): boolean {
    return this.dying;
  }

  update(dt: number, elapsed: number): void {
    this.elapsed = elapsed;
    const p = this.profile;

    // --- 待機モーション: ゆっくり浮き沈みしながら回る ---
    const bob = Math.sin(elapsed * p.bobSpeed + this.phase) * p.bobAmount;
    this.body.rotation.y += dt * 0.35;

    let forwardOffset = 0;
    let verticalOffset = bob;
    let squash = 1;

    // --- 攻撃: 少し引いてから前方へ踏み込む ---
    if (this.attackTrack.active) {
      this.attackTrack.elapsed += dt;
      const t = this.attackTrack.elapsed / this.attackTrack.duration;
      if (t >= 1) {
        this.attackTrack.active = false;
      } else {
        const anticipation = t < 0.28 ? -Math.sin((t / 0.28) * Math.PI) * 0.35 : 0;
        forwardOffset += lungeCurve(t) * 1.5 + anticipation;
        verticalOffset += arc(t) * 0.22;
      }
    }

    // --- 詠唱: その場で膨らみながら浮き上がる ---
    if (this.castTrack.active) {
      this.castTrack.elapsed += dt;
      const t = this.castTrack.elapsed / this.castTrack.duration;
      if (t >= 1) {
        this.castTrack.active = false;
      } else {
        verticalOffset += arc(t) * 0.5;
        squash *= 1 + arc(t) * 0.14;
      }
    }

    // --- 被弾: のけぞってから戻る ---
    if (this.hitTrack.active) {
      this.hitTrack.elapsed += dt;
      const t = this.hitTrack.elapsed / this.hitTrack.duration;
      if (t >= 1) {
        this.hitTrack.active = false;
      } else {
        const recoil = Math.sin(t * Math.PI * 3) * (1 - t);
        forwardOffset -= recoil * 0.45;
        squash *= 1 - recoil * 0.12;
      }
    }

    this.body.position.set(0, 1.15 * p.scale + verticalOffset, forwardOffset * this.facing);
    this.body.scale.set(squash, 1 / Math.sqrt(squash), squash);

    // --- 発光コアの脈動 ---
    const pulse = 1 + Math.sin(elapsed * 2.4 + this.phase) * 0.11;
    this.coreMesh.scale.setScalar(pulse);
    this.coreMesh.rotation.x += dt * 0.5;
    this.coreMesh.rotation.z -= dt * 0.35;

    // --- 破片の周回 ---
    for (const shard of this.shards) {
      const angle = elapsed * shard.speed + shard.phase;
      shard.mesh.position.set(
        Math.cos(angle) * shard.radius,
        shard.height + Math.sin(angle * 1.7 + shard.phase) * 0.2,
        Math.sin(angle) * shard.radius * Math.cos(shard.tilt),
      );
      shard.mesh.rotation.x += dt * 1.4;
      shard.mesh.rotation.y += dt * 1.1;
    }

    if (this.haloMesh) {
      this.haloMesh.rotation.z += dt * 0.8;
      this.haloMesh.position.y = 1.05 * p.scale + Math.sin(elapsed * 1.6 + this.phase) * 0.06;
    }

    // --- 選択中ハイライトはなめらかに補間する ---
    this.activeGlow += (this.targetActiveGlow - this.activeGlow) * Math.min(1, dt * 7);
    const sigilMaterial = this.sigilMesh.material as THREE.MeshBasicMaterial;
    sigilMaterial.opacity = 0.32 + this.activeGlow * 0.6 + Math.sin(elapsed * 2.2) * 0.04;
    this.sigilMesh.rotation.z += dt * (0.18 + this.activeGlow * 0.7);
    this.sigilMesh.scale.setScalar(1 + this.activeGlow * 0.07);

    const auraMaterial = this.auraSprite.material as THREE.SpriteMaterial;
    auraMaterial.opacity = 0.4 + this.activeGlow * 0.35 + Math.sin(elapsed * 1.8 + this.phase) * 0.05;

    // --- 被弾フラッシュの減衰 ---
    this.flash = Math.max(0, this.flash - dt * 4.5);

    // --- 撃破ディゾルブ ---
    if (this.dying && this.deathProgress < 1) {
      this.deathProgress = Math.min(1, this.deathProgress + dt * 1.15);
      const fade = 1 - this.deathProgress;
      this.coreMaterial.opacity = 0.95 * fade;
      auraMaterial.opacity *= fade;
      sigilMaterial.opacity *= fade;
      (this.shadowMesh.material as THREE.MeshBasicMaterial).opacity = 0.55 * fade;
      for (const shard of this.shards) {
        // 破片は外へ飛び散りながら消える
        shard.mesh.position.multiplyScalar(1 + dt * 1.6);
        (shard.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * fade;
      }
    }

    const uniforms = this.shellMaterial.uniforms;
    uniforms.uTime.value = elapsed;
    uniforms.uFlash.value = this.flash;
    uniforms.uGlow.value = this.activeGlow;
    uniforms.uWound.value = 1 - this.hpRatio;
    uniforms.uDissolve.value = this.deathProgress;
  }

  dispose(): void {
    for (const item of this.disposables) item.dispose();
  }
}
