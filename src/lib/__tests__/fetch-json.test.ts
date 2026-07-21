import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchJson, FetchJsonError } from "../fetch-json";

function mockFetch(impl: () => Promise<Response> | Response) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetchJson", () => {
  it("returns parsed JSON on an OK response", async () => {
    const payload = { hello: "world", items: [1, 2, 3] };
    mockFetch(() =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const result = await fetchJson<typeof payload>("/api/thing");
    expect(result).toEqual(payload);
  });

  it("passes through init options to fetch", async () => {
    const fetchSpy = vi.fn(
      () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const init = { method: "POST", body: "x" };
    await fetchJson("/api/thing", init);
    expect(fetchSpy).toHaveBeenCalledWith("/api/thing", init);
  });

  it("throws FetchJsonError with the status on a non-OK response", async () => {
    mockFetch(() =>
      new Response(JSON.stringify({ error: "nope" }), { status: 500 }),
    );

    await expect(fetchJson("/api/thing")).rejects.toMatchObject({
      name: "FetchJsonError",
      status: 500,
    });
    await expect(fetchJson("/api/thing")).rejects.toBeInstanceOf(FetchJsonError);
  });

  it("throws for 404 without attempting to parse the body", async () => {
    const json = vi.fn();
    mockFetch(() => ({ ok: false, status: 404, json }) as unknown as Response);

    await expect(fetchJson("/api/thing")).rejects.toMatchObject({ status: 404 });
    expect(json).not.toHaveBeenCalled();
  });

  it("throws FetchJsonError when the body is not valid JSON", async () => {
    mockFetch(() =>
      new Response("<html>not json</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );

    const err = await fetchJson("/api/thing").catch((e) => e);
    expect(err).toBeInstanceOf(FetchJsonError);
    expect(err.status).toBe(200);
    expect(err.message).toMatch(/not valid JSON/i);
  });

  it("throws FetchJsonError with status 0 on a network failure", async () => {
    const cause = new TypeError("Failed to fetch");
    mockFetch(() => Promise.reject(cause));

    const err = await fetchJson("/api/thing").catch((e) => e);
    expect(err).toBeInstanceOf(FetchJsonError);
    expect(err.status).toBe(0);
    expect(err.cause).toBe(cause);
  });
});
