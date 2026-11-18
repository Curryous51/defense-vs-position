/**
 * Regenerates the checked-in hit-rate fallback at src/data/hit-rate.json.
 *
 * The app refreshes itself from the Convex cron (convex/crons.ts); this script
 * exists so the page can render before the first sync, and so the pipeline can
 * be run and inspected locally.
 *
 * Usage: PROPLINE_API_KEY=... bun scripts/sync-hit-rates.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import raw from "../src/data/dvp.json";
import { buildHitRateBoard } from "../src/convex/hitRateBuilder";
import type { BuiltSnapshot } from "../src/convex/nbaBuilder";

const apiKey = process.env.PROPLINE_API_KEY;
if (!apiKey) {
  console.error("PROPLINE_API_KEY is required");
  process.exit(1);
}

const board = await buildHitRateBoard({
  snapshot: raw as unknown as BuiltSnapshot,
  apiKey,
  onProgress: (message) => console.log(message),
});

const outFile = path.resolve("src/data/hit-rate.json");
await mkdir(path.dirname(outFile), { recursive: true });
await writeFile(outFile, `${JSON.stringify(board, null, 2)}\n`);
console.log(`Wrote ${outFile} (${board.rows.length} rows)`);
