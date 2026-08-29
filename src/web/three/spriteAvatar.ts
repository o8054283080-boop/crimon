import * as THREE from "three";
import { Element } from "../../core/element.js";
import { ElementTheme, themeFor } from "./elementTheme.js";
import { ELEMENT_TINT, NO_TINT_TEMPLATES, SPRITE_TINT, TINT_MASK, bodyHueFor, isElementSpecific, loadSpriteTexture, spriteUrlFor } from "./spriteArt.js";

/**
 * 2Dの絵で立つモンスター。
 *
 * `MonsterAvatar`(3Dモデル)と**同じ約束事**を持つので、戦闘画面から見ると
 * どちらが立っているかを気にせず扱える(avatarFactory.ts が選ぶ)。
 *
 * ## なぜ板1枚なのか
 *
 * 3Dのモンスターは1体あたり36回前後の描画を使い、本体だけで288回あった。
 * 実機で31.5fpsしか出ておらず、造形の作り直しはどのみち必要だった。
 * 板は**1体1回**で描ける。舞台・光・エフェクト・カメラはThree.jsのまま残るので、
 * 演出を作り直さずに本体だけを軽くできる。
 *
 * ## 動きは「1枚の絵を変形させて」作る
 *
 * 依頼主の要望は待機・攻撃・被弾・サポートの4モーション。
 * **「動きがないと安っぽい」— そのとおりなので、静止画を置くだけにはしない。**
 *
 * 絵は1枚でも、板を縦横に潰し・伸ばし・撓ませれば動く。
 *   - 待機: 呼吸で潰れて伸びる / 上下に漂う / 上ほど遅れて撓む(ゼリーの追従)
 *   - 攻撃: 沈んで溜める → 踏み込んで伸びる → 当たった瞬間に潰れる → 揺り戻す
 *   - 被弾: 後ろへ流されてのけぞる / 白く光る / バネで戻る
 *   - サポート: 浮き上がって縦に伸びる / 属性色の光が乗る
 *
 * **足元(y=0)は動かさず、上ほど大きく動かす。** これを守ると、どれだけ
 * 変形させても接地が外れない。逆にすると宙に浮いた紙が揺れているだけに見える。
 *
 * 潰した時は横へ逃がして体積を保つ(`1/sqrt(squash)`)。
 * ここを省くと「縦に縮んだ絵」にしか見えず、弾力が出ない。
 */

/** 役割ごとの背丈。3Dの骨格(creature/roles.ts)と同じ値を使い、並べた時の格を揃える */
const ROLE_HEIGHT: Record<string, number> = {
  アタッカー: 2.2,
  ディフェンダー: 2.45,
  ヒーラー: 2.25,
  サポート: 2.05,
  デバッファー: 2.25,
  バランス型: 2.35,
  ボス: 2.95,
  素材: 1.35,
};

/** 地面から浮かせる高さ。妖精や結晶は足を着けない */
const ROLE_FLOAT: Record<string, number> = {
  アタッカー: 0,
  ディフェンダー: 0,
  ヒーラー: 0.32,
  サポート: 0.42,
  デバッファー: 0,
  バランス型: 0,
  ボス: 0,
  素材: 0.05,
};

/** 役割ではなく種族で浮くもの(3D側の rig.floats = true と揃える) */
const FLOATING_TEMPLATES = new Set(["fairy", "wisp", "ancient_demon", "ancient_crystal", "ancient_crystal_curse"]);

export interface SpriteAvatarOptions {
  element: Element;
  role: string;
  templateId: string;
  /** PLAYER側は+1(手前)、ENEMY側は-1(奥) */
  facing: 1 | -1;
}

/**
 * 攻撃の3段の長さ。**秒で持つ。**
 *
 * 割合で区切ると、種族ごとに全長を変えた時に打点まで一緒にずれ、
 * 着弾エフェクトと合わなくなる。打点はどの種族でもここで揃える。
 */
const ATTACK_WINDUP = 0.13;
const ATTACK_STRIKE = 0.19;
const ATTACK_RECOVER = 0.26;
const ATTACK_TOTAL = ATTACK_WINDUP + ATTACK_STRIKE + ATTACK_RECOVER;

const HIT_DURATION = 0.42;
const CAST_DURATION = 0.68;
const VICTORY_DURATION = 1.05;
const DEATH_DURATION = 0.9;

