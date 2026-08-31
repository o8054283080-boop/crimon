import type { MotionGenerationResult } from "./types.js";

async function imageFromBlob(blob: Blob): Promise<ImageBitmap> { return createImageBitmap(blob); }

export async function createSpriteSheet(result: MotionGenerationResult): Promise<{ blob: Blob; columns: number; rows: number }> {
  const columns = Math.ceil(Math.sqrt(result.frames.length));
  const rows = Math.ceil(result.frames.length / columns);
  const canvas = document.createElement("canvas");
  canvas.width = columns * result.width;
  canvas.height = rows * result.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("画像を書き出せないブラウザです。");
  for (const frame of result.frames) {
    const bitmap = await imageFromBlob(frame.blob);
    const x = (frame.index % columns) * result.width;
    const y = Math.floor(frame.index / columns) * result.height;
    context.drawImage(bitmap, x, y, result.width, result.height);
    bitmap.close();
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Sprite sheetの作成に失敗しました。");
  return { blob, columns, rows };
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}
function u16(value: number): Uint8Array { return Uint8Array.of(value & 255, (value >>> 8) & 255); }
function u32(value: number): Uint8Array { return Uint8Array.of(value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255); }
function join(parts: Uint8Array[]): Uint8Array { const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0)); let offset = 0; for (const part of parts) { out.set(part, offset); offset += part.length; } return out; }

export async function createPngSequenceZip(result: MotionGenerationResult, baseName: string): Promise<Blob> {
  const encoder = new TextEncoder(); const files: { name: Uint8Array; data: Uint8Array; crc: number; offset: number }[] = []; const local: Uint8Array[] = []; let offset = 0;
  for (const frame of result.frames) {
    const name = encoder.encode(`${baseName}_${String(frame.index + 1).padStart(3, "0")}.png`);
    const data = new Uint8Array(await frame.blob.arrayBuffer()); const crc = crc32(data);
    const header = join([u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name]);
    files.push({ name, data, crc, offset }); local.push(header, data); offset += header.length + data.length;
  }
  const central = files.map((file) => join([u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(file.crc), u32(file.data.length), u32(file.data.length), u16(file.name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(file.offset), file.name]));
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const archive = join([...local, ...central, join([u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(centralSize), u32(offset), u16(0)])]);
  return new Blob([archive.buffer as ArrayBuffer], { type: "application/zip" });
}
