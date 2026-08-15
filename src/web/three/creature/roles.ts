import * as THREE from "three";
import { ChainResult, CreatureKit } from "./kit.js";
import {
  AIM_BACK,
  AIM_DOWN,
  AIM_FORWARD,
  CreatureRig,
  RigLimb,
  markAnimated,
  place,
} from "./rig.js";

/**
 * 役割別のシルエット設計。
 *
 * 座標系の約束:
 *   -Z が正面(敵の方向) / +X が右 / +Y が上
 *   chain() の骨は -Y へ伸び、rot.x が正なら先端が前(-Z)へ振れる
 *   胴(torso)は +Y が背骨方向なので、rotation.x が負で前傾する
 *
 * 実寸は finalizeRig() が体高から正規化するため、ここでは比率だけを設計する。
 */

/** 連鎖から手足を登録する。関節はアニメーション対象としてマークする */
function limbFrom(chain: ChainResult, side: number, phase: number): RigLimb {
  markAnimated(...chain.joints);
  return {
    root: chain.joints[0],
    rootRest: chain.rests[0],
    lower: chain.joints[1] ?? null,
    lowerRest: chain.rests[1] ?? null,
    tip: chain.tip,
    side,
    phase,
  };
}

/**
 * 指と爪を扇状に付ける。
 * 指の節(短い骨)を挟んでから鉤爪を付けることで、
 * 「手先に棘が生えている」ではなく「指の先の爪」に見える。
 */
function addClaws(kit: CreatureKit, hand: THREE.Object3D, count: number, length: number, radius: number, spread: number): void {
  const p = kit.palette;
  for (let i = 0; i < count; i++) {
    const offset = (i - (count - 1) / 2) * spread;
    const finger = new THREE.Group();
    place(finger, offset, -0.02, -0.02, AIM_FORWARD + 0.55, offset * 1.6, 0);
    // 指の節。爪の根元が肉に埋まっているように見せる
    finger.add(place(kit.ball(radius * 1.5, length * 0.3, radius * 1.5, "hide", p.dark, 6), 0, length * 0.18, 0));
    finger.add(kit.claw(length, radius * 1.35, 0.55, "plate", p.plate));
    hand.add(finger);
  }
}

/** 関節。骨の継ぎ目に球と輪を入れて、円柱の直結を隠す */
function addJoint(kit: CreatureKit, joint: THREE.Object3D, y: number, radius: number, armored: boolean): void {
  const p = kit.palette;
  joint.add(place(kit.ball(radius, radius * 0.9, radius, "hide", p.dark, 8), 0, y, 0));
  if (armored) {
    // 膝・肘の当て金。外側だけを覆う板で、装甲の重なりを作る
    joint.add(place(kit.lens(radius * 1.15, radius * 1.0, radius * 0.5, "metal", p.metal), 0, y, -radius * 0.75, 0.2, 0, 0));
  }
}

/**
 * 肋・腹の節。胴の側面に細い帯を並べて、一枚の塊に「節」を刻む。
 * 遠目でも胴の丸みと向きが読めるようになる。
 */
function addRibs(kit: CreatureKit, torso: THREE.Object3D, count: number, y0: number, y1: number, radius: number, tube: number): void {
  const p = kit.palette;
  for (let i = 0; i < count; i++) {
    const t = i / Math.max(1, count - 1);
    const y = y0 + (y1 - y0) * t;
    const r = radius * (0.82 + Math.sin((1 - t) * Math.PI * 0.6) * 0.22);
    const rib = kit.band(r, tube, Math.PI * 1.05, "plate", p.plate, 12);
    // 前(-Z)を向く半円にして、腹側にだけ節が出るようにする
    place(rib, 0, y, 0, Math.PI / 2, -Math.PI * 0.52, 0);
    torso.add(rib);
  }
}

/** 装甲板を重ねて貼る。段差の影が「積み木」感を消す主役 */
function addPlating(
  kit: CreatureKit,
  parent: THREE.Object3D,
  count: number,
  y0: number,
  y1: number,
  width: number,
  z: number,
  style: "metal" | "plate" = "metal",
): void {
  const p = kit.palette;
  const color = style === "metal" ? p.metal : p.plate;
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1);
    const y = y0 + (y1 - y0) * t;
    const w = width * (1 - t * 0.18);
    const plate = kit.lens(w, w * 0.34, w * 0.42, style, color, 10);
    place(plate, 0, y, z, -0.25 + t * 0.1, 0, 0);
    parent.add(plate);
  }
}

/** 頭の左右に光る目を置く。奥に暗い眼窩を入れて発光を締める */
function addEyes(kit: CreatureKit, head: THREE.Object3D, x: number, y: number, z: number, radius: number): void {
  for (const side of [-1, 1]) {
    head.add(place(kit.ball(radius * 1.9, radius * 1.5, radius * 0.8, "hide", kit.palette.dark), side * x, y, z + radius * 0.6));
    head.add(place(kit.ball(radius, radius * 0.85, radius, "glow", kit.palette.glow, 8), side * x, y, z));
  }
}

interface BeastHeadOptions {
  /** 頭蓋の半径(X, Y, Z) */
  skull: [number, number, number];
  /** 口先の長さ。0で無し */
  snout: number;
  /** 顎を開閉できるようにする */
  jaw: boolean;
  /** 角の生やし方 */
  horns: "none" | "swept" | "crown";
  /** 頭頂のトゲの数 */
  crest: number;
  eye: number;
  color?: THREE.Color;
}

/**
 * 獣型の頭。アタッカー/ボス/デバッファーで比率を変えて使い回し、
 * 「同じ世界のモンスター」としての統一感を出す。
 */
