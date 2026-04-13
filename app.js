// ============================================================
//  SPGA — Sub-Par Golf Association
//  app.js  |  ESPN API + Scoring Engine + UI Controller
// ============================================================

// ============================================================
//  CONSTANTS
// ============================================================

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard";
const CORS_PROXY = "https://corsproxy.io/?url=";
const REFRESH_INTERVAL_MS = 120000; // auto-refresh every 2 minutes

// ============================================================
//  STATE
// ============================================================

let state = {
  tournamentData: null,   // raw ESPN response
  playerScores: {},       // { "Player Name": { rounds: [], total, toPar, status, position } }
  leaderboard: [],        // computed manager leaderboard
  lastUpdated: null,
  loading: false,
  error: null,
  expandedManager: null,  // which manager row is expanded
};

// ============================================================
//  ESPN API — FETCH & PARSE
// ============================================================

async function fetchScores() {
  const tournament = TOURNAMENTS[ACTIVE_TOURNAMENT];
  if (!tournament) {
    setError("No active tournament configured in data.js");
    return;
  }

  setLoading(true);

  const url = `${ESPN_BASE}?event=${tournament.espnEventId}`;

  let data;
  try {
    // Try direct first (works in some environments), fall back to proxy
    let res = await fetch(url).catch(() => null);
    if (!res || !res.ok) {
      res = await fetch(`${CORS_PROXY}${encodeURIComponent(url)}`);
    }
    if (!res.ok) throw new Error(`ESPN API returned ${res.status}`);
    data = await res.json();
  } catch (err) {
    setError(`Could not reach ESPN. Will retry in 2 minutes. (${err.message})`);
    return;
  }

  state.tournamentData = data;
  state.playerScores = parseESPNData(data);
  state.leaderboard = computeLeaderboard();
  state.lastUpdated = new Date();
  state.error = null;

  setLoading(false);
  render();
}

function parseESPNData(data) {
  const scores = {};

  try {
    const events = data?.events;
    if (!events || events.length === 0) return scores;

    const competitors = events[0]?.competitions?.[0]?.competitors ?? [];

    for (const competitor of competitors) {
      const name = competitor.athlete?.displayName;
      if (!name) continue;

      const status = competitor.status?.type?.description ?? "Unknown";
      const position = competitor.status?.position?.displayText ?? "--";

      // toPar: ESPN provides as a number (negative = under par)
      const toParRaw = competitor.score ?? null;
      const toPar = parseToParDisplay(toParRaw, status);

      // Round-by-round scores
      const rounds = [];
      const linescores = competitor.linescores ?? [];
      for (const ls of linescores) {
        const val = ls.value;
        if (val !== undefined && val !== null) {
          rounds.push(val);
        }
      }

      // Total strokes (sum of rounds)
      const totalStrokes = rounds.length > 0
        ? rounds.reduce((sum, r) => sum + r, 0)
        : null;

      scores[name] = {
        name,
        rounds,        // [72, 68, 71, ...] actual stroke counts per round
        total: totalStrokes,
        toPar,         // display string: "-4", "+2", "E", "CUT", "WD"
        toParValue: parseToParValue(toParRaw, status), // numeric for sorting
        status,        // "active", "cut", "withdrawn", etc.
        position,      // "T3", "1", "CUT", etc.
        missedCut: isMissedCut(status),
      };
    }
  } catch (err) {
    console.error("Error parsing ESPN data:", err);
  }

  return scores;
}

function parseToParDisplay(raw, status) {
  if (isMissedCut(status)) return "CUT";
  if (isWithdrawn(status)) return "WD";
  if (raw === null || raw === undefined) return "--";
  const n = Number(raw);
  if (isNaN(n)) return "--";
  if (n === 0) return "E";
  if (n < 0) return `${n}`;   // already has minus sign
  return `+${n}`;
}

function parseToParValue(raw, status) {
  // Used for numeric sorting. Missed cut / WD pushed to bottom.
  if (isMissedCut(status)) return 999;
  if (isWithdrawn(status)) return 998;
  if (raw === null || raw === undefined) return 0;
  const n = Number(raw);
  return isNaN(n) ? 0 : n;
}

function isMissedCut(status) {
  if (!status) return false;
  const s = status.toLowerCase();
  return s.includes("cut") || s === "mc";
}

function isWithdrawn(status) {
  if (!status) return false;
  const s = status.toLowerCase();
  return s.includes("withdraw") || s === "wd" || s === "dq";
}

// ============================================================
//  SCORING ENGINE
// ============================================================

// --- Best Ball ---
// Best single golfer's to-par value among a manager's roster.
// Computed per round (daily) and cumulatively (overall).

