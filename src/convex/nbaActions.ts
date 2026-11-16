"use node";

import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { buildSnapshot } from "./nbaBuilder";

/**
 * Rebuilds the defense-vs-position snapshot from ESPN box scores and stores it.
 * Runs on the daily cron in convex/crons.ts, and can be triggered by hand with
 * `bunx convex run nbaActions:sync`.
 */
export const sync = action({
  args: {},
  handler: async (ctx) => {
    const payload = await buildSnapshot({
      onProgress: (message) => console.log(`[dvp] ${message}`),
    });
    await ctx.runMutation(internal.nba.save, {
      key: "current",
      generatedAt: Date.now(),
      payload,
    });
    return {
      teams: payload.teams.length,
      games: payload.meta.gamesSampled,
      matchups: payload.matchups.length,
    };
  },
});
