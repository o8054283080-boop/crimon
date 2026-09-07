import { readFileSync, statSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import {
  audioLoadReport,
  decodeFailedForCurrentFormat,
  effectiveAudioFormat,
  formatOf,
  noteAudioLoadFailure,
  noteAudioLoadSuccess,
  preferredAudioFormat,
  resetAudioFormatStateForTest,
  resolveAudioFile,
} from "../src/web/audio/format.js";

/**
 * 音源の形式まわり。
 *
 * **iPhoneのSafariはOGG(Vorbis)を再生できない。**それが「CRIMONだけ鳴らない」
 * の根にあった。同じ端末で正常に鳴っている Monster-farm はMP3とWAVしか使っていない。
 *
 * ここで見張るのは2つ。
 *   1. 端末が読める形式を選べているか
 *   2. **古い失敗を引きずっていないか**——OGGで1回失敗した記録が残ったまま
 *      M4Aで読めるようになっても互換再生へ落ち続ける、という穴があった
 */
describe("音源の形式を選ぶ", () => {
  beforeEach(() => {
    resetAudioFormatStateForTest();
  });

  it("拡張子から形式を見分ける", () => {
    expect(formatOf("bgm_home.ogg")).toBe("ogg");
    expect(formatOf("bgm_home.m4a")).toBe("m4a");
    expect(formatOf("BGM_HOME.M4A")).toBe("m4a");
  });

  it("manifestがどちらの拡張子で書かれていても、選んだ形式へ揃う", () => {
    // 公開先によってmanifestは .ogg のことも .m4a のこともある
    expect(resolveAudioFile("bgm_home.ogg", "m4a")).toBe("bgm_home.m4a");
    expect(resolveAudioFile("bgm_home.m4a", "ogg")).toBe("bgm_home.ogg");
    expect(resolveAudioFile("impact_slash_0.ogg", "ogg")).toBe("impact_slash_0.ogg");
  });

  it("復号に失敗した形式を避けて、もう一方へ乗り換える", () => {
    const preferred = preferredAudioFormat();
    const other = preferred === "ogg" ? "m4a" : "ogg";
    noteAudioLoadFailure(`bgm_home.${preferred}`, "EncodingError", true);
    expect(effectiveAudioFormat()).toBe(other);
  });

  it("取得に失敗しただけでは形式を乗り換えない", () => {
    // 通信や配信の問題は、形式を変えても直らない
    const preferred = preferredAudioFormat();
    noteAudioLoadFailure(`bgm_home.${preferred}`, "HTTP 404", false);
    expect(effectiveAudioFormat()).toBe(preferred);
    expect(decodeFailedForCurrentFormat()).toBe(false);
  });

  it("古いoggの失敗は、m4aで読めた後に残らない", () => {
    noteAudioLoadFailure("bgm_home.ogg", "EncodingError", true);
    expect(effectiveAudioFormat()).toBe("m4a");
    expect(decodeFailedForCurrentFormat()).toBe(false);

    noteAudioLoadSuccess("bgm_home.m4a");
    // m4aで読めている以上、互換再生へ落ちてはいけない
    expect(decodeFailedForCurrentFormat()).toBe(false);
    expect(audioLoadReport().lastSuccessfulFormat).toBe("m4a");
    expect(audioLoadReport().decodeFailure).toBeNull();
  });

  it("同じ形式で読めたら、その形式の失敗の記録は消える", () => {
    noteAudioLoadFailure("bgm_home.ogg", "EncodingError", true);
    noteAudioLoadSuccess("bgm_battle.ogg");
    expect(effectiveAudioFormat()).toBe("ogg");
    expect(decodeFailedForCurrentFormat()).toBe(false);
  });

  it("どのファイルがどの形式で失敗したかを診断へ出せる", () => {
    noteAudioLoadSuccess("tap_0.m4a");
    noteAudioLoadFailure("bgm_home.ogg", "EncodingError / 495KB", true);
    const report = audioLoadReport();
    expect(report.lastSuccessfulFile).toBe("tap_0.m4a");
    expect(report.lastSuccessfulFormat).toBe("m4a");
    expect(report.lastFailedFile).toBe("bgm_home.ogg");
    expect(report.lastFailedFormat).toBe("ogg");
  });
});

/**
 * **音源そのものが控えに入っているか。**
 *
 * ここが今回のいちばん重い穴だった。M4Aへの変換を公開のワークフローの中だけで
 * 行っていたため、別の配信先(Cloudflare Pages)から配られた本番にはM4Aが
 * 1つも無く、iPhoneには永久にOGGしか届いていなかった。
 * **配信先によって届く物が変わってはいけない。**
 */
describe("iPhone用のM4Aが控えに入っている", () => {
  const manifest = JSON.parse(readFileSync(new URL("../public/audio/manifest.json", import.meta.url), "utf8")) as Record<string, string[]>;

  it("manifestに載っている音は、すべてM4Aも置いてある", () => {
    const missing: string[] = [];
    for (const files of Object.values(manifest)) {
      for (const file of files) {
        const m4a = new URL(`../public/audio/${resolveAudioFile(file, "m4a")}`, import.meta.url);
        try {
          if (statSync(m4a).size <= 0) missing.push(file);
        } catch {
          missing.push(file);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("BGMの3場面はどちらの形式でも置いてある", () => {
    for (const scene of ["home", "battle", "boss"]) {
      for (const ext of ["ogg", "m4a"]) {
        const path = new URL(`../public/audio/bgm_${scene}.${ext}`, import.meta.url);
        expect(statSync(path).size, `bgm_${scene}.${ext}`).toBeGreaterThan(0);
      }
    }
  });
});
