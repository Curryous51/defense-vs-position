import { api } from "@/convex/_generated/api";
import fallback from "@/data/hit-rate.json";
import { useLiveQuery } from "@/hooks/use-live-query";
import type { HitRateBoard } from "@/lib/hit-rate";
import { LIVE_MODE } from "@/lib/live-mode";
import { fetchBoard } from "@/lib/static-refresh";
import { useCallback, useEffect, useState } from "react";

const fallbackBoard = fallback as unknown as HitRateBoard;

/**
 * The live hit-rate board written by the Convex sync.
 *
 * In the backend-free build there is no deployment to subscribe to, so the
 * committed snapshot is fetched from GitHub at load time (and again after a
 * manual refresh). Either way the checked-in copy is the last resort, so the
 * page renders before the first sync.
 */
export function useHitRateBoard(): {
  data: HitRateBoard;
  live: boolean;
  reload: () => Promise<void>;
} {
  const stored = useLiveQuery(api.hitRates.latest);
  const [remote, setRemote] = useState<HitRateBoard | null>(null);

  useEffect(() => {
    if (LIVE_MODE) return;
    let active = true;
    fetchBoard()
      .then((board) => {
        if (active) setRemote(board);
      })
      .catch(() => {
        // Keep the bundled snapshot; a refresh can retry later.
      });
    return () => {
      active = false;
    };
  }, []);

  const reload = useCallback(async () => {
    const board = await fetchBoard();
    setRemote(board);
  }, []);

  if (stored?.payload) {
    return { data: stored.payload as HitRateBoard, live: true, reload };
  }
  if (remote) {
    return { data: remote, live: false, reload };
  }
  return { data: fallbackBoard, live: false, reload };
}
