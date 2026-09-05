import { AudioSettings } from "../audio/settings.js";
import { el } from "../dom.js";

export interface AudioSettingsProps {
  settings: AudioSettings;
  /** 音声文脈の状態。"running" 以外なら、まだ音を出せる状態になっていない */
  contextState: string;
  onChange: (patch: Partial<AudioSettings>) => void;
  onTest: () => void;
}

const STEP = 5;

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function slider(label: string, value: number, onCommit: (v: number) => void): HTMLElement {
  let percent = clampPercent(value * 100);
  const readout = el("span", { className: "audio-settings__value" }, [`${percent}%`]);

  const input = el("input", {
    type: "range",
    min: "0",
    max: "100",
    step: "1",
    value: String(percent),
    className: "audio-settings__slider",
    "aria-label": label,
    oninput: (event: Event) => {
      percent = clampPercent(Number((event.target as HTMLInputElement).value));
      readout.textContent = `${percent}%`;
    },
    onchange: (event: Event) => {
      percent = clampPercent(Number((event.target as HTMLInputElement).value));
      readout.textContent = `${percent}%`;
      onCommit(percent / 100);
    },
  }) as HTMLInputElement;

  const nudge = (amount: number) => {
    percent = clampPercent(percent + amount);
    input.value = String(percent);
    readout.textContent = `${percent}%`;
    onCommit(percent / 100);
  };

  const controls = el("div", { className: "audio-settings__controls" }, [
    el("button", {
      type: "button",
      className: "audio-settings__nudge",
      "aria-label": `${label}を${STEP}%下げる`,
      onclick: () => nudge(-STEP),
    }, ["−"]),
    input,
    el("button", {
      type: "button",
      className: "audio-settings__nudge",
      "aria-label": `${label}を${STEP}%上げる`,
      onclick: () => nudge(STEP),
    }, ["＋"]),
    readout,
  ]);

  return el("div", { className: "audio-settings__row audio-settings__row--volume" }, [
    el("span", { className: "audio-settings__label" }, [label]),
    controls,
  ]);
}

function toggle(label: string, checked: boolean, onChange: (checked: boolean) => void): HTMLElement {
  return el("label", { className: "audio-settings__row audio-settings__row--toggle" }, [
    el("span", { className: "audio-settings__label" }, [label]),
    el("input", {
      type: "checkbox",
      checked,
      className: "audio-settings__toggle",
      onchange: (event: Event) => onChange((event.target as HTMLInputElement).checked),
    }),
  ]);
}

function mobileSliderStyles(): HTMLElement {
  return el("style", {}, [String.raw`
    .audio-settings__row--volume {
      display: grid;
      grid-template-columns: 1fr;
      gap: 7px;
      align-items: stretch;
    }

    .audio-settings__row--volume .audio-settings__label {
      flex: none;
      font-size: 0.88rem;
      font-weight: 700;
    }

    .audio-settings__controls {
      display: grid;
      grid-template-columns: 44px minmax(0, 1fr) 44px 48px;
      gap: 8px;
      align-items: center;
      width: 100%;
      min-height: 48px;
    }

    .audio-settings__slider {
      width: 100%;
      min-width: 0;
      height: 44px;
      margin: 0;
      padding: 0;
      background: transparent;
      touch-action: pan-x;
      accent-color: var(--accent, #d77cf0);
    }

    .audio-settings__slider::-webkit-slider-runnable-track {
      height: 10px;
      border-radius: 999px;
      background: rgba(0, 0, 0, 0.58);
      box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.08);
    }

    .audio-settings__slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 30px;
      height: 30px;
      margin-top: -10px;
      border: 2px solid rgba(255, 255, 255, 0.95);
      border-radius: 50%;
      background: #ffffff;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5), 0 0 0 5px rgba(220, 125, 238, 0.13);
    }

    .audio-settings__slider::-moz-range-track {
      height: 10px;
      border-radius: 999px;
      background: rgba(0, 0, 0, 0.58);
    }

    .audio-settings__slider::-moz-range-thumb {
      width: 30px;
      height: 30px;
      border: 2px solid rgba(255, 255, 255, 0.95);
      border-radius: 50%;
      background: #ffffff;
    }

    .audio-settings__nudge {
      width: 44px;
      height: 44px;
      padding: 0;
      border: 1px solid rgba(222, 190, 120, 0.4);
      border-radius: 12px;
      color: #fff2cf;
      background: linear-gradient(180deg, rgba(54, 44, 72, 0.88), rgba(22, 17, 34, 0.96));
      font: inherit;
      font-size: 1.35rem;
      font-weight: 900;
      line-height: 1;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
    }

    .audio-settings__nudge:active {
      transform: translateY(1px) scale(0.97);
      background: rgba(110, 76, 126, 0.85);
    }

    .audio-settings__value {
      min-width: 48px;
      text-align: right;
      font-variant-numeric: tabular-nums;
      font-weight: 800;
    }

    @media (max-width: 390px) {
      .audio-settings__controls {
        grid-template-columns: 42px minmax(0, 1fr) 42px 44px;
        gap: 6px;
      }
      .audio-settings__nudge {
        width: 42px;
        height: 42px;
      }
    }
  `]);
}

/**
 * 音の設定。
 *
 * iPhoneで「音量が大きい」「レンジのつまみを狙いづらい」を避けるため、
 * 44px以上の操作領域と±5%ボタンを用意する。BGM/SEも同じ画面で個別調整できる。
 */
export function renderAudioSettings(props: AudioSettingsProps): HTMLElement {
  const { settings } = props;
  const ready = props.contextState === "running";
  const stateText = ready
    ? "音を鳴らせる状態です"
    : props.contextState === "未作成"
      ? "画面をどこか一度タップすると鳴らせるようになります"
      : `音が止まっています(${props.contextState})。下の「音を試す」を押してください`;

  return el("section", { className: "panel audio-settings" }, [
    mobileSliderStyles(),
    el("div", { className: "panel-header" }, [el("h2", {}, ["音の設定"])]),
    toggle("BGM", settings.bgmEnabled, (enabled) => props.onChange({ bgmEnabled: enabled })),
    toggle("効果音", settings.sfxEnabled, (enabled) => props.onChange({ sfxEnabled: enabled })),
    slider("全体の音量", settings.masterVolume, (v) => props.onChange({ masterVolume: v })),
    slider("BGMの音量", settings.bgmVolume, (v) => props.onChange({ bgmVolume: v })),
    slider("効果音の音量", settings.sfxVolume, (v) => props.onChange({ sfxVolume: v })),
    el("p", { className: "audio-settings__hint" }, ["バーを直接タップするか、− / ＋ で5%ずつ調整できます。"]),
    el("div", { className: "audio-settings__actions" }, [
      el("button", { type: "button", className: "btn btn--primary", onclick: props.onTest }, ["♪ 音を試す"]),
    ]),
    el("p", { className: `audio-settings__state${ready ? " audio-settings__state--ok" : ""}` }, [stateText]),
    el("p", { className: "audio-settings__note" }, [
      "iPhoneでは、本体横のマナーモード(消音)スイッチが入っていると音が出ません。鳴らない時はそちらもご確認ください。",
    ]),
  ]);
}
