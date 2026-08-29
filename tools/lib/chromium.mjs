import { existsSync } from "node:fs";

/**
 * 実ブラウザ(Chromium)の在り処。
 *
 * 開発用の箱では `/opt/pw-browsers/...` に入っているので、道具はそこを
 * 直に指していた。ところが **GitHub Actions の runner はその道を持っていない。**
 * `npx playwright install` で別の場所へ入るため、決め打ちのままでは
 * 「実行ファイルが無い」で必ず落ちる(CIの巡回が実際にこれで落ちた)。
 *
 * 実在する時だけ指定し、無ければ Playwright に自分で探させる。
 * Playwright は自分が入れた場所を知っているので、指定しない方が正しい。
 *
 * @returns {string | undefined} 指定する道。見つからなければ undefined
 */
export function chromiumExecutablePath() {
  const explicit = process.env.CHROMIUM_PATH;
  if (explicit) return explicit;
  const devBox = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
  return existsSync(devBox) ? devBox : undefined;
}

/**
 * WebGLを載せた Chromium を起こすための引数。
 *
 * runner にもこの箱にも GPU が無いので、`swiftshader`(CPUで描く実装)を使う。
 * 指定しないとWebGLの文脈が作れず、**戦闘画面が真っ黒のまま**「問題なし」になる。
 */
export const CHROMIUM_GL_ARGS = [
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--no-sandbox",
];
