"use node";

import type { BuiltSnapshot } from "./nbaBuilder";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { buildHitRateBoard, type GameLog } from "./hitRateBuilder";

/** Short, stable fingerprint of the rows, used to skip no-op writes. */
function fingerprint(value: unknown): string {
  const text = JSON.stringify(value);
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
  }
  return `${text.length.toString(36)}-${hash.toString(36)}`;
}

/**
 * Rebuilds the hit-rate board: today's prop lines joined with each player's
 * game log, plus injuries, depth order and the opponent's DvP rank.
 *
 * Runs on the daily cron and can be triggered by hand with
 * `bunx convex run hitRateActions:sync`. When the rebuilt rows match what is
 * already stored, the payload is left untouched: a rewrite is the most
 * expensive thing this deployment does on the free plan.
 */
export const sync = action({
  args: {},
  handler: async (
    ctx,
  ): Promise<{
    rows: number;
    games: number;
    slate: string | null;
    changed: boolean;
    generatedAt: number;
  }> => {
    const apiKey = process.env.PROPLINE_API_KEY;
    if (!apiKey) {
      throw new Error(
        "PROPLINE_API_KEY is not set. Add it with `bunx convex env set PROPLINE_API_KEY <key>`.",
      );
    }

    const snapshot = (await ctx.runQuery(internal.nba.current)) as BuiltSnapshot | null;
    if (!snapshot) {
      throw new Error("No defense-vs-position snapshot yet; run nbaActions:sync first.");
    }

    const board = await buildHitRateBoard({
      snapshot,
      apiKey,
      onProgress: (message) => console.log(`[hit-rate] ${message}`),
      // Logs only change once a day, so refreshes reuse them.
      loadLogs: async (playerId) =>
        (await ctx.runQuery(internal.hitRates.getLogs, { playerId })) as {
          updatedAt: number;
          logs: GameLog[];
        } | null,
      saveLogs: async (playerId, logs) => {
        await ctx.runMutation(internal.hitRates.saveLogs, { playerId, logs });
      },
    });

    const signature = fingerprint(board.rows);
    const existing = (await ctx.runQuery(internal.hitRates.current, {})) as {
      signature: string | null;
      generatedAt: number;
    } | null;
    const changed: boolean = !existing || existing.signature !== signature;

    const summary = {
      rows: board.rows.length,
      games: board.meta.games,
      slate: board.meta.slateDate,
      changed,
    };

    if (!changed && existing) {
      return { ...summary, generatedAt: existing.generatedAt };
    }

    const generatedAt = Date.now();
    await ctx.runMutation(internal.hitRates.save, {
      key: "current",
      generatedAt,
      signature,
      payload: board,
    });
    return { ...summary, generatedAt };
  },
});
