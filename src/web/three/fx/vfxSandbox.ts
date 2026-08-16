import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ELEMENT_THEME } from "../elementTheme.js";
import { StatusAuraKind } from "./statusAuras.js";
import { VfxElement, VfxSystem } from "../vfx.js";

/**
 * エフェクト確認用のサンドボックス。
 *
 * バトルの進行に依存せず、全エフェクトを格子状に並べて同時に発火させる。
 * `freezeAt` を指定すると固定ステップで指定秒数だけ進めてから止めるため、
 * スクリーンショットで毎回まったく同じ瞬間を撮れる。
 */

export type SandboxSet = "elements" | "impact" | "status" | "support" | "projectile" | "crit";

interface Pad {
  label: string;
  color: THREE.Color;
  /** t=0 で1回だけ呼ばれる */
  fire: (vfx: VfxSystem, anchor: THREE.Vector3, ground: THREE.Vector3, id: string) => void;
  /** 繰り返し発火する場合の間隔(秒)。省略時は1回のみ */
  repeatSec?: number;
  /** ダミーの的を置くか */
  dummy?: boolean;
}

const ANCHOR_HEIGHT = 1.15;

function labelTexture(text: string): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "rgba(0,0,0,0)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = "bold 64px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const ELEMENTS: VfxElement[] = ["FIRE", "WATER", "ELECTRIC", "GRASS", "LIGHT", "DARK"];

function elementColor(element: VfxElement): THREE.Color {
  if (element === "NEUTRAL") return new THREE.Color(0xaab4cc);
  return ELEMENT_THEME[element].vfx.clone();
}

function buildPads(set: SandboxSet): Pad[] {
  switch (set) {
    case "elements":
      return ELEMENTS.map((element) => ({
        label: element,
        color: elementColor(element),
        dummy: true,
        repeatSec: 1.6,
        fire: (vfx, anchor) => vfx.spawnImpact(anchor, elementColor(element), 1.15, { element, hitStyle: "magic" }),
      }));

    case "impact": {
      const fire = elementColor("FIRE");
      return [
        {
          label: "WEAK",
          color: fire,
          dummy: true,
          repeatSec: 1.6,
          fire: (vfx, anchor) => vfx.spawnImpact(anchor, elementColor("NEUTRAL"), 0.7, { element: "NEUTRAL", hitStyle: "blunt" }),
        },
        {
          label: "NORMAL",
          color: fire,
          dummy: true,
          repeatSec: 1.6,
          fire: (vfx, anchor) => vfx.spawnImpact(anchor, fire, 1.2, { element: "FIRE" }),
        },
        {
          label: "SLASH",
          color: elementColor("WATER"),
          dummy: true,
          repeatSec: 1.6,
          fire: (vfx, anchor) => vfx.spawnImpact(anchor, elementColor("WATER"), 1.2, { element: "WATER", hitStyle: "slash" }),
        },
        {
          label: "PIERCE",
          color: elementColor("LIGHT"),
          dummy: true,
          repeatSec: 1.6,
          fire: (vfx, anchor) =>
            vfx.spawnImpact(anchor, elementColor("LIGHT"), 1.2, { element: "LIGHT", hitStyle: "pierce", direction: new THREE.Vector3(1, 0.2, 0.4) }),
        },
        {
          label: "CRIT",
          color: fire,
          dummy: true,
          repeatSec: 1.6,
          fire: (vfx, anchor) => vfx.spawnCriticalImpact(anchor, fire, { element: "FIRE", hitStyle: "slash" }),
        },
        {
          label: "AOE",
          color: elementColor("DARK"),
          dummy: true,
          repeatSec: 1.6,
          fire: (vfx, anchor, ground) => {
            vfx.spawnAoeImpact(ground, elementColor("DARK"), { element: "DARK", radius: 3.4 });
            vfx.spawnImpact(anchor, elementColor("DARK"), 1.2, { element: "DARK", aoe: true });
          },
        },
      ];
    }

    case "crit":
      return ELEMENTS.map((element) => ({
        label: `CRIT ${element}`,
        color: elementColor(element),
        dummy: true,
        repeatSec: 1.8,
        fire: (vfx, anchor) => vfx.spawnCriticalImpact(anchor, elementColor(element), { element, hitStyle: "slash" }),
      }));

    case "status": {
      const kinds: StatusAuraKind[] = ["poison", "burn", "freeze", "shock", "shield", "immunity", "stun", "regen", "buff", "curse", "bleed"];
      return kinds.map((kind) => ({
        label: kind.toUpperCase(),
        color: new THREE.Color(0x8899aa),
        dummy: true,
        fire: (vfx, anchor, _ground, id) => vfx.attachStatusAura(id, kind, anchor),
      }));
    }

    case "support":
      return [
        {
          label: "HEAL",
          color: elementColor("GRASS"),
          dummy: true,
          repeatSec: 2.0,
          fire: (vfx, anchor) => vfx.spawnHeal(anchor, new THREE.Color(0x6ef08a)),
        },
        {
          label: "BUFF",
          color: elementColor("LIGHT"),
          dummy: true,
          repeatSec: 2.0,
          fire: (vfx, anchor) => vfx.spawnBuff(anchor, elementColor("LIGHT")),
        },
        {
          label: "DEBUFF",
          color: elementColor("DARK"),
          dummy: true,
          repeatSec: 2.0,
          fire: (vfx, anchor) => vfx.spawnDebuff(anchor, elementColor("DARK")),
        },
        {
          label: "SHIELD",
          color: elementColor("WATER"),
          dummy: true,
          repeatSec: 2.0,
          fire: (vfx, anchor) => vfx.spawnShield(anchor, elementColor("WATER")),
        },
        {
          label: "CAST",
          color: elementColor("ELECTRIC"),
          dummy: true,
          repeatSec: 2.0,
          fire: (vfx, anchor) => vfx.spawnCastCharge(anchor, elementColor("ELECTRIC"), { element: "ELECTRIC" }),
        },
        {
          label: "DEATH",
          color: elementColor("FIRE"),
          dummy: true,
          repeatSec: 2.0,
          fire: (vfx, anchor) => vfx.spawnDeath(anchor, elementColor("FIRE")),
        },
      ];

    case "projectile":
    default:
      return ELEMENTS.map((element) => ({
        label: element,
        color: elementColor(element),
        dummy: true,
        repeatSec: 1.4,
        fire: (vfx, anchor) => {
          const from = anchor.clone().add(new THREE.Vector3(-3.2, 0.2, 1.2));
          vfx.spawnProjectile({
            from,
            to: anchor,
            color: elementColor(element),
            element,
            arcHeight: 0.8,
            durationSec: 0.5,
            onArrive: () => vfx.spawnImpact(anchor, elementColor(element), 1.1, { element }),
          });
        },
      }));
  }
}

