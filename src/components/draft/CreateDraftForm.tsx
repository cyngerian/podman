"use client";

import { useState } from "react";
import type {
  DraftFormat,
  PacingMode,
  TimerPreset,
  CubeSource,
} from "@/lib/types";
import SetPicker from "./SetPicker";

export interface DraftFormConfig {
  format: DraftFormat;
  pacingMode: PacingMode;
  setCode: string;
  setName: string;
  playerCount: number;
  packsPerPlayer: number;
  mixedPacks: boolean;
  packSets: { code: string; name: string }[] | null;
  timerPreset: TimerPreset;
  reviewPeriodSeconds: number;
  asyncDeadlineMinutes: number | null;
  deckBuildingEnabled: boolean;
  pickHistoryPublic: boolean;
  cubeList: string[] | null;
  cubeSource: CubeSource | null;
}

interface CreateDraftFormProps {
  onSubmit: (config: DraftFormConfig) => void;
  mode?: "propose" | "simulate";
}

const FORMAT_OPTIONS: {
  value: DraftFormat;
  label: string;
  description: string;
}[] = [
  {
    value: "standard",
    label: "Standard Booster",
    description: "Classic booster draft with configurable packs",
  },
  {
    value: "winston",
    label: "Winston (2 players)",
    description: "Two-player pile-based draft format",
  },
  {
    value: "cube",
    label: "Cube Draft",
    description: "Draft from a curated custom card list",
  },
];

const TIMER_OPTIONS: { value: TimerPreset; label: string; detail: string }[] = [
  { value: "relaxed", label: "Relaxed", detail: "1.5x timer" },
  { value: "competitive", label: "Competitive", detail: "Default" },
  { value: "speed", label: "Speed", detail: "0.5x timer" },
  { value: "none", label: "No Timer", detail: "Unlimited" },
];

