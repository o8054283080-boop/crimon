import { AudioSettings, updateAudioSettings } from "../audio/settings.js";
import { el } from "../dom.js";

export interface AudioSettingsProps {
  settings: AudioSettings;
  /** 音声文脈の状態。"running" 以外なら、まだ音を出せる状態になっていない */
  contextState: string;
  onChange: (patch: Partial<AudioSettings>) => void;
  onTest: () => void;
}

const VOLUME_STEP = 0.01;

function stopNavigationEvent(event: Event): void {
  event.stopPropagation();
}

function slider(label: string, value: number, onCommit: (v: number) => void): HTMLElement {
  let current = Math.round(value * 100) / 100;
  let commitTimer: number | null = null;
  const readout = el("span", { className: "audio-settings__value" }, [`${Math.round(current * 100)}%`]);

  const setVisualValue = (next: number) => {
    current = Math.max(0, Math.min(1, Math.round(next * 100) / 100));
    const percent = Math.round(current * 100);
    input.value = String(percent);
    readout.textContent = `${percent}%`;
  };

  const commitAfterGesture = () => {
    if (commitTimer !== null) window.clearTimeout(commitTimer);
    commitTimer = window.setTimeout(() => {
      commitTimer = null;
      onCommit(current);
    }, 0);
  };

  const input = el("input", {
    type: "range",
    min: "0",
    max: "100",
    step: "1",
    value: String(Math.round(current * 100)),
    className: "audio-settings__slider",
    onpointerdown: stopNavigationEvent,
    onpointerup: (event: Event) => {
      stopNavigationEvent(event);
      commitAfterGesture();
    },
    onpointercancel: (event: Event) => {
      stopNavigationEvent(event);
      commitAfterGesture();
    },
    onclick: stopNavigationEvent,
    oninput: (event: Event) => {
      stopNavigationEvent(event);
      const next = Number((event.target as HTMLInputElement).value);
      setVisualValue(next / 100);
    },
    onchange: (event: Event) => {
      stopNavigationEvent(event);
      const next = Number((event.target as HTMLInputElement).value);
      setVisualValue(next / 100);
      commitAfterGesture();
    },
  });

  const decrement = el("button", {
    type: "button",
    className: "audio-settings__step",
    "aria-label": `${label}を1%下げる`,
    onpointerdown: stopNavigationEvent,
    onclick: (event: Event) => {
      stopNavigationEvent(event);
      setVisualValue(current - VOLUME_STEP);
      onCommit(current);
    },
  }, ["−"]);

  const increment = el("button", {
    type: "button",
    className: "audio-settings__step",
    "aria-label": `${label}を1%上げる`,
    onpointerdown: stopNavigationEvent,
    onclick: (event: Event) => {
      stopNavigationEvent(event);
      setVisualValue(current + VOLUME_STEP);
      onCommit(current);
    },
  }, ["＋"]);

  return el("div", {
    className: "audio-settings__row audio-settings__row--volume",
    onpointerdown: stopNavigationEvent,
    onclick: stopNavigationEvent,
  }, [
    el("span", { className: "audio-settings__label" }, [label]),
    readout,
    el("div", { className: "audio-settings__control" }, [decrement, input, increment]),
  ]);
}

