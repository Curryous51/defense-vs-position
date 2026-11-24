/**
 * Hit-rate builder: pairs tonight's prop lines with each player's game log.
 *
 * Sources:
 *  - PropLine (key required): consensus over/under lines for points, rebounds,
 *    assists and threes on tonight's slate. One bulk call covers every game.
 *  - ESPN public API: team rosters, per-player game logs, injury report.
 *  - nbadepthcharts.com and ESPN's club depth charts: the lineups teams have
 *    actually been running, in PG/SG/SF/PF/C order.
 *  - Sleeper player list: PG/SG/SF/PF/C eligibility (ESPN only exposes G/F/C).
 *
 * A player's position follows his recent lineup slot first, with ESPN's coarse
 * G/F/C role deciding between the multi-position slots a chart lists for him;
 * stale season-long listings are only the last resort.
 *
 * L5 and L10 are over-rates against today's line; H2H is the same against the
 * opponent this player faces tonight. Pushes are dropped from the denominator.
 */
import type {
  GameLine,
  HitRateBoard,
  HitRateContext,
  HitRateRow,
} from "../lib/hit-rate";
import type { BuiltSnapshot, Position, StatKey } from "./nbaBuilder";

const ESPN = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
const ESPN_WEB =
  "https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba";
const ESPN_CORE =
  "https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba";
const PROPS = "https://api.prop-line.com/v1/sports/basketball_nba/odds";
const DEPTH_URL = "https://www.nbadepthcharts.com/";

const POSITIONS: Position[] = ["PG", "SG", "SF", "PF", "C"];
const MARKET_STAT: Record<string, StatKey> = {
  player_points: "pts",
  player_rebounds: "reb",
  player_assists: "ast",
  player_threes: "tpm",
};
/** Four major books keeps the response small; the line is a consensus anyway. */
const BOOKS = "draftkings,fanduel,betmgm,caesars,espnbet,fanatics";

async function getJson<T>(url: string, attempts = 3): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          accept: "application/json",
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        },
      });
      if (!res.ok) throw new Error(`${res.status} ${url.split("?")[0]}`);
      return (await res.json()) as T;
    } catch (err) {
      if (i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw new Error(`unreachable: ${url}`);
}

async function getText(url: string, attempts = 3): Promise<string> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          accept: "text/html",
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        },
      });
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return await res.text();
    } catch (err) {
      if (i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw new Error(`unreachable: ${url}`);
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      out[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return out;
}

const normalizeName = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/[^a-z]/g, "");

const num = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const cleaned = value.trim();
  if (!cleaned || cleaned === "-" || cleaned === "--") return 0;
  if (cleaned.includes("-")) return num(cleaned.split("-")[0]);
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

const EASTERN = "America/New_York";
const EASTERN_DAY = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: EASTERN,
});

function easternDay(iso: string): string {
  return EASTERN_DAY.format(new Date(iso));
}

interface PropOutcome {
  name?: string;
  description?: string;
  price?: number;
  point?: number | null;
  player_team?: string | null;
}

interface PropMarket {
  key?: string;
  outcomes?: PropOutcome[];
}

interface PropBook {
  key?: string;
  markets?: PropMarket[];
}

interface PropEvent {
  id?: string;
  home_team?: string;
  away_team?: string;
  commence_time?: string;
  bookmakers?: PropBook[];
}

interface PropLine {
  name: string;
  teamName: string | null;
  stat: StatKey;
  line: number;
  overPrice: number;
  underPrice: number;
  books: number;
  gameId: string;
  tipoff: string;
  homeId: string;
  awayId: string;
}

interface RosterPlayer {
  id: string;
  name: string;
  teamId: string;
  coarse: string;
}

export interface GameLog {
  date: string;
  season: number;
  opponentId: string;
  /** Absent on logs cached before the profile page needed box scores. */
  opponentAbbr?: string;
  home?: boolean;
  minutes: number;
  pts: number;
  reb: number;
  ast: number;
  tpm: number;
  fgm?: number;
  fga?: number;
  tpa?: number;
  ftm?: number;
  fta?: number;
  score?: string | null;
}

/** How many seasons the head-to-head sample reaches back, including this one. */
const H2H_SEASONS = 3;

interface DepthEntry {
  positions: Position[];
  depth: number;
}

