import * as THREE from "three";

/**
 * 板ポリ(1枚のPlane)を使う大物エフェクトのプール。
 * 閃光・火球・煙・衝撃波リング・光の柱・地面のデカールなど、
 * 粒では出せない「大きな面」を担当する。
 *
 * ## 合成(粒と同じ設計)
 *
 * 既定は**スクリーン合成**。`s + d*(1-s)` なので、何枚重ねても 1.0 を
 * 超えない。板は面積が大きいぶん素の加算では最も飽和しやすい要素で、
 * 「火球3枚+閃光+輪」を重ねただけで画面が白く潰れていた。
 * スクリーンなら枚数を増やしても白い塊にはならず、代わりに
 * 「濃くなる」方向へ寄っていく。
 *
 * ブルーム(しきい値1.15)へ載せたい芯だけ `blendMode: "add"` を使う。
 * こちらは色に増幅を掛けて意図的に1を超えさせるので、
 * **小さく短命なものにしか使わないこと。**
 */

/**
 * 合成方法を層ごとに設定する。
 *
 * **既定を加算にしてはいけない。** 板は面積が大きいので、素の加算だと
 * 「閃光+光条+衝撃輪」を重ねただけで画面全体が1.0を大きく超え、
 * ブルーム(しきい値1.15)が全面に広がってACESが高輝度を白へ寄せる。
 * 実際に「被弾していない味方まで含めて8体全員が真っ白に飛ぶ」状態になっていた。
 *
 * スクリーン合成 `s + d*(1-s)` なら何枚重ねても1.0を超えない。
 */
function applyBlend(material: THREE.Material & { blendEquation: THREE.BlendingEquation; blendSrc: THREE.BlendingSrcFactor; blendDst: THREE.BlendingDstFactor; blendSrcAlpha: unknown; blendDstAlpha: unknown; premultipliedAlpha: boolean }, mode: "glow" | "add" | "alpha"): void {
  material.blending = THREE.CustomBlending;
  material.blendEquation = THREE.AddEquation;
  material.blendSrc = THREE.OneFactor;
  material.blendDst =
    mode === "add" ? THREE.OneFactor : mode === "alpha" ? THREE.OneMinusSrcAlphaFactor : THREE.OneMinusSrcColorFactor;
  material.blendSrcAlpha = THREE.OneFactor;
  material.blendDstAlpha = mode === "add" ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor;
  material.premultipliedAlpha = true;
}

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
  /**
   * 合成の層。既定は "glow"(スクリーン合成)。
   * "add" はブルームへ載せたい**小さく短命な芯**にだけ使う。
   */
  blendMode?: "glow" | "add" | "alpha";
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

  constructor(private readonly capacity = 64) {
    this.softLimit = Math.max(6, Math.round(capacity * 0.12));
  }

  /**
   * 板の大きさにかかる共通倍率。
   * エフェクトはカメラの画角と距離に対して相対的に大きすぎると、
   * 加算合成のため画面全体が白く飽和してしまう。個々の指定値を
   * 直すのではなく、ここで一括して現在の構図に合う大きさへ収める。
   */
  sizeScale = 1;

  /**
   * 1枚の板が取りうる最大の大きさ(ワールド単位)。
   * 加算合成では画面を覆う板が1枚あるだけで全体が白く飽和するため、
   * 演出側がどんな値を指定しても、ここで物理的に頭打ちにする。
   */
  /**
   * 板1枚の大きさの上限。
   *
   * **上限が無かった。**最大の演出は 8.0 倍まで広がり、実機では1枚で
   * 画面の大半を覆う。半透明の板が画面を覆うということは、その画素を
   * もう一度全部塗るということで、数枚重なれば塗り直しの量が跳ね上がる。
   * 実測(実機の録画)で、演出中の実効フレームレートが31.5fpsまで落ちていた。
   *
   * 画面を覆えない大きさで頭を押さえる。派手さは大きさではなく、
   * 形と時間差で作ること。
   */
  maxScale = 4.2;

  /**
   * 板の不透明度にかかる共通倍率。
   * 加算合成は重なった枚数だけ明るくなるため、1枚あたりを薄くしておかないと
   * 同時に多くの演出が出た瞬間に画面が白く飽和する。
   */
  opacityScale = 1;

  /**
   * この枚数を超えたあたりから、新しい板を確率的に間引く。
   * 加算合成では枚数がそのまま明るさになるため、同時に多数が重なると
   * 個々をいくら小さく薄くしても画面が白く飽和してしまう。
   * 混雑してきたら描かずに捨てることで、見た目の上限を保つ。
   */
  private readonly softLimit: number;

  spawn(spec: BillboardSpec): void {
    if (this.items.length > this.softLimit) {
      const over = (this.items.length - this.softLimit) / Math.max(1, this.capacity - this.softLimit);
      if (Math.random() < Math.min(0.985, over)) return;
    }
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
    applyBlend(item.material, spec.blendMode ?? "glow");
    item.material.opacity = spec.fadeIn ? 0 : (spec.opacity ?? 1) * this.opacityScale;
    item.material.needsUpdate = true;
    item.maxLife = Math.max(0.01, spec.life);
    item.life = item.maxLife;
    item.startScale = Math.min(spec.startScale * this.sizeScale, this.maxScale);
    item.endScale = Math.min(spec.endScale * this.sizeScale, this.maxScale);
    item.aspect = spec.aspect ?? 1;
    item.opacity = (spec.opacity ?? 1) * this.opacityScale;
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
    item.mesh.scale.set(item.startScale, item.startScale * item.aspect, 1);
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
