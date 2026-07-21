import { describe, it, expect, vi } from "vitest";
import { createInFlightGuard } from "@/lib/async-guard";

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createInFlightGuard", () => {
  it("runs the task and returns its value", async () => {
    const guard = createInFlightGuard();
    await expect(guard.run(async () => "picked")).resolves.toBe("picked");
    expect(guard.isBusy()).toBe(false);
  });

  it("drops a second run while the first is in flight", async () => {
    const guard = createInFlightGuard();
    const first = deferred();
    const task = vi.fn(() => first.promise);

    const firstRun = guard.run(task);
    expect(guard.isBusy()).toBe(true);

    // Simulates a double tap on the pick button.
    await expect(guard.run(task)).resolves.toBeUndefined();
    expect(task).toHaveBeenCalledTimes(1);

    first.resolve();
    await firstRun;
    expect(guard.isBusy()).toBe(false);
  });

  it("accepts a new run once the previous one settles", async () => {
    const guard = createInFlightGuard();
    const task = vi.fn(async () => undefined);

    await guard.run(task);
    await guard.run(task);

    expect(task).toHaveBeenCalledTimes(2);
  });

  it("releases the guard when the task rejects", async () => {
    const guard = createInFlightGuard();

    await expect(
      guard.run(async () => {
        throw new Error("pick failed");
      })
    ).rejects.toThrow("pick failed");

    expect(guard.isBusy()).toBe(false);
    await expect(guard.run(async () => "ok")).resolves.toBe("ok");
  });

  it("reports busy transitions to the listener", async () => {
    const onBusyChange = vi.fn();
    const guard = createInFlightGuard(onBusyChange);

    await guard.run(async () => undefined);

    expect(onBusyChange.mock.calls.map((c) => c[0])).toEqual([true, false]);
  });

  it("does not notify the listener for a dropped run", async () => {
    const onBusyChange = vi.fn();
    const guard = createInFlightGuard(onBusyChange);
    const first = deferred();

    const firstRun = guard.run(() => first.promise);
    onBusyChange.mockClear();

    await guard.run(async () => "second");
    expect(onBusyChange).not.toHaveBeenCalled();

    first.resolve();
    await firstRun;
  });
});
