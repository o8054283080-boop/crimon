import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { MonsterDefinition } from "../../core/monster.js";
import { createArena } from "./arena.js";
import { MonsterAvatar } from "./monsterAvatar.js";
import { VfxSystem } from "./vfx.js";

export interface StageUnitInit {
  instanceId: string;
  def: MonsterDefinition;
  team: "PLAYER" | "ENEMY";
}

/** バトル画面のHTML側が知りたい、各ユニットの画面上の位置(HPバー等の追従用) */
export interface ScreenAnchor {
  instanceId: string;
  x: number;
  y: number;
  /** カメラ後方など、画面に映っていない場合はfalse */
  visible: boolean;
  /** 遠いユニットのUIを少し小さくするための倍率 */
  scale: number;
}

const PLAYER_LINE_Z = 3.4;
const ENEMY_LINE_Z = -3.8;

/** 隊列の並び。中央に寄せつつ、奥行きを少しずらして重なりを避ける */
function slotPositions(count: number, lineZ: number, team: "PLAYER" | "ENEMY"): { x: number; z: number }[] {
  if (count <= 0) return [];
  const spacing = count <= 4 ? 2.75 : 2.45;
  const totalWidth = (count - 1) * spacing;
  return Array.from({ length: count }, (_, i) => {
    const x = -totalWidth / 2 + i * spacing;
    // 端のユニットほど少し奥へ下げて、扇状の陣形に見せる
    const depthOffset = Math.abs(x) * 0.16 * (team === "PLAYER" ? 1 : -1);
    return { x, z: lineZ + depthOffset };
  });
}

export class BattleStage {
  readonly element: HTMLElement;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly composer: EffectComposer;
  private readonly bloomPass: UnrealBloomPass;
  private readonly arena = createArena();
  private readonly vfx = new VfxSystem();
  private readonly avatars = new Map<string, MonsterAvatar>();
  private readonly resizeObserver: ResizeObserver;
  private readonly clock = new THREE.Clock();

  private readonly cameraBase = new THREE.Vector3(0, 7.2, 13.2);
  private readonly cameraTarget = new THREE.Vector3(0, 1.6, -0.3);
  private readonly cameraOffset = new THREE.Vector3();
  private readonly cameraLookOffset = new THREE.Vector3();
  private readonly desiredCameraOffset = new THREE.Vector3();
  private readonly desiredLookOffset = new THREE.Vector3();
  private readonly tmpVector = new THREE.Vector3();

  private shakeStrength = 0;
  private hitStopRemaining = 0;
  private frameHandle: number | null = null;
  private disposed = false;
  private elapsed = 0;

  constructor(container: HTMLElement, units: StageUnitInit[]) {
    this.element = container;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = "battle-stage__canvas";
    container.append(this.renderer.domElement);

    const { width, height } = this.measure();
    this.camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 250);
    this.camera.position.copy(this.cameraBase);
    this.camera.lookAt(this.cameraTarget);

    this.scene.fog = new THREE.FogExp2(0x0a0a16, 0.021);
    this.scene.add(this.arena.group);
    this.scene.add(this.vfx.root);

    this.setupLights();
    this.setupUnits(units);

