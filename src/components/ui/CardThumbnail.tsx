"use client";

import Image from "next/image";
import type { CardReference } from "@/lib/types";
import { getBorderClass } from "@/lib/card-utils";

interface CardThumbnailProps {
  card: CardReference;
  selected?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onMouseEnter?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseLeave?: () => void;
  size?: "small" | "medium";
  hideColorBorder?: boolean;
}

export default function CardThumbnail({
  card,
  selected = false,
  onClick,
  onDoubleClick,
  onMouseEnter,
  onMouseLeave,
  size = "medium",
  hideColorBorder = false,
}: CardThumbnailProps) {
  const borderClass = hideColorBorder ? "border-border" : getBorderClass(card.colors);
  const imageSrc = size === "small" ? card.smallImageUri : card.imageUri;

  return (
    <button
      type="button"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`
        relative rounded-lg overflow-hidden card-aspect
        border-2 transition-all duration-150 ease-out
        ${borderClass}
        ${selected ? "border-3 scale-105 ring-2 ring-accent/50" : "hover:scale-[1.02]"}
        ${size === "small" ? "w-16" : "w-full"}
      `}
    >
      <Image
        src={imageSrc}
        alt={card.name}
        fill
        sizes={size === "small" ? "(max-width: 768px) 25vw, 200px" : "(max-width: 768px) 30vw, 350px"}
        className="object-cover"
      />

      {card.isFoil && (
        <span
          className="absolute top-0.5 right-0.5 text-xs leading-none drop-shadow-md"
          aria-label="Foil"
        >
          ✦
        </span>
      )}

      {card.backImageUri && (
        <span
          className="absolute bottom-0.5 right-0.5 text-xs leading-none drop-shadow-md text-white/80"
          aria-label="Double-faced card"
        >
          ↻
        </span>
      )}
    </button>
  );
}
