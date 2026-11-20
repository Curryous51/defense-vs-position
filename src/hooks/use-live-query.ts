import { LIVE_MODE } from "@/lib/live-mode";
import { useAction, useQuery } from "convex/react";

/**
 * Convex hooks that degrade gracefully in the backend-free build.
 *
 * `LIVE_MODE` is a build-time constant, so picking the implementation at
 * module load keeps hook order identical for the whole life of the page —
 * static builds simply never call into Convex.
 */
type LiveQuery = typeof useQuery;
type LiveAction = typeof useAction;

const useNoopQuery = (() => undefined) as unknown as LiveQuery;
const useNoopAction = (() =>
  async (): Promise<never> => {
    throw new Error("This build is read-only.");
  }) as unknown as LiveAction;

export const useLiveQuery: LiveQuery = LIVE_MODE ? useQuery : useNoopQuery;
export const useLiveAction: LiveAction = LIVE_MODE ? useAction : useNoopAction;