function calcBestBall(golferNames) {
  const activeGolfers = golferNames.filter(name => {
    const g = state.playerScores[name];
    return g && !g.missedCut;
  });

  if (activeGolfers.length === 0) {
    // All missed cut — use best (least worst) score overall
    const allScores = golferNames
      .map(name => state.playerScores[name]?.toParValue ?? 999)
      .filter(v => v < 998);
    const best = allScores.length > 0 ? Math.min(...allScores) : 999;
    return {
      overall: best,
      overallDisplay: formatToParDisplay(best),
      byRound: [],
      bestGolfer: getBestGolferOverall(golferNames),
    };
  }

  // Overall best ball: single best cumulative to-par
  const overallValues = activeGolfers.map(name =>
    state.playerScores[name]?.toParValue ?? 999
  );
  const overallBest = Math.min(...overallValues);
  const bestGolfer = activeGolfers[overallValues.indexOf(overallBest)];

  // Per-round best ball
  const maxRounds = Math.max(
    ...golferNames.map(n => state.playerScores[n]?.rounds?.length ?? 0)
  );
  const byRound = [];

  for (let r = 0; r < maxRounds; r++) {
    const roundScores = golferNames
      .map(name => {
        const g = state.playerScores[name];
        if (!g || g.missedCut) return null;
        return g.rounds[r] ?? null;
      })
      .filter(v => v !== null);

    if (roundScores.length > 0) {
      byRound.push(Math.min(...roundScores));
    }
  }

  return {
    overall: overallBest,
    overallDisplay: formatToParDisplay(overallBest),
    byRound,
    bestGolfer,
  };
}

function getBestGolferOverall(golferNames) {
  let best = null;
  let bestVal = Infinity;
  for (const name of golferNames) {
    const v = state.playerScores[name]?.toParValue ?? 999;
    if (v < bestVal) { bestVal = v; best = name; }
  }
  return best;
}

// --- Combined Score ---
// Sum of all rostered golfers' to-par values.
// Missed cut golfers count as-is (their score is included).

function calcCombined(golferNames) {
  let total = 0;
  let hasAnyScore = false;
  const breakdown = [];

  for (const name of golferNames) {
    const g = state.playerScores[name];
    if (!g) {
      // Golfer not found in ESPN data — skip with a note
      breakdown.push({ name, value: null, display: "N/A", missedCut: false });
      continue;
    }
    total += g.toParValue < 998 ? g.toParValue : g.toParValue; // include CUT score
    hasAnyScore = true;
    breakdown.push({
      name,
      value: g.toParValue,
      display: g.toPar,
      missedCut: g.missedCut,
      position: g.position,
    });
  }

  return {
    total: hasAnyScore ? total : null,
    totalDisplay: hasAnyScore ? formatToParDisplay(total) : "--",
    breakdown,
  };
}

function formatToParDisplay(val) {
  if (val === null || val === undefined) return "--";
  if (val >= 998) return "CUT";
  if (val === 0) return "E";
  if (val < 0) return `${val}`;
  return `+${val}`;
}

// --- Leaderboard Builder ---
// Returns sorted array of manager results with both scoring formats.

function computeLeaderboard() {
  const tournament = ACTIVE_TOURNAMENT;
  const results = [];

  for (const manager of MANAGERS) {
    const golferNames = manager.golfers[tournament] ?? [];

    const bestBall = calcBestBall(golferNames);
    const combined = calcCombined(golferNames);

    results.push({
      manager,
      golferNames,
      bestBall,
      combined,
    });
  }

  // Sort by combined score (primary), best ball (tiebreaker)
  // Managers with no roster pushed to bottom
  results.sort((a, b) => {
    const aHas = a.golferNames.length > 0;
    const bHas = b.golferNames.length > 0;
    if (!aHas && bHas) return 1;
    if (aHas && !bHas) return -1;
    if (!aHas && !bHas) return 0;

    const aComb = a.combined.total ?? 999;
    const bComb = b.combined.total ?? 999;
    if (aComb !== bComb) return aComb - bComb;
    return (a.bestBall.overall ?? 999) - (b.bestBall.overall ?? 999);
  });

  // Assign ranks (handle ties)
  let rank = 1;
  for (let i = 0; i < results.length; i++) {
    if (i > 0 && results[i].golferNames.length > 0) {
      const prev = results[i - 1];
      const curr = results[i];
      const sameComb = prev.combined.total === curr.combined.total;
      const sameBB = prev.bestBall.overall === curr.bestBall.overall;
      if (!sameComb || !sameBB) rank = i + 1;
    }
    results[i].rank = results[i].golferNames.length > 0 ? rank : "--";
  }

  return results;
}

// ============================================================
//  RENDER — UI
// ============================================================

function render() {
  renderHeader();
  renderLeaderboard();
}

