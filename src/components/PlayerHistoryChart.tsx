import type { TrackingRow } from "@/hooks/use-tracking";
import { CATEGORY_LABELS, type StatKey } from "@/lib/dvp";
import {
  matchupGrade,
  type GameLineFields,
  type HitRateContext,
  type Position,
} from "@/lib/hit-rate";
import { cn } from "@/lib/utils";
import { useState } from "react";

const LOGO = (abbr: string) =>
  `https://a.espncdn.com/i/teamlogos/nba/500/${abbr.toLowerCase()}.png`;

/** Game dates read as IST, matching the rest of the app. */
function dayLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}

function fullDayLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}

/** "W 112-108" with the win/loss separated for tone. */
function scoreParts(score: string): { result: string; margin: string } | null {
  const match = /^([WL])\s*(.+)$/.exec(score.trim());
  if (match) return { result: match[1], margin: match[2] };
  return score.trim() ? { result: "", margin: score.trim() } : null;
}

function BoxLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <span className="text-[11px] tabular-nums text-foreground">{value}</span>
    </div>
  );
}

/**
 * One bar per completed game, coloured against today's line, with a hover (or
 * pinned) card carrying the box score plus that opponent's defense-vs-position
 * rank for this stat.
 */
export function PlayerHistoryChart({
  games,
  line,
  stat,
  position,
  context,
  tonight,
  tracking,
}: {
  games: GameLineFields[];
  line: number;
  stat: StatKey;
  position: Position;
  context: HitRateContext | undefined;
  tonight: { opponentId: string; opponentAbbr: string; rank: number } | null;
  /** NBA tracking numbers for this player, keyed by game start. Optional. */
  tracking?: Record<string, TrackingRow>;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const active = pinned ?? hover;
  // The empty slot for tonight sits one past the last completed game.
  const nextIndex = games.length;
  const isNext = active === nextIndex;
  const nextAllowed = tonight
    ? (context?.allowed[tonight.opponentId]?.[position]?.[stat] ?? null)
    : null;

  if (!games.length && !tonight) {
    return (
      <p className="border border-dashed border-border px-4 py-10 text-center text-[12px] text-muted-foreground">
        No completed games in this window.
      </p>
    );
  }

  const values = games.map((game) => game[stat]);
  const peak = Math.max(line, ...values, 1) * 1.18;
  const statLabel = CATEGORY_LABELS[stat].toLowerCase();
  const activeGame = active === null ? null : games[active];
  const activeScore = activeGame ? scoreParts(activeGame.score) : null;
  const activeRank = activeGame
    ? (context?.ranks[activeGame.opponentId]?.[position]?.[stat] ?? null)
    : null;
  const activeAllowed = activeGame
    ? (context?.allowed[activeGame.opponentId]?.[position]?.[stat] ?? null)
    : null;
  // Tracking is only pulled for assists and rebounds, and only for games the
  // local sync has seen: potential assists and rebound chances.
  const activeTracking = activeGame ? tracking?.[activeGame.date] : undefined;
  const trackingLine = activeGame
    ? stat === "ast" && activeTracking && activeTracking[0] > 0
      ? {
          label: "Potential assists",
          total: activeTracking[0],
          made: activeGame.ast,
        }
      : stat === "reb" && activeTracking && activeTracking[1] > 0
        ? {
            label: "Rebound chances",
            total: activeTracking[1],
            made: activeGame.reb,
          }
        : null
    : null;

  return (
    <div className="relative">
      {/*
       * Everything numeric is measured against this box alone: bar heights are a
       * share of it and the line sits at its own share, so a bar under the line
       * is always drawn under the line. Dates and logos live below it for that
       * reason — inside the column they ate the height the bars were sized to.
       */}
      <div className="relative flex h-52 items-end gap-1.5 sm:gap-2">
        {/* the line */}
        <div
          className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-foreground/45"
          style={{ bottom: `${(line / peak) * 100}%` }}
        >
          <span className="absolute -top-2 right-0 bg-background pl-1.5 text-[10px] font-medium tabular-nums text-foreground">
            {line}
          </span>
        </div>

        {games.map((game, index) => {
          const value = game[stat];
          const tone =
            value > line ? "favourable" : value < line ? "tough" : "push";
          const isActive = active === index;
          const height = Math.max((value / peak) * 100, 2);
          return (
            <button
              key={`${game.date}-${game.opponentId}`}
              type="button"
              onMouseEnter={() => setHover(index)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(index)}
              onBlur={() => setHover(null)}
              onClick={() => setPinned((current) => (current === index ? null : index))}
              aria-label={`${fullDayLabel(game.date)} ${game.home ? "vs" : "at"} ${game.opponentAbbr}: ${value} ${statLabel} against a line of ${line}`}
              className="group relative flex h-full flex-1 cursor-pointer items-end justify-center outline-none"
            >
              <span
                className={cn(
                  "pointer-events-none absolute left-1/2 -translate-x-1/2 text-[10px] font-medium tabular-nums transition-colors",
                  tone === "favourable"
                    ? "text-match-favorable-strong"
                    : tone === "tough"
                      ? "text-match-tough-strong"
                      : "text-muted-foreground",
                )}
                style={{ bottom: `calc(${height}% + 4px)` }}
              >
                {value}
              </span>
              <span
                className={cn(
                  "w-full max-w-10 rounded-t-[2px] transition-opacity",
                  tone === "favourable"
                    ? "bg-match-favorable-strong"
                    : tone === "tough"
                      ? "bg-match-tough-strong"
                      : "bg-muted-foreground/40",
                  isActive ? "opacity-100" : "opacity-90 group-hover:opacity-100",
                )}
                style={{ height: `${height}%` }}
              />
            </button>
          );
        })}

        {/* tonight's game, still empty but hoverable for the matchup */}
        {tonight ? (
          <button
            type="button"
            onMouseEnter={() => setHover(nextIndex)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(nextIndex)}
            onBlur={() => setHover(null)}
            onClick={() =>
              setPinned((current) =>
                current === nextIndex ? null : nextIndex,
              )
            }
            aria-label={`Tonight against ${tonight.opponentAbbr}: rank ${tonight.rank}, no game yet`}
            className={cn(
              "relative flex h-full flex-1 items-end outline-none transition-opacity",
              isNext ? "opacity-100" : "opacity-60 hover:opacity-90",
            )}
          >
            <span
              className={cn(
                "h-full w-full border-x border-t border-dashed",
                isNext ? "border-foreground/40 bg-accent/40" : "border-border",
              )}
            />
          </button>
        ) : null}
      </div>

      <div className="mt-2 flex gap-1.5 sm:gap-2">
        {games.map((game) => (
          <div
            key={`label-${game.date}-${game.opponentId}`}
            className="flex flex-1 flex-col items-center gap-1"
          >
            <img
              src={LOGO(game.opponentAbbr)}
              alt=""
              className="size-4 opacity-80"
              onError={(event) => {
                event.currentTarget.style.visibility = "hidden";
              }}
            />
            <span className="text-[9px] uppercase tracking-[0.06em] text-muted-foreground">
              {dayLabel(game.date)}
            </span>
          </div>
        ))}
        {tonight ? (
          <div className="flex flex-1 flex-col items-center gap-1">
            <img
              src={LOGO(tonight.opponentAbbr)}
              alt=""
              className="size-4 opacity-60"
              onError={(event) => {
                event.currentTarget.style.visibility = "hidden";
              }}
            />
            <span className="text-[9px] uppercase tracking-[0.06em] text-muted-foreground">
              Next
            </span>
          </div>
        ) : null}
      </div>

      {activeGame ? (
        <div
          className="pointer-events-none absolute -top-2 z-20 w-64 -translate-y-full -translate-x-1/2 border border-border bg-background p-3 shadow-sm"
          style={{
            left: `${Math.min(
              Math.max(((active! + 0.5) / (games.length + (tonight ? 1 : 0))) * 100, 26),
              74,
            )}%`,
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-medium leading-tight">
                {fullDayLabel(activeGame.date)}
                <span className="text-muted-foreground">
                  {" · "}
                  {activeGame.home ? "vs" : "@"} {activeGame.opponentAbbr}
                </span>
              </p>
              {activeScore ? (
                <p className="mt-0.5 text-[10px] tabular-nums text-muted-foreground">
                  <span
                    className={cn(
                      "font-medium",
                      activeScore.result === "W"
                        ? "text-match-favorable-strong"
                        : activeScore.result === "L"
                          ? "text-match-tough-strong"
                          : "text-muted-foreground",
                    )}
                  >
                    {activeScore.result}
                  </span>{" "}
                  {activeScore.margin}
                </p>
              ) : null}
            </div>
            <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
              {activeGame.home ? "Home" : "Away"}
            </span>
          </div>

          <div className="mt-2 flex items-baseline gap-1.5 border-t border-border pt-2">
            <span
              className={cn(
                "text-lg font-medium tabular-nums",
                activeGame[stat] > line
                  ? "text-match-favorable-strong"
                  : activeGame[stat] < line
                    ? "text-match-tough-strong"
                    : "text-foreground",
              )}
            >
              {activeGame[stat]}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {CATEGORY_LABELS[stat]} ·{" "}
              {activeGame[stat] > line ? "over" : activeGame[stat] < line ? "under" : "push"}{" "}
              {line}
            </span>
          </div>

          <p className="mt-1 text-[10px] tabular-nums text-muted-foreground">
            {activeGame.minutes} min · {activeGame.pts} pts · {activeGame.reb} reb ·{" "}
            {activeGame.ast} ast · {activeGame.tpm} 3PM
          </p>

          <div className="mt-2 border-t border-border pt-2">
            <BoxLine label="FG" value={`${activeGame.fgm}/${activeGame.fga}`} />
            <BoxLine label="3P" value={`${activeGame.tpm}/${activeGame.tpa}`} />
            <BoxLine label="FT" value={`${activeGame.ftm}/${activeGame.fta}`} />
          </div>

          {trackingLine ? (
            <div className="mt-2 border-t border-border pt-2">
              <BoxLine
                label={trackingLine.label}
                value={`${trackingLine.total} · ${Math.round(
                  (trackingLine.made / trackingLine.total) * 100,
                )}%`}
              />
            </div>
          ) : null}

          <div className="mt-2 border-t border-border pt-2">
            <p className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
              Matchup · {position} vs {activeGame.opponentAbbr}
            </p>
            <p className="mt-0.5 text-[11px] leading-tight">
              {activeRank === null ? (
                <span className="text-muted-foreground">No rank available</span>
              ) : (
                <>
                  <span className="font-medium">Rank #{activeRank}</span>{" "}
                  <span className="text-muted-foreground">
                    {matchupGrade(activeRank)}
                    {activeAllowed === null
                      ? ""
                      : ` · allows ${activeAllowed.toFixed(1)} ${statLabel} to ${position}s`}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>
      ) : null}

      {isNext && tonight ? (
        <div
          className="pointer-events-none absolute -top-2 z-20 w-64 -translate-y-full -translate-x-1/2 border border-border bg-background p-3 shadow-sm"
          style={{
            left: `${Math.min(
              Math.max(((nextIndex + 0.5) / (games.length + 1)) * 100, 26),
              74,
            )}%`,
          }}
        >
          <p className="text-[11px] font-medium leading-tight">
            Tonight
            <span className="text-muted-foreground">
              {" · vs "}
              {tonight.opponentAbbr}
            </span>
          </p>
          <p className="mt-0.5 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            No game yet
          </p>

          <div className="mt-2 border-t border-border pt-2">
            <BoxLine label="Line" value={`o${line}`} />
            <BoxLine label="Stat" value={CATEGORY_LABELS[stat]} />
          </div>

          <div className="mt-2 border-t border-border pt-2">
            <p className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
              Matchup · {position} vs {tonight.opponentAbbr}
            </p>
            <p className="mt-0.5 text-[11px] leading-tight">
              <span className="font-medium">Rank #{tonight.rank}</span>{" "}
              <span className="text-muted-foreground">
                {matchupGrade(tonight.rank)}
                {nextAllowed === null
                  ? ""
                  : ` · allows ${nextAllowed.toFixed(1)} ${statLabel} to ${position}s`}
              </span>
            </p>
          </div>
        </div>
      ) : null}

      <p className="mt-3 text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
        {pinned === null
          ? "Hover a bar for the box score and matchup · click to pin"
          : "Pinned · click the bar again to release"}
      </p>
    </div>
  );
}
