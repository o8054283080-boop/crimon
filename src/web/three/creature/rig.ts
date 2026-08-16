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
  attack: "lunge" | "slam" | "cast" | "dash" | "pounce" | "breath" | "swipe" | "bless";
  /**
   * 待機中にごくたまに出る仕草。
   *
   * 待機モーションを正弦波の重ね合わせだけで作ると、周期が読めてしまい
   * 「動いているが生きてはいない」見え方になる。数秒に一度、周期と無関係な
   * 短い動作を挟むと、同じ骨格でも急に生き物として読めるようになる。
   * 種別の性格を一番安く出せる場所でもあるので、造形と揃えて選ぶこと。
   */
  accent: "none" | "headShake" | "wingRuffle" | "tailFlick" | "stomp" | "shiver" | "roar" | "gaze";
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
  accent: "none",
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
  /** finalizeRig が組む骨組み。剛体へ落ちた場合はnull */
  skeleton: THREE.Skeleton | null = null;
  /** 骨で変形する本体メッシュ(材質ごとに1本) */
  skinnedMeshes: THREE.SkinnedMesh[] = [];
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

/** 1つの骨と、それが対応する「動く部位」のグループ */
interface BoneEntry {
  container: THREE.Object3D;
  bone: THREE.Bone;
  parentIndex: number;
}

/**
 * 「動く部位」のグループ1つにつき骨を1本、そのグループの子として置く。
 *
 * 骨をグループの子(変換なし)にしておくと、骨のワールド行列はグループの
 * ワールド行列と常に一致する。アニメーション側は今までどおりグループの
 * rotation を動かすだけでよく、13体分のビルダーもモーションのコードも
 * 一切書き換えずにスキニングへ移行できる。
 */
function collectBones(container: THREE.Object3D, ownerIndex: number, entries: BoneEntry[]): void {
  for (const child of container.children) {
    if (child.userData.rigBone) continue;
    // 回る環や漂う破片(それ自身がメッシュで動くもの)は骨にせず、剛体のまま残す
    if ((child as THREE.Mesh).isMesh) continue;
    if (child.userData.animated) {
      const bone = new THREE.Bone();
      bone.userData.rigBone = true;
      child.add(bone);
      const index = entries.length;
      entries.push({ container: child, bone, parentIndex: ownerIndex });
      collectBones(child, index, entries);
    } else {
      // 静止グループは骨を増やさず素通りする(座標は親の骨に含まれている)
      collectBones(child, ownerIndex, entries);
    }
  }
}

interface SkinPiece {
  mesh: THREE.Mesh;
  boneIndex: number;
}

/** 骨に属するメッシュを集める。それ自身が動くメッシュ(装飾)は対象外 */
function collectSkinPieces(container: THREE.Object3D, ownerIndex: number, out: SkinPiece[], entries: BoneEntry[]): void {
  for (const child of container.children) {
    if (child.userData.rigBone) continue;
    if ((child as THREE.Mesh).isMesh) {
      if (!child.userData.animated) out.push({ mesh: child as THREE.Mesh, boneIndex: ownerIndex });
      continue;
    }
    if (child.userData.animated) {
      const index = entries.findIndex((entry) => entry.container === child);
      if (index >= 0) collectSkinPieces(child, index, out, entries);
    } else {
      collectSkinPieces(child, ownerIndex, out, entries);
    }
  }
}

/** 親の骨へ重みを分け始める距離。関節の付け根からこの範囲だけが溶ける */
const SKIN_BLEND_RATIO = 0.45;
/** 親の骨へ渡せる重みの上限。0.5を超えると部位が親に引きずられて形が崩れる */
const SKIN_MAX_PARENT_WEIGHT = 0.5;

/**
 * 剛体の階層から、そのままスキン付きの1メッシュを組む。
 *
 * 部位ごとに別メッシュのままだと、関節を曲げたときに必ず継ぎ目が出る。
 * かといって13体分の骨格を手で塗り直すのは現実的ではないので、
 * 「その部位の骨に重み1」を基本にしつつ、**関節の付け根に近い頂点だけ**
 * 親の骨と重みを分け合わせる。継ぎ目が出るのは付け根なので、そこだけ溶かせばよい。
 */
