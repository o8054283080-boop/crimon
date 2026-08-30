import * as THREE from "three";
import { MonsterDefinition } from "../../core/monster.js";
import { MonsterAvatar } from "./monsterAvatar.js";
import { ELEMENT_TINT, NO_TINT_TEMPLATES, SPRITE_TINT, TINT_MASK, bodyHueFor, isElementSpecific, spriteUrlFor, tintThresholdsFor } from "./spriteArt.js";
import { Element } from "../../core/element.js";

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
/**
 * 収める範囲の余白。1.0でぴったり、大きいほど周囲に余白ができる。
 *
 * 顔に寄せる構図も試したが、カードの表示は90px角ほどしかなく、
 * 寄せると胴だけが写って何のモンスターか分からなくなった。
 * この寸法では全身のシルエットの方が見分けが付く。
 */
const PORTRAIT_MARGIN = 1.08;
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
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    // 画像は正方形なので、縦横のうち大きい方が収まれば全体が入る。
    // 翼を広げた種別は横に長いので、高さだけで決めると必ず切れる
    const spread = Math.max(size.x, size.z);
    const framed = Math.max(size.y, spread) * PORTRAIT_MARGIN;

    const camera = new THREE.PerspectiveCamera(PORTRAIT_FOV, 1, 0.1, 100);
    // 手前側の厚みのぶんだけ余分に引く。引かないと手前の翼や角が枠を割る
    const distance = framed / 2 / Math.tan(THREE.MathUtils.degToRad(PORTRAIT_FOV / 2)) + spread * 0.5;
    // 骨格の正面は -Z。斜め前・やや上から覗き込む位置へ置く
    const flat = Math.cos(PORTRAIT_PITCH) * distance;
    camera.position.set(
      center.x + Math.sin(PORTRAIT_YAW) * flat,
      center.y + Math.sin(PORTRAIT_PITCH) * distance,
      center.z - Math.cos(PORTRAIT_YAW) * flat,
    );
    camera.lookAt(center.x, center.y, center.z);

    gl.render(scene, camera);
    return gl.domElement.toDataURL("image/png");
  } catch {
    return null;
  } finally {
    scene.remove(avatar.root);
    avatar.dispose();
  }
}

/** なめらかな段差。GLSLの smoothstep と同じ */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** HSV → RGB。戦闘画面のシェーダ(spriteAvatar.ts)と同じ変換 */
function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: return [v, t, p];
    case 1: return [q, v, p];
    case 2: return [p, v, t];
    case 3: return [p, q, v];
    case 4: return [t, p, v];
    default: return [v, p, q];
  }
}

/**
 * 基本の絵を属性色へ寄せる。
 *
 * 式は戦闘画面のシェーダ(spriteAvatar.ts)と同じ。
 * **混ぜるのではなく色相を差し替える。** 明暗と艶が残ったまま色だけ動く。
 * 単純に色を混ぜると、濃い色の絵は変わらないか、量を上げると平たくなる。
 */