function addBeastHead(kit: CreatureKit, rig: CreatureRig, o: BeastHeadOptions): void {
  const p = kit.palette;
  const head = rig.head;
  const [sx, sy, sz] = o.skull;
  const skin = o.color ?? p.main;

  head.add(place(kit.ball(sx, sy, sz, "hide", skin), 0, sy * 0.9, -sz * 0.1));

  if (o.snout > 0) {
    head.add(place(kit.ball(sx * 0.66, sy * 0.6, o.snout * 0.6, "hide", skin), 0, sy * 0.72, -sz * 0.7 - o.snout * 0.3));
    head.add(place(kit.ball(sx * 0.44, sy * 0.4, sx * 0.44, "plate", p.plate), 0, sy * 0.66, -sz * 0.7 - o.snout * 0.72));
    // 上顎の牙
    for (const side of [-1, 1]) {
      const fang = kit.spike(sx * 0.13, sy * 0.5, 0.8, "plate", p.plate);
      place(fang, side * sx * 0.42, sy * 0.34, -sz * 0.7 - o.snout * 0.25, AIM_DOWN, 0, 0);
      head.add(fang);
    }
  }

  // 眉のプレート。目の上に影を落として表情を作る
  head.add(place(kit.box(sx * 1.7, sy * 0.3, sz * 0.8, "plate", p.plate), 0, sy * 1.28, -sz * 0.55, -0.3, 0, 0));

  addEyes(kit, head, sx * 0.6, sy * 0.98, -sz * 0.78, o.eye);

  if (o.jaw) {
    const jaw = new THREE.Group();
    place(jaw, 0, sy * 0.56, -sz * 0.3);
    markAnimated(jaw);
    jaw.add(place(kit.ball(sx * 0.6, sy * 0.3, (sz + o.snout) * 0.6, "hide", p.dark), 0, -sy * 0.1, -(sz + o.snout) * 0.42));
    for (const side of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        const tooth = kit.spike(sx * 0.1, sy * 0.34, 0.8, "plate", p.plate);
        place(tooth, side * sx * 0.36, 0, -(sz + o.snout) * (0.35 + i * 0.3));
        jaw.add(tooth);
      }
    }
    head.add(jaw);
    rig.jaw = jaw;
  }

  if (o.horns === "swept") {
    for (const side of [-1, 1]) {
      const base = new THREE.Vector3(side * sx * 0.66, sy * 1.2, sz * 0.1);
      const mid = new THREE.Vector3(side * sx * 1.25, sy * 1.75, sz * 0.9);
      const tip = new THREE.Vector3(side * sx * 1.5, sy * 1.7, sz * 2.0);
      head.add(kit.link(base, mid, sx * 0.26, sx * 0.17, "plate", p.plate, 6));
      head.add(kit.link(mid, tip, sx * 0.17, sx * 0.02, "plate", p.plate, 6));
    }
  } else if (o.horns === "crown") {
    const count = 6;
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1) - 0.5;
      const horn = kit.spike(sx * 0.2, sy * (1.5 - Math.abs(t) * 1.2), 0.85, "plate", p.plate);
      place(horn, t * sx * 1.7, sy * 1.35, sz * (0.1 + Math.abs(t) * 0.5), 0.5, 0, -t * 1.5);
      head.add(horn);
    }
  }

  for (let i = 0; i < o.crest; i++) {
    const t = i / Math.max(1, o.crest);
    const fin = kit.spike(sx * 0.16, sy * (0.7 - t * 0.35), 0.3, "plate", p.plate);
    place(fin, 0, sy * 1.35, sz * (0.2 + t * 0.55), 0.7, Math.PI / 2, 0);
    head.add(fin);
  }
}

/** 尾。節ごとにアニメーションできるよう連鎖として登録する */
function addTail(
  kit: CreatureKit,
  rig: CreatureRig,
  origin: [number, number, number],
  count: number,
  length: number,
  radius: number,
  baseAngle: number,
  curve: number,
  blade: boolean,
): void {
  const p = kit.palette;
  const specs = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    specs.push({
      len: length * (1 - t * 0.35),
      r0: radius * (1 - t * 0.85),
      r1: radius * (1 - (t + 1 / count) * 0.85),
      rot: [i === 0 ? baseAngle : curve, 0, 0] as [number, number, number],
    });
  }
  const chain = kit.chain(specs, "hide", p.main);
  chain.root.position.set(origin[0], origin[1], origin[2]);
  markAnimated(...chain.joints);
  for (let i = 0; i < chain.joints.length; i++) {
    rig.tail.push({ group: chain.joints[i], rest: chain.rests[i] });
    // 背びれ状のトゲを尾の上面に立てる
    if (i > 0 && i < chain.joints.length - 1) {
      const fin = kit.spike(radius * 0.28, length * 0.9 * (1 - i / count), 0.3, "plate", p.plate);
      place(fin, 0, -length * 0.3, 0, Math.PI, Math.PI / 2, 0);
      chain.joints[i].add(fin);
    }
  }
  if (blade) {
    const tip = kit.spike(radius * 0.5, length * 1.6, 0.35, "plate", p.plate);
    place(tip, 0, 0, 0, Math.PI, 0, 0);
    chain.tip.add(tip);
  }
  rig.pelvis.add(chain.root);
}

/**
 * 羽毛の翼。
 *
 * 針状の羽根を1点から放射させると、扇ではなく「ウニ」に見える。
 * 実際にそうなっていたので、次の3つで作り直した。
 *   1. 前縁に腕の骨を通し、羽根の付け根をその骨に沿って散らす
 *   2. 羽根は円錐ではなく、面積を持った木の葉形の板にする
 *   3. 角度は「外向き〜真下」の範囲に収め、上には向けない
 * さらに雨覆い(短い羽根)を手前に重ね、層の段差で厚みを出す。
 */
function addFeatherWing(kit: CreatureKit, wing: THREE.Object3D, side: number, count: number, length: number): void {
  const p = kit.palette;
  const s = side;
  const L = length;

  // 前縁の骨。肩→肘→手首→翼端と、弓なりに反りながら外へ伸びる
  const bone: THREE.Vector3[] = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(s * 0.28 * L, 0.15 * L, 0.02 * L),
    new THREE.Vector3(s * 0.60 * L, 0.23 * L, -0.01 * L),
    new THREE.Vector3(s * 0.88 * L, 0.19 * L, -0.04 * L),
  ];
  const spine = new THREE.CatmullRomCurve3(bone);
  wing.add(kit.taperedTube(bone, 0.05 * L, 0.014 * L, "fur", p.fur, 5, 8));
  // 肩の羽毛のかたまり
  wing.add(place(kit.ball(0.11 * L, 0.13 * L, 0.1 * L, "fur", p.fur, 10), s * 0.04 * L, 0.02 * L, 0.01 * L));

  const point = new THREE.Vector3();
  const rows: { u0: number; u1: number; len: number; color: THREE.Color; z: number; scale: number }[] = [
    // 風切羽: 前縁の外側半分から、外向き〜下向きに長く伸びる
    { u0: 0.22, u1: 0.99, len: 1, color: p.fur, z: -0.02, scale: 1 },
    // 雨覆い: 手前に重ねる短い羽根。段差の影で層に見せる
    { u0: 0.12, u1: 0.82, len: 0.42, color: p.dark, z: -0.05, scale: 0.85 },
  ];

  for (const row of rows) {
    const n = Math.max(3, Math.round(count * row.scale));
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1);
      spine.getPointAt(row.u0 + (row.u1 - row.u0) * t, point);
      const len = L * (0.30 + t * 0.30) * row.len;
      const feather = kit.feather(len, len * 0.19, "fur", row.color, 0.1);
      // 内側は真下へ、外側ほど外向きへ倒す(扇の要は肩ではなく前縁全体)
      const angle = 2.45 - t * 0.72;
      place(
        feather,
        point.x,
        point.y,
        point.z + row.z * L,
        0.12 - t * 0.2,
        -s * t * 0.28,
        -s * angle,
      );
      wing.add(feather);
    }
  }
}

