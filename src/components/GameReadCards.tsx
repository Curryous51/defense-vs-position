import { TeamBadge } from "@/components/TeamBadge";
import {
  gameQuickReads,
  gameTime,
  gameToughReads,
  matchupShort,
  rankTone,
  softReadLabel,
  toughReadLabel,
  type Matchup,
  type Snapshot,
} from "@/lib/dvp";
import { cn } from "@/lib/utils";

/**
 * The game-by-game cards. Soft mode reads the friendliest spot per position,
 * tough mode reads the stingiest one.
 */
export function GameReadCards({
  data,
  games,
  mode,
}: {
  data: Snapshot;
  games: Matchup[];
  mode: "soft" | "tough";
}) {
  const readFor = mode === "soft" ? gameQuickReads : gameToughReads;
  const labelFor = mode === "soft" ? softReadLabel : toughReadLabel;

  return (
    <div className="mt-8 grid gap-5 xl:grid-cols-2">
      {games.map((game) => {
        const sides = readFor(data, game);
        return (
          <article key={game.id} className="border border-border">
            <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <span className="text-[13px] font-medium tracking-[0.02em]">
                {matchupShort(data, game)}
              </span>
              <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {gameTime(game.date)}
              </span>
            </header>
            <div className="grid divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
              {sides.map((side) => (
                <section
                  key={side.defense.id}
                  className="flex flex-col px-4 py-5"
                >
                  <header className="flex items-start gap-3">
                    <TeamBadge team={side.defense} className="size-8" />
                    <div>
                      <h3 className="text-[14px] font-medium leading-tight">
                        {side.defense.nickname} defense allows
                      </h3>
                      <p className="mt-1.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                        what {side.offense.abbr} sees · {side.offense.games}{" "}
                        games
                      </p>
                    </div>
                  </header>

                  <div className="mt-4 border border-border bg-card/40 px-3.5 py-3">
                    <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          mode === "soft"
                            ? "bg-match-favorable-strong"
                            : "bg-match-tough-strong",
                        )}
                      />
                      {mode === "soft" ? "Quick read" : "Tough read"}
                    </p>
                    <ul className="mt-3 flex flex-col gap-2">
                      {side.reads.map((read) => {
                        const onDark = read.rank <= 6 || read.rank > 24;
                        return (
                          <li
                            key={`${read.position}-${read.stat}`}
                            className="flex items-start gap-2.5 text-[13px] leading-snug"
                          >
                            <span
                              className={cn(
                                "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[3px] text-[10px] font-medium tabular-nums",
                                rankTone(read.rank),
                                onDark ? "text-white" : "text-foreground",
                              )}
                            >
                              {read.rank}
                            </span>
                            <span className="min-w-0 text-foreground">
                              {labelFor(read)}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </section>
              ))}
            </div>
          </article>
        );
      })}
    </div>
  );
}
