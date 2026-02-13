"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import UserAvatar from "@/components/ui/UserAvatar";
import { updateProfile } from "./actions";

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

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/avatar", { method: "POST", body: formData });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Upload failed");
      setUploading(false);
      return;
    }

    setAvatarUrl(data.url);
    setEmojiInput("");
    setUploading(false);
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
              accept="image/*"
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