/** 指の骨と膜で作るコウモリ翼(ボス用) */
function addBatWing(kit: CreatureKit, wing: THREE.Object3D, side: number, span: number): void {
  const p = kit.palette;
  const s = side;
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x * s * span, y * span, z * span);

  const shoulder = v(0, 0, 0);
  const elbow = v(0.5, 0.34, 0.1);
  const wrist = v(1.02, 0.5, 0.02);
  const fingers = [v(1.72, 0.42, 0.12), v(1.5, -0.16, 0.2), v(1.05, -0.6, 0.22), v(0.5, -0.72, 0.18)];

  // 腕の骨。付け根に筋肉の膨らみ、関節に球を入れて棒の直結を隠す
  wing.add(kit.link(shoulder, elbow, 0.075 * span, 0.06 * span, "plate", p.plate, 6));
  wing.add(kit.link(elbow, wrist, 0.06 * span, 0.045 * span, "plate", p.plate, 6));
  wing.add(place(kit.ball(0.1 * span, 0.09 * span, 0.09 * span, "hide", p.main, 8), shoulder.x, shoulder.y, shoulder.z));
  wing.add(place(kit.ball(0.065 * span, 0.06 * span, 0.06 * span, "hide", p.dark, 7), elbow.x, elbow.y, elbow.z));
  wing.add(place(kit.ball(0.055 * span, 0.05 * span, 0.05 * span, "plate", p.plate, 7), wrist.x, wrist.y, wrist.z));
  for (const finger of fingers) {
    wing.add(kit.link(wrist, finger, 0.04 * span, 0.012 * span, "plate", p.plate, 5));
    // 指の関節。膜の張った骨組みが節を持って見える
    const mid = wrist.clone().lerp(finger, 0.42);
    wing.add(place(kit.ball(0.028 * span, 0.028 * span, 0.022 * span, "plate", p.plate, 6), mid.x, mid.y, mid.z));
  }
  // 指の先の鉤爪
  const hook = kit.spike(0.04 * span, 0.2 * span, 0.6, "plate", p.plate);
  place(hook, fingers[0].x, fingers[0].y, fingers[0].z, 0, 0, -s * 1.2);
  wing.add(hook);

  const points = [shoulder, elbow, wrist, ...fingers, shoulder];
  const membrane = kit.membrane(
    (shape) => {
      shape.moveTo(points[0].x, points[0].y);
      shape.lineTo(points[1].x, points[1].y);
      shape.lineTo(points[2].x, points[2].y);
      for (let i = 3; i < points.length; i++) {
        const previous = points[i - 1];
        const current = points[i];
        // 指の間を内側へえぐって、コウモリ翼らしい scalloped な縁にする
        const mx = (previous.x + current.x) * 0.5 * 0.82;
        const my = (previous.y + current.y) * 0.5 * 0.82;
        shape.quadraticCurveTo(mx, my, current.x, current.y);
      }
    },
    "membrane",
    p.membrane,
    -0.08 / span,
  );
  wing.add(membrane);
}

/** アタッカー: 前傾した四足獣。低く長く、棘と牙で「速そう」に見せる */
function buildAttacker(kit: CreatureKit, rig: CreatureRig): void {
  const p = kit.palette;
  rig.pelvis.position.y = 1.12;
  rig.pelvis.add(place(kit.ball(0.28, 0.26, 0.34, "hide", p.main), 0, 0, 0.08));

  for (const side of [-1, 1]) {
    const leg = kit.chain(
      [
        { len: 0.44, r0: 0.17, r1: 0.12, rot: [0.36, 0, 0] },
        { len: 0.42, r0: 0.12, r1: 0.085, rot: [-0.88, 0, 0] },
        { len: 0.26, r0: 0.085, r1: 0.06, rot: [0.7, 0, 0] },
      ],
      "hide",
      p.main,
    );
    leg.root.position.set(side * 0.24, -0.02, 0.08);
    leg.tip.add(place(kit.ball(0.09, 0.05, 0.13, "hide", p.dark), 0, -0.02, -0.05));
    addClaws(kit, leg.tip, 3, 0.16, 0.035, 0.07);
    rig.pelvis.add(leg.root);
    rig.legs.push(limbFrom(leg, side, side * 0.9));
  }

  const torso = rig.torso;
  place(torso, 0, 0.04, -0.04, -0.3, 0, 0);
  torso.add(place(kit.ball(0.32, 0.30, 0.36, "hide", p.main), 0, 0.16, 0));
  torso.add(place(kit.ball(0.38, 0.32, 0.38, "hide", p.main), 0, 0.52, -0.04));
  torso.add(place(kit.ball(0.30, 0.20, 0.24, "hide", p.dark), 0, 0.30, -0.24));
  for (const side of [-1, 1]) {
    torso.add(place(kit.ball(0.15, 0.19, 0.16, "hide", p.main), side * 0.3, 0.6, 0.02));
  }
  // 背骨の棘。真後ろから見た時のシルエットを作る主役
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const height = 0.14 + Math.sin(t * Math.PI) * 0.2;
    const fin = kit.spike(0.05, height, 0.3, "plate", p.plate);
    place(fin, 0, 0.1 + i * 0.13, 0.26 - t * 0.04, 0.55, Math.PI / 2, 0);
    torso.add(fin);
  }

  place(rig.neck, 0, 0.72, -0.14, -0.52, 0, 0);
  rig.neck.add(kit.link({ x: 0, y: 0, z: 0 }, { x: 0, y: 0.3, z: 0 }, 0.15, 0.11, "hide", p.main));
  place(rig.head, 0, 0.3, 0, 0.8, 0, 0);
  addBeastHead(kit, rig, { skull: [0.16, 0.15, 0.19], snout: 0.26, jaw: true, horns: "swept", crest: 0, eye: 0.045 });

  for (const side of [-1, 1]) {
    const arm = kit.chain(
      [
        { len: 0.3, r0: 0.11, r1: 0.09, rot: [0.62, 0, side * 0.34] },
        { len: 0.28, r0: 0.085, r1: 0.06, rot: [-0.95, 0, 0] },
      ],
      "hide",
      p.main,
    );
    arm.root.position.set(side * 0.28, 0.5, -0.12);
    arm.tip.add(place(kit.ball(0.075, 0.06, 0.09, "hide", p.dark), 0, -0.03, -0.02));
    addClaws(kit, arm.tip, 3, 0.19, 0.032, 0.075);
    rig.torso.add(arm.root);
    rig.arms.push(limbFrom(arm, side, side * 1.4));
  }

  addTail(kit, rig, [0, 0.06, 0.26], 6, 0.21, 0.11, -1.7, -0.1, true);

  rig.anim = {
    idleSpeed: 1.35,
    breath: 1,
    bob: 0.03,
    headSway: 1.3,
    tailWave: 1.4,
    wingFlap: 0,
    sway: 1.1,
    lunge: 1.45,
    attack: "lunge",
  };
}

