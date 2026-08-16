import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CreatureKit } from "./kit.js";

/** 手足・翼のように「付け根と第2関節」を持つ部位 */
export interface RigLimb {
  /** 付け根(肩・股関節) */
  root: THREE.Group;
  rootRest: THREE.Euler;
  /** 第2関節(肘・膝)。無い場合はnull */
  lower: THREE.Group | null;
  lowerRest: THREE.Euler | null;
  /** 末端(手先・足先) */
  tip: THREE.Group;
  /** +1が右、-1が左 */
  side: number;
  /** 揺れの位相をずらすための値 */
  phase: number;
  /** 四足の前脚。後脚と役割が違うので、モーション側で区別する */
  front?: boolean;
}

/** 尾・触手のような連鎖部位の1節 */
export interface RigJoint {
  group: THREE.Group;
  rest: THREE.Euler;
}

/** 布・リボンのように受動的に揺れる部位 */
export interface RigCloth {
  group: THREE.Group;
  rest: THREE.Euler;
  phase: number;
  /** 揺れ幅の倍率 */
  amount: number;
}

/** 常時回転し続ける装飾(結晶の環など) */
export interface RigSpinner {
  object: THREE.Object3D;
  axis: "x" | "y" | "z";
  speed: number;
}

/** 周囲を漂う破片・結晶 */
export interface RigOrbiter {
  object: THREE.Object3D;
  radius: number;
  height: number;
  speed: number;
  phase: number;
  tilt: number;
  spin: number;
}

/** 待機・戦闘モーションの味付け。役割ごとに動きの質感を変える */
export interface AnimProfile {
  /** 待機モーション全体の速さ */
  idleSpeed: number;
  /** 呼吸の深さ */
  breath: number;
  /** 上下動の幅 */
  bob: number;
  /** 頭の揺れ幅 */
  headSway: number;
  /** 尾のうねり幅 */
  tailWave: number;
  /** 羽ばたきの幅 */
  wingFlap: number;
  /** 待機時の体重移動 */
  sway: number;
  /** 攻撃時に踏み込む距離 */
  lunge: number;
  /**
   * 全身の潰れ・伸び。0で無効。
   * 骨を持たない粘体(スライム)は、関節ではなく体積の変形でしか
   * 生きているように見えないため、体全体をY方向に伸縮させる。
   */
  squash: number;
  /** 攻撃モーションの型 */
  attack: "lunge" | "slam" | "cast" | "dash" | "pounce";
}

export const DEFAULT_ANIM: AnimProfile = {
  idleSpeed: 1,
  breath: 1,
  bob: 0.035,
  headSway: 1,
  tailWave: 1,
  wingFlap: 0,
  sway: 1,
  lunge: 1.1,
  squash: 0,
  attack: "lunge",
};

/**
 * 1体分の骨格。役割別ビルダーがここに部位を登録し、
 * MonsterAvatarはこの構造だけを見てアニメーションを付ける。
 */
export class CreatureRig {
  /** 足元が原点。MonsterAvatar側で配置される */
  readonly root = new THREE.Group();
  /** 体高を正規化するためのスケール用グループ */
  readonly scaler = new THREE.Group();
  /** 全身の移動(上下動・踏み込み・撃破時の崩れ) */
  readonly core = new THREE.Group();
  /** 腰。ここから上が胴、下が脚 */
  readonly pelvis = new THREE.Group();
  /** 胴。呼吸と前後の傾き */
  readonly torso = new THREE.Group();
  /** 首。頭を振る軸 */
  readonly neck = new THREE.Group();
  /** 頭 */
  readonly head = new THREE.Group();
  /** 顎(咆哮・攻撃で開く)。無い場合はnull */
  jaw: THREE.Group | null = null;

  readonly arms: RigLimb[] = [];
  readonly legs: RigLimb[] = [];
  readonly wings: RigLimb[] = [];
  readonly tail: RigJoint[] = [];
  readonly cloth: RigCloth[] = [];
  readonly spinners: RigSpinner[] = [];
  readonly orbiters: RigOrbiter[] = [];

  torsoRest = new THREE.Euler();
  neckRest = new THREE.Euler();
  headRest = new THREE.Euler();
  jawRest = new THREE.Euler();

  /** 足を持たず宙に浮くタイプ */
  floats = false;
  /**
   * 立ち姿の追加ヨー。四足のように前後に長い骨格は、正面から見ると
   * 潰れて読めなくなるため、役割ごとに斜に構える角度を変える。
   */
  yawBias = 0;
  /**
   * 翼を生やす位置(種別固有の造形が参照する)。
   * 骨格によって背中の高さが違うため、役割ビルダー側から指定する。
   */
  wingAnchor = new THREE.Vector3(0.3, 0.62, 0.18);
  /** 正規化後の体高 */
  height = 2.4;
  anim: AnimProfile = { ...DEFAULT_ANIM };

