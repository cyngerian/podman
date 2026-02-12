"use client";

import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase";

/**
 * Hook that creates a Supabase Realtime channel, runs a setup callback,
 * and cleans up on unmount.
 *
 * Usage:
 *   useRealtimeChannel("my-channel", (channel) => {
 *     channel.on("postgres_changes", { ... }, handler).subscribe();
 *   });
 */
export function useRealtimeChannel(
  channelName: string,
  setup: (channel: RealtimeChannel) => void,
  deps: React.DependencyList = []
) {
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(channelName);
    channelRef.current = channel;

    setup(channel);

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, ...deps]);

  return channelRef;
}
