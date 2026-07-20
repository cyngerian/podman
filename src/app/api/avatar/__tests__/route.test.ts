import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const mockPut = vi.fn();
const mockGetUser = vi.fn();
const mockUpdate = vi.fn();
const mockCaptureException = vi.fn();

vi.mock("@vercel/blob", () => ({
  put: (...args: unknown[]) => mockPut(...args),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

vi.mock("@/lib/supabase-server", () => ({
  getUser: () => mockGetUser(),
  createServerSupabaseClient: async () => ({
    from: () => ({
      update: () => ({
        eq: () => mockUpdate(),
      }),
    }),
  }),
}));

import { POST } from "../route";

function makeRequest(file: File | null): NextRequest {
  const formData = new FormData();
  if (file) formData.append("file", file);
  return new Request("http://localhost/api/avatar", {
    method: "POST",
    body: formData,
  }) as unknown as NextRequest;
}

function makeFile(opts: { type?: string; size?: number; name?: string } = {}) {
  const { type = "image/jpeg", size = 1024, name = "avatar.jpg" } = opts;
  return new File([new Uint8Array(size)], name, { type });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ id: "user-123" });
  mockPut.mockResolvedValue({ url: "https://blob.example.com/avatars/user-123.jpg" });
  mockUpdate.mockResolvedValue({ error: null });
});

describe("POST /api/avatar", () => {
  it("uploads a JPEG, updates the profile, and returns the blob URL", async () => {
    const res = await POST(makeRequest(makeFile()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe("https://blob.example.com/avatars/user-123.jpg");
    expect(mockPut).toHaveBeenCalledWith(
      "avatars/user-123.jpg",
      expect.anything(),
      expect.objectContaining({ access: "public", addRandomSuffix: true })
    );
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("accepts HEIC files", async () => {
    const res = await POST(
      makeRequest(makeFile({ type: "image/heic", name: "photo.heic" }))
    );
    expect(res.status).toBe(200);
    expect(mockPut).toHaveBeenCalledWith(
      "avatars/user-123.heic",
      expect.anything(),
      expect.anything()
    );
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValue(null);
    const res = await POST(makeRequest(makeFile()));
    expect(res.status).toBe(401);
    expect(mockPut).not.toHaveBeenCalled();
  });

  it("returns 400 when no file is provided", async () => {
    const res = await POST(makeRequest(null));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("No file provided");
  });

  it("rejects non-image MIME types with 400", async () => {
    const res = await POST(
      makeRequest(makeFile({ type: "text/plain", name: "evil.txt" }))
    );
    expect(res.status).toBe(400);
    expect(mockPut).not.toHaveBeenCalled();
  });

  it("rejects image MIME types outside the allowlist with 400", async () => {
    const res = await POST(
      makeRequest(makeFile({ type: "image/svg+xml", name: "evil.svg" }))
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Unsupported image type");
    expect(mockPut).not.toHaveBeenCalled();
  });

  it("rejects files over 2MB with 400", async () => {
    const res = await POST(makeRequest(makeFile({ size: 2 * 1024 * 1024 + 1 })));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("File must be under 2MB");
    expect(mockPut).not.toHaveBeenCalled();
  });

  it("returns JSON 500 (not HTML) when blob storage fails", async () => {
    mockPut.mockRejectedValue(new Error("blob token invalid"));
    const res = await POST(makeRequest(makeFile()));
    expect(res.status).toBe(500);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json();
    expect(body.error).toContain("Failed to store image");
    expect(mockCaptureException).toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns JSON 500 when the profile update fails", async () => {
    mockUpdate.mockResolvedValue({ error: { message: "row not found" } });
    const res = await POST(makeRequest(makeFile()));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("profile update failed");
    expect(mockCaptureException).toHaveBeenCalled();
  });
});
