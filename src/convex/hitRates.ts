import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";

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
