"use node";

import type { BuiltSnapshot } from "./nbaBuilder";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { buildHitRateBoard, type GameLog } from "./hitRateBuilder";

/**
 * Rebuilds the hit-rate board: today's prop lines joined with each player's
 * game log, plus injuries, depth order and the opponent's DvP rank.
 *
 * Runs on the daily cron and can be triggered by hand with
 * `bunx convex run hitRateActions:sync`.
 */
export const sync = action({
  args: {},
  handler: async (ctx) => {
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

    await ctx.runMutation(internal.hitRates.save, {
      key: "current",
      generatedAt: Date.now(),
      payload: board,
    });
    return { rows: board.rows.length, games: board.meta.games, slate: board.meta.slateDate };
  },
});

