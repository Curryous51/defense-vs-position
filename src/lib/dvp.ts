import raw from "@/data/dvp.json";

export const POSITIONS = ["PG", "SG", "SF", "PF", "C"] as const;
export const STATS = ["pts", "reb", "ast", "tpm"] as const;

export type Position = (typeof POSITIONS)[number];
export type StatKey = (typeof STATS)[number];

export const STAT_LABELS: Record<StatKey, string> = {
  pts: "PTS",
  reb: "REB",
  ast: "AST",
  tpm: "3PM",
};

/** Keep in sync with LIVE_WINDOW_MS in convex/nbaBuilder.ts. */
export const GAME_WINDOW_MS = 3.5 * 60 * 60 * 1000;

export interface TeamSeasonRow extends Record<StatKey, number> {
  ranks: Record<StatKey, number>;
}

export interface Team {
  id: string;
  abbr: string;
  location: string;
  nickname: string;
  name: string;
  games: number;
  season: Record<Position, TeamSeasonRow>;
}

export interface Starter {
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

export interface Matchup {
  id: string;
  date: string;
  home: string;
  away: string;
}

export interface Snapshot {
  meta: {
    season: string;
    source: string;
    generatedAt: string;
    gamesSampled: number;
    throughDate: string | null;
  };
  teams: Team[];
  lineups: Record<string, Starter[]>;
  leagueAverage: Record<Position, Record<StatKey, number>>;
  matchups: Matchup[];
}

/** Checked-in snapshot, used until the first Convex sync lands. */
export const fallbackSnapshot = raw as unknown as Snapshot;

export function teamById(data: Snapshot, id: string | undefined): Team | undefined {
  if (!id) return undefined;
  return data.teams.find((team) => team.id === id);
}

export function startersFor(data: Snapshot, teamId: string): Starter[] {
  return data.lineups[teamId] ?? [];
}

export function ordinal(value: number): string {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}

/**
 * Rank 1 means the defense gives up the most of that stat to that position (as on
 * the FantasyPros table), so the top third is shaded sage (soft) and the bottom
 * third clay (tough).
 */
export function rankTone(rank: number): string {
  if (rank <= 6) return "bg-match-favorable-strong";
  if (rank <= 12) return "bg-match-favorable";
  if (rank <= 18) return "bg-match-neutral";
  if (rank <= 24) return "bg-match-tough";
  return "bg-match-tough-strong";
}

export function formatStat(value: number): string {
  return value.toFixed(1);
}

const EASTERN = "America/New_York";

export function gameDay(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: EASTERN,
  }).format(new Date(iso));
}

export function gameTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: EASTERN,
    timeZoneName: "short",
  }).format(new Date(iso));
}

export function gameLongDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: EASTERN,
  }).format(new Date(iso));
}

export function dataThroughLabel(data: Snapshot): string {
  if (!data.meta.throughDate) return "season to date";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: EASTERN,
  }).format(new Date(data.meta.throughDate));
}

export function matchupTitle(data: Snapshot, game: Matchup): string {
  const away = teamById(data, game.away);
  const home = teamById(data, game.home);
  if (!away || !home) return "Matchup";
  return `${away.location} at ${home.location}`;
}

export function matchupShort(data: Snapshot, game: Matchup): string {
  const away = teamById(data, game.away);
  const home = teamById(data, game.home);
  if (!away || !home) return "Matchup";
  return `${away.abbr} @ ${home.abbr}`;
}

/**
 * Drops games that have finished. Tip-off plus a 3.5h window is the cutoff, so a
 * game stays listed while it is being played and disappears shortly after the
 * final whistle, without waiting for the next daily sync.
 */
export function upcomingMatchups(data: Snapshot, now: number): Matchup[] {
  return data.matchups
    .filter((game) => new Date(game.date).getTime() + GAME_WINDOW_MS > now)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Upcoming matchups grouped by calendar day, in Eastern time. */
export function groupedMatchups(
  matchups: Matchup[],
): Array<{ day: string; games: Matchup[] }> {
  const groups = new Map<string, Matchup[]>();
  for (const game of matchups) {
    const key = gameDay(game.date);
    const list = groups.get(key) ?? [];
    list.push(game);
    groups.set(key, list);
  }
  return [...groups.entries()].map(([day, games]) => ({ day, games }));
}
