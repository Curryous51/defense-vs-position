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

export const STAT_NAMES: Record<StatKey, string> = {
  pts: "points",
  reb: "rebounds",
  ast: "assists",
  tpm: "threes",
};

/** Column headings for the easiest-matchup page. */
export const CATEGORY_LABELS: Record<StatKey, string> = {
  pts: "Points",
  reb: "Rebounds",
  ast: "Assists",
  tpm: "Threes",
};

export const POSITION_NAMES: Record<Position, string> = {
  PG: "Point guards",
  SG: "Shooting guards",
  SF: "Small forwards",
  PF: "Power forwards",
  C: "Centers",
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
 * Games still to be played. A matchup leaves the board the moment it tips off,
 * so the picker only ever offers games that have not started.
 */
export function upcomingMatchups(data: Snapshot, now: number): Matchup[] {
  return data.matchups
    .filter((game) => new Date(game.date).getTime() > now)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Calendar day (Eastern) used to key the daily slate. */
const EASTERN_DAY = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: EASTERN,
});

function slateKey(iso: string): string {
  return EASTERN_DAY.format(new Date(iso));
}

/**
 * Just the next day of basketball: the calendar day of the earliest upcoming
 * tip-off, with started games already filtered out.
 */
export function slateGames(data: Snapshot, now: number): Matchup[] {
  const upcoming = upcomingMatchups(data, now);
  if (!upcoming.length) return [];
  const key = slateKey(upcoming[0].date);
  return upcoming.filter((game) => slateKey(game.date) === key);
}

/** One offense-vs-defense pairing for a position and stat. */
export interface EasyMatchup {
  game: Matchup;
  offense: Team;
  defense: Team;
  position: Position;
  stat: StatKey;
  /** 1 = defense allows the fewest, 30 = the most. */
  rank: number;
  /** What the defense gives up per game in this category. */
  allowed: number;
}

/** Every position/stat pairing on the slate, one row each. */
function matchupRows(data: Snapshot, games: Matchup[]): EasyMatchup[] {
  const rows: EasyMatchup[] = [];
  for (const game of games) {
    for (const [offenseId, defenseId] of [
      [game.away, game.home],
      [game.home, game.away],
    ]) {
      const offense = teamById(data, offenseId);
      const defense = teamById(data, defenseId);
      if (!offense || !defense) continue;
      for (const position of POSITIONS) {
        const season = defense.season[position];
        for (const stat of STATS) {
          rows.push({
            game,
            offense,
            defense,
            position,
            stat,
            rank: season.ranks[stat],
            allowed: season[stat],
          });
        }
      }
    }
  }
  return rows;
}

const softestFirst = (a: EasyMatchup, b: EasyMatchup) =>
  b.rank - a.rank || b.allowed - a.allowed;

const toughestFirst = (a: EasyMatchup, b: EasyMatchup) =>
  a.rank - b.rank || a.allowed - b.allowed;

/** Every position/stat pairing on the slate, sorted softest first. */
export function easyMatchups(data: Snapshot, games: Matchup[]): EasyMatchup[] {
  return matchupRows(data, games).sort(softestFirst);
}

/** Every position/stat pairing on the slate, sorted toughest first. */
export function toughestMatchups(
  data: Snapshot,
  games: Matchup[],
): EasyMatchup[] {
  return matchupRows(data, games).sort(toughestFirst);
}

/**
 * The five softest pairings in each category, split out by position so every
 * list only compares defenses against the same position.
 */
export function topEasiestByPosition(
  data: Snapshot,
  games: Matchup[],
): Record<Position, Record<StatKey, EasyMatchup[]>> {
  return topByPosition(easyMatchups(data, games));
}

/**
 * The five stingiest pairings in each category, split out by position so every
 * list only compares defenses against the same position.
 */
export function topToughestByPosition(
  data: Snapshot,
  games: Matchup[],
): Record<Position, Record<StatKey, EasyMatchup[]>> {
  return topByPosition(toughestMatchups(data, games));
}

function topByPosition(
  rows: EasyMatchup[],
): Record<Position, Record<StatKey, EasyMatchup[]>> {
  return POSITIONS.reduce(
    (byPosition, position) => {
      byPosition[position] = STATS.reduce(
        (byStat, stat) => {
          byStat[stat] = rows
            .filter((row) => row.position === position && row.stat === stat)
            .slice(0, 5);
          return byStat;
        },
        {} as Record<StatKey, EasyMatchup[]>,
      );
      return byPosition;
    },
    {} as Record<Position, Record<StatKey, EasyMatchup[]>>,
  );
}

type GameReads = Array<{ offense: Team; defense: Team; reads: EasyMatchup[] }>;

/**
 * The quick-read list for one side of a game: each position's softest category,
 * then the three friendliest of those.
 */
export function gameQuickReads(data: Snapshot, game: Matchup): GameReads {
  return gameReads(data, game, softestFirst);
}

/**
 * The tough-read list for one side of a game: each position's stingiest
 * category, then the three hardest of those.
 */
export function gameToughReads(data: Snapshot, game: Matchup): GameReads {
  return gameReads(data, game, toughestFirst);
}

function gameReads(
  data: Snapshot,
  game: Matchup,
  compare: (a: EasyMatchup, b: EasyMatchup) => number,
): GameReads {
  const sides = [
    { offenseId: game.away, defenseId: game.home },
    { offenseId: game.home, defenseId: game.away },
  ];

  return sides.flatMap(({ offenseId, defenseId }) => {
    const offense = teamById(data, offenseId);
    const defense = teamById(data, defenseId);
    if (!offense || !defense) return [];

    const perPosition = POSITIONS.map((position) => {
      const season = defense.season[position];
      return STATS.map<EasyMatchup>((stat) => ({
        game,
        offense,
        defense,
        position,
        stat,
        rank: season.ranks[stat],
        allowed: season[stat],
      })).sort(compare)[0];
    });

    return [
      {
        offense,
        defense,
        reads: perPosition.sort(compare).slice(0, 3),
      },
    ];
  });
}

/** "Most rebounds to SGs" / "3rd-most points to PFs". */
export function softReadLabel(entry: EasyMatchup): string {
  const noun = STAT_NAMES[entry.stat];
  const prefix =
    entry.rank === 30 ? `Most ${noun}` : `${ordinal(31 - entry.rank)}-most ${noun}`;
  return `${prefix} to ${entry.position}s`;
}

/** "Fewest rebounds to SGs" / "4th-fewest points to PFs". */
export function toughReadLabel(entry: EasyMatchup): string {
  const noun = STAT_NAMES[entry.stat];
  const prefix =
    entry.rank === 1 ? `Fewest ${noun}` : `${ordinal(entry.rank)}-fewest ${noun}`;
  return `${prefix} to ${entry.position}s`;
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
