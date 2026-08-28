import { describe, expect, it, vi } from "vitest";
import { PwaUpdateController } from "../src/web/pwaUpdate.js";

function setup() {
  let controllerChange: (() => void) | undefined;
  const reload = vi.fn();
  const changed = vi.fn();
  const controller = new PwaUpdateController({
    addEventListener: (_type, listener) => { controllerChange = listener; },
  }, changed, reload);
  return { controller, controllerChange: () => controllerChange?.(), reload, changed };
}

describe("PWA update controller", () => {
  it("does not show a banner until a waiting worker is announced", () => {
    expect(setup().controller.snapshot.available).toBe(false);
  });

  it("keeps an announced update available", () => {
    const { controller } = setup();
    controller.announce();
    expect(controller.snapshot).toEqual({ available: true, applying: false });
  });

  it("applies only after the user request and reloads once", async () => {
    const { controller, controllerChange, reload } = setup();
    const updateWorker = vi.fn().mockResolvedValue(undefined);
    const persist = vi.fn();
    controller.setUpdateWorker(updateWorker);
    controller.announce();

    await controller.apply(persist);
    expect(persist).toHaveBeenCalledOnce();
    expect(updateWorker).toHaveBeenCalledWith(false);
    controllerChange();
    controllerChange();
    expect(reload).toHaveBeenCalledOnce();
  });

  it("ignores controller changes before an update request", () => {
    const { controllerChange, reload } = setup();
    controllerChange();
    expect(reload).not.toHaveBeenCalled();
  });

  it("keeps the update retryable when activation fails", async () => {
    const { controller } = setup();
    controller.setUpdateWorker(vi.fn().mockRejectedValue(new Error("offline")));
    controller.announce();
    expect(await controller.apply(vi.fn())).toBe(false);
    expect(controller.snapshot).toEqual({ available: true, applying: false });
  });
});
