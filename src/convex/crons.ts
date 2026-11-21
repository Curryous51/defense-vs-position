import { cronJobs } from "convex/server";
import { api } from "./_generated/api";

const crons = cronJobs();

// Rebuild after every NBA slate has finished: 10:20 UTC is 5:20am ET, which is
// after even the West Coast games. The app also hides finished games on the
// client, so the board is correct between syncs.
crons.daily(
  "refresh defense vs position",
  { hourUTC: 10, minuteUTC: 20 },
  api.nbaActions.sync,
);

// Twice a day is enough: 05:30 UTC (11:00 IST) after the US books have posted,
// and 14:30 UTC (20:00 IST) for late line movement. Each run reads the cached
// game logs for the slate, which is the largest cost on the free tier, so keep
// this at two. The Refresh lines button covers anything in between.
crons.cron(
  "refresh hit rate board",
  "30 5,14 * * *",
  api.hitRateActions.sync,
);

export default crons;
