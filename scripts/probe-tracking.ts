/**
 * Probes NBA.com's tracking API for the two stats the hit-rate board could add
 * as context columns: potential assists (PtMeasureType=Passing) and rebound
 * chances (PtMeasureType=Rebounding).
 *
 * stats.nba.com is gated and unreachable from some networks (it stalls the
 * /stats/ API from a plain server sandbox even when the homepage answers 200),
 * so this runs in GitHub Actions to answer "can our pipeline actually reach it".
 *
 * Usage: bun scripts/probe-tracking.ts
 */
const ENDPOINT = "https://stats.nba.com/stats/leaguedashptstats";

const HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Referer: "https://www.nba.com/",
  Origin: "https://www.nba.com",
  Accept: "application/json",
  "x-nba-stats-origin": "stats",
  "x-nba-stats-token": "true",
};

/** NBA seasons start in October; November 2026 belongs to "2026-27". */
function currentSeason(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const start = now.getUTCMonth() >= 7 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

interface ResultSet {
  headers: string[];
  rowSet: Array<Array<string | number | null>>;
}

async function probe(
  measure: string,
  wanted: string[],
): Promise<{ ok: boolean; detail: string }> {
  const params = new URLSearchParams({
    LeagueID: "00",
    PerMode: "Totals",
    PlayerOrTeam: "Player",
    PtMeasureType: measure,
    Season: currentSeason(),
    SeasonType: "Regular Season",
    LastNGames: "0",
    Month: "0",
    TeamID: "0",
    OpponentTeamID: "0",
  });
  const url = `${ENDPOINT}?${params.toString()}`;
  const started = Date.now();
  try {
    const response = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(45_000),
    });
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    if (!response.ok) {
      return { ok: false, detail: `HTTP ${response.status} after ${seconds}s` };
    }
    const body = (await response.json()) as { resultSets?: ResultSet[] };
    const set = body.resultSets?.[0];
    if (!set) return { ok: false, detail: "response had no resultSets" };

    const found = wanted.filter((field) => set.headers.includes(field));
    const missing = wanted.filter((field) => !set.headers.includes(field));
    const sample = set.rowSet[0];
    const values = found
      .map((field) => {
        const value = sample?.[set.headers.indexOf(field)];
        return `${field}=${value ?? "null"}`;
      })
      .join(" ");

    return {
      ok: missing.length === 0 && set.rowSet.length > 0,
      detail: [
        `HTTP ${response.status} after ${seconds}s`,
        `${set.rowSet.length} rows for ${currentSeason()}`,
        found.length ? `fields ${found.join(", ")}` : "no expected fields",
        missing.length ? `MISSING ${missing.join(", ")}` : "",
        sample ? `sample ${String(sample[1])}: ${values}` : "no rows",
      ]
        .filter(Boolean)
        .join(" · "),
    };
  } catch (error) {
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      detail: `${reason} after ${seconds}s — the host is unreachable from here`,
    };
  }
}

const checks = [
  { measure: "Passing", wanted: ["POTENTIAL_AST", "PASSES_MADE", "AST_POINTS_CREATED"] },
  { measure: "Rebounding", wanted: ["REB_CHANCES", "REB_CHANCE_PCT", "OREB_CHANCES", "DREB_CHANCES"] },
];

let failures = 0;
for (const check of checks) {
  const result = await probe(check.measure, check.wanted);
  console.log(`${result.ok ? "PASS" : "FAIL"} ${check.measure}: ${result.detail}`);
  if (!result.ok) failures += 1;
}

if (failures > 0) {
  console.log(
    "\nIf both checks failed with a timeout, stats.nba.com is blocking this runner; the columns would have to come from another source.",
  );
  process.exit(1);
}
console.log("\nBoth tracking feeds answered — potential assists and rebound chances are available to the pipeline.");
