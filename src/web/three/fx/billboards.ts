import * as THREE from "three";

/**
 * 板ポリ(1枚のPlane)を使う大物エフェクトのプール。
 * 閃光・火球・煙・衝撃波リング・光の柱・地面のデカールなど、
 * 粒では出せない「大きな面」を担当する。
 */

export type BillboardOrient =
  /** 常にカメラへ正対 */
  | "camera"
  /** 地面に寝かせる(デカール/波紋) */
  | "ground"
  /** Y軸だけカメラへ向ける(光の柱など縦のもの) */
  | "upright"
  /** 生成時に指定した姿勢のまま */
  | "fixed";

export interface BillboardSpec {
  position: THREE.Vector3;
  texture: THREE.Texture;
  color: THREE.Color;
  life: number;
  startScale: number;
  endScale: number;
  /** 縦横比。1以外にすると縦長/横長になる */
  aspect?: number;
  opacity?: number;
  orient?: BillboardOrient;
  quaternion?: THREE.Quaternion;
  /** 面内の回転(ラジアン) */
  roll?: number;
  spin?: number;
  blending?: THREE.Blending;
  fadeIn?: number;
  /** 不透明度の減衰カーブ。大きいほど早く消える */
  fadePower?: number;
  velocity?: THREE.Vector3;
  gravity?: number;
  drag?: number;
  /** スケール変化のカーブ。"burst"=一気に開いて緩やか、"linear"、"pop"=行き過ぎて戻る */
  scaleEase?: "burst" | "linear" | "pop";
  renderOrder?: number;
}

interface BillboardItem {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
  startScale: number;
  endScale: number;
  aspect: number;
  opacity: number;
  orient: BillboardOrient;
  roll: number;
  spin: number;
  fadeIn: number;
  fadePower: number;
  velocity: THREE.Vector3;
  gravity: number;
  drag: number;
  scaleEase: "burst" | "linear" | "pop";
}

const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

export class BillboardField {
  readonly root = new THREE.Group();
  private readonly geometry = new THREE.PlaneGeometry(1, 1);
  private readonly items: BillboardItem[] = [];
  private readonly pool: BillboardItem[] = [];
  private readonly quaternion = new THREE.Quaternion();
  private readonly groundQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));

  constructor(private readonly capacity = 64) {}

  spawn(spec: BillboardSpec): void {
    if (this.items.length >= this.capacity) {
      const oldest = this.items.shift();
      if (oldest) this.release(oldest);
    }
    let item = this.pool.pop();
    if (!item) {
      const material = new THREE.MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(this.geometry, material);
      item = {
        mesh,
        material,
        life: 0,
        maxLife: 1,
        startScale: 1,
        endScale: 1,
        aspect: 1,
        opacity: 1,
        orient: "camera",
        roll: 0,
        spin: 0,
        fadeIn: 0,
        fadePower: 1,
        velocity: new THREE.Vector3(),
        gravity: 0,
        drag: 1,
        scaleEase: "burst",
      };
    }

    item.material.map = spec.texture;
    item.material.color.copy(spec.color);
    item.material.blending = spec.blending ?? THREE.AdditiveBlending;
    item.material.opacity = spec.fadeIn ? 0 : (spec.opacity ?? 1);
    item.material.needsUpdate = true;
    item.maxLife = Math.max(0.01, spec.life);
    item.life = item.maxLife;
    item.startScale = spec.startScale;
    item.endScale = spec.endScale;
    item.aspect = spec.aspect ?? 1;
    item.opacity = spec.opacity ?? 1;
    item.orient = spec.orient ?? "camera";
    item.roll = spec.roll ?? 0;
    item.spin = spec.spin ?? 0;
    item.fadeIn = spec.fadeIn ?? 0;
    item.fadePower = spec.fadePower ?? 1;
    item.gravity = spec.gravity ?? 0;
    item.drag = spec.drag ?? 1;
    item.scaleEase = spec.scaleEase ?? "burst";
    if (spec.velocity) item.velocity.copy(spec.velocity);
    else item.velocity.set(0, 0, 0);

    item.mesh.position.copy(spec.position);
    item.mesh.scale.set(spec.startScale, spec.startScale * item.aspect, 1);
    item.mesh.renderOrder = spec.renderOrder ?? 4;
    item.mesh.visible = true;
    if (spec.orient === "fixed" && spec.quaternion) item.mesh.quaternion.copy(spec.quaternion);
    if (spec.orient === "ground") item.mesh.quaternion.copy(this.groundQuaternion);

    this.root.add(item.mesh);
    this.items.push(item);
  }

  private release(item: BillboardItem): void {
    item.mesh.visible = false;
    this.root.remove(item.mesh);
    this.pool.push(item);
  }

  update(dt: number, camera: THREE.Camera | null): void {
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

      let progress: number;
      if (item.scaleEase === "linear") progress = t;
      else if (item.scaleEase === "pop") progress = Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.72) / Math.sin(Math.PI * 0.72);
      else progress = easeOutCubic(t);
      const scale = item.startScale + (item.endScale - item.startScale) * progress;
      item.mesh.scale.set(scale, scale * item.aspect, 1);

      let opacity = item.opacity * Math.pow(1 - t, item.fadePower);
      if (item.fadeIn > 0 && age < item.fadeIn) opacity *= age / item.fadeIn;
      item.material.opacity = opacity;

      if (item.gravity !== 0) item.velocity.y += item.gravity * dt;
      if (item.drag !== 1) item.velocity.multiplyScalar(Math.pow(item.drag, dt * 60));
      if (item.velocity.lengthSq() > 0) {
        item.mesh.position.addScaledVector(item.velocity, dt);
      }
      item.roll += item.spin * dt;

      if (camera) {
        if (item.orient === "camera") {
          item.mesh.quaternion.copy(camera.quaternion);
          if (item.roll !== 0) item.mesh.rotateZ(item.roll);
        } else if (item.orient === "upright") {
          // カメラの水平方向だけを見る(柱が寝ないようにする)
          const dx = camera.position.x - item.mesh.position.x;
          const dz = camera.position.z - item.mesh.position.z;
          item.mesh.rotation.set(0, Math.atan2(dx, dz), 0);
        } else if (item.orient === "ground") {
          this.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), item.roll);
          item.mesh.quaternion.copy(this.groundQuaternion).multiply(this.quaternion);
        }
      }
    }
  }

  get activeCount(): number {
    return this.items.length;
  }

  dispose(): void {
    this.geometry.dispose();
    for (const item of [...this.items, ...this.pool]) item.material.dispose();
    this.items.length = 0;
    this.pool.length = 0;
  }
}