export default function CreateDraftForm({ onSubmit, mode = "propose" }: CreateDraftFormProps) {
  const isSimulate = mode === "simulate";
  // Format
  const [format, setFormat] = useState<DraftFormat>("standard");

  // Set info (standard + winston)
  const [selectedSet, setSelectedSet] = useState<{ code: string; name: string } | null>(null);

  // Pack count & mixed packs (standard only)
  const [packsPerPlayer, setPacksPerPlayer] = useState(3);
  const [mixedPacks, setMixedPacks] = useState(false);
  const [packSets, setPackSets] = useState<({ code: string; name: string } | null)[]>([null, null, null]);

  // Cube info
  const [cubeTab, setCubeTab] = useState<"paste" | "cubecobra">("paste");
  const [cubeTextInput, setCubeTextInput] = useState("");
  const [cubeCobraUrl, setCubeCobraUrl] = useState("");
  const [cubeList, setCubeList] = useState<string[] | null>(null);
  const [cubeSource, setCubeSource] = useState<CubeSource | null>(null);

  // Player count
  const [playerCount, setPlayerCount] = useState(8);

  // Pacing
  const [pacingMode, setPacingMode] = useState<PacingMode>("realtime");

  // Timer (realtime)
  const [timerPreset, setTimerPreset] = useState<TimerPreset>("competitive");
  const [reviewPeriodSeconds, setReviewPeriodSeconds] = useState(60);

  // Async
  const [asyncDeadlineMinutes, setAsyncDeadlineMinutes] = useState<
    number | null
  >(null);

  // Options
  const [deckBuildingEnabled, setDeckBuildingEnabled] = useState(true);
  const [pickHistoryPublic, setPickHistoryPublic] = useState(false);

  // Enforce Winston = 2 players
  const effectivePlayerCount = format === "winston" ? 2 : playerCount;

  function parseCubeList(text: string): string[] {
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("//"));
  }

  function handleCubePasteBlur() {
    if (cubeTextInput.trim()) {
      const cards = parseCubeList(cubeTextInput);
      setCubeList(cards);
      setCubeSource("text");
    } else {
      setCubeList(null);
      setCubeSource(null);
    }
  }

  function handleCubeCobraImport() {
    if (cubeCobraUrl.trim()) {
      // MVP: set placeholder — real import would fetch from CubeCobra API
      setCubeList([]);
      setCubeSource("cubecobra");
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const effectivePacksPerPlayer = format === "standard" ? packsPerPlayer : 3;
    const effectiveMixedPacks = format === "standard" && mixedPacks;
    const effectivePackSets = effectiveMixedPacks
      ? packSets.filter((s): s is { code: string; name: string } => s !== null)
      : null;

    onSubmit({
      format,
      pacingMode: isSimulate ? "realtime" : pacingMode,
      setCode: format !== "cube" ? (selectedSet?.code ?? "") : "",
      setName: format !== "cube" ? (selectedSet?.name ?? "") : "",
      playerCount: effectivePlayerCount,
      packsPerPlayer: effectivePacksPerPlayer,
      mixedPacks: effectiveMixedPacks,
      packSets: effectivePackSets,
      timerPreset: isSimulate ? "none" : (pacingMode === "realtime" ? timerPreset : "none"),
      reviewPeriodSeconds: isSimulate ? 0 : (pacingMode === "realtime" ? reviewPeriodSeconds : 0),
      asyncDeadlineMinutes: isSimulate ? null : (pacingMode === "async" ? asyncDeadlineMinutes : null),
      deckBuildingEnabled,
      pickHistoryPublic: isSimulate ? true : pickHistoryPublic,
      cubeList: format === "cube" ? cubeList : null,
      cubeSource: format === "cube" ? cubeSource : null,
    });
  }

  const mixedPacksValid = !mixedPacks || packSets.slice(0, packsPerPlayer).every((s) => s !== null);
  const isValid =
    (format === "standard" && (mixedPacks ? mixedPacksValid : selectedSet !== null)) ||
    (format === "winston" && selectedSet !== null) ||
    (format === "cube" && cubeList !== null && cubeList.length > 0);

  return (
    <form onSubmit={handleSubmit} className="space-y-8 pb-8">
      {/* ── Format Selection ── */}
      <fieldset>
        <legend className="text-sm font-medium text-foreground/70 uppercase tracking-wide mb-3">
          Format
        </legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {FORMAT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                setFormat(opt.value);
                if (opt.value === "winston") setPlayerCount(2);
              }}
              className={`rounded-xl border-2 p-4 text-left transition-colors ${
                format === opt.value
                  ? "border-accent bg-accent/10"
                  : "border-border bg-surface hover:border-border-light"
              }`}
            >
              <span className="block text-base font-semibold">{opt.label}</span>
              <span className="block mt-1 text-sm text-foreground/50">
                {opt.description}
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      {/* ── Set Selection (Standard + Winston — hidden when mixed packs on) ── */}
      {format !== "cube" && !mixedPacks && (
        <fieldset>
          <legend className="text-sm font-medium text-foreground/70 uppercase tracking-wide mb-3">
            Set
          </legend>
          <SetPicker value={selectedSet} onChange={setSelectedSet} />
        </fieldset>
      )}

      {/* ── Packs Per Player (Standard only) ── */}
      {format === "standard" && (
        <fieldset>
          <legend className="text-sm font-medium text-foreground/70 uppercase tracking-wide mb-3">
            Packs Per Player
          </legend>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => {
                const next = Math.max(1, packsPerPlayer - 1);
                setPacksPerPlayer(next);
                setPackSets((prev) => {
                  const arr = [...prev];
                  while (arr.length < next) arr.push(null);
                  return arr.slice(0, next);
                });
              }}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface text-lg font-bold hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              disabled={packsPerPlayer <= 1}
            >
              &minus;
            </button>
            <span className="text-2xl font-semibold tabular-nums w-8 text-center">
              {packsPerPlayer}
            </span>
            <button
              type="button"
              onClick={() => {
                const next = Math.min(6, packsPerPlayer + 1);
                setPacksPerPlayer(next);
                setPackSets((prev) => {
                  const arr = [...prev];
                  while (arr.length < next) arr.push(null);
                  return arr.slice(0, next);
                });
              }}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface text-lg font-bold hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              disabled={packsPerPlayer >= 6}
            >
              +
            </button>
          </div>
        </fieldset>
      )}

      {/* ── Mixed Packs (Standard only) ── */}
      {format === "standard" && (
        <fieldset>
          <legend className="text-sm font-medium text-foreground/70 uppercase tracking-wide mb-3">
            Mixed Packs
          </legend>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={mixedPacks}
              onChange={(e) => {
                const on = e.target.checked;
                setMixedPacks(on);
                if (!on && selectedSet) {
                  // Reset all pack sets to the single selected set
                  setPackSets(Array(packsPerPlayer).fill(null));
                }
              }}
              className="h-5 w-5 rounded border-border bg-surface accent-accent"
            />
            <span className="text-sm">Use a different set for each pack round</span>
          </label>

          {mixedPacks && (
            <div className="mt-4 space-y-3">
              {Array.from({ length: packsPerPlayer }, (_, i) => (
                <div key={i}>
                  <span className="block text-xs font-medium text-foreground/50 mb-1">
                    Pack {i + 1}
                  </span>
                  <SetPicker
                    id={`set-picker-pack-${i}`}
                    value={packSets[i] ?? null}
                    onChange={(set) =>
                      setPackSets((prev) => {
                        const arr = [...prev];
                        arr[i] = set;
                        return arr;
                      })
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </fieldset>
      )}

      {/* ── Cube Import ── */}
      {format === "cube" && (
        <fieldset>
          <legend className="text-sm font-medium text-foreground/70 uppercase tracking-wide mb-3">
            Cube List
          </legend>

          {/* Tabs */}
          <div className="flex border-b border-border mb-4">
            <button
              type="button"
              onClick={() => setCubeTab("paste")}
              className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
                cubeTab === "paste"
                  ? "border-accent text-accent"
                  : "border-transparent text-foreground/50 hover:text-foreground/70"
              }`}
            >
              Paste List
            </button>
            <button
              type="button"
              onClick={() => setCubeTab("cubecobra")}
              className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
                cubeTab === "cubecobra"
                  ? "border-accent text-accent"
                  : "border-transparent text-foreground/50 hover:text-foreground/70"
              }`}
            >
              CubeCobra URL
            </button>
          </div>

          {cubeTab === "paste" ? (
            <textarea
              value={cubeTextInput}
              onChange={(e) => setCubeTextInput(e.target.value)}
              onBlur={handleCubePasteBlur}
              placeholder="One card name per line..."
              rows={8}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-mono placeholder:text-foreground/30 focus:border-accent focus:outline-none resize-y"
            />
          ) : (
            <div className="flex gap-3">
              <input
                type="text"
                value={cubeCobraUrl}
                onChange={(e) => setCubeCobraUrl(e.target.value)}
                placeholder="CubeCobra cube URL or ID"
                className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm placeholder:text-foreground/30 focus:border-accent focus:outline-none"
              />
              <button
                type="button"
                onClick={handleCubeCobraImport}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors"
              >
                Import
              </button>
            </div>
          )}

          {cubeList !== null && (
            <p className="mt-2 text-sm text-success">
              {cubeList.length} cards loaded
            </p>
          )}
        </fieldset>
      )}

      {/* ── Player Count ── */}
      <fieldset>
        <legend className="text-sm font-medium text-foreground/70 uppercase tracking-wide mb-3">
          Players
        </legend>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() =>
              setPlayerCount((c) => Math.max(2, c - 1))
            }
            disabled={format === "winston"}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface text-lg font-bold hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            &minus;
          </button>
          <span className="text-2xl font-semibold tabular-nums w-8 text-center">
            {effectivePlayerCount}
          </span>
          <button
            type="button"
            onClick={() =>
              setPlayerCount((c) => Math.min(8, c + 1))
            }
            disabled={format === "winston"}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface text-lg font-bold hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            +
          </button>
          {format === "winston" && (
            <span className="text-xs text-foreground/40">
              Winston is always 2 players
            </span>
          )}
        </div>
      </fieldset>

      {/* ── Pacing Mode (hidden in simulate mode) ── */}
      {!isSimulate && <fieldset>
        <legend className="text-sm font-medium text-foreground/70 uppercase tracking-wide mb-3">
          Pacing
        </legend>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setPacingMode("realtime")}
            className={`rounded-xl border-2 p-4 text-left transition-colors ${
              pacingMode === "realtime"
                ? "border-accent bg-accent/10"
                : "border-border bg-surface hover:border-border-light"
            }`}
          >
            <span className="flex items-center gap-2 text-base font-semibold">
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z"
                />
              </svg>
              Real-time
            </span>
            <span className="block mt-1 text-sm text-foreground/50">
              Pick timers, everyone drafts together
            </span>
          </button>
          <button
            type="button"
            onClick={() => setPacingMode("async")}
            className={`rounded-xl border-2 p-4 text-left transition-colors ${
              pacingMode === "async"
                ? "border-accent bg-accent/10"
                : "border-border bg-surface hover:border-border-light"
            }`}
          >
            <span className="flex items-center gap-2 text-base font-semibold">
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              Async
            </span>
            <span className="block mt-1 text-sm text-foreground/50">
              Pick on your own schedule
            </span>
          </button>
        </div>
      </fieldset>}

      {/* ── Timer Preset (realtime, hidden in simulate mode) ── */}
      {!isSimulate && pacingMode === "realtime" && (
        <fieldset>
          <legend className="text-sm font-medium text-foreground/70 uppercase tracking-wide mb-3">
            Timer Preset
          </legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TIMER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTimerPreset(opt.value)}
                className={`rounded-lg border px-3 py-2.5 text-center transition-colors ${
                  timerPreset === opt.value
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border bg-surface text-foreground/70 hover:border-border-light"
                }`}
              >
                <span className="block text-sm font-medium">{opt.label}</span>
                <span className="block text-xs text-foreground/40">
                  {opt.detail}
                </span>
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {/* ── Review Period (realtime, hidden in simulate mode) ── */}
      {!isSimulate && pacingMode === "realtime" && (
        <fieldset>
          <legend className="text-sm font-medium text-foreground/70 uppercase tracking-wide mb-3">
            Review Period
          </legend>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={0}
              max={120}
              step={5}
              value={reviewPeriodSeconds}
              onChange={(e) =>
                setReviewPeriodSeconds(Number(e.target.value))
              }
              className="flex-1 accent-accent"
            />
            <span className="w-14 text-right text-sm tabular-nums">
              {reviewPeriodSeconds}s
            </span>
          </div>
          <p className="mt-1 text-xs text-foreground/40">
            Time to review your picks between packs (0-120 seconds)
          </p>
        </fieldset>
      )}

      {/* ── Async Deadline (hidden in simulate mode) ── */}
      {!isSimulate && pacingMode === "async" && (
        <fieldset>
          <legend className="text-sm font-medium text-foreground/70 uppercase tracking-wide mb-3">
            Pick Deadline
          </legend>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={0}
              value={asyncDeadlineMinutes ?? 0}
              onChange={(e) => {
                const v = Number(e.target.value);
                setAsyncDeadlineMinutes(v > 0 ? v : null);
              }}
              className="w-28 rounded-lg border border-border bg-surface px-3 py-2 text-sm tabular-nums placeholder:text-foreground/30 focus:border-accent focus:outline-none"
            />
            <span className="text-sm text-foreground/50">minutes</span>
          </div>
          <p className="mt-1 text-xs text-foreground/40">
            Optional. 0 or empty = no deadline.
          </p>
        </fieldset>
      )}

      {/* ── Options ── */}
      <fieldset>
        <legend className="text-sm font-medium text-foreground/70 uppercase tracking-wide mb-3">
          Options
        </legend>
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={deckBuildingEnabled}
              onChange={(e) => setDeckBuildingEnabled(e.target.checked)}
              className="h-5 w-5 rounded border-border bg-surface accent-accent"
            />
            <span className="text-sm">Enable deck building phase</span>
          </label>
          {!isSimulate && (
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={pickHistoryPublic}
                onChange={(e) => setPickHistoryPublic(e.target.checked)}
                className="h-5 w-5 rounded border-border bg-surface accent-accent"
              />
              <span className="text-sm">Share pick history after draft</span>
            </label>
          )}
        </div>
      </fieldset>

      {/* ── Submit ── */}
      <button
        type="submit"
        disabled={!isValid}
        className="w-full rounded-xl bg-accent py-3.5 text-base font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isSimulate ? "Start Simulation" : "Create Draft"}
      </button>
    </form>
  );
}
