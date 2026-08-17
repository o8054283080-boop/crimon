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

/**
 * どこにも登録されていない可動グループ(耳・鰭・浮遊する刃など)。
 *
 * 役割・種別のビルダーが `markAnimated` しただけで rig のどの配列にも
 * 入れていない部位は、今まで一度も動かされていなかった。
 * これらは能動的に動かす必要はないが、**本体の動きに遅れて追従する**だけで
 * 「垂れている物が付いている」ことが伝わるので、finalizeRig が自動で拾って
 * 二次的な動きの対象にする。
 */
export interface RigFollower {
  group: THREE.Object3D;
  rest: THREE.Euler;
  /** 揺れ幅の倍率。体高に対して長い部位ほど大きく振る */
  amount: number;
  /** 揺れの位相。左右の耳が同じ瞬間に同じ角度で揺れると作り物に見える */
  phase: number;
  /**
   * 体の中心から見て外向きの符号(+1が右、-1が左)。
   * 左右対の部位を同じ向きに振ると、片側だけ体にめり込む。
   */
  side: number;
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
   * 体感重量。0が羽のように軽い、1が岩の塊。
   *
   * ビルダー側では指定せず、`finalizeRig` が待機の速さ・上下動の幅・体高・
   * 浮遊の有無から自動で導く(`deriveMass`)。これ1本で、加速の鈍さ・
   * 予備動作の長さ・二次的な動きの周期と減衰・着地の沈み込みが一斉に変わる。
   * ゴーレムと妖精が同じ速さの波で動いていた問題は、ここを起点に潰す。
   */
  mass?: number;
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
  /** finalizeRig が自動で拾う「受動的に揺れるだけ」の部位 */
  readonly followers: RigFollower[] = [];

  pelvisRest = new THREE.Euler();
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
    // 腰も骨にする。骨を持たないと、腰を捻っても腰まわりの造形だけが
    // 取り残されて胴と脚だけがずれる(重みは親の骨に焼かれているため)。
    // 骨にしておけば、体重移動で腰を捻る「立ち方」が作れる
    markAnimated(this.pelvis, this.torso, this.neck, this.head);
  }

  /** 姿勢の基準値を、現在の rotation から確定させる */
  captureRests(): void {
    this.pelvisRest = this.pelvis.rotation.clone();
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

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * 待機の速さ・上下動の幅・体高・浮遊の有無から体感重量を導く。
 *
 * ビルダーが個別に重さを申告する作りにすると、13体分の値を揃える手間が
 * 増えるうえ、造形を変えた時に更新が漏れる。「ゆっくり動く」「上下に跳ねない」
 * 「背が高い」は重さの結果として現れる特徴なので、そこから逆算する。
 */
function deriveMass(rig: CreatureRig): number {
  const anim = rig.anim;
  const slow = clamp01((1.55 - anim.idleSpeed) / 1.05);
  const grounded = clamp01((0.075 - anim.bob) / 0.06);
  const big = clamp01((rig.height - 1.9) / 1.5);
  const mass = slow * 0.45 + grounded * 0.25 + big * 0.3;
  // 浮いているものは、どれだけ大きくても軽く漂う
  return clamp01(rig.floats ? mass * 0.45 : mass);
}

/**
 * どの配列にも登録されていない可動グループを拾って、受動的に揺れる部位にする。
 * 対象は「子を持つグループ」だけ。メッシュそのものが動く装飾(環・破片)は
 * 別経路で動かしているので触らない。
 */
function collectFollowers(rig: CreatureRig): void {
  // 部位の長さは「体高に対する比率」で測る。ビルダーは実寸ではなく比率で
  // 設計しているので、固定値のしきい値では骨格ごとに拾える物が変わってしまう
  const body = new THREE.Box3().setFromObject(rig.core);
  const refHeight = Math.max(0.001, body.max.y - body.min.y);
  const claimed = new Set<THREE.Object3D>([rig.core, rig.pelvis, rig.torso, rig.neck, rig.head]);
  // 手足の中に見つかる可動部は、末端の節(足首・指の付け根)。
  // ここを大きく振ると接地が壊れるので、揺れ幅を強く絞る
  const limbParts = new Set<THREE.Object3D>();
  if (rig.jaw) claimed.add(rig.jaw);
  for (const limb of [...rig.arms, ...rig.legs, ...rig.wings]) {
    for (const part of [limb.root, limb.lower, limb.tip]) {
      if (!part) continue;
      claimed.add(part);
      limbParts.add(part);
    }
  }
  for (const joint of rig.tail) claimed.add(joint.group);
  for (const cloth of rig.cloth) claimed.add(cloth.group);
  for (const spinner of rig.spinners) claimed.add(spinner.object);
  for (const orbiter of rig.orbiters) claimed.add(orbiter.object);

  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  const walk = (container: THREE.Object3D, inLimb: boolean): void => {
    for (const child of container.children) {
      if ((child as THREE.Mesh).isMesh) continue;
      if (child.userData.animated && !claimed.has(child)) {
        // 長い部位ほど大きく振れる。付け根の球ひとつのような小物は揺らさない
        box.setFromObject(child);
        box.getSize(size);
        box.getCenter(center);
        const span = Math.max(size.x, size.y, size.z) / Math.max(0.001, refHeight);
        if (span > 0.05) {
          const amount = Math.min(1.6, span * 6) * (inLimb ? 0.3 : 1);
          // 左右どちら側に付いているかで振る向きを分ける。中央のものは右扱い
          const side = center.x < -0.001 ? -1 : 1;
          // 位相は取り付け位置から決める。乱数にすると同じ骨格でも
          // 生成のたびに揺れ方が変わり、直した結果を比べられなくなる
          const phase = (center.x * 3.1 + center.y * 2.3 + center.z * 1.7) % (Math.PI * 2);
          rig.followers.push({ group: child, rest: child.rotation.clone(), amount, phase, side });
        }
      }
      walk(child, inLimb || limbParts.has(child));
    }
  };
  walk(rig.core, false);
}

/**
 * 体高を目標値へ正規化し、足(または浮遊の下端)が地面に合うよう配置する。
 * 役割別ビルダーは実寸を気にせず「形の比率」だけを設計すればよくなる。
 */
export function finalizeRig(rig: CreatureRig, kit: CreatureKit, targetHeight: number, floatGap = 0): void {
  rig.captureRests();
  // 登録漏れの可動部を、揺れるだけの部位として拾う。
  // ここは骨組みを立てる前(=剛体階層のまま)でないと、部位ごとの寸法が測れない
  collectFollowers(rig);
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

  // 体高が決まってから重さを導く(背の高さも重さの手がかりに使うため)
  if (rig.anim.mass === undefined) rig.anim.mass = deriveMass(rig);
}
