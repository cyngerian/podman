"use client";

import { useRef, useEffect } from "react";
import type { CardReference } from "@/lib/types";

// --- Physics constants ---

const SCROLL_ACTIVE_SCALE = 1.15;
const SCROLL_INACTIVE_SCALE = 0.55;
const CARD_PULL_PX = 28;
const FRICTION_PER_MS = 0.9975; // ~0.96 per 16ms frame
const SNAP_VEL_THRESHOLD = 0.03; // px/ms — below this, snap to nearest
const SNAP_SETTLE = 0.5; // px — snap animation done when this close
const RUBBER_BAND = 0.3; // overscroll resistance during drag

// --- Types ---

interface UseCarouselOptions {
  filteredCards: CardReference[];
  filterKey: string;
  flippedCardsRef: React.RefObject<Set<string>>;
}

// --- Hook ---

/**
 * Pure transform carousel — no native scroll. All card movement driven by
 * JS touch handlers + rAF physics loop. Eliminates compositor/main-thread
 * timing mismatch that causes flicker on 120Hz displays.
 *
 * Returns refs to attach to carousel DOM elements and a snapToCardRef
 * for programmatic navigation (scrub bar, grid view).
 */
export function useCarousel({ filteredCards, filterKey, flippedCardsRef }: UseCarouselOptions) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const nameRef = useRef<HTMLParagraphElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const scrubThumbRef = useRef<HTMLDivElement>(null);
  const scrubBarRef = useRef<HTMLDivElement>(null);
  const activeIndexRef = useRef(0);
  const snapToCardRef = useRef<(index: number) => void>(() => {});

  useEffect(() => {
    const container = scrollRef.current;
    const wrapper = wrapperRef.current;
    if (!container || !wrapper || filteredCards.length === 0) return;

    // Trim stale refs from previous renders with more cards
    cardRefs.current.length = filteredCards.length;

    let running = true;
    let rafId = 0;

    // Layout cache
    const containerWidth = container.offsetWidth;
    const halfContainer = containerWidth / 2;
    const maxDist = containerWidth * 0.45;
    const scaleRange = SCROLL_ACTIVE_SCALE - SCROLL_INACTIVE_SCALE;

    const cardCenters: number[] = [];
    cardRefs.current.forEach((cardEl) => {
      if (!cardEl) { cardCenters.push(0); return; }
      cardCenters.push(cardEl.offsetLeft + cardEl.offsetWidth / 2);
    });

    const numCards = cardCenters.length;
    const minOffset = cardCenters[0] ?? 0;
    const maxOffset = cardCenters[numCards - 1] ?? 0;
    const offsetRange = maxOffset - minOffset;
    const canSwipe = numCards > 1;

    // Physics state
    let offset = cardCenters[0] ?? 0; // center on first card
    let velocity = 0; // px/ms
    let snapTarget: number | null = null;
    let isDragging = false;
    let lastTouchX = 0;
    let lastFrameTime = performance.now();
    const touchHistory: { x: number; t: number }[] = [];

    const clampOffset = (v: number) => Math.max(minOffset, Math.min(maxOffset, v));

    const rubberBand = (v: number): number => {
      if (v < minOffset) return minOffset + (v - minOffset) * RUBBER_BAND;
      if (v > maxOffset) return maxOffset + (v - maxOffset) * RUBBER_BAND;
      return v;
    };

    const findNearestCard = (pos: number): number => {
      let closest = cardCenters[0];
      let closestDist = Infinity;
      for (const center of cardCenters) {
        const d = Math.abs(pos - center);
        if (d < closestDist) { closestDist = d; closest = center; }
      }
      return closest;
    };

    const updateVisuals = () => {
      // Wrapper position — offset is the point in wrapper-space at screen center
      wrapper.style.transform = `translate3d(${halfContainer - offset}px, 0, 0)`;

      // Per-card transforms
      let closestIdx = 0;
      let closestDist = Infinity;

      for (let i = 0; i < cardRefs.current.length; i++) {
        const cardEl = cardRefs.current[i];
        if (!cardEl) continue;
        const dist = Math.abs(offset - cardCenters[i]);
        const t = Math.min(dist / maxDist, 1);
        const scale = Math.round((SCROLL_ACTIVE_SCALE - t * scaleRange) * 1000) / 1000;
        const pull = dist < 1 ? 0 : Math.round(Math.sign(offset - cardCenters[i]) * t * CARD_PULL_PX * 10) / 10;

        const inner = cardEl.firstElementChild as HTMLElement | null;
        if (inner) {
          inner.style.transform = `translate3d(${pull}px,0,0) scale3d(${scale},${scale},1)`;
        }

        if (dist < closestDist) { closestDist = dist; closestIdx = i; }
      }

      // Update zIndex + UI text only when active card changes
      if (closestIdx !== activeIndexRef.current) {
        activeIndexRef.current = closestIdx;
        for (let i = 0; i < cardRefs.current.length; i++) {
          const cardEl = cardRefs.current[i];
          if (cardEl) cardEl.style.zIndex = `${100 - Math.abs(i - closestIdx) * 10}`;
        }
        if (counterRef.current) counterRef.current.textContent = `${closestIdx + 1} / ${filteredCards.length}`;
        if (nameRef.current) {
          const card = filteredCards[closestIdx];
          if (!card) {
            nameRef.current.textContent = "";
          } else {
            const isFlipped = flippedCardsRef.current.has(card.scryfallId);
            if (!isFlipped) {
              nameRef.current.textContent = card.name;
            } else {
              const parts = card.name.split(" // ");
              nameRef.current.textContent = parts.length > 1 ? parts[1] : card.name;
            }
          }
        }
      }

      // Scrub bar — position thumb by center, clamped to track bounds
      if (scrubThumbRef.current && offsetRange > 0) {
        const progress = (offset - minOffset) / offsetRange;
        const trackWidth = scrubBarRef.current?.querySelector('[data-scrub-track]')?.clientWidth ?? 0;
        const thumbWidth = scrubThumbRef.current.offsetWidth;
        const maxLeft = trackWidth - thumbWidth;
        const leftPx = Math.round(progress * maxLeft);
        scrubThumbRef.current.style.transform = `translateX(${leftPx}px)`;
      }
    };

    // Expose snap-to-card for scrub bar
    snapToCardRef.current = (idx: number) => {
      velocity = 0;
      snapTarget = cardCenters[Math.max(0, Math.min(idx, cardCenters.length - 1))];
    };

    // --- Touch handlers ---
    const onTouchStart = (e: TouchEvent) => {
      isDragging = true;
      velocity = 0;
      snapTarget = null;
      lastTouchX = e.touches[0].clientX;
      touchHistory.length = 0;
      touchHistory.push({ x: lastTouchX, t: performance.now() });
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault(); // we own all touch behavior
      const x = e.touches[0].clientX;
      const dx = x - lastTouchX;
      lastTouchX = x;
      offset = rubberBand(offset - dx); // drag right → offset decreases → earlier cards

      const now = performance.now();
      touchHistory.push({ x, t: now });
      if (touchHistory.length > 5) touchHistory.shift();
    };

    const onTouchEnd = () => {
      isDragging = false;

      // Snap back from rubber band overscroll
      if (offset < minOffset || offset > maxOffset) {
        velocity = 0;
        snapTarget = offset < minOffset ? minOffset : maxOffset;
        return;
      }

      // Compute velocity from touch history
      if (touchHistory.length >= 2) {
        const last = touchHistory[touchHistory.length - 1];
        let ref = touchHistory[0];
        const now = performance.now();
        for (let i = touchHistory.length - 2; i >= 0; i--) {
          if (now - touchHistory[i].t > 50) { ref = touchHistory[i]; break; }
        }
        const dt = last.t - ref.t;
        if (dt > 0) velocity = -(last.x - ref.x) / dt; // px/ms
      }

      // If velocity too low, snap immediately
      if (Math.abs(velocity) < SNAP_VEL_THRESHOLD) {
        velocity = 0;
        snapTarget = findNearestCard(offset);
      }
    };

    // --- rAF loop ---
    const tick = () => {
      if (!running) return;
      const now = performance.now();
      const dt = Math.min(now - lastFrameTime, 32); // cap at ~30fps min
      lastFrameTime = now;

      if (!isDragging) {
        if (snapTarget !== null) {
          // Snap animation — frame-rate independent lerp
          const diff = snapTarget - offset;
          offset += diff * (1 - Math.pow(0.85, dt / 16.67));
          if (Math.abs(diff) < SNAP_SETTLE) {
            offset = snapTarget;
            snapTarget = null;
          }
        } else if (Math.abs(velocity) > 0.001) {
          // Momentum — frame-rate independent friction
          offset += velocity * dt;
          velocity *= Math.pow(FRICTION_PER_MS, dt);
          offset = clampOffset(offset);

          if (Math.abs(velocity) < SNAP_VEL_THRESHOLD) {
            velocity = 0;
            snapTarget = findNearestCard(offset);
          }
        }
      }

      updateVisuals();
      rafId = requestAnimationFrame(tick);
    };

    // Initial state
    updateVisuals();
    for (let i = 0; i < cardRefs.current.length; i++) {
      const cardEl = cardRefs.current[i];
      if (cardEl) cardEl.style.zIndex = `${100 - Math.abs(i) * 10}`;
    }

    // Start loop + listeners (only attach touch if more than 1 card)
    rafId = requestAnimationFrame(tick);
    if (canSwipe) {
      container.addEventListener("touchstart", onTouchStart, { passive: true });
      container.addEventListener("touchmove", onTouchMove, { passive: false });
      container.addEventListener("touchend", onTouchEnd, { passive: true });
    }

    return () => {
      running = false;
      cancelAnimationFrame(rafId);
      if (canSwipe) {
        container.removeEventListener("touchstart", onTouchStart);
        container.removeEventListener("touchmove", onTouchMove);
        container.removeEventListener("touchend", onTouchEnd);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- carousel setup only re-runs on count/filter change, not array identity
  }, [filteredCards.length, filterKey]);

  return {
    scrollRef,
    wrapperRef,
    cardRefs,
    nameRef,
    counterRef,
    scrubThumbRef,
    scrubBarRef,
    activeIndexRef,
    snapToCardRef,
  };
}
