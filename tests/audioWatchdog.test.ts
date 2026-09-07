import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { judgeBgmHealth } from "../src/web/audio/mediaBgm.js";
import { synthNameFor } from "../src/web/audio/synthSfx.js";

/**
 * 注釈を落として、実際に動く部分だけを残す。
 *
 * **これが無いと、注意書きそのものがテストに引っかかる。**
 * 「`new Audio()` を使ってはいけない」と書いた行が
 * 「`new Audio(` を含まないこと」を落としてしまい、
 * 直っているのに落ちる、直っていないのに通る、の両方が起きる。
 */
function code(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * BGMの見張り番。
 *
 * iOS 18.7.8 の実機から届いたのは、**設定画面が「互換再生中」と表示しながら無音**
 * という報告だった。つまり
 *
 *   AudioContext.state === "running"
 *   HTMLAudioElement.paused === false
 *
 * のどちらも、実際に音が出ていることの証拠になっていなかった。
 * 証拠になるのは**再生位置が進んだかどうか**だけ。ここはその判定を見張る。
 */
describe("鳴っているかを再生位置で判定する", () => {
  const base = { paused: false, visible: true, volume: 0.4, stallCount: 0 };

  it("再生位置が進んでいれば、鳴っていると認める", () => {
    const verdict = judgeBgmHealth({ ...base, previousTime: 12.4, currentTime: 13.1 });
    expect(verdict.healthy).toBe(true);
    expect(verdict.shouldRestart).toBe(false);
    // 直ったと確かめられたので、見張りは止めてよい
    expect(verdict.canStop).toBe(true);
  });

  it("paused=false でも再生位置が止まっていれば、鳴っていないと見なす", () => {
    const first = judgeBgmHealth({ ...base, previousTime: 12.4, currentTime: 12.4 });
    expect(first.healthy).toBe(false);
    // 1回目では鳴らし直さない。ループの巻き戻しと紛らわしいため
    expect(first.shouldRestart).toBe(false);
    expect(first.stallCount).toBe(1);

    const second = judgeBgmHealth({ ...base, previousTime: 12.4, currentTime: 12.4, stallCount: first.stallCount });
    expect(second.healthy).toBe(false);
    // 2回続けて止まっていたら鳴らし直す
    expect(second.shouldRestart).toBe(true);
  });

  it("ループで頭へ戻った時は「進んだ」として扱う", () => {
    const verdict = judgeBgmHealth({ ...base, previousTime: 45.6, currentTime: 0.2 });
    expect(verdict.healthy).toBe(true);
    expect(verdict.shouldRestart).toBe(false);
  });

  it("止まっている(paused)なら、すぐ鳴らし直す", () => {
    const verdict = judgeBgmHealth({ ...base, paused: true, previousTime: 12.4, currentTime: 12.4 });
    expect(verdict.healthy).toBe(false);
    expect(verdict.shouldRestart).toBe(true);
  });

  it("まだ測っていないうちは、鳴っているとも壊れているとも決めない", () => {
    const verdict = judgeBgmHealth({ ...base, previousTime: -1, currentTime: 3.2 });
    expect(verdict.healthy).toBe(false);
    expect(verdict.shouldRestart).toBe(false);
    expect(verdict.canStop).toBe(false);
  });

  it("画面が裏に回っている間は、鳴らし直さない", () => {
    // バックグラウンドで鳴らし始めるのは音楽アプリの振る舞い。ゲームはそれをしない
    const verdict = judgeBgmHealth({ ...base, visible: false, paused: true, previousTime: 12.4, currentTime: 12.4 });
    expect(verdict.shouldRestart).toBe(false);
    expect(verdict.canStop).toBe(true);
  });

  it("音量が0なら、鳴らし直さない", () => {
    const verdict = judgeBgmHealth({ ...base, volume: 0, paused: true, previousTime: 12.4, currentTime: 12.4 });
    expect(verdict.shouldRestart).toBe(false);
    expect(verdict.canStop).toBe(true);
  });
});

/**
 * 互換再生の作り。**ソースの形そのものを見張る。**
 *
 * この経路はDOMと実機のiPhoneでしか動かないので、普通のテストでは
 * 一行も実行されない。だからこそ、過去に踏んだ地雷を踏み直していないかを
 * ここで機械的に確かめる。
 */
describe("互換再生の組み立て", () => {
  const source = code("../src/web/audio/mediaBgm.ts");

  it("BGMの要素は場面ごとに使い回し、画面に置く", () => {
    // 使い捨ての `new Audio()` は、iPhoneで素直に鳴らないことがある
    expect(source).not.toContain("new Audio(");
    expect(source).toContain("document.body.append(audio)");
    expect(source).toContain("this.elements.set(scene, audio)");
  });

  it("裏に回ったら止め、戻ったら鳴らし直す", () => {
    expect(source).toMatch(/visibilitychange[\s\S]{0,400}this\.pauseAll\(\)/);
    expect(source).toContain('window.addEventListener("pagehide"');
  });

  it("play()を断られたら、次に画面を触った時へ持ち越す", () => {
    expect(source).toContain("this.waitingForGesture = true");
    expect(source).toMatch(/audioEngine\.onGesture\([\s\S]{0,300}this\.start\(this\.wanted\)/);
  });

  it("止まっている要素へ currentTime を書き込まない", () => {
    // 止められた直後にシークすると、曲の頭へ戻ってしまうことがある
    expect(source).toMatch(/if \(audio\.paused\) \{\s*this\.start\(scene\);\s*return;\s*\}/);
  });
});

/**
 * 音声文脈まわり。**ここも実機でしか動かない**ので形を見張る。
 */
describe("音声文脈の扱い", () => {
  const source = code("../src/web/audio/context.ts");

  it("AudioSessionは ambient を明示する（playbackは使わない）", () => {
    expect(source).toContain('session.type = "ambient"');
    // playback はマナーモードを無視し、裏でも鳴り続ける。ゲームでは使わない
    expect(source).not.toMatch(/audioSession[\s\S]{0,80}=\s*"playback"/);
  });

  it("解錠は pointerdown だけに頼らない", () => {
    expect(source).toContain('["pointerdown", "touchstart", "click"]');
  });

  it("解錠の購読を once:true にしない", () => {
    // 1回きりだと、画面ロックや着信で止められた後に二度と起こし直せない
    expect(source).not.toContain("once: true");
  });

  it("裏に回ったら音声文脈を止める", () => {
    expect(source).toMatch(/visibilityState === "hidden"[\s\S]{0,120}this\.suspend\(\)/);
  });
});

describe("効果音の代役", () => {
  it("押した手応えと結果の音には代役がある", () => {
    for (const name of ["tap", "select", "denied", "victory"]) {
      expect(synthNameFor(name)).not.toBeNull();
    }
  });

  it("着弾はどの当たり方でも被弾の代役でつなぐ", () => {
    expect(synthNameFor("impact_slash")).toBe("damage");
    expect(synthNameFor("impact_magic")).toBe("damage");
  });

  it("代役を用意していない音は、黙って何もしない", () => {
    expect(synthNameFor("summonRare")).toBeNull();
    expect(synthNameFor("levelUp")).toBeNull();
  });
});