/**
 * 種族ごとの動きの癖。
 *
 * 全部同じ揺れ方だと、岩の巨人と妖精が同じ拍で漂う。
 * **重さと浮き方は見た目の説得力に直結する**ので、種族ごとに振り分ける。
 */
type MotionStyle = "standard" | "floaty" | "heavy" | "beast" | "blob" | "critter";

const MOTION_BY_TEMPLATE: Record<string, MotionStyle> = {
  // 浮遊型。上下を大きく、呼吸は浅く
  wisp: "floaty",
  fairy: "floaty",
  seraph: "floaty",
  ancient_demon: "floaty",
  ancient_crystal: "floaty",
  ancient_crystal_curse: "floaty",
  // 重量型。上下を小さく、溜めと着地を強く
  golem: "heavy",
  treant: "heavy",
  knight: "heavy",
  // 獣型。踏み込む距離を長く
  wolf: "beast",
  griffon: "beast",
  dragon: "beast",
  // 粘体。横に広がって縦に縮む
  slime: "blob",
  // 小動物。軽く弾む
  exp_pig: "critter",
  reincarnation_pig: "critter",
  skill_pig: "critter",
};

interface MotionTuning {
  /** 待機の上下幅(ワールド単位。1単位はおよそ55px) */
  bob: number;
  /** 待機の上下の速さ(Hz) */
  bobHz: number;
  /** 呼吸の潰し量。0.02なら 0.98〜1.02 */
  breathe: number;
  breatheHz: number;
  /** 待機の撓み */
  sway: number;
  /** 待機中に横へ広がる量(粘体だけ大きい) */
  wobbleX: number;
  /** 攻撃の溜めの深さ */
  windup: number;
  /** 踏み込む距離 */
  dash: number;
  /** 着地・打点の潰し */
  impact: number;
}

const MOTION_TUNING: Record<MotionStyle, MotionTuning> = {
  //          bob   bobHz breathe bHz  sway  wobbleX windup dash impact
  standard: { bob: 0.055, bobHz: 0.58, breathe: 0.022, breatheHz: 0.62, sway: 0.045, wobbleX: 0, windup: 0.26, dash: 1.0, impact: 0.10 },
  floaty:   { bob: 0.130, bobHz: 0.42, breathe: 0.014, breatheHz: 0.45, sway: 0.090, wobbleX: 0, windup: 0.18, dash: 0.9, impact: 0.06 },
  heavy:    { bob: 0.032, bobHz: 0.40, breathe: 0.012, breatheHz: 0.42, sway: 0.022, wobbleX: 0, windup: 0.40, dash: 0.8, impact: 0.20 },
  beast:    { bob: 0.050, bobHz: 0.66, breathe: 0.020, breatheHz: 0.70, sway: 0.050, wobbleX: 0, windup: 0.24, dash: 1.35, impact: 0.12 },
  blob:     { bob: 0.045, bobHz: 0.52, breathe: 0.045, breatheHz: 0.55, sway: 0.030, wobbleX: 0.055, windup: 0.22, dash: 1.0, impact: 0.16 },
  critter:  { bob: 0.062, bobHz: 0.78, breathe: 0.026, breatheHz: 0.82, sway: 0.050, wobbleX: 0.012, windup: 0.20, dash: 1.0, impact: 0.10 },
};

/**
 * 動きを控える設定が入っているか。
 *
 * 端末側で「視差効果を減らす」を選んでいる人には、揺れが体調に障ることがある。
 * **止めるのではなく弱める。** 完全に止めると、攻撃と被弾の区別が付かなくなる。
 */
function reducedMotionScale(): number {
  if (typeof matchMedia !== "function") return 1;
  try {
    return matchMedia("(prefers-reduced-motion: reduce)").matches ? 0.3 : 1;
  } catch {
    return 1;
  }
}

/** 0→1→0 の山。0.5でちょうど1になる */
function arch(t: number): number {
  return Math.sin(Math.min(1, Math.max(0, t)) * Math.PI);
}

/** 減衰する振動。被弾のよろけ戻りに使う */
function damped(t: number, cycles: number, damping: number): number {
  return Math.sin(t * Math.PI * 2 * cycles) * Math.exp(-t * damping);
}

export class SpriteAvatar {
  readonly root = new THREE.Group();
  readonly theme: ElementTheme;

