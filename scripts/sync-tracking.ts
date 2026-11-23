/**
 * Pulls the two tracking numbers the player profile can't compute from a box
 * score: potential assists and rebound chances.
 *
 * stats.nba.com refuses cloud IPs (Convex, GitHub Actions and this sandbox all
 * time out or 403), but it answers ordinary home connections. So this script
 * runs on your own machine, writes public/tracking.json, and the site reads
 * that file at runtime — no API key, no server, nothing to pay for.
 *
 * Usage: bun scripts/sync-tracking.ts [--force] [--limit=N]
 *
 *   --force    refetch dates that are already in public/tracking.json
 *   --limit=N  only fetch the newest N missing dates (good for a first run)
 *
 * After it finishes: git add public/tracking.json && git commit && git push.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { GameLine, HitRateBoard } from "../src/lib/hit-rate";

const ENDPOINT = "https://stats.nba.com/stats/leaguedashptstats";
const OUT_FILE = path.resolve("public/tracking.json");
const SOURCE_FILE = path.resolve("src/data/hit-rate.json");
const FORCE = process.argv.includes("--force");
const LIMIT = (() => {
  const arg = process.argv.find((value) => value.startsWith("--limit="));
  const parsed = arg ? Number(arg.slice("--limit=".length)) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Infinity;
})();

const HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Referer: "https://www.nba.com/",
  Origin: "https://www.nba.com",
  Accept: "application/json",
  "x-nba-stats-origin": "stats",
  "x-nba-stats-token": "true",
};

/** [potential assists, rebound chances] for one player in one game. */
export type TrackingRow = [number, number];

export interface TrackingFile {
  meta: {
    generatedAt: string;
    season: string;
    dates: string[];
    games: number;
    source: string;
  };
  /** playerId -> game start (ISO, as it appears in the game log) -> numbers. */
  players: Record<string, Record<string, TrackingRow>>;
}

interface ResultSet {
  headers: string[];
  rowSet: Array<Array<string | number | null>>;
}