  constructor() {
    this.root.add(this.scaler);
    this.scaler.add(this.core);
    this.core.add(this.pelvis);
    this.pelvis.add(this.torso);
    this.torso.add(this.neck);
    this.neck.add(this.head);
    markAnimated(this.torso, this.neck, this.head);
  }

  /** 姿勢の基準値を、現在の rotation から確定させる */
  captureRests(): void {
    this.torsoRest = this.torso.rotation.clone();
    this.neckRest = this.neck.rotation.clone();
    this.headRest = this.head.rotation.clone();
    if (this.jaw) this.jawRest = this.jaw.rotation.clone();
  }
}

/** このグループより下はマージ対象から外す(=動く部位である)ことを示す */
export function markAnimated(...objects: THREE.Object3D[]): void {
  for (const object of objects) object.userData.animated = true;
}

/** メッシュの位置と姿勢をまとめて指定する短縮形 */
export function place<T extends THREE.Object3D>(
  object: T,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
): T {
  object.position.set(x, y, z);
  object.rotation.set(rx, ry, rz);
  return object;
}

/** -Z(正面)方向へ棘を向けるための回転 */
export const AIM_FORWARD = -Math.PI / 2;
/** +Z(背面)方向へ棘を向けるための回転 */
export const AIM_BACK = Math.PI / 2;
/** 真下へ向けるための回転 */
export const AIM_DOWN = Math.PI;

interface Collected {
  mesh: THREE.Mesh;
  matrix: THREE.Matrix4;
}

function collect(container: THREE.Object3D, matrix: THREE.Matrix4, out: Collected[]): void {
  for (const child of container.children) {
    if (child.userData.animated) continue;
    child.updateMatrix();
    const next = matrix.clone().multiply(child.matrix);
    if ((child as THREE.Mesh).isMesh) out.push({ mesh: child as THREE.Mesh, matrix: next });
    else collect(child, next, out);
  }
}

/**
 * 動かない部位を材質ごとに1メッシュへ統合する。
 * プロシージャル生成は部品点数が増えやすく、そのままではドローコールが
 * 数百に達してモバイルで破綻するため、剛体としてまとまる範囲だけ焼き込む。
 */
function mergeContainer(container: THREE.Object3D, kit: CreatureKit): void {
  const collected: Collected[] = [];
  collect(container, new THREE.Matrix4(), collected);
  if (collected.length < 2) return;

  const buckets = new Map<THREE.Material, Collected[]>();
  for (const item of collected) {
    const material = item.mesh.material as THREE.Material;
    const bucket = buckets.get(material);
    if (bucket) bucket.push(item);
    else buckets.set(material, [item]);
  }

  for (const [material, items] of buckets) {
    if (items.length < 2) continue;
    const geometries: THREE.BufferGeometry[] = [];
    for (const item of items) {
      const cloned = item.mesh.geometry.clone().applyMatrix4(item.matrix);
      const flat = cloned.index ? cloned.toNonIndexed() : cloned;
      if (flat !== cloned) cloned.dispose();
      // マージの邪魔になる属性は落とす(位置・法線・UVだけあればよい)
      for (const name of Object.keys(flat.attributes)) {
        if (name !== "position" && name !== "normal" && name !== "uv") flat.deleteAttribute(name);
      }
      geometries.push(flat);
    }
    const merged = mergeGeometries(geometries, false);
    for (const geometry of geometries) geometry.dispose();
    if (!merged) continue;

    const mesh = new THREE.Mesh(kit.adopt(merged), material);
    mesh.castShadow = items[0].mesh.castShadow;
    for (const item of items) item.mesh.removeFromParent();
    container.add(mesh);
  }
}

function mergeRecursive(object: THREE.Object3D, kit: CreatureKit): void {
  const children = [...object.children];
  mergeContainer(object, kit);
  for (const child of children) {
    if (child.userData.animated) mergeRecursive(child, kit);
    else if (!(child as THREE.Mesh).isMesh) mergeRecursive(child, kit);
  }
}

/**
 * 体高を目標値へ正規化し、足(または浮遊の下端)が地面に合うよう配置する。
 * 役割別ビルダーは実寸を気にせず「形の比率」だけを設計すればよくなる。
 */
export function finalizeRig(rig: CreatureRig, kit: CreatureKit, targetHeight: number, floatGap = 0): void {
  rig.captureRests();
  // 回り続ける環や、周囲を漂う破片は毎フレーム動かす。
  // マージで焼き込まれると、参照だけ残って画面から消えてしまう
  for (const spinner of rig.spinners) markAnimated(spinner.object);
  for (const orbiter of rig.orbiters) markAnimated(orbiter.object);
  mergeRecursive(rig.core, kit);

  rig.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(rig.core);
  const rawHeight = Math.max(0.001, box.max.y - box.min.y);
  const scale = targetHeight / rawHeight;

  rig.scaler.scale.setScalar(scale);
  rig.scaler.position.y = floatGap - box.min.y * scale;
  rig.height = targetHeight + floatGap;
}
