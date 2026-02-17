import Image from "next/image";

interface UserAvatarProps {
  avatarUrl: string | null;
  displayName: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  favoriteColor?: string | null;
}

const COLOR_BORDER: Record<string, string> = {
  W: "ring-amber-200",
  U: "ring-blue-500",
  B: "ring-violet-700",
  R: "ring-red-500",
  G: "ring-green-500",
};

const SIZES = {
  sm: 24,
  md: 32,
  lg: 64,
} as const;

const TEXT_SIZES = {
  sm: "text-[10px]",
  md: "text-xs",
  lg: "text-xl",
} as const;

function isUrl(s: string): boolean {
  return s.startsWith("http://") || s.startsWith("https://");
}

function isEmoji(s: string): boolean {
  // If it's not a URL and is 1-2 characters (emoji can be multi-codepoint), treat as emoji
  return !isUrl(s) && s.length > 0 && s.length <= 8;
}

export default function UserAvatar({
  avatarUrl,
  displayName,
  size = "md",
  className = "",
  favoriteColor,
}: UserAvatarProps) {
  const px = SIZES[size];

  const ringClass = favoriteColor && COLOR_BORDER[favoriteColor]
    ? `ring-1 ${COLOR_BORDER[favoriteColor]}`
    : "";
  const baseClasses = `inline-flex items-center justify-center rounded-full shrink-0 overflow-hidden ${ringClass} ${className}`;

  // URL avatar — render image
  if (avatarUrl && isUrl(avatarUrl)) {
    return (
      <div
        className={baseClasses}
        style={{ width: px, height: px }}
      >
        <Image
          src={avatarUrl}
          alt={displayName}
          width={px}
          height={px}
          className="object-cover w-full h-full"
          unoptimized
        />
      </div>
    );
  }

  // Emoji avatar — render emoji in colored circle
  if (avatarUrl && isEmoji(avatarUrl)) {
    return (
      <div
        className={`${baseClasses} bg-surface border border-border`}
        style={{ width: px, height: px }}
      >
        <span className={TEXT_SIZES[size]} style={{ lineHeight: 1 }}>
          {avatarUrl}
        </span>
      </div>
    );
  }

  // Fallback — first letter of display name
  const letter = displayName.charAt(0).toUpperCase();
  return (
    <div
      className={`${baseClasses} bg-accent/20 text-accent font-bold ${TEXT_SIZES[size]}`}
      style={{ width: px, height: px }}
    >
      {letter}
    </div>
  );
}