/**
 * The depth page renders every team as a `team-card` with four columns of
 * rows. Column order is Starters, 2nd string, 3rd string, Other.
 */
function parseDepthCharts(html: string): Map<string, Map<string, DepthEntry>> {
  const byTeam = new Map<string, Map<string, DepthEntry>>();
  const chunks = html.split('<div class="team-card"');
  const group =
    /<td class="dc-pos">([^<]*)<\/td><td class="dc-pgroup-name[^"]*">([\s\S]*?)<\/td><td class="dc-pgroup-mpg">([^<]*)<\/td><td class="dc-pgroup-gp">([^<]*)<\/td>/g;

  for (const chunk of chunks.slice(1)) {
    const teamName = chunk
      .match(/<span class="th-name">([\s\S]*?)<\/span>/)?.[1]
      ?.replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!teamName) continue;
    const players = new Map<string, DepthEntry>();
    for (const row of chunk.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
      let column = 0;
      for (const match of row[1].matchAll(group)) {
        const name = match[2].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
        const positions = match[1]
          .split("/")
          .map((p) => p.trim().toUpperCase())
          .filter((p): p is Position => POSITIONS.includes(p as Position));
        if (name && name !== "--") {
          const key = normalizeName(name);
          const existing = players.get(key);
          if (!existing || column < existing.depth) {
            players.set(key, { positions, depth: column });
          }
        }
        column += 1;
      }
    }
    byTeam.set(normalizeName(teamName), players);
  }
  return byTeam;
}

/**
 * ESPN's club depth chart for one team: a ranked list of athletes under each
 * PG/SG/SF/PF/C slot, which tracks the lineups that team has been using.
 */
async function fetchDepthChart(
  teamId: string,
  seasonYear: number,
): Promise<Map<string, Array<{ position: Position; rank: number }>>> {
  const json = await getJson<{
    items?: Array<{
      positions?: Record<
        string,
        {
          position?: { abbreviation?: string };
          athletes?: Array<{ athlete?: { $ref?: string }; rank?: number }>;
        }
      >;
    }>;
  }>(`${ESPN_CORE}/seasons/${seasonYear}/teams/${teamId}/depthcharts`, 2);

  const byAthlete = new Map<string, Array<{ position: Position; rank: number }>>();
  for (const slot of Object.values(json.items?.[0]?.positions ?? {})) {
    const label = (slot.position?.abbreviation ?? "").toUpperCase();
    if (!(POSITIONS as string[]).includes(label)) continue;
    for (const entry of slot.athletes ?? []) {
      const id = entry.athlete?.$ref?.match(/\/athletes\/(\d+)/)?.[1];
      if (!id) continue;
      const list = byAthlete.get(id) ?? [];
      list.push({ position: label as Position, rank: entry.rank ?? 99 });
      byAthlete.set(id, list);
    }
  }
  return byAthlete;
}

/**
 * Whether a specific slot fits ESPN's coarse role for the player. Rosters use
 * G/F/C, sometimes with a second role ("F-C"), so any listed role may match.
 */
function fitsRole(position: Position, coarse: string): boolean {
  return coarse
    .toUpperCase()
    .split("-")
    .some((role) =>
      role === "G"
        ? position === "PG" || position === "SG"
        : role === "F"
          ? position === "SF" || position === "PF"
          : role === "C"
            ? position === "C"
            : false,
    );
}

/** First candidate that fits the player's coarse role, else the first one. */
function pickSlot(slots: Position[], coarse: string): Position | undefined {
  return slots.find((slot) => fitsRole(slot, coarse)) ?? slots[0];
}

interface EspnRoster {
  athletes?: Array<{
    id?: string;
    displayName?: string;
    position?: { abbreviation?: string };
    items?: Array<{
      id?: string;
      displayName?: string;
      position?: { abbreviation?: string };
    }>;
  }>;
}

interface EspnGamelog {
  names?: string[];
  events?: Record<
    string,
    {
      gameDate?: string;
      opponent?: { id?: string; abbreviation?: string };
      /** "vs" at home, "@" on the road. */
      atVs?: string;
      score?: string;
    }
  >;
  seasonTypes?: Array<{
    displayName?: string;
    categories?: Array<{
      events?: Array<{ eventId?: string; stats?: string[] }>;
    }>;
  }>;
}

