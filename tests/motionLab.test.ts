import { describe, expect, it, vi } from "vitest";
import { ExternalAIMotionProvider } from "../src/web/motion-lab/externalProvider.js";
import { createPngSequenceZip } from "../src/web/motion-lab/export.js";
import { buildMotionPrompt, isLoopingMotion } from "../src/web/motion-lab/prompt.js";
import type { MotionGenerationRequest, MotionGenerationResult } from "../src/web/motion-lab/types.js";

const transparentPng = new Blob([Uint8Array.of(137, 80, 78, 71)], { type: "image/png" });
const request: MotionGenerationRequest = {
  image: transparentPng, fileName: "slime.png", motion: "idle", characterType: "slime",
  frameCount: 12, fps: 16, size: 384, extraInstruction: "keep the crown",
};

describe("CRIMON Motion Lab", () => {
  it("モーションとキャラクター特性をAIプロンプトへ反映する", () => {
    const prompt = buildMotionPrompt("attack", "humanoid", 3, 12, "keep the sword");
    expect(prompt).toContain("attack"); expect(prompt).toContain("center-of-gravity");
    expect(prompt).toContain("Preserve the original character design"); expect(prompt).toContain("Transparent background");
    expect(prompt).toContain("frame 4 of 12"); expect(prompt).toContain("keep the sword");
    expect(isLoopingMotion("idle")).toBe(true); expect(isLoopingMotion("hit")).toBe(false);
  });

  it("APIキー未設定を送信前に案内する", async () => {
    const fetchImpl = vi.fn(); const provider = new ExternalAIMotionProvider({ apiKey: "", fetchImpl });
    await expect(provider.generate(request)).rejects.toThrow("APIキー"); expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("画像・設定・フレーム別プロンプトをmultipart payloadとして送る", async () => {
    const encoded = btoa("png");
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ b64_json: encoded }] }) });
    const provider = new ExternalAIMotionProvider({ apiKey: "session-key", fetchImpl: fetchImpl as unknown as typeof fetch });
    const result = await provider.generate({ ...request, frameCount: 12 });
    expect(fetchImpl).toHaveBeenCalledTimes(12); expect(result.frames).toHaveLength(12); expect(result.loop).toBe(true);
    const [endpoint, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(endpoint).toContain("/images/edits"); expect(init.headers).toEqual({ Authorization: "Bearer session-key" });
    const form = init.body as FormData; expect(form.get("image")).toBeInstanceOf(Blob); expect(form.get("model")).toBe("gpt-image-1");
    expect(form.get("prompt")).toContain("frame 1 of 12"); expect(form.get("background")).toBe("transparent");
    result.frames.forEach((frame) => URL.revokeObjectURL(frame.url));
  });

  it("AI失敗時はAPIの理由を保持し、途中生成URLを解放する", async () => {
    const revoke = vi.spyOn(URL, "revokeObjectURL"); let count = 0;
    const fetchImpl = vi.fn().mockImplementation(async () => ++count === 1
      ? { ok: true, json: async () => ({ data: [{ b64_json: btoa("one") }] }) }
      : { ok: false, status: 429, json: async () => ({ error: { message: "rate limited" } }) });
    const provider = new ExternalAIMotionProvider({ apiKey: "key", fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(provider.generate(request)).rejects.toThrow("rate limited"); expect(revoke).toHaveBeenCalledTimes(1); revoke.mockRestore();
  });

  it("PNG連番を無圧縮ZIPへまとめる", async () => {
    const result: MotionGenerationResult = { frames: [{ blob: transparentPng, url: "blob:1", index: 0 }, { blob: transparentPng, url: "blob:2", index: 1 }], loop: true, width: 384, height: 384, provider: "mock" };
    const zip = await createPngSequenceZip(result, "slime_idle_2f_384"); const bytes = new Uint8Array(await zip.arrayBuffer());
    expect(zip.type).toBe("application/zip"); expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(new TextDecoder().decode(bytes)).toContain("slime_idle_2f_384_001.png");
  });

  it("APIキーらしい固定値をソースへ埋め込まない", () => {
    expect(ExternalAIMotionProvider.toString()).not.toMatch(/sk-[A-Za-z0-9]{20,}/);
  });
});
