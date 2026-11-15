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

interface Snapshot {
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

export const snapshot = raw as unknown as Snapshot;

const teamIndex = new Map(snapshot.teams.map((team) => [team.id, team]));

export function teamById(id: string | undefined): Team | undefined {
  return id ? teamIndex.get(id) : undefined;
}

export function startersFor(teamId: string): Starter[] {
  return snapshot.lineups[teamId] ?? [];
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
 * Rank 1 means the defense gives up the fewest of that stat to that position,
 * so the top third is shaded clay (tough) and the bottom third sage (soft).
 */
export function rankTone(rank: number): string {
  if (rank <= 6) return "bg-match-tough-strong";
  if (rank <= 12) return "bg-match-tough";
  if (rank <= 18) return "bg-match-neutral";
  if (rank <= 24) return "bg-match-favorable";
  return "bg-match-favorable-strong";
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

export function dataThroughLabel(): string {
  if (!snapshot.meta.throughDate) return "season to date";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: EASTERN,
  }).format(new Date(snapshot.meta.throughDate));
}

export function matchupTitle(game: Matchup): string {
  const away = teamById(game.away);
  const home = teamById(game.home);
  if (!away || !home) return "Matchup";
  return `${away.location} at ${home.location}`;
}

export function matchupShort(game: Matchup): string {
  const away = teamById(game.away);
  const home = teamById(game.home);
  if (!away || !home) return "Matchup";
  return `${away.abbr} @ ${home.abbr}`;
}

/** Upcoming matchups grouped by calendar day, in Eastern time. */
export function groupedMatchups(): Array<{ day: string; games: Matchup[] }> {
  const groups = new Map<string, Matchup[]>();
  for (const game of snapshot.matchups) {
    const key = gameDay(game.date);
    const list = groups.get(key) ?? [];
    list.push(game);
    groups.set(key, list);
  }
  return [...groups.entries()].map(([day, games]) => ({ day, games }));
}
