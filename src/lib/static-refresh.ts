/**
 * Manual refresh for the backend-free (GitHub Pages) build.
 *
 * There is no server to call, so "Refresh lines" dispatches the
 * `Refresh board data` workflow and then polls the committed snapshot until the
 * workflow publishes a new one. Dispatching needs a GitHub token with
 * `Actions: write` on this repository; it is kept in localStorage because the
 * app has no accounts.
 */
import type { HitRateBoard } from "@/lib/hit-rate";

/** Overridable so a fork can point at its own repository. */
const REPO =
  (import.meta.env.VITE_GITHUB_REPO as string | undefined) ??
  "Curryous51/defense-vs-position";
const BRANCH = "main";
const WORKFLOW = "sync-data.yml";
const BOARD_PATH = "src/data/hit-rate.json";
const TOKEN_KEY = "dvp.github.token";

export const TOKEN_URL = "https://github.com/settings/personal-access-tokens/new";
export const REPO_URL = `https://github.com/${REPO}`;

export function storedToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function saveToken(token: string): void {
  try {
    window.localStorage.setItem(TOKEN_KEY, token.trim());
  } catch {
    // Private browsing: the token just won't persist across reloads.
  }
}

export function clearToken(): void {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Ignore.
  }
}

function headers(token: string, accept: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: accept,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function describe(status: number): string {
  if (status === 401) return "GitHub rejected the token — it may be expired or mistyped.";
  if (status === 403)
    return "GitHub refused that token. It needs Contents: read and Actions: read and write on this repo.";
  if (status === 404) return "Repository or workflow not found for this token.";
  return `GitHub returned ${status}.`;
}

/**
 * Reads the committed board. With a token it goes through the API (never
 * cached); without one it falls back to the raw file, which the CDN may serve
 * a few minutes old.
 */
export async function fetchBoard(token: string | null = storedToken()): Promise<HitRateBoard> {
  const bust = Date.now();
  const response = token
    ? await fetch(
        `https://api.github.com/repos/${REPO}/contents/${BOARD_PATH}?ref=${BRANCH}&t=${bust}`,
        { headers: headers(token, "application/vnd.github.raw+json"), cache: "no-store" },
      )
    : await fetch(
        `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${BOARD_PATH}?t=${bust}`,
        { cache: "no-store" },
      );
  if (!response.ok) throw new Error(describe(response.status));
  return (await response.json()) as HitRateBoard;
}

/** Starts the scheduled workflow manually; resolves once GitHub accepts it. */
export async function triggerRefresh(token: string): Promise<void> {
  const response = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
    {
      method: "POST",
      headers: {
        ...headers(token, "application/vnd.github+json"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: BRANCH }),
    },
  );
  if (!response.ok) throw new Error(describe(response.status));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface RunSummary {
  status?: string;
  conclusion?: string | null;
  created_at?: string;
}

/** The workflow run this refresh started, if GitHub has queued it yet. */
async function dispatchedRun(token: string, since: number): Promise<RunSummary | null> {
  const response = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/runs?per_page=5`,
    { headers: headers(token, "application/vnd.github+json"), cache: "no-store" },
  );
  if (!response.ok) return null;
  const json = (await response.json()) as { workflow_runs?: RunSummary[] };
  return (
    (json.workflow_runs ?? []).find(
      (run) => run.created_at && new Date(run.created_at).getTime() >= since - 5_000,
    ) ?? null
  );
}

/**
 * Polls the committed board until `generatedAt` moves past the one on screen.
 * The sync fetches every player's game log, so a couple of minutes is normal;
 * a failed run ends the wait immediately with its usual cause.
 */
export async function waitForBoard(
  previous: string,
  token: string,
  options: {
    /** Dispatch time, so the poll can tell its own run apart from older ones. */
    since?: number;
    intervalMs?: number;
    timeoutMs?: number;
    onCheck?: (seconds: number) => void;
  } = {},
): Promise<HitRateBoard> {
  const intervalMs = options.intervalMs ?? 8_000;
  const timeoutMs = options.timeoutMs ?? 8 * 60_000;
  const startedAt = Date.now();
  const since = options.since ?? startedAt;
  let lastError: string | null = null;

  while (Date.now() - startedAt < timeoutMs) {
    await sleep(intervalMs);
    try {
      const board = await fetchBoard(token);
      if (board.meta.generatedAt !== previous) return board;
      lastError = null;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    try {
      const run = await dispatchedRun(token, since);
      if (run?.conclusion === "failure") {
        throw new Error(
          "The data workflow failed. Check the Actions tab — the usual causes are a missing PROPLINE_API_KEY secret or a PropLine outage.",
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("The data workflow")) throw error;
    }

    options.onCheck?.(Math.round((Date.now() - startedAt) / 1000));
  }

  throw new Error(
    lastError ??
      "Timed out waiting for the workflow. Check the Actions tab; a run can fail when the PropLine key is missing.",
  );
}
