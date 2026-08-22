/**
 * BGMを鳴らす。
 *
 * 焼いたループ(`tools/audio/render_bgm.py`)をそのまま繰り返す。
 * ファイルは数学的に周期が閉じるように作ってあるので、継ぎ目をまたぐ処理は
 * ここでは何もしない。**クロスフェードで無理につなごうとしないこと。**
 * そこで何かが起きたと必ず分かってしまう。
 *
 * 旋律は持たない。「環境音 + 持続音 + まばらな出来事」だけで場の空気を敷く。
 * 理由は render_bgm.py の冒頭に書いてある。
 *
 * 音声文脈は `context.ts` の `audioEngine` が持つ。効果音と同じものを使う。
 */
import { audioEngine, loadAudioBuffer, loadAudioManifest } from "./context.js";
import { AudioSettings, getAudioSettings, onAudioSettingsChange } from "./settings.js";

/** 場面。焼いてあるのは2つだけで、戦闘以外はすべて拠点の音を敷く */
export type BgmScene = "home" | "battle";

/**
 * 場面を切り替える時の重なり(秒)。
 *
 * 短いと切り替わりが目立ち、長いと2曲が混ざって濁る。
 * 戦闘に入る瞬間は「切り替わった」と分かってよいので、やや短めに取る。
 */
const CROSSFADE_SEC = 1.6;

/** 鳴り始めの立ち上がり。無音から一気に出すと、そこだけ事故のように聞こえる */
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
  /** 読み込み中の場面。同じものを二重に取りに行かないようにする */
  private inflight: BgmScene | null = null;

  constructor() {
    onAudioSettingsChange((next) => {
      const wasEnabled = this.settings.bgmEnabled;
      this.settings = next;
      if (this.master) this.master.gain.value = this.effectiveVolume();
      // 設定で切ってから戻した時は、鳴らし直さないと二度と始まらない
      if (!wasEnabled && next.bgmEnabled && this.wanted) void this.apply(this.wanted);
    });
    // 解錠は最初のタップまで来ない。来た時点で、待っていた場面を鳴らし始める
    audioEngine.onReady(() => {
      if (this.wanted && !this.playing) void this.apply(this.wanted);
    });
  }

  private effectiveVolume(): number {
    if (!this.settings.bgmEnabled) return 0;
    return this.settings.masterVolume * this.settings.bgmVolume;
  }

  /**
   * 出力へつなぐ枝を用意する。
   *
   * **記憶への代入を、本体を走らせる前に済ませること。** `audioEngine.ensure()`
   * は解錠を知らせる時に聞き手(この組の `onReady`)を呼ぶので、代入が後だと
   * 「まだ用意されていない」と見えて再入し、無限に往復する。
   */
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
   * 場面を指定する。`null` で止める。
   *
   * 同じ場面を何度渡しても鳴らし直さない。画面の再描画のたびに呼ばれても
   * 曲が頭から鳴り直さないようにするため。
   */
  play(scene: BgmScene | null): void {
    if (this.wanted === scene) return;
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
    // 読んでいる間に別の場面へ移っていたら、それはもう要らない
    if (!buffer || this.wanted !== scene) return;
    if (this.playing?.scene === scene) return;

    const fade = this.playing ? CROSSFADE_SEC : FADE_IN_SEC;
    this.stopCurrent(fade);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    // 音量の変化は指数で。直線で動かすと、途中で音が大きくなったように聞こえる
    gain.gain.exponentialRampToValueAtTime(1, ctx.currentTime + fade);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    // 焼いた時点で周期が閉じているので、端をまたいでそのまま繰り返してよい
    source.loop = true;
    source.loopStart = 0;
    source.loopEnd = buffer.duration;
    source.connect(gain).connect(this.master);
    source.start();

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
    // 消えてから止める。止めてから消すと、そこでプツッと鳴る
    current.source.stop(now + fade + 0.05);
    current.source.onended = () => current.gain.disconnect();
  }

  /** いま鳴っている場面。鳴っていなければ null */
  currentScene(): BgmScene | null {
    return this.playing?.scene ?? null;
  }

  /**
   * ループが本当に閉じているかを確かめる。
   *
   * ogg の復号は、符号化の都合で前後に余白が付くことがある。余白が残ると
   * ループのたびにそこだけ無音になり、**焼く側でどれだけ丁寧に周期を
   * 閉じても意味がなくなる。** 焼いた長さと復号後の長さを突き合わせる。
   */
  async measureLoop(scene: BgmScene, expectedSec = 32): Promise<Record<string, number> | null> {
    await this.prepare();
    const ctx = await audioEngine.running();
    if (!ctx) return null;
    const buffer = await this.load(ctx, scene);
    if (!buffer) return null;

    const data = buffer.getChannelData(0);
    // 継ぎ目の跳びを、曲中のふつうの1サンプルぶんの動きと比べる
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
