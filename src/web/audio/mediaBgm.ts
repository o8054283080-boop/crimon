/**
 * BGMの互換再生。**Web Audio で鳴らせない端末のための、もう1本の道。**
 *
 * iPhoneのSafariは `decodeAudioData()` で失敗することがあり、その時は
 * `<audio>` から鳴らすしかない。以前もその道は用意してあったが、次の3つが
 * 抜けていて、**「鳴っている」と表示されるのに無音**という状態から抜けられなかった。
 *
 *   1. `new Audio()` を鳴らすたび作って捨てていた。iPhoneでは、画面に
 *      置かれていない使い捨ての要素は素直に鳴らないことがある
 *   2. `paused === false` を「鳴っている」の証拠にしていた。iPhoneは
 *      **止められた後も paused を false のまま**にすることがある
 *   3. `play()` が拒まれても、次の操作で試し直していなかった
 *
 * 同じ端末で正常に鳴っている Monster-farm は、`<audio>` を最初から画面に置き、
 * 再生位置(`currentTime`)が実際に進んでいるかを見張り、進んでいなければ
 * 鳴らし直す、という作りになっている。ここはその考え方を移したもの。
 *
 * **鳴っているかどうかは、フラグではなく再生位置で判定する。**
 */
import { audioEngine, audioFileUrl } from "./context.js";
import type { BgmScene } from "./bgm.js";
import { AudioSettings, getAudioSettings, onAudioSettingsChange } from "./settings.js";

/** 見張りの間隔。短すぎると電池を食い、長すぎると無音の時間が伸びる */
const WATCHDOG_INTERVAL_MS = 700;
/** 見張り続ける長さ。これで直らなければ諦め、次のきっかけでまた動きだす */
const WATCHDOG_WINDOW_MS = 20000;
/** 鳴らし直しの連打防止。詰まった音が重なるのを避ける */
const RESTART_COOLDOWN_MS = 1500;
/** 何回続けて再生位置が進まなければ「止まっている」と見なすか */
const STALL_LIMIT = 2;

/** 見張りが1回ぶんに見る値。**すべて外から測れるものだけで組む** */
export interface BgmProbe {
  /** `HTMLAudioElement.paused`。**これだけでは鳴っている証拠にならない** */
  paused: boolean;
  /** いまの再生位置(秒) */
  currentTime: number;
  /** 前回測った再生位置。-1 なら未計測 */
  previousTime: number;
  /** これまで何回続けて進まなかったか */
  stallCount: number;
  /** 画面が表に出ているか */
  visible: boolean;
  /** 実効音量(全体×BGM。スイッチが切れていれば0) */
  volume: number;
}

export interface BgmVerdict {
  /** 実際に音が進んでいると**確かめられた**か */
  healthy: boolean;
  /** 次回へ持ち越す回数 */
  stallCount: number;
  /** 鳴らし直すべきか(時間の間隔は呼ぶ側が見る) */
  shouldRestart: boolean;
  /** 見張りをやめてよいか */
  canStop: boolean;
}

/**
 * 「鳴っているか」を判定する。
 *
 * **`paused === false` を証拠にしない。**iPhoneは止められた後も
 * これを false のままにすることがあり、そのせいで
 * 「互換再生中」と表示しながら無音、という状態が続いていた。
 * **前回測った位置から進んだかどうか**だけが証拠になる。
 *
 * ループで頭へ戻った時は位置が減る。それも「進んだ」として扱う。
 */
export function judgeBgmHealth(probe: BgmProbe): BgmVerdict {
  // 裏に回っている時と音量0の時は、鳴っていなくて正しい。手を出さない
  if (!probe.visible || probe.volume <= 0) {
    return { healthy: false, stallCount: 0, shouldRestart: false, canStop: true };
  }
  if (probe.paused) {
    return { healthy: false, stallCount: 0, shouldRestart: true, canStop: false };
  }
  if (probe.previousTime < 0) {
    // まだ測っていない。「鳴っている」と断定しないが、鳴らし直しもしない
    return { healthy: false, stallCount: 0, shouldRestart: false, canStop: false };
  }
  const moved = probe.currentTime > probe.previousTime + 0.01 || probe.currentTime < probe.previousTime;
  if (moved) return { healthy: true, stallCount: 0, shouldRestart: false, canStop: true };
  const stallCount = probe.stallCount + 1;
  return { healthy: false, stallCount, shouldRestart: stallCount >= STALL_LIMIT, canStop: false };
}

