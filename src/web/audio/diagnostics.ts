/**
 * 音がいまどうなっているかを、そのまま読める形で並べる。
 *
 * **「音を鳴らせる状態です」だけでは何も分からなかった。**
 * iOS 18.7.8 の実機で、設定画面には
 *
 *   音を鳴らせる状態です
 *   BGM: 互換再生中（HTML Audio / home）
 *
 * と出ているのに、実際には無音、という報告を受けた。
 * `AudioContext.state === "running"` も `HTMLAudioElement.paused === false` も
 * **実際に音が出ていることの証拠にならない**ということ。
 *
 * だから「鳴っているつもり」ではなく、**確かめられる値**を出す。
 * 再生位置が進んでいるか、どの形式のどのファイルが読めて何が読めなかったか、
 * 見張り番が動いているか。ここを1枚撮ってもらえば、どこで止まっているか分かる。
 */
import { bgmPlayer } from "./bgm.js";
import { audioEngine, audioLoadReport, audioManifestState, audioSessionType } from "./context.js";
import { mediaBgmPlayer } from "./mediaBgm.js";
import { audioFormatOverridden, decodeFailedForCurrentFormat } from "./format.js";
import { sfxPlayer } from "./player.js";
import { getAudioSettings } from "./settings.js";

export interface AudioDiagnosticLine {
  label: string;
  value: string;
  /** 見て問題がある行。設定画面で色を変える */
  bad?: boolean;
}

/** BGMをどちらの道で鳴らしているか */
export function bgmRoute(): "Web Audio" | "HTML Audio" {
  return decodeFailedForCurrentFormat() ? "HTML Audio" : "Web Audio";
}

/**
 * 実際に音が出ていると**確かめられた**か。
 *
 * 「たぶん出ている」は出さない。互換再生なら再生位置が進んだことを、
 * Web Audio なら鳴らしている音源があることを根拠にする。
 */
function soundConfirmed(): boolean {
  if (bgmRoute() === "HTML Audio") return mediaBgmPlayer.diagnostics().advancing === true;
  return bgmPlayer.currentScene() !== null;
}

function formatSeconds(value: number | null): string {
  return value === null ? "—" : value.toFixed(2);
}

/**
 * 設定画面へ出す行の並び。
 *
 * **順番に意味がある。**上から順に「音を出せる状態か」→「どの道で」→
 * 「その道は本当に動いているか」→「音源は読めているか」と辿れるようにしてある。
 */
