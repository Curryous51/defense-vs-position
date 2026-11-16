/**
 * Regenerates the checked-in fallback snapshot at src/data/dvp.json.
 *
 * The running app refreshes itself every morning from the Convex cron
 * (convex/crons.ts); this script only exists so the fallback data can be
 * rebuilt offline.
 *
 * Usage: bun scripts/sync-nba.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildSnapshot } from "../src/convex/nbaBuilder";

const snapshot = await buildSnapshot({
  onProgress: (message) => console.log(message),
});

const outFile = path.resolve("src/data/dvp.json");
await mkdir(path.dirname(outFile), { recursive: true });
await writeFile(outFile, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`Wrote ${outFile}`);
