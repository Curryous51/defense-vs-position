/** Structural copies of the DvP types, so the Convex builder can share this file. */
export type Position = "PG" | "SG" | "SF" | "PF" | "C";
export type StatKey = "pts" | "reb" | "ast" | "tpm";

/** One prop on the slate, with the numbers the hit-rate dashboard shows. */
export interface HitRateRow {
  playerId: string;
  name: string;
  teamId: string;
  teamAbbr: string;
  opponentId: string;
  opponentAbbr: string;
  position: Position;
  stat: StatKey;
  /** Consensus line across the quoted books. */
  line: number;
  /** Best available over price at the consensus line. */
  overPrice: number;
  gameId: string;
  tipoff: string;
  l5: { hits: number; n: number };
  l10: { hits: number; n: number };
  h2h: { hits: number; n: number };
  /** Opponent's defense-vs-position rank (1 = fewest allowed, 30 = most). */
  rank: number;
  injuryStatus: string | null;
}

/**
 * One completed game, packed as a tuple: the board carries a couple of
 * thousand of them, and named keys would triple the payload.
 *
 * [date, opponentId, opponentAbbr, home, minutes, pts, reb, ast, tpm,
 *  fgm, fga, 3pa, ftm, fta, score]
 */
export type GameLine = [
  string,
  string,
  string,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  string,
];

/** Named view of a {@link GameLine}, for rendering. */
export interface GameLineFields {
  date: string;
  opponentId: string;
  opponentAbbr: string;
  home: boolean;
  minutes: number;
  pts: number;
  reb: number;
  ast: number;
  tpm: number;
  fgm: number;
  fga: number;
  tpa: number;
  ftm: number;
  fta: number;
  score: string;
}

export function unpackGame(line: GameLine): GameLineFields {
  const [
    date,
    opponentId,
    opponentAbbr,
    home,
    minutes,
    pts,
    reb,
    ast,
    tpm,
    fgm,
    fga,
    tpa,
    ftm,
    fta,
    score,
  ] = line;
  return {
    date,
    opponentId,
    opponentAbbr,
    home: home === 1,
    minutes,
    pts,
    reb,
    ast,
    tpm,
    fgm,
    fga,
    tpa,
    ftm,
    fta,
    score,
  };
}

/**
 * Defense-vs-position numbers for every team, so a profile can rank any
 * opponent a player has already faced, not just tonight's.
 */
export interface HitRateContext {
  ranks: Record<string, Record<Position, Record<StatKey, number>>>;
  allowed: Record<string, Record<Position, Record<StatKey, number>>>;
}

export interface HitRateBoard {
  meta: {
    generatedAt: string;
    season: string;
    slateDate: string | null;
    games: number;
    props: number;
    source: string;
    throughDate: string | null;
  };
  rows: HitRateRow[];
  /** Completed games per player, newest first. Absent on older snapshots. */
  history?: Record<string, GameLine[]>;
  /** Whole-league DvP context. Absent on older snapshots. */
  context?: HitRateContext;
}

/**
 * Defense-vs-position rank turned into a matchup grade. Rank 30 allows the
 * most, so it is the softest matchup for the offense.
 */
export function matchupGrade(rank: number): string {
  if (rank >= 28) return "A+";
  if (rank >= 25) return "A";
  if (rank >= 22) return "A-";
  if (rank >= 19) return "B+";
  if (rank >= 16) return "B";
  if (rank >= 13) return "B-";
  if (rank >= 10) return "C+";
  if (rank >= 7) return "C";
  if (rank >= 4) return "D";
  return "F";
}

export function gradeTone(rank: number): "soft" | "mid" | "tough" {
  if (rank > 24) return "soft";
  if (rank > 6) return "mid";
  return "tough";
}

export function hitRate(sample: { hits: number; n: number }): number | null {
  if (!sample.n) return null;
  return sample.hits / sample.n;
}

export function hitRateLabel(sample: { hits: number; n: number }): string {
  if (!sample.n) return "—";
  return `${Math.round((sample.hits / sample.n) * 100)}%`;
}

/** American odds are stored; the board shows decimal odds. */
export function priceLabel(price: number): string {
  if (!Number.isFinite(price) || price === 0) return "—";
  const decimal = price > 0 ? 1 + price / 100 : 1 + 100 / Math.abs(price);
  return decimal.toFixed(2);
}

/** Percent colouring: green above 60, red below 40, neutral in between. */
export function hitRateTone(sample: { hits: number; n: number }): string {
  const rate = hitRate(sample);
  if (rate === null) return "text-muted-foreground";
  if (rate >= 0.6) return "text-match-favorable-strong";
  if (rate <= 0.4) return "text-match-tough-strong";
  return "text-foreground";
}