  private readonly mesh: THREE.Mesh;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly hitProxy: THREE.Mesh;
  private readonly height: number;
  private readonly floatHeight: number;
  private readonly facing: 1 | -1;

  /** シェーダへ渡す値。onBeforeCompile で差し込んだ uniform をここから触る */
  private readonly uniforms = {
    uSquash: { value: 1 },
    uStretchX: { value: 1 },
    uScale: { value: 1 },
    uBend: { value: 0 },
    uHeight: { value: 1 },
    uTintHue: { value: 0 },
    uTintSat: { value: 1 },
    uTintValueMul: { value: 1 },
    uTintValueAdd: { value: 0 },
    uTintAmount: { value: 0 },
    uBodyHue: { value: -1 },
    uFlash: { value: 0 },
    uGlow: { value: 0 },
    uGlowColor: { value: new THREE.Color(1, 1, 1) },
    uDim: { value: 0 },
  };

  /** 位相をばらす。全員が同じ拍で呼吸すると機械に見える */
  private idleClock = Math.random() * 40;
  private readonly bobPhase = Math.random() * Math.PI * 2;

  /*
   * モーションの進行時間。**-1 は「動いていない」。**
   * 進行中かどうかをこの1つで持つので、多重実行の判定も
   * 取り消しも、同じ場所だけを見れば済む。
   */
  private attackTimer = -1;
  private hitTimer = -1;
  private castTimer = -1;
  private victoryTimer = -1;
  private deathTimer = -1;
  private dead = false;

  /** 種族ごとの動きの癖 */
  private readonly tuning: MotionTuning;
  /** 動きを控える設定ぶんの倍率。1が通常、0.3で控えめ */
  private readonly motionScale: number;

  /** 相手チームのいる向き(正規化済み)。踏み込む先とのけぞる先を決める */
  private readonly foeDir = new THREE.Vector3(0, 0, -1);
  private slotX = 0;
  private slotZ = 0;

  private activeGlow = 0;
  private targetGlow = 0;
  private targeted = false;
  private hpRatio = 1;

  /** 倒れる向き。全員が同じ方へ崩れると作り物に見える */
  private readonly deathTip = Math.random() < 0.5 ? -1 : 1;

  private readonly disposables: { dispose: () => void }[] = [];

