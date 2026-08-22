/**
 * 焼いた効果音を鳴らす。
 *
 * 以前はブラウザ上で毎回合成していたが、リアルタイムでは
 * リバーブなどの重い処理が使えず、どう作っても安っぽさから抜けられなかった。
 * いまは `tools/audio/render.py` で事前に焼いた ogg を読み込んで鳴らしている。
 *
 * **組み合わせで鳴らす**。当たり方(4種)と属性(6種)を全部焼くと24通りだが、
 * 当たりの芯と属性の色を別ファイルにして重ねているので、10ファイルで足りる。
 *
 * 音声文脈は `context.ts` の `audioEngine` が持つ。BGMと同じ文脈を使うこと。
 * 別々に作ると、後から作った方が止まったままになって片方だけ鳴らなくなる。
 */
import { audioEngine, loadAudioBuffer, loadAudioManifest, measureOutput } from "./context.js";
import { AudioSettings, getAudioSettings, onAudioSettingsChange } from "./settings.js";

export type SfxElement = "FIRE" | "WATER" | "ELECTRIC" | "GRASS" | "LIGHT" | "DARK" | "NEUTRAL";
export type HitStyle = "slash" | "blunt" | "pierce" | "magic";

/** 単体で鳴らせる音の名前。当たりの芯と属性の色は `playHit` 経由で重ねる */
export type SfxName =
  | "whiff"
  | "shield"
  | "death"
  | "heal"
  | "buff"
  | "debuff"
  | "charge"
  | "turnAlly"
  | "turnEnemy"
  | "tap"
  | "select"
  | "denied"
  | "victory"
  | "defeat"
  | "summon"
  | "summonRare"
  | "levelUp"
  | "enhance"
  | "enhanceFail"
  | "stageClear";

export interface HitOptions {
  element?: SfxElement;
  hitStyle?: HitStyle;
  /** 会心。専用の層が重なる */
  crit?: boolean;
  /** 0.5〜2程度。ダメージの大きさに応じて渡す */
  power?: number;
}

/**
 * 同時に鳴らす音の上限。
 *
 * 全体攻撃は4体に同時着弾するため、素直に鳴らすと同じ音が4重になって
 * 音量が跳ね上がり、潰れて何も聞き取れなくなる(加算合成で画面が白く飛ぶのと同じ)。
 */
const MAX_CONCURRENT = 10;

/** 同じ音がこの秒数以内に連続したら間引く。連打で音が団子になるのを防ぐ */
const RETRIGGER_GUARD_SEC = 0.02;

/**
 * 属性の色をどこに置くか。
 *
 * **芯と同じ時刻に重ねると、属性を変えても違いが聞き取れない。**
 * 属性ごとに鳴り出す時刻をずらし、埋もれやすい低中域のものは音量も上げる。
 *
 * - 高い帯域のもの(雷・光)は芯と喧嘩しないので、そのまま重ねてよい
 * - 低中域のもの(火・草・闇)は芯の真下に入るので、遅らせて隙間に置く
 * - 闇は焼いた時点で0.3秒あたりが山になっている(逆包絡をそのまま使うと
 *   山がファイルの末尾に来て、着弾の800ms後に鳴っていた)
 */
const FLAVOR_PLACEMENT: Record<Exclude<SfxElement, "NEUTRAL">, { delay: number; gain: number }> = {
  FIRE: { delay: 0.045, gain: 1.15 },
  WATER: { delay: 0.012, gain: 1.0 },
  ELECTRIC: { delay: 0.0, gain: 0.8 },
  GRASS: { delay: 0.03, gain: 1.15 },
  LIGHT: { delay: 0.035, gain: 0.85 },
  DARK: { delay: 0.0, gain: 1.2 },
};

class SfxPlayer {
  private master: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer[]>();
  private preparing: Promise<void> | null = null;
  private live = 0;
  private lastPlayedAt = new Map<string, number>();
  private settings: AudioSettings = getAudioSettings();

  constructor() {
    onAudioSettingsChange((next) => {
      this.settings = next;
      if (this.master) this.master.gain.value = this.effectiveVolume();
    });
  }

  private effectiveVolume(): number {
    if (!this.settings.sfxEnabled) return 0;
    return this.settings.masterVolume * this.settings.sfxVolume;
  }

  /**
   * 音を使えるようにする。**ブラウザは操作前に音を出せない**ので、
   * 実際に鳴り始めるのは最初のタップから。
   */
  unlock(): void {
    audioEngine.installUnlock();
  }

  /** 出力へつなぐ枝を用意する。文脈そのものは `audioEngine` が持つ */
  private prepare(): Promise<void> {
    if (this.preparing) return this.preparing;
    this.preparing = (async () => {
      const ctx = await audioEngine.ensure();
      if (!ctx) return;
      this.master = ctx.createGain();
      this.master.gain.value = this.effectiveVolume();
      this.master.connect(ctx.destination);
      // 音が読めなくてもゲームは動くべきなので、失敗しても静かに進む
      await loadAudioManifest();
    })();
    return this.preparing;
  }

