"use client";

import type { CardReference } from "@/lib/types";

interface ManaCurveProps {
  cards: CardReference[];
}

export default function ManaCurve({ cards }: ManaCurveProps) {
  // Bucket cards by CMC: 0, 1, 2, 3, 4, 5, 6, 7+
  const buckets = new Array(8).fill(0) as number[];
  for (const card of cards) {
    const idx = Math.min(Math.floor(card.cmc), 7);
    buckets[idx]++;
  }

  const maxCount = Math.max(...buckets, 1);
  const labels = ["0", "1", "2", "3", "4", "5", "6", "7+"];

  return (
    <div className="flex items-end justify-center gap-1.5 h-24 px-2">
      {buckets.map((count, i) => (
        <div key={labels[i]} className="flex flex-col items-center gap-0.5 flex-1 min-w-0">
          {/* Count label */}
          <span className="text-[10px] font-mono text-foreground/60">
            {count > 0 ? count : ""}
          </span>

          {/* Bar */}
          <div className="w-full flex items-end" style={{ height: "60px" }}>
            <div
              className="w-full rounded-t bg-accent curve-bar"
              style={{
                height: count > 0 ? `${(count / maxCount) * 100}%` : "0%",
                minHeight: count > 0 ? "4px" : "0px",
              }}
            />
          </div>

          {/* CMC label */}
          <span className="text-[10px] font-mono text-foreground/40">
            {labels[i]}
          </span>
        </div>
      ))}
    </div>
  );
}
