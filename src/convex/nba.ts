import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";

/** Latest stored defense-vs-position snapshot, or null before the first sync. */
export const latest = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("dvpSnapshots")
      .withIndex("by_key", (q) => q.eq("key", "current"))
      .unique();
  },
});

/** Server-side read of the snapshot, for the hit-rate builder. */
export const current = internalQuery({
  args: {},
  handler: async (ctx) => {
    const stored = await ctx.db
      .query("dvpSnapshots")
      .withIndex("by_key", (q) => q.eq("key", "current"))
      .unique();
    return stored?.payload ?? null;
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
      .query("dvpSnapshots")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }
    return await ctx.db.insert("dvpSnapshots", args);
  },
});