/** ディフェンダー: 岩の巨人。低い頭と巨大な肩・腕で「硬くて重い」を伝える */
function buildDefender(kit: CreatureKit, rig: CreatureRig): void {
  const p = kit.palette;
  rig.pelvis.position.y = 1.0;
  rig.pelvis.add(place(kit.rock(0.46, 0.28, 0.38, "hide", p.main, 0.22), 0, -0.02, 0));

  for (const side of [-1, 1]) {
    const leg = kit.chain(
      [
        { len: 0.4, r0: 0.26, r1: 0.22, rot: [0.12, 0, side * 0.06], radial: 7 },
        { len: 0.42, r0: 0.22, r1: 0.24, rot: [-0.14, 0, 0], radial: 7 },
      ],
      "hide",
      p.main,
    );
    leg.root.position.set(side * 0.32, -0.06, 0);
    leg.tip.add(place(kit.rock(0.26, 0.13, 0.32, "hide", p.dark, 0.2), 0, -0.06, -0.06));
    rig.pelvis.add(leg.root);
    rig.legs.push(limbFrom(leg, side, side * 0.6));
  }

  const torso = rig.torso;
  place(torso, 0, 0.06, 0, -0.1, 0, 0);
  torso.add(place(kit.rock(0.58, 0.5, 0.46, "hide", p.main, 0.2), 0, 0.5, 0));
  torso.add(place(kit.rock(0.44, 0.26, 0.3, "hide", p.main, 0.25), 0, 0.88, 0.14));
  // 胸の動力コア
  torso.add(place(kit.octa(0.15, 0.22, 0.15, "crystal", p.accent), 0, 0.52, -0.44));
  torso.add(place(kit.octa(0.07, 0.12, 0.07, "glow", p.glow), 0, 0.52, -0.46));
  // 背中に生えた岩の柱
  for (let i = 0; i < 4; i++) {
    const t = i / 3;
    const shard = kit.octa(0.09, 0.3 - t * 0.1, 0.09, "crystal", p.accent);
    place(shard, (t - 0.5) * 0.62, 0.82 + Math.sin(t * Math.PI) * 0.12, 0.3, 0.5, 0, (t - 0.5) * 1.3);
    torso.add(shard);
  }

  for (const side of [-1, 1]) {
    // 肩の岩塊と、そこから突き出す棘
    torso.add(place(kit.rock(0.32, 0.3, 0.32, "plate", p.plate, 0.24), side * 0.64, 0.76, 0));
    for (let i = 0; i < 3; i++) {
      const spike = kit.spike(0.07, 0.26 - i * 0.04, 0.8, "plate", p.plate);
      place(spike, side * 0.68, 0.92, -0.16 + i * 0.18, -0.3 + i * 0.25, 0, -side * 0.7);
      torso.add(spike);
    }

    const arm = kit.chain(
      [
        { len: 0.48, r0: 0.23, r1: 0.19, rot: [0.14, 0, side * 0.14], radial: 7 },
        { len: 0.46, r0: 0.19, r1: 0.2, rot: [-0.2, 0, 0], radial: 7 },
      ],
      "hide",
      p.main,
    );
    arm.root.position.set(side * 0.64, 0.7, 0);
    arm.tip.add(place(kit.rock(0.26, 0.24, 0.26, "hide", p.main, 0.22), 0, -0.16, -0.02));
    for (let i = -1; i <= 1; i++) {
      const knuckle = kit.spike(0.06, 0.14, 0.9, "plate", p.plate);
      place(knuckle, i * 0.11, -0.16, -0.2, AIM_FORWARD, 0, 0);
      arm.tip.add(knuckle);
    }
    rig.torso.add(arm.root);
    rig.arms.push(limbFrom(arm, side, side * 0.8));
  }

  place(rig.neck, 0, 0.86, -0.08, -0.12, 0, 0);
  place(rig.head, 0, 0.06, 0, 0.22, 0, 0);
  rig.head.add(place(kit.rock(0.24, 0.21, 0.24, "hide", p.main, 0.2), 0, 0.12, 0));
  rig.head.add(place(kit.box(0.3, 0.06, 0.05, "glow", p.glow), 0, 0.12, -0.2));
  rig.head.add(place(kit.box(0.36, 0.12, 0.2, "plate", p.plate), 0, 0.24, -0.1, -0.2, 0, 0));
  for (const side of [-1, 1]) {
    const horn = kit.spike(0.07, 0.28, 0.85, "plate", p.plate);
    place(horn, side * 0.18, 0.22, 0.06, 0.3, 0, -side * 0.8);
    rig.head.add(horn);
  }

  rig.anim = {
    idleSpeed: 0.62,
    breath: 1.35,
    bob: 0.02,
    headSway: 0.45,
    tailWave: 0,
    wingFlap: 0,
    sway: 0.6,
    lunge: 0.8,
    attack: "slam",
  };
}

/** ヒーラー: 脚を持たず浮遊する衣の存在。翼と光輪で優美さを出す */
function buildHealer(kit: CreatureKit, rig: CreatureRig): void {
  const p = kit.palette;
  rig.floats = true;
  rig.pelvis.position.y = 1.05;

  // ローブ(下端は開いたまま=足が無いことを強調する)
  rig.pelvis.add(
    kit.lathe(
      [
        [0.24, 0.1],
        [0.3, -0.14],
        [0.36, -0.46],
        [0.46, -0.78],
        [0.54, -1.0],
      ],
      "membrane",
      p.membrane,
      20,
    ),
  );
  // 裾の飾り
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const petal = kit.spike(0.075, 0.24, 0.35, "membrane", p.membrane);
    place(petal, Math.cos(angle) * 0.5, -0.98, Math.sin(angle) * 0.5, 0, -angle, 0);
    petal.rotation.x = Math.PI - 0.25;
    rig.pelvis.add(petal);
  }
  rig.pelvis.add(place(kit.ring(0.3, 0.028, "plate", p.plate), 0, 0.06, 0, Math.PI / 2, 0, 0));

  const torso = rig.torso;
  place(torso, 0, 0.06, 0, -0.05, 0, 0);
  torso.add(place(kit.ball(0.2, 0.26, 0.16, "hide", p.main), 0, 0.2, 0));
  torso.add(place(kit.ball(0.22, 0.16, 0.18, "hide", p.dark), 0, 0.34, -0.05));
  // 肩を覆う衣
  torso.add(
    place(
      kit.lathe(
        [
          [0.16, 0.5],
          [0.34, 0.34],
          [0.46, 0.12],
        ],
        "membrane",
        p.membrane,
        18,
      ),
      0,
      0,
      0,
    ),
  );
  torso.add(place(kit.octa(0.07, 0.1, 0.05, "glow", p.glow), 0, 0.36, -0.16));

  for (const side of [-1, 1]) {
    const arm = kit.chain(
      [
        { len: 0.28, r0: 0.07, r1: 0.055, rot: [0.2, 0, side * 0.75] },
        { len: 0.26, r0: 0.055, r1: 0.045, rot: [0.35, 0, -side * 0.35] },
      ],
      "hide",
      p.main,
    );
    arm.root.position.set(side * 0.2, 0.38, -0.02);
    arm.tip.add(place(kit.ball(0.055, 0.05, 0.055, "hide", p.dark), 0, -0.03, 0));
    // 長い袖。受動的に揺れる布として登録する
    const sleeve = new THREE.Group();
    markAnimated(sleeve);
    sleeve.add(
      kit.lathe(
        [
          [0.08, 0],
          [0.14, -0.2],
          [0.2, -0.46],
        ],
        "membrane",
        p.membrane,
        12,
      ),
    );
    arm.joints[1].add(sleeve);
    rig.cloth.push({ group: sleeve, rest: sleeve.rotation.clone(), phase: side, amount: 1 });
    rig.torso.add(arm.root);
    rig.arms.push(limbFrom(arm, side, side * 1.2));
  }

  place(rig.neck, 0, 0.5, -0.02, -0.02, 0, 0);
  place(rig.head, 0, 0.1, 0, 0.06, 0, 0);
  rig.head.add(place(kit.ball(0.15, 0.17, 0.15, "hide", p.dark), 0, 0.1, 0));
  // フード
  rig.head.add(place(kit.ball(0.19, 0.2, 0.21, "membrane", p.membrane), 0, 0.14, 0.05));
  rig.head.add(place(kit.spike(0.11, 0.34, 0.6, "membrane", p.membrane), 0, 0.2, 0.14, 0.9, 0, 0));
  addEyes(kit, rig.head, 0.06, 0.1, -0.13, 0.028);
  // 光輪
  const halo = kit.ring(0.22, 0.022, "glow", p.glow, 28);
  place(halo, 0, 0.42, 0.06, Math.PI / 2, 0, 0);
  rig.head.add(halo);
  rig.spinners.push({ object: halo, axis: "z", speed: 0.6 });

  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    markAnimated(wing);
    place(wing, side * 0.18, 0.34, 0.12, 0.2, -side * 0.35, 0);
    addFeatherWing(kit, wing, side, 6, 1.15);
    rig.torso.add(wing);
    rig.wings.push({ root: wing, rootRest: wing.rotation.clone(), lower: null, lowerRest: null, tip: wing, side, phase: 0 });
  }

  rig.anim = {
    idleSpeed: 0.85,
    breath: 0.8,
    bob: 0.075,
    headSway: 0.8,
    tailWave: 0,
    wingFlap: 0.5,
    sway: 0.5,
    lunge: 0.55,
    attack: "cast",
  };
}

