import { MatchupBoard } from "@/components/MatchupBoard";
import { Wordmark } from "@/components/Wordmark";
import { Button } from "@/components/ui/button";
import { useDvpSnapshot, useNow } from "@/hooks/use-dvp-snapshot";
import {
  dataThroughLabel,
  gameDay,
  gameTime,
  matchupTitle,
  upcomingMatchups,
} from "@/lib/dvp";
import { motion } from "framer-motion";
import { useMemo } from "react";
import { Link } from "react-router";

const ENTRY = "/dashboard";

const PRINCIPLES = [
  {
    number: "01",
    title: "Updated every morning",
    body: "The defense-vs-position table is pulled from FantasyPros and paired with the starters ESPN and Sleeper report, so last night's games are already counted.",
  },
  {
    number: "02",
    title: "Ranked 1 to 30",
    body: "Each defense is ranked in points, rebounds, assists and threes allowed per position. A 29th next to a category is a spot worth attacking.",
  },
  {
    number: "03",
    title: "Starters, not guesswork",
    body: "Each row is the team's most-used starter at that position, so the player you see is the player the defense actually has to guard.",
  },
];

const LEGEND = [
  { className: "bg-match-tough-strong", label: "Toughest" },
  { className: "bg-match-tough", label: "" },
  { className: "bg-match-neutral", label: "Neutral" },
  { className: "bg-match-favorable", label: "" },
  { className: "bg-match-favorable-strong", label: "Softest" },
];

export default function Landing() {
  const { data } = useDvpSnapshot();
  const now = useNow();
  const featured = useMemo(
    () => upcomingMatchups(data, now)[0],
    [data, now],
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
          <Wordmark />
          <div className="flex items-center gap-3 sm:gap-5">
            <Link
              to="/easiest"
              className="hidden text-[11px] text-muted-foreground transition-colors hover:text-foreground md:inline"
            >
              Easiest matchups
            </Link>
            <span className="hidden text-[10px] uppercase tracking-[0.18em] text-muted-foreground sm:inline">
              Season {data.meta.season}
            </span>
            <Button
              asChild
              size="sm"
              className="rounded-[3px] px-3.5 text-[12px] shadow-none"
            >
              <Link to={ENTRY}>Open the board</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto w-full max-w-6xl px-5 pb-16 pt-16 sm:px-8 sm:pb-24 sm:pt-24">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="max-w-3xl"
          >
            <div className="flex items-center gap-3">
              <span className="h-px w-8 bg-foreground/30" />
              <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                NBA · Defense vs position
              </p>
            </div>
            <h1 className="mt-7 text-balance text-[2.5rem] font-medium leading-[1.02] tracking-[-0.035em] sm:text-[3.75rem]">
              Every defense has a
              <br className="hidden sm:block" /> position it can&apos;t guard.
            </h1>
            <p className="mt-7 max-w-xl text-[15px] leading-7 text-muted-foreground">
              A daily board of what all 30 defenses give up to every position,
              ranked across points, rebounds, assists and threes. Read the
              matchup before you set the lineup.
            </p>
            <div className="mt-9 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <Button
                asChild
                className="h-10 rounded-[3px] px-5 text-[13px] shadow-none"
              >
                <Link to={ENTRY}>Open tonight&apos;s board</Link>
              </Button>
              <a
                href="#method"
                className="text-[12px] uppercase tracking-[0.16em] text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
              >
                How the board is built
              </a>
            </div>
          </motion.div>
        </section>

        <section className="border-y border-border">
          <dl className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-px bg-border sm:grid-cols-4">
            {[
              { value: data.meta.gamesSampled, label: "Games read" },
              { value: 30, label: "Defenses" },
              { value: 5, label: "Positions" },
              { value: 4, label: "Categories" },
            ].map((item) => (
              <div
                key={item.label}
                className="bg-background px-5 py-6 sm:px-8 sm:py-7"
              >
                <dt className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                  {item.label}
                </dt>
                <dd className="mt-2 text-2xl font-medium tabular-nums tracking-[-0.02em]">
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {featured ? (
          <section className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Tonight&apos;s board
                </p>
                <h2 className="mt-3 text-xl font-medium tracking-[-0.02em] sm:text-2xl">
                  {matchupTitle(data, featured)}
                </h2>
              </div>
              <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                {gameDay(featured.date)} · {gameTime(featured.date)}
              </p>
            </div>
            <MatchupBoard game={featured} data={data} className="mt-8" />
            <p className="mt-4 max-w-2xl text-[11px] leading-5 text-muted-foreground">
              Each figure is a starter&apos;s season average. The small rank
              beneath it is where the opposing defense sits in that category
              against that position — 1st allows the fewest, 30th the most.
              Season through {dataThroughLabel(data)}. Games leave the picker at
              tip-off.
            </p>
          </section>
        ) : null}

        <section
          id="method"
          className="border-t border-border bg-card/40 px-5 py-16 sm:px-8 sm:py-20"
        >
          <div className="mx-auto w-full max-w-6xl">
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Method
            </p>
            <h2 className="mt-3 max-w-2xl text-balance text-2xl font-medium leading-snug tracking-[-0.02em] sm:text-3xl">
              One board, built from what actually happened on the floor.
            </h2>
            <div className="mt-12 grid gap-10 border-t border-border pt-10 sm:grid-cols-3 sm:gap-12">
              {PRINCIPLES.map((item) => (
                <div key={item.number}>
                  <span className="text-[10px] tabular-nums tracking-[0.18em] text-muted-foreground">
                    {item.number}
                  </span>
                  <h3 className="mt-3 text-[15px] font-medium tracking-[-0.01em]">
                    {item.title}
                  </h3>
                  <p className="mt-2.5 text-[12px] leading-6 text-muted-foreground">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-12 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-1">
                {LEGEND.map((tone) => (
                  <span
                    key={tone.className}
                    className={`h-4 w-8 rounded-[2px] ${tone.className}`}
                    title={tone.label || undefined}
                  />
                ))}
              </div>
              <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                Clay · defense allows less · Sage · defense allows more
              </p>
            </div>
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-16 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-20">
            <div>
              <h2 className="max-w-md text-balance text-2xl font-medium leading-snug tracking-[-0.02em]">
                Tonight&apos;s slate is already ranked.
              </h2>
              <p className="mt-3 max-w-sm text-[12px] leading-6 text-muted-foreground">
                Open the board to compare both sides of any game on the
                schedule.
              </p>
            </div>
            <Button
              asChild
              size="lg"
              className="h-10 shrink-0 rounded-[3px] px-6 text-[13px] shadow-none"
            >
              <Link to={ENTRY}>Open the board</Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-5 py-6 text-[10px] uppercase tracking-[0.14em] text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <Wordmark withLabel={false} />
          <span>
            {data.meta.source} · through {dataThroughLabel(data)}
          </span>
        </div>
      </footer>
    </div>
  );
}