export function audioDiagnosticLines(): AudioDiagnosticLine[] {
  const settings = getAudioSettings();
  const state = audioEngine.state();
  const route = bgmRoute();
  const media = mediaBgmPlayer.diagnostics();
  const report = audioLoadReport();
  const sfx = sfxPlayer.diagnostics();
  const wanted = bgmPlayer.wantedScene();

  const lines: AudioDiagnosticLine[] = [
    /*
     * **まとめもこの表の中に置く。**
     *
     * 以前は設定画面の別の場所に「音を鳴らせる状態です」と出していたが、
     * あちらは画面を描いた時の値で止まる。表だけが動くので、
     * **「音が止まっています」と「鳴らしています」が同じ画面に並んでいた。**
     * 食い違った表示は、無いより悪い。
     */
    { label: "いまの状態", value: bgmDiagnosisSummary(), bad: !soundConfirmed() },
    { label: "AudioContext", value: state, bad: state !== "running" },
    { label: "AudioSession", value: audioSessionType() },
    { label: "BGM形式", value: audioFormatOverridden() ? `${report.format}（URLで指定）` : report.format },
    { label: "BGM方式", value: route },
    { label: "BGM場面", value: wanted ?? media.scene ?? "なし" },
  ];

  if (route === "HTML Audio") {
    lines.push(
      { label: "BGM paused", value: media.paused === null ? "—" : String(media.paused), bad: media.paused === true },
      { label: "BGM readyState", value: media.readyState === null ? "—" : String(media.readyState), bad: media.readyState === 0 },
      { label: "BGM currentTime", value: formatSeconds(media.currentTime) },
      {
        label: "BGM時計",
        value: media.advancing === null ? "未計測" : media.advancing ? "正常" : "停止",
        bad: media.advancing === false,
      },
      { label: "BGM音源", value: media.src ?? "—" },
    );
    if (media.lastPlayError) {
      lines.push({ label: "再生の拒否", value: media.lastPlayError, bad: true });
    }
    if (media.waitingForGesture) {
      lines.push({ label: "再試行待ち", value: "次に画面を触った時", bad: true });
    }
  } else {
    const scene = bgmPlayer.currentScene();
    lines.push({
      label: "BGM出力",
      value: scene ? `鳴らしています（${scene}）` : bgmPlayer.isLoading() ? "読み込み中" : "止まっています",
      bad: !scene && !bgmPlayer.isLoading() && wanted !== null,
    });
  }

  lines.push(
    { label: "見張り番", value: media.watchdogRunning ? "稼働中" : "停止" },
    { label: "読めた音源", value: report.lastSuccessfulFile ?? "なし", bad: report.lastSuccessfulFile === null },
    { label: "読めない音源", value: report.lastFailedFile ?? "なし" },
  );
  if (report.decodeFailure) {
    lines.push({ label: "復号の失敗", value: report.decodeFailure, bad: true });
  }
  lines.push(
    { label: "SE一覧", value: audioManifestState(), bad: audioManifestState() === "失敗" },
    {
      label: "SE出力",
      // **まだ一度も鳴らしていないのは異常ではない。**効果音は鳴らす時に用意する。
      // ここを赤くしていると、正常な端末でも「どこかが壊れている」と読めてしまう
      value: sfx.masterReady ? `準備済み（読込 ${sfx.loaded} / 失敗 ${sfx.unreadable}）` : "まだ鳴らしていません",
      bad: sfx.masterReady && sfx.unreadable > 0,
    },
    {
      label: "音量",
      value: `全体 ${Math.round(settings.masterVolume * 100)}% / BGM ${Math.round(settings.bgmVolume * 100)}% / SE ${Math.round(settings.sfxVolume * 100)}%`,
      bad: settings.masterVolume <= 0,
    },
    { label: "音の確認", value: soundConfirmed() ? "鳴っていると確認できました" : "鳴っているか確認できていません", bad: !soundConfirmed() },
  );
  return lines;
}

/**
 * 一言でのまとめ。**設定画面の見出しに出す。**
 *
 * ここは「確かめられたこと」だけを言う。分からない時は分からないと書く。
 */
export function bgmDiagnosisSummary(): string {
  const settings = getAudioSettings();
  if (!settings.bgmEnabled) return "BGMのスイッチが切れています";
  if (settings.masterVolume * settings.bgmVolume <= 0) return "音量が0です（全体かBGMのどちらか）";
  const wanted = bgmPlayer.wantedScene();
  if (!wanted) return "この画面ではBGMを鳴らしていません";

  const route = bgmRoute();
  if (route === "HTML Audio") {
    const media = mediaBgmPlayer.diagnostics();
    if (media.advancing === true) return `互換再生で鳴っています（${media.scene}）`;
    if (media.advancing === false) return "互換再生に切り替えましたが、再生位置が進んでいません";
    if (media.waitingForGesture) return "再生を断られました。画面をもう一度タップしてください";
    return "互換再生を準備しています";
  }
  const scene = bgmPlayer.currentScene();
  if (scene) return `鳴っています（${scene}）`;
  if (bgmPlayer.isLoading()) return "読み込み中です";
  const state = audioEngine.state();
  if (state !== "running") return `まだ音を出せる状態ではありません（${state}）`;
  const report = audioLoadReport();
  if (report.decodeFailure) return `音を読めていません — ${report.decodeFailure}`;
  return "準備はできていますが、まだ鳴っていません";
}
