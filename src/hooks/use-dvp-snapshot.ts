import { api } from "@/convex/_generated/api";
import { useLiveQuery } from "@/hooks/use-live-query";
import { fallbackSnapshot, type Snapshot } from "@/lib/dvp";
import { useEffect, useState } from "react";

/**
 * The live snapshot written by the daily Convex sync. Falls back to the
 * checked-in snapshot so the board renders immediately, even before the first
 * sync or if the deployment is unreachable.
 */
export function useDvpSnapshot(): { data: Snapshot; live: boolean } {
  const stored = useLiveQuery(api.nba.latest);
  if (stored?.payload) {
    return { data: stored.payload as Snapshot, live: true };
  }
  return { data: fallbackSnapshot, live: false };
}

/** Re-renders on an interval so finished games drop off without a reload. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}
