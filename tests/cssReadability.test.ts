import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * CSSに書かれた文字の大きさを見張る。
 *
 * **型チェックもテストもCSSの安全弁にならない**ので、実機で読めない大きさは
 * 巡回(tools/tour.mjs)でしか拾えなかった。ただし巡回は1画面につき1件しか
 * 報告しないうえ、その画面へ辿り着けなければ黙って素通りする。
 *
 * 実際に出した事故: ホームの経験値が8px、試練の塔の関門名が7.4px。
 * どちらも「読めないから見なかったことになる」という壊れ方で、
 * 誰も報告してくれない。ここでは**書いた時点で**落とす。
 *
 * 9pxは巡回と同じ下限。それ未満は実機のiPhoneで判読できない。
 */

const MIN_PX = 9;
const ROOT_FONT_PX = 16;

function cssFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...cssFiles(path));
    else if (entry.name.endsWith(".css")) out.push(path);
  }
  return out;
}

interface Finding { where: string; px: number; text: string }

function tooSmall(path: string): Finding[] {
  const found: Finding[] = [];
  readFileSync(path, "utf8").split("\n").forEach((line, index) => {
    for (const match of line.matchAll(/font-size:\s*([0-9.]+)(px|rem|em)/g)) {
      // emは親からの相対なので、この見方では判定できない(親が大きければ読める)
      if (match[2] === "em") continue;
      const px = Number(match[1]) * (match[2] === "rem" ? ROOT_FONT_PX : 1);
      if (px < MIN_PX) found.push({ where: `${path}:${index + 1}`, px, text: line.trim().slice(0, 90) });
    }
  });
  return found;
}

describe("画面の文字の大きさ", () => {
  it(`${MIN_PX}px を下回る指定が無い`, () => {
    const findings = cssFiles("src/web").flatMap(tooSmall);
    const report = findings.map((f) => `${f.where}  ${f.px.toFixed(2)}px  ${f.text}`).join("\n");
    expect(findings, `実機で読めない大きさ:\n${report}`).toEqual([]);
  });
});
