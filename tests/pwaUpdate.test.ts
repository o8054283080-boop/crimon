import { describe, expect, it, vi } from "vitest";
import { PwaUpdateController } from "../src/web/pwaUpdate.js";

function setup(timeoutMs = 10_000, inspectUpdate?: () => {
  controller: object | null;
  active: object | null;
  waiting: object | null;
  installing: object | null;
  registration: object | null;
}) {
  let controllerChange: (() => void) | undefined;
  const reload = vi.fn();
  const changed = vi.fn();
  const controller = new PwaUpdateController({
    addEventListener: (_type, listener) => { controllerChange = listener; },
  }, changed, reload, { timeoutMs, inspectUpdate });
  return { controller, controllerChange: () => controllerChange?.(), reload, changed };
}

describe("PWA update controller", () => {
  it("does not show a banner until a waiting worker is announced", () => {
    expect(setup().controller.snapshot.available).toBe(false);
  });

  it("keeps an announced update available", () => {
    const { controller } = setup();
    controller.announce();
    expect(controller.snapshot).toEqual({ available: true, applying: false, failed: false });
  });

  it("applies only after the user request and reloads once", async () => {
    const activeWorker = {};
    const waitingWorker = {};
    const { controller, controllerChange, reload } = setup(10_000, () => ({
      registration: {}, controller: activeWorker, active: activeWorker,
      waiting: waitingWorker, installing: null,
    }));
    const updateWorker = vi.fn().mockResolvedValue(undefined);
    const persist = vi.fn();
    controller.setUpdateWorker(updateWorker);
    controller.announce();

    await controller.apply(persist);
    expect(persist).toHaveBeenCalledOnce();
    expect(updateWorker).toHaveBeenCalledWith(false);
    expect(persist.mock.invocationCallOrder[0]).toBeLessThan(updateWorker.mock.invocationCallOrder[0]);
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
    expect(controller.snapshot).toEqual({ available: true, applying: false, failed: true });
  });

  it("returns to a retryable state when controllerchange never arrives", async () => {
    vi.useFakeTimers();
    const waitingWorker = {};
    const activeWorker = {};
    const { controller, changed, reload } = setup(10_000, () => ({
      registration: {}, controller: activeWorker, active: activeWorker,
      waiting: waitingWorker, installing: null,
    }));
    controller.setUpdateWorker(vi.fn().mockResolvedValue(undefined));
    controller.announce();

    await controller.apply(vi.fn());
    await vi.advanceTimersByTimeAsync(10_000);

    expect(controller.snapshot).toEqual({ available: true, applying: false, failed: true });
    expect(changed).toHaveBeenCalledTimes(3);
    expect(reload).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("does not start two updates when the button is pressed repeatedly", async () => {
    let finish: (() => void) | undefined;
    const updateWorker = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const { controller, controllerChange } = setup();
    controller.setUpdateWorker(updateWorker);
    controller.announce();

    const first = controller.apply(vi.fn());
    expect(await controller.apply(vi.fn())).toBe(false);
    expect(updateWorker).toHaveBeenCalledOnce();
    finish?.();
    await first;
    controllerChange();
  });

  it("reloads by the fallback when waiting disappears and the new worker activates", async () => {
    vi.useFakeTimers();
    const oldWorker = {};
    const newWorker = {};
    let status = {
      registration: {}, controller: oldWorker, active: oldWorker,
      waiting: {} as object | null, installing: null,
    };
    const { controller, reload } = setup(10_000, () => status);
    controller.setUpdateWorker(vi.fn().mockImplementation(async () => {
      status = { ...status, active: newWorker, waiting: null };
    }));
    controller.announce();

    await controller.apply(vi.fn());
    await vi.advanceTimersByTimeAsync(10_000);

    expect(reload).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("ignores a late controllerchange after timeout recovery", async () => {
    vi.useFakeTimers();
    const { controller, controllerChange, reload } = setup();
    controller.setUpdateWorker(vi.fn().mockResolvedValue(undefined));
    controller.announce();
    await controller.apply(vi.fn());

    await vi.advanceTimersByTimeAsync(10_000);
    controllerChange();

    expect(reload).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("reloads once when activation is confirmed even without controllerchange", async () => {
    vi.useFakeTimers();
    const oldWorker = {};
    const newWorker = {};
    let active = oldWorker;
    const { controller, controllerChange, reload } = setup(10_000, () => ({
      registration: {},
      controller: oldWorker,
      active,
      waiting: null,
      installing: null,
    }));
    controller.setUpdateWorker(vi.fn().mockImplementation(async () => { active = newWorker; }));
    controller.announce();
    await controller.apply(vi.fn());

    await vi.advanceTimersByTimeAsync(10_000);
    controllerChange();

    expect(reload).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("does not crash without Service Worker support", async () => {
    const changed = vi.fn();
    const controller = new PwaUpdateController(null, changed, vi.fn());
    controller.announce();
    expect(await controller.apply(vi.fn())).toBe(false);
  });

  it("fails safely when registration is unavailable and does not persist", async () => {
    const persist = vi.fn();
    const { controller } = setup(10_000, () => ({
      registration: null, controller: null, active: null, waiting: null, installing: null,
    }));
    controller.setUpdateWorker(vi.fn());
    controller.announce();

    expect(await controller.apply(persist)).toBe(false);
    expect(persist).not.toHaveBeenCalled();
    expect(controller.snapshot.failed).toBe(true);
  });

  it("reloads only once when timeout fallback and controllerchange compete", async () => {
    vi.useFakeTimers();
    const oldWorker = {};
    const newWorker = {};
    let active = oldWorker;
    const { controller, controllerChange, reload } = setup(10_000, () => ({
      registration: {}, controller: oldWorker, active, waiting: null, installing: null,
    }));
    controller.setUpdateWorker(vi.fn().mockImplementation(async () => { active = newWorker; }));
    controller.announce();
    await controller.apply(vi.fn());

    await vi.advanceTimersByTimeAsync(10_000);
    controllerChange();

    expect(reload).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
