import * as THREE from "three";
import { MonsterDefinition } from "../../core/monster.js";
import { MonsterAvatar } from "./monsterAvatar.js";

/**
 * モンスターの肖像(アイコン)を、バトル画面と同じ3Dモデルから焼く。
 *
 * アイコンだけ絵文字のままだと、戦闘で見た姿と図鑑・編成で見る姿が
 * 別物になってしまい、育てている実感が切れる。バトル用のアバターを
 * そのまま流用して小さな画像にし、UI側は背景画像として貼るだけにする。
 *
 * 設計上の要点は3つ。
 *   1. WebGLの文脈は1つだけ作って使い回す(モンスターごとに作ると即座に上限へ達する)
 *   2. 描いた結果は種別+属性で覚えておく(最大13×6=78通り)
 *   3. 生成は非同期。カードを組むたびに同期で3D描画すると画面が止まるので、
 *      1フレームに1体ずつ焼き、出来るまでは絵文字を出しておく
 */

/** 焼き込む画像の一辺(画素)。等倍表示は小さいので、拡大に耐える程度に取る */
const PORTRAIT_SIZE = 192;
/** 肖像の画角。寄りの構図にするため、バトル画面より狭くしている */
const PORTRAIT_FOV = 26;
/** 体高のうち画面に収める割合。1で全身、小さくするほど顔に寄る */
const PORTRAIT_COVERAGE = 0.62;
/** 見る角度。真正面だと厚みが出ないので斜め前から見る */
const PORTRAIT_YAW = 0.62;
const PORTRAIT_PITCH = 0.16;

type PortraitKey = string;

const cache = new Map<PortraitKey, string>();
const pending = new Map<PortraitKey, Promise<string | null>>();
/** WebGLが使えない環境だと分かったら、以後は試さず絵文字のままにする */
let unavailable = false;

let renderer: THREE.WebGLRenderer | null = null;

function keyOf(def: MonsterDefinition): PortraitKey {
  return `${def.templateId}:${def.element}`;
}

function getRenderer(): THREE.WebGLRenderer | null {
  if (unavailable) return null;
  if (renderer) return renderer;
  try {
    const created = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    created.setPixelRatio(1);
    created.setSize(PORTRAIT_SIZE, PORTRAIT_SIZE, false);
    // バトル画面と同じ調子で焼く。ここがずれると、戦闘で見た色と別物になる
    created.toneMapping = THREE.ACESFilmicToneMapping;
    created.toneMappingExposure = 0.92;
    created.outputColorSpace = THREE.SRGBColorSpace;
    created.setClearAlpha(0);
    renderer = created;
    return created;
  } catch {
    unavailable = true;
    return null;
  }
}

/** 1体を焼いて、画像のデータURLを返す */
function bake(def: MonsterDefinition): string | null {
  const gl = getRenderer();
  if (!gl) return null;

  const scene = new THREE.Scene();
  const avatar = new MonsterAvatar({
    element: def.element,
    role: def.role,
    templateId: def.templateId,
    facing: 1,
  });
  // バトル中は敵の方(-Z)を向いているが、肖像では顔を見せたいので正面へ据える
  avatar.root.rotation.y = 0;
  scene.add(avatar.root);
  // 待機モーションを1回だけ進めて、素立ちの姿勢を確定させる
  avatar.update(0.016, 0);
  scene.updateMatrixWorld(true);

  try {
    const box = new THREE.Box3().setFromObject(avatar.root);
    const height = Math.max(0.001, box.max.y - box.min.y);
    const center = box.getCenter(new THREE.Vector3());
    // 顔まわりへ寄せる。全身の中心だと胴ばかりが写る
    const focusY = box.min.y + height * 0.74;
    const radius = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * 0.5;

    const camera = new THREE.PerspectiveCamera(PORTRAIT_FOV, 1, 0.1, 100);
    const framed = height * PORTRAIT_COVERAGE;
    const distance = framed / 2 / Math.tan(THREE.MathUtils.degToRad(PORTRAIT_FOV / 2)) + radius + 0.2;
    // 骨格の正面は -Z。斜め前・やや上から覗き込む位置へ置く
    const flat = Math.cos(PORTRAIT_PITCH) * distance;
    camera.position.set(
      center.x + Math.sin(PORTRAIT_YAW) * flat,
      focusY + Math.sin(PORTRAIT_PITCH) * distance,
      center.z - Math.cos(PORTRAIT_YAW) * flat,
    );
    camera.lookAt(center.x, focusY, center.z);

    gl.render(scene, camera);
    return gl.domElement.toDataURL("image/png");
  } catch {
    return null;
  } finally {
    scene.remove(avatar.root);
    avatar.dispose();
  }
}

/** 次のフレームまで待つ。焼く処理を1フレーム1体に散らして、操作を止めないため */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 16);
  });
}

/** 肖像を作る(または既に作ってあればそれを返す) */
export function requestPortrait(def: MonsterDefinition): Promise<string | null> {
  const key = keyOf(def);
  const done = cache.get(key);
  if (done) return Promise.resolve(done);
  const running = pending.get(key);
  if (running) return running;

  const task = nextFrame().then(() => {
    const url = bake(def);
    pending.delete(key);
    if (url) cache.set(key, url);
    return url;
  });
  pending.set(key, task);
  return task;
}

/**
 * 絵文字を表示している要素に、焼き上がった肖像を背景として敷く。
 *
 * 要素を差し替えるのではなく背景にするのは、既存の寸法・配置の指定が
 * そのまま効くようにするため。焼き上がるまでは絵文字が見えており、
 * WebGLが使えない環境では絵文字のまま変わらない。
 */
export function withPortrait<T extends HTMLElement>(target: T, def: MonsterDefinition | undefined): T {
  applyPortrait(target, def);
  return target;
}

export function applyPortrait(target: HTMLElement, def: MonsterDefinition | undefined): void {
  if (!def) return;
  void requestPortrait(def).then((url) => {
    if (!url || !target.isConnected) return;
    target.style.backgroundImage = `url(${url})`;
    target.style.backgroundSize = "contain";
    target.style.backgroundPosition = "center";
    target.style.backgroundRepeat = "no-repeat";
    // 肖像が乗ったら絵文字は不要。文字色を消すのではなく中身ごと空にする
    target.textContent = "";
  });
}