async function tintSprite(url: string, templateId: string, element: Element): Promise<string | null> {
  try {
    const image = new Image();
    image.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("読めない"));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0);
    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { data } = frame;
    const tint = ELEMENT_TINT[element];
    const bodyHue = bodyHueFor(templateId, element);
    // 淡い絵は境目が下がる。戦闘画面(spriteAvatar.ts)と同じ関数から取る
    const th = tintThresholdsFor(templateId, element);

    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      const r = data[i] / 255;
      const g = data[i + 1] / 255;
      const b = data[i + 2] / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const delta = max - min;
      const sat = max === 0 ? 0 : delta / max;

      // 染める量。戦闘画面のシェーダと同じ4条件
      let mask = smoothstep(th.satLow, th.satHigh, sat);
      mask *= smoothstep(TINT_MASK.valLow, TINT_MASK.valHigh, max);
      mask *= 1 - smoothstep(th.hiLow, TINT_MASK.hiHigh, max) * (1 - sat);
      if (bodyHue >= 0 && delta > 1e-6) {
        let hue: number;
        if (max === r) hue = (((g - b) / delta) % 6 + 6) % 6;
        else if (max === g) hue = (b - r) / delta + 2;
        else hue = (r - g) / delta + 4;
        hue /= 6;
        let d = Math.abs(hue - bodyHue);
        d = Math.min(d, 1 - d);
        mask *= 1 - smoothstep(TINT_MASK.hueNear, TINT_MASK.hueFar, d);
      }
      const amount = SPRITE_TINT * mask;
      if (amount < 0.002) continue;

      const [nr, ng, nb] = hsvToRgb(
        tint.hue,
        Math.min(1, sat * tint.sat),
        Math.min(1, Math.max(0, max * tint.valueMul + tint.valueAdd)),
      );
      data[i] += (nr * 255 - data[i]) * amount;
      data[i + 1] += (ng * 255 - data[i + 1]) * amount;
      data[i + 2] += (nb * 255 - data[i + 2]) * amount;
    }
    ctx.putImageData(frame, 0, 0);
    return canvas.toDataURL("image/webp", 0.9);
  } catch {
    return null;
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

  /*
   * 2Dの絵がある種族は、それをそのまま使う。
   *
   * **カードも図鑑もホームのロビーも、ここから絵をもらっている。**
   * 3Dから焼いていた頃は、カード1枚ごとにWebGLで1体組み立てて撮っていた。
   * 2Dの絵があるなら焼く必要がない。戦闘で見る姿とカードの姿も、
   * 同じ1枚なので確実に一致する。
   */
  const sprite = spriteUrlFor(def.templateId, def.element);
  if (sprite) {
    if (isElementSpecific(def.templateId, def.element) || NO_TINT_TEMPLATES.has(def.templateId)) {
      // その属性のために描かれた絵か、属性を持たない種族(転生ピッグ)。
      // どちらも色替えは掛けない
      cache.set(key, sprite);
      return Promise.resolve(sprite);
    }
    // 基本の絵は全属性で共有しているので、属性色へ寄せてから使う。
    // **寄せないと「スライム[火]」が青いまま並ぶ。**
    // 戦闘画面のシェーダ(spriteAvatar.ts)と同じ式にしてあり、
    // カードで見た色と戦闘で見た色が食い違わない
    const task = tintSprite(sprite, def.templateId, def.element).then((url) => {
      pending.delete(key);
      const result = url ?? sprite;
      cache.set(key, result);
      return result;
    });
    pending.set(key, task);
    return task;
  }

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
/**
 * 肖像を敷く要素の性格。
 *
 * "box"  … その要素自体が寸法を持っている(96pxの丸など)。背景を敷くだけでよい
 * "fill" … 寸法が絵文字の字面で決まっている。文字を消すと0×0に潰れるので、
 *          親いっぱいへ広げてやる必要がある
 */
export type PortraitFit = "box" | "fill";

export function withPortrait<T extends HTMLElement>(
  target: T,
  def: MonsterDefinition | undefined,
  fit: PortraitFit = "box",
): T {
  applyPortrait(target, def, fit);
  return target;
}

export function applyPortrait(target: HTMLElement, def: MonsterDefinition | undefined, fit: PortraitFit = "box"): void {
  if (!def) return;
  void requestPortrait(def).then((url) => {
    if (!url || !target.isConnected) return;

    if (fit === "fill") {
      // 絵文字を消した瞬間に潰れるので、先に親いっぱいへ広げてから消す。
      // 親に位置指定が無いと inset が効かないので、その場合だけ基準にする
      const parent = target.parentElement;
      if (parent && getComputedStyle(parent).position === "static") parent.style.position = "relative";
      target.style.position = "absolute";
      target.style.inset = "0";
      // 中央寄せに translate を使っている要素があるので打ち消す
      target.style.transform = "none";
    }

    target.style.backgroundImage = `url(${url})`;
    target.style.backgroundSize = "contain";
    target.style.backgroundPosition = "center";
    target.style.backgroundRepeat = "no-repeat";
    // 肖像が乗ったら絵文字は不要
    target.textContent = "";
  });
}
