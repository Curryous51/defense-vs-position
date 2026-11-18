import { AppShell } from "@/components/AppShell";
import { CategoryColumn } from "@/components/CategoryColumn";
import { GameReadCards } from "@/components/GameReadCards";
import { useDvpSnapshot, useNow } from "@/hooks/use-dvp-snapshot";
import {
  CATEGORY_LABELS,
  POSITIONS,
  POSITION_NAMES,
  STATS,
  dataThroughLabel,
  gameLongDate,
  slateGames,
  topToughestByPosition,
} from "@/lib/dvp";
import { useMemo } from "react";

export default function Toughest() {
  const { data } = useDvpSnapshot();
  const now = useNow();
  const games = useMemo(() => slateGames(data, now), [data, now]);
  const byPosition = useMemo(
    () => topToughestByPosition(data, games),
    [data, games],
  );

  if (!games.length) {
    return (
      <AppShell season={data.meta.season}>
        <main className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Season {data.meta.season}
          </p>
          <h1 className="text-xl font-medium tracking-[-0.01em]">
            No games on the next slate
          </h1>
          <p className="max-w-sm text-sm leading-6 text-muted-foreground">
            Games leave the slate at tip-off. The next day of basketball appears
            after the daily sync.
          </p>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell season={data.meta.season}>
      <main className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        <div className="flex flex-col gap-8">
          <div>
            <div className="flex items-center gap-3">
              <span className="h-px w-8 bg-foreground/30" />
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Slate · {gameLongDate(games[0].date)}
              </p>
            </div>
            <h1 className="mt-4 text-3xl font-medium tracking-[-0.02em] sm:text-4xl">
              Toughest matchups
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
              The hardest spots on the whole slate, read from what every defense
              gives up to each position. Rank 1 allows the fewest, 30 the most.
            </p>
          </div>

          <section className="border-t border-border pt-8">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
              <h2 className="text-[11px] uppercase tracking-[0.18em] text-foreground">
                Top 5 by position
              </h2>
              <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {games.length} games · whole slate
              </span>
            </div>
            <p className="mt-3 max-w-2xl text-[12px] leading-6 text-muted-foreground">
              Every category, split by position — the five stingiest defenses
              each offense can face on this slate.
            </p>

            <div className="mt-8 flex flex-col gap-10">
              {POSITIONS.map((position) => (
                <div key={position}>
                  <div className="flex items-baseline justify-between gap-4 border-b border-border pb-2">
                    <h3 className="text-[12px] font-medium">
                      <span className="text-muted-foreground">{position}</span>
                      <span className="mx-2 text-muted-foreground/50">/</span>
                      {POSITION_NAMES[position]}
                    </h3>
                    <span className="shrink-0 text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                      Top 5 per category
                    </span>
                  </div>
                  <div className="mt-4 grid gap-x-10 gap-y-8 sm:grid-cols-2 xl:grid-cols-4">
                    {STATS.map((stat) => (
                      <CategoryColumn
                        key={stat}
                        label={CATEGORY_LABELS[stat]}
                        entries={byPosition[position][stat]}
                        data={data}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <p className="mt-8 max-w-2xl text-[11px] leading-5 text-muted-foreground">
              Ranks compare defenses at the same position, and only teams
              playing on this slate are listed. Rank 1 is the stingiest matchup;
              the average is what that defense gives up per game.
            </p>
          </section>

          <section className="border-t border-border pt-8">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
              <h2 className="text-[12px] uppercase tracking-[0.18em] text-foreground">
                Game by game
              </h2>
              <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                Tough read · three per offense
              </span>
            </div>
            <p className="mt-3 max-w-2xl text-[13px] leading-6 text-muted-foreground">
              The three toughest spots each offense walks into tonight, one per
              position.
            </p>

            <GameReadCards data={data} games={games} mode="tough" />
          </section>

          <div className="border-t border-border pt-5 text-[10px] leading-5 text-muted-foreground">
            Data through {dataThroughLabel(data)} ({data.meta.gamesSampled}{" "}
            completed games). Source · {data.meta.source}.
          </div>
        </div>
      </main>
    </AppShell>
  );
}
