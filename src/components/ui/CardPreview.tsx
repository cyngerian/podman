"use client";

import Image from "next/image";
import type { CardReference } from "@/lib/types";

interface CardPreviewProps {
  card: CardReference | null;
  onPick?: () => void;
  showPickButton?: boolean;
  onClose?: () => void;
}

export default function CardPreview({
  card,
  onPick,
  showPickButton = true,
  onClose,
}: CardPreviewProps) {
  if (!card) {
    return (
      <div className="flex items-center justify-center h-full px-6 py-12">
        <p className="text-sm text-foreground/40">Tap a card to preview</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 px-4 py-3">
      {/* Swipe-up gesture hint bar */}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="w-10 h-1 rounded-full bg-foreground/30 shrink-0 cursor-pointer"
          aria-label="Close preview"
        />
      )}

      {/* Card image */}
      <div className="relative w-full max-w-[300px] card-aspect rounded-xl overflow-hidden">
        <Image
          src={card.imageUri}
          alt={card.name}
          fill
          sizes="300px"
          className="object-cover"
          priority
        />
      </div>

      {/* Card name */}
      <h2 className="text-lg font-semibold text-foreground text-center leading-tight">
        {card.name}
      </h2>

      {/* Pick button */}
      {showPickButton && onPick && (
        <button
          type="button"
          onClick={onPick}
          className="
            w-full max-w-[300px] py-3.5 rounded-xl
            bg-accent text-white font-bold text-base tracking-wide
            active:scale-[0.97] transition-all duration-100
            hover:bg-accent-hover
          "
        >
          PICK THIS CARD
        </button>
      )}
    </div>
  );
}
