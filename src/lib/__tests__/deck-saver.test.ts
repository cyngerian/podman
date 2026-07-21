import { describe, it, expect, vi } from "vitest";
import { createDeckSaver, type DeckSavePayload } from "@/lib/deck-saver";
import type { CardReference } from "@/lib/types";

const card = (id: string): CardReference => ({
  scryfallId: id,
  name: `Card ${id}`,
  cmc: 1,
  colors: [],
  rarity: "common",
  imageUri: "",
  smallImageUri: "",
  isFoil: false,
});

const payload = (id: string): DeckSavePayload => ({
  deck: [card(id)],
  sideboard: [],
  lands: { W: 0, U: 0, B: 0, R: 0, G: 0 },
});

const noSleep = async () => {};

describe("createDeckSaver", () => {
  it("saves once on success and clears the failure flag", async () => {
    const save = vi.fn(async () => {});
    const onFailedChange = vi.fn();
    const saver = createDeckSaver({ save, onFailedChange, sleep: noSleep });

    await saver.save(payload("a"));

    expect(save).toHaveBeenCalledTimes(1);
    expect(onFailedChange).toHaveBeenCalledWith(false);
  });

  it("retries once and reports success when the retry succeeds", async () => {
    const save = vi
      .fn<(p: DeckSavePayload) => Promise<void>>()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(undefined);
    const onFailedChange = vi.fn();
    const saver = createDeckSaver({ save, onFailedChange, sleep: noSleep });

    await saver.save(payload("a"));

    expect(save).toHaveBeenCalledTimes(2);
    expect(onFailedChange).toHaveBeenCalledTimes(1);
    expect(onFailedChange).toHaveBeenCalledWith(false);
  });

  it("surfaces a failure after the retry also fails", async () => {
    const save = vi.fn(async () => {
      throw new Error("save failed");
    });
    const onFailedChange = vi.fn();
    const saver = createDeckSaver({ save, onFailedChange, sleep: noSleep });

    await saver.save(payload("a"));

    expect(save).toHaveBeenCalledTimes(2);
    expect(onFailedChange).toHaveBeenCalledWith(true);
  });

  it("reports the final error to onError for monitoring", async () => {
    const failure = new Error("save failed");
    const save = vi.fn(async () => {
      throw failure;
    });
    const onError = vi.fn();
    const saver = createDeckSaver({
      save,
      onFailedChange: () => {},
      onError,
      sleep: noSleep,
    });

    await saver.save(payload("a"));

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(failure);
  });

  it("does not call onError when the retry succeeds", async () => {
    const save = vi
      .fn<(p: DeckSavePayload) => Promise<void>>()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(undefined);
    const onError = vi.fn();
    const saver = createDeckSaver({
      save,
      onFailedChange: () => {},
      onError,
      sleep: noSleep,
    });

    await saver.save(payload("a"));

    expect(onError).not.toHaveBeenCalled();
  });

  it("does not reject the caller when the save fails", async () => {
    const save = vi.fn(async () => {
      throw new Error("save failed");
    });
    const saver = createDeckSaver({
      save,
      onFailedChange: () => {},
      sleep: noSleep,
    });

    await expect(saver.save(payload("a"))).resolves.toBeUndefined();
  });

  it("waits the configured delay before retrying", async () => {
    const sleep = vi.fn(async () => {});
    const save = vi
      .fn<(p: DeckSavePayload) => Promise<void>>()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(undefined);
    const saver = createDeckSaver({
      save,
      onFailedChange: () => {},
      retryDelayMs: 250,
      sleep,
    });

    await saver.save(payload("a"));

    expect(sleep).toHaveBeenCalledWith(250);
  });

  it("retryLast re-sends the most recent payload", async () => {
    const save = vi
      .fn<(p: DeckSavePayload) => Promise<void>>()
      .mockRejectedValue(new Error("down"));
    const onFailedChange = vi.fn();
    const saver = createDeckSaver({ save, onFailedChange, sleep: noSleep });

    await saver.save(payload("a"));
    expect(onFailedChange).toHaveBeenLastCalledWith(true);

    save.mockResolvedValue(undefined);
    await saver.retryLast();

    expect(onFailedChange).toHaveBeenLastCalledWith(false);
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({ deck: [expect.objectContaining({ scryfallId: "a" })] })
    );
  });

  it("retryLast is a no-op when nothing has been saved", async () => {
    const save = vi.fn(async () => {});
    const saver = createDeckSaver({
      save,
      onFailedChange: () => {},
      sleep: noSleep,
    });

    expect(saver.hasPending()).toBe(false);
    await saver.retryLast();
    expect(save).not.toHaveBeenCalled();
  });

  it("abandons a superseded retry so the newer save decides the status", async () => {
    const attempts: string[] = [];
    let releaseRetryWindow: () => void = () => {};
    const retryWindow = new Promise<void>((resolve) => {
      releaseRetryWindow = resolve;
    });

    const save = vi.fn(async (p: DeckSavePayload) => {
      const id = p.deck[0].scryfallId;
      attempts.push(id);
      if (id === "a") throw new Error("stale save failed");
    });
    const onFailedChange = vi.fn();
    const saver = createDeckSaver({
      save,
      onFailedChange,
      sleep: () => retryWindow,
    });

    const stale = saver.save(payload("a"));
    // A newer deck edit lands while the stale save is waiting to retry.
    await saver.save(payload("b"));
    releaseRetryWindow();
    await stale;

    expect(attempts).toEqual(["a", "b"]);
    expect(onFailedChange).toHaveBeenCalledTimes(1);
    expect(onFailedChange).toHaveBeenCalledWith(false);
  });
});
