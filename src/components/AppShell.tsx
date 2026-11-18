import { Wordmark } from "@/components/Wordmark";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { NavLink } from "react-router";

const NAV = [
  { to: "/dashboard", label: "Matchup board", hint: "Both sides of a game" },
  { to: "/easiest", label: "Easiest matchups", hint: "Top of the slate" },
  { to: "/toughest", label: "Toughest matchups", hint: "Stingiest defenses" },
];

function NavItems({ compact = false }: { compact?: boolean }) {
  return (
    <nav className={cn(compact ? "flex items-center gap-4" : "flex flex-col gap-1")}>
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            cn(
              "group transition-colors",
              compact
                ? "text-[11px] tracking-[0.04em]"
                : "flex flex-col gap-1 border-l px-3 py-2",
              compact
                ? isActive
                  ? "font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground"
                : isActive
                  ? "border-foreground bg-accent/60"
                  : "border-transparent hover:bg-accent/40",
            )
          }
        >
          {({ isActive }) => (
            <>
              <span
                className={cn(
                  compact
                    ? ""
                    : cn(
                        "text-[12px]",
                        isActive
                          ? "font-medium text-foreground"
                          : "text-muted-foreground group-hover:text-foreground",
                      ),
                )}
              >
                {item.label}
              </span>
              {compact ? null : (
                <span className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground/80">
                  {item.hint}
                </span>
              )}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

/** App chrome: a left-hand rail on desktop, a slim top bar on small screens. */
export function AppShell({
  children,
  season,
}: {
  children: ReactNode;
  season?: string;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-[92rem]">
        <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-border px-6 py-7 lg:flex">
          <Wordmark to="/dashboard" />
          <div className="mt-10">
            <p className="mb-3 px-3 text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
              Views
            </p>
            <NavItems />
          </div>
          <div className="mt-auto flex flex-col gap-1.5 border-t border-border pt-4 text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
            {season ? <span>Season {season}</span> : null}
            <span>NBA · daily sync</span>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="flex h-14 items-center justify-between gap-4 border-b border-border px-5 lg:hidden">
            <Wordmark to="/dashboard" />
            <NavItems compact />
          </header>
          {children}
        </div>
      </div>
    </div>
  );
}