  constructor(options: SpriteAvatarOptions) {
    const { element, role, templateId, facing } = options;
    this.facing = facing;
    this.theme = themeFor(element);

    const url = spriteUrlFor(templateId, element, "idle");
    if (!url) throw new Error(`2Dの絵が無い: ${templateId}[${element}]`);
    const texture = loadSpriteTexture(url);

    this.tuning = MOTION_TUNING[MOTION_BY_TEMPLATE[templateId] ?? "standard"];
    this.motionScale = reducedMotionScale();
    this.height = ROLE_HEIGHT[role] ?? 2.2;
    this.floatHeight = FLOATING_TEMPLATES.has(templateId) ? Math.max(0.34, ROLE_FLOAT[role] ?? 0) : (ROLE_FLOAT[role] ?? 0);

    // 画像の縦横比から幅を出す。**全部同じ幅にすると、翼を広げた種族が潰れる。**
    // 読み込みが終わるまで比が分からないので、まず正方形で置いて後から直す
    const geometry = new THREE.PlaneGeometry(this.height, this.height, 1, 14);
    // 原点を足元へ移す。以後どれだけ変形させても y=0 が接地面のままになる
    geometry.translate(0, this.height / 2, 0);
    this.disposables.push(geometry);

    this.uniforms.uHeight.value = this.height;
    this.uniforms.uGlowColor.value = this.theme.rim.clone();
    // 属性専用に描かれた絵は、描いた人が既に色を付けている。二重に寄せると濁る
    /*
     * 色替えを掛けるかどうか。
     *   - その属性のために描かれた絵は、描いた人が既に色を付けている
     *   - 転生ピッグのように属性を持たない種族は掛けない
     */
    const skipTint = isElementSpecific(templateId, element) || NO_TINT_TEMPLATES.has(templateId);
    const tint = ELEMENT_TINT[element];
    this.uniforms.uTintAmount.value = skipTint ? 0 : SPRITE_TINT;
    this.uniforms.uTintHue.value = tint.hue;
    this.uniforms.uTintSat.value = tint.sat;
    this.uniforms.uTintValueMul.value = tint.valueMul;
    this.uniforms.uTintValueAdd.value = tint.valueAdd;
    this.uniforms.uBodyHue.value = bodyHueFor(templateId, element);

    this.material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      // 半透明の縁どうしが前後で打ち消し合わないよう、深度書き込みは切る。
      // 代わりに renderOrder で奥から手前へ並べる
      depthWrite: false,
      side: THREE.DoubleSide,
      alphaTest: 0.004,
    });
    this.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = `
        uniform float uSquash;
        uniform float uStretchX;
        uniform float uScale;
        uniform float uBend;
        uniform float uHeight;
        ${shader.vertexShader}
      `.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         // 足元(y=0)を固定し、上ほど大きく動かす。
         // これを守ると、どれだけ変形させても接地が外れない
         float _t = clamp(transformed.y / uHeight, 0.0, 1.0);
         transformed.y *= uSquash;
         // 潰したぶんは横へ逃がして体積を保つ。無いと弾力が出ない
         transformed.x *= inversesqrt(max(uSquash, 0.05)) * uStretchX;
         // スキル発動時などの、縦横そろえた拡大
         transformed.xy *= uScale;
         // 撓み。上ほど大きく流れるので、鞭のようにしなる
         transformed.x += uBend * _t * _t;
        `,
      );
      shader.fragmentShader = `
        uniform float uTintHue;
        uniform float uTintSat;
        uniform float uTintValueMul;
        uniform float uTintValueAdd;
        uniform float uTintAmount;
        uniform float uBodyHue;
        uniform float uFlash;
        uniform float uGlow;
        uniform vec3 uGlowColor;
        uniform float uDim;

        // RGBとHSVの行き来。**色相だけを差し替える**ために要る
        vec3 _rgb2hsv(vec3 c) {
          vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
          vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
          vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
          float d = q.x - min(q.w, q.y);
          float e = 1.0e-10;
          return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
        }
        vec3 _hsv2rgb(vec3 c) {
          vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
          vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
          return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
        }

        ${shader.fragmentShader}
      `.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
         {
           float _luma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
           if (uTintAmount > 0.001) {
             /*
              * 属性の色へ置き換える。**画像全体を一律に染めない。**
              *
              * 白目・瞳・歯・爪・角・金属・装備品まで染まると、
              * 「同じキャラの色違い」ではなく「色を塗り替えた別物」になる。
              * 染める量を3つの条件の掛け合わせで決める。
              */
             vec3 _hsv = _rgb2hsv(diffuseColor.rgb);

             // 1. 彩度が低いもの(白目・歯・銀・骨)は守る
             float _mask = smoothstep(${TINT_MASK.satLow.toFixed(3)}, ${TINT_MASK.satHigh.toFixed(3)}, _hsv.y);
             // 2. 潰れた暗部(輪郭線)は守る
             _mask *= smoothstep(${TINT_MASK.valLow.toFixed(3)}, ${TINT_MASK.valHigh.toFixed(3)}, _hsv.z);
             // 3. 白いハイライトは守る(色の付いた明部は守らない)
             _mask *= 1.0 - smoothstep(${TINT_MASK.hiLow.toFixed(3)}, ${TINT_MASK.hiHigh.toFixed(3)}, _hsv.z) * (1.0 - _hsv.y);
             // 4. 体の主色から色相が離れたもの(装備・宝石)は守る。
             //    主色は絵ごとに tools/prepareSprites.mjs が測って sprites.json にある
             if (uBodyHue >= 0.0) {
               float _d = abs(_hsv.x - uBodyHue);
               _d = min(_d, 1.0 - _d);
               _mask *= 1.0 - smoothstep(${TINT_MASK.hueNear.toFixed(3)}, ${TINT_MASK.hueFar.toFixed(3)}, _d);
             }

             /*
              * 置き換え先。**色相・彩度・明度を別々に扱う。**
              * 彩度と明度は元の値に倍率と加算をかけるだけなので、
              * 描かれた陰影の濃淡がそのまま残る。
              * 光を真っ白に、闇を真っ黒に潰すと影絵になってしまう
              */
             vec3 _target = _hsv2rgb(vec3(
               uTintHue,
               clamp(_hsv.y * uTintSat, 0.0, 1.0),
               clamp(_hsv.z * uTintValueMul + uTintValueAdd, 0.0, 1.0)
             ));
             diffuseColor.rgb = mix(diffuseColor.rgb, _target, uTintAmount * _mask);
           }
           // 瀕死は色を落とす。3D側が亀裂を光らせていたのと同じ役目
           diffuseColor.rgb *= (1.0 - uDim * 0.42);
           // 手番が回ってきた時の淡い発光
           diffuseColor.rgb += uGlowColor * uGlow * (0.22 + 0.78 * _luma);
           // 被弾の白飛び
           diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), uFlash);
         }
        `,
      );
    };
    // onBeforeCompile を変えたことをThreeへ知らせる鍵。
    // 同じ既定値のままだと、別の MeshBasicMaterial とシェーダを共有してしまう
    this.material.customProgramCacheKey = () => "crimon-sprite-avatar";
    this.disposables.push(this.material);

    this.mesh = new THREE.Mesh(geometry, this.material);
    // 敵は左右反転して、両チームが同じ絵の並びに見えないようにする
    this.mesh.scale.x = facing === 1 ? 1 : -1;
    this.root.add(this.mesh);

    // 画像の比が分かった時点で幅を直す
    const applyAspect = () => {
      const image = texture.image as { width?: number; height?: number } | undefined;
      if (!image?.width || !image?.height) return;
      this.mesh.scale.x = (image.width / image.height) * (facing === 1 ? 1 : -1);
    };
    if (texture.image) applyAspect();
    else texture.addEventListener("update" as never, applyAspect as never);
    // TextureLoader は読み込み後に image を差すので、次のフレームでも試す
    requestAnimationFrame(applyAspect);

    // 指の当たり判定。細かい形で判定すると狙いにくいので、姿を持たない箱で受ける。
    // 幅は接地影の大きさの基準にもなる(battleStage.addContactShadow)
    const footprint = this.height * 0.62;
    const hitGeometry = new THREE.BoxGeometry(footprint * 1.15, this.height * 1.05, footprint * 1.15);
    const hitMaterial = new THREE.MeshBasicMaterial({ visible: false });
    this.disposables.push(hitGeometry, hitMaterial);
    this.hitProxy = new THREE.Mesh(hitGeometry, hitMaterial);
    this.hitProxy.position.y = this.height * 0.52;
    this.hitProxy.renderOrder = -1;
    this.root.add(this.hitProxy);
  }

  setSlotPosition(x: number, z: number): void {
    this.slotX = x;
    this.slotZ = z;
    this.root.position.set(x, 0, z);
    // 奥にいるものから先に描く。深度書き込みを切っているので、
    // ここを決めないと前後関係が崩れて手前の敵が奥に見えることがある
    this.mesh.renderOrder = Math.round(100 - z * 10);
  }

  /** ダメージ表示やHPバーをぶら下げる、頭上あたりのワールド座標 */
  getAnchorWorldPosition(target: THREE.Vector3): THREE.Vector3 {
    this.root.getWorldPosition(target);
    target.y += this.height * 0.88 + this.floatHeight;
    return target;
  }

  setActive(active: boolean): void {
    this.targetGlow = active ? 1 : 0;
  }

  setTargeted(targeted: boolean): void {
    this.targeted = targeted;
  }

  /** 指の当たり判定に使う、姿を持たない箱 */
  get hitArea(): THREE.Object3D {
    return this.hitProxy;
  }

  setHpRatio(ratio: number): void {
    this.hpRatio = Math.max(0, Math.min(1, ratio));
  }

  faceToward(x: number, z: number): void {
    this.foeDir.set(x - this.slotX, 0, z - this.slotZ);
    if (this.foeDir.lengthSq() < 1e-6) this.foeDir.set(0, 0, -this.facing);
    this.foeDir.normalize();
  }

  /*
   * ここから下がモーションの入口。
   *
   * **同じモーションの多重実行を防ぐ。** 攻撃・詠唱・勝利は、走っている間に
   * もう一度呼ばれても無視する(戦闘側が連続で呼んでも姿勢が飛ばない)。
   * **被弾だけは例外**で、連続で殴られたら毎回はじかれるのが正しい。
   */

  playAttack(): void {
    if (this.dead || this.attackTimer >= 0) return;
    this.attackTimer = 0;
  }

  playCast(): void {
    if (this.dead || this.castTimer >= 0) return;
    this.castTimer = 0;
  }

  playHit(): void {
    if (this.dead) return;
    // 連続で殴られたら毎回はじかれる。ここだけは上書きしてよい
    this.hitTimer = 0;
  }

  /** 勝利。小さく2回跳ねて、待機へ戻る */
  playVictory(): void {
    if (this.dead || this.victoryTimer >= 0) return;
    this.victoryTimer = 0;
  }

  playDeath(): void {
    if (this.dead) return;
    this.dead = true;
    this.deathTimer = 0;
    // 倒れる姿勢が他のモーションと混ざらないよう、走っているものを畳む
    this.attackTimer = -1;
    this.castTimer = -1;
    this.victoryTimer = -1;
    this.hitTimer = -1;
  }

  /**
   * 進行中のモーションを全部畳んで、素立ちへ戻す。
   *
   * 戦闘が終わった時、復活した時、画面を離れる時に呼ぶ。
   * **位置・回転・拡縮・透明度を必ず元へ戻す。** 戻し忘れると、
   * 次の戦闘で傾いたまま、あるいは薄いままのモンスターが立つ。
   */
  resetMotion(): void {
    this.attackTimer = -1;
    this.hitTimer = -1;
    this.castTimer = -1;
    this.victoryTimer = -1;
    this.deathTimer = -1;
    this.uniforms.uSquash.value = 1;
    this.uniforms.uStretchX.value = 1;
    this.uniforms.uScale.value = 1;
    this.uniforms.uBend.value = 0;
    this.uniforms.uFlash.value = 0;
    this.uniforms.uGlow.value = 0;
    this.activeGlow = 0;
    this.material.opacity = 1;
    this.mesh.rotation.z = 0;
    this.root.visible = true;
    this.root.position.set(this.slotX, this.floatHeight, this.slotZ);
  }

  revive(): void {
    this.dead = false;
    this.resetMotion();
  }

  isDying(): boolean {
    return this.dead && this.deathTimer >= 0 && this.deathTimer < DEATH_DURATION;
  }

  update(dt: number, _elapsed: number): void {
    this.idleClock += dt;
    const m = this.tuning;
    const scale = this.motionScale;

    // --- 待機。呼吸・漂い・撓み ---------------------------------------
    // 位相は個体ごとにずらしてある。全員が同じ拍で息をすると機械に見える
    const breath = Math.sin(this.idleClock * m.breatheHz * Math.PI * 2 + this.bobPhase);
    let squash = 1 + breath * m.breathe * scale;
    // 粘体は縦に縮んだぶんだけ横へ広がる。他は0なので効かない
    let stretchX = 1 - breath * m.wobbleX * scale;
    let bend = Math.sin(this.idleClock * m.bobHz * 1.4 * Math.PI * 2 + this.bobPhase * 1.7) * m.sway * scale;
    let lift = this.floatHeight
      + Math.sin(this.idleClock * m.bobHz * Math.PI * 2 + this.bobPhase) * m.bob * scale;
    let push = 0;
    let tilt = 0;
    let flash = 0;
    let uniformScale = 1;
    let castGlow = 0;

    // --- 攻撃。沈む → 踏み込む → 打点で潰れる → 戻る -------------------
    if (this.attackTimer >= 0) {
      this.attackTimer += dt;
      const t = this.attackTimer;
      if (t < ATTACK_WINDUP) {
        const k = t / ATTACK_WINDUP;
        squash *= 1 - m.windup * 0.32 * k * scale;
        push -= m.windup * 0.9 * k * scale;
        bend -= m.windup * 0.7 * k * scale;
      } else if (t < ATTACK_WINDUP + ATTACK_STRIKE) {
        const k = (t - ATTACK_WINDUP) / ATTACK_STRIKE;
        // 前半で伸びて出る。後半(打点)で潰れる
        const reach = Math.min(1, k * 1.7);
        squash *= 1 + (0.15 * arch(k) - m.impact * Math.max(0, k - 0.62) / 0.38) * scale;
        push += m.dash * 1.05 * reach * scale;
        bend += 0.48 * m.dash * reach * scale;
      } else if (t < ATTACK_TOTAL) {
        const k = (t - ATTACK_WINDUP - ATTACK_STRIKE) / ATTACK_RECOVER;
        const back = (1 - k) * (1 - k);
        squash *= 1 + damped(k, 1.4, 5.2) * 0.07 * scale;
        push += m.dash * 1.05 * back * scale;
        bend += (0.48 * m.dash * back + damped(k, 1.6, 4.4) * 0.1) * scale;
      } else {
        this.attackTimer = -1;
      }
    }

    // --- 被弾。はじかれて、2回点滅して、震えながら戻る -------------------
    if (this.hitTimer >= 0) {
      this.hitTimer += dt;
      const t = this.hitTimer;
      const k = t / HIT_DURATION;
      if (k >= 1) {
        this.hitTimer = -1;
      } else {
        const decay = Math.exp(-k * 4.2);
        // 攻撃してきた方向と反対へ弾く(6〜12px相当)
        push -= 0.2 * decay * scale;
        bend -= (0.34 * decay + damped(k, 2.4, 6.5) * 0.14) * scale;
        squash *= 1 - 0.1 * decay * scale;
        // 小さな左右の震え
        stretchX *= 1 + damped(k, 5.0, 9.0) * 0.03 * scale;
        // 2回の点滅。長く光らせると「痛み」ではなく「発光」になる
        flash = t < 0.075 ? 0.9 : t >= 0.15 && t < 0.225 ? 0.65 : 0;
      }
    }

    // --- スキル。少し浮いて拡大し、属性色が乗る -------------------------
    if (this.castTimer >= 0) {
      this.castTimer += dt;
      const k = this.castTimer / CAST_DURATION;
      if (k >= 1) {
        this.castTimer = -1;
      } else {
        const a = arch(k);
        lift += 0.3 * a * scale;
        // 1.00 → 1.09 → 1.00。仕様の 1.05〜1.12 の内側
        uniformScale *= 1 + 0.09 * a * scale;
        bend += Math.sin(k * Math.PI * 3) * 0.05 * scale;
        castGlow = a;
      }
    }

    // --- 勝利。小さく2回跳ねる -----------------------------------------
    if (this.victoryTimer >= 0) {
      this.victoryTimer += dt;
      const k = this.victoryTimer / VICTORY_DURATION;
      if (k >= 1) {
        this.victoryTimer = -1;
      } else {
        // sin(4πk) の正の山が2つ = 2回跳ぶ。負の谷は沈み込み(溜めと着地)
        const wave = Math.sin(k * Math.PI * 4);
        const hop = Math.max(0, wave);
        const crouch = Math.max(0, -wave);
        lift += 0.32 * hop * scale;
        squash *= 1 + (0.08 * hop - 0.14 * crouch) * scale;
      }
    }

    // --- 撃破。傾きながら沈み、薄くなる ---------------------------------
    if (this.deathTimer >= 0) {
      this.deathTimer += dt;
      const k = Math.min(1, this.deathTimer / DEATH_DURATION);
      tilt = this.deathTip * k * 1.15;
      squash *= 1 - 0.28 * k;
      lift -= (this.floatHeight + 0.15) * k;
      this.material.opacity = Math.max(0, 1 - Math.max(0, k - 0.45) / 0.55);
      if (k >= 1) this.root.visible = false;
    } else if (this.material.opacity !== 1) {
      this.material.opacity = 1;
    }

    // --- 手番のハイライト。急に点かないよう追いかける ---------------------
    const glowTarget = Math.max(this.targetGlow, this.targeted ? 0.55 : 0, castGlow);
    this.activeGlow += (glowTarget - this.activeGlow) * Math.min(1, dt * 9);
    this.uniforms.uGlow.value = this.activeGlow * 0.3;
    this.uniforms.uGlowColor.value.copy(this.targeted ? this.theme.vfx : this.theme.rim);

    // --- 反映 ------------------------------------------------------------
    this.uniforms.uSquash.value = squash;
    this.uniforms.uStretchX.value = stretchX;
    this.uniforms.uScale.value = uniformScale;
    // 撓みは絵の向きに関係なく「相手の方向」を正にしたいので、反転ぶんを打ち消す
    this.uniforms.uBend.value = bend * (this.mesh.scale.x < 0 ? -1 : 1);
    this.uniforms.uFlash.value = flash;
    this.uniforms.uDim.value = 1 - this.hpRatio;

    this.root.position.set(
      this.slotX + this.foeDir.x * push,
      lift,
      this.slotZ + this.foeDir.z * push,
    );
    this.mesh.rotation.z = tilt;
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const item of this.disposables) item.dispose();
  }
}
