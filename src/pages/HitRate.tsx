import { AppShell } from "@/components/AppShell";
import { api } from "@/convex/_generated/api";
import { useHitRateBoard } from "@/hooks/use-hit-rate-board";
import { useLiveAction } from "@/hooks/use-live-query";
import { CATEGORY_LABELS, STATS, gameTime, type StatKey } from "@/lib/dvp";
import {
  gradeTone,
  hitRateLabel,
  hitRateTone,
  matchupGrade,
  priceLabel,
  type HitRateRow,
} from "@/lib/hit-rate";
import { LIVE_MODE } from "@/lib/live-mode";
import {
  TOKEN_URL,
  clearToken,
  saveToken,
  storedToken,
  triggerRefresh,
  waitForBoard,
} from "@/lib/static-refresh";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";

type SortKey = "player" | "line" | "l5" | "l10" | "h2h" | "matchup" | "dvp";

const COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: "player", label: "Player" },
  { key: "line", label: "Line" },
  { key: "l5", label: "L5" },
  { key: "l10", label: "L10" },
  { key: "h2h", label: "H2H" },
  { key: "matchup", label: "Matchup" },
  { key: "dvp", label: "DvP" },
];

/** First click on a column shows the most useful end of it. */
const DEFAULT_DIRECTION: Record<SortKey, "asc" | "desc"> = {
  player: "asc",
  line: "desc",
  l5: "desc",
  l10: "desc",
  h2h: "desc",
  matchup: "desc",
  dvp: "desc",
};

const GRADES = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "D", "F"] as const;

/** The slate is labelled by the IST date its games tip off on. */
function slateLabel(tipoff: string | null): string {
  if (!tipoff) return "No slate";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(tipoff));
}

function updatedLabel(iso: string): string {
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
  return `${time} IST`;
}

/** Date the stats run through, in IST. */
function throughLabel(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}

function rate(row: HitRateRow, key: "l5" | "l10" | "h2h"): number {
  const sample = row[key];
  return sample.n ? sample.hits / sample.n : -1;
}

function sortValue(row: HitRateRow, key: SortKey): number | string {
  switch (key) {
    case "player":
      return row.name;
    case "line":
      return row.line;
    case "matchup":
    case "dvp":
      return row.rank;
    default:
      return rate(row, key);
  }
}

/** Percentage 0-100, or null when a player has no games in the sample. */
function pct(sample: { hits: number; n: number }): number | null {
  return sample.n ? (sample.hits / sample.n) * 100 : null;
}

