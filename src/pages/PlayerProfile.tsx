import { AppShell } from "@/components/AppShell";
import { PlayerHistoryChart } from "@/components/PlayerHistoryChart";
import { useHitRateBoard } from "@/hooks/use-hit-rate-board";
import { usePlayerHistory } from "@/hooks/use-player-history";
import { CATEGORY_LABELS, STATS, gameTime, type StatKey } from "@/lib/dvp";
import {
  gradeTone,
  hitRateLabel,
  hitRateTone,
  matchupGrade,
  priceLabel,
  type HitRateRow,
} from "@/lib/hit-rate";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";

type Window = "l5" | "l10" | "h2h";

const WINDOWS: Array<{ key: Window; label: string }> = [
  { key: "l5", label: "Last 5" },
  { key: "l10", label: "Last 10" },
  { key: "h2h", label: "vs opponent" },
];

function tipoffLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}

function Sample({
  label,
  sample,
  caption,
  active,
  onClick,
}: {
  label: string;
  sample: { hits: number; n: number };
  caption: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col gap-1 border px-3 py-2.5 text-left transition-colors",
        active
          ? "border-foreground bg-accent/40"
          : "border-border hover:border-foreground/40",
      )}
    >
      <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <span className={cn("text-lg font-medium tabular-nums", hitRateTone(sample))}>
        {hitRateLabel(sample)}
      </span>
      <span className="text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
        {sample.n ? `${sample.hits}/${sample.n} · ${caption}` : "no games"}
      </span>
    </button>
  );
}

