import { AudioSettings } from "../audio/settings.js";
import { el } from "../dom.js";

export interface AudioSettingsProps {
  settings: AudioSettings;
  /** 音声文脈の状態。"running" 以外なら、まだ音を出せる状態になっていない */
  contextState: string;
  onChange: (patch: Partial<AudioSettings>) => void;
  onTest: () => void;
}

function slider(label: string, value: number, onCommit: (v: number) => void): HTMLElement {
  const percent = Math.round(value * 100);
  const readout = el("span", { className: "audio-settings__value" }, [`${percent}%`]);
  const input = el("input", {
    type: "range",
    min: "0",
    max: "100",
    // 以前は5%刻みで、最小の非ミュート音量が5%と大きかった。
    // 1%刻みにして、SE/BGMが大きく感じる端末でも細かく下げられるようにする。
    step: "1",
    value: String(percent),
    className: "audio-settings__slider",
    oninput: (event: Event) => {
      const next = Number((event.target as HTMLInputElement).value);
      readout.textContent = `${next}%`;
    },
    onchange: (event: Event) => {
      const next = Number((event.target as HTMLInputElement).value);
      readout.textContent = `${next}%`;
      onCommit(next / 100);
    },
  });
  return el("label", { className: "audio-settings__row" }, [
    el("span", { className: "audio-settings__label" }, [label]),
    input,
    readout,
  ]);
}

/**
 * 音の設定。
 *
 * 音量を変えられる場所がそもそも無かった。加えて「音が鳴らない」と言われた時、
 * 端末の音量なのか、設定で切れているのか、まだ画面を触っていないだけなのかを
 * **利用者自身が切り分けられない**のが困る。試聴ボタンと状態表示を同じ場所に置く。
 */
export function renderAudioSettings(props: AudioSettingsProps): HTMLElement {
  const { settings } = props;

  // ブラウザは画面を一度も触っていない間は音を出せない。その旨をそのまま伝える
  const ready = props.contextState === "running";
  const stateText = ready
    ? "音を鳴らせる状態です"
    : props.contextState === "未作成"
      ? "画面をどこか一度タップすると鳴らせるようになります"
      : `音が止まっています(${props.contextState})。下の「音を試す」を押してください`;

  return el("section", { className: "panel audio-settings" }, [
    el("div", { className: "panel-header" }, [el("h2", {}, ["音の設定"])]),
    el(
      "label",
      { className: "audio-settings__row audio-settings__row--toggle" },
      [
        el("span", { className: "audio-settings__label" }, ["効果音"]),
        el("input", {
          type: "checkbox",
          checked: settings.sfxEnabled,
          className: "audio-settings__toggle",
          onchange: (event: Event) => props.onChange({ sfxEnabled: (event.target as HTMLInputElement).checked }),
        }),
      ],
    ),
    slider("全体の音量", settings.masterVolume, (v) => props.onChange({ masterVolume: v })),
    slider("効果音の音量", settings.sfxVolume, (v) => props.onChange({ sfxVolume: v })),
    el("div", { className: "audio-settings__actions" }, [
      el("button", { type: "button", className: "btn btn--primary", onclick: props.onTest }, ["♪ 音を試す"]),
    ]),
    el("p", { className: `audio-settings__state${ready ? " audio-settings__state--ok" : ""}` }, [stateText]),
    el("p", { className: "audio-settings__note" }, [
      "iPhoneでは、本体横のマナーモード(消音)スイッチが入っていると音が出ません。鳴らない時はそちらもご確認ください。",
    ]),
  ]);
}
