/**
 * Builds the defense-vs-position snapshot used by the app.
 *
 * Sources (both free, no key):
 *  - ESPN public NBA API: season schedule + per-game box scores
 *  - Sleeper public player list: PG/SG/SF/PF/C eligibility (ESPN only exposes G/F/C)
 *
 * What is computed
 *  - For every defense, per position, the average PTS / REB / AST / 3PM allowed
 *    per game, plus the 1-30 rank in each category (1 = allows the fewest).
 *  - For every team, its most-used starter at each position with per-game averages.
 *  - The upcoming schedule, so the board can show an actual matchup.
 *
 * Usage: node scripts/sync-nba.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const SEASON = 2027; // ESPN season year for 2026-27
const ESPN = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
const POSITIONS = ["PG", "SG", "SF", "PF", "C"];
const STATS = ["pts", "reb", "ast", "tpm"];

async function getJson(url, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return await res.json();
    } catch (err) {
      if (i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      out[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return out;
}

const normalizeName = (name) =>
  name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/[^a-z]/g, "");

const num = (value) => {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return 0;
  const cleaned = value.replace("+", "").trim();
  if (!cleaned || cleaned === "-" || cleaned === "--") return 0;
  if (cleaned.includes("-")) return num(cleaned.split("-")[0]);
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

const round = (value, digits = 1) => Number(value.toFixed(digits));

/**
 * Collapse a player's eligibility list into the position a defense has to guard
 * him at. Sleeper lists combo guards as PG/SG and combo forwards as PF/SF, so the
 * coarse ESPN slot (G/F/C) plus per-game production decides the tie.
 */
function canonicalPosition(eligibility, coarse, perGame) {
  if (coarse === "C" || eligibility.includes("C") && eligibility.length === 1) return "C";
  if (coarse === "G") {
    if (eligibility.includes("PG") && (!eligibility.includes("SG") || perGame.ast >= 3.5)) return "PG";
    if (eligibility.includes("SG")) return "SG";
    return eligibility[0] ?? "PG";
  }
  if (coarse === "F") {
    if (eligibility.includes("PF") && (!eligibility.includes("SF") || perGame.reb >= 5.5)) return "PF";
    if (eligibility.includes("SF")) return "SF";
    return eligibility[0] ?? "SF";
  }
  return eligibility[0] ?? "SF";
}

/** Max-minutes assignment of five players to five position slots. */
function buildLineup(roster) {
  const pool = roster.slice(0, 14);
  const weightOf = (p) => p.starts * 100 + p.mpg;
  const memo = new Map();

  // dp(slot, usedMask) = best combined weight for the remaining slots.
  const dp = (slot, usedMask) => {
    if (slot === POSITIONS.length) return 0;
    const key = `${slot}:${usedMask}`;
    if (memo.has(key)) return memo.get(key);
    let best = -1;
    pool.forEach((player, i) => {
      if (usedMask & (1 << i)) return;
      if (!player.eligibility.includes(POSITIONS[slot])) return;
      best = Math.max(best, weightOf(player) + dp(slot + 1, usedMask | (1 << i)));
    });
    memo.set(key, best);
    return best;
  };

  const chosen = {};
  const used = new Set();
  let usedMask = 0;
  for (let slot = 0; slot < POSITIONS.length; slot++) {
    let pick = -1;
    pool.forEach((player, i) => {
      if (usedMask & (1 << i)) return;
      if (!player.eligibility.includes(POSITIONS[slot])) return;
      if (weightOf(player) + dp(slot + 1, usedMask | (1 << i)) === dp(slot, usedMask)) {
        if (pick < 0) pick = i;
      }
    });
    if (pick >= 0) {
      chosen[POSITIONS[slot]] = pool[pick];
      used.add(pool[pick].id);
      usedMask |= 1 << pick;
    }
  }

  // Backfill anything the matching could not fill.
  for (const pos of POSITIONS) {
    if (chosen[pos]) continue;
    const fallback = roster.find((p) => !used.has(p.id));
    if (fallback) {
      chosen[pos] = fallback;
      used.add(fallback.id);
    }
  }
  return chosen;
}

