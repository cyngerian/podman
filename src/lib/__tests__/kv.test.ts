import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const set = vi.fn();
const get = vi.fn();
const del = vi.fn();

vi.mock("@upstash/redis", () => ({
  Redis: class {
    set = set;
    get = get;
    del = del;
  },
}));

const ENV = { ...process.env };

/**
 * kv.ts memoizes its Redis client at module scope, so each test re-imports a
 * fresh copy after setting (or clearing) the env vars it reads at construction.
 */
async function importKv() {
  vi.resetModules();
  return import("../kv");
}

beforeEach(() => {
  set.mockReset();
  get.mockReset();
  del.mockReset();
  process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN = "token";
});

afterEach(() => {
  process.env = { ...ENV };
});

describe("kvSet", () => {
  it("passes a TTL through to Redis as an `ex` option", async () => {
    const { kvSet } = await importKv();
    await kvSet("booster:fin", { a: 1 }, 86400);
    expect(set).toHaveBeenCalledWith("booster:fin", { a: 1 }, { ex: 86400 });
  });

  it("floors fractional TTLs (Redis EX takes whole seconds)", async () => {
    const { kvSet } = await importKv();
    await kvSet("k", "v", 10.9);
    expect(set).toHaveBeenCalledWith("k", "v", { ex: 10 });
  });

  it("writes without an expiry when no TTL is given", async () => {
    const { kvSet } = await importKv();
    await kvSet("k", "v");
    expect(set).toHaveBeenCalledWith("k", "v");
  });

  it("writes without an expiry for non-positive TTLs", async () => {
    const { kvSet } = await importKv();
    await kvSet("k", "v", 0);
    await kvSet("k", "v", -5);
    expect(set).toHaveBeenNthCalledWith(1, "k", "v");
    expect(set).toHaveBeenNthCalledWith(2, "k", "v");
  });

  it("no-ops when Upstash env vars are missing", async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    const { kvSet } = await importKv();
    await expect(kvSet("k", "v", 60)).resolves.toBeUndefined();
    expect(set).not.toHaveBeenCalled();
  });

  it("swallows Redis errors", async () => {
    set.mockRejectedValueOnce(new Error("upstash down"));
    const { kvSet } = await importKv();
    await expect(kvSet("k", "v", 60)).resolves.toBeUndefined();
  });
});

describe("kvGet", () => {
  it("returns the stored value", async () => {
    get.mockResolvedValueOnce({ hello: "world" });
    const { kvGet } = await importKv();
    await expect(kvGet<{ hello: string }>("k")).resolves.toEqual({
      hello: "world",
    });
    expect(get).toHaveBeenCalledWith("k");
  });

  it("returns null when Redis is unconfigured or errors", async () => {
    get.mockRejectedValueOnce(new Error("boom"));
    const { kvGet } = await importKv();
    await expect(kvGet("k")).resolves.toBeNull();
  });
});

describe("kvDel", () => {
  it("deletes the key", async () => {
    const { kvDel } = await importKv();
    await kvDel("booster:fin");
    expect(del).toHaveBeenCalledWith("booster:fin");
  });

  it("swallows Redis errors", async () => {
    del.mockRejectedValueOnce(new Error("boom"));
    const { kvDel } = await importKv();
    await expect(kvDel("k")).resolves.toBeUndefined();
  });
});

describe("booster cache TTL", () => {
  it("writes booster product data with the 24h default TTL", async () => {
    vi.resetModules();
    const rpc = vi.fn().mockResolvedValue({
      data: {
        productId: 1,
        code: "fin-play",
        setCode: "fin",
        configs: [],
        sheets: [],
      },
    });
    vi.doMock("../supabase-admin", () => ({
      createAdminClient: () => ({ rpc }),
    }));

    const { loadBoosterProductData, BOOSTER_KV_TTL_SECONDS } = await import(
      "../booster-data"
    );
    expect(BOOSTER_KV_TTL_SECONDS).toBe(60 * 60 * 24);

    await loadBoosterProductData("fin", "fin-play");

    // kvSet is fire-and-forget; let the microtask queue drain.
    await Promise.resolve();
    expect(set).toHaveBeenCalledWith(
      "booster:fin-play",
      expect.objectContaining({ code: "fin-play" }),
      { ex: BOOSTER_KV_TTL_SECONDS }
    );
    vi.doUnmock("../supabase-admin");
  });
});
