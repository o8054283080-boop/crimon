import * as THREE from "three";

/**
 * エフェクト専用のプロシージャルテクスチャ群。
 *
 * 既存の textures.ts は「丸い光」「リング」など汎用の3枚しか持っていないため、
 * 属性ごとの画作り(炎/飛沫/氷片/葉/呪印…)ができなかった。
 * ここでは粒用の16枚アトラス1枚と、板ポリ/帯用の大きめテクスチャを用意する。
 *
 * - 粒(Points)は 4x4 アトラスの1枚テクスチャに集約し、ドローコールを増やさない
 * - 板ポリ(Billboard)や帯(Strip)は個別テクスチャを使う
 */

const cache = new Map<string, THREE.Texture>();

function makeCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2Dコンテキストを取得できませんでした");
  return { canvas, ctx };
}

function fromCanvas(
  key: string,
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void,
  configure?: (texture: THREE.Texture) => void,
): THREE.Texture {
  const cached = cache.get(key);
  if (cached) return cached;
  const { canvas, ctx } = makeCanvas(width, height);
  draw(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  configure?.(texture);
  cache.set(key, texture);
  return texture;
}

/** 決定的な擬似乱数(テクスチャ生成を毎回同じ絵にするため) */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
}

function alphaGradient(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, stops: [number, number][]): void {
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  for (const [offset, alpha] of stops) gradient.addColorStop(offset, `rgba(255,255,255,${alpha})`);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
}

// ---------------------------------------------------------------------------
// 粒アトラス
// ---------------------------------------------------------------------------

/** アトラス内のセル番号。ParticleField の cell に渡す */
export const SPRITE = {
  GLOW: 0,
  SPARK: 1,
  FLAME: 2,
  SMOKE: 3,
  SHARD: 4,
  DROP: 5,
  BUBBLE: 6,
  LEAF: 7,
  CRYSTAL: 8,
  FLARE: 9,
  RUNE: 10,
  STREAK: 11,
  RING: 12,
  HEX: 13,
  MOTE: 14,
  CRESCENT: 15,
} as const;

export type SpriteCell = (typeof SPRITE)[keyof typeof SPRITE];

export const ATLAS_COLUMNS = 4;

type CellDraw = (ctx: CanvasRenderingContext2D, s: number) => void;

