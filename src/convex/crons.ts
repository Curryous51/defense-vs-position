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

// Lines move during the day, so the hit-rate board refreshes once in the
// morning after the DvP rebuild and again in the early afternoon.
crons.daily(
  "refresh hit rate board",
  { hourUTC: 10, minuteUTC: 50 },
  api.hitRateActions.sync,
);

// Books post their boards through the US morning. Refresh every 30 minutes
// from 12:00 to 23:30 UTC (7am-6:30pm ET); game logs are cached, so a refresh
// only costs one PropLine call plus ESPN's free roster/injury endpoints.
crons.cron(
  "refresh hit rate lines",
  "*/30 12-23 * * *",
  api.hitRateActions.sync,
);

export default crons;
