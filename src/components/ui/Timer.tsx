"use client";

interface TimerProps {
  seconds: number;
  maxSeconds: number;
  paused?: boolean;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function getTimerClass(seconds: number, maxSeconds: number): string {
  if (maxSeconds <= 0) return "timer-green";
  const ratio = seconds / maxSeconds;
  if (ratio > 0.5) return "timer-green";
  if (ratio > 0.25) return "timer-yellow";
  return "timer-red";
}

export default function Timer({ seconds, maxSeconds, paused = false }: TimerProps) {
  const timerClass = getTimerClass(seconds, maxSeconds);

  if (paused) {
    return (
      <div className="flex items-center gap-1.5 text-foreground/50 font-mono text-lg font-semibold">
        <ClockIcon />
        <span>PAUSED</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-1.5 font-mono text-lg font-semibold ${timerClass}`}>
      <ClockIcon />
      <span>{formatTime(seconds)}</span>
    </div>
  );
}

function ClockIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="w-5 h-5"
    >
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
