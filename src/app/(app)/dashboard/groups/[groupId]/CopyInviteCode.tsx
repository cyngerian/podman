"use client";

import { useState } from "react";

export default function CopyInviteCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <span className="rounded-lg border border-border bg-surface px-4 py-2.5 text-lg font-mono font-bold tracking-widest select-all">
        {code}
      </span>
      <button
        type="button"
        onClick={handleCopy}
        className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm font-medium hover:bg-surface-hover transition-colors"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}