function renderHeader() {
  const tournament = TOURNAMENTS[ACTIVE_TOURNAMENT];
  document.getElementById("tournament-name").textContent = tournament?.name ?? "SPGA";
  document.getElementById("tournament-meta").textContent =
    `${tournament?.dates ?? ""} · ${tournament?.location ?? ""}`;

  const updatedEl = document.getElementById("last-updated");
  if (state.lastUpdated) {
    updatedEl.textContent = `Updated ${state.lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }
}

function renderLeaderboard() {
  const container = document.getElementById("leaderboard-body");
  if (!container) return;

  if (state.loading && !state.leaderboard.length) {
    container.innerHTML = `<tr><td colspan="6" class="loading-cell">Fetching scores from ESPN...</td></tr>`;
    return;
  }

  if (state.error && !state.leaderboard.length) {
    container.innerHTML = `<tr><td colspan="6" class="error-cell">${state.error}</td></tr>`;
    return;
  }

  let html = "";

  for (const result of state.leaderboard) {
    const isExpanded = state.expandedManager === result.manager.id;
    const hasRoster = result.golferNames.length > 0;

    // --- Manager Row ---
    html += `
      <tr class="manager-row ${isExpanded ? "expanded" : ""} ${!hasRoster ? "no-roster" : ""}"
          onclick="toggleManager('${result.manager.id}')"
          title="${hasRoster ? "Click to see roster" : "No roster set"}">
        <td class="rank-cell">${result.rank}</td>
        <td class="name-cell">
          <span class="manager-name">${result.manager.name}</span>
          <span class="roster-count">${hasRoster ? `${result.golferNames.length} golfers` : "No roster"}</span>
        </td>
        <td class="score-cell ${scoreClass(result.combined.total)}">
          <span class="score-primary">${result.combined.totalDisplay}</span>
          <span class="score-label">Combined</span>
        </td>
        <td class="score-cell ${scoreClass(result.bestBall.overall)}">
          <span class="score-primary">${result.bestBall.overallDisplay}</span>
          <span class="score-label">Best Ball</span>
        </td>
        <td class="bb-golfer-cell">
          ${result.bestBall.bestGolfer
            ? `<span class="bb-golfer">${shortName(result.bestBall.bestGolfer)}</span>`
            : `<span class="bb-golfer muted">—</span>`}
          <span class="score-label">BB Leader</span>
        </td>
        <td class="expand-cell">${hasRoster ? (isExpanded ? "▲" : "▼") : ""}</td>
      </tr>`;

    // --- Expanded Roster Detail ---
    if (isExpanded && hasRoster) {
      html += `<tr class="detail-row"><td colspan="6"><div class="detail-panel">`;
      html += `<div class="detail-grid">`;

      for (const name of result.golferNames) {
        const g = state.playerScores[name];
        const found = !!g;
        const missed = found && g.missedCut;

        html += `
          <div class="golfer-card ${missed ? "cut" : ""} ${!found ? "not-found" : ""}">
            <div class="golfer-name">${name}${missed ? ' <span class="cut-badge">CUT</span>' : ""}</div>
            <div class="golfer-score ${found ? scoreClass(g.toParValue) : ""}">
              ${found ? g.toPar : "Not in field"}
            </div>
            ${found ? `<div class="golfer-position">${g.position}</div>` : ""}
            ${found && g.rounds.length > 0
              ? `<div class="golfer-rounds">${g.rounds.map((r, i) => `R${i + 1}: ${r}`).join(" · ")}</div>`
              : ""}
          </div>`;
      }

      html += `</div>`; // detail-grid

      // Best Ball by round
      if (result.bestBall.byRound.length > 0) {
        html += `<div class="bb-rounds">
          <span class="bb-rounds-label">Best Ball by round:</span>
          ${result.bestBall.byRound.map((s, i) =>
            `<span class="bb-round-chip">R${i + 1}: ${s}</span>`
          ).join("")}
        </div>`;
      }

      html += `</div></td></tr>`; // detail-panel, td, tr
    }
  }

  container.innerHTML = html;

  // Error banner (non-blocking — scores may still be showing)
  const errorBanner = document.getElementById("error-banner");
  if (errorBanner) {
    errorBanner.textContent = state.error ?? "";
    errorBanner.style.display = state.error ? "block" : "none";
  }
}

// ============================================================
//  UI HELPERS
// ============================================================

function scoreClass(val) {
  if (val === null || val === undefined) return "";
  if (val >= 998) return "score-cut";
  if (val < 0) return "score-under";
  if (val === 0) return "score-even";
  return "score-over";
}

function shortName(fullName) {
  if (!fullName) return "";
  const parts = fullName.split(" ");
  if (parts.length < 2) return fullName;
  return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
}

function toggleManager(managerId) {
  state.expandedManager = state.expandedManager === managerId ? null : managerId;
  renderLeaderboard();
}

function setLoading(val) {
  state.loading = val;
  const el = document.getElementById("refresh-btn");
  if (el) el.disabled = val;
  const indicator = document.getElementById("loading-indicator");
  if (indicator) indicator.style.display = val ? "inline" : "none";
}

function setError(msg) {
  state.error = msg;
  state.loading = false;
  setLoading(false);
  renderLeaderboard();
}

// ============================================================
//  BOOTSTRAP
// ============================================================

async function init() {
  renderHeader();
  await fetchScores();

  // Auto-refresh every 2 minutes
  setInterval(fetchScores, REFRESH_INTERVAL_MS);

  // Manual refresh button
  const btn = document.getElementById("refresh-btn");
  if (btn) btn.addEventListener("click", fetchScores);
}

document.addEventListener("DOMContentLoaded", init);

// Expose globals needed by index.html tournament switcher
window.state = state;
window.fetchScores = fetchScores;
