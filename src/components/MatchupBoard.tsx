import { MatchupPanel } from "@/components/MatchupPanel";
import { startersFor, teamById, type Matchup } from "@/lib/dvp";
import { cn } from "@/lib/utils";

/** The two-team board: away starters vs home defense, and the reverse. */
export function MatchupBoard({
  game,
  className,
}: {
  game: Matchup;
  className?: string;
}) {
  const away = teamById(game.away);
  const home = teamById(game.home);

  if (!away || !home) {
    return (
      <div className="border border-border p-8 text-sm text-muted-foreground">
        Matchup unavailable.
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid divide-y divide-border border border-border bg-background lg:grid-cols-2 lg:divide-x lg:divide-y-0",
        className,
      )}
    >
      <MatchupPanel
        offense={away}
        defense={home}
        starters={startersFor(away.id)}
      />
      <MatchupPanel
        offense={home}
        defense={away}
        starters={startersFor(home.id)}
      />
    </div>
  );
}