/** サポート: 幾何学的な結晶体。左右対称の菱形スタックと回転する環 */
function buildSupport(kit: CreatureKit, rig: CreatureRig): void {
  const p = kit.palette;
  rig.floats = true;
  rig.pelvis.position.y = 0.95;

  // 下へ細くなる結晶のスタック
  const stack: [number, number, number][] = [
    [0.2, 0.3, 0.2],
    [0.13, 0.22, 0.13],
    [0.07, 0.14, 0.07],
  ];
  stack.forEach((size, index) => {
    const shard = kit.octa(size[0], size[1], size[2], "crystal", p.main);
    place(shard, 0, -0.18 - index * 0.3, 0, 0, index * 0.5, 0);
    rig.pelvis.add(shard);
  });

  const torso = rig.torso;
  place(torso, 0, 0.2, 0);
  torso.add(place(kit.octa(0.34, 0.56, 0.34, "crystal", p.main), 0, 0.1, 0));
  torso.add(place(kit.octa(0.15, 0.3, 0.15, "glow", p.glow), 0, 0.1, 0));
  torso.add(place(kit.octa(0.2, 0.34, 0.2, "crystal", p.accent), 0, 0.1, -0.14, 0, 0.6, 0));

  // 肩にあたる大きな板。攻撃時に前へ突き出す
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    markAnimated(shoulder);
    place(shoulder, side * 0.42, 0.22, 0.02, 0, 0, -side * 0.3);
    shoulder.add(place(kit.octa(0.08, 0.42, 0.05, "crystal", p.accent), 0, 0, 0));
    shoulder.add(place(kit.octa(0.05, 0.26, 0.035, "crystal", p.accent), side * 0.16, -0.12, 0.06, 0, 0, -side * 0.25));
    torso.add(shoulder);
    rig.arms.push({ root: shoulder, rootRest: shoulder.rotation.clone(), lower: null, lowerRest: null, tip: shoulder, side, phase: side });
  }

  // 水平の環と斜めの環
  const ring1 = kit.ring(0.66, 0.022, "glow", p.glow, 32);
  place(ring1, 0, 0.1, 0, Math.PI / 2, 0, 0);
  torso.add(ring1);
  rig.spinners.push({ object: ring1, axis: "z", speed: 0.5 });

  const ring2 = kit.ring(0.5, 0.018, "crystal", p.accent, 28);
  place(ring2, 0, 0.16, 0, 0.5, 0.4, 0);
  torso.add(ring2);
  rig.spinners.push({ object: ring2, axis: "y", speed: -0.8 });

  place(rig.neck, 0, 0.62, 0);
  place(rig.head, 0, 0.14, 0);
  rig.head.add(place(kit.octa(0.19, 0.2, 0.19, "crystal", p.plate), 0, 0, 0));
  rig.head.add(place(kit.box(0.22, 0.035, 0.03, "glow", p.glow), 0, 0.0, -0.16));
  for (let i = 0; i < 3; i++) {
    const crown = kit.octa(0.045, 0.18, 0.045, "crystal", p.accent);
    place(crown, (i - 1) * 0.14, 0.24, 0.02, 0, 0, (i - 1) * -0.45);
    rig.head.add(crown);
  }

  // 周囲を漂う小結晶
  for (let i = 0; i < 5; i++) {
    const shard = kit.octa(0.06, 0.14, 0.06, "crystal", p.accent);
    rig.core.add(shard);
    rig.orbiters.push({
      object: shard,
      radius: 0.85 + Math.random() * 0.3,
      height: 0.7 + Math.random() * 1.1,
      speed: 0.5 + Math.random() * 0.35,
      phase: (i / 5) * Math.PI * 2,
      tilt: (Math.random() - 0.5) * 0.5,
      spin: 1.2,
    });
  }

  rig.anim = {
    idleSpeed: 0.7,
    breath: 0.4,
    bob: 0.06,
    headSway: 0.35,
    tailWave: 0,
    wingFlap: 0,
    sway: 0.3,
    lunge: 0.7,
    attack: "cast",
  };
}

