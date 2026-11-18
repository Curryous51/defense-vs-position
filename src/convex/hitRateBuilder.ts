/**
 * Hit-rate builder: pairs tonight's prop lines with each player's game log.
 *
 * Sources:
 *  - PropLine (key required): consensus over/under lines for points, rebounds,
 *    assists and threes on tonight's slate. One bulk call covers every game.
 *  - ESPN public API: team rosters, per-player game logs, injury report.
 *  - nbadepthcharts.com: starter/2nd/3rd-string order for the whole league.
 *  - Sleeper player list: PG/SG/SF/PF/C eligibility (ESPN only exposes G/F/C).
 *
 * L5 and L10 are over-rates against today's line; H2H is the same against the
 * opponent this player faces tonight. Pushes are dropped from the denominator.
 */
import type { HitRateBoard, HitRateRow } from "../lib/hit-rate";
import type { BuiltSnapshot, Position, StatKey } from "./nbaBuilder";

const ESPN = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
const ESPN_WEB =
  "https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba";
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

interface GameLog {
  date: string;
  opponentId: string;
  minutes: number;
  pts: number;
  reb: number;
  ast: number;
  tpm: number;
}

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
    { gameDate?: string; opponent?: { id?: string } }
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

function parseGamelog(json: EspnGamelog): GameLog[] {
  const names = json.names ?? [];
  const index = (key: string) => names.indexOf(key);
  const iPts = index("points");
  const iReb = index("totalRebounds");
  const iAst = index("assists");
  const iTpm = index("threePointFieldGoalsMade-threePointFieldGoalsAttempted");
  const iMin = index("minutes");

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
        logs.push({
          date: meta.gameDate,
          opponentId: String(meta.opponent.id),
          minutes,
          pts: iPts >= 0 ? num(entry.stats[iPts]) : 0,
          reb: iReb >= 0 ? num(entry.stats[iReb]) : 0,
          ast: iAst >= 0 ? num(entry.stats[iAst]) : 0,
          tpm: iTpm >= 0 ? num(entry.stats[iTpm]) : 0,
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

export interface BuildHitRateOptions {
  snapshot: BuiltSnapshot;
  apiKey: string;
  now?: number;
  onProgress?: (message: string) => void;
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

  log(`Slate: ${games.length} games, ${slateTeamIds.size} teams`);

  log("Fetching prop lines (PropLine)");
  const propsUrl = `${PROPS}?markets=player_points,player_rebounds,player_assists,player_threes&bookmakers=${BOOKS}&apiKey=${apiKey}`;
  const propEvents = await getJson<PropEvent[] | { data?: PropEvent[] }>(propsUrl);
  const events = Array.isArray(propEvents) ? propEvents : propEvents.data ?? [];
  const slateEvents = events.filter((event) => {
    const home = teamIdByName.get(normalizeName(event.home_team ?? ""));
    const away = teamIdByName.get(normalizeName(event.away_team ?? ""));
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

  const starters = new Set(
    Object.values(snapshot.lineups ?? {}).flatMap((lineup) =>
      lineup.map((starter) => starter.id),
    ),
  );

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
  const seasonEnd = snapshot.meta.season.split("-")[1] ?? "27";
  const seasonParam = String(2000 + Number(seasonEnd.slice(-2)));
  log(`Fetching ${playerIds.length} game logs (season ${seasonParam})`);

  let fetched = 0;
  const logsByPlayer = new Map<string, GameLog[]>();
  await mapLimit(playerIds, 6, async (playerId) => {
    try {
      const json = await getJson<EspnGamelog>(
        `${ESPN_WEB}/athletes/${playerId}/gamelog?season=${seasonParam}`,
      );
      logsByPlayer.set(playerId, parseGamelog(json));
    } catch {
      logsByPlayer.set(playerId, []);
    }
    fetched += 1;
    if (fetched % 50 === 0) log(`Game logs: ${fetched}/${playerIds.length}`);
  });

  const rows: HitRateRow[] = [];
  for (const { line, player, teamId, opponentId } of matched) {
    const logs = (logsByPlayer.get(player.id) ?? [])
      .filter((entry) => new Date(entry.date).getTime() < new Date(line.tipoff).getTime())
      .sort((a, b) => b.date.localeCompare(a.date));
    if (logs.length < 3) continue;
    const minutes = logs.reduce((sum, entry) => sum + entry.minutes, 0) / logs.length;
    if (minutes < 8) continue;

    const team = teamById.get(teamId);
    const opponent = teamById.get(opponentId);
    if (!team || !opponent) continue;

    const depthEntry = depth.get(normalizeName(team.name))?.get(normalizeName(player.name));
    const eligibility = eligibilityByName.get(normalizeName(player.name)) ?? [];
    const position = (eligibility[0] ??
      depthEntry?.positions[0] ??
      (player.coarse === "C" ? "C" : player.coarse === "G" ? "SG" : "SF")) as Position;

    const rank = opponent.season[position]?.ranks?.[line.stat];
    if (typeof rank !== "number") continue;

    const outcomeFor = (value: number): boolean | null =>
      value > line.line ? true : value === line.line ? null : false;
    const outcomes = logs.map((entry) => outcomeFor(entry[line.stat]));
    const againstOpponent = logs
      .filter((entry) => entry.opponentId === opponentId)
      .map((entry) => outcomeFor(entry[line.stat]));

    rows.push({
      playerId: player.id,
      name: player.name,
      teamId,
      opponentId,
      position,
      stat: line.stat,
      line: line.line,
      overPrice: line.overPrice,
      underPrice: line.underPrice,
      books: line.books,
      gameId: line.gameId,
      tipoff: line.tipoff,
      seasonAvg: Number(
        (logs.reduce((sum, entry) => sum + entry[line.stat], 0) / logs.length).toFixed(1),
      ),
      minutes: Number(minutes.toFixed(1)),
      l5: summarize(outcomes.slice(0, 5)),
      l10: summarize(outcomes.slice(0, 10)),
      h2h: summarize(againstOpponent),
      strip: outcomes.slice(0, 10),
      rank,
      starter: starters.has(player.id) || depthEntry?.depth === 0,
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
  };
}
