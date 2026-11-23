import { useEffect, useState } from "react";

/** [potential assists, rebound chances] for one player in one game. */
export type TrackingRow = [number, number];

export interface TrackingFile {
  meta: {
    generatedAt: string;
    season: string;
    dates: string[];
    games: number;
    source: string;
  };
  /** playerId -> game start (ISO, as it appears in the game log) -> numbers. */
  players: Record<string, Record<string, TrackingRow>>;
}

/**
 * NBA tracking numbers are fetched from stats.nba.com by
 * `scripts/sync-tracking.ts` on a home connection and committed to
 * public/tracking.json, because the NBA blocks every cloud IP we have. The file
 * is optional: if it is missing the profile simply omits those two lines.
 */
let pending: Promise<TrackingFile | null> | null = null;

function loadTracking(): Promise<TrackingFile | null> {
  pending ??= fetch(`${import.meta.env.BASE_URL}tracking.json`)
    .then((response) => (response.ok ? (response.json() as Promise<TrackingFile>) : null))
    .catch(() => null);
  return pending;
}

export function useTracking(): TrackingFile | null {
  const [data, setData] = useState<TrackingFile | null>(null);

  useEffect(() => {
    let alive = true;
    void loadTracking().then((file) => {
      if (alive) setData(file);
    });
    return () => {
      alive = false;
    };
  }, []);

  return data;
}
