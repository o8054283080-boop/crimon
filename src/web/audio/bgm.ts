/**
 * BGMを鳴らす。
 *
 * ゲーム用に調整済みのループ音源をそのまま繰り返す。
 * 音声文脈は `context.ts` の `audioEngine` が持つ。効果音と同じものを使う。
 */
import { audioEngine, loadAudioBuffer, loadAudioManifest } from "./context.js";
import { AudioSettings, getAudioSettings, onAudioSettingsChange } from "./settings.js";

/** 場面。拠点・通常戦闘・ボス戦の3系統 */
export type BgmScene = "home" | "battle" | "boss";

const CROSSFADE_SEC = 1.6;
const FADE_IN_SEC = 2.2;

interface Playing {
  scene: BgmScene;
  source: AudioBufferSourceNode;
  gain: GainNode;
}

class BgmPlayer {
  private master: GainNode | null = null;
  private buffers = new Map<BgmScene, AudioBuffer>();
  private preparing: Promise<void> | null = null;
  private playing: Playing | null = null;
  /** いま鳴らしたい場面。まだ解錠されていない間もここに覚えておく */
  private wanted: BgmScene | null = null;
  private settings: AudioSettings = getAudioSettings();
  private inflight: BgmScene | null = null;

  constructor() {
    onAudioSettingsChange((next) => {
      const wasEnabled = this.settings.bgmEnabled;
      this.settings = next;
      if (this.master) this.master.gain.value = this.effectiveVolume();
      if (!wasEnabled && next.bgmEnabled && this.wanted) void this.apply(this.wanted);
    });

    // iOSでは初回タップだけでなく、バックグラウンド復帰後にもreadyが来る。
    // 鳴っていない時はその都度「鳴らしたかった場面」を拾い直す。
    audioEngine.onReady(() => {
      if (this.wanted && !this.playing) void this.apply(this.wanted);
    });
  }

  private effectiveVolume(): number {
    if (!this.settings.bgmEnabled) return 0;
    return this.settings.masterVolume * this.settings.bgmVolume;
  }

  private resolveScene(scene: BgmScene | null): BgmScene | null {
    if (scene !== "battle" || typeof document === "undefined") return scene;
    return document.querySelector(".unit-hud--enemy.unit-hud--boss") ? "boss" : "battle";
  }

  private prepare(): Promise<void> {
    if (this.preparing) return this.preparing;
    let done!: () => void;
    this.preparing = new Promise<void>((resolve) => (done = resolve));
    void (async () => {
      const ctx = await audioEngine.ensure();
      if (ctx) {
        this.master = ctx.createGain();
        this.master.gain.value = this.effectiveVolume();
        this.master.connect(ctx.destination);
      }
      done();
    })();
    return this.preparing;
  }

  private async load(ctx: AudioContext, scene: BgmScene): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(scene);
    if (cached) return cached;
    const manifest = await loadAudioManifest();
    const file = manifest?.[`bgm_${scene}`]?.[0];
    if (!file) return null;
    const buffer = await loadAudioBuffer(ctx, file);
    if (buffer) this.buffers.set(scene, buffer);
    return buffer;
  }

  /**
   * 同じ場面でも「wantedだけ残っていて実際には鳴っていない」なら再試行する。
   * 以前は `wanted === scene` だけで return していたため、初回の解錠や通信が一度
   * 失敗した端末では、その後何度描画しても二度とBGM開始処理へ入れなかった。
   */
  play(requestedScene: BgmScene | null): void {
    const scene = this.resolveScene(requestedScene);
    if (this.wanted === scene) {
      if (scene !== null && !this.playing && this.inflight !== scene) void this.apply(scene);
      return;
    }
    this.wanted = scene;
    void this.apply(scene);
  }

  private async apply(scene: BgmScene | null): Promise<void> {
    await this.prepare();
    if (scene === null) {
      this.stopCurrent(CROSSFADE_SEC);
      return;
    }
    if (this.effectiveVolume() <= 0) return;
    if (this.inflight === scene) return;
    this.inflight = scene;

    const ctx = await audioEngine.running();
    if (!ctx || !this.master) {
      this.inflight = null;
      return;
    }
    const buffer = await this.load(ctx, scene);
    this.inflight = null;
    if (!buffer || this.wanted !== scene) return;
    if (this.playing?.scene === scene) return;

    const fade = this.playing ? CROSSFADE_SEC : FADE_IN_SEC;
    this.stopCurrent(fade);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(1, ctx.currentTime + fade);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = 0;
    source.loopEnd = buffer.duration;
    source.connect(gain).connect(this.master);
    source.start();

    // 端末側でソースが予期せず終了した場合も、次回描画/タップで再開できる状態へ戻す。
    source.onended = () => {
      if (this.playing?.source === source) this.playing = null;
      gain.disconnect();
    };
    this.playing = { scene, source, gain };
  }

  private stopCurrent(fade: number): void {
    const current = this.playing;
    if (!current) return;
    this.playing = null;
    const ctx = current.gain.context;
    const now = ctx.currentTime;
    const level = Math.max(0.0001, current.gain.gain.value);
    current.gain.gain.cancelScheduledValues(now);
    current.gain.gain.setValueAtTime(level, now);
    current.gain.gain.exponentialRampToValueAtTime(0.0001, now + fade);
    current.source.stop(now + fade + 0.05);
  }

  /** いま鳴っている場面。鳴っていなければ null */
  currentScene(): BgmScene | null {
    return this.playing?.scene ?? null;
  }

  /**
   * ループが本当に閉じているかを確かめる。
   * ogg復号後の長さと継ぎ目の跳びを測るデバッグ用。
   */
  async measureLoop(scene: BgmScene, expectedSec = 32): Promise<Record<string, number> | null> {
    await this.prepare();
    const ctx = await audioEngine.running();
    if (!ctx) return null;
    const buffer = await this.load(ctx, scene);
    if (!buffer) return null;

    const data = buffer.getChannelData(0);
    const steps: number[] = [];
    for (let i = 1; i < data.length; i += 97) steps.push(Math.abs(data[i] - data[i - 1]));
    steps.sort((a, b) => a - b);
    const typical = steps[Math.floor(steps.length * 0.999)] || 1e-9;
    const seam = Math.abs(data[0] - data[data.length - 1]) / typical;

    let sum = 0;
    for (let i = 0; i < data.length; i += 17) sum += data[i] * data[i];
    return {
      秒: +buffer.duration.toFixed(3),
      余白ms: +((buffer.duration - expectedSec) * 1000).toFixed(1),
      継ぎ目: +seam.toFixed(2),
      実効値: +Math.sqrt(sum / Math.ceil(data.length / 17)).toFixed(4),
    };
  }
}

export const bgmPlayer = new BgmPlayer();