export interface MediaBgmDiagnostics {
  /** 鳴らそうとしている場面 */
  scene: BgmScene | null;
  /** その場面の要素があるか */
  hasElement: boolean;
  paused: boolean | null;
  currentTime: number | null;
  /** 再生位置が進んでいるか。見張っていない間は null */
  advancing: boolean | null;
  readyState: number | null;
  networkState: number | null;
  src: string | null;
  /** 最後に play() が拒まれた理由 */
  lastPlayError: string | null;
  watchdogRunning: boolean;
  /** 次の操作で鳴らし直す予定か */
  waitingForGesture: boolean;
}

class MediaBgmPlayer {
  private elements = new Map<BgmScene, HTMLAudioElement>();
  private wanted: BgmScene | null = null;
  private settings: AudioSettings = getAudioSettings();

  private watchdogTimer: number | null = null;
  private watchdogUntil = 0;
  private probeScene: BgmScene | null = null;
  private probeTime = -1;
  private stallCount = 0;
  private lastRestartAt = 0;
  private advancing: boolean | null = null;
  private lastPlayError: string | null = null;
  private waitingForGesture = false;
  private installed = false;

  constructor() {
    onAudioSettingsChange((next) => {
      this.settings = next;
      this.applyVolume();
      if (this.effectiveVolume() <= 0) this.pauseAll();
      else if (this.wanted) this.start(this.wanted);
    });
  }