function parseBound(value: string, fallback: number): number {
  const trimmed = value.trim();
  if (trimmed === "") return fallback;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Range filter with the defaults the board asks for: empty minimum means 0%,
 * empty maximum means 100%. Rows without a sample only pass the full range.
 */
function inRange(value: number | null, min: string, max: string): boolean {
  const low = parseBound(min, 0);
  const high = parseBound(max, 100);
  if (value === null) return low <= 0 && high >= 100;
  return value >= low && value <= high;
}

function Sample({ value }: { value: { hits: number; n: number } }) {
  return (
    <div className="flex flex-col">
      <span className={cn("text-[12px] tabular-nums", hitRateTone(value))}>
        {hitRateLabel(value)}
      </span>
      <span className="text-[9px] tabular-nums text-muted-foreground">
        {value.n ? `${value.hits}/${value.n}` : "—"}
      </span>
    </div>
  );
}

/**
 * Refresh for the backend-free build: starts the GitHub data workflow, then
 * polls until the committed snapshot changes. Dispatching needs a token, which
 * the user pastes once and which stays in this browser.
 */
function StaticRefresh({
  generatedAt,
  onReload,
}: {
  generatedAt: string;
  onReload: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [askToken, setAskToken] = useState(false);
  const [draft, setDraft] = useState("");

  const run = async (token: string) => {
    setBusy(true);
    setError(null);
    setNote(null);
    setStatus("Starting the data refresh…");
    try {
      const since = Date.now();
      await triggerRefresh(token);
      const board = await waitForBoard(generatedAt, token, {
        since,
        onCheck: (seconds) =>
          setStatus(`Refreshing · ${Math.floor(seconds / 60)}m ${seconds % 60}s`),
      });
      await onReload();
      setNote(`Lines updated · ${board.meta.props} props`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      if (/token|401|403/i.test(message)) setAskToken(true);
    } finally {
      setBusy(false);
      setStatus(null);
    }
  };

  return (
    <div className="relative flex items-center gap-3">
      <button
        type="button"
        onClick={() => {
          const token = storedToken();
          if (!token) {
            setAskToken(true);
            return;
          }
          void run(token);
        }}
        disabled={busy}
        className="h-8 rounded-[3px] border border-border px-2.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
      >
        {busy ? "Refreshing…" : "Refresh lines"}
      </button>
      {status ? (
        <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {status}
        </span>
      ) : null}
      {note ? (
        <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {note}
        </span>
      ) : null}
      {error ? (
        <span className="max-w-56 text-[10px] leading-4 text-match-tough-strong">
          {error}
        </span>
      ) : null}

      {askToken ? (
        <div className="absolute right-0 top-9 z-30 w-80 border border-border bg-background p-3 shadow-sm">
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            GitHub token
          </p>
          <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">
            Refreshing a static site means starting the data workflow on GitHub.
            Create a fine-grained token for this repository with{" "}
            <span className="text-foreground">Actions: read and write</span> and{" "}
            <span className="text-foreground">Contents: read</span>, then paste it
            here. It is stored only in this browser.
          </p>
          <a
            href={TOKEN_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-1.5 inline-block text-[11px] underline underline-offset-4 hover:text-foreground"
          >
            Create a token
          </a>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            type="password"
            placeholder="github_pat_…"
            autoComplete="off"
            className="mt-2 h-8 w-full rounded-[3px] border border-border bg-transparent px-2 text-[11px] outline-none placeholder:text-muted-foreground/60 focus:border-foreground/40"
          />
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              disabled={!draft.trim() || busy}
              onClick={() => {
                const token = draft.trim();
                saveToken(token);
                setDraft("");
                setAskToken(false);
                void run(token);
              }}
              className="h-7 rounded-[3px] border border-foreground bg-foreground px-2.5 text-[10px] uppercase tracking-[0.12em] text-background disabled:opacity-40"
            >
              Save & refresh
            </button>
            <button
              type="button"
              onClick={() => {
                clearToken();
                setDraft("");
                setAskToken(false);
                setError(null);
              }}
              className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RangeFilter({
  label,
  min,
  max,
  onMin,
  onMax,
}: {
  label: string;
  min: string;
  max: string;
  onMin: (value: string) => void;
  onMax: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <input
        value={min}
        onChange={(event) => onMin(event.target.value)}
        inputMode="numeric"
        placeholder="0"
        aria-label={`${label} minimum hit rate`}
        className="h-8 w-12 rounded-[3px] border border-border bg-transparent px-1.5 text-center text-[11px] tabular-nums outline-none placeholder:text-muted-foreground/60 focus:border-foreground/40"
      />
      <span className="text-[10px] text-muted-foreground">–</span>
      <input
        value={max}
        onChange={(event) => onMax(event.target.value)}
        inputMode="numeric"
        placeholder="100"
        aria-label={`${label} maximum hit rate`}
        className="h-8 w-12 rounded-[3px] border border-border bg-transparent px-1.5 text-center text-[11px] tabular-nums outline-none placeholder:text-muted-foreground/60 focus:border-foreground/40"
      />
      <span className="text-[10px] text-muted-foreground">%</span>
    </div>
  );
}

export default function HitRate() {
  const { data: board, live, reload } = useHitRateBoard();
  const [stat, setStat] = useState<StatKey | "all">("all");
  const [gameId, setGameId] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [hideOut, setHideOut] = useState(true);
  const [sort, setSort] = useState<SortKey>("l10");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const sync = useLiveAction(api.hitRateActions.sync);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [l5Min, setL5Min] = useState("");
  const [l5Max, setL5Max] = useState("");
  const [h2hMin, setH2hMin] = useState("");
  const [h2hMax, setH2hMax] = useState("");
  const [grades, setGrades] = useState<string[]>([]);

  const games = useMemo(() => {
    const byId = new Map<string, { id: string; label: string; tipoff: string }>();
    for (const row of board.rows) {
      if (byId.has(row.gameId)) continue;
      byId.set(row.gameId, {
        id: row.gameId,
        label: `${row.teamAbbr} vs ${row.opponentAbbr}`,
        tipoff: row.tipoff,
      });
    }
    return [...byId.values()].sort((a, b) => a.tipoff.localeCompare(b.tipoff));
  }, [board.rows]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = board.rows.filter((row) => {
      if (gameId !== "all" && row.gameId !== gameId) return false;
      if (stat !== "all" && row.stat !== stat) return false;
      if (hideOut && row.injuryStatus === "Out") return false;
      if (!inRange(pct(row.l5), l5Min, l5Max)) return false;
      if (!inRange(pct(row.h2h), h2hMin, h2hMax)) return false;
      if (grades.length && !grades.includes(matchupGrade(row.rank))) return false;
      if (!needle) return true;
      return [row.name, row.teamAbbr, row.opponentAbbr, row.position].some(
        (value) => value.toLowerCase().includes(needle),
      );
    });
    const factor = direction === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const left = sortValue(a, sort);
      const right = sortValue(b, sort);
      if (typeof left === "string" || typeof right === "string") {
        return factor * String(left).localeCompare(String(right));
      }
      return factor * (left - right) || a.name.localeCompare(b.name);
    });
  }, [
    board.rows,
    direction,
    gameId,
    grades,
    h2hMax,
    h2hMin,
    hideOut,
    l5Max,
    l5Min,
    query,
    sort,
    stat,
  ]);

  const players = new Set(rows.map((row) => row.playerId)).size;
  const filtered =
    stat !== "all" ||
    gameId !== "all" ||
    query.trim() !== "" ||
    !hideOut ||
    l5Min.trim() !== "" ||
    l5Max.trim() !== "" ||
    h2hMin.trim() !== "" ||
    h2hMax.trim() !== "" ||
    grades.length > 0;

  const reset = () => {
    setStat("all");
    setGameId("all");
    setQuery("");
    setHideOut(true);
    setL5Min("");
    setL5Max("");
    setH2hMin("");
    setH2hMax("");
    setGrades([]);
    setSort("l10");
    setDirection("desc");
  };

  const changeSort = (key: SortKey) => {
    if (key === sort) {
      setDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSort(key);
    setDirection(DEFAULT_DIRECTION[key]);
  };

  const toggleGrade = (grade: string) => {
    setGrades((current) =>
      current.includes(grade)
        ? current.filter((value) => value !== grade)
        : [...current, grade],
    );
  };

  return (
    <AppShell season={board.meta.season}>
      <main className="mx-auto w-full max-w-[86rem] px-5 py-10 sm:px-8 sm:py-12">
        <div className="flex flex-col gap-6">
          <div>
            <div className="flex items-center gap-3">
              <span className="h-px w-8 bg-foreground/30" />
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Slate · {slateLabel(board.rows[0]?.tipoff ?? board.meta.slateDate)}
              </p>
            </div>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <h1 className="mt-4 text-3xl font-medium tracking-[-0.02em] sm:text-4xl">
                Hit rate dashboard
              </h1>
              <div className="flex items-center gap-3">
                <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  Lines · {updatedLabel(board.meta.generatedAt)}
                </span>
                {LIVE_MODE ? (
                  <button
                    type="button"
                    onClick={async () => {
                      setRefreshing(true);
                      setRefreshError(null);
                      setRefreshNote(null);
                      try {
                        const result = await sync({});
                        setRefreshNote(
                          result.changed
                            ? "Lines updated"
                            : "Checked · no line changes",
                        );
                      } catch (error) {
                        setRefreshError(
                          error instanceof Error ? error.message : String(error),
                        );
                      } finally {
                        setRefreshing(false);
                      }
                    }}
                    disabled={refreshing}
                    className="h-8 rounded-[3px] border border-border px-2.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                  >
                    {refreshing ? "Refreshing…" : "Refresh lines"}
                  </button>
                ) : (
                  <StaticRefresh
                    generatedAt={board.meta.generatedAt}
                    onReload={reload}
                  />
                )}
                {refreshNote ? (
                  <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    {refreshNote}
                  </span>
                ) : null}
              </div>
            </div>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Every prop on tonight's board, graded against today's line over the
              last five and ten games, head to head against the opponent across
              three seasons, and against that defense's position rank.
            </p>
            {refreshError ? (
              <p className="mt-3 max-w-2xl border-l-2 border-match-tough-strong pl-2.5 text-[11px] leading-5 text-match-tough-strong">
                Refresh failed: {refreshError}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-3 border-y border-border py-4">
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

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <label className="flex items-center gap-1.5">
                <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                  Match
                </span>
                <select
                  value={gameId}
                  onChange={(event) => setGameId(event.target.value)}
                  className="h-8 max-w-[11rem] rounded-[3px] border border-border bg-background px-1.5 text-[10px] uppercase tracking-[0.12em] text-foreground outline-none focus:border-foreground/40"
                >
                  <option value="all">All matches</option>
                  {games.map((game) => (
                    <option key={game.id} value={game.id}>
                      {game.label}
                    </option>
                  ))}
                </select>
              </label>

              <RangeFilter
                label="L5 hit"
                min={l5Min}
                max={l5Max}
                onMin={setL5Min}
                onMax={setL5Max}
              />
              <RangeFilter
                label="H2H hit"
                min={h2hMin}
                max={h2hMax}
                onMin={setH2hMin}
                onMax={setH2hMax}
              />

              <details className="relative">
                <summary className="flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-[3px] border border-border px-2.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground transition-colors [&::-webkit-details-marker]:hidden hover:text-foreground">
                  Matchup
                  <span className="text-foreground">
                    {grades.length ? grades.join(", ") : "All"}
                  </span>
                </summary>
                <div className="absolute left-0 z-20 mt-1 w-44 border border-border bg-background p-2 shadow-sm">
                  <div className="grid grid-cols-2 gap-0.5">
                    {GRADES.map((grade) => (
                      <label
                        key={grade}
                        className="flex cursor-pointer items-center gap-1.5 rounded-[2px] px-1 py-1 text-[11px] hover:bg-accent/60"
                      >
                        <input
                          type="checkbox"
                          checked={grades.includes(grade)}
                          onChange={() => toggleGrade(grade)}
                          className="size-3 accent-foreground"
                        />
                        {grade}
                      </label>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setGrades([])}
                    className="mt-1.5 w-full border-t border-border pt-1.5 text-left text-[9px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
                  >
                    Clear matchups
                  </button>
                </div>
              </details>

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
              {filtered ? (
                <button
                  type="button"
                  onClick={reset}
                  className="h-8 rounded-[3px] border border-transparent px-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  Reset
                </button>
              ) : null}
              <span className="ml-auto text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {rows.length} props · {players} players
              </span>
            </div>
          </div>

          <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
            <div className="min-w-[780px]">
              <div className="grid grid-cols-[minmax(0,1fr)_7.5rem_3.5rem_3.5rem_3.5rem_4.5rem_3.5rem] items-center gap-3 border-b border-border pb-2 text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                {COLUMNS.map((column) => (
                  <button
                    key={column.key}
                    type="button"
                    onClick={() => changeSort(column.key)}
                    title={`Sort by ${column.label}`}
                    className={cn(
                      "flex items-center gap-1 text-left uppercase tracking-[0.14em] transition-colors hover:text-foreground",
                      sort === column.key && "text-foreground",
                    )}
                  >
                    {column.label}
                    <span className="text-[8px] leading-none">
                      {sort === column.key
                        ? direction === "asc"
                          ? "▲"
                          : "▼"
                        : ""}
                    </span>
                  </button>
                ))}
              </div>

              <div className="divide-y divide-border/70">
                {rows.map((row) => {
                  return (
                    <div
                      key={`${row.playerId}-${row.stat}`}
                      className="grid grid-cols-[minmax(0,1fr)_7.5rem_3.5rem_3.5rem_3.5rem_4.5rem_3.5rem] items-center gap-3 py-2.5 transition-colors hover:bg-accent/40"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="inline-flex h-6 w-9 shrink-0 items-center justify-center rounded-[3px] border border-border text-[9px] font-semibold tracking-[0.06em] text-muted-foreground">
                          {row.teamAbbr}
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
                            {row.teamAbbr} vs {row.opponentAbbr} ·{" "}
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
            L5 and L10 count this season's completed games against today's line;
            pushes are dropped from the sample. H2H reaches back across this
            season and the previous two. Matchup grade comes from the opponent's
            defense-vs-position rank (30 = softest, 1 = toughest). Lines are a
            consensus of the major books. {live ? "Live board" : "Snapshot"} ·
            data through {throughLabel(board.meta.throughDate)} · {board.meta.source}.
          </div>
        </div>
      </main>
    </AppShell>
  );
}
