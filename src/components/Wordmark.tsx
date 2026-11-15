import { cn } from "@/lib/utils";
import { Link } from "react-router";

export function Wordmark({
  className,
  to = "/",
  withLabel = true,
}: {
  className?: string;
  to?: string;
  withLabel?: boolean;
}) {
  return (
    <Link
      to={to}
      className={cn("group inline-flex items-baseline gap-2.5", className)}
    >
      <span className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
        DvP
      </span>
      {withLabel ? (
        <span className="hidden text-[10px] uppercase tracking-[0.2em] text-muted-foreground sm:inline">
          Defense vs position
        </span>
      ) : null}
    </Link>
  );
}
