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

// Books post their boards through the US morning. Refresh hourly from 12:00 to
// 23:00 UTC (7am-7pm ET). An unchanged board is not rewritten, so this costs
// one PropLine call and one cached-log read per hour. Use the Refresh lines
// button when a line has just moved.
crons.cron(
  "refresh hit rate lines",
  "0 12-23 * * *",
  api.hitRateActions.sync,
);

export default crons;
