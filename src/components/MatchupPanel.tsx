import { TeamBadge } from "@/components/TeamBadge";
import {
  STATS,
  STAT_LABELS,
  formatStat,
  ordinal,
  rankTone,
  type Starter,
  type Team,
} from "@/lib/dvp";
import { cn } from "@/lib/utils";

/**
 * One half of the board: a team's starters on the left, the opposing defense's
 * ranks for each stat across the top. Values are the starter's season average;
 * the small number below is where the opponent ranks at defending that position.
 */
export function MatchupPanel({
  offense,
  defense,
  starters,
  className,
}: {
  offense: Team;
  defense: Team;
  starters: Starter[];
  className?: string;
}) {
  return (
    <section className={cn("px-4 py-6 sm:px-7 sm:py-7", className)}>
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <TeamBadge team={offense} />
          <div>
            <h3 className="text-[13px] font-medium leading-tight text-foreground">
              {offense.nickname} starters
            </h3>
            <p className="mt-1.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              vs {defense.nickname} D
            </p>
          </div>
        </div>
        <span className="pt-0.5 text-[10px] tabular-nums tracking-[0.1em] text-muted-foreground">
          {offense.games} G
        </span>
      </header>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[420px] table-fixed border-separate border-spacing-0">
          <colgroup>
            <col className="w-8" />
            <col />
            <col className="w-[3.5rem] sm:w-[4.25rem]" />
            <col className="w-[3.5rem] sm:w-[4.25rem]" />
            <col className="w-[3.5rem] sm:w-[4.25rem]" />
            <col className="w-[3.5rem] sm:w-[4.25rem]" />
          </colgroup>
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              <th scope="col" className="pb-2.5 text-left font-medium">
                Pos
              </th>
              <th scope="col" className="pb-2.5 pl-1 text-left font-medium">
                Player
              </th>
              {STATS.map((stat) => (
                <th
                  key={stat}
                  scope="col"
                  className="pb-2.5 pr-2 text-right font-medium"
                >
                  {STAT_LABELS[stat]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {starters.map((player) => {
              const defenseRow = defense.season[player.slot];
              return (
                <tr key={`${player.slot}-${player.id}`}>
                  <td className="border-t border-border/80 py-2 align-middle text-[10px] font-medium tracking-[0.08em] text-muted-foreground">
                    {player.slot}
                  </td>
                  <td className="max-w-0 border-t border-border/80 py-2 pl-1 pr-2 align-middle">
                    <span className="block truncate text-sm leading-tight font-medium text-foreground">
                      {player.name}
                    </span>
                  </td>
                  {STATS.map((stat) => {
                    const rank = defenseRow.ranks[stat];
                    // The extreme tiers are dark red / dark green, so they need light text.
                    const onDark = rank <= 6 || rank > 24;
                    return (
                      <td
                        key={stat}
                        className="border-t border-border/80 py-1.5 pl-1 align-middle"
                      >
                        <div
                          className={cn(
                            "rounded-[3px] px-1.5 py-1.5 text-right sm:px-2",
                            rankTone(rank),
                          )}
                        >
                          <div
                            className={cn(
                              "text-[13px] leading-none font-medium tabular-nums",
                              onDark ? "text-white" : "text-foreground",
                            )}
                          >
                            {formatStat(player[stat])}
                          </div>
                          <div
                            className={cn(
                              "mt-1 text-[10px] leading-none tabular-nums",
                              onDark ? "text-white/75" : "text-muted-foreground",
                            )}
                          >
                            {ordinal(rank)}
                          </div>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
