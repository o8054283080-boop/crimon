export interface ServiceWorkerEvents {
  addEventListener(type: "controllerchange", listener: () => void): void;
}

export interface PwaUpdateState {
  available: boolean;
  applying: boolean;
}

/**
 * waiting Service Worker の適用を、ユーザーの操作まで保留する。
 * controllerchange はブラウザによって複数回通知されてもリロードを一度しか行わない。
 */
export class PwaUpdateController {
  private updateWorker: ((reloadPage?: boolean) => Promise<void>) | null = null;
  private reloadRequested = false;
  private reloaded = false;
  private state: PwaUpdateState = { available: false, applying: false };

  constructor(
    serviceWorkers: ServiceWorkerEvents | null,
    private readonly onChange: () => void,
    private readonly reload: () => void,
  ) {
    serviceWorkers?.addEventListener("controllerchange", () => {
      if (!this.reloadRequested || this.reloaded) return;
      this.reloaded = true;
      this.reload();
    });
  }

  get snapshot(): Readonly<PwaUpdateState> { return this.state; }

  setUpdateWorker(updateWorker: (reloadPage?: boolean) => Promise<void>): void {
    this.updateWorker = updateWorker;
  }

  announce(): void {
    if (this.state.available) return;
    this.state = { available: true, applying: false };
    this.onChange();
  }

  async apply(persistSafeState: () => void): Promise<boolean> {
    if (!this.state.available || this.state.applying || !this.updateWorker) return false;
    persistSafeState();
    this.reloadRequested = true;
    this.state = { available: true, applying: true };
    this.onChange();
    try {
      // false: ライブラリ自身にはreloadさせず、controllerchange側へ一本化する。
      await this.updateWorker(false);
      return true;
    } catch {
      this.reloadRequested = false;
      this.state = { available: true, applying: false };
      this.onChange();
      return false;
    }
  }
}
