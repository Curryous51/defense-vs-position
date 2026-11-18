import { AppShell } from "@/components/AppShell";
import { TeamBadge } from "@/components/TeamBadge";
import { useDvpSnapshot, useNow } from "@/hooks/use-dvp-snapshot";
import {
  CATEGORY_LABELS,
  STATS,
  dataThroughLabel,
  gameLongDate,
  gameQuickReads,
  gameTime,
  matchupShort,
  ordinal,
  rankTone,
  slateGames,
  softReadLabel,
  topEasiestByCategory,
} from "@/lib/dvp";
import { cn } from "@/lib/utils";
import { useMemo } from "react";

export default function Easiest() {
  const { data } = useDvpSnapshot();
  const now = useNow();
  const games = useMemo(() => slateGames(data, now), [data, now]);
  const categories = useMemo(
    () => topEasiestByCategory(data, games),
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
            Finished games drop off automatically. The next day of basketball
            appears after the daily sync.
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
              Easiest matchups
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
              The friendliest spots on the whole slate, read from what every
              defense gives up to each position. Rank 1 allows the fewest, 30
              the most.
            </p>
          </div>

          <section className="border-t border-border pt-8">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
              <h2 className="text-[11px] uppercase tracking-[0.18em] text-foreground">
                Top 5 by category
              </h2>
              <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {games.length} games · whole slate
              </span>
            </div>
            <p className="mt-3 max-w-2xl text-[12px] leading-6 text-muted-foreground">
              Every position on every team, sorted by the most generous defense
              in that category.
            </p>

            <div className="mt-8 grid gap-x-10 gap-y-10 sm:grid-cols-2 xl:grid-cols-4">
              {STATS.map((stat) => (
                <div key={stat}>
                  <div className="flex items-baseline justify-between border-b border-border pb-2">
                    <h3 className="text-[13px] font-medium">
                      {CATEGORY_LABELS[stat]}
                    </h3>
                    <span className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                      Rank
                    </span>
                  </div>
                  <ol className="divide-y divide-border/70">
                    {categories[stat].map((entry) => {
                      const onDark = entry.rank <= 6 || entry.rank > 24;
                      return (
                        <li
                          key={`${entry.game.id}-${entry.offense.id}-${entry.position}`}
                          className="flex items-start gap-2.5 py-2.5"
                        >
                          <span
                            className={cn(
                              "mt-px inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[3px] text-[10px] font-medium tabular-nums",
                              rankTone(entry.rank),
                              onDark ? "text-white" : "text-foreground",
                            )}
                          >
                            {entry.rank}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[12px] font-medium leading-tight">
                              {entry.position} vs {entry.defense.abbr}
                            </p>
                            <p className="mt-1 truncate text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                              {matchupShort(data, entry.game)} ·{" "}
                              {gameTime(entry.game.date)}
                            </p>
                          </div>
                          <span className="pt-0.5 text-[11px] tabular-nums text-muted-foreground">
                            {entry.allowed.toFixed(1)}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ))}
            </div>
          </section>

          <section className="border-t border-border pt-8">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
              <h2 className="text-[11px] uppercase tracking-[0.18em] text-foreground">
                Game by game
              </h2>
              <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Quick read · three per offense
              </span>
            </div>
            <p className="mt-3 max-w-2xl text-[12px] leading-6 text-muted-foreground">
              The three softest spots each offense walks into tonight, one per
              position.
            </p>

            <div className="mt-8 grid gap-5 xl:grid-cols-2">
              {games.map((game) => {
                const sides = gameQuickReads(data, game);
                return (
                  <article key={game.id} className="border border-border">
                    <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
                      <span className="text-[11px] font-medium tracking-[0.02em]">
                        {matchupShort(data, game)}
                      </span>
                      <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                        {gameTime(game.date)}
                      </span>
                    </header>
                    <div className="grid divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                      {sides.map((side) => (
                        <section
                          key={side.defense.id}
                          className="flex flex-col px-4 py-4"
                        >
                          <header className="flex items-start gap-2.5">
                            <TeamBadge
                              team={side.defense}
                              className="size-7 text-[9px]"
                            />
                            <div>
                              <h3 className="text-[12px] font-medium leading-tight">
                                {side.defense.nickname} defense allows
                              </h3>
                              <p className="mt-1 text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                                what {side.offense.abbr} sees ·{" "}
                                {side.offense.games} games
                              </p>
                            </div>
                          </header>

                          <div className="mt-3.5 border border-white/10 bg-match-favorable-strong px-3 py-2.5">
                            <p className="flex items-center gap-1.5 text-[8px] uppercase tracking-[0.2em] text-white/60">
                              <span className="size-1.5 rounded-full bg-emerald-400" />
                              Quick read
                            </p>
                            <ul className="mt-2 flex flex-col gap-1.5">
                              {side.reads.map((read) => (
                                <li
                                  key={`${read.position}-${read.stat}`}
                                  className="flex items-center gap-2 text-[11px] leading-tight text-white/85"
                                >
                                  <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-[2px] border border-white/20 bg-white/5 px-1 text-[9px] tabular-nums text-white">
                                    {read.rank}
                                  </span>
                                  <span className="min-w-0">
                                    <span className="text-white">
                                      {softReadLabel(read)}
                                    </span>
                                    <span className="text-white/55">
                                      , {ordinal(read.rank)} of 30
                                    </span>
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </section>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
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