/** 中心(s/2, s/2)を原点として1セル分を描く */
const CELL_DRAWERS: CellDraw[] = [
  // 0 GLOW: 柔らかい光の粒
  (ctx, s) => {
    alphaGradient(ctx, s / 2, s / 2, s * 0.48, [
      [0, 1],
      [0.16, 0.86],
      [0.42, 0.26],
      [0.75, 0.05],
      [1, 0],
    ]);
  },
  // 1 SPARK: 芯が硬い火花
  (ctx, s) => {
    const c = s / 2;
    alphaGradient(ctx, c, c, s * 0.46, [
      [0, 1],
      [0.08, 0.95],
      [0.2, 0.4],
      [0.42, 0.08],
      [1, 0],
    ]);
    ctx.save();
    ctx.filter = "blur(2px)";
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = s * 0.03;
    ctx.beginPath();
    ctx.moveTo(c - s * 0.42, c);
    ctx.lineTo(c + s * 0.42, c);
    ctx.moveTo(c, c - s * 0.42);
    ctx.lineTo(c, c + s * 0.42);
    ctx.stroke();
    ctx.restore();
  },
  // 2 FLAME: 上に伸びる炎の舌
  (ctx, s) => {
    const c = s / 2;
    ctx.save();
    ctx.filter = "blur(4px)";
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.beginPath();
    ctx.moveTo(c, c - s * 0.44);
    ctx.bezierCurveTo(c + s * 0.24, c - s * 0.1, c + s * 0.2, c + s * 0.22, c, c + s * 0.34);
    ctx.bezierCurveTo(c - s * 0.2, c + s * 0.22, c - s * 0.24, c - s * 0.1, c, c - s * 0.44);
    ctx.fill();
    ctx.restore();
    alphaGradient(ctx, c, c + s * 0.1, s * 0.2, [
      [0, 0.8],
      [0.5, 0.25],
      [1, 0],
    ]);
  },
  // 3 SMOKE: もくもくした煙塊
  (ctx, s) => {
    const rand = seeded(7);
    const c = s / 2;
    ctx.save();
    ctx.filter = "blur(7px)";
    for (let i = 0; i < 9; i++) {
      const angle = rand() * Math.PI * 2;
      const dist = rand() * s * 0.17;
      const r = s * (0.13 + rand() * 0.12);
      alphaGradient(ctx, c + Math.cos(angle) * dist, c + Math.sin(angle) * dist, r, [
        [0, 0.4],
        [0.6, 0.2],
        [1, 0],
      ]);
    }
    ctx.restore();
  },
  // 4 SHARD: 破片(角ばった三角)
  (ctx, s) => {
    const c = s / 2;
    ctx.save();
    ctx.filter = "blur(1px)";
    ctx.fillStyle = "rgba(255,255,255,0.98)";
    ctx.beginPath();
    ctx.moveTo(c + s * 0.02, c - s * 0.4);
    ctx.lineTo(c + s * 0.17, c + s * 0.26);
    ctx.lineTo(c - s * 0.04, c + s * 0.38);
    ctx.lineTo(c - s * 0.15, c + s * 0.04);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  },
  // 5 DROP: 水滴
  (ctx, s) => {
    const c = s / 2;
    ctx.save();
    ctx.filter = "blur(2px)";
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.beginPath();
    ctx.moveTo(c, c - s * 0.4);
    ctx.bezierCurveTo(c + s * 0.13, c - s * 0.12, c + s * 0.22, c + s * 0.06, c + s * 0.22, c + s * 0.14);
    ctx.arc(c, c + s * 0.14, s * 0.22, 0, Math.PI);
    ctx.bezierCurveTo(c - s * 0.22, c + s * 0.06, c - s * 0.13, c - s * 0.12, c, c - s * 0.4);
    ctx.fill();
    ctx.restore();
    alphaGradient(ctx, c - s * 0.06, c + s * 0.08, s * 0.07, [
      [0, 0.9],
      [1, 0],
    ]);
  },
  // 6 BUBBLE: 泡(輪郭+ハイライト)
  (ctx, s) => {
    const c = s / 2;
    ctx.save();
    ctx.filter = "blur(1.5px)";
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = s * 0.07;
    ctx.beginPath();
    ctx.arc(c, c, s * 0.32, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.beginPath();
    ctx.arc(c, c, s * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    alphaGradient(ctx, c - s * 0.12, c - s * 0.13, s * 0.1, [
      [0, 0.95],
      [1, 0],
    ]);
  },
  // 7 LEAF: 葉
  (ctx, s) => {
    const c = s / 2;
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.beginPath();
    ctx.moveTo(c, c - s * 0.42);
    ctx.bezierCurveTo(c + s * 0.3, c - s * 0.16, c + s * 0.24, c + s * 0.24, c, c + s * 0.42);
    ctx.bezierCurveTo(c - s * 0.24, c + s * 0.24, c - s * 0.3, c - s * 0.16, c, c - s * 0.42);
    ctx.fill();
    // 葉脈を抜く
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = s * 0.03;
    ctx.beginPath();
    ctx.moveTo(c, c - s * 0.36);
    ctx.lineTo(c, c + s * 0.36);
    ctx.stroke();
    ctx.lineWidth = s * 0.018;
    for (let i = -2; i <= 2; i++) {
      const y = c + i * s * 0.11;
      ctx.beginPath();
      ctx.moveTo(c, y);
      ctx.lineTo(c + s * 0.16, y + s * 0.07);
      ctx.moveTo(c, y);
      ctx.lineTo(c - s * 0.16, y + s * 0.07);
      ctx.stroke();
    }
    ctx.restore();
  },
  // 8 CRYSTAL: 氷の結晶
  (ctx, s) => {
    const c = s / 2;
    ctx.save();
    ctx.filter = "blur(1px)";
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineCap = "round";
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      ctx.lineWidth = s * 0.05;
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.lineTo(c + dx * s * 0.42, c + dy * s * 0.42);
      ctx.stroke();
      ctx.lineWidth = s * 0.032;
      for (const t of [0.22, 0.34]) {
        const bx = c + dx * s * t * 1.4;
        const by = c + dy * s * t * 1.4;
        const branch = s * 0.11;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + Math.cos(a + 1.0) * branch, by + Math.sin(a + 1.0) * branch);
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + Math.cos(a - 1.0) * branch, by + Math.sin(a - 1.0) * branch);
        ctx.stroke();
      }
    }
    ctx.restore();
    alphaGradient(ctx, c, c, s * 0.16, [
      [0, 0.9],
      [1, 0],
    ]);
  },
  // 9 FLARE: 十字に伸びる閃光
  (ctx, s) => {
    const c = s / 2;
    ctx.save();
    ctx.filter = "blur(3px)";
    const drawRay = (angle: number, length: number, width: number, alpha: number) => {
      ctx.save();
      ctx.translate(c, c);
      ctx.rotate(angle);
      const g = ctx.createLinearGradient(-length, 0, length, 0);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.5, `rgba(255,255,255,${alpha})`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-length, 0);
      ctx.lineTo(0, -width);
      ctx.lineTo(length, 0);
      ctx.lineTo(0, width);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };
    drawRay(0, s * 0.49, s * 0.055, 0.95);
    drawRay(Math.PI / 2, s * 0.49, s * 0.055, 0.95);
    drawRay(Math.PI / 4, s * 0.3, s * 0.03, 0.55);
    drawRay(-Math.PI / 4, s * 0.3, s * 0.03, 0.55);
    ctx.restore();
    alphaGradient(ctx, c, c, s * 0.2, [
      [0, 1],
      [0.35, 0.5],
      [1, 0],
    ]);
  },
  // 10 RUNE: 呪印
  (ctx, s) => {
    const c = s / 2;
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = s * 0.04;
    ctx.beginPath();
    ctx.arc(c, c, s * 0.34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = s * 0.05;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / 3;
      const x = c + Math.cos(a) * s * 0.26;
      const y = c + Math.sin(a) * s * 0.26;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.lineWidth = s * 0.05;
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * s * 0.36, c + Math.sin(a) * s * 0.36);
      ctx.lineTo(c + Math.cos(a) * s * 0.45, c + Math.sin(a) * s * 0.45);
      ctx.stroke();
    }
    ctx.restore();
  },
  // 11 STREAK: 横に流れる火の粉
  (ctx, s) => {
    const c = s / 2;
    ctx.save();
    ctx.filter = "blur(2px)";
    const g = ctx.createLinearGradient(c - s * 0.45, 0, c + s * 0.45, 0);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.42, "rgba(255,255,255,0.55)");
    g.addColorStop(0.72, "rgba(255,255,255,1)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(c, c, s * 0.45, s * 0.075, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },
  // 12 RING: 細い輪
  (ctx, s) => {
    const c = s / 2;
    ctx.save();
    ctx.filter = "blur(2px)";
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = s * 0.055;
    ctx.beginPath();
    ctx.arc(c, c, s * 0.36, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  },
  // 13 HEX: 六角形
  (ctx, s) => {
    const c = s / 2;
    ctx.save();
    ctx.filter = "blur(1px)";
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 3;
      const x = c + Math.cos(a) * s * 0.4;
      const y = c + Math.sin(a) * s * 0.4;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = s * 0.06;
    ctx.stroke();
    ctx.restore();
  },
  // 14 MOTE: 細かい塵
  (ctx, s) => {
    const c = s / 2;
    alphaGradient(ctx, c, c, s * 0.3, [
      [0, 1],
      [0.25, 0.6],
      [0.6, 0.12],
      [1, 0],
    ]);
  },
  // 15 CRESCENT: 三日月(斬撃の欠片)
  (ctx, s) => {
    const c = s / 2;
    ctx.save();
    ctx.filter = "blur(2px)";
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.beginPath();
    ctx.arc(c, c, s * 0.42, -1.1, 1.1);
    ctx.arc(c, c, s * 0.27, 1.1, -1.1, true);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  },
];

/** 粒用の 4x4 スプライトアトラス */
export function particleAtlasTexture(): THREE.Texture {
  const cell = 128;
  return fromCanvas(
    "fx-atlas",
    cell * 4,
    cell * 4,
    (ctx) => {
      CELL_DRAWERS.forEach((draw, index) => {
        const col = index % 4;
        const row = Math.floor(index / 4);
        ctx.save();
        ctx.translate(col * cell, row * cell);
        ctx.beginPath();
        ctx.rect(0, 0, cell, cell);
        ctx.clip();
        draw(ctx, cell);
        ctx.restore();
      });
    },
    (texture) => {
      // アトラスは隣接セルのにじみを避けるためミップを作らない
      texture.generateMipmaps = false;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
    },
  );
}

// ---------------------------------------------------------------------------
// 板ポリ/帯用の個別テクスチャ
// ---------------------------------------------------------------------------

/** ヒットの瞬間に出る大きな閃光(異方性の十字フレア) */
export function flashStarTexture(): THREE.Texture {
  return fromCanvas("fx-flash", 256, 256, (ctx, s) => {
    const c = s / 2;
    ctx.save();
    ctx.filter = "blur(4px)";
    const ray = (angle: number, length: number, width: number, alpha: number) => {
      ctx.save();
      ctx.translate(c, c);
      ctx.rotate(angle);
      const g = ctx.createLinearGradient(-length, 0, length, 0);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.5, `rgba(255,255,255,${alpha})`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-length, 0);
      ctx.lineTo(0, -width);
      ctx.lineTo(length, 0);
      ctx.lineTo(0, width);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };
    ray(0, s * 0.5, s * 0.045, 1);
    ray(Math.PI / 2, s * 0.42, s * 0.04, 0.9);
    for (let i = 0; i < 6; i++) ray((i * Math.PI) / 6 + 0.3, s * 0.26, s * 0.016, 0.5);
    ctx.restore();
    alphaGradient(ctx, c, c, s * 0.3, [
      [0, 1],
      [0.12, 0.9],
      [0.3, 0.35],
      [0.62, 0.06],
      [1, 0],
    ]);
  });
}

