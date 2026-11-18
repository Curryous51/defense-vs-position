import { AppShell } from "@/components/AppShell";
import { MatchupBoard } from "@/components/MatchupBoard";
import { TeamBadge } from "@/components/TeamBadge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDvpSnapshot, useNow } from "@/hooks/use-dvp-snapshot";
import {
  dataThroughLabel,
  gameLongDate,
  gameTime,
  groupedMatchups,
  matchupShort,
  teamById,
  upcomingMatchups,
} from "@/lib/dvp";
import { useMemo, useState } from "react";

const LEGEND = [
  { className: "bg-match-tough-strong", label: "Toughest" },
  { className: "bg-match-tough", label: "" },
  { className: "bg-match-neutral", label: "Neutral" },
  { className: "bg-match-favorable", label: "" },
  { className: "bg-match-favorable-strong", label: "Softest" },
];

export default function Dashboard() {
  const { data } = useDvpSnapshot();
  const now = useNow();
  const matchups = useMemo(() => upcomingMatchups(data, now), [data, now]);
  const groups = useMemo(() => groupedMatchups(matchups), [matchups]);
  const [gameId, setGameId] = useState<string | null>(null);
  const game = useMemo(
    () => matchups.find((g) => g.id === gameId) ?? matchups[0],
    [matchups, gameId],
  );

  if (!game) {
    return (
      <AppShell season={data.meta.season}>
        <main className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Season {data.meta.season}
          </p>
          <h1 className="text-xl font-medium tracking-[-0.01em]">
            No games left on the board
          </h1>
          <p className="max-w-sm text-sm leading-6 text-muted-foreground">
            Finished games drop off automatically. The next slate appears after
            the daily sync.
          </p>
        </main>
      </AppShell>
    );
  }

  const away = teamById(data, game.away);
  const home = teamById(data, game.home);

  return (
    <AppShell season={data.meta.season}>
      <main className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        <div className="flex flex-col gap-8">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Defense vs position
            </p>
            <h1 className="mt-3 text-3xl font-medium tracking-[-0.02em] sm:text-4xl">
              Matchup board
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
              Each cell is a starter&apos;s season average. The rank beneath it is
              where the opposing defense sits in that category against his
              position.
            </p>
          </div>

          <div className="flex flex-col gap-4 border-y border-border py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              {away && home ? (
                <div className="flex items-center gap-2">
                  <TeamBadge team={away} className="size-7" />
                  <span className="text-[11px] text-muted-foreground">at</span>
                  <TeamBadge team={home} className="size-7" />
                </div>
              ) : null}
              <div>
                <p className="text-[13px] font-medium leading-tight">
                  {gameLongDate(game.date)}
                </p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  {gameTime(game.date)} · {data.meta.gamesSampled} games read ·
                  synced daily
                </p>
              </div>
            </div>

            <label className="flex w-full flex-col gap-1.5 sm:w-[19rem]">
              <span className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                Upcoming games
              </span>
              <Select value={game.id} onValueChange={setGameId}>
                <SelectTrigger className="h-9 w-full rounded-[3px] border-border bg-background text-[13px] shadow-none focus-visible:ring-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent
                  align="end"
                  position="popper"
                  className="max-h-[22rem] rounded-[3px]"
                >
                  {groups.map((group) => (
                    <SelectGroup key={group.day}>
                      <SelectLabel className="text-[9px] uppercase tracking-[0.16em]">
                        {group.day}
                      </SelectLabel>
                      {group.games.map((option) => (
                        <SelectItem
                          key={option.id}
                          value={option.id}
                          className="text-[13px]"
                        >
                          {matchupShort(data, option)} · {gameTime(option.date)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>

          <MatchupBoard game={game} data={data} />

          <div className="flex flex-col gap-6 border-t border-border pt-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-md text-[11px] leading-5 text-muted-foreground">
              Values are per-game averages for each team&apos;s most-used starter
              at the position. Ranks are 1–30 among defenses: 1st allows the
              fewest, 30th the most. Data through {dataThroughLabel(data)} (
              {data.meta.gamesSampled} completed games).
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                {LEGEND.map((tone) => (
                  <span
                    key={tone.className}
                    className={`h-4 w-7 rounded-[2px] ${tone.className}`}
                    title={tone.label || undefined}
                  />
                ))}
              </div>
              <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Tough → soft matchup
              </span>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-5 py-6 text-[10px] uppercase tracking-[0.14em] text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span>Source · {data.meta.source}</span>
          <span>Season {data.meta.season}</span>
        </div>
      </footer>
    </AppShell>
  );
}
