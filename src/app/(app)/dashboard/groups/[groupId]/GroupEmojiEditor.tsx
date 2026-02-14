"use client";

import { useState, useTransition } from "react";
import { updateGroupEmoji } from "./actions";

export default function GroupEmojiEditor({
  groupId,
  currentEmoji,
  isAdmin,
}: {
  groupId: string;
  currentEmoji: string | null;
  isAdmin: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentEmoji ?? "");
  const [pending, startTransition] = useTransition();

  if (!isAdmin) {
    return currentEmoji ? <span>{currentEmoji}</span> : null;
  }

  if (!editing) {
    return (
      <button
        onClick={() => {
          setValue(currentEmoji ?? "");
          setEditing(true);
        }}
        className="text-foreground/30 hover:text-foreground/60 transition-colors text-sm"
        title="Edit emoji"
      >
        {currentEmoji || "+ emoji"}
      </button>
    );
  }

  function save() {
    startTransition(async () => {
      await updateGroupEmoji(groupId, value.trim() || null);
      setEditing(false);
    });
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
        onBlur={save}
        maxLength={8}
        autoFocus
        className="w-16 rounded border border-border bg-surface px-1.5 py-0.5 text-sm text-center focus:border-accent focus:outline-none"
        disabled={pending}
      />
    </span>
  );
}