interface EspnInjuries {
  injuries?: Array<{
    team?: { id?: string };
    injuries?: Array<{
      id?: string;
      status?: string;
      athlete?: {
        id?: string;
        headshot?: { href?: string };
        links?: Array<{ href?: string }>;
      };
    }>;
  }>;
}

function parseGamelog(json: EspnGamelog, season: number): GameLog[] {
  const names = json.names ?? [];
  const index = (key: string) => names.indexOf(key);
  const iPts = index("points");
  const iReb = index("totalRebounds");
  const iAst = index("assists");
  const iTpm = index("threePointFieldGoalsMade-threePointFieldGoalsAttempted");
  const iFg = index("fieldGoalsMade-fieldGoalsAttempted");
  const iFt = index("freeThrowsMade-freeThrowsAttempted");
  const iMin = index("minutes");
  /** ESPN packs makes and attempts as "4-5". */
  const split = (value: string | undefined): [number, number] => {
    const [made, attempted] = String(value ?? "0-0").split("-");
    return [num(made), num(attempted)];
  };

  const seen = new Set<string>();
  const logs: GameLog[] = [];
  for (const type of json.seasonTypes ?? []) {
    if (!type.displayName?.includes("Regular Season")) continue;
    for (const category of type.categories ?? []) {
      for (const entry of category.events ?? []) {
        const id = entry.eventId;
        if (!id || seen.has(id) || !entry.stats) continue;
        seen.add(id);
        const meta = json.events?.[id];
        if (!meta?.gameDate || !meta.opponent?.id) continue;
        const minutes = iMin >= 0 ? num(entry.stats[iMin]) : 0;
        if (minutes <= 0) continue;
        const threes = split(iTpm >= 0 ? entry.stats[iTpm] : undefined);
        const field = split(iFg >= 0 ? entry.stats[iFg] : undefined);
        const free = split(iFt >= 0 ? entry.stats[iFt] : undefined);
        logs.push({
          date: meta.gameDate,
          season,
          opponentId: String(meta.opponent.id),
          opponentAbbr: meta.opponent.abbreviation,
          home: meta.atVs !== "@",
          minutes,
          pts: iPts >= 0 ? num(entry.stats[iPts]) : 0,
          reb: iReb >= 0 ? num(entry.stats[iReb]) : 0,
          ast: iAst >= 0 ? num(entry.stats[iAst]) : 0,
          tpm: threes[0],
          fgm: field[0],
          fga: field[1],
          tpa: threes[1],
          ftm: free[0],
          fta: free[1],
          score: meta.score ?? null,
        });
      }
    }
  }
  return logs;
}

function summarize(outcomes: Array<boolean | null>): { hits: number; n: number } {
  let hits = 0;
  let n = 0;
  for (const outcome of outcomes) {
    if (outcome === null) continue;
    n += 1;
    if (outcome) hits += 1;
  }
  return { hits, n };
}

/**
 * Collapses every book into one line per player/stat: the point the most books
 * quote, with the best available price on each side at that number.
 */