  /** 必要になった時点で読む。全部を先読みすると初回表示が遅くなる */
  private async load(ctx: AudioContext, name: string): Promise<AudioBuffer[] | null> {
    const cached = this.buffers.get(name);
    if (cached) return cached;
    const manifest = await loadAudioManifest();
    const files = manifest?.[name];
    if (!files) return null;

    const decoded = (await Promise.all(files.map((file) => loadAudioBuffer(ctx, file)))).filter(
      (buffer): buffer is AudioBuffer => buffer !== null,
    );
    if (decoded.length === 0) return null;
    this.buffers.set(name, decoded);
    return decoded;
  }

  /**
   * 1層鳴らす。`detune` は半音ではなくセント。
   * 焼いた音は3〜5通りしかないので、再生時にわずかに音程と音量を散らして
   * 「同じ音の繰り返し」に聞こえないようにしている。
   */
  private async emit(name: string, gain: number, delaySec = 0, detuneCents = 0): Promise<void> {
    if (this.effectiveVolume() <= 0) return;
    await this.prepare();
    // 画面を離れている間などに勝手に止まることがある。鳴らす前に必ず起こす
    const ctx = await audioEngine.running();
    if (!ctx || !this.master) return;

    const now = ctx.currentTime;
    const last = this.lastPlayedAt.get(name) ?? -1;
    if (now - last < RETRIGGER_GUARD_SEC) return;
    if (this.live >= MAX_CONCURRENT) return;

    const buffers = await this.load(ctx, name);
    if (!buffers || buffers.length === 0) return;

    const source = ctx.createBufferSource();
    source.buffer = buffers[Math.floor(Math.random() * buffers.length)];
    source.detune.value = detuneCents + (Math.random() - 0.5) * 90;

    const node = ctx.createGain();
    node.gain.value = gain * (0.88 + Math.random() * 0.24);
    source.connect(node).connect(this.master);

    this.live += 1;
    source.onended = () => {
      this.live -= 1;
      node.disconnect();
    };
    this.lastPlayedAt.set(name, now);
    source.start(now + delaySec);
  }

  play(name: SfxName, gain = 1): void {
    void this.emit(name, gain);
  }

  /**
   * 音声文脈の状態。鳴らない時に真っ先に見る値。
   * "suspended" のままなら、操作による解錠ができていない。
   */
  contextState(): string {
    return audioEngine.state();
  }

  /**
   * 実際に鳴っている音を測る(焼いたファイル単体ではなく、再生経路を通った後)。
   *
   * 音は画面では確かめられないので、数値で裏を取るための窓口。
   * `純音らしさ` が高いほど「ピコピコ」寄り。打撃系で0.5を超えていたら疑うこと。
   */
  async measure(name: SfxName, ms = 900): Promise<Record<string, number> | null> {
    await this.prepare();
    const ctx = await audioEngine.running();
    if (!ctx || !this.master) return null;
    return measureOutput(ctx, this.master, () => this.play(name), ms);
  }

  /** 着弾の音を測る。属性の層が芯に埋もれていないかを確かめる時に使う */
  async measureHit(options: HitOptions = {}, ms = 900): Promise<Record<string, number> | null> {
    await this.prepare();
    const ctx = await audioEngine.running();
    if (!ctx || !this.master) return null;
    return measureOutput(ctx, this.master, () => this.playHit(options), ms);
  }

  /**
   * 攻撃の着弾。芯・属性の色・会心を重ねる。
   *
   * 属性の違いは色ではなく**間**で出している。芯より少し遅れて属性の層を置くと、
   * 同時に鳴らすより属性がはっきり聞き分けられる。置き方は `FLAVOR_PLACEMENT`。
   */
  playHit(options: HitOptions = {}): void {
    const style = options.hitStyle ?? "magic";
    const element = options.element ?? "NEUTRAL";
    const power = Math.max(0.4, Math.min(2, options.power ?? 1));

    // 重い攻撃ほど低く鳴らす。音量だけで大きさを出そうとすると上限に当たる
    const detune = (1 - power) * 140;
    void this.emit(`impact_${style}`, 0.55 + power * 0.3, 0, detune);

    if (element !== "NEUTRAL") {
      const placement = FLAVOR_PLACEMENT[element];
      void this.emit(`flavor_${element}`, (0.34 + power * 0.12) * placement.gain, placement.delay, detune * 0.5);
    }
    if (options.crit) {
      void this.emit("crit", 0.5, 0.008, -60);
    }
  }
}

export const sfxPlayer = new SfxPlayer();
