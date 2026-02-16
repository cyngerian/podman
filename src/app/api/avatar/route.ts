import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { createServerSupabaseClient, getUser } from "@/lib/supabase-server";

export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "File must be an image" }, { status: 400 });
  }

  if (file.size > 2 * 1024 * 1024) {
    return NextResponse.json({ error: "File must be under 2MB" }, { status: 400 });
  }

  // Derive extension from validated MIME type to prevent extension spoofing
  const MIME_TO_EXT: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/avif": "avif",
  };

  const ext = MIME_TO_EXT[file.type];
  if (!ext) {
    return NextResponse.json(
      { error: "Unsupported image type. Allowed: JPEG, PNG, GIF, WebP, AVIF" },
      { status: 400 }
    );
  }

  const blob = await put(`avatars/${user.id}.${ext}`, file, {
    access: "public",
    addRandomSuffix: true,
  });

  // Update profile with new avatar URL
  const supabase = await createServerSupabaseClient();
  await supabase
    .from("profiles")
    .update({ avatar_url: blob.url })
    .eq("id", user.id);

  return NextResponse.json({ url: blob.url });
}