/** デバッファー: 左右非対称に歪んだ、棘だらけの不吉な影 */
function buildDebuffer(kit: CreatureKit, rig: CreatureRig): void {
  const p = kit.palette;
  rig.pelvis.position.y = 1.05;
  rig.pelvis.add(place(kit.ball(0.22, 0.2, 0.26, "hide", p.dark), 0, 0, 0.06));

  for (const side of [-1, 1]) {
    const leg = kit.chain(
      [
        { len: 0.42, r0: 0.11, r1: 0.08, rot: [0.45, 0, side * 0.12], radial: 6 },
        { len: 0.4, r0: 0.08, r1: 0.055, rot: [-1.0, 0, 0], radial: 6 },
        { len: 0.24, r0: 0.055, r1: 0.04, rot: [0.72, 0, 0], radial: 6 },
      ],
      "hide",
      p.dark,
    );
    leg.root.position.set(side * 0.19, -0.02, 0.06);
    addClaws(kit, leg.tip, 3, 0.15, 0.028, 0.06);
    rig.pelvis.add(leg.root);
    rig.legs.push(limbFrom(leg, side, side * 1.1));
  }

  const torso = rig.torso;
  place(torso, 0, 0.02, -0.02, -0.6, 0, 0.05);
  torso.add(place(kit.ball(0.24, 0.26, 0.24, "hide", p.main), 0, 0.16, 0));
  // 背中の瘤(最高点)
  torso.add(place(kit.ball(0.32, 0.3, 0.3, "hide", p.main), 0, 0.5, 0.08));
  torso.add(place(kit.ball(0.24, 0.2, 0.2, "hide", p.dark), 0, 0.34, -0.16));
  // 不規則に突き出す棘
  const spikes = 11;
  for (let i = 0; i < spikes; i++) {
    const t = i / (spikes - 1);
    const angle = -1.1 + t * 2.2;
    const length = 0.26 + Math.abs(Math.sin(i * 2.7)) * 0.34;
    const spike = kit.spike(0.045, length, 0.55, "plate", p.plate);
    place(
      spike,
      Math.sin(angle) * 0.24,
      0.34 + Math.cos(i * 1.9) * 0.2,
      0.16 + Math.abs(Math.cos(angle)) * 0.1,
      0.5 + Math.sin(i * 3.1) * 0.4,
      0,
      -angle,
    );
    torso.add(spike);
  }
  // ぼろ布
  for (const side of [-1, 1]) {
    const rag = new THREE.Group();
    markAnimated(rag);
    place(rag, side * 0.24, 0.42, 0.12, 0.25, 0, side * 0.2);
    for (let i = 0; i < 3; i++) {
      const strip = kit.spike(0.08 - i * 0.015, 0.5 + i * 0.12, 0.25, "membrane", p.membrane);
      place(strip, side * i * 0.05, 0, i * 0.04, 0, 0, Math.PI + side * 0.2 * i);
      rag.add(strip);
    }
    rig.torso.add(rag);
    rig.cloth.push({ group: rag, rest: rag.rotation.clone(), phase: side * 1.3, amount: 0.8 });
  }

  place(rig.neck, 0, 0.6, -0.18, -0.95, 0, 0);
  rig.neck.add(kit.link({ x: 0, y: 0, z: 0 }, { x: 0, y: 0.26, z: 0 }, 0.1, 0.08, "hide", p.dark));
  place(rig.head, 0, 0.26, 0, 1.42, 0, 0);
  addBeastHead(kit, rig, {
    skull: [0.13, 0.12, 0.2],
    snout: 0.18,
    jaw: true,
    horns: "crown",
    crest: 0,
    eye: 0.035,
    color: p.dark,
  });
  // 中央の大きな一つ目
  rig.head.add(place(kit.ball(0.07, 0.06, 0.05, "glow", p.glow, 10), 0, 0.16, -0.19));

  // 左右で長さの違う腕(非対称=歪んだ印象)
  for (const side of [-1, 1]) {
    const long = side > 0;
    const arm = kit.chain(
      [
        { len: long ? 0.42 : 0.26, r0: 0.085, r1: 0.065, rot: [long ? 0.85 : 0.4, 0, side * 0.5], radial: 6 },
        { len: long ? 0.46 : 0.24, r0: 0.065, r1: 0.045, rot: [long ? -0.5 : -0.9, 0, 0], radial: 6 },
      ],
      "hide",
      p.dark,
    );
    arm.root.position.set(side * 0.25, 0.44, -0.04);
    addClaws(kit, arm.tip, 3, long ? 0.3 : 0.14, 0.03, long ? 0.075 : 0.05);
    rig.torso.add(arm.root);
    rig.arms.push(limbFrom(arm, side, side * 1.7));
  }

  addTail(kit, rig, [0, 0.04, 0.2], 6, 0.18, 0.07, -1.35, -0.22, true);

  rig.anim = {
    idleSpeed: 1.05,
    breath: 0.9,
    bob: 0.045,
    headSway: 1.5,
    tailWave: 1.6,
    wingFlap: 0,
    sway: 1.3,
    lunge: 1.1,
    attack: "cast",
  };
}

/** バランス型: 剣とマントを持つ人型の戦士。読みやすい直立シルエット */
function buildBalanced(kit: CreatureKit, rig: CreatureRig): void {
  const p = kit.palette;
  rig.pelvis.position.y = 1.1;
  rig.pelvis.add(place(kit.box(0.34, 0.2, 0.26, "plate", p.plate), 0, -0.02, 0));

  for (const side of [-1, 1]) {
    const leg = kit.chain(
      [
        { len: 0.46, r0: 0.14, r1: 0.11, rot: [0.1, 0, side * 0.05] },
        { len: 0.44, r0: 0.11, r1: 0.09, rot: [-0.16, 0, 0] },
      ],
      "hide",
      p.main,
    );
    leg.root.position.set(side * 0.17, -0.06, 0);
    leg.joints[1].add(place(kit.box(0.15, 0.3, 0.14, "plate", p.plate), 0, -0.16, -0.02));
    leg.tip.add(place(kit.box(0.15, 0.08, 0.3, "plate", p.plate), 0, -0.04, -0.06));
    rig.pelvis.add(leg.root);
    rig.legs.push(limbFrom(leg, side, side * 0.7));
  }

  const torso = rig.torso;
  place(torso, 0, 0.08, 0, -0.06, 0, 0);
  torso.add(place(kit.ball(0.3, 0.34, 0.22, "hide", p.main), 0, 0.28, 0));
  torso.add(place(kit.ball(0.32, 0.26, 0.16, "plate", p.plate), 0, 0.34, -0.12));
  torso.add(place(kit.octa(0.07, 0.1, 0.05, "glow", p.glow), 0, 0.42, -0.2));
  torso.add(place(kit.box(0.5, 0.1, 0.22, "plate", p.plate), 0, 0.56, 0));

  for (const side of [-1, 1]) {
    torso.add(place(kit.rock(0.19, 0.16, 0.19, "plate", p.plate, 0.12), side * 0.38, 0.56, 0));
    const pauldronSpike = kit.spike(0.06, 0.22, 0.7, "plate", p.plate);
    place(pauldronSpike, side * 0.42, 0.6, 0.02, 0.2, 0, -side * 0.9);
    torso.add(pauldronSpike);

    const arm = kit.chain(
      [
        { len: 0.36, r0: 0.1, r1: 0.08, rot: [0.12, 0, side * 0.2] },
        { len: 0.34, r0: 0.08, r1: 0.07, rot: [-0.45, 0, 0] },
      ],
      "hide",
      p.main,
    );
    arm.root.position.set(side * 0.38, 0.5, 0);
    arm.tip.add(place(kit.box(0.1, 0.1, 0.12, "plate", p.plate), 0, -0.04, -0.01));
    rig.torso.add(arm.root);
    rig.arms.push(limbFrom(arm, side, side * 0.9));

    if (side > 0) {
      // 右手の剣。役割が一目で分かるシルエットの要
      const sword = new THREE.Group();
      place(sword, 0, -0.05, -0.02, -0.5, 0, 0);
      sword.add(place(kit.box(0.24, 0.05, 0.06, "plate", p.plate), 0, 0.04, 0));
      sword.add(place(kit.box(0.05, 0.16, 0.05, "hide", p.dark), 0, -0.06, 0));
      sword.add(place(kit.spike(0.075, 0.92, 0.3, "plate", p.plate), 0, 0.06, 0, 0, Math.PI / 2, 0));
      sword.add(place(kit.octa(0.04, 0.05, 0.03, "glow", p.glow), 0, 0.06, 0));
      arm.tip.add(sword);
    }
  }

  // マント
  const cape = new THREE.Group();
  markAnimated(cape);
  place(cape, 0, 0.58, 0.14, 0.12, 0, 0);
  cape.add(
    kit.membrane(
      (shape) => {
        shape.moveTo(-0.3, 0);
        shape.lineTo(0.3, 0);
        shape.lineTo(0.42, -1.05);
        shape.quadraticCurveTo(0.0, -0.92, -0.42, -1.05);
      },
      "membrane",
      p.membrane,
      0.5,
    ),
  );
  rig.torso.add(cape);
  rig.cloth.push({ group: cape, rest: cape.rotation.clone(), phase: 0, amount: 1 });

  place(rig.neck, 0, 0.66, -0.02, -0.04, 0, 0);
  place(rig.head, 0, 0.12, 0, 0.1, 0, 0);
  rig.head.add(place(kit.ball(0.15, 0.16, 0.15, "hide", p.dark), 0, 0.08, 0));
  rig.head.add(place(kit.ball(0.17, 0.15, 0.17, "plate", p.plate), 0, 0.14, 0.02));
  rig.head.add(place(kit.box(0.22, 0.14, 0.1, "plate", p.plate), 0, 0.04, -0.1, 0.1, 0, 0));
  rig.head.add(place(kit.box(0.17, 0.035, 0.04, "glow", p.glow), 0, 0.09, -0.16));
  for (let i = 0; i < 3; i++) {
    const crest = kit.spike(0.05, 0.26 - i * 0.06, 0.28, "plate", p.plate);
    place(crest, 0, 0.24, 0.02 + i * 0.1, 0.35 + i * 0.2, Math.PI / 2, 0);
    rig.head.add(crest);
  }
  for (const side of [-1, 1]) {
    const horn = kit.spike(0.04, 0.2, 0.7, "plate", p.plate);
    place(horn, side * 0.15, 0.16, 0.02, 0.2, 0, -side * 1.0);
    rig.head.add(horn);
  }

  rig.anim = {
    idleSpeed: 1,
    breath: 1,
    bob: 0.03,
    headSway: 0.9,
    tailWave: 0,
    wingFlap: 0,
    sway: 1,
    lunge: 1.2,
    attack: "lunge",
  };
}

