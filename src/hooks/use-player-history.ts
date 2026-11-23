import { api } from "@/convex/_generated/api";
import { useLiveQuery } from "@/hooks/use-live-query";
import { unpackGame, type GameLine, type GameLineFields } from "@/lib/hit-rate";
import { useMemo } from "react";

/**
 * Game log for one player.
 *
 * The live app asks Convex for it (the board document deliberately leaves the
 * history out), while the backend-free build reads what the checked-in snapshot
 * already carries.
 */
export function usePlayerHistory(
  playerId: string | undefined,
  opponentId: string | undefined,
  currentSeason: number,
  embedded: GameLine[] | undefined,
): { games: GameLineFields[]; loading: boolean } {
  const remote = useLiveQuery(
    api.hitRates.playerHistory,
    playerId && opponentId
      ? { playerId, opponentId, currentSeason }
      : "skip",
  );

  const games = useMemo(() => (remote ?? embedded ?? []).map(unpackGame), [
    embedded,
    remote,
  ]);

  return { games, loading: remote === undefined && !embedded };
}