export default function PlayerProfile() {
  const { playerId } = useParams<{ playerId: string }>();
  const { data: board } = useHitRateBoard();
  const [picked, setPicked] = useState<StatKey | null>(null);
  const [window, setWindow] = useState<Window>("l10");

  const rows = useMemo(
    () =>
      board.rows
        .filter((row) => row.playerId === playerId)
        .sort((a, b) => STATS.indexOf(a.stat) - STATS.indexOf(b.stat)),
    [board.rows, playerId],
  );

  const row: HitRateRow | undefined =
    rows.find((candidate) => candidate.stat === picked) ??
    rows.find((candidate) => candidate.stat === "pts") ??
    rows[0];

  const currentSeason = 2000 + Number(board.meta.season.slice(-2));
  const { games, loading } = usePlayerHistory(
    playerId,
    row?.opponentId,
    currentSeason,
    playerId ? board.history?.[playerId] : undefined,
  );

  const shown = useMemo(() => {
    const ordered = [...games].sort((a, b) => a.date.localeCompare(b.date));
    if (window === "h2h") {
      return ordered.filter((game) => game.opponentId === row?.opponentId);
    }
    return ordered.slice(-(window === "l5" ? 5 : 10));
  }, [games, row?.opponentId, window]);

  const line = row?.line ?? 0;
  const tonight = row
    ? {
        opponentId: row.opponentId,
        opponentAbbr: row.opponentAbbr,
        rank: row.rank,
      }
    : null;

  return (
    <AppShell season={board.meta.season}>
      <main className="mx-auto w-full max-w-[64rem] px-5 py-10 sm:px-8 sm:py-12">
        <Link
          to="/hit-rate"
          className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Hit rate dashboard
        </Link>

        {!row ? (
          <div className="mt-10 border-t border-border pt-8">
            <h1 className="text-2xl font-medium tracking-[-0.02em]">
              Not on tonight's board
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
              This player has no prop in the current snapshot. Lines are pulled
              twice a day; check the dashboard again after the next refresh.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-6 flex flex-col gap-6 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  {row.position} · {row.teamAbbr}
                </p>
                <h1 className="mt-2 text-3xl font-medium tracking-[-0.02em] sm:text-4xl">
                  {row.name}
                </h1>
                <p className="mt-2 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                  <span>
                    {row.teamAbbr} vs {row.opponentAbbr} ·{" "}
                    {tipoffLabel(row.tipoff)} · {gameTime(row.tipoff)}
                  </span>
                  {row.injuryStatus ? (
                    <span
                      className={cn(
                        "rounded-[2px] px-1 py-px text-[8px] uppercase tracking-[0.08em]",
                        row.injuryStatus === "Out"
                          ? "bg-match-tough-strong text-white"
                          : "bg-match-tough/30 text-foreground",
                      )}
                    >
                      {row.injuryStatus === "Day-To-Day" ? "DTD" : row.injuryStatus}
                    </span>
                  ) : null}
                </p>
              </div>

              <div className="flex items-end gap-5">
                <div>
                  <p className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                    Line
                  </p>
                  <p className="mt-1 text-xl font-medium tabular-nums">
                    o{row.line}
                  </p>
                  <p className="text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                    {priceLabel(row.overPrice)}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                    Matchup
                  </p>
                  <p
                    className={cn(
                      "mt-1 inline-flex h-6 items-center justify-center rounded-[3px] px-1.5 text-[11px] font-medium",
                      gradeTone(row.rank) === "soft"
                        ? "bg-match-favorable-strong text-white"
                        : gradeTone(row.rank) === "tough"
                          ? "bg-match-tough-strong text-white"
                          : matchupGrade(row.rank) === "A-"
                            ? "bg-match-favorable text-match-favorable-strong"
                            : "bg-match-neutral text-foreground",
                    )}
                  >
                    {matchupGrade(row.rank)}
                  </p>
                  <p className="mt-1 text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                    rank #{row.rank}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3">
              <label className="flex items-center gap-2">
                <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                  Prop
                </span>
                <select
                  value={row.stat}
                  onChange={(event) => setPicked(event.target.value as StatKey)}
                  className="h-8 rounded-[3px] border border-border bg-background px-2 text-[11px] text-foreground outline-none focus:border-foreground/40"
                >
                  {rows.map((option) => (
                    <option key={option.stat} value={option.stat}>
                      {CATEGORY_LABELS[option.stat]} · o{option.line}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex items-center gap-1.5">
                {WINDOWS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setWindow(option.key)}
                    className={cn(
                      "h-8 rounded-[3px] border px-2.5 text-[10px] uppercase tracking-[0.12em] transition-colors",
                      window === option.key
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <span className="ml-auto text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {shown.length} games
              </span>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Sample
                label="Last 5"
                sample={row.l5}
                caption="vs line"
                active={window === "l5"}
                onClick={() => setWindow("l5")}
              />
              <Sample
                label="Last 10"
                sample={row.l10}
                caption="vs line"
                active={window === "l10"}
                onClick={() => setWindow("l10")}
              />
              <Sample
                label={`vs ${row.opponentAbbr}`}
                sample={row.h2h}
                caption="3 seasons"
                active={window === "h2h"}
                onClick={() => setWindow("h2h")}
              />
            </div>

            <div className="mt-6 border border-border p-4 sm:p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  {CATEGORY_LABELS[row.stat]} · over {row.line} ·{" "}
                  {window === "h2h"
                    ? `vs ${row.opponentAbbr}`
                    : window === "l5"
                      ? "last 5"
                      : "last 10"}
                </p>
                <p
                  className={cn(
                    "text-sm font-medium tabular-nums",
                    hitRateTone(row[window]),
                  )}
                >
                  {hitRateLabel(row[window])}{" "}
                  <span className="text-[10px] font-normal text-muted-foreground">
                    {row[window].hits}/{row[window].n}
                  </span>
                </p>
              </div>

              {loading ? (
                <p className="mt-6 px-4 py-10 text-center text-[12px] text-muted-foreground">
                  Loading game log…
                </p>
              ) : games.length ? (
                <div className="mt-6">
                  <PlayerHistoryChart
                    games={shown}
                    line={line}
                    stat={row.stat}
                    position={row.position}
                    context={board.context}
                    tonight={window === "h2h" ? null : tonight}
                  />
                </div>
              ) : (
                <p className="mt-6 border border-dashed border-border px-4 py-10 text-center text-[12px] leading-5 text-muted-foreground">
                  Game logs arrive with the next data refresh. The hit rates above
                  are already final; the game-by-game chart fills in after the
                  board rebuilds.
                </p>
              )}
            </div>

            <div className="mt-5 border-t border-border pt-4 text-[10px] leading-5 text-muted-foreground">
              Bars are coloured against the current line: green over, red under.
              Hover or tap a bar for the box score, the opponent's
              defense-vs-position rank for this stat, and what that defense
              allows. Pushes are dropped from the hit-rate samples.
            </div>
          </>
        )}
      </main>
    </AppShell>
  );
}
