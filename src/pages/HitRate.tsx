import { AppShell } from "@/components/AppShell";
import { useDvpSnapshot } from "@/hooks/use-dvp-snapshot";
import { useHitRateBoard } from "@/hooks/use-hit-rate-board";
import {
  CATEGORY_LABELS,
  STATS,
  dataThroughLabel,
  gameTime,
  teamById,
  type StatKey,
} from "@/lib/dvp";
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

const SORTS = ["l10", "l5", "h2h"] as const;
type SortKey = (typeof SORTS)[number];

const SORT_LABELS: Record<SortKey, string> = {
  l10: "L10",
  l5: "L5",
  h2h: "H2H",
};

function slateLabel(date: string | null): string {
  if (!date) return "No slate";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

function rate(row: HitRateRow, key: SortKey): number {
  const sample = row[key];
  return sample.n ? sample.hits / sample.n : -1;
}

function Strip({ row }: { row: HitRateRow }) {
  return (
    <div className="flex items-end gap-[3px]">
      {row.strip.map((outcome, index) => (
        <span
          key={index}
          className={cn(
            "h-4 w-[5px] rounded-[1px]",
            outcome === true
              ? "bg-match-favorable-strong"
              : outcome === false
                ? "bg-match-tough-strong"
                : "bg-border",
          )}
          title={
            outcome === true ? "Over" : outcome === false ? "Under" : "Push"
          }
        />
      ))}
    </div>
  );
}

function Sample({
  value,
  className,
}: {
  value: { hits: number; n: number };
  className?: string;
}) {
  return (
    <div className="flex flex-col">
      <span className={cn("text-[12px] tabular-nums", hitRateTone(value), className)}>
        {hitRateLabel(value)}
      </span>
      <span className="text-[9px] tabular-nums text-muted-foreground">
        {value.n ? `${value.hits}/${value.n}` : "—"}
      </span>
    </div>
  );
}

export default function HitRate() {
  const { data: snapshot } = useDvpSnapshot();
  const { data: board, live } = useHitRateBoard();
  const [stat, setStat] = useState<StatKey | "all">("all");
  const [query, setQuery] = useState("");
  const [hideOut, setHideOut] = useState(true);
  const [sort, setSort] = useState<SortKey>("l10");

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = board.rows.filter((row) => {
      if (stat !== "all" && row.stat !== stat) return false;
      if (hideOut && row.injuryStatus === "Out") return false;
      if (!needle) return true;
      const team = teamById(snapshot, row.teamId);
      const opponent = teamById(snapshot, row.opponentId);
      return [
        row.name,
        team?.abbr,
        team?.nickname,
        opponent?.abbr,
        row.position,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(needle));
    });
    return [...filtered].sort(
      (a, b) =>
        rate(b, sort) - rate(a, sort) ||
        b[sort].n - a[sort].n ||
        a.name.localeCompare(b.name),
    );
  }, [board.rows, hideOut, query, snapshot, sort, stat]);

  const players = new Set(rows.map((row) => row.playerId)).size;

  return (
    <AppShell season={snapshot.meta.season}>
      <main className="mx-auto w-full max-w-[86rem] px-5 py-10 sm:px-8 sm:py-12">
        <div className="flex flex-col gap-6">
          <div>
            <div className="flex items-center gap-3">
              <span className="h-px w-8 bg-foreground/30" />
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Slate · {slateLabel(board.meta.slateDate)}
              </p>
            </div>
            <h1 className="mt-4 text-3xl font-medium tracking-[-0.02em] sm:text-4xl">
              Hit rate dashboard
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Every prop on tonight's board, graded against today's line over the
              last five and ten games, head to head against the opponent, and
              against that defense's position rank.
            </p>
          </div>

          <div className="flex flex-col gap-4 border-y border-border py-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setStat("all")}
                className={cn(
                  "rounded-[3px] border px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] transition-colors",
                  stat === "all"
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                All
              </button>
              {STATS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStat(key)}
                  className={cn(
                    "rounded-[3px] border px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] transition-colors",
                    stat === key
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {CATEGORY_LABELS[key]}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search players or teams"
                className="h-8 w-52 rounded-[3px] border border-border bg-transparent px-2.5 text-[12px] outline-none placeholder:text-muted-foreground focus:border-foreground/40"
              />
              <button
                type="button"
                onClick={() => setHideOut((value) => !value)}
                className={cn(
                  "h-8 rounded-[3px] border px-2.5 text-[10px] uppercase tracking-[0.12em] transition-colors",
                  hideOut
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                Hide out
              </button>
              <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {rows.length} props · {players} players
              </span>
            </div>
          </div>

          <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
            <div className="min-w-[780px]">
              <div className="grid grid-cols-[minmax(0,1fr)_7.5rem_8rem_3.5rem_3.5rem_3.5rem_4.5rem_3.5rem] items-center gap-3 border-b border-border pb-2 text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                <span>Player</span>
                <span>Line</span>
                <span>L10 games</span>
                {SORTS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSort(key)}
                    className={cn(
                      "text-left uppercase tracking-[0.14em] transition-colors hover:text-foreground",
                      sort === key && "text-foreground",
                    )}
                  >
                    {SORT_LABELS[key]}
                  </button>
                ))}
                <span>Matchup</span>
                <span>DvP</span>
              </div>

              <div className="divide-y divide-border/70">
                {rows.map((row) => {
                  const team = teamById(snapshot, row.teamId);
                  const opponent = teamById(snapshot, row.opponentId);
                  return (
                    <div
                      key={`${row.playerId}-${row.stat}`}
                      className="grid grid-cols-[minmax(0,1fr)_7.5rem_8rem_3.5rem_3.5rem_3.5rem_4.5rem_3.5rem] items-center gap-3 py-2.5 transition-colors hover:bg-accent/40"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="inline-flex h-6 w-9 shrink-0 items-center justify-center rounded-[3px] border border-border text-[9px] font-semibold tracking-[0.06em] text-muted-foreground">
                          {team?.abbr ?? "—"}
                        </span>
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 truncate text-[12px] font-medium leading-tight">
                            {row.name}
                            {row.injuryStatus ? (
                              <span
                                className={cn(
                                  "rounded-[2px] px-1 py-px text-[8px] uppercase tracking-[0.08em]",
                                  row.injuryStatus === "Out"
                                    ? "bg-match-tough-strong text-white"
                                    : "bg-match-tough/30 text-foreground",
                                )}
                              >
                                {row.injuryStatus === "Day-To-Day"
                                  ? "DTD"
                                  : row.injuryStatus}
                              </span>
                            ) : null}
                          </p>
                          <p className="mt-0.5 truncate text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                            {team?.abbr ?? "—"} vs {opponent?.abbr ?? "—"} ·{" "}
                            {row.position} · {CATEGORY_LABELS[row.stat]} ·{" "}
                            {gameTime(row.tipoff)}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col">
                        <span className="text-[12px] font-medium tabular-nums">
                          {row.line}
                        </span>
                        <span className="text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                          {CATEGORY_LABELS[row.stat].slice(0, 3)} ·{" "}
                          {priceLabel(row.overPrice)}
                        </span>
                      </div>

                      <Strip row={row} />

                      <Sample value={row.l5} />
                      <Sample value={row.l10} />
                      <Sample value={row.h2h} />

                      <span
                        className={cn(
                          "inline-flex h-6 min-w-6 items-center justify-center rounded-[3px] px-1 text-[10px] font-medium",
                          gradeTone(row.rank) === "soft"
                            ? "bg-match-favorable-strong text-white"
                            : gradeTone(row.rank) === "tough"
                              ? "bg-match-tough-strong text-white"
                              : "bg-match-neutral text-foreground",
                        )}
                      >
                        {matchupGrade(row.rank)}
                      </span>

                      <span className="text-[10px] tabular-nums text-muted-foreground">
                        #{row.rank}
                      </span>
                    </div>
                  );
                })}
              </div>

              {!rows.length ? (
                <p className="py-16 text-center text-[12px] text-muted-foreground">
                  No props match those filters.
                </p>
              ) : null}
            </div>
          </div>

          <div className="border-t border-border pt-5 text-[10px] leading-5 text-muted-foreground">
            L5 and L10 count every completed game against today's line; pushes
            are dropped from the sample. H2H is this season against tonight's
            opponent. Matchup grade comes from the opponent's defense-vs-position
            rank (30 = softest, 1 = toughest). Lines are a consensus of the
            major books.{" "}
            {live ? "Live board" : "Snapshot"} · data through{" "}
            {dataThroughLabel(snapshot)} · {board.meta.source}.
          </div>
        </div>
      </main>
    </AppShell>
  );
}