function consensusLines(
  events: PropEvent[],
  teamIdByName: Map<string, string>,
): PropLine[] {
  interface Bucket {
    over: number[];
    under: number[];
    books: Set<string>;
  }
  const grouped = new Map<
    string,
    {
      name: string;
      teamName: string | null;
      stat: StatKey;
      event: PropEvent;
      homeId: string;
      awayId: string;
      points: Map<number, Bucket>;
    }
  >();

  for (const event of events) {
    const homeId = teamIdByName.get(normalizeName(event.home_team ?? ""));
    const awayId = teamIdByName.get(normalizeName(event.away_team ?? ""));
    if (!homeId || !awayId || !event.id || !event.commence_time) continue;

    for (const book of event.bookmakers ?? []) {
      const bookKey = book.key ?? "book";
      for (const market of book.markets ?? []) {
        const stat = MARKET_STAT[market.key ?? ""];
        if (!stat) continue;

        // One book, one market row per player: gather its point and prices.
        const perPlayer = new Map<string, { name: string; team: string | null; over: number[]; under: number[] }>();
        for (const outcome of market.outcomes ?? []) {
          const name = outcome.description?.trim();
          const point = outcome.point;
          const price = outcome.price;
          if (!name || typeof point !== "number" || typeof price !== "number") continue;
          const entry =
            perPlayer.get(`${normalizeName(name)}|${point}`) ?? {
              name,
              team: outcome.player_team ?? null,
              over: [],
              under: [],
            };
          if (outcome.name === "Over") entry.over.push(price);
          if (outcome.name === "Under") entry.under.push(price);
          perPlayer.set(`${normalizeName(name)}|${point}`, entry);
        }

        for (const [key, entry] of perPlayer) {
          const point = Number(key.split("|")[1]);
          const groupKey = `${normalizeName(entry.name)}|${stat}`;
          const row = grouped.get(groupKey) ?? {
            name: entry.name,
            teamName: entry.team,
            stat,
            event,
            homeId,
            awayId,
            points: new Map<number, Bucket>(),
          };
          const bucket = row.points.get(point) ?? { over: [], under: [], books: new Set<string>() };
          bucket.over.push(...entry.over);
          bucket.under.push(...entry.under);
          bucket.books.add(bookKey);
          row.points.set(point, bucket);
          grouped.set(groupKey, row);
        }
      }
    }
  }

  const lines: PropLine[] = [];
  for (const row of grouped.values()) {
    const chosen = [...row.points.entries()].sort(
      (a, b) =>
        b[1].books.size - a[1].books.size ||
        b[1].over.length - a[1].over.length ||
        b[0] - a[0],
    )[0];
    if (!chosen) continue;
    const [line, bucket] = chosen;
    lines.push({
      name: row.name,
      teamName: row.teamName,
      stat: row.stat,
      line,
      overPrice: bucket.over.length ? Math.max(...bucket.over) : 0,
      underPrice: bucket.under.length ? Math.max(...bucket.under) : 0,
      books: bucket.books.size,
      gameId: row.event.id ?? "",
      tipoff: row.event.commence_time ?? "",
      homeId: row.homeId,
      awayId: row.awayId,
    });
  }
  return lines;
}

/**
 * The profile page's game log: this season's recent games plus every game
 * against the opponent, packed as tuples.
 *
 * Shared by the snapshot builder (the backend-free build ships the log inside
 * the board) and by the per-player query the live app uses, so the Convex board
 * document stays small.
 */
export function packPlayerGames(
  logs: GameLog[],
  options: { opponentId: string; currentSeason?: number; before?: number },
): GameLine[] {
  const tipoff = options.before ?? Number.POSITIVE_INFINITY;
  const played = logs
    .filter((entry) => new Date(entry.date).getTime() < tipoff)
    .sort((a, b) => b.date.localeCompare(a.date));
  const recent = played
    .filter((entry) => entry.season === options.currentSeason)
    .slice(0, 12);
  const vsOpponent = played
    .filter((entry) => entry.opponentId === options.opponentId)
    .slice(0, 8);

  return [...recent, ...vsOpponent]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 18)
    .map((entry): GameLine => [
      entry.date,
      entry.opponentId,
      entry.opponentAbbr ?? "—",
      entry.home === false ? 0 : 1,
      entry.minutes,
      entry.pts,
      entry.reb,
      entry.ast,
      entry.tpm,
      entry.fgm ?? 0,
      entry.fga ?? 0,
      entry.tpa ?? 0,
      entry.ftm ?? 0,
      entry.fta ?? 0,
      entry.score ?? "",
    ]);
}

/** Every player on the slate, packed for the backend-free build. */
function packHistory(
  rows: HitRateRow[],
  logsByPlayer: Map<string, GameLog[]>,
  currentSeason: number,
): Record<string, GameLine[]> {
  const history: Record<string, GameLine[]> = {};
  for (const row of rows) {
    if (history[row.playerId]) continue;
    history[row.playerId] = packPlayerGames(logsByPlayer.get(row.playerId) ?? [], {
      opponentId: row.opponentId,
      currentSeason,
      before: new Date(row.tipoff).getTime(),
    });
  }
  return history;
}

/** Whole-league DvP ranks and averages, so any opponent on a profile is graded. */
function packContext(snapshot: BuiltSnapshot): HitRateContext {
  const ranks: HitRateContext["ranks"] = {};
  const allowed: HitRateContext["allowed"] = {};
  for (const team of snapshot.teams) {
    ranks[team.id] = {} as HitRateContext["ranks"][string];
    allowed[team.id] = {} as HitRateContext["allowed"][string];
    for (const position of POSITIONS) {
      const season = team.season[position];
      if (!season) continue;
      ranks[team.id][position] = { ...season.ranks };
      allowed[team.id][position] = {
        pts: season.pts,
        reb: season.reb,
        ast: season.ast,
        tpm: season.tpm,
      };
    }
  }
  return { ranks, allowed };
}

