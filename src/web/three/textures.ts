import * as THREE from "three";

/** 生成したテクスチャは使い回す(同じ設定で何度も作らない) */
const cache = new Map<string, THREE.Texture>();

function fromCanvas(key: string, size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void): THREE.Texture {
  const cached = cache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) draw(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  cache.set(key, texture);
  return texture;
}

/** 中心が白く外へ向かって透明になる、加算合成用のソフトな光の粒 */
export function radialGlowTexture(): THREE.Texture {
  return fromCanvas("glow", 256, (ctx, size) => {
    const r = size / 2;
    const gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
    gradient.addColorStop(0.0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.18, "rgba(255,255,255,0.85)");
    gradient.addColorStop(0.45, "rgba(255,255,255,0.25)");
    gradient.addColorStop(1.0, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  });
}

/** 六角形の魔法陣。足元のキャラクター台座に敷く */
export function sigilTexture(): THREE.Texture {
  return fromCanvas("sigil", 512, (ctx, size) => {
    const c = size / 2;
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = size * 0.008;

    ctx.beginPath();
    ctx.arc(c, c, size * 0.44, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth = size * 0.016;
    ctx.beginPath();
    ctx.arc(c, c, size * 0.38, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth = size * 0.006;
    ctx.beginPath();
    ctx.arc(c, c, size * 0.27, 0, Math.PI * 2);
    ctx.stroke();

    // 内側の六芒星
    const drawPolygon = (radius: number, offset: number) => {
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = offset + (i * Math.PI * 2) / 3;
        const x = c + Math.cos(a) * radius;
        const y = c + Math.sin(a) * radius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    };
    ctx.lineWidth = size * 0.01;
    drawPolygon(size * 0.34, -Math.PI / 2);
    drawPolygon(size * 0.34, Math.PI / 2);

    // 外周の目盛り
    ctx.lineWidth = size * 0.012;
    for (let i = 0; i < 24; i++) {
      const a = (i * Math.PI * 2) / 24;
      const inner = size * 0.45;
      const outer = size * (i % 6 === 0 ? 0.5 : 0.475);
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * inner, c + Math.sin(a) * inner);
      ctx.lineTo(c + Math.cos(a) * outer, c + Math.sin(a) * outer);
      ctx.stroke();
    }
  });
}

/** ソフトな楕円の影。接地感を出すためキャラの真下に置く */
export function shadowTexture(): THREE.Texture {
  return fromCanvas("shadow", 256, (ctx, size) => {
    const r = size / 2;
    const gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
    gradient.addColorStop(0.0, "rgba(0,0,0,0.85)");
    gradient.addColorStop(0.5, "rgba(0,0,0,0.35)");
    gradient.addColorStop(1.0, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  });
}

/**
 * 読み込み済みのテクスチャを全部捨てる。
 *
 * **いまどこからも呼ばれていない。**「画面を離れる時に捨てる」つもりで
 * 置かれたが、呼び出しが繋がっていない。消さずに残してあるのは、
 * これが**無駄なのか呼び忘れなのか決めきれていない**ため:
 *
 *   ・捨てない方が正しい … 同じ絵を何度も使うので、持ち続ける方が速い
 *   ・捨てるべき … 画面を行き来するとGPUの持ち物が増え続ける
 *
 * 判断するには実機でGPUの使用量を測る必要がある。**測る前に消さない。**
 */
export function disposeTextureCache(): void {
  for (const texture of cache.values()) texture.dispose();
  cache.clear();
}