interface PlayerRow {
  playerId: string;
  teamAbbr: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** NBA schedules games by US Eastern date; our log carries UTC tip-off times. */
function easternDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function nbaDateParam(date: string): string {
  const [year, month, day] = date.split("-");
  return `${month}/${day}/${year}`;
}

function seasonOf(date: string): string {
  const [year, month] = date.split("-").map(Number);
  const start = month >= 8 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** "Nikola Jokić Jr." and "nikola jokic" have to land on the same key. */
function nameKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.'’]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchMeasure(
  measure: "Passing" | "Rebounding",
  date: string,
  season: string,
): Promise<ResultSet> {
  const params = new URLSearchParams({
    LeagueID: "00",
    PerMode: "Totals",
    PlayerOrTeam: "Player",
    PtMeasureType: measure,
    Season: season,
    SeasonType: "Regular Season",
    DateFrom: nbaDateParam(date),
    DateTo: nbaDateParam(date),
    LastNGames: "0",
    Month: "0",
    TeamID: "0",
    OpponentTeamID: "0",
    Period: "0",
    GameScope: "",
    PlayerExperience: "",
    PlayerPosition: "",
    StarterBench: "",
    DraftYear: "",
    DraftPick: "",
    College: "",
    Country: "",
    Height: "",
    Weight: "",
    PORound: "",
    Outcome: "",
    Location: "",
    SeasonSegment: "",
    VsConference: "",
    VsDivision: "",
    GameSegment: "",
    ShotClockRange: "",
  });
  const url = `${ENDPOINT}?${params.toString()}`;

  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: HEADERS,
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${measure} on ${date}`);
      }
      const body = (await response.json()) as { resultSets?: ResultSet[] };
      const set = body.resultSets?.[0];
      if (!set) throw new Error(`no resultSets for ${measure} on ${date}`);
      return set;
    } catch (error) {
      lastError = error;
      if (attempt === 1) await sleep(1_500);
    }
  }
  throw lastError;
}

function column(set: ResultSet, name: string): number {
  return set.headers.indexOf(name);
}

function cell(
  set: ResultSet,
  row: Array<string | number | null>,
  index: number,
): number {
  const value = index >= 0 ? row[index] : null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

const board = JSON.parse(await readFile(SOURCE_FILE, "utf8")) as HitRateBoard;
const history = board.history ?? {};
const season = board.meta.season;

if (!Object.keys(history).length) {
  console.error(
    `${path.relative(process.cwd(), SOURCE_FILE)} has no game logs yet — run the hit-rate refresh first.`,
  );
  process.exit(1);
}

/** name -> candidates, so an ambiguous name can be split by team. */
const byName = new Map<string, PlayerRow[]>();
for (const row of board.rows) {
  const key = nameKey(row.name);
  const list = byName.get(key) ?? [];
  if (!list.some((entry) => entry.playerId === row.playerId)) {
    list.push({ playerId: row.playerId, teamAbbr: row.teamAbbr });
  }
  byName.set(key, list);
}

function matchPlayer(name: string, teamAbbr: string): string | null {
  const candidates = byName.get(nameKey(name));
  if (!candidates?.length) return null;
  if (candidates.length === 1) return candidates[0].playerId;
  const byTeam = candidates.find((entry) => entry.teamAbbr === teamAbbr);
  return byTeam?.playerId ?? null;
}

/** Every logged game in the current season, keyed by its NBA (Eastern) date. */
const gamesByDate = new Map<
  string,
  Array<{ playerId: string; iso: string }>
>();
for (const [playerId, games] of Object.entries(history)) {
  for (const game of games as GameLine[]) {
    const iso = game[0];
    const date = easternDate(iso);
    if (seasonOf(date) !== season) continue;
    const list = gamesByDate.get(date) ?? [];
    list.push({ playerId, iso });
    gamesByDate.set(date, list);
  }
}

let existing: TrackingFile | undefined;
try {
  existing = JSON.parse(await readFile(OUT_FILE, "utf8")) as TrackingFile;
} catch {
  existing = undefined;
}

const done = new Set(FORCE ? [] : (existing?.meta.dates ?? []));
const todo = [...gamesByDate.keys()]
  .filter((date) => !done.has(date))
  .sort()
  .slice(-LIMIT);

if (LIMIT !== Infinity) {
  console.log(`Limiting this run to the newest ${LIMIT} missing date(s).`);
}

const players: Record<string, Record<string, TrackingRow>> = FORCE
  ? {}
  : { ...(existing?.players ?? {}) };
const covered = new Set<string>(FORCE ? [] : (existing?.meta.dates ?? []));
const failed: string[] = [];

if (!todo.length) {
  console.log(
    `All ${gamesByDate.size} dates are already in public/tracking.json — pass --force to refetch.`,
  );
}

let matched = 0;
let expected = 0;

for (const [index, date] of todo.entries()) {
  const games = gamesByDate.get(date) ?? [];
  expected += games.length;
  process.stdout.write(
    `[${index + 1}/${todo.length}] ${date} · ${games.length} games … `,
  );

  try {
    const passing = await fetchMeasure("Passing", date, season);
    await sleep(700);
    const rebounding = await fetchMeasure("Rebounding", date, season);

    const potentialAst = column(passing, "POTENTIAL_AST");
    const rebChances = column(rebounding, "REB_CHANCES");
    const nameIndex = column(passing, "PLAYER_NAME");
    const teamIndex = column(passing, "TEAM_ABBREVIATION");

    const values = new Map<string, TrackingRow>();
    for (const row of passing.rowSet) {
      const playerId = matchPlayer(
        String(row[nameIndex] ?? ""),
        String(row[teamIndex] ?? ""),
      );
      if (!playerId) continue;
      values.set(playerId, [cell(passing, row, potentialAst), 0]);
    }
    for (const row of rebounding.rowSet) {
      const playerId = matchPlayer(
        String(row[nameIndex] ?? ""),
        String(row[teamIndex] ?? ""),
      );
      if (!playerId) continue;
      const entry = values.get(playerId) ?? [0, 0];
      entry[1] = cell(rebounding, row, rebChances);
      values.set(playerId, entry);
    }

    let hits = 0;
    for (const game of games) {
      const numbers = values.get(game.playerId);
      if (!numbers) continue;
      const bucket = (players[game.playerId] ??= {});
      bucket[game.iso] = numbers;
      hits += 1;
    }
    matched += hits;
    covered.add(date);
    console.log(`ok · ${hits}/${games.length} matched`);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    failed.push(date);
    console.log(`failed · ${reason}`);
    if (/403|Access Denied/i.test(reason)) {
      console.log(
        "\nstats.nba.com refused this network (403). It needs an ordinary home connection —\nturn off any VPN and try again from your laptop or desktop.",
      );
      break;
    }
  }
  await sleep(700);
}

const output: TrackingFile = {
  meta: {
    generatedAt: new Date().toISOString(),
    season,
    dates: [...covered].sort(),
    games: Object.values(players).reduce(
      (total, bucket) => total + Object.keys(bucket).length,
      0,
    ),
    source: "stats.nba.com leaguedashptstats (Passing, Rebounding)",
  },
  players,
};

await mkdir(path.dirname(OUT_FILE), { recursive: true });
await writeFile(OUT_FILE, `${JSON.stringify(output)}\n`);

const size = (JSON.stringify(output).length / 1024).toFixed(0);
console.log(
  `\nWrote public/tracking.json · ${Object.keys(players).length} players · ${output.meta.games} game rows · ${size} KB`,
);
if (expected) console.log(`Matched ${matched}/${expected} games this run.`);

if (failed.length) {
  console.log(
    `\n${failed.length} date(s) failed: ${failed.join(", ")}. Run the script again to retry just those.`,
  );
  process.exit(1);
}

console.log(
  "\nNext: git add public/tracking.json && git commit -m \"Add tracking stats\" && git push",
);
