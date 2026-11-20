import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // Defense-vs-position snapshots rebuilt by the daily cron.
    dvpSnapshots: defineTable({
      key: v.string(),
      generatedAt: v.number(),
      payload: v.any(),
    }).index("by_key", ["key"]),

    // Hit-rate board: one row per player/stat prop on the current slate.
    hitRateBoards: defineTable({
      key: v.string(),
      generatedAt: v.number(),
      // Fingerprint of the rows, so a refresh that finds identical lines skips
      // rewriting the (large) payload.
      signature: v.optional(v.string()),
      payload: v.any(),
    }).index("by_key", ["key"]),

    // Per-player game logs, reused across line refreshes so only one pull a
    // day hits ESPN.
    playerGameLogs: defineTable({
      playerId: v.string(),
      updatedAt: v.number(),
      logs: v.any(),
    }).index("by_player", ["playerId"]),

    // add other tables here

    // tableName: defineTable({
    //   ...
    //   // table fields
    // }).index("by_field", ["field"])
  },
  {
    schemaValidation: false,
  },
);

export default schema;