/** 火球。乱れた輪郭を持つ炎の塊 */
export function fireballTexture(): THREE.Texture {
  return fromCanvas("fx-fireball", 256, 256, (ctx, s) => {
    const c = s / 2;
    const rand = seeded(31);
    ctx.save();
    ctx.filter = "blur(6px)";
    for (let i = 0; i < 14; i++) {
      const a = rand() * Math.PI * 2;
      const d = rand() * s * 0.22;
      alphaGradient(ctx, c + Math.cos(a) * d, c + Math.sin(a) * d, s * (0.12 + rand() * 0.16), [
        [0, 0.5],
        [0.5, 0.22],
        [1, 0],
      ]);
    }
    // 外へ吹き出す舌
    for (let i = 0; i < 10; i++) {
      const a = rand() * Math.PI * 2;
      const len = s * (0.3 + rand() * 0.16);
      ctx.save();
      ctx.translate(c, c);
      ctx.rotate(a);
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.06);
      ctx.quadraticCurveTo(len * 0.6, -s * 0.02, len, 0);
      ctx.quadraticCurveTo(len * 0.6, s * 0.02, 0, s * 0.06);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    alphaGradient(ctx, c, c, s * 0.34, [
      [0, 0.95],
      [0.3, 0.6],
      [0.7, 0.16],
      [1, 0],
    ]);
  });
}

