/**
 * どの形式の音源を読むか、そして読めたのか読めなかったのかを覚えておく場所。
 *
 * **CRIMONの音源はもともとOGG(Vorbis)だけだった。**iPhoneのSafariはこれを
 * 再生できない。`decodeAudioData()` は EncodingError になり、`<audio>` へ
 * 渡しても「再生中(paused === false)」の顔をしたまま音だけ出ない——
 * つまり**どこを見ても「鳴っている」と表示されるのに無音**という、
 * いちばん切り分けにくい壊れ方をする。
 *
 * 同じ端末で正常に鳴っている Monster-farm を見ると、BGMはMP3、SEはWAVで、
 * iPhoneが確実に再生できる形式しか使っていなかった。**形式が根本の差**だった。
 *
 * そこで同じ音をAAC/M4Aでも焼いてリポジトリへ置き、端末が再生できる方を
 * ここで選ぶ。manifest には従来どおりOGGの名前が並んでいるので、
 * 拡張子だけを差し替えて使う。
 *
 * **公開先によって配られる物が違ってはいけない。**以前はM4Aへの変換を
 * GitHub Pages のワークフローの中だけで行っていたため、
 * Cloudflare Pages 経由で配られた本番にはM4Aが1つも無く、
 * iPhoneには永久にOGGしか届かなかった。だから音源そのものを控えに入れてある。
 */

export type AudioFormat = "ogg" | "m4a";

const EXTENSION: Record<AudioFormat, string> = { ogg: ".ogg", m4a: ".m4a" };
const MIME: Record<AudioFormat, string> = {
  ogg: 'audio/ogg; codecs="vorbis"',
  m4a: 'audio/mp4; codecs="mp4a.40.2"',
};

let detected: AudioFormat | null = null;
/** 復号に失敗した形式と、その理由。**形式ごとに持つ**のが要点 */
const decodeFailures = new Map<AudioFormat, string>();
let lastSuccessfulFile: string | null = null;
let lastFailedFile: string | null = null;

function canPlay(format: AudioFormat): boolean {
  if (typeof document === "undefined") return true;
  try {
    // `canPlayType` は "probably" / "maybe" / "" を返す。"" 以外なら望みがある
    return document.createElement("audio").canPlayType(MIME[format]) !== "";
  } catch {
    return true;
  }
}

/**
 * この端末で読む形式。
 *
 * **OGGを再生できない端末はM4Aへ倒す。**判定は一度だけ。
 * `canPlayType` が嘘をつく端末のために、実際に復号へ失敗した形式は
 * `effectiveAudioFormat()` 側でもう一段だけ避ける。
 */
export function preferredAudioFormat(): AudioFormat {
  if (detected) return detected;
  detected = formatFromUrl() ?? (canPlay("ogg") ? "ogg" : canPlay("m4a") ? "m4a" : "ogg");
  return detected;
}

/**
 * `?audio=m4a` で形式を指定できる。
 *
 * **手元に無い端末を確かめるための窓口。**「iPhoneでは鳴らない」と言われた時、
 * こちらの端末では常にOGGが選ばれるので、M4Aの道が生きているかを確かめられない。
 * URLで固定できれば、**依頼主自身が実機で切り替えて試せる。**
 * どちらを使っているかは設定画面の診断にも出る。
 */
function formatFromUrl(): AudioFormat | null {
  if (typeof location === "undefined") return null;
  try {
    const value = new URLSearchParams(location.search).get("audio");
    if (value === "ogg" || value === "m4a") {
      urlOverride = value;
      return value;
    }
  } catch {
    // URLを読めない環境。自動判定に任せる
  }
  return null;
}

let urlOverride: AudioFormat | null = null;

/** 形式をURLで指定されているか。診断表示で「自動」と区別する */
export function audioFormatOverridden(): boolean {
  return urlOverride !== null;
}

/**
 * いま実際に使う形式。
 *
 * 望ましい形式で復号に失敗していて、もう一方では失敗していないなら乗り換える。
 * `canPlayType` が "maybe" を返しておきながら復号できない端末を、
 * ここで1回だけ拾う。
 */
export function effectiveAudioFormat(): AudioFormat {
  const preferred = preferredAudioFormat();
  const other: AudioFormat = preferred === "ogg" ? "m4a" : "ogg";
  if (decodeFailures.has(preferred) && !decodeFailures.has(other)) return other;
  return preferred;
}

/** ファイル名の形式 */
export function formatOf(file: string): AudioFormat {
  return file.toLowerCase().endsWith(".m4a") ? "m4a" : "ogg";
}

/**
 * manifest に載っている名前を、この端末で読む形式へ揃える。
 *
 * manifest は配信先によって `.ogg` と `.m4a` のどちらで書かれていることもある
 * (GitHub Pages のワークフローが公開時に書き換える)。どちらから来ても
 * 同じ答えになるよう、拡張子を落としてから付け直す。
 */
export function resolveAudioFile(file: string, format: AudioFormat = effectiveAudioFormat()): string {
  const stem = file.replace(/\.(ogg|m4a)$/i, "");
  return `${stem}${EXTENSION[format]}`;
}

/**
 * 読めた。**その形式の古い失敗を消す。**
 *
 * ここを消していなかったため、起動時にOGGで1回失敗した端末は、
 * その後M4Aで問題なく読めるようになっても「復号できない」という
 * 古い記録を握り続け、いつまでも互換再生へ落ちていた。
 */
export function noteAudioLoadSuccess(file: string): void {
  lastSuccessfulFile = file;
  decodeFailures.delete(formatOf(file));
}

/** 読めなかった。形式ごとに理由を覚える */
export function noteAudioLoadFailure(file: string, reason: string, decodeFailed: boolean): void {
  lastFailedFile = file;
  if (decodeFailed) decodeFailures.set(formatOf(file), reason);
}

/** いま使っている形式で復号に失敗しているか。互換再生へ落とすかの判断に使う */
export function decodeFailedForCurrentFormat(): boolean {
  return decodeFailures.has(effectiveAudioFormat());
}

export interface AudioLoadReport {
  /** この端末で選んだ形式 */
  format: AudioFormat;
  /** 最後に読めた音源。null なら1つも読めていない */
  lastSuccessfulFile: string | null;
  lastSuccessfulFormat: AudioFormat | null;
  /** 最後に読めなかった音源 */
  lastFailedFile: string | null;
  lastFailedFormat: AudioFormat | null;
  /** いまの形式で復号に失敗した理由。null なら失敗していない */
  decodeFailure: string | null;
}

/** 診断表示のためのまとめ。**どのファイルがどの形式で失敗したか**まで出す */
export function audioLoadReport(): AudioLoadReport {
  const format = effectiveAudioFormat();
  return {
    format,
    lastSuccessfulFile,
    lastSuccessfulFormat: lastSuccessfulFile ? formatOf(lastSuccessfulFile) : null,
    lastFailedFile,
    lastFailedFormat: lastFailedFile ? formatOf(lastFailedFile) : null,
    decodeFailure: decodeFailures.get(format) ?? null,
  };
}

/** テスト用。判定と記録をまっさらへ戻す */
export function resetAudioFormatStateForTest(): void {
  detected = null;
  urlOverride = null;
  decodeFailures.clear();
  lastSuccessfulFile = null;
  lastFailedFile = null;
}
