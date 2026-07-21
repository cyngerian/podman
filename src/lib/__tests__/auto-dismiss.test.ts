import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { scheduleDismiss, SUCCESS_MESSAGE_DURATION_MS } from "../auto-dismiss";

describe("scheduleDismiss", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fires the callback after the default duration", () => {
    const onExpire = vi.fn();
    scheduleDismiss(onExpire);

    vi.advanceTimersByTime(SUCCESS_MESSAGE_DURATION_MS - 1);
    expect(onExpire).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("keeps the default within the 2-3s window", () => {
    expect(SUCCESS_MESSAGE_DURATION_MS).toBeGreaterThanOrEqual(2000);
    expect(SUCCESS_MESSAGE_DURATION_MS).toBeLessThanOrEqual(3000);
  });

  it("honors an explicit delay", () => {
    const onExpire = vi.fn();
    scheduleDismiss(onExpire, 500);

    vi.advanceTimersByTime(499);
    expect(onExpire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("does not fire after cancel", () => {
    const onExpire = vi.fn();
    const cancel = scheduleDismiss(onExpire);

    cancel();
    vi.advanceTimersByTime(SUCCESS_MESSAGE_DURATION_MS * 2);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it("tolerates cancel being called twice, and after the timer fired", () => {
    const onExpire = vi.fn();
    const cancel = scheduleDismiss(onExpire);

    vi.advanceTimersByTime(SUCCESS_MESSAGE_DURATION_MS);
    expect(onExpire).toHaveBeenCalledTimes(1);

    expect(() => {
      cancel();
      cancel();
    }).not.toThrow();
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("clamps a negative delay to 0 instead of firing synchronously", () => {
    const onExpire = vi.fn();
    scheduleDismiss(onExpire, -100);

    expect(onExpire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(0);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("runs independent timers independently", () => {
    const first = vi.fn();
    const second = vi.fn();
    const cancelFirst = scheduleDismiss(first, 100);
    scheduleDismiss(second, 100);

    cancelFirst();
    vi.advanceTimersByTime(100);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