export function renderAudioSettings(props: AudioSettingsProps): HTMLElement {
  const { settings } = props;
  // 音量変更でHOME全体をrenderし直すと設定シートが閉じる。
  // 設定保存はここで直接行い、設定シートのDOMを保持する。
  const applyPatch = (patch: Partial<AudioSettings>) => {
    updateAudioSettings(patch);
  };

  const ready = props.contextState === "running";
  const stateText = ready
    ? "音を鳴らせる状態です"
    : props.contextState === "未作成"
      ? "画面をどこか一度タップすると鳴らせるようになります"
      : `音が止まっています(${props.contextState})。下の「音を試す」を押してください`;

  return el("section", {
    className: "panel audio-settings",
    onpointerdown: stopNavigationEvent,
    onclick: stopNavigationEvent,
  }, [
    el("div", { className: "panel-header" }, [el("h2", {}, ["音の設定"])]),
    el("label", { className: "audio-settings__row audio-settings__row--toggle" }, [
      el("span", { className: "audio-settings__label" }, ["BGM"]),
      el("input", {
        type: "checkbox",
        checked: settings.bgmEnabled,
        className: "audio-settings__toggle",
        onclick: stopNavigationEvent,
        onchange: (event: Event) => {
          stopNavigationEvent(event);
          applyPatch({ bgmEnabled: (event.target as HTMLInputElement).checked });
        },
      }),
    ]),
    slider("BGMの音量", settings.bgmVolume, (v) => applyPatch({ bgmVolume: v })),
    el("label", { className: "audio-settings__row audio-settings__row--toggle" }, [
      el("span", { className: "audio-settings__label" }, ["効果音"]),
      el("input", {
        type: "checkbox",
        checked: settings.sfxEnabled,
        className: "audio-settings__toggle",
        onclick: stopNavigationEvent,
        onchange: (event: Event) => {
          stopNavigationEvent(event);
          applyPatch({ sfxEnabled: (event.target as HTMLInputElement).checked });
        },
      }),
    ]),
    slider("全体の音量", settings.masterVolume, (v) => applyPatch({ masterVolume: v })),
    slider("効果音の音量", settings.sfxVolume, (v) => applyPatch({ sfxVolume: v })),
    el("div", { className: "audio-settings__actions" }, [
      el("button", {
        type: "button",
        className: "btn btn--primary",
        onpointerdown: stopNavigationEvent,
        onclick: (event: Event) => {
          stopNavigationEvent(event);
          props.onTest();
        },
      }, ["♪ 音を試す"]),
    ]),
    el("p", { className: `audio-settings__state${ready ? " audio-settings__state--ok" : ""}` }, [stateText]),
    el("p", { className: "audio-settings__note" }, [
      "iPhoneでは、本体横のマナーモード(消音)スイッチが入っていると音が出ません。鳴らない時はそちらもご確認ください。",
    ]),
    el("style", {}, [
      `
      .audio-settings__row--volume {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 3.6em;
        align-items: center;
        column-gap: 10px;
        row-gap: 4px;
        min-height: 82px;
      }
      .audio-settings__row--volume > .audio-settings__label {
        grid-column: 1;
        grid-row: 1;
        flex: none;
      }
      .audio-settings__row--volume > .audio-settings__value {
        grid-column: 2;
        grid-row: 1;
      }
      .audio-settings__control {
        grid-column: 1 / -1;
        grid-row: 2;
        width: 100%;
        display: grid;
        grid-template-columns: 44px minmax(140px, 1fr) 44px;
        align-items: center;
        gap: 10px;
      }
      .audio-settings__step {
        appearance: none;
        width: 44px;
        height: 44px;
        padding: 0;
        border: 1px solid rgba(218, 180, 91, 0.5);
        border-radius: 12px;
        color: #fff4cf;
        background: linear-gradient(180deg, rgba(64, 47, 25, 0.94), rgba(21, 16, 16, 0.98));
        box-shadow: inset 0 1px 0 rgba(255, 239, 185, 0.12), 0 2px 7px rgba(0, 0, 0, 0.32);
        font: inherit;
        font-size: 1.35rem;
        font-weight: 900;
        line-height: 1;
        touch-action: manipulation;
      }
      .audio-settings__slider {
        width: 100%;
        min-width: 140px;
        height: 48px;
        margin: 0;
        cursor: pointer;
        touch-action: pan-y;
      }
      .audio-settings__slider::-webkit-slider-runnable-track {
        height: 12px;
        border-radius: 999px;
        background: rgba(4, 4, 8, 0.78);
        box-shadow: inset 0 2px 3px rgba(0, 0, 0, 0.8), inset 0 0 0 1px rgba(255, 255, 255, 0.08);
      }
      .audio-settings__slider::-webkit-slider-thumb {
        appearance: none;
        -webkit-appearance: none;
        width: 32px;
        height: 32px;
        margin-top: -10px;
        border: 2px solid rgba(255, 255, 255, 0.86);
        border-radius: 50%;
        background: #ffffff;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.55);
      }
      .audio-settings__value {
        flex: none;
        text-align: right;
        font-variant-numeric: tabular-nums;
      }
      @media (max-width: 430px) {
        .audio-settings__row--volume { min-height: 78px; }
        .audio-settings__control {
          grid-template-columns: 42px minmax(0, 1fr) 42px;
          gap: 8px;
        }
        .audio-settings__step { width: 42px; height: 42px; }
        .audio-settings__slider { min-width: 0; }
      }
      `,
    ]),
  ]);
}
