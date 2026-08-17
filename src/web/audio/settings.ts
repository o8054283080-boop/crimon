/**
 * 音の設定。localStorage に保存する。
 *
 * BGMと効果音は別々に音量を持ち、それぞれ独立して切れる。
 * 「音が出ること」より「切れること」の方が事故が大きいので、
 * 読み込みに失敗しても既定値へ倒して必ず動く作りにしてある。
 */
export interface AudioSettings {
  /** 全体の音量 0..1 */
  masterVolume: number;
  /** BGMの音量 0..1(全体音量に乗算される) */
  bgmVolume: number;
  /** 効果音の音量 0..1(全体音量に乗算される) */
  sfxVolume: number;
  /** BGMを鳴らすか */
  bgmEnabled: boolean;
  /** 効果音を鳴らすか */
  sfxEnabled: boolean;
}

const STORAGE_KEY = "crimon.audio.v1";

/**
 * 既定値。BGMは効果音より一段低くしてある。
 * 戦闘で何が起きたかを伝えるのは効果音の役目で、BGMはその下に敷く空気だから。
 */
export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  masterVolume: 0.8,
  bgmVolume: 0.38,
  sfxVolume: 0.9,
  bgmEnabled: true,
  sfxEnabled: true,
};

function clamp01(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function readStorage(): AudioSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_AUDIO_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AudioSettings>;
    return {
      masterVolume: clamp01(parsed.masterVolume, DEFAULT_AUDIO_SETTINGS.masterVolume),
      bgmVolume: clamp01(parsed.bgmVolume, DEFAULT_AUDIO_SETTINGS.bgmVolume),
      sfxVolume: clamp01(parsed.sfxVolume, DEFAULT_AUDIO_SETTINGS.sfxVolume),
      bgmEnabled: parsed.bgmEnabled !== false,
      sfxEnabled: parsed.sfxEnabled !== false,
    };
  } catch {
    return { ...DEFAULT_AUDIO_SETTINGS };
  }
}

let current: AudioSettings | null = null;
const listeners = new Set<(settings: AudioSettings) => void>();

export function getAudioSettings(): AudioSettings {
  if (!current) current = readStorage();
  return { ...current };
}

export function updateAudioSettings(patch: Partial<AudioSettings>): AudioSettings {
  const next = { ...getAudioSettings(), ...patch };
  next.masterVolume = clamp01(next.masterVolume, DEFAULT_AUDIO_SETTINGS.masterVolume);
  next.bgmVolume = clamp01(next.bgmVolume, DEFAULT_AUDIO_SETTINGS.bgmVolume);
  next.sfxVolume = clamp01(next.sfxVolume, DEFAULT_AUDIO_SETTINGS.sfxVolume);
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 保存できない環境でも、そのセッション中は設定が効くようにする
  }
  for (const listener of listeners) listener({ ...next });
  return { ...next };
}

export function onAudioSettingsChange(listener: (settings: AudioSettings) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
