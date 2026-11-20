import { api } from "@/convex/_generated/api";
import fallback from "@/data/hit-rate.json";
import { useLiveQuery } from "@/hooks/use-live-query";
import type { HitRateBoard } from "@/lib/hit-rate";

const fallbackBoard = fallback as unknown as HitRateBoard;

/**
 * The live hit-rate board written by the Convex sync, falling back to the
 * checked-in copy so the page renders before the first sync.
 */
export function useHitRateBoard(): { data: HitRateBoard; live: boolean } {
  const stored = useLiveQuery(api.hitRates.latest);
  if (stored?.payload) {
    return { data: stored.payload as HitRateBoard, live: true };
  }
  return { data: fallbackBoard, live: false };
}
