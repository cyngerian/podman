import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * GET /api/boosters?set=mkm
 * Returns available booster products for a set code.
 * Filters to user-relevant types only (play, draft, set, collector, base).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const setCode = searchParams.get("set")?.toLowerCase();

  if (!setCode) {
    return NextResponse.json(
      { error: "Missing 'set' query parameter" },
      { status: 400 }
    );
  }

  try {
    const supabase = createAdminClient();

    // Fetch all products for this set
    const { data, error } = await supabase
      .from("booster_products")
      .select("code, name")
      .eq("set_code", setCode)
      .order("code");

    if (error) throw error;
    if (!data || data.length === 0) {
      return NextResponse.json([]);
    }

    // Filter to user-relevant product codes only
    const allowedSuffixes = new Set(["", "-play", "-draft", "-set", "-collector"]);
    const filtered = data.filter((p) => {
      const suffix = p.code.startsWith(setCode)
        ? p.code.slice(setCode.length)
        : null;
      return suffix !== null && allowedSuffixes.has(suffix);
    });

    return NextResponse.json(
      filtered.map((p) => ({ code: p.code, name: p.name })),
      { headers: { "Cache-Control": "public, s-maxage=86400" } }
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch boosters" },
      { status: 500 }
    );
  }
}
