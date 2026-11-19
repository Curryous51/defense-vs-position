import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";

/** Latest hit-rate board, or null before the first sync. */
export const latest = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("hitRateBoards")
      .withIndex("by_key", (q) => q.eq("key", "current"))
      .unique();
  },
});

/** Cached game log for one player, or null when never fetched. */
export const getLogs = internalQuery({
  args: { playerId: v.string() },
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("playerGameLogs")
      .withIndex("by_player", (q) => q.eq("playerId", args.playerId))
      .unique();
    return doc ? { updatedAt: doc.updatedAt, logs: doc.logs } : null;
  },
});

export const saveLogs = internalMutation({
  args: { playerId: v.string(), logs: v.any() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("playerGameLogs")
      .withIndex("by_player", (q) => q.eq("playerId", args.playerId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { logs: args.logs, updatedAt: Date.now() });
      return existing._id;
    }
    return await ctx.db.insert("playerGameLogs", {
      playerId: args.playerId,
      logs: args.logs,
      updatedAt: Date.now(),
    });
  },
});

export const save = internalMutation({
  args: {
    key: v.string(),
    generatedAt: v.number(),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("hitRateBoards")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }
    return await ctx.db.insert("hitRateBoards", args);
  },
});
