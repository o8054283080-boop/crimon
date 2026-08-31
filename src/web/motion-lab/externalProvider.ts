import { buildMotionPrompt, isLoopingMotion } from "./prompt.js";
import type { MotionFrame, MotionGenerationRequest, MotionGenerationResult, MotionGeneratorProvider } from "./types.js";

interface ImageApiResponse { data?: Array<{ b64_json?: string; url?: string }>; error?: { message?: string } }

export interface ExternalAIOptions { apiKey: string; endpoint?: string; model?: string; fetchImpl?: typeof fetch }

export class ExternalAIMotionProvider implements MotionGeneratorProvider {
  readonly name = "OpenAI Images Edit API";
  private readonly endpoint: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: ExternalAIOptions) {
    this.endpoint = options.endpoint || "https://api.openai.com/v1/images/edits";
    this.model = options.model || "gpt-image-1";
    this.fetchImpl = options.fetchImpl || fetch;
  }

  async generate(request: MotionGenerationRequest): Promise<MotionGenerationResult> {
    if (!this.options.apiKey.trim()) throw new Error("APIキーが設定されていません。");
    const frames: MotionFrame[] = [];
    try {
      for (let index = 0; index < request.frameCount; index += 1) {
        const form = new FormData();
        form.append("model", this.model);
        form.append("image", request.image, request.fileName || "character.png");
        form.append("prompt", buildMotionPrompt(request.motion, request.characterType, index, request.frameCount, request.extraInstruction));
        form.append("size", "1024x1024");
        form.append("background", "transparent");
        form.append("output_format", "png");
        const response = await this.fetchImpl(this.endpoint, {
          method: "POST",
          headers: { Authorization: `Bearer ${this.options.apiKey}` },
          body: form,
          signal: request.signal,
        });
        const body = await response.json() as ImageApiResponse;
        if (!response.ok) throw new Error(body.error?.message || `AI APIがエラーを返しました (${response.status})`);
        const item = body.data?.[0];
        let blob: Blob;
        if (item?.b64_json) blob = base64ToBlob(item.b64_json, "image/png");
        else if (item?.url) {
          const downloaded = await this.fetchImpl(item.url, { signal: request.signal });
          if (!downloaded.ok) throw new Error("生成画像を取得できませんでした。");
          blob = await downloaded.blob();
        } else throw new Error("AI APIの応答に画像がありません。");
        frames.push({ blob, url: URL.createObjectURL(blob), index });
      }
      return { frames, loop: isLoopingMotion(request.motion), width: request.size, height: request.size, provider: this.name };
    } catch (error) {
      frames.forEach((frame) => URL.revokeObjectURL(frame.url));
      if (error instanceof DOMException && error.name === "AbortError") throw new Error("生成を中止しました。");
      throw error;
    }
  }
}

export function base64ToBlob(value: string, type: string): Blob {
  const bytes = Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  return new Blob([bytes], { type });
}
