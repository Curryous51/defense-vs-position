import {
  gameTime,
  matchupShort,
  rankTone,
  type EasyMatchup,
  type Snapshot,
} from "@/lib/dvp";
import { cn } from "@/lib/utils";

/** One category of the per-position top-5 lists. */
export function CategoryColumn({
  label,
  entries,
  data,
}: {
  label: string;
  entries: EasyMatchup[];
  data: Snapshot;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between border-b border-border pb-2">
        <h4 className="text-[12px] font-medium">{label}</h4>
        <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
          Allows / gm
        </span>
      </div>
      <ol className="divide-y divide-border/70">
        {entries.map((entry) => {
          const onDark = entry.rank <= 6 || entry.rank > 24;
          return (
            <li
              key={`${entry.game.id}-${entry.offense.id}`}
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
                  vs {entry.defense.abbr}
                </p>
                <p className="mt-1 truncate text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                  {matchupShort(data, entry.game)} · {gameTime(entry.game.date)}
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
  );
}