/** 余韻の煙。大きく柔らかい塊 */
export function smokePuffTexture(): THREE.Texture {
  return fromCanvas("fx-smoke", 256, 256, (ctx, s) => {
    const c = s / 2;
    const rand = seeded(97);
    ctx.save();
    ctx.filter = "blur(12px)";
    for (let i = 0; i < 12; i++) {
      const a = rand() * Math.PI * 2;
      const d = rand() * s * 0.2;
      alphaGradient(ctx, c + Math.cos(a) * d, c + Math.sin(a) * d, s * (0.14 + rand() * 0.16), [
        [0, 0.34],
        [0.55, 0.16],
        [1, 0],
      ]);
    }
    ctx.restore();
  });
}

/** 衝撃波。中心が抜けた鋭いリング */
export function shockRingTexture(): THREE.Texture {
  return fromCanvas("fx-shock", 256, 256, (ctx, s) => {
    const c = s / 2;
    const g = ctx.createRadialGradient(c, c, 0, c, c, s / 2);
    g.addColorStop(0.0, "rgba(255,255,255,0)");
    g.addColorStop(0.66, "rgba(255,255,255,0)");
    g.addColorStop(0.78, "rgba(255,255,255,0.25)");
    g.addColorStop(0.87, "rgba(255,255,255,1)");
    g.addColorStop(0.93, "rgba(255,255,255,0.4)");
    g.addColorStop(1.0, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
}

/** 光の柱。縦に伸びる帯(上下で薄くなる) */
export function lightPillarTexture(): THREE.Texture {
  return fromCanvas("fx-pillar", 128, 256, (ctx, w, h) => {
    const horizontal = ctx.createLinearGradient(0, 0, w, 0);
    horizontal.addColorStop(0.0, "rgba(255,255,255,0)");
    horizontal.addColorStop(0.3, "rgba(255,255,255,0.35)");
    horizontal.addColorStop(0.5, "rgba(255,255,255,1)");
    horizontal.addColorStop(0.7, "rgba(255,255,255,0.35)");
    horizontal.addColorStop(1.0, "rgba(255,255,255,0)");
    ctx.fillStyle = horizontal;
    ctx.fillRect(0, 0, w, h);

    // 上に向かって減衰させる
    ctx.globalCompositeOperation = "destination-in";
    const vertical = ctx.createLinearGradient(0, 0, 0, h);
    vertical.addColorStop(0.0, "rgba(255,255,255,0)");
    vertical.addColorStop(0.25, "rgba(255,255,255,0.55)");
    vertical.addColorStop(0.85, "rgba(255,255,255,1)");
    vertical.addColorStop(1.0, "rgba(255,255,255,0.9)");
    ctx.fillStyle = vertical;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";

    // 縦の筋を足して「光条」らしさを出す
    const rand = seeded(11);
    ctx.filter = "blur(2px)";
    for (let i = 0; i < 7; i++) {
      const x = w * (0.2 + rand() * 0.6);
      ctx.fillStyle = `rgba(255,255,255,${0.1 + rand() * 0.15})`;
      ctx.fillRect(x, 0, w * 0.02, h);
    }
  });
}

/** 詠唱・呪印用の魔法陣(arena の sigil とは別デザイン) */
export function runeCircleTexture(): THREE.Texture {
  return fromCanvas("fx-rune-circle", 512, 512, (ctx, s) => {
    const c = s / 2;
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = s * 0.012;
    ctx.beginPath();
    ctx.arc(c, c, s * 0.46, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = s * 0.006;
    ctx.beginPath();
    ctx.arc(c, c, s * 0.42, 0, Math.PI * 2);
    ctx.stroke();

    // 外周のルーン風の刻み
    const rand = seeded(5);
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const r0 = s * 0.425;
      const len = s * (0.01 + rand() * 0.02);
      ctx.lineWidth = s * 0.008;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
      ctx.lineTo(c + Math.cos(a) * (r0 + len), c + Math.sin(a) * (r0 + len));
      ctx.stroke();
      if (i % 5 === 0) {
        ctx.beginPath();
        ctx.arc(c + Math.cos(a) * s * 0.385, c + Math.sin(a) * s * 0.385, s * 0.012, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // 内側の五芒星と円
    ctx.lineWidth = s * 0.01;
    ctx.beginPath();
    for (let i = 0; i <= 5; i++) {
      const a = -Math.PI / 2 + ((i * 2) % 5) * ((Math.PI * 2) / 5);
      const x = c + Math.cos(a) * s * 0.3;
      const y = c + Math.sin(a) * s * 0.3;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.lineWidth = s * 0.014;
    ctx.beginPath();
    ctx.arc(c, c, s * 0.3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = s * 0.006;
    ctx.beginPath();
    ctx.arc(c, c, s * 0.16, 0, Math.PI * 2);
    ctx.stroke();
  });
}

/** シールド結界用の六角メッシュ(タイル可能) */
export function hexGridTexture(): THREE.Texture {
  return fromCanvas(
    "fx-hexgrid",
    256,
    256,
    (ctx, s) => {
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = s * 0.014;
      const radius = s / 6;
      const height = Math.sqrt(3) * radius;
      const drawHex = (cx: number, cy: number) => {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI) / 3;
          const x = cx + Math.cos(a) * radius * 0.94;
          const y = cy + Math.sin(a) * radius * 0.94;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
      };
      for (let row = -1; row < 6; row++) {
        for (let col = -1; col < 6; col++) {
          const cx = col * radius * 1.5;
          const cy = row * height + (col % 2 === 0 ? 0 : height / 2);
          drawHex(cx, cy);
        }
      }
    },
    (texture) => {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
    },
  );
}

/** 帯(斬撃/稲妻/蔦)用。幅方向に芯が光るグラデーション */
export function ribbonTexture(): THREE.Texture {
  return fromCanvas(
    "fx-ribbon",
    64,
    64,
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0.0, "rgba(255,255,255,0)");
      g.addColorStop(0.28, "rgba(255,255,255,0.45)");
      g.addColorStop(0.5, "rgba(255,255,255,1)");
      g.addColorStop(0.72, "rgba(255,255,255,0.45)");
      g.addColorStop(1.0, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
    (texture) => {
      texture.wrapS = THREE.RepeatWrapping;
    },
  );
}

/** 闇の渦。回して使う */
export function vortexTexture(): THREE.Texture {
  return fromCanvas("fx-vortex", 256, 256, (ctx, s) => {
    const c = s / 2;
    ctx.save();
    ctx.filter = "blur(5px)";
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    for (let arm = 0; arm < 5; arm++) {
      ctx.lineWidth = s * 0.05;
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        const a = (arm / 5) * Math.PI * 2 + t * 2.4;
        const r = s * 0.08 + t * s * 0.4;
        const x = c + Math.cos(a) * r;
        const y = c + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
    // 外周を落とす
    ctx.globalCompositeOperation = "destination-in";
    alphaGradient(ctx, c, c, s * 0.5, [
      [0, 1],
      [0.55, 0.9],
      [0.85, 0.25],
      [1, 0],
    ]);
  });
}

export function disposeFxTextures(): void {
  for (const texture of cache.values()) texture.dispose();
  cache.clear();
}