/** ボス: 角の王冠とコウモリ翼を持つ巨躯。他より一回り大きく威圧する */
function buildBoss(kit: CreatureKit, rig: CreatureRig): void {
  const p = kit.palette;
  rig.pelvis.position.y = 1.35;
  rig.pelvis.add(place(kit.ball(0.46, 0.34, 0.42, "hide", p.main), 0, -0.04, 0.04));
  rig.pelvis.add(place(kit.box(0.62, 0.16, 0.4, "plate", p.plate), 0, 0.02, -0.04));

  for (const side of [-1, 1]) {
    const leg = kit.chain(
      [
        { len: 0.5, r0: 0.24, r1: 0.18, rot: [0.4, 0, side * 0.1] },
        { len: 0.48, r0: 0.17, r1: 0.13, rot: [-0.85, 0, 0] },
        { len: 0.3, r0: 0.13, r1: 0.11, rot: [0.62, 0, 0] },
      ],
      "hide",
      p.main,
    );
    leg.root.position.set(side * 0.34, -0.06, 0.04);
    // 蹄
    leg.tip.add(place(kit.ball(0.16, 0.12, 0.22, "plate", p.plate), 0, -0.06, -0.06));
    rig.pelvis.add(leg.root);
    rig.legs.push(limbFrom(leg, side, side * 0.8));
  }

  const torso = rig.torso;
  place(torso, 0, 0.06, -0.02, -0.16, 0, 0);
  torso.add(place(kit.ball(0.46, 0.38, 0.42, "hide", p.main), 0, 0.2, 0));
  torso.add(place(kit.ball(0.6, 0.5, 0.46, "hide", p.main), 0, 0.66, -0.02));
  torso.add(place(kit.ball(0.46, 0.3, 0.26, "plate", p.plate), 0, 0.72, -0.3));
  torso.add(place(kit.octa(0.14, 0.2, 0.12, "crystal", p.accent), 0, 0.68, -0.46));
  torso.add(place(kit.octa(0.07, 0.11, 0.06, "glow", p.glow), 0, 0.68, -0.48));
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const fin = kit.spike(0.07, 0.2 + Math.sin(t * Math.PI) * 0.24, 0.3, "plate", p.plate);
    place(fin, 0, 0.16 + i * 0.18, 0.32 - t * 0.02, 0.5, Math.PI / 2, 0);
    torso.add(fin);
  }

  for (const side of [-1, 1]) {
    torso.add(place(kit.rock(0.32, 0.28, 0.3, "plate", p.plate, 0.16), side * 0.68, 0.86, 0));
    for (let i = 0; i < 3; i++) {
      const spike = kit.spike(0.075, 0.34 - i * 0.06, 0.8, "plate", p.plate);
      place(spike, side * 0.72, 1.0, -0.18 + i * 0.2, -0.4 + i * 0.3, 0, -side * 0.6);
      torso.add(spike);
    }

    const arm = kit.chain(
      [
        { len: 0.5, r0: 0.2, r1: 0.16, rot: [0.35, 0, side * 0.3] },
        { len: 0.5, r0: 0.16, r1: 0.12, rot: [-0.7, 0, 0] },
      ],
      "hide",
      p.main,
    );
    arm.root.position.set(side * 0.68, 0.8, 0);
    arm.tip.add(place(kit.ball(0.16, 0.14, 0.16, "hide", p.main), 0, -0.08, -0.02));
    addClaws(kit, arm.tip, 3, 0.3, 0.05, 0.12);
    rig.torso.add(arm.root);
    rig.arms.push(limbFrom(arm, side, side * 1.1));

    const wing = new THREE.Group();
    markAnimated(wing);
    place(wing, side * 0.42, 0.9, 0.26, 0.25, -side * 0.5, side * 0.15);
    addBatWing(kit, wing, side, 1.15);
    rig.torso.add(wing);
    rig.wings.push({ root: wing, rootRest: wing.rotation.clone(), lower: null, lowerRest: null, tip: wing, side, phase: 0 });
  }

  place(rig.neck, 0, 1.0, -0.14, -0.35, 0, 0);
  rig.neck.add(kit.link({ x: 0, y: 0, z: 0 }, { x: 0, y: 0.24, z: 0 }, 0.22, 0.17, "hide", p.main));
  place(rig.head, 0, 0.24, 0, 0.5, 0, 0);
  addBeastHead(kit, rig, { skull: [0.24, 0.22, 0.28], snout: 0.3, jaw: true, horns: "crown", crest: 3, eye: 0.055 });
  // 王冠のように後光を背負わせる
  const halo = kit.ring(0.52, 0.03, "crystal", p.accent, 26);
  place(halo, 0, 0.4, 0.34, -0.35, 0, 0);
  rig.head.add(halo);
  rig.spinners.push({ object: halo, axis: "z", speed: -0.35 });

  addTail(kit, rig, [0, 0.06, 0.34], 7, 0.26, 0.16, -1.5, -0.05, true);

  rig.anim = {
    idleSpeed: 0.65,
    breath: 1.4,
    bob: 0.035,
    headSway: 0.7,
    tailWave: 1.1,
    wingFlap: 0.28,
    sway: 0.7,
    lunge: 1.0,
    attack: "slam",
  };
}