export interface BuildHitRateOptions {
  snapshot: BuiltSnapshot;
  apiKey: string;
  now?: number;
  onProgress?: (message: string) => void;
  /** Cached logs, so a line refresh does not re-pull every player's history. */
  loadLogs?: (
    playerId: string,
  ) => Promise<{ updatedAt: number; logs: GameLog[] } | null>;
  saveLogs?: (playerId: string, logs: GameLog[]) => Promise<void>;
  /** How long a cached history stays fresh (default 20 hours). */
  logTtlMs?: number;
}

export async function buildHitRateBoard(
  options: BuildHitRateOptions,
): Promise<HitRateBoard> {
  const { snapshot, apiKey } = options;
  const now = options.now ?? Date.now();
  const log = options.onProgress ?? (() => {});

  const upcoming = snapshot.matchups
    .filter((game) => new Date(game.date).getTime() > now)
    .sort((a, b) => a.date.localeCompare(b.date));
  const slateKey = upcoming[0] ? easternDay(upcoming[0].date) : null;
  const games = slateKey
    ? upcoming.filter((game) => easternDay(game.date) === slateKey)
    : [];
  if (!games.length) {
    return {
      meta: {
        generatedAt: new Date().toISOString(),
        season: snapshot.meta.season,
        slateDate: null,
        games: 0,
        props: 0,
        source: "PropLine · ESPN",
        throughDate: snapshot.meta.throughDate,
      },
      rows: [],
    };
  }

  const teamById = new Map(snapshot.teams.map((team) => [team.id, team]));
  const teamIdByName = new Map(
    snapshot.teams.map((team) => [normalizeName(team.name), team.id]),
  );
  const slateTeamIds = new Set(games.flatMap((game) => [game.home, game.away]));
  const seasonEnd = snapshot.meta.season.split("-")[1] ?? "27";
  const currentSeason = 2000 + Number(seasonEnd.slice(-2));

  log(`Slate: ${games.length} games, ${slateTeamIds.size} teams`);

  log("Fetching prop lines (PropLine)");
  const propsUrl = `${PROPS}?markets=player_points,player_rebounds,player_assists,player_threes&bookmakers=${BOOKS}&apiKey=${apiKey}`;
  const propEvents = await getJson<PropEvent[] | { data?: PropEvent[] }>(propsUrl);
  const events = Array.isArray(propEvents) ? propEvents : propEvents.data ?? [];
  const slateEvents = events.filter((event) => {
    const home = teamIdByName.get(normalizeName(event.home_team ?? ""));
    const away = teamIdByName.get(normalizeName(event.away_team ?? ""));
    // A game leaves the board at tip-off, so a refresh never resurrects one.
    if (!event.commence_time) return false;
    if (new Date(event.commence_time).getTime() <= now) return false;
    return Boolean(home && away && slateTeamIds.has(home) && slateTeamIds.has(away));
  });
  log(`PropLine: ${events.length} events, ${slateEvents.length} on this slate`);

  const lines = consensusLines(slateEvents, teamIdByName);
  log(`Consensus lines: ${lines.length} player/stat props`);

  log("Fetching rosters and depth charts");
  const rosterEntries = await mapLimit([...slateTeamIds], 6, async (teamId) => {
    try {
      const json = await getJson<EspnRoster>(`${ESPN}/teams/${teamId}/roster`);
      const players: RosterPlayer[] = [];
      for (const entry of json.athletes ?? []) {
        const list = entry.items ?? [entry];
        for (const athlete of list) {
          if (!athlete.id || !athlete.displayName) continue;
          players.push({
            id: String(athlete.id),
            name: athlete.displayName,
            teamId,
            coarse: athlete.position?.abbreviation ?? "",
          });
        }
      }
      return players;
    } catch (err) {
      log(`roster failed for ${teamId}: ${(err as Error).message}`);
      return [];
    }
  });
  const roster = new Map(rosterEntries.flat().map((player) => [player.id, player]));

  let depth: Map<string, Map<string, DepthEntry>> = new Map();
  try {
    depth = parseDepthCharts(await getText(DEPTH_URL));
    log(`Depth charts: ${depth.size} teams`);
  } catch (err) {
    log(`depth charts failed: ${(err as Error).message}`);
  }

  // ESPN's own depth charts carry the same PG/SG/SF/PF/C slots, so a player
  // missing from one list still gets a lineup-based position from the other.
  const espnDepth = new Map<
    string,
    Map<string, Array<{ position: Position; rank: number }>>
  >();
  await mapLimit([...slateTeamIds], 6, async (teamId) => {
    try {
      espnDepth.set(teamId, await fetchDepthChart(teamId, currentSeason));
    } catch (err) {
      log(`ESPN depth chart failed for ${teamId}: ${(err as Error).message}`);
    }
  });
  log(`ESPN depth charts: ${espnDepth.size} teams`);

  let eligibilityByName = new Map<string, string[]>();
  try {
    const sleeper = await getJson<
      Record<string, { full_name?: string; fantasy_positions?: string[] }>
    >("https://api.sleeper.app/v1/players/nba");
    eligibilityByName = new Map(
      Object.values(sleeper)
        .filter((player) => player?.full_name)
        .map((player) => [
          normalizeName(player.full_name!),
          (player.fantasy_positions ?? []).filter((p) =>
            POSITIONS.includes(p as Position),
          ),
        ])
        .filter(([, positions]) => positions.length > 0) as Array<
        [string, string[]]
      >,
    );
  } catch (err) {
    log(`Sleeper positions failed: ${(err as Error).message}`);
  }

  const injuries = new Map<string, string>();
  try {
    const json = await getJson<EspnInjuries>(`${ESPN}/injuries`);
    for (const group of json.injuries ?? []) {
      for (const entry of group.injuries ?? []) {
        // The entry `id` is the injury record; the athlete id only appears in
        // the headshot/player-card URLs.
        const athlete = entry.athlete;
        const id =
          athlete?.id ??
          athlete?.headshot?.href?.match(/\/id\/(\d+)\./)?.[1] ??
          athlete?.links?.find((link) => link.href?.includes("/id/"))?.href?.match(/\/id\/(\d+)/)?.[1];
        if (id && entry.status) injuries.set(String(id), entry.status);
      }
    }
    log(`Injuries: ${injuries.size} players`);
  } catch (err) {
    log(`injuries failed: ${(err as Error).message}`);
  }

  // Match each prop to an ESPN athlete id.
  const rosterByName = new Map<string, RosterPlayer[]>();
  for (const player of roster.values()) {
    const key = normalizeName(player.name);
    rosterByName.set(key, [...(rosterByName.get(key) ?? []), player]);
  }

  const matched: Array<{
    line: PropLine;
    player: RosterPlayer;
    teamId: string;
    opponentId: string;
  }> = [];
  let unmatched = 0;
  for (const line of lines) {
    const key = normalizeName(line.name);
    const candidates = rosterByName.get(key) ?? [];
    const teamName = line.teamName ? teamIdByName.get(normalizeName(line.teamName)) : null;
    const player =
      candidates.find((candidate) => candidate.teamId === teamName) ?? candidates[0];
    if (!player) {
      unmatched += 1;
      continue;
    }
    const teamId = player.teamId;
    const opponentId = line.homeId === teamId ? line.awayId : line.homeId;
    if (!slateTeamIds.has(teamId) || !teamById.has(opponentId)) continue;
    matched.push({ line, player, teamId, opponentId });
  }
  log(`Matched ${matched.length} props to ESPN players (${unmatched} unmatched)`);

  const playerIds = [...new Set(matched.map((row) => row.player.id))];
  const seasons = Array.from(
    { length: H2H_SEASONS },
    (_, index) => currentSeason - index,
  );
  log(
    `Fetching ${playerIds.length} game logs across ${seasons.join(", ")}`,
  );

  const ttl = options.logTtlMs ?? 20 * 60 * 60 * 1000;
  let fetched = 0;
  let reused = 0;
  const logsByPlayer = new Map<string, GameLog[]>();
  await mapLimit(playerIds, 6, async (playerId) => {
    const cached = options.loadLogs ? await options.loadLogs(playerId) : null;
    if (
      cached &&
      now - cached.updatedAt < ttl &&
      Array.isArray(cached.logs) &&
      cached.logs.length > 0
    ) {
      logsByPlayer.set(playerId, cached.logs as GameLog[]);
      reused += 1;
      return;
    }

    const logs: GameLog[] = [];
    for (const season of seasons) {
      try {
        const json = await getJson<EspnGamelog>(
          `${ESPN_WEB}/athletes/${playerId}/gamelog?season=${season}`,
        );
        logs.push(...parseGamelog(json, season));
      } catch {
        // Older seasons are optional; a miss just shortens the H2H sample.
      }
    }
    logsByPlayer.set(playerId, logs);
    if (options.saveLogs) await options.saveLogs(playerId, logs);
    fetched += 1;
    if (fetched % 50 === 0) log(`Game logs: ${fetched} fetched, ${reused} cached`);
  });
  log(`Game logs: ${fetched} fetched, ${reused} reused from cache`);

  const rows: HitRateRow[] = [];
  for (const { line, player, teamId, opponentId } of matched) {
    const history = (logsByPlayer.get(player.id) ?? [])
      .filter((entry) => new Date(entry.date).getTime() < new Date(line.tipoff).getTime())
      .sort((a, b) => b.date.localeCompare(a.date));
    // Recent form is this season only; H2H reaches back through the archive.
    const logs = history.filter((entry) => entry.season === currentSeason);
    if (logs.length < 3) continue;
    const minutes = logs.reduce((sum, entry) => sum + entry.minutes, 0) / logs.length;
    if (minutes < 8) continue;

    const team = teamById.get(teamId);
    const opponent = teamById.get(opponentId);
    if (!team || !opponent) continue;

    const depthEntry = depth.get(normalizeName(team.name))?.get(normalizeName(player.name));
    const eligibility = eligibilityByName.get(normalizeName(player.name)) ?? [];
    // Recent lineups first: the chart slot a team has been using for this
    // player, narrowed to the slots that match his coarse G/F/C role, then the
    // season-long eligibility lists as a fallback.
    const chartSlots = (espnDepth.get(teamId)?.get(player.id) ?? [])
      .sort((a, b) => a.rank - b.rank)
      .map((entry) => entry.position);
    const position =
      pickSlot(depthEntry?.positions ?? [], player.coarse) ??
      pickSlot(chartSlots, player.coarse) ??
      pickSlot(
        eligibility.filter((slot): slot is Position =>
          POSITIONS.includes(slot as Position),
        ),
        player.coarse,
      ) ??
      (player.coarse === "C" ? "C" : player.coarse === "G" ? "SG" : "SF");

    const rank = opponent.season[position]?.ranks?.[line.stat];
    if (typeof rank !== "number") continue;

    const outcomeFor = (value: number): boolean | null =>
      value > line.line ? true : value === line.line ? null : false;
    const outcomes = logs.map((entry) => outcomeFor(entry[line.stat]));
    const againstOpponent = history
      .filter((entry) => entry.opponentId === opponentId)
      .map((entry) => outcomeFor(entry[line.stat]));

    rows.push({
      playerId: player.id,
      name: player.name,
      teamId,
      teamAbbr: team.abbr,
      opponentId,
      opponentAbbr: opponent.abbr,
      position,
      stat: line.stat,
      line: line.line,
      overPrice: line.overPrice,
      gameId: line.gameId,
      tipoff: line.tipoff,
      l5: summarize(outcomes.slice(0, 5)),
      l10: summarize(outcomes.slice(0, 10)),
      h2h: summarize(againstOpponent),
      rank,
      injuryStatus: injuries.get(player.id) ?? null,
    });
  }

  const rate = (sample: { hits: number; n: number }) =>
    sample.n ? sample.hits / sample.n : -1;
  rows.sort(
    (a, b) =>
      rate(b.l10) - rate(a.l10) ||
      rate(b.l5) - rate(a.l5) ||
      b.l10.n - a.l10.n ||
      a.name.localeCompare(b.name),
  );

  log(`Built ${rows.length} rows`);

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      season: snapshot.meta.season,
      slateDate: slateKey,
      games: games.length,
      props: rows.length,
      source: "PropLine · ESPN",
      throughDate: snapshot.meta.throughDate,
    },
    rows,
    history: packHistory(rows, logsByPlayer, currentSeason),
    context: packContext(snapshot),
  };
}