    this.composer = new EffectComposer(this.renderer);
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.composer.setSize(width, height);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 0.72, 0.62, 0.72);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);
    this.handleResize();

    this.start();
  }

  private measure(): { width: number; height: number } {
    const rect = this.element.getBoundingClientRect();
    return { width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
  }

  private setupLights(): void {
    // 全体の底上げ。空(上)と床(下)で色を変えて自然な陰影を作る
    this.scene.add(new THREE.HemisphereLight(0x8ea2ff, 0x1a1424, 0.55));

    // キーライト: 斜め上手前から。影を落とす唯一のライト
    const key = new THREE.DirectionalLight(0xffffff, 1.35);
    key.position.set(6, 12, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 40;
    key.shadow.camera.left = -14;
    key.shadow.camera.right = 14;
    key.shadow.camera.top = 14;
    key.shadow.camera.bottom = -14;
    key.shadow.bias = -0.0012;
    this.scene.add(key);

    // フィルライト: 反対側から弱く当てて、影が潰れすぎないようにする
    const fill = new THREE.DirectionalLight(0x5f7cff, 0.5);
    fill.position.set(-8, 5, 4);
    this.scene.add(fill);

    // リムライト: 背後から輪郭を光らせ、背景からキャラを分離する
    const rim = new THREE.DirectionalLight(0xff7ad9, 0.65);
    rim.position.set(0, 6, -12);
    this.scene.add(rim);
  }

  private setupUnits(units: StageUnitInit[]): void {
    const players = units.filter((u) => u.team === "PLAYER");
    const enemies = units.filter((u) => u.team === "ENEMY");

    const place = (list: StageUnitInit[], lineZ: number, team: "PLAYER" | "ENEMY") => {
      const slots = slotPositions(list.length, lineZ, team);
      list.forEach((unit, index) => {
        const avatar = new MonsterAvatar({
          element: unit.def.element,
          role: unit.def.role,
          facing: team === "PLAYER" ? 1 : -1,
        });
        avatar.setSlotPosition(slots[index].x, slots[index].z);
        this.scene.add(avatar.root);
        this.avatars.set(unit.instanceId, avatar);

        // 属性色のポイントライトを1体ずつ持たせ、床への色移りで存在感を出す
        const light = new THREE.PointLight(avatar.theme.light, 6.5, 9, 2);
        light.position.set(slots[index].x, 2.0, slots[index].z);
        this.scene.add(light);
      });
    };

    place(players, PLAYER_LINE_Z, "PLAYER");
    place(enemies, ENEMY_LINE_Z, "ENEMY");
  }

  private handleResize(): void {
    const { width, height } = this.measure();
    this.camera.aspect = width / height;
    // 縦長の画面ではキャラが小さくなりすぎるため、画角を広げて全体を収める
    this.camera.fov = height > width ? 46 : 38;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    this.bloomPass.setSize(width, height);
  }

  private start(): void {
    const loop = () => {
      if (this.disposed) return;
      this.frameHandle = requestAnimationFrame(loop);
      this.renderFrame();
    };
    this.frameHandle = requestAnimationFrame(loop);
  }

  private renderFrame(): void {
    const rawDelta = Math.min(this.clock.getDelta(), 0.05);

    // ヒットストップ: 命中の瞬間だけ時間を遅くして打撃感を出す
    let delta = rawDelta;
    if (this.hitStopRemaining > 0) {
      this.hitStopRemaining -= rawDelta;
      delta = rawDelta * 0.18;
    }
    this.elapsed += delta;

    this.arena.update(this.elapsed);
    for (const avatar of this.avatars.values()) avatar.update(delta, this.elapsed);
    this.vfx.update(delta);
    this.vfx.faceCamera(this.camera);
    this.updateCamera(delta);

    this.composer.render();
  }

  private updateCamera(dt: number): void {
    // 注視点・カメラ位置ともに目標値へ滑らかに寄せる(急な切り替えを避ける)
    const follow = Math.min(1, dt * 3.2);
    this.cameraOffset.lerp(this.desiredCameraOffset, follow);
    this.cameraLookOffset.lerp(this.desiredLookOffset, follow);

    // 待機中もわずかに揺らして、静止画に見えないようにする
    const idleX = Math.sin(this.elapsed * 0.22) * 0.45;
    const idleY = Math.sin(this.elapsed * 0.31 + 1.2) * 0.22;

    this.camera.position.copy(this.cameraBase).add(this.cameraOffset);
    this.camera.position.x += idleX;
    this.camera.position.y += idleY;

    if (this.shakeStrength > 0.0005) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeStrength;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeStrength;
      this.camera.position.z += (Math.random() - 0.5) * this.shakeStrength * 0.5;
      this.shakeStrength *= Math.pow(0.0016, dt);
    }

    this.tmpVector.copy(this.cameraTarget).add(this.cameraLookOffset);
    this.camera.lookAt(this.tmpVector);
  }

  /** 行動中のユニットへ寄る。nullで全体を見るデフォルト位置へ戻る */
  focusOn(instanceId: string | null): void {
    for (const [id, avatar] of this.avatars) avatar.setActive(id === instanceId);

    if (!instanceId) {
      this.desiredCameraOffset.set(0, 0, 0);
      this.desiredLookOffset.set(0, 0, 0);
      return;
    }
    const avatar = this.avatars.get(instanceId);
    if (!avatar) return;

    const position = avatar.root.position;
    // 行動者の方向へカメラを少し振り、わずかに寄る
    this.desiredCameraOffset.set(position.x * 0.22, -0.5, position.z * 0.12 - 1.1);
    this.desiredLookOffset.set(position.x * 0.3, 0.15, position.z * 0.18);
  }

  getAvatar(instanceId: string): MonsterAvatar | undefined {
    return this.avatars.get(instanceId);
  }

  /** ユニットの頭上あたりのワールド座標(VFXの発生位置に使う) */
  private anchorOf(instanceId: string): THREE.Vector3 | null {
    const avatar = this.avatars.get(instanceId);
    if (!avatar) return null;
    return avatar.getAnchorWorldPosition(new THREE.Vector3());
  }

  playAttackMotion(actorId: string): void {
    this.avatars.get(actorId)?.playAttack();
  }

  playCastMotion(actorId: string): void {
    const avatar = this.avatars.get(actorId);
    if (!avatar) return;
    avatar.playCast();
    const anchor = this.anchorOf(actorId);
    if (anchor) this.vfx.spawnCastCharge(anchor, avatar.theme.vfx);
  }

  /** 術者から対象へ飛ぶ弾。到達時にonArriveでヒット表現へつなぐ */
  playProjectile(actorId: string, targetId: string, onArrive: () => void): void {
    const from = this.anchorOf(actorId);
    const to = this.anchorOf(targetId);
    const avatar = this.avatars.get(actorId);
    if (!from || !to || !avatar) {
      onArrive();
      return;
    }
    this.vfx.spawnProjectile({ from, to, color: avatar.theme.vfx, arcHeight: 1.1, durationSec: 0.28, onArrive });
  }

  playDamage(targetId: string, isCrit: boolean, sourceColor?: THREE.Color): void {
    const avatar = this.avatars.get(targetId);
    const anchor = this.anchorOf(targetId);
    if (!avatar || !anchor) return;

    avatar.playHit();
    const color = sourceColor ?? avatar.theme.vfx;
    if (isCrit) {
      this.vfx.spawnCriticalImpact(anchor, color);
      this.shake(0.42);
      this.hitStop(0.09);
    } else {
      this.vfx.spawnImpact(anchor, color, 1);
      this.shake(0.16);
      this.hitStop(0.035);
    }
  }

  playHeal(targetId: string): void {
    const avatar = this.avatars.get(targetId);
    const anchor = this.anchorOf(targetId);
    if (!avatar || !anchor) return;
    this.vfx.spawnHeal(anchor, avatar.theme.vfx);
  }

  playBuff(targetId: string): void {
    const avatar = this.avatars.get(targetId);
    const anchor = this.anchorOf(targetId);
    if (!avatar || !anchor) return;
    this.vfx.spawnBuff(anchor, avatar.theme.vfx);
  }

  playDebuff(targetId: string): void {
    const avatar = this.avatars.get(targetId);
    const anchor = this.anchorOf(targetId);
    if (!avatar || !anchor) return;
    this.vfx.spawnDebuff(anchor, avatar.theme.vfx);
  }

  playShield(targetId: string): void {
    const avatar = this.avatars.get(targetId);
    const anchor = this.anchorOf(targetId);
    if (!avatar || !anchor) return;
    this.vfx.spawnShield(anchor, avatar.theme.vfx);
  }

  playDeath(targetId: string): void {
    const avatar = this.avatars.get(targetId);
    const anchor = this.anchorOf(targetId);
    if (!avatar || !anchor) return;
    avatar.playDeath();
    this.vfx.spawnDeath(anchor, avatar.theme.vfx);
    this.shake(0.55);
  }

  shake(strength: number): void {
    this.shakeStrength = Math.max(this.shakeStrength, strength);
  }

  hitStop(seconds: number): void {
    this.hitStopRemaining = Math.max(this.hitStopRemaining, seconds);
  }

  /** HP割合や生死をアバターへ反映する */
  syncUnitState(instanceId: string, hpRatio: number, alive: boolean): void {
    const avatar = this.avatars.get(instanceId);
    if (!avatar) return;
    avatar.setHpRatio(hpRatio);
    if (!alive && !avatar.isDying()) avatar.playDeath();
    if (alive && avatar.isDying()) avatar.revive();
  }

  /** HTMLオーバーレイ(HPバー等)を3D位置に追従させるための画面座標を返す */
  computeScreenAnchors(): ScreenAnchor[] {
    const { width, height } = this.measure();
    const anchors: ScreenAnchor[] = [];
    for (const [instanceId, avatar] of this.avatars) {
      avatar.getAnchorWorldPosition(this.tmpVector);
      const distance = this.camera.position.distanceTo(this.tmpVector);
      this.tmpVector.project(this.camera);
      const visible = this.tmpVector.z < 1;
      anchors.push({
        instanceId,
        x: (this.tmpVector.x * 0.5 + 0.5) * width,
        y: (-this.tmpVector.y * 0.5 + 0.5) * height,
        visible,
        // 近いほど大きく。極端になりすぎないよう範囲を絞る
        scale: Math.max(0.72, Math.min(1.15, 14 / distance)),
      });
    }
    return anchors;
  }

  dispose(): void {
    this.disposed = true;
    if (this.frameHandle !== null) cancelAnimationFrame(this.frameHandle);
    this.resizeObserver.disconnect();
    for (const avatar of this.avatars.values()) avatar.dispose();
    this.avatars.clear();
    this.arena.dispose();
    this.vfx.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
