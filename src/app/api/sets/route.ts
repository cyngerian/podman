import { NextResponse } from "next/server";
import { fetchDraftableSets } from "@/lib/scryfall";

export const revalidate = 86400; // Cache for 24 hours

export async function GET() {
  try {
    const sets = await fetchDraftableSets();

    const result = sets.map((s) => ({
      code: s.code,
      name: s.name,
      releasedAt: s.released_at,
      iconSvgUri: s.icon_svg_uri,
    }));

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch sets" },
      { status: 500 }
    );
  }
}
