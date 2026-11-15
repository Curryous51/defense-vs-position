import type { Team } from "@/lib/dvp";
import { cn } from "@/lib/utils";

export function TeamBadge({
  team,
  className,
}: {
  team: Team;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-[3px] border border-border text-[10px] font-semibold tracking-[0.06em] text-foreground",
        className,
      )}
    >
      {team.abbr}
    </span>
  );
}