export interface SandboxOptions {
  set: SandboxSet;
  /** 指定秒だけ固定ステップで進めてから停止する(スクリーンショット用) */
  freezeAt?: number | null;
  quality?: number;
}

/**
 * 実際のバトルステージと同じ「見え方の条件」。
 * ここを合わせないと、サンドボックスでは良く見えるのに本番では
 * 小さすぎる/白飛びする、という食い違いが起きる。
 * (battleStage.ts の VFX_* と同じ値。あちらを変えたらここも合わせること)
 */
const STAGE_FOV = 24.5;
const STAGE_VISIBLE_HEIGHT = 10.2;
const STAGE_ELEVATION_DEG = 22.5;
const VFX_REFERENCE_HEIGHT = 42;
const VFX_DENSITY = 0.5;
const VFX_OPACITY = 0.42;
const VFX_MAX_SCREEN_RATIO = 0.16;

/**
 * ブラウザから直接呼べる取り付け口。
 * 開発時に `import('/src/web/three/fx/vfxSandbox.ts').then(m => m.mountVfxSandbox({ set: 'impact' }))`
 * とすれば、ページを用意しなくてもエフェクトだけを並べて確認できる。
 */
export function mountVfxSandbox(options: SandboxOptions): VfxSandbox {
  const previous = document.querySelector<HTMLElement>("#vfx-sandbox");
  previous?.remove();
  const container = document.createElement("div");
  container.id = "vfx-sandbox";
  container.style.cssText = "position:fixed;inset:0;z-index:99999;background:#05060c;overflow:hidden";
  document.body.append(container);
  const sandbox = new VfxSandbox(container, options);
  Object.assign(window, { __vfxSandbox: sandbox });
  return sandbox;
}

export class VfxSandbox {
  readonly element: HTMLElement;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly composer: EffectComposer;
  private readonly vfx = new VfxSystem();
  private readonly pads: { pad: Pad; anchor: THREE.Vector3; ground: THREE.Vector3; id: string; timer: number }[] = [];
  private readonly disposables: { dispose: () => void }[] = [];
  private readonly clock = new THREE.Clock();
  private frameHandle: number | null = null;
  private disposed = false;
  private elapsed = 0;

