/**
 * Defense-vs-position builder, shared by the Convex sync action and the offline
 * snapshot script.
 *
 * Sources (both free, no key):
 *  - ESPN public NBA API: season schedule + per-game box scores
 *  - Sleeper public player list: PG/SG/SF/PF/C eligibility (ESPN only exposes G/F/C)
 *
 * Every player line is credited to the opposing defense at that player's
 * position, then averaged over the defense's games and ranked 1-30.
 */

export const POSITIONS = ["PG", "SG", "SF", "PF", "C"] as const;
export const STATS = ["pts", "reb", "ast", "tpm"] as const;

export type Position = (typeof POSITIONS)[number];
export type StatKey = (typeof STATS)[number];

const ESPN = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
// Games are treated as still relevant for this long after tip-off. The picker
// uses the same window on the client so a finished game disappears right away.
export const LIVE_WINDOW_MS = 3.5 * 60 * 60 * 1000;

export interface BuiltTeam {
  id: string;
  abbr: string;
  location: string;
  nickname: string;
  name: string;
  games: number;
  season: Record<Position, Record<StatKey, number> & { ranks: Record<StatKey, number> }>;
}

export interface BuiltStarter {
  slot: Position;
  id: string;
  name: string;
  positions: string[];
  games: number;
  starts: number;
  mpg: number;
  pts: number;
  reb: number;
  ast: number;
  tpm: number;
}

export interface BuiltMatchup {
  id: string;
  date: string;
  home: string;
  away: string;
}

export interface BuiltSnapshot {
  meta: {
    season: string;
    source: string;
    generatedAt: string;
    gamesSampled: number;
    throughDate: string | null;
  };
  teams: BuiltTeam[];
  lineups: Record<string, BuiltStarter[]>;
  leagueAverage: Record<Position, Record<StatKey, number>>;
  matchups: BuiltMatchup[];
}

interface PlayerLine {
  pts: number;
  reb: number;
  ast: number;
  tpm: number;
}

interface PlayerAggregate {
  id: string;
  name: string;
  teamId: string;
  coarse: string;
  eligibility: string[];
  games: number;
  starts: number;
  minutes: number;
  totals: PlayerLine;
  lines: Array<PlayerLine & { against: string }>;
  perGame: PlayerLine;
  position: Position;
}

async function getJson<T>(url: string, attempts = 3): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          accept: "application/json",
          // Some hosts reject non-browser user agents (Bun's default, for one).
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        },
      });
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return (await res.json()) as T;
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
  if (typeof value === "number") return value;
  if (typeof value !== "string") return 0;
  const cleaned = value.replace("+", "").trim();
  if (!cleaned || cleaned === "-" || cleaned === "--") return 0;
  if (cleaned.includes("-")) return num(cleaned.split("-")[0]);
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

const round = (value: number, digits = 1) => Number(value.toFixed(digits));

/**
 * Collapse a player's eligibility list into the position a defense guards him
 * at. Sleeper lists combo guards as PG/SG and combo forwards as PF/SF, so the
 * coarse ESPN slot plus production decides the tie.
 */
function canonicalPosition(
  eligibility: string[],
  coarse: string,
  perGame: PlayerLine,
): Position {
  if (coarse === "C" || (eligibility.includes("C") && eligibility.length === 1)) {
    return "C";
  }
  if (coarse === "G") {
    if (eligibility.includes("PG") && (!eligibility.includes("SG") || perGame.ast >= 3.5)) {
      return "PG";
    }
    if (eligibility.includes("SG")) return "SG";
    return (eligibility[0] as Position) ?? "PG";
  }
  if (coarse === "F") {
    if (eligibility.includes("PF") && (!eligibility.includes("SF") || perGame.reb >= 5.5)) {
      return "PF";
    }
    if (eligibility.includes("SF")) return "SF";
    return (eligibility[0] as Position) ?? "SF";
  }
  return (eligibility[0] as Position) ?? "SF";
}

interface RosterPlayer extends PlayerAggregate {
  mpg: number;
}

