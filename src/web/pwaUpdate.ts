export interface ServiceWorkerEvents {
  addEventListener(type: "controllerchange", listener: () => void): void;
}

export interface PwaUpdateState {
  available: boolean;
  applying: boolean;
  failed: boolean;
}

export interface ServiceWorkerUpdateStatus {
  registration: object | null;
  controller: object | null;
  active: object | null;
  waiting: object | null;
  installing: object | null;
}

export interface PwaUpdateOptions {
  timeoutMs?: number;
  inspectUpdate?: () => ServiceWorkerUpdateStatus;
}

export const PWA_UPDATE_TIMEOUT_MS = 10_000;

/**
 * waiting Service Worker の適用を、ユーザーの操作まで保留する。
 * controllerchange はブラウザによって複数回通知されてもリロードを一度しか行わない。
 */
export class PwaUpdateController {
  private updateWorker: ((reloadPage?: boolean) => Promise<void>) | null = null;
  private reloadRequested = false;
  private reloaded = false;
  private applyId = 0;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private readonly timeoutMs: number;
  private readonly inspectUpdate: (() => ServiceWorkerUpdateStatus) | null;
  private state: PwaUpdateState = { available: false, applying: false, failed: false };

  constructor(
    serviceWorkers: ServiceWorkerEvents | null,
    private readonly onChange: () => void,
    private readonly reload: () => void,
    options: PwaUpdateOptions = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? PWA_UPDATE_TIMEOUT_MS;
    this.inspectUpdate = options.inspectUpdate ?? null;
    serviceWorkers?.addEventListener("controllerchange", () => {
      if (!this.reloadRequested || this.reloaded) return;
      this.requestReload();
    });
  }

  get snapshot(): Readonly<PwaUpdateState> { return this.state; }

  setUpdateWorker(updateWorker: (reloadPage?: boolean) => Promise<void>): void {
    this.updateWorker = updateWorker;
  }

  announce(): void {
    if (this.state.available) return;
    this.state = { available: true, applying: false, failed: false };
    this.onChange();
  }

  async apply(persistSafeState: () => void): Promise<boolean> {
    if (!this.state.available || this.state.applying || !this.updateWorker) return false;
    const applyId = ++this.applyId;
    const before = this.inspectUpdate?.() ?? null;
    // registerSWの登録完了前や、非対応環境ではメッセージの宛先がない。
    if (this.inspectUpdate && !before?.registration) {
      this.failApply();
      return false;
    }
    persistSafeState();
    this.reloadRequested = true;
    this.state = { available: true, applying: true, failed: false };
    this.onChange();
    this.timeoutId = setTimeout(() => this.recoverFromTimeout(applyId, before), this.timeoutMs);
    try {
      // vite-plugin-pwa 1.3では引数自体は互換用で、prompt時はwaitingへ
      // messageSkipWaiting()を送る。reloadはこのcontrollerの切替確認後だけ行う。
      await this.updateWorker(false);
      return true;
    } catch {
      if (applyId !== this.applyId || !this.state.applying) return false;
      this.failApply();
      return false;
    }
  }

  private recoverFromTimeout(applyId: number, before: ServiceWorkerUpdateStatus | null): void {
    if (applyId !== this.applyId || !this.state.applying || this.reloaded) return;
    this.timeoutId = null;

    const current = this.inspectUpdate?.() ?? null;
    const controllerChanged = Boolean(before && current?.controller && current.controller !== before.controller);
    const newWorkerActivated = Boolean(
      before
      && current?.active
      && current.active !== before.active
      && !current.waiting
      && !current.installing,
    );
    if (controllerChanged || newWorkerActivated) {
      // iOSでcontrollerchangeだけ欠落しても、実際の切替を確認できた時だけ再読込する。
      this.requestReload();
      return;
    }

    // Promiseの完了はactivate完了を意味しない。確認できなければ再試行可能に戻す。
    this.failApply();
  }

  private requestReload(): void {
    if (this.reloaded) return;
    this.clearApplyTimeout();
    this.reloaded = true;
    this.reload();
  }

  private clearApplyTimeout(): void {
    if (this.timeoutId === null) return;
    clearTimeout(this.timeoutId);
    this.timeoutId = null;
  }

  private failApply(): void {
    this.clearApplyTimeout();
    this.reloadRequested = false;
    this.state = { available: true, applying: false, failed: true };
    this.onChange();
  }
}