  constructor(container: HTMLElement, options: SandboxOptions) {
    this.element = container;
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // 露出とブルームも本番と揃える(battleStage.ts と同じ値)
    this.renderer.toneMappingExposure = 0.92;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.append(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x090a14);
    this.scene.fog = new THREE.FogExp2(0x0a0a16, 0.016);
    this.scene.add(this.vfx.root);

    const pads = buildPads(options.set);
    const columns = pads.length <= 4 ? 2 : pads.length <= 6 ? 3 : 4;
    const rows = Math.ceil(pads.length / columns);
    const spacingX = 6.2;
    const spacingZ = 4.6;

    // 本番と同じ画角・距離・見下ろし角で組む。ここが違うと
    // 「エフェクトがキャラクターに対してどれくらいの大きさか」が変わり、
    // サンドボックスでの判断が本番に持ち込めなくなる。
    const tanY = Math.tan((STAGE_FOV * Math.PI) / 360);
    const distance = STAGE_VISIBLE_HEIGHT / (2 * tanY);
    const elevation = (STAGE_ELEVATION_DEG * Math.PI) / 180;
    this.camera = new THREE.PerspectiveCamera(STAGE_FOV, width / height, 0.1, 250);
    this.camera.position.set(0, 1.3 + Math.sin(elevation) * distance, Math.cos(elevation) * distance);
    this.camera.lookAt(0, 1.3, 0);

    // 大きさ・濃さ・密度の頭打ちも本番と同じ経路で入れる
    this.vfx.setSizeScale(STAGE_VISIBLE_HEIGHT / VFX_REFERENCE_HEIGHT);
    this.vfx.setMaxBillboardScale(STAGE_VISIBLE_HEIGHT * VFX_MAX_SCREEN_RATIO);
    this.vfx.setQuality(options.quality ?? VFX_DENSITY);
    this.vfx.setOpacityScale(VFX_OPACITY);

    this.setupStage(Math.max(columns * spacingX, rows * spacingZ) + distance * 0.5);

    pads.forEach((pad, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const x = (col - (columns - 1) / 2) * spacingX;
      const z = (row - (rows - 1) / 2) * spacingZ;
      const ground = new THREE.Vector3(x, 0, z);
      const anchor = new THREE.Vector3(x, ANCHOR_HEIGHT, z);
      this.pads.push({ pad, anchor, ground, id: `pad-${index}`, timer: 0 });
      if (pad.dummy !== false) this.addDummy(anchor, pad.color);
      this.addLabel(pad.label, new THREE.Vector3(x, 3.3, z - 1.4));
    });

    this.composer = new EffectComposer(this.renderer);
    this.composer.setPixelRatio(1);
    this.composer.setSize(width, height);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(width, height), 0.18, 0.5, 1.15));
    this.composer.addPass(new OutputPass());

    if (options.freezeAt != null) this.renderFrozen(options.freezeAt);
    else this.startLive();
  }

  private setupStage(extent: number): void {
    this.scene.add(new THREE.HemisphereLight(0x8ea2ff, 0x1a1424, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(6, 12, 8);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xff7ad9, 0.5);
    rim.position.set(0, 6, -12);
    this.scene.add(rim);

    const groundGeometry = new THREE.PlaneGeometry(extent * 3, extent * 3);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x141625, roughness: 0.9, metalness: 0.1 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);
    this.disposables.push(groundGeometry, groundMaterial);

    const grid = new THREE.GridHelper(extent * 2.4, Math.round(extent * 1.2), 0x3a4270, 0x232842);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.5;
    grid.position.y = 0.01;
    this.scene.add(grid);
    this.disposables.push(grid.geometry, grid.material as THREE.Material);
  }

  private addDummy(anchor: THREE.Vector3, color: THREE.Color): void {
    const geometry = new THREE.IcosahedronGeometry(0.85, 1);
    const material = new THREE.MeshStandardMaterial({
      color: color.clone().multiplyScalar(0.45),
      emissive: color.clone().multiplyScalar(0.25),
      roughness: 0.5,
      metalness: 0.2,
      flatShading: true,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(anchor);
    this.scene.add(mesh);
    this.disposables.push(geometry, material);
  }

  private addLabel(text: string, position: THREE.Vector3): void {
    const texture = labelTexture(text);
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
    const geometry = new THREE.PlaneGeometry(3.2, 0.8);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.lookAt(this.camera.position);
    this.scene.add(mesh);
    this.disposables.push(texture, material, geometry);
  }

  private step(dt: number): void {
    this.elapsed += dt;
    for (const entry of this.pads) {
      entry.timer -= dt;
      if (entry.timer <= 0) {
        entry.pad.fire(this.vfx, entry.anchor, entry.ground, entry.id);
        entry.timer = entry.pad.repeatSec ?? Number.POSITIVE_INFINITY;
      }
    }
    this.vfx.faceCamera(this.camera);
    this.vfx.update(dt);
  }

  /** 固定ステップで freezeAt 秒まで進め、その瞬間を1枚だけ描画する */
  private renderFrozen(freezeAt: number): void {
    const dt = 1 / 60;
    const steps = Math.max(1, Math.round(freezeAt / dt));
    this.vfx.faceCamera(this.camera);
    for (let i = 0; i < steps; i++) this.step(dt);
    this.composer.render();
  }

  private startLive(): void {
    const loop = () => {
      if (this.disposed) return;
      this.frameHandle = requestAnimationFrame(loop);
      const dt = Math.min(0.05, this.clock.getDelta());
      this.step(dt);
      this.composer.render();
    };
    this.frameHandle = requestAnimationFrame(loop);
  }

  /** デバッグ表示用 */
  stats(): { particles: number; billboards: number; strips: number; auras: number } {
    return this.vfx.stats();
  }

  dispose(): void {
    this.disposed = true;
    if (this.frameHandle !== null) cancelAnimationFrame(this.frameHandle);
    this.vfx.dispose();
    for (const item of this.disposables) item.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