/** Max-minutes assignment of five players to five position slots. */
function buildLineup(roster: RosterPlayer[]): Partial<Record<Position, RosterPlayer>> {
  const pool = roster.slice(0, 14);
  const weightOf = (p: RosterPlayer) => p.starts * 100 + p.mpg;
  const memo = new Map<string, number>();

  const dp = (slot: number, usedMask: number): number => {
    if (slot === POSITIONS.length) return 0;
    const key = `${slot}:${usedMask}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    let best = -1;
    pool.forEach((player, i) => {
      if (usedMask & (1 << i)) return;
      if (!player.eligibility.includes(POSITIONS[slot])) return;
      best = Math.max(best, weightOf(player) + dp(slot + 1, usedMask | (1 << i)));
    });
    memo.set(key, best);
    return best;
  };

  const chosen: Partial<Record<Position, RosterPlayer>> = {};
  const used = new Set<string>();
  let usedMask = 0;
  for (let slot = 0; slot < POSITIONS.length; slot++) {
    let pick = -1;
    pool.forEach((player, i) => {
      if (pick >= 0 || usedMask & (1 << i)) return;
      if (!player.eligibility.includes(POSITIONS[slot])) return;
      if (weightOf(player) + dp(slot + 1, usedMask | (1 << i)) === dp(slot, usedMask)) {
        pick = i;
      }
    });
    if (pick >= 0) {
      chosen[POSITIONS[slot]] = pool[pick];
      used.add(pool[pick].id);
      usedMask |= 1 << pick;
    }
  }

  for (const pos of POSITIONS) {
    if (chosen[pos]) continue;
    const fallback = roster.find((p) => !used.has(p.id));
    if (fallback) {
      chosen[pos] = fallback;
      used.add(fallback.id);
    }
  }
  return chosen;
}

interface EspnTeam {
  id: string;
  abbreviation: string;
  location?: string;
  name: string;
  displayName: string;
}

interface EspnCompetitor {
  team: { id: string; abbreviation: string };
  score?: string;
  homeAway: "home" | "away";
}

interface EspnEvent {
  id: string;
  date: string;
  competitions?: Array<{
    status?: { type?: { state?: string } };
    competitors?: EspnCompetitor[];
  }>;
}

interface EspnBoxscore {
  boxscore?: {
    players?: Array<{
      team?: { id?: string };
      statistics?: Array<{
        keys?: string[];
        athletes?: Array<{
          athlete?: {
            id?: string;
            displayName?: string;
            position?: { abbreviation?: string };
          };
          starter?: boolean;
          didNotPlay?: boolean;
          stats?: string[];
        }>;
      }>;
    }>;
  };
}

export interface BuildOptions {
  /** ESPN season year: 2027 is the 2026-27 season. */
  season?: number;
  /** Clock used to decide which scheduled games are still upcoming. */
  now?: number;
  onProgress?: (message: string) => void;
}

export async function buildSnapshot(options: BuildOptions = {}): Promise<BuiltSnapshot> {
  const season = options.season ?? 2027;
  const now = options.now ?? Date.now();
  const log = options.onProgress ?? (() => {});

  log("Fetching teams, schedule, and player positions");
  const [teamsJson, sleeperJson] = await Promise.all([
    getJson<{ sports: Array<{ leagues: Array<{ teams: Array<{ team: EspnTeam }> }> }> }>(
      `${ESPN}/teams`,
    ),
    getJson<Record<string, { full_name?: string; fantasy_positions?: string[] }>>(
      "https://api.sleeper.app/v1/players/nba",
    ),
  ]);

  const teams = teamsJson.sports[0].leagues[0].teams.map(({ team }) => ({
    id: String(team.id),
    abbr: team.abbreviation,
    location: team.location ?? team.displayName,
    nickname: team.name,
  }));

  const eligibilityByName = new Map<string, string[]>();
  for (const player of Object.values(sleeperJson)) {
    if (!player?.full_name) continue;
    const eligibility = (player.fantasy_positions ?? []).filter((p) =>
      (POSITIONS as readonly string[]).includes(p),
    );
    if (eligibility.length) eligibilityByName.set(normalizeName(player.full_name), eligibility);
  }

  const schedules = await mapLimit(teams, 6, async (team) => {
    const json = await getJson<{ events?: EspnEvent[] }>(
      `${ESPN}/teams/${team.id}/schedule?season=${season}`,
    );
    return json.events ?? [];
  });

  const byId = new Map<
    string,
    { id: string; date: string; completed: boolean; teams: Array<{ id: string; homeAway: string }> }
  >();
  for (const event of schedules.flat()) {
    const competition = event.competitions?.[0];
    const state = competition?.status?.type?.state;
    if (!competition || !state || !["post", "in", "pre"].includes(state)) continue;
    const competitors = competition.competitors ?? [];
    if (competitors.length !== 2) continue;
    byId.set(String(event.id), {
      id: String(event.id),
      date: event.date,
      completed: state === "post",
      teams: competitors.map((c) => ({ id: String(c.team.id), homeAway: c.homeAway })),
    });
  }

  const games = [...byId.values()].sort((a, b) => a.date.localeCompare(b.date));
  const completedGames = games.filter((g) => g.completed);
  log(`Schedule: ${games.length} games, ${completedGames.length} completed`);

  const players = new Map<string, PlayerAggregate>();
  const teamGames = new Map<string, number>();

  let processed = 0;
  await mapLimit(completedGames, 5, async (game) => {
    let summary: EspnBoxscore;
    try {
      summary = await getJson<EspnBoxscore>(`${ESPN}/summary?event=${game.id}`);
    } catch (err) {
      log(`box score failed for ${game.id}: ${(err as Error).message}`);
      return;
    }
    for (const group of summary.boxscore?.players ?? []) {
      const teamId = String(group.team?.id ?? "");
      if (!teamId) continue;
      teamGames.set(teamId, (teamGames.get(teamId) ?? 0) + 1);
      const block = group.statistics?.[0];
      if (!block?.athletes) continue;
      const keys = block.keys ?? [];
      const index = (key: string) => keys.indexOf(key);
      const iMin = index("minutes");
      const iPts = index("points");
      const iTpm = index("threePointFieldGoalsMade-threePointFieldGoalsAttempted");
      const iReb = index("rebounds");
      const iAst = index("assists");

      const opponent = game.teams.find((t) => t.id !== teamId);
      if (!opponent) continue;

      for (const row of block.athletes) {
        const athlete = row.athlete;
        if (!athlete?.id) continue;
        const minutes = iMin >= 0 ? num(row.stats?.[iMin]) : 0;
        if (row.didNotPlay === true || minutes <= 0) continue;

        const id = String(athlete.id);
        let entry = players.get(id);
        if (!entry) {
          entry = {
            id,
            name: athlete.displayName ?? "",
            teamId,
            coarse: athlete.position?.abbreviation ?? "",
            eligibility: [],
            games: 0,
            starts: 0,
            minutes: 0,
            totals: { pts: 0, reb: 0, ast: 0, tpm: 0 },
            lines: [],
            perGame: { pts: 0, reb: 0, ast: 0, tpm: 0 },
            position: "SF",
          };
          players.set(id, entry);
        }
        entry.teamId = teamId;
        const eligibility = eligibilityByName.get(normalizeName(entry.name)) ?? [];
        if (eligibility.length) entry.eligibility = eligibility;
        entry.games += 1;
        entry.starts += row.starter ? 1 : 0;
        entry.minutes += minutes;

        const line: PlayerLine = {
          pts: iPts >= 0 ? num(row.stats?.[iPts]) : 0,
          reb: iReb >= 0 ? num(row.stats?.[iReb]) : 0,
          ast: iAst >= 0 ? num(row.stats?.[iAst]) : 0,
          tpm: iTpm >= 0 ? num(row.stats?.[iTpm]) : 0,
        };
        STATS.forEach((stat) => (entry!.totals[stat] += line[stat]));
        entry.lines.push({ ...line, against: opponent.id });
      }
    }
    processed += 1;
    if (processed % 40 === 0) log(`Box scores: ${processed}/${completedGames.length}`);
  });
  log(`Players with minutes: ${players.size}`);

  // Canonical position per player, then defense-vs-position totals.
  const defenseTotals = new Map<string, PlayerLine>();
  for (const player of players.values()) {
    player.perGame = {
      pts: player.totals.pts / player.games,
      reb: player.totals.reb / player.games,
      ast: player.totals.ast / player.games,
      tpm: player.totals.tpm / player.games,
    };
    const eligibility = player.eligibility.length
      ? player.eligibility
      : [player.coarse === "C" ? "C" : player.coarse === "G" ? "SG" : "SF"];
    player.eligibility = eligibility;
    player.position = canonicalPosition(eligibility, player.coarse, player.perGame);

    for (const line of player.lines) {
      const key = `${line.against}:${player.position}`;
      const total = defenseTotals.get(key) ?? { pts: 0, reb: 0, ast: 0, tpm: 0 };
      STATS.forEach((stat) => (total[stat] += line[stat]));
      defenseTotals.set(key, total);
    }
  }

  const dvp = new Map<string, Record<Position, PlayerLine>>();
  for (const team of teams) {
    const gamesPlayed = Math.max(1, teamGames.get(team.id) ?? 0);
    const byPosition = {} as Record<Position, PlayerLine>;
    for (const pos of POSITIONS) {
      const total = defenseTotals.get(`${team.id}:${pos}`) ?? { pts: 0, reb: 0, ast: 0, tpm: 0 };
      byPosition[pos] = Object.fromEntries(
        STATS.map((stat) => [stat, total[stat] / gamesPlayed]),
      ) as unknown as PlayerLine;
    }
    dvp.set(team.id, byPosition);
  }

  const ranks = new Map<string, Record<Position, Record<StatKey, number>>>();
  for (const stat of STATS) {
    for (const pos of POSITIONS) {
      const ordered = teams
        .map((t) => ({ id: t.id, value: dvp.get(t.id)![pos][stat] }))
        .sort((a, b) => a.value - b.value);
      ordered.forEach((row, i) => {
        const teamRanks = ranks.get(row.id) ?? ({} as Record<Position, Record<StatKey, number>>);
        teamRanks[pos] = { ...(teamRanks[pos] ?? {}), [stat]: i + 1 } as Record<StatKey, number>;
        ranks.set(row.id, teamRanks);
      });
    }
  }

  const leagueAverage = {} as Record<Position, Record<StatKey, number>>;
  for (const pos of POSITIONS) {
    leagueAverage[pos] = {} as Record<StatKey, number>;
    for (const stat of STATS) {
      const values = teams.map((t) => dvp.get(t.id)![pos][stat]);
      leagueAverage[pos][stat] = round(values.reduce((a, b) => a + b, 0) / values.length);
    }
  }

  const lineups: Record<string, BuiltStarter[]> = {};
  for (const team of teams) {
    const roster: RosterPlayer[] = [...players.values()]
      .filter((p) => p.teamId === team.id && p.games > 0)
      .map((p) => ({ ...p, mpg: p.minutes / p.games }))
      .sort((a, b) => b.starts - a.starts || b.mpg - a.mpg);
    const lineup = buildLineup(roster);
    lineups[team.id] = POSITIONS.flatMap((pos) => {
      const player = lineup[pos];
      if (!player) return [];
      return [
        {
          slot: pos,
          id: player.id,
          name: player.name,
          positions: player.eligibility,
          games: player.games,
          starts: player.starts,
          mpg: round(player.mpg),
          pts: round(player.perGame.pts),
          reb: round(player.perGame.reb),
          ast: round(player.perGame.ast),
          tpm: round(player.perGame.tpm),
        },
      ];
    });
  }

  const matchups = games
    .filter((g) => !g.completed && new Date(g.date).getTime() + LIVE_WINDOW_MS > now)
    .slice(0, 120)
    .map((g) => ({
      id: g.id,
      date: g.date,
      home: g.teams.find((t) => t.homeAway === "home")?.id,
      away: g.teams.find((t) => t.homeAway === "away")?.id,
    }))
    .filter((g): g is BuiltMatchup => Boolean(g.home && g.away));

  const latestGame = completedGames[completedGames.length - 1];
  return {
    meta: {
      season: season === 2027 ? "2026-27" : String(season),
      source: "ESPN public box scores",
      generatedAt: new Date().toISOString(),
      gamesSampled: completedGames.length,
      throughDate: latestGame?.date ?? null,
    },
    teams: teams.map((t) => {
      const season = {} as BuiltTeam["season"];
      for (const pos of POSITIONS) {
        const row = dvp.get(t.id)![pos];
        season[pos] = {
          pts: round(row.pts),
          reb: round(row.reb),
          ast: round(row.ast),
          tpm: round(row.tpm),
          ranks: ranks.get(t.id)![pos],
        };
      }
      return {
        ...t,
        name: `${t.location} ${t.nickname}`,
        games: teamGames.get(t.id) ?? 0,
        season,
      };
    }),
    lineups,
    leagueAverage,
    matchups,
  };
}