async function main() {
  console.log("Fetching teams, schedule, and player positions…");
  const [teamsJson, sleeperJson] = await Promise.all([
    getJson(`${ESPN}/teams`),
    getJson("https://api.sleeper.app/v1/players/nba"),
  ]);

  const teams = teamsJson.sports[0].leagues[0].teams.map(({ team }) => ({
    id: String(team.id),
    abbr: team.abbreviation,
    location: team.location ?? team.displayName,
    nickname: team.name,
  }));

  const eligibilityByName = new Map();
  for (const player of Object.values(sleeperJson)) {
    if (!player?.full_name) continue;
    const eligibility = (player.fantasy_positions ?? []).filter((p) => POSITIONS.includes(p));
    if (eligibility.length) eligibilityByName.set(normalizeName(player.full_name), eligibility);
  }

  const schedules = await mapLimit(teams, 6, async (team) => {
    const json = await getJson(`${ESPN}/teams/${team.id}/schedule?season=${SEASON}`);
    return json.events ?? [];
  });

  const byId = new Map();
  for (const event of schedules.flat()) {
    if (!event.competitions?.length) continue;
    const competition = event.competitions[0];
    const status = competition.status?.type?.state;
    if (!["post", "in", "pre"].includes(status)) continue;
    const competitors = competition.competitors ?? [];
    if (competitors.length !== 2) continue;
    byId.set(String(event.id), {
      id: String(event.id),
      date: event.date,
      completed: status === "post",
      teams: competitors.map((c) => ({
        id: String(c.team.id),
        abbr: c.team.abbreviation,
        score: c.score ? Number(c.score) : null,
        homeAway: c.homeAway,
      })),
    });
  }

  const games = [...byId.values()].sort((a, b) => a.date.localeCompare(b.date));
  const completedGames = games.filter((g) => g.completed);
  console.log(`Schedule: ${games.length} games, ${completedGames.length} completed.`);

  const players = new Map();
  const teamGames = new Map();

  let processed = 0;
  await mapLimit(completedGames, 10, async (game) => {
    let summary;
    try {
      summary = await getJson(`${ESPN}/summary?event=${game.id}`);
    } catch (err) {
      console.warn(`box score failed for ${game.id}: ${err.message}`);
      return;
    }
    for (const group of summary.boxscore?.players ?? []) {
      const teamId = String(group.team?.id ?? "");
      if (!teamId) continue;
      teamGames.set(teamId, (teamGames.get(teamId) ?? 0) + 1);
      const block = group.statistics?.[0];
      if (!block?.athletes) continue;
      const keys = block.keys ?? [];
      const index = (key) => keys.indexOf(key);
      const iMin = index("minutes");
      const iPts = index("points");
      const iTpm = index("threePointFieldGoalsMade-threePointFieldGoalsAttempted");
      const iReb = index("rebounds");
      const iAst = index("assists");

      const opponent = game.teams.find((t) => t.id !== teamId);
      if (!opponent) continue;

      for (const row of block.athletes) {
        const athlete = row.athlete;
        if (!athlete?.id) continue;
        const minutes = iMin >= 0 ? num(row.stats?.[iMin]) : 0;
        if (row.didNotPlay === true || minutes <= 0) continue;

        const id = String(athlete.id);
        let entry = players.get(id);
        if (!entry) {
          entry = {
            id,
            name: athlete.displayName ?? "",
            teamId,
            coarse: athlete.position?.abbreviation ?? "",
            eligibility: [],
            games: 0,
            starts: 0,
            minutes: 0,
            totals: { pts: 0, reb: 0, ast: 0, tpm: 0 },
            lines: [],
          };
          players.set(id, entry);
        }
        entry.teamId = teamId;
        const eligibility = eligibilityByName.get(normalizeName(entry.name)) ?? [];
        if (eligibility.length) entry.eligibility = eligibility;
        entry.games += 1;
        entry.starts += row.starter ? 1 : 0;
        entry.minutes += minutes;

        const line = {
          pts: iPts >= 0 ? num(row.stats[iPts]) : 0,
          reb: iReb >= 0 ? num(row.stats[iReb]) : 0,
          ast: iAst >= 0 ? num(row.stats[iAst]) : 0,
          tpm: iTpm >= 0 ? num(row.stats[iTpm]) : 0,
        };
        STATS.forEach((stat) => (entry.totals[stat] += line[stat]));
        entry.lines.push({ ...line, against: opponent.id });
      }
    }
    processed += 1;
    if (processed % 40 === 0) console.log(`  box scores: ${processed}/${completedGames.length}`);
  });

  console.log(`Players with minutes: ${players.size}.`);

  // Canonical position per player, then defense-vs-position totals.
  const defenseTotals = new Map(); // `${defTeamId}:${pos}` -> cumulative line
  for (const player of players.values()) {
    const perGame = {
      pts: player.totals.pts / player.games,
      reb: player.totals.reb / player.games,
      ast: player.totals.ast / player.games,
      tpm: player.totals.tpm / player.games,
    };
    player.perGame = perGame;
    const eligibility = player.eligibility.length
      ? player.eligibility
      : [player.coarse === "C" ? "C" : player.coarse === "G" ? "SG" : "SF"];
    player.eligibility = eligibility;
    player.position = canonicalPosition(eligibility, player.coarse, perGame);

    for (const line of player.lines) {
      const key = `${line.against}:${player.position}`;
      const total = defenseTotals.get(key) ?? { pts: 0, reb: 0, ast: 0, tpm: 0 };
      STATS.forEach((stat) => (total[stat] += line[stat]));
      defenseTotals.set(key, total);
    }
  }

  // Defense-vs-position averages and ranks.
  const dvp = new Map();
  for (const team of teams) {
    const gamesPlayed = Math.max(1, teamGames.get(team.id) ?? 0);
    const byPosition = {};
    for (const pos of POSITIONS) {
      const total = defenseTotals.get(`${team.id}:${pos}`) ?? { pts: 0, reb: 0, ast: 0, tpm: 0 };
      byPosition[pos] = Object.fromEntries(
        STATS.map((stat) => [stat, total[stat] / gamesPlayed]),
      );
    }
    dvp.set(team.id, byPosition);
  }

  const ranks = new Map();
  for (const stat of STATS) {
    for (const pos of POSITIONS) {
      const ordered = teams
        .map((t) => ({ id: t.id, value: dvp.get(t.id)[pos][stat] }))
        .sort((a, b) => a.value - b.value);
      ordered.forEach((row, i) => {
        const teamRanks = ranks.get(row.id) ?? {};
        teamRanks[pos] = { ...(teamRanks[pos] ?? {}), [stat]: i + 1 };
        ranks.set(row.id, teamRanks);
      });
    }
  }

  const leagueAverage = {};
  for (const pos of POSITIONS) {
    leagueAverage[pos] = {};
    for (const stat of STATS) {
      const values = teams.map((t) => dvp.get(t.id)[pos][stat]);
      leagueAverage[pos][stat] = round(values.reduce((a, b) => a + b, 0) / values.length);
    }
  }

  // Lineups: the most-used starter at each position.
  const teamLineups = {};
  for (const team of teams) {
    const roster = [...players.values()]
      .filter((p) => p.teamId === team.id && p.games > 0)
      .map((p) => ({ ...p, mpg: p.minutes / p.games }))
      .sort((a, b) => b.starts - a.starts || b.mpg - a.mpg);
    const lineup = buildLineup(roster);
    teamLineups[team.id] = POSITIONS.flatMap((pos) => {
      const player = lineup[pos];
      if (!player) return [];
      return [
        {
          slot: pos,
          id: player.id,
          name: player.name,
          positions: player.eligibility,
          games: player.games,
          starts: player.starts,
          mpg: round(player.mpg),
          pts: round(player.perGame.pts),
          reb: round(player.perGame.reb),
          ast: round(player.perGame.ast),
          tpm: round(player.perGame.tpm),
        },
      ];
    });
  }

  const now = Date.now();
  const matchups = games
    .filter((g) => !g.completed && new Date(g.date).getTime() >= now - 6 * 3600_000)
    .slice(0, 90)
    .map((g) => ({
      id: g.id,
      date: g.date,
      home: g.teams.find((t) => t.homeAway === "home")?.id,
      away: g.teams.find((t) => t.homeAway === "away")?.id,
    }))
    .filter((g) => g.home && g.away);

  const latestGame = completedGames.at(-1);
  const snapshot = {
    meta: {
      season: "2026-27",
      source: "ESPN public box scores",
      generatedAt: new Date().toISOString(),
      gamesSampled: completedGames.length,
      throughDate: latestGame?.date ?? null,
    },
    teams: teams.map((t) => ({
      id: t.id,
      abbr: t.abbr,
      location: t.location,
      nickname: t.nickname,
      name: `${t.location} ${t.nickname}`,
      games: teamGames.get(t.id) ?? 0,
      season: Object.fromEntries(
        POSITIONS.map((pos) => [
          pos,
          {
            ...Object.fromEntries(STATS.map((stat) => [stat, round(dvp.get(t.id)[pos][stat])])),
            ranks: ranks.get(t.id)[pos],
          },
        ]),
      ),
    })),
    lineups: teamLineups,
    leagueAverage,
    matchups,
  };

  const outFile = path.resolve("src/data/dvp.json");
  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`Wrote ${outFile}`);

  for (const abbr of ["IND", "PHI"]) {
    const team = snapshot.teams.find((t) => t.abbr === abbr);
    console.log(`\n${abbr} starters:`);
    for (const p of snapshot.lineups[team.id]) {
      console.log(`  ${p.slot} ${p.name} — ${p.pts}p ${p.reb}r ${p.ast}a ${p.tpm}3 (${p.starts} starts)`);
    }
    console.log(`${abbr} D allowed per game:`);
    console.log(
      POSITIONS.map((pos) => {
        const row = team.season[pos];
        return `  ${pos}: ${row.pts}p(${row.ranks.pts}) ${row.reb}r(${row.ranks.reb}) ${row.ast}a(${row.ranks.ast}) ${row.tpm}3(${row.ranks.tpm})`;
      }).join("\n"),
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