function buildSkinnedBody(rig: CreatureRig, kit: CreatureKit): boolean {
  const entries: BoneEntry[] = [];
  const rootBone = new THREE.Bone();
  rootBone.userData.rigBone = true;
  rig.core.add(rootBone);
  entries.push({ container: rig.core, bone: rootBone, parentIndex: 0 });
  collectBones(rig.core, 0, entries);
  if (entries.length < 2) return false;

  const pieces: SkinPiece[] = [];
  collectSkinPieces(rig.core, 0, pieces, entries);
  if (pieces.length === 0) return false;


  rig.root.updateMatrixWorld(true);
  const coreInverse = rig.core.matrixWorld.clone().invert();

  // 各骨の付け根(関節の位置)を、rig.core から見た座標で持っておく
  const pivots = entries.map((entry) => new THREE.Vector3().setFromMatrixPosition(entry.container.matrixWorld).applyMatrix4(coreInverse));

  // 骨ごとに「付け根からいちばん遠い頂点までの距離」を測り、溶かす範囲の基準にする。
  // 部位の大きさは体の場所によって桁が違うので、固定値では小さい部位が全部溶ける
  const reach = new Array<number>(entries.length).fill(0);
  const localGeometries = pieces.map(({ mesh, boneIndex }) => {
    const matrix = coreInverse.clone().multiply(mesh.matrixWorld);
    const cloned = mesh.geometry.clone().applyMatrix4(matrix);
    const flat = cloned.index ? cloned.toNonIndexed() : cloned;
    if (flat !== cloned) cloned.dispose();
    for (const name of Object.keys(flat.attributes)) {
      if (name !== "position" && name !== "normal" && name !== "uv") flat.deleteAttribute(name);
    }
    const position = flat.attributes.position as THREE.BufferAttribute;
    const pivot = pivots[boneIndex];
    const vertex = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      const distance = vertex.fromBufferAttribute(position, i).distanceTo(pivot);
      if (distance > reach[boneIndex]) reach[boneIndex] = distance;
    }
    return flat;
  });

  // 重みを載せる
  localGeometries.forEach((geometry, index) => {
    const boneIndex = pieces[index].boneIndex;
    const parentIndex = entries[boneIndex].parentIndex;
    const pivot = pivots[boneIndex];
    const blend = Math.max(1e-4, reach[boneIndex] * SKIN_BLEND_RATIO);
    const position = geometry.attributes.position as THREE.BufferAttribute;
    const skinIndex = new Uint16Array(position.count * 4);
    const skinWeight = new Float32Array(position.count * 4);
    const vertex = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      let parentWeight = 0;
      if (parentIndex !== boneIndex) {
        const distance = vertex.fromBufferAttribute(position, i).distanceTo(pivot);
        const near = Math.max(0, 1 - distance / blend);
        parentWeight = SKIN_MAX_PARENT_WEIGHT * near * near;
      }
      skinIndex[i * 4] = boneIndex;
      skinIndex[i * 4 + 1] = parentIndex;
      skinWeight[i * 4] = 1 - parentWeight;
      skinWeight[i * 4 + 1] = parentWeight;
    }
    geometry.setAttribute("skinIndex", new THREE.BufferAttribute(skinIndex, 4));
    geometry.setAttribute("skinWeight", new THREE.BufferAttribute(skinWeight, 4));
  });

  // 材質ごとに1本のスキンメッシュへまとめる
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  localGeometries.forEach((geometry, index) => {
    const material = pieces[index].mesh.material as THREE.Material;
    const bucket = buckets.get(material);
    if (bucket) bucket.push(geometry);
    else buckets.set(material, [geometry]);
  });

  const skeleton = new THREE.Skeleton(entries.map((entry) => entry.bone));
  for (const piece of pieces) piece.mesh.removeFromParent();

  const skinned: THREE.SkinnedMesh[] = [];
  for (const [material, geometries] of buckets) {
    const merged = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false);
    if (geometries.length > 1) for (const geometry of geometries) geometry.dispose();
    if (!merged) continue;
    const mesh = new THREE.SkinnedMesh(kit.adopt(merged), material);
    mesh.castShadow = true;
    // 骨は rig.core の下にぶら下がっているので、姿勢の二重掛けを避けるために
    // スキンメッシュ自身は変換を持たせずそのまま core へ置く
    mesh.frustumCulled = false;
    rig.core.add(mesh);
    // 束ねるのはこの後の正規化を挟んでからだが、束ねていないスキンメッシュに
    // 外から触れる(体高を測るなど)と skeleton が未定義で落ちる。
    // ここでいったん束ねておき、正規化後に束ね直す
    mesh.updateMatrixWorld(true);
    mesh.bind(skeleton, mesh.matrixWorld.clone());
    skinned.push(mesh);
  }
  if (skinned.length === 0) return false;

  rig.skeleton = skeleton;
  rig.skinnedMeshes = skinned;
  return true;
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

  // 骨で滑らかに曲げられる形へ組み替える。骨が立たない構成(部位が1つしかない等)
  // だけは、従来どおり材質ごとに焼き込んだ剛体へ落とす
  const skinnedOk = buildSkinnedBody(rig, kit);
  if (!skinnedOk) mergeRecursive(rig.core, kit);

  rig.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(rig.core);
  const rawHeight = Math.max(0.001, box.max.y - box.min.y);
  const scale = targetHeight / rawHeight;

  rig.scaler.scale.setScalar(scale);
  rig.scaler.position.y = floatGap - box.min.y * scale;
  rig.height = targetHeight + floatGap;

  // bindMatrix と骨の逆行列は「束ねた時点の姿勢」を焼き込むので、
  // 体高の正規化(scaler)まで済ませてから束ね直す。
  // 正規化前の姿勢のままだと、拡大率のぶんだけ変形がずれる
  if (rig.skeleton) {
    rig.root.updateMatrixWorld(true);
    rig.skeleton.calculateInverses();
    for (const mesh of rig.skinnedMeshes) mesh.bind(rig.skeleton, mesh.matrixWorld.clone());
  }
}