/** 素材: 小さくコミカルな二頭身。頭と目が大きく、脅威に見えない */
function buildCritter(kit: CreatureKit, rig: CreatureRig): void {
  const p = kit.palette;
  rig.pelvis.position.y = 0.46;
  rig.pelvis.add(place(kit.ball(0.34, 0.3, 0.32, "hide", p.main), 0, 0, 0));
  rig.pelvis.add(place(kit.ball(0.24, 0.2, 0.16, "hide", p.dark), 0, -0.06, -0.22));

  for (const side of [-1, 1]) {
    const leg = kit.chain([{ len: 0.28, r0: 0.1, r1: 0.09, rot: [0.06, 0, side * 0.16], radial: 7 }], "hide", p.main);
    leg.root.position.set(side * 0.17, -0.16, 0);
    leg.tip.add(place(kit.ball(0.11, 0.06, 0.15, "hide", p.dark), 0, -0.02, -0.05));
    rig.pelvis.add(leg.root);
    rig.legs.push(limbFrom(leg, side, side * 1.5));
  }

  const torso = rig.torso;
  place(torso, 0, 0.1, 0);
  for (const side of [-1, 1]) {
    const arm = kit.chain([{ len: 0.22, r0: 0.075, r1: 0.06, rot: [0.2, 0, side * 0.55], radial: 7 }], "hide", p.main);
    arm.root.position.set(side * 0.28, 0.06, -0.02);
    arm.tip.add(place(kit.ball(0.075, 0.07, 0.075, "hide", p.dark), 0, -0.02, 0));
    torso.add(arm.root);
    rig.arms.push(limbFrom(arm, side, side * 2.1));
  }

  place(rig.neck, 0, 0.14, 0);
  place(rig.head, 0, 0.06, 0);
  const head = rig.head;
  head.add(place(kit.ball(0.36, 0.33, 0.34, "hide", p.main), 0, 0.28, 0));
  // 大きな目とハイライト
  for (const side of [-1, 1]) {
    head.add(place(kit.ball(0.11, 0.13, 0.06, "hide", p.dark), side * 0.14, 0.3, -0.3));
    head.add(place(kit.ball(0.075, 0.09, 0.04, "glow", p.glow, 10), side * 0.14, 0.3, -0.32));
  }
  head.add(place(kit.ball(0.06, 0.04, 0.04, "hide", p.dark), 0, 0.18, -0.33));
  // 触角
  const antenna = kit.link({ x: 0, y: 0.55, z: 0.04 }, { x: 0.06, y: 0.86, z: 0.14 }, 0.025, 0.012, "hide", p.dark, 6);
  head.add(antenna);
  head.add(place(kit.ball(0.06, 0.06, 0.06, "glow", p.glow, 10), 0.07, 0.88, 0.15));
  for (const side of [-1, 1]) {
    const ear = kit.spike(0.09, 0.26, 0.5, "hide", p.main);
    place(ear, side * 0.24, 0.46, 0.06, 0.2, 0, -side * 0.7);
    head.add(ear);
  }

  addTail(kit, rig, [0, 0.04, 0.24], 4, 0.13, 0.05, -1.1, -0.35, false);

  rig.anim = {
    idleSpeed: 1.8,
    breath: 1.2,
    bob: 0.07,
    headSway: 1.6,
    tailWave: 1.8,
    wingFlap: 0,
    sway: 1.5,
    lunge: 1.3,
    attack: "dash",
  };
}

const BUILDERS: Record<string, { build: (kit: CreatureKit, rig: CreatureRig) => void; height: number; float: number }> = {
  アタッカー: { build: buildAttacker, height: 2.2, float: 0 },
  ディフェンダー: { build: buildDefender, height: 2.45, float: 0 },
  ヒーラー: { build: buildHealer, height: 2.25, float: 0.32 },
  サポート: { build: buildSupport, height: 2.05, float: 0.42 },
  デバッファー: { build: buildDebuffer, height: 2.25, float: 0 },
  バランス型: { build: buildBalanced, height: 2.35, float: 0 },
  ボス: { build: buildBoss, height: 2.95, float: 0 },
  素材: { build: buildCritter, height: 1.35, float: 0.05 },
};

export function builderFor(role: string): { build: (kit: CreatureKit, rig: CreatureRig) => void; height: number; float: number } {
  return BUILDERS[role] ?? BUILDERS["バランス型"];
}

/**
 * モンスター種別ごとの追加造形。
 *
 * シルエットを役割(role)だけで決めると、同じ役割の別モンスターが
 * 完全に同じ見た目になってしまう(例: ドラゴンとグリフォンはどちらも
 * 「アタッカー」なので、色以外に区別がつかない)。
 * そこで役割ビルダーで骨格を組んだあとに、種別固有の特徴を足して
 * 一目で見分けられるようにする。
 */
const TEMPLATE_TRAITS: Record<string, (kit: CreatureKit, rig: CreatureRig) => void> = {
  /** ドラゴン: 大きな皮膜の翼。畳まずに広げて、横幅のあるシルエットにする */
  dragon: (kit, rig) => {
    for (const side of [-1, 1]) {
      const wing = new THREE.Group();
      markAnimated(wing);
      place(wing, side * 0.3, 0.62, 0.18, 0.16, -side * 0.42, side * 0.12);
      addBatWing(kit, wing, side, 1.5);
      rig.torso.add(wing);
      rig.wings.push({ root: wing, rootRest: wing.rotation.clone(), lower: null, lowerRest: null, tip: wing, side, phase: 0 });
    }
    rig.anim.wingFlap = 0.55;
  },

  /** グリフォン: 羽毛の翼と、頭の羽根飾り。鳥類寄りのシルエットにする */
  griffon: (kit, rig) => {
    const p = kit.palette;
    for (const side of [-1, 1]) {
      const wing = new THREE.Group();
      markAnimated(wing);
      place(wing, side * 0.28, 0.58, 0.14, 0.24, -side * 0.5, 0);
      addFeatherWing(kit, wing, side, 8, 1.5);
      rig.torso.add(wing);
      rig.wings.push({ root: wing, rootRest: wing.rotation.clone(), lower: null, lowerRest: null, tip: wing, side, phase: 0 });
    }
    // 後頭部の羽根飾り
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      const crest = kit.spike(0.028, 0.2 + Math.sin(t * Math.PI) * 0.12, 0.5, "plate", p.plate);
      place(crest, (t - 0.5) * 0.13, 0.13, 0.1, -0.5, Math.PI / 2, 0);
      rig.head.add(crest);
    }
    rig.anim.wingFlap = 0.85;
  },

  /** セラフ: 二対の光の翼と光輪。天使的なシルエットで他と明確に分ける */
  seraph: (kit, rig) => {
    const p = kit.palette;
    for (const side of [-1, 1]) {
      for (const [index, spec] of [
        { y: 0.72, span: 1.5, pitch: 0.1 },
        { y: 0.44, span: 1.15, pitch: 0.5 },
      ].entries()) {
        const wing = new THREE.Group();
        markAnimated(wing);
        place(wing, side * 0.24, spec.y, 0.14, spec.pitch, -side * 0.46, 0);
        addFeatherWing(kit, wing, side, 7, spec.span);
        rig.torso.add(wing);
        rig.wings.push({
          root: wing,
          rootRest: wing.rotation.clone(),
          lower: null,
          lowerRest: null,
          tip: wing,
          side,
          // 上下の翼で位相をずらし、順に羽ばたいて見えるようにする
          phase: index * 0.9,
        });
      }
    }
    const halo = kit.ring(0.26, 0.026, "glow", p.glow, 30);
    place(halo, 0, 0.46, 0.04, Math.PI / 2, 0, 0);
    rig.head.add(halo);
    rig.spinners.push({ object: halo, axis: "z", speed: 0.5 });
    rig.anim.wingFlap = 0.4;
  },
};

/** 種別固有の造形を足す。該当がなければ何もしない(役割ビルダーのままになる) */
export function applyTemplateTraits(templateId: string, kit: CreatureKit, rig: CreatureRig): void {
  TEMPLATE_TRAITS[templateId]?.(kit, rig);
}