  /** 画面の操作・復帰を拾えるようにする。`initAudio()` から一度だけ呼ぶ */
  install(): void {
    if (this.installed || typeof window === "undefined") return;
    this.installed = true;

    /*
     * **操作のたびに試し直す。**iPhoneは操作の外からの `play()` を拒むので、
     * 拒まれた側は次に画面が触られるのを待つしかない。
     */
    audioEngine.onGesture(() => {
      if (!this.wanted) return;
      this.waitingForGesture = false;
      this.start(this.wanted);
      this.startWatchdog();
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") {
        // **裏では必ず止める。**音楽アプリのように鳴り続けさせない
        this.pauseAll();
        this.stopWatchdog();
        return;
      }
      if (this.wanted) {
        this.start(this.wanted);
        // 見た目が正常でも必ず見張る。「進んでいない」はここでしか捕まらない
        this.startWatchdog();
      }
    });
    window.addEventListener("pageshow", () => {
      if (document.visibilityState !== "visible" || !this.wanted) return;
      this.start(this.wanted);
      this.startWatchdog();
    });
    window.addEventListener("pagehide", () => {
      this.pauseAll();
      this.stopWatchdog();
    });
  }

  private effectiveVolume(): number {
    if (!this.settings.bgmEnabled) return 0;
    return this.settings.masterVolume * this.settings.bgmVolume;
  }

  /**
   * その場面の `<audio>` を用意する。**一度作ったら捨てない。**
   *
   * 画面に置くのは、使い捨ての要素だと鳴らない端末があるため。
   * 目にも読み上げにも入らないよう、大きさを持たせず `aria-hidden` にする。
   */
  private element(scene: BgmScene): HTMLAudioElement | null {
    if (typeof document === "undefined") return null;
    const existing = this.elements.get(scene);
    if (existing) return existing;

    const audio = document.createElement("audio");
    audio.src = audioFileUrl(`bgm_${scene}`);
    audio.loop = true;
    audio.preload = "auto";
    audio.setAttribute("playsinline", "");
    audio.setAttribute("aria-hidden", "true");
    audio.dataset.bgmScene = scene;
    audio.volume = Math.max(0, Math.min(1, this.effectiveVolume()));
    audio.style.cssText = "position:absolute;width:0;height:0;opacity:0;pointer-events:none";
    document.body.append(audio);
    this.elements.set(scene, audio);
    return audio;
  }

  private applyVolume(): void {
    const volume = Math.max(0, Math.min(1, this.effectiveVolume()));
    for (const audio of this.elements.values()) {
      try {
        audio.volume = volume;
      } catch {
        // iPhoneのSafariは .volume を無視する。鳴ること自体は妨げないので進む
      }
    }
  }

  private pauseAll(except?: BgmScene): void {
    for (const [scene, audio] of this.elements) {
      if (scene === except) continue;
      try {
        audio.pause();
      } catch {
        // 既に止まっている
      }
    }
  }

  /** 鳴らす場面を指定する。`null` で止める */
  play(scene: BgmScene | null): void {
    this.wanted = scene;
    if (scene === null) {
      this.pauseAll();
      this.stopWatchdog();
      return;
    }
    this.start(scene);
    this.startWatchdog();
  }

  private start(scene: BgmScene): void {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    if (this.effectiveVolume() <= 0) return;
    const audio = this.element(scene);
    if (!audio) return;
    this.pauseAll(scene);
    this.applyVolume();
    if (!audio.paused) return;

    const promise = audio.play();
    if (promise && typeof promise.then === "function") {
      promise.then(
        () => {
          this.lastPlayError = null;
          this.waitingForGesture = false;
        },
        (error: unknown) => {
          // **握り潰さない。**拒まれたことが分からないと、次の一手を選べない
          this.lastPlayError = (error as Error)?.name ?? "不明";
          this.waitingForGesture = true;
          this.startWatchdog();
        },
      );
    }
  }

  /**
   * 詰まりを解いて鳴らし直す。
   *
   * **止まっている要素に `currentTime` を書き込んではいけない。**
   * 止められた直後の要素へシークすると、位置を読み直せずに曲の頭へ
   * 戻ってしまうことがある。止まっているなら位置はそのまま残っているので、
   * 何も触らずに鳴らし直すのが正しい。
   */
  private restart(scene: BgmScene): void {
    const audio = this.elements.get(scene);
    if (!audio) return;
    if (audio.paused) {
      this.start(scene);
      return;
    }
    const position = audio.currentTime;
    try {
      audio.pause();
      audio.currentTime = position;
    } catch {
      // シークできない端末。頭出しになるが、無音のままよりよい
    }
    this.start(scene);
  }

  private startWatchdog(): void {
    if (typeof window === "undefined") return;
    if (this.effectiveVolume() <= 0 || !this.wanted) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const now = Date.now();
    this.watchdogUntil = Math.max(this.watchdogUntil, now + WATCHDOG_WINDOW_MS);
    if (this.watchdogTimer !== null) return;
    const audio = this.elements.get(this.wanted);
    this.probeScene = this.wanted;
    this.probeTime = audio ? audio.currentTime : -1;
    this.stallCount = 0;
    this.watchdogTimer = window.setInterval(() => this.tick(), WATCHDOG_INTERVAL_MS);
  }

  private stopWatchdog(): void {
    if (this.watchdogTimer !== null) {
      window.clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    this.watchdogUntil = 0;
    this.probeScene = null;
    this.probeTime = -1;
    this.stallCount = 0;
    this.advancing = null;
  }

  /**
   * 1回ぶんの見張り。
   *
   * `paused === false` は「鳴っている」の証拠にならない。
   * **前回測った再生位置から進んだかどうか**だけが証拠になる。
   */
  private tick(): void {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const scene = this.wanted;
    if (!scene || this.effectiveVolume() <= 0) {
      this.stopWatchdog();
      return;
    }
    const audio = this.elements.get(scene);
    if (!audio) {
      this.start(scene);
      return;
    }

    const verdict = judgeBgmHealth({
      paused: audio.paused,
      currentTime: audio.currentTime,
      previousTime: this.probeScene === scene ? this.probeTime : -1,
      stallCount: this.stallCount,
      visible: true,
      volume: this.effectiveVolume(),
    });
    this.advancing = verdict.healthy;
    this.stallCount = verdict.stallCount;
    this.probeScene = scene;
    this.probeTime = audio.currentTime;

    const now = Date.now();
    if (verdict.shouldRestart && now - this.lastRestartAt > RESTART_COOLDOWN_MS) {
      this.lastRestartAt = now;
      this.stallCount = 0;
      this.restart(scene);
    }
    if (verdict.healthy) {
      this.stopWatchdog();
      this.advancing = true;
      return;
    }
    if (now > this.watchdogUntil) this.stopWatchdog();
  }

  /** いま鳴らしている場面。止まっているなら null */
  currentScene(): BgmScene | null {
    if (!this.wanted) return null;
    const audio = this.elements.get(this.wanted);
    return audio && !audio.paused ? this.wanted : null;
  }

  diagnostics(): MediaBgmDiagnostics {
    const scene = this.wanted;
    const audio = scene ? this.elements.get(scene) ?? null : null;
    return {
      scene,
      hasElement: Boolean(audio),
      paused: audio ? audio.paused : null,
      currentTime: audio ? audio.currentTime : null,
      advancing: this.advancing,
      readyState: audio ? audio.readyState : null,
      networkState: audio ? audio.networkState : null,
      src: audio ? audio.src.split("/").pop() ?? null : null,
      lastPlayError: this.lastPlayError,
      watchdogRunning: this.watchdogTimer !== null,
      waitingForGesture: this.waitingForGesture,
    };
  }

  /** テスト用。持ち物をすべて捨てる */
  resetForTest(): void {
    this.stopWatchdog();
    for (const audio of this.elements.values()) audio.remove();
    this.elements.clear();
    this.wanted = null;
    this.lastPlayError = null;
    this.waitingForGesture = false;
    this.lastRestartAt = 0;
    this.settings = getAudioSettings();
  }
}

export const mediaBgmPlayer = new MediaBgmPlayer();
