import { MatchupPanel } from "@/components/MatchupPanel";
import {
  startersFor,
  teamById,
  type Matchup,
  type Snapshot,
} from "@/lib/dvp";
import { cn } from "@/lib/utils";

/** The two-team board: away starters vs home defense, and the reverse. */
export function MatchupBoard({
  game,
  data,
  className,
}: {
  game: Matchup;
  data: Snapshot;
  className?: string;
}) {
  const away = teamById(data, game.away);
  const home = teamById(data, game.home);

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
        starters={startersFor(data, away.id)}
      />
      <MatchupPanel
        offense={home}
        defense={away}
        starters={startersFor(data, home.id)}
      />
    </div>
  );
}
