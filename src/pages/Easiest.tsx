import { AppShell } from "@/components/AppShell";
import { cn } from "@/lib/utils";
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
  topEasiestByPosition,
} from "@/lib/dvp";
import { useMemo, useState } from "react";

type PositionTab = "all" | typeof POSITIONS[number];

export default function Easiest() {
  const { data } = useDvpSnapshot();
  const now = useNow();
  const games = useMemo(() => slateGames(data, now), [data, now]);
  const byPosition = useMemo(
    () => topEasiestByPosition(data, games),
    [data, games],
  );

  const [tab, setTab] = useState<PositionTab>("all");

  const tabs: Array<{ key: PositionTab; label: string; short: string }> = [
    { key: "all", label: "All", short: "ALL" },
    ...POSITIONS.map((p) => ({ key: p, label: POSITION_NAMES[p], short: p })),
  ];

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

  function tabButton({ key, short, label }: typeof tabs[number]) {
    const active = key === tab;
    return (
      <button
        key={key}
        type="button"
        onClick={() => setTab(key)}
        title={label}
        className={`
          min-w-[4.4rem] shrink-0 rounded-[5px]
          border border-current/15 text-[11px] font-medium tracking-[0.1em]
          transition-colors
          ${active
            ? "border-foreground bg-foreground text-background"
            : "border-border/70 text-muted-foreground hover:border-foreground/30 hover:text-foreground"}
        `}
      >
        {short === "ALL" ? (
          <span className="flex flex-col items-center gap-0.5 leading-none">
            <span className={cn("text-[13px] leading-none", active ? "text-background" : "")}>
              {short}
            </span>
            <span className="text-[8px] opacity-75 uppercase tracking-[0.14em]">
              all
            </span>
          </span>
        ) : (
          <span className="flex flex-col items-center gap-0.5 leading-none">
            <span className="text-[13px] leading-none">{short}</span>
            <span className="text-[8px] opacity-75 uppercase tracking-[0.14em]">
              {short[0]}
            </span>
          </span>
        )}
      </button>
    );
  }
  const shown = (key: PositionTab) =>
    key === "all"
      ? POSITIONS
      : [key];

  return (
    <AppShell season={data.meta.season}>
      <main className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
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

          {/* Position tab strip — horizontal PG / SG / SF / PF / C + All */}
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <span className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              Position
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setTab(tab.key)}
                  title={tab.label}
                  className={`inline-flex min-w-[2.75rem] items-center gap-1 rounded-[6px] px-3 py-1.5 text-[12px] font-medium tracking-[0.06em] transition-colors border ${
                    tab.key === tab
                      ? "border-foreground/30 bg-muted text-foreground"
                      : "border-transparent text-muted-foreground hover:border-foreground/25 hover:text-foreground"
                  }`}
                >
                  {tab.short === "ALL" ? (
                    <span className="flex flex-col leading-none">
                      <span className="text-[13px] leading-none">ALL</span>
                      <span className="text-[8px] opacity-70 uppercase tracking-[0.14em]">
                        all
                      </span>
                    </span>
                  ) : (
                    <span className="flex flex-col leading-none">
                      <span className="text-[13px] leading-none">{tab.short}</span>
                      <span className="text-[8px] opacity-70 uppercase tracking-[0.14em]">
                        {tab.short[0]}
                      </span>
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Top 5 by position — one card per position, always stacked */}
          <section className="mt-6 border-t border-border pt-7">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <h2 className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Top 5 by position
              </h2>
              <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {games.length} games · whole slate
              </span>
            </div>
            <p className="mt-2 max-w-2xl text-[12px] leading-6 text-muted-foreground">
              Every category, split by position — the five softest defenses each
              offense can face on this slate.
            </p>

            <div className="mt-5 flex flex-col gap-6">
              {shown(tab).map((position) => (
                <div key={position}>
                  <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3">
                    <h3 className="text-[13px] font-medium">
                      <span className="text-foreground">{position}</span>
                      <span className="mx-2 text-muted-foreground/50">/</span>
                      <span className="text-foreground/85">
                        {POSITION_NAMES[position]}
                      </span>
                    </h3>
                    <span className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      Top 5 per category
                    </span>
                  </div>
                  <div className="mt-4 grid gap-x-8 gap-y-8 sm:grid-cols-2 xl:grid-cols-4">
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
          </section>

          {/* Game-by-game quick read */}
          <section className="mt-8 border-t border-border pt-8">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
              <h2 className="text-[12px] uppercase tracking-[0.18em] text-foreground">
                Game by game
              </h2>
              <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                Quick read · three per offense
              </span>
            </div>
            <p className="mt-3 max-w-2xl text-[13px] leading-6 text-muted-foreground">
              The three friendliest spots each offense walks into tonight, one
              per position.
            </p>
            <GameReadCards data={data} games={games} mode="soft" />
          </section>

          <div className="mt-5 border-t border-border pt-5 text-[10px] leading-5 text-muted-foreground">
            Data through {dataThroughLabel(data)} ({data.meta.gamesSampled}{"\u00a0"}
            completed games). Source · {data.meta.source}.
          </div>
        </div>
      </main>
    </AppShell>
  );
}
