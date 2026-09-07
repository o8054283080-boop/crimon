import { AudioDiagnosticLine, audioDiagnosticLines } from "../audio/index.js";
import { AudioSettings, updateAudioSettings } from "../audio/settings.js";
import { el } from "../dom.js";

export interface AudioSettingsProps {
  settings: AudioSettings;
  onChange: (patch: Partial<AudioSettings>) => void;
  onTest: () => void;
}

/** 診断の更新間隔。再生位置が進んでいるかを目で見られる速さにする */
const DIAGNOSTICS_REFRESH_MS = 500;

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

/**
 * 診断の一覧。
 *
 * **この節はスクリーンショット1枚で足りることが目的。**
 * 「鳴らない」と言われた時に、こちらが端末を持っていなくても
 * どこで止まっているかを読み取れるだけの値を並べる。
 *
 * 再生位置(currentTime)は動いていることに意味があるので、
 * 開いている間だけ短い間隔で書き換える。画面から外れたら自分で止まる。
 */
function renderDiagnostics(): HTMLElement {
  const list = el("dl", { className: "audio-diag__list" });

  const paint = () => {
    const lines: AudioDiagnosticLine[] = audioDiagnosticLines();
    list.replaceChildren(
      ...lines.flatMap((line) => [
        el("dt", { className: "audio-diag__key" }, [line.label]),
        el("dd", { className: `audio-diag__val${line.bad ? " audio-diag__val--bad" : ""}` }, [line.value]),
      ]),
    );
  };
  paint();

  const panel = el("details", { className: "panel audio-diag", open: true }, [
    el("summary", { className: "audio-diag__head" }, ["音の状態（鳴らない時はこの画面を撮ってお知らせください）"]),
    list,
  ]);

  if (typeof window !== "undefined") {
    const timer = window.setInterval(() => {
      // 画面から外れたら自分で止まる。設定を閉じた後も回り続けさせない
      if (!panel.isConnected) {
        window.clearInterval(timer);
        return;
      }
      if (panel.open) paint();
    }, DIAGNOSTICS_REFRESH_MS);
  }
  return panel;
}

export function renderAudioSettings(props: AudioSettingsProps): HTMLElement {
  const { settings } = props;
  // 音量変更でHOME全体をrenderし直すと設定シートが閉じる。
  // 設定保存はここで直接行い、設定シートのDOMを保持する。
  const applyPatch = (patch: Partial<AudioSettings>) => {
    updateAudioSettings(patch);
  };

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
    /*
     * **状態は診断の表だけに出す。**
     *
     * 以前はここに「音を鳴らせる状態です」「BGM: …」の2行を別に置いていたが、
     * この2つは画面を描いた時の値のまま止まる。表は動き続けるので、
     * **「音が止まっています」と「鳴らしています（home）」が同じ画面に並ぶ**
     * ことになっていた。食い違った診断は、無いより悪い。
     */
    renderDiagnostics(),
    el("p", { className: "audio-settings__note" }, [
      "iPhoneでは、本体横のマナーモード(消音)スイッチが入っていると音が出ないことがあります。"
      + "切っても鳴らない時は、上の「音の状態」をそのまま撮ってお知らせください。原因を特定できます。",
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
      .audio-diag {
        margin-top: 12px;
        padding: 10px 12px;
      }
      .audio-diag__head {
        font-size: 12.5px;
        font-weight: 700;
        color: #f0e2b8;
        cursor: pointer;
        line-height: 1.5;
      }
      .audio-diag__list {
        display: grid;
        grid-template-columns: minmax(0, 8.4em) minmax(0, 1fr);
        column-gap: 10px;
        row-gap: 3px;
        margin: 10px 0 0;
        font-size: 11.5px;
        line-height: 1.5;
      }
      .audio-diag__key {
        margin: 0;
        color: #a9a3bd;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .audio-diag__val {
        margin: 0;
        color: #ece8f6;
        font-variant-numeric: tabular-nums;
        overflow-wrap: anywhere;
      }
      .audio-diag__val--bad { color: #ff9d9d; }
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
