import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { inflateSync, crc32 } from "node:zlib";
import path from "node:path";

/*
 * 配るPNGが、最後まで読める画像になっているか。
 *
 * ## なぜ要るのか
 *
 * ホーム画面のアイコンが**5回続けて壊れた状態でコミットされた**。
 * 壊れ方は毎回同じで、PNG署名とIHDRは正しいのに**画素データが途中で切れている**。
 *
 *   - 「180×180のRGBで、PNG署名も正しい」——ここまでは全部通る
 *   - 画像ビューアによっては、途中まででも表示してしまう
 *   - **iOSはホーム画面に追加する時にアイコンをデコードする。
 *     そこで失敗すると、追加そのものが黙って失敗する**
 *
 * 型チェックもテストもCSSも、バイナリの中身は見ない。
 * 「読み込めるか」を機械で見張れるのはここだけ。
 *
 * ## 何を見ているか
 *
 * チャンクを最後までたどり、CRCを検算し、IDATを実際に展開して
 * **画素の量が縦×横と一致するか**まで確かめる。
 * 途中で切れていれば展開量が足りず、必ず落ちる。
 */

/** 検査するフォルダ。配布物と、その元 */
const ROOTS = ["public", "src/web/assets"];

function pngFilesIn(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return pngFilesIn(full);
    return name.toLowerCase().endsWith(".png") ? [full] : [];
  });
}

/** 1色あたりの成分数。PNGのカラータイプから決まる */
const SAMPLES_PER_PIXEL: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/** 読めないPNGならその理由、健全なら null */
function brokenReason(file: string): string | null {
  const data = readFileSync(file);
  if (!data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "PNGの署名が無い";
  }
  if (data.length < 33) return "IHDRを読む前に終わっている";
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  const bitDepth = data[24];
  const colorType = data[25];

  let offset = 8;
  const idat: Buffer[] = [];
  let sawEnd = false;
  while (offset + 8 <= data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.subarray(offset + 4, offset + 8).toString("latin1");
    const end = offset + 12 + length;
    if (end > data.length) {
      return `${type}チャンクが${length}バイトと書いてあるのに、残りは${data.length - offset - 8}バイトしかない(途中で切れている)`;
    }
    if (crc32(data.subarray(offset + 4, offset + 8 + length)) >>> 0 !== data.readUInt32BE(offset + 8 + length)) {
      return `${type}チャンクのCRCが合わない(中身が書き換わっている)`;
    }
    if (type === "IDAT") idat.push(data.subarray(offset + 8, offset + 8 + length));
    offset = end;
    if (type === "IEND") { sawEnd = true; break; }
  }
  if (!sawEnd) return "IENDまで届いていない";
  if (idat.length === 0) return "画素データ(IDAT)が無い";

  let raw: Buffer;
  try {
    raw = inflateSync(Buffer.concat(idat));
  } catch (error) {
    return `画素データを展開できない(${(error as Error).message})`;
  }
  const samples = SAMPLES_PER_PIXEL[colorType] ?? 1;
  const bytesPerRow = Math.ceil((width * samples * bitDepth) / 8);
  const expected = height * (1 + bytesPerRow);
  if (raw.length !== expected) return `画素が足りない(${raw.length} / ${expected}バイト)`;
  return null;
}

describe("配るPNGが最後まで読めること", () => {
  const files = ROOTS.flatMap(pngFilesIn);

  it("検査するPNGが実際に見つかっている", () => {
    // 探し方を壊すと「1件も壊れていない」と嘘の合格を出す
    expect(files.length).toBeGreaterThan(0);
  });

  it("途中で切れているPNGが1枚も無い", () => {
    const broken = files.map((file) => [file, brokenReason(file)] as const)
      .filter((entry): entry is readonly [string, string] => entry[1] !== null)
      .map(([file, reason]) => `${file}: ${reason}`);
    expect(broken, `読めないPNG:\n${broken.join("\n")}`).toEqual([]);
  });

  it("ホーム画面のアイコンが揃っている", () => {
    /*
     * iOSは `apple-touch-icon` をデコードできないと、
     * **「ホーム画面に追加」そのものを失敗させる。**
     * 名前を変えたり消したりした時に、静かに欠けないよう名指しで見る。
     */
    for (const name of ["apple-touch-icon.png", "icon-192.png", "icon-512.png", "favicon-32.png"]) {
      const file = path.join("public/icons", name);
      expect(files, `${name} が無い`).toContain(file);
      expect(brokenReason(file), `${name} が読めない`).toBeNull();
    }
  });
});
