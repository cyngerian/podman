"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import UserAvatar from "@/components/ui/UserAvatar";
import { updateProfile } from "./actions";

const WEB_SAFE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"];
const MAX_AVATAR_DIMENSION = 512;
const REENCODE_SIZE_THRESHOLD = 512 * 1024;

// Re-encode to a downscaled JPEG via canvas. Handles HEIC from iOS Photos
// (Safari decodes it natively even though other browsers can't display it)
// and shrinks multi-MB camera photos before upload. Falls back to the
// original file if decoding fails — the server allowlist is the backstop.
async function prepareAvatarFile(file: File): Promise<File> {
  const needsReencode =
    !WEB_SAFE_TYPES.includes(file.type) ||
    (file.size > REENCODE_SIZE_THRESHOLD && file.type !== "image/gif");
  if (!needsReencode) return file;

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = objectUrl;
    await img.decode();

    const scale = Math.min(1, MAX_AVATAR_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85)
    );
    if (!blob) return file;
    return new File([blob], "avatar.jpg", { type: "image/jpeg" });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

const MANA_COLORS = [
  { code: "W", manaClass: "ms ms-w ms-cost", label: "White" },
  { code: "U", manaClass: "ms ms-u ms-cost", label: "Blue" },
  { code: "B", manaClass: "ms ms-b ms-cost", label: "Black" },
  { code: "R", manaClass: "ms ms-r ms-cost", label: "Red" },
  { code: "G", manaClass: "ms ms-g ms-cost", label: "Green" },
] as const;

interface ProfileFormProps {
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  favoriteColor: string | null;
}

export default function ProfileForm({
  displayName: initialName,
  avatarUrl: initialAvatar,
  bio: initialBio,
  favoriteColor: initialColor,
}: ProfileFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState(initialName);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatar);
  const [emojiInput, setEmojiInput] = useState(
    initialAvatar && !initialAvatar.startsWith("http") ? initialAvatar : ""
  );
  const [bio, setBio] = useState(initialBio);
  const [favoriteColor, setFavoriteColor] = useState<string | null>(initialColor);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Allow re-selecting the same file after a failure
    e.target.value = "";

    setUploading(true);
    setError(null);

    try {
      const upload = await prepareAvatarFile(file);
      const formData = new FormData();
      formData.append("file", upload);

      const res = await fetch("/api/avatar", { method: "POST", body: formData });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? `Upload failed (${res.status})`);
        return;
      }

      const data = await res.json();
      setAvatarUrl(data.url);
      setEmojiInput("");
      // The route already persisted avatar_url — refresh so the header
      // avatar and any server-rendered views pick it up without a Save
      router.refresh();
    } catch (err) {
      Sentry.captureException(err, {
        extra: { fileType: file.type, fileSize: file.size },
      });
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  function handleEmojiChange(value: string) {
    setEmojiInput(value);
    if (value.trim()) {
      setAvatarUrl(value.trim());
    } else if (!avatarUrl?.startsWith("http")) {
      setAvatarUrl(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    const formData = new FormData();
    formData.set("display_name", displayName);
    formData.set("avatar_url", avatarUrl ?? "");
    formData.set("bio", bio);
    formData.set("favorite_color", favoriteColor ?? "");

    const result = await updateProfile(formData);
    if (result?.error) {
      setError(result.error);
    } else {
      setSuccess(true);
      router.refresh();
    }
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Avatar preview */}
      <div className="flex items-center gap-4">
        <UserAvatar
          avatarUrl={avatarUrl}
          displayName={displayName || "?"}
          size="lg"
          favoriteColor={favoriteColor}
        />
        <div className="flex-1 space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={emojiInput}
              onChange={(e) => handleEmojiChange(e.target.value)}
              placeholder="Type an emoji..."
              className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground/30"
              maxLength={8}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="rounded-lg border border-border px-3 py-2 text-sm text-foreground/70 hover:border-border-light hover:text-foreground transition-colors disabled:opacity-50"
            >
              {uploading ? "..." : "Upload"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.heic,.heif"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
          {avatarUrl && (
            <button
              type="button"
              onClick={() => { setAvatarUrl(null); setEmojiInput(""); }}
              className="text-xs text-foreground/40 hover:text-foreground/60"
            >
              Remove avatar
            </button>
          )}
        </div>
      </div>

      {/* Display Name */}
      <div>
        <label className="block text-sm font-medium text-foreground/70 mb-1">
          Display Name
        </label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground/30"
        />
      </div>

      {/* Bio */}
      <div>
        <label className="block text-sm font-medium text-foreground/70 mb-1">
          Bio
        </label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          maxLength={200}
          placeholder="A little about yourself..."
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground/30 resize-none"
        />
      </div>

      {/* Favorite Color */}
      <div>
        <label className="block text-sm font-medium text-foreground/70 mb-2">
          Favorite Color
        </label>
        <div className="flex gap-2">
          {MANA_COLORS.map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={() => setFavoriteColor(favoriteColor === c.code ? null : c.code)}
              className={`
                w-10 h-10 rounded-full flex items-center justify-center transition-all
                ${favoriteColor === c.code
                  ? "ring-2 ring-accent ring-offset-2 ring-offset-background scale-110"
                  : "opacity-60 hover:opacity-100"
                }
              `}
              title={c.label}
            >
              <i className={c.manaClass} style={{ fontSize: "20px" }} />
            </button>
          ))}
        </div>
      </div>

      {/* Submit */}
      {error && (
        <p className="text-sm text-danger">{error}</p>
      )}
      {success && (
        <p className="text-sm text-success">Profile updated!</p>
      )}
      <button
        type="submit"
        disabled={saving}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save Changes"}
      </button>
    </form>
  );
}
