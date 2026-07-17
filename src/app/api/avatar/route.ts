import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import * as Sentry from "@sentry/nextjs";
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
    // iOS photo formats — the client re-encodes to JPEG before upload, but
    // accept them here so a direct upload doesn't hard-fail on iPhone photos
    "image/heic": "heic",
    "image/heif": "heif",
  };

  const ext = MIME_TO_EXT[file.type];
  if (!ext) {
    return NextResponse.json(
      { error: "Unsupported image type. Allowed: JPEG, PNG, GIF, WebP, AVIF, HEIC" },
      { status: 400 }
    );
  }

  let blobUrl: string;
  try {
    const blob = await put(`avatars/${user.id}.${ext}`, file, {
      access: "public",
      addRandomSuffix: true,
    });
    blobUrl = blob.url;
  } catch (err) {
    Sentry.captureException(err, {
      extra: { fileType: file.type, fileSize: file.size },
    });
    return NextResponse.json(
      { error: "Failed to store image. Please try again." },
      { status: 500 }
    );
  }

  // Update profile with new avatar URL
  const supabase = await createServerSupabaseClient();
  const { error: updateError } = await supabase
    .from("profiles")
    .update({ avatar_url: blobUrl })
    .eq("id", user.id);

  if (updateError) {
    Sentry.captureException(updateError, { extra: { userId: user.id } });
    return NextResponse.json(
      { error: "Image stored but profile update failed. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ url: blobUrl });
}
