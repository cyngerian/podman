"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface MTGSet {
  code: string;
  name: string;
  releasedAt: string;
  iconSvgUri: string;
}

interface SetPickerProps {
  value: { code: string; name: string } | null;
  onChange: (set: { code: string; name: string } | null) => void;
  id?: string;
}

export default function SetPicker({ value, onChange, id = "set-picker" }: SetPickerProps) {
  const [sets, setSets] = useState<MTGSet[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState(value?.name ?? "");
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Fetch sets on mount
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/sets")
      .then((r) => r.json())
      .then((data: MTGSet[]) => {
        if (!cancelled) setSets(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const filtered = query.trim()
    ? sets.filter(
        (s) =>
          s.name.toLowerCase().includes(query.toLowerCase()) ||
          s.code.toLowerCase().includes(query.toLowerCase())
      )
    : sets;

  const display = filtered.slice(0, 50);

  const selectSet = useCallback(
    (s: MTGSet) => {
      onChange({ code: s.code.toUpperCase(), name: s.name });
      setQuery(s.name);
      setOpen(false);
    },
    [onChange]
  );

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setOpen(true);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightIndex((i) => Math.min(i + 1, display.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (display[highlightIndex]) selectSet(display[highlightIndex]);
        break;
      case "Escape":
        setOpen(false);
        break;
    }
  }

  // Scroll highlighted item into view
  useEffect(() => {
    if (!open || !listRef.current) return;
    const item = listRef.current.children[highlightIndex] as HTMLElement;
    item?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex, open]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        inputRef.current &&
        !inputRef.current.parentElement?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const year = (dateStr: string) => dateStr.slice(0, 4);

  return (
    <div className="relative">
      <label
        htmlFor={id}
        className="block text-xs text-foreground/50 mb-1"
      >
        Set
      </label>
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlightIndex(0);
          if (!e.target.value.trim()) onChange(null);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={loading ? "Loading sets..." : "Search sets..."}
        autoComplete="off"
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm placeholder:text-foreground/30 focus:border-accent focus:outline-none"
      />
      {value && (
        <span className="absolute right-3 top-[1.85rem] text-xs text-foreground/40 font-mono">
          {value.code}
        </span>
      )}
      {open && display.length > 0 && (
        <ul
          ref={listRef}
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-border bg-surface shadow-lg"
        >
          {display.map((s, i) => (
            <li
              key={s.code}
              onMouseDown={() => selectSet(s)}
              onMouseEnter={() => setHighlightIndex(i)}
              className={`flex items-center justify-between px-3 py-2 text-sm cursor-pointer ${
                i === highlightIndex
                  ? "bg-accent/10 text-accent"
                  : "text-foreground hover:bg-surface-hover"
              }`}
            >
              <span className="truncate">
                <span className="font-medium">{s.name}</span>
              </span>
              <span className="ml-2 shrink-0 text-xs text-foreground/40 font-mono">
                {s.code.toUpperCase()} &middot; {year(s.releasedAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {open && !loading && query.trim() && display.length === 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground/40">
          No sets found
        </div>
      )}
    </div>
  );
}
