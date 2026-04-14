// ============================================================
//  SPGA — Sub-Par Golf Association
//  app.js  |  ESPN API + Scoring Engine + UI Controller
// ============================================================

const ESPN_BASE   = "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard";
const CORS_PROXY  = "https://corsproxy.io/?url=";
const REFRESH_MS  = 120000; // 2 minutes

// ============================================================
//  STATE
// ============================================================

const state = {
  playerScores:     {},   // { "Player Name": parsedPlayerObject }
  leaderboard:      [],   // computed manager results
  lastUpdated:      null,
  loading:          false,
  error:            null,
  tournamentState:  null, // "pre" | "live" | "post"
  expandedManager:  null,
  sortBy:           "combined", // "combined" | "bestball"
};

// ============================================================
//  DATE HELPERS
// ============================================================

// Parse YYYYMMDD string into a local midnight Date
function parseDate(yyyymmdd) {
  const s = String(yyyymmdd);
  const y = parseInt(s.slice(0, 4));
  const m = parseInt(s.slice(4, 6)) - 1;
  const d = parseInt(s.slice(6, 8));
  return new Date(y, m, d);
}

function todayMidnight() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

function formatDateDisplay(yyyymmdd) {
  const d = parseDate(yyyymmdd);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

// ============================================================
//  API ROUTING
// ============================================================

function getTournamentState(tournament) {
  const today = todayMidnight();
  const start = parseDate(tournament.startDate);
  const end   = parseDate(tournament.endDate);
  if (today < start) return "pre";
  if (today > end)   return "post";
  return "live";
}

function buildUrl(tournament, tState) {
  if (tState === "post") {
    return `${ESPN_BASE}?dates=${tournament.endDate}`;
  }
  return ESPN_BASE;
}

// ============================================================
//  FETCH
// ============================================================

async function fetchScores() {
  const tournament = TOURNAMENTS[ACTIVE_TOURNAMENT];
  if (!tournament) { setError("No active tournament configured in data.js"); return; }

  const tState = getTournamentState(tournament);
  state.tournamentState = tState;

  // Pre-tournament: no fetch needed
  if (tState === "pre") {
    state.playerScores = {};
    state.leaderboard  = computeLeaderboard();
    state.error        = null;
    render();
    return;
  }

  setLoading(true);

  const url = buildUrl(tournament, tState);

  let data;
  try {
    let res = await fetch(url).catch(() => null);
    if (!res || !res.ok) {
      res = await fetch(`${CORS_PROXY}${encodeURIComponent(url)}`);
    }
    if (!res.ok) throw new Error(`ESPN returned ${res.status}`);
    data = await res.json();
  } catch (err) {
    setError(`Could not reach ESPN. Will retry in 2 min. (${err.message})`);
    return;
  }

  state.playerScores = parseESPN(data);
  state.leaderboard  = computeLeaderboard();
  state.lastUpdated  = new Date();
  state.error        = null;

  setLoading(false);
  render();
}

// ============================================================
//  PARSE ESPN RESPONSE
// ============================================================

function parseESPN(data) {
  const scores = {};

  const competitors = data?.events?.[0]?.competitions?.[0]?.competitors ?? [];

  for (const comp of competitors) {
    const name     = comp.athlete?.displayName;
    if (!name) continue;

    const status   = comp.status?.type?.name ?? "";
    const position = comp.status?.position?.displayText ?? "--";
    const missedCut = status === "STATUS_CUT" || status === "STATUS_MISSED_CUT";
    const withdrawn = status === "STATUS_WITHDRAWN" || status === "STATUS_DQ";

    // Overall to-par from top-level score field (e.g. "E", "-5", "+2")
    const overallToParStr = comp.score ?? "E";
    const overallToPar    = parseToParValue(overallToParStr);

    // Parse rounds
    const rounds = parseRounds(comp.linescores ?? []);

    scores[name] = {
      name,
      position,
      status,
      missedCut,
      withdrawn,
      overallToPar,
      overallToParDisplay: comp.score ?? "E",
      rounds,  // array of round objects (see parseRounds)
    };
  }

  return scores;
}

// ============================================================
//  PARSE ROUNDS & HOLES
// ============================================================

// Returns array of round objects, one per round played:
// {
//   roundNum:      1,
//   totalStrokes:  69,
//   toParDisplay:  "-3",
//   toPar:         -3,
//   holes: [
//     { hole: 1, strokes: 4, par: 4, toPar: 0, toParDisplay: "E" },
//     ...
//   ]
// }

function parseRounds(linescores) {
  const rounds = [];

  for (const ls of linescores) {
    const roundNum      = ls.period;
    const totalStrokes  = ls.value;
    const toParDisplay  = ls.displayValue;

    // Skip rounds with no data (e.g. future rounds with value 0 and displayValue "-")
    if (!ls.linescores || ls.linescores.length === 0) continue;
    if (toParDisplay === "-" && totalStrokes === 0) continue;

    const toPar = parseToParValue(toParDisplay);

    // Parse hole-by-hole, sort by hole number
    const holes = ls.linescores
      .map(h => {
        const strokes       = Math.round(h.value);
        const scoreTypeDisp = h.scoreType?.displayValue ?? "E";
        const toParHole     = parseToParValue(scoreTypeDisp);
        const par           = strokes - toParHole;
        return {
          hole:          h.period,
          strokes,
          par,
          toPar:         toParHole,
          toParDisplay:  scoreTypeDisp,
        };
      })
      .sort((a, b) => a.hole - b.hole);

    rounds.push({
      roundNum,
      totalStrokes: Math.round(totalStrokes),
      toParDisplay,
      toPar,
      holes,
    });
  }

  // Sort rounds by round number
  rounds.sort((a, b) => a.roundNum - b.roundNum);
  return rounds;
}

function parseToParValue(str) {
  if (!str || str === "-" || str === "--") return 0;
  const s = String(str).trim();
  if (s === "E") return 0;
  const n = parseInt(s);
  return isNaN(n) ? 0 : n;
}

// ============================================================
//  SCORING ENGINE
// ============================================================

// --- Combined Score ---
// Uses ESPN's top-level to-par for each rostered player, summed.

function calcCombined(golferNames) {
  let total    = 0;
  let hasScore = false;

  for (const name of golferNames) {
    const g = state.playerScores[name];
    if (!g) continue;
    total   += g.overallToPar;
    hasScore = true;
  }

  return {
    total:        hasScore ? total : null,
    totalDisplay: hasScore ? formatToPar(total) : "--",
  };
}

// --- Best Ball ---
// For each round, for each hole, pick the lowest stroke count
// among all rostered players. Sum those best-hole strokes per
// round to get BB round score (expressed as to-par). Sum all
// BB round scores for BB total.

function calcBestBall(golferNames) {
  // Gather all rostered players that have score data
  const players = golferNames
    .map(name => state.playerScores[name])
    .filter(Boolean);

  if (players.length === 0) {
    return { total: null, totalDisplay: "--", rounds: [] };
  }

  // Find how many rounds have been played across all players
  const maxRound = Math.max(...players.map(p => p.rounds.length), 0);
  if (maxRound === 0) {
    return { total: null, totalDisplay: "--", rounds: [] };
  }

  const bbRounds = [];
  let bbTotalToPar = 0;

  for (let r = 1; r <= maxRound; r++) {
    // For each hole 1–18, find the best (lowest) stroke count
    // and which player(s) achieved it
    const holeResults = [];

    for (let hole = 1; hole <= 18; hole++) {
      let bestStrokes = Infinity;
      let par         = null;
      let bestPlayers = [];

      for (const player of players) {
        const round = player.rounds.find(rd => rd.roundNum === r);
        if (!round) continue;
        const holeData = round.holes.find(h => h.hole === hole);
        if (!holeData) continue;

        if (par === null) par = holeData.par;

        if (holeData.strokes < bestStrokes) {
          bestStrokes = holeData.strokes;
          bestPlayers = [player.name];
        } else if (holeData.strokes === bestStrokes) {
          bestPlayers.push(player.name);
        }
      }

      if (bestStrokes === Infinity) continue; // hole not yet played

      holeResults.push({
        hole,
        bestStrokes,
        par,
        toPar:         par !== null ? bestStrokes - par : 0,
        toParDisplay:  par !== null ? formatToPar(bestStrokes - par) : "--",
        bestPlayers,   // which player(s) score is used
      });
    }

    if (holeResults.length === 0) continue;

    // BB round to-par = sum of (bestStrokes - par) for all holes played
    const roundToPar = holeResults.reduce((sum, h) => {
      return h.par !== null ? sum + (h.bestStrokes - h.par) : sum;
    }, 0);

    bbTotalToPar += roundToPar;

    bbRounds.push({
      roundNum:    r,
      toPar:       roundToPar,
      toParDisplay: formatToPar(roundToPar),
      holes:       holeResults,
    });
  }

  return {
    total:        bbTotalToPar,
    totalDisplay: formatToPar(bbTotalToPar),
    rounds:       bbRounds,
  };
}

function formatToPar(val) {
  if (val === null || val === undefined) return "--";
  if (val === 0) return "E";
  if (val < 0)  return `${val}`;
  return `+${val}`;
}

// ============================================================
//  LEADERBOARD BUILDER
// ============================================================

function computeLeaderboard() {
  const results = [];

  for (const manager of MANAGERS) {
    const golferNames = manager.golfers[ACTIVE_TOURNAMENT] ?? [];
    const combined    = calcCombined(golferNames);
    const bestBall    = calcBestBall(golferNames);

    results.push({ manager, golferNames, combined, bestBall });
  }

  sortLeaderboard(results);
  assignRanks(results);
  return results;
}

function sortLeaderboard(results) {
  results.sort((a, b) => {
    const aHas = a.golferNames.length > 0;
    const bHas = b.golferNames.length > 0;
    if (!aHas && bHas)  return 1;
    if (aHas  && !bHas) return -1;
    if (!aHas && !bHas) return 0;

    if (state.sortBy === "bestball") {
      const aBB = a.bestBall.total ?? 999;
      const bBB = b.bestBall.total ?? 999;
      if (aBB !== bBB) return aBB - bBB;
      const aC = a.combined.total ?? 999;
      const bC = b.combined.total ?? 999;
      return aC - bC;
    } else {
      const aC = a.combined.total ?? 999;
      const bC = b.combined.total ?? 999;
      if (aC !== bC) return aC - bC;
      const aBB = a.bestBall.total ?? 999;
      const bBB = b.bestBall.total ?? 999;
      return aBB - bBB;
    }
  });
}

function assignRanks(results) {
  let rank = 1;
  for (let i = 0; i < results.length; i++) {
    if (!results[i].golferNames.length) { results[i].rank = "--"; continue; }
    if (i > 0 && results[i].golferNames.length) {
      const prev = results[i - 1];
      const curr = results[i];
      const sameC  = prev.combined.total  === curr.combined.total;
      const sameBB = prev.bestBall.total  === curr.bestBall.total;
      if (!(sameC && sameBB)) rank = i + 1;
    }
    results[i].rank = rank;
  }
}

// ============================================================
//  RENDER
// ============================================================

function render() {
  renderHeader();
  renderLeaderboard();
}

function renderHeader() {
  const tournament = TOURNAMENTS[ACTIVE_TOURNAMENT];
  document.getElementById("tournament-name").textContent = tournament?.name ?? "SPGA";

  let meta = tournament?.location ?? "";
  if (tournament) {
    const start = formatDateDisplay(tournament.startDate);
    const end   = formatDateDisplay(tournament.endDate);
    meta += ` · ${start} – ${end}`;
  }
  document.getElementById("tournament-meta").textContent = meta;

  const updatedEl = document.getElementById("last-updated");
  if (state.lastUpdated) {
    updatedEl.textContent = `Updated ${state.lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }
}

function renderLeaderboard() {
  const container = document.getElementById("leaderboard-body");
  if (!container) return;

  // Update sort header indicators
  document.querySelectorAll(".th-sortable").forEach(th => {
    th.classList.toggle("sort-active", th.dataset.sort === state.sortBy);
  });

  if (state.loading && !state.leaderboard.length) {
    container.innerHTML = `<tr><td colspan="5" class="loading-cell">Fetching scores from ESPN…</td></tr>`;
    return;
  }

  if (state.error && !state.leaderboard.length) {
    container.innerHTML = `<tr><td colspan="5" class="error-cell">${state.error}</td></tr>`;
    return;
  }

  let html = "";

  // Pre-tournament banner
  if (state.tournamentState === "pre") {
    const tournament = TOURNAMENTS[ACTIVE_TOURNAMENT];
    html += `<tr><td colspan="5" class="info-cell">
      ⛳ Tournament starts ${formatDateDisplay(tournament.startDate)} — rosters below
    </td></tr>`;
  }

  // Error banner row (non-blocking)
  if (state.error) {
    html += `<tr><td colspan="5" class="error-cell" style="padding:8px 20px;">${state.error}</td></tr>`;
  }

  for (const result of state.leaderboard) {
    const isExpanded = state.expandedManager === result.manager.id;
    const hasRoster  = result.golferNames.length > 0;
    const hasScores  = result.combined.total !== null;

    // ---- Manager row ----
    html += `
      <tr class="manager-row ${isExpanded ? "expanded" : ""} ${!hasRoster ? "no-roster" : ""}"
          onclick="${hasRoster ? `toggleManager('${result.manager.id}')` : ""}">
        <td class="rank-cell">${result.rank}</td>
        <td class="name-cell">
          <span class="manager-name">${result.manager.name}</span>
          <span class="roster-count">${result.manager.teamName}</span>
        </td>
        <td class="score-cell ${hasScores ? scoreColorClass(result.combined.total) : ""}">
          <span class="score-primary">${result.combined.totalDisplay}</span>
          <span class="score-label">Combined</span>
        </td>
        <td class="score-cell ${hasScores ? scoreColorClass(result.bestBall.total) : ""}">
          <span class="score-primary">${result.bestBall.totalDisplay}</span>
          <span class="score-label">Best Ball</span>
        </td>
        <td class="expand-cell">${hasRoster ? (isExpanded ? "▲" : "▼") : ""}</td>
      </tr>`;

    // ---- Expanded detail ----
    if (isExpanded && hasRoster) {
      html += `<tr class="detail-row"><td colspan="5"><div class="detail-panel">`;

      // -- Player cards --
      html += `<div class="detail-section-label">Roster</div>`;
      html += `<div class="detail-grid">`;

      for (const name of result.golferNames) {
        const g     = state.playerScores[name];
        const found = !!g;

        if (!found) {
          // Pre-tournament or not in field
          const isPre = state.tournamentState === "pre";
          html += `
            <div class="golfer-card ${isPre ? "" : "not-found"}">
              <div class="golfer-name">${name}</div>
              <div class="golfer-score">${isPre ? "--" : "Not in field"}</div>
            </div>`;
          continue;
        }

        const cutBadge = g.missedCut
          ? `<span class="cut-badge">CUT</span>`
          : g.withdrawn ? `<span class="cut-badge wd-badge">WD</span>` : "";

        html += `
          <div class="golfer-card ${g.missedCut || g.withdrawn ? "cut" : ""}"
               onclick="toggleGolfer('${result.manager.id}', '${name.replace(/'/g, "\\'")}')">
            <div class="golfer-name">${name} ${cutBadge}</div>
            <div class="golfer-score ${scoreColorClass(g.overallToPar)}">${g.overallToParDisplay}</div>
            <div class="golfer-position">${g.position}</div>
            ${renderRoundSummary(g)}
          </div>`;
      }

      html += `</div>`; // detail-grid

      // -- Hole-by-hole for expanded golfer (if any) --
      if (state.expandedGolfer?.managerId === result.manager.id) {
        const gName = state.expandedGolfer.golferName;
        const g     = state.playerScores[gName];
        if (g) {
          html += renderHoleByHole(g);
        }
      }

      // -- Best ball breakdown --
      if (result.bestBall.rounds.length > 0) {
        html += renderBestBallBreakdown(result);
      }

      html += `</div></td></tr>`; // detail-panel, td, tr
    }
  }

  container.innerHTML = html;
}

// ============================================================
//  DETAIL RENDER HELPERS
// ============================================================

function renderRoundSummary(g) {
  if (!g.rounds.length) return "";
  const chips = g.rounds.map(r =>
    `<span class="round-chip ${scoreColorClass(r.toPar)}">R${r.roundNum}: ${r.toParDisplay}</span>`
  ).join("");
  return `<div class="golfer-rounds">${chips}</div>`;
}

function renderHoleByHole(g) {
  if (!g.rounds.length) return "";
  let html = `<div class="hole-breakdown">`;
  html += `<div class="hole-breakdown-title">${g.name} — Hole by Hole</div>`;

  for (const round of g.rounds) {
    html += `<div class="round-row">`;
    html += `<span class="round-label">R${round.roundNum} <span class="${scoreColorClass(round.toPar)}">${round.toParDisplay}</span></span>`;
    html += `<div class="holes-strip">`;

    for (let h = 1; h <= 18; h++) {
      const hData = round.holes.find(x => x.hole === h);
      if (!hData) {
        html += `<div class="hole-box hole-empty"><span class="hole-num">${h}</span><span class="hole-score">–</span></div>`;
      } else {
        html += `
          <div class="hole-box ${holeColorClass(hData.toPar)}">
            <span class="hole-num">${h}</span>
            <span class="hole-score">${hData.strokes}</span>
            <span class="hole-par">p${hData.par}</span>
          </div>`;
      }
    }

    html += `</div></div>`; // holes-strip, round-row
  }

  html += `</div>`; // hole-breakdown
  return html;
}

function renderBestBallBreakdown(result) {
  const bb = result.bestBall;
  let html = `<div class="bb-breakdown">`;
  html += `<div class="detail-section-label">Best Ball Breakdown</div>`;

  for (const round of bb.rounds) {
    html += `<div class="bb-round-block">`;
    html += `<div class="bb-round-header">
      Round ${round.roundNum}
      <span class="${scoreColorClass(round.toPar)}">${round.toParDisplay}</span>
    </div>`;
    html += `<div class="holes-strip">`;

    for (let h = 1; h <= 18; h++) {
      const hData = round.holes.find(x => x.hole === h);
      if (!hData) {
        html += `<div class="hole-box hole-empty"><span class="hole-num">${h}</span><span class="hole-score">–</span></div>`;
      } else {
        // Build tooltip showing which player(s) contributed
        const contributors = hData.bestPlayers.map(n => shortName(n)).join(", ");
        const isTie        = hData.bestPlayers.length > 1;
        html += `
          <div class="hole-box ${holeColorClass(hData.toPar)} bb-hole ${isTie ? "bb-tie" : ""}"
               title="${contributors}">
            <span class="hole-num">${h}</span>
            <span class="hole-score">${hData.bestStrokes}</span>
            <span class="hole-contributor">${shortName(hData.bestPlayers[0])}${isTie ? "+" : ""}</span>
          </div>`;
      }
    }

    html += `</div></div>`; // holes-strip, bb-round-block
  }

  html += `</div>`; // bb-breakdown
  return html;
}

// ============================================================
//  UI HELPERS
// ============================================================

function scoreColorClass(val) {
  if (val === null || val === undefined) return "";
  if (val < 0)  return "score-under";
  if (val === 0) return "score-even";
  return "score-over";
}

function holeColorClass(toPar) {
  if (toPar <= -2) return "hole-eagle";
  if (toPar === -1) return "hole-birdie";
  if (toPar === 0)  return "hole-par";
  if (toPar === 1)  return "hole-bogey";
  return "hole-double";
}

function shortName(fullName) {
  if (!fullName) return "";
  const parts = fullName.split(" ");
  if (parts.length < 2) return fullName;
  return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
}

function setLoading(val) {
  state.loading = val;
  const btn = document.getElementById("refresh-btn");
  if (btn) btn.disabled = val;
  const ind = document.getElementById("loading-indicator");
  if (ind) ind.style.display = val ? "inline" : "none";
}

function setError(msg) {
  state.error   = msg;
  state.loading = false;
  setLoading(false);
  renderLeaderboard();
}

function toggleManager(managerId) {
  state.expandedManager = state.expandedManager === managerId ? null : managerId;
  state.expandedGolfer  = null;
  renderLeaderboard();
}

function toggleGolfer(managerId, golferName) {
  const already =
    state.expandedGolfer?.managerId   === managerId &&
    state.expandedGolfer?.golferName  === golferName;
  state.expandedGolfer = already ? null : { managerId, golferName };
  renderLeaderboard();
}

function setSortBy(col) {
  state.sortBy = col;
  state.leaderboard = computeLeaderboard();
  renderLeaderboard();
}

// ============================================================
//  BOOTSTRAP
// ============================================================

async function init() {
  renderHeader();
  await fetchScores();
  setInterval(fetchScores, REFRESH_MS);

  const btn = document.getElementById("refresh-btn");
  if (btn) btn.addEventListener("click", fetchScores);
}

document.addEventListener("DOMContentLoaded", init);

// Expose globals needed by index.html
window.state        = state;
window.fetchScores  = fetchScores;
window.toggleManager = toggleManager;
window.toggleGolfer  = toggleGolfer;
window.setSortBy     = setSortBy;
