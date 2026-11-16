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

export default crons;
