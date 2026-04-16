// ============================================================
//  SPGA FANTASY — Sub-Par Golf Association Fantasy Golf League
//  app.js  |  ESPN API + Scoring Engine + UI Controller
// ============================================================

const ESPN_BASE  = "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard";
const CORS_PROXY = "https://corsproxy.io/?url=";
const REFRESH_MS = 120000; // 2 minutes

// ============================================================
//  STATE
// ============================================================

const state = {
  playerScores:     {},    // { "Player Name": parsedPlayerObject }
  leaderboard:      [],    // computed manager results
  lastUpdated:      null,
  loading:          false,
  error:            null,
  tournamentState:  null,  // "pre" | "live" | "post"
  expandedManagers: new Set(), // Set of managerId strings
  expandedGolfers:  new Set(), // Set of "managerId|golferName" strings
  expandedBB:       new Set(), // Set of managerId strings with BB panel open
  bbHighlight:      new Set(), // Set of "managerId|golferName" strings
  sortBy:           "combined", // "combined" | "bestball"
};

// ============================================================
//  DATE HELPERS
// ============================================================

function parseDate(yyyymmdd) {
  const s = String(yyyymmdd);
  return new Date(parseInt(s.slice(0,4)), parseInt(s.slice(4,6)) - 1, parseInt(s.slice(6,8)));
}

function todayMidnight() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

function formatDateDisplay(yyyymmdd) {
  return parseDate(yyyymmdd).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
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
  return tState === "post" ? `${ESPN_BASE}?dates=${tournament.endDate}` : ESPN_BASE;
}

// ============================================================
//  FETCH
// ============================================================

async function fetchScores() {
  const tournament = TOURNAMENTS[ACTIVE_TOURNAMENT];
  if (!tournament) { setError("No active tournament configured in data.js"); return; }

  const tState = getTournamentState(tournament);
  state.tournamentState = tState;

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
    if (!res || !res.ok) res = await fetch(`${CORS_PROXY}${encodeURIComponent(url)}`);
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

  // First pass: build player objects without positions
  const playerList = [];
  for (const comp of competitors) {
    const name = comp.athlete?.displayName;
    if (!name) continue;
    playerList.push({
      name,
      order:               comp.order ?? 999,
      missedCut:           inferMissedCut(comp),
      overallToPar:        parseToParValue(comp.score ?? "E"),
      overallToParDisplay: comp.score ?? "E",
      rounds:              parseRounds(comp.linescores ?? []),
    });
  }

  // Rank a sorted group, prefixing ties with "T"
  function assignPositions(list, startRank) {
    let rank = startRank;
    for (let i = 0; i < list.length; ) {
      const score = list[i].overallToPar;
      let j = i;
      while (j < list.length && list[j].overallToPar === score) j++;
      const tied = j - i > 1;
      for (let k = i; k < j; k++) list[k].position = tied ? `T${rank}` : `${rank}`;
      rank = j + 1;
      i = j;
    }
  }

  // Active and cut players ranked separately, each sorted by score then ESPN order
  const byScore = (a, b) => a.overallToPar - b.overallToPar || a.order - b.order;
  const active  = playerList.filter(p => !p.missedCut).sort(byScore);
  const cut     = playerList.filter(p =>  p.missedCut).sort(byScore);

  assignPositions(active, 1);
  assignPositions(cut, active.length + 1);

  for (const group of [active, cut]) {
    for (const player of group) {
      scores[player.name] = { name: player.name, position: player.position ?? "--", missedCut: player.missedCut, overallToPar: player.overallToPar, overallToParDisplay: player.overallToParDisplay, rounds: player.rounds };
    }
  }
  return scores;
}

// ============================================================
//  PARSE ROUNDS & HOLES
// ============================================================

function parseRounds(linescores) {
  const rounds = [];
  for (const ls of linescores) {
    if (!ls.linescores || ls.linescores.length === 0) continue;
    if (ls.displayValue === "-" && ls.value === 0) continue;
    rounds.push({
      roundNum:     ls.period,
      totalStrokes: Math.round(ls.value),
      toParDisplay: ls.displayValue,
      toPar:        parseToParValue(ls.displayValue),
      holes: ls.linescores
        .map(h => {
          const strokes   = Math.round(h.value);
          const scoreDisp = h.scoreType?.displayValue ?? "E";
          const toParHole = parseToParValue(scoreDisp);
          return { hole: h.period, strokes, par: strokes - toParHole, toPar: toParHole };
        })
        .sort((a, b) => a.hole - b.hole),
    });
  }
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

function inferMissedCut(comp) {
  const ls = comp.linescores ?? [];
  const withHoles = ls.filter(r => r.linescores?.length > 0 && !(r.displayValue === "-" && r.value === 0));
  return withHoles.length === 2 && ls.length >= 3 && (ls[2]?.linescores?.length ?? 0) === 0;
}

// ============================================================
//  SCORING ENGINE
// ============================================================

function calcCombined(golferNames) {
  let total = 0, hasScore = false;
  for (const name of golferNames) {
    const g = state.playerScores[name];
    if (!g) continue;
    total += g.overallToPar;
    hasScore = true;
  }
  return { total: hasScore ? total : null, totalDisplay: hasScore ? formatToPar(total) : "--" };
}

function calcBestBall(golferNames) {
  const players = golferNames.map(n => state.playerScores[n]).filter(Boolean);
  if (!players.length) return { total: null, totalDisplay: "--", rounds: [] };

  const maxRound = Math.max(...players.map(p => p.rounds.length), 0);
  if (!maxRound) return { total: null, totalDisplay: "--", rounds: [] };

  const bbRounds = [];
  let bbTotalToPar = 0;

  for (let r = 1; r <= maxRound; r++) {
    const holeResults = [];
    let bbRoundStrokes = 0;

    for (let hole = 1; hole <= 18; hole++) {
      let bestStrokes = Infinity, par = null, bestPlayers = [];
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
      if (bestStrokes === Infinity) continue;
      bbRoundStrokes += bestStrokes;
      holeResults.push({ hole, bestStrokes, par, toPar: par !== null ? bestStrokes - par : 0, bestPlayers });
    }

    if (!holeResults.length) continue;

    const roundToPar = holeResults.reduce((s, h) => h.par !== null ? s + (h.bestStrokes - h.par) : s, 0);
    bbTotalToPar += roundToPar;
    bbRounds.push({
      roundNum:     r,
      totalStrokes: bbRoundStrokes,
      toPar:        roundToPar,
      toParDisplay: formatToPar(roundToPar),
      holes:        holeResults,
    });
  }

  return { total: bbTotalToPar, totalDisplay: formatToPar(bbTotalToPar), rounds: bbRounds };
}

function formatToPar(val) {
  if (val === null || val === undefined) return "--";
  if (val === 0) return "E";
  return val < 0 ? `${val}` : `+${val}`;
}

// ============================================================
//  LEADERBOARD BUILDER
// ============================================================

function computeLeaderboard() {
  const results = MANAGERS.map(manager => {
    const golferNames = manager.golfers[ACTIVE_TOURNAMENT] ?? [];
    return { manager, golferNames, combined: calcCombined(golferNames), bestBall: calcBestBall(golferNames) };
  });
  sortLeaderboard(results);
  assignRanks(results);
  return results;
}

function sortLeaderboard(results) {
  results.sort((a, b) => {
    const aHas = a.golferNames.length > 0, bHas = b.golferNames.length > 0;
    if (!aHas && bHas) return 1;
    if (aHas && !bHas) return -1;
    if (!aHas && !bHas) return 0;
    if (state.sortBy === "bestball") {
      const d = (a.bestBall.total ?? 999) - (b.bestBall.total ?? 999);
      return d !== 0 ? d : (a.combined.total ?? 999) - (b.combined.total ?? 999);
    }
    const d = (a.combined.total ?? 999) - (b.combined.total ?? 999);
    return d !== 0 ? d : (a.bestBall.total ?? 999) - (b.bestBall.total ?? 999);
  });
}

function assignRanks(results) {
  let rank = 1;
  for (let i = 0; i < results.length; i++) {
    if (!results[i].golferNames.length) { results[i].rank = "--"; continue; }
    if (i > 0) {
      const p = results[i-1], c = results[i];
      if (!(p.combined.total === c.combined.total && p.bestBall.total === c.bestBall.total)) rank = i + 1;
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
  const t = TOURNAMENTS[ACTIVE_TOURNAMENT];
  document.getElementById("tournament-name").textContent = t?.name ?? "-";
  document.getElementById("tournament-loc").textContent  = t?.location ?? "";
  if (t) {
    document.getElementById("tournament-dates").textContent =
      `${formatDateDisplay(t.startDate)} – ${formatDateDisplay(t.endDate)}`;
  }
  if (state.lastUpdated) {
    document.getElementById("last-updated").textContent =
      `Updated ${state.lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }
}

function renderLeaderboard() {
  const container = document.getElementById("leaderboard-body");
  if (!container) return;

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

  if (state.tournamentState === "pre") {
    const t = TOURNAMENTS[ACTIVE_TOURNAMENT];
    html += `<tr><td colspan="5" class="info-cell">Tournament Starts: ${formatDateDisplay(t.startDate)} | Draft: ${formatDateDisplay(t.startDate-4)}</td></tr>`;
  }
  if (state.error) {
    html += `<tr><td colspan="5" class="error-cell" style="padding:8px 20px;">${state.error}</td></tr>`;
  }

  for (const result of state.leaderboard) {
    const isExpanded = state.expandedManagers.has(result.manager.id);
    const hasRoster  = result.golferNames.length > 0;
    const hasScores  = result.combined.total !== null;

    html += `
      <tr class="manager-row ${isExpanded ? "expanded" : ""} ${!hasRoster ? "no-roster" : ""}"
          data-rank="${result.rank}"
          onclick="${hasRoster ? `toggleManager('${result.manager.id}')` : ""}">
        <td class="rank-cell">${result.rank}</td>
        <td class="name-cell">
          <span class="manager-name">${result.manager.name}</span>
          <span class="team-name">${result.manager.teamName}</span>
        </td>
        <td class="score-cell ${hasScores ? scoreColorClass(result.combined.total) : ""}">
          <span class="score-primary">${result.combined.totalDisplay}</span>
        </td>
        <td class="score-cell ${hasScores ? scoreColorClass(result.bestBall.total) : ""}">
          <span class="score-primary">${result.bestBall.totalDisplay}</span>
        </td>
        <td class="expand-cell">${hasRoster ? (isExpanded ? "▲" : "▼") : ""}</td>
      </tr>`;

    if (isExpanded && hasRoster) {
      html += `<tr class="detail-row"><td colspan="5"><div class="detail-panel">`;
      html += `<div class="detail-section-label">Roster</div>`;
      html += `<div class="golfer-list">`;

      for (const name of result.golferNames) {
        const g    = state.playerScores[name];
        const gKey = `${result.manager.id}|${name}`;
        const isGolferExpanded = state.expandedGolfers.has(gKey);
        const bbOn = state.bbHighlight.has(gKey);

        if (!g) {
          const isPre = state.tournamentState === "pre";
          html += `
            <div class="golfer-list-item ${isPre ? "" : "not-found"}">
              <div class="golfer-list-main no-cursor">
                <div class="golfer-list-left">
                  <span class="golfer-name">${name}</span>
                </div>
                <span class="golfer-score">${isPre ? "--" : "N/A"}</span>
              </div>
            </div>`;
          continue;
        }

        const cutBadge = g.missedCut ? `<span class="cut-badge">MC</span>` : "";
        html += `
          <div class="golfer-list-item ${g.missedCut ? "cut" : ""} ${isGolferExpanded ? "expanded" : ""}">
            <div class="golfer-list-main"
                 onclick="toggleGolfer('${result.manager.id}', '${name.replace(/'/g, "\\'")}')">
              <div class="golfer-list-left">
                <span class="golfer-name">${name}${cutBadge}</span>
                <span class="golfer-position">${g.position}</span>
              </div>
              <div class="golfer-list-right">
                <span class="golfer-score ${scoreColorClass(g.overallToPar)}">${g.overallToParDisplay}</span>
                <span class="golfer-expand-chevron">${isGolferExpanded ? "▲" : "▼"}</span>
              </div>
            </div>`;

        if (isGolferExpanded) {
          html += renderScorecard(g.rounds, {
            type: "player", g, managerId: result.manager.id, golferName: name, bbHighlightOn: bbOn,
          });
        }

        html += `</div>`; // golfer-list-item
      }

      html += `</div>`; // golfer-list

      // Best ball expandable row — outside the roster list
      if (result.bestBall.rounds.length > 0) {
        const bbExpanded = state.expandedBB.has(result.manager.id);
        html += `<div class="bb-section">`;
        html += `<div class="golfer-list-item bb-row ${bbExpanded ? "expanded" : ""}">
          <div class="golfer-list-main" onclick="toggleBBExpand('${result.manager.id}')">
            <div class="golfer-list-left">
              <span class="golfer-name bb-label">Team Best Ball</span>
            </div>
            <div class="golfer-list-right">
              <span class="golfer-score ${scoreColorClass(result.bestBall.total)}">${result.bestBall.totalDisplay}</span>
              <span class="golfer-expand-chevron">${bbExpanded ? "▲" : "▼"}</span>
            </div>
          </div>`;
        if (bbExpanded) {
          html += renderScorecard(result.bestBall.rounds, { type: "bestball" });
        }
        html += `</div></div>`; // golfer-list-item, bb-section
      }

      html += `</div></td></tr>`; // detail-panel, td, tr
    }
  }

  container.innerHTML = html;
}

// ============================================================
//  DETAIL RENDER HELPERS
// ============================================================

function renderRoundChips(rounds) {
  if (!rounds.length) return "";
  return `<div class="golfer-rounds">${
    rounds.map(r => `<span class="round-chip ${scoreColorClass(r.toPar)}">R${r.roundNum}: ${r.toParDisplay}</span>`).join("")
  }</div>`;
}

// Unified scorecard renderer for player hole-by-hole and best ball breakdown.
// opts.type = "player" | "bestball"
// "player" opts: g, managerId, golferName, bbHighlightOn
// "bestball" opts: (just rounds passed in, holes use .bestStrokes + .bestPlayers)
function renderScorecard(rounds, opts) {
  if (!rounds.length) return "";

  const bbContribMap = {};
  let html = `<div class="hole-breakdown">`;

  if (opts.type === "player") {
    // Build BB contribution map for highlight toggle
    const result = state.leaderboard.find(r => r.manager.id === opts.managerId);
    if (result) {
      for (const bbRound of result.bestBall.rounds) {
        bbContribMap[bbRound.roundNum] = new Set(
          bbRound.holes.filter(h => h.bestPlayers.includes(opts.g.name)).map(h => h.hole)
        );
      }
    }
    const safeGolferName = opts.golferName.replace(/'/g, "\\'");
    const toggleLabel = opts.bbHighlightOn ? "Hide BB Holes" : "Show BB Holes";
      html += `<div class="hole-breakdown-header">
    <div class="hole-breakdown-title">${opts.g.name} — Scorecard</div>
    <div class="hole-breakdown-right">
      <button class="bb-toggle-btn ${opts.bbHighlightOn ? "active" : ""}"
        onclick="event.stopPropagation(); toggleBBHighlight('${opts.managerId}', '${safeGolferName}')"
        title="Highlight holes that contributed to best ball">${toggleLabel}</button>
    </div>
    </div>
    ${renderRoundChips(opts.g.rounds)}`;
  }

  if (opts.type === "bestball") {
    html += `<div class="hole-breakdown-header">
      <div class="hole-breakdown-title">Scorecard</div>
      <div class="hole-breakdown-title bb">Click score to reveal players</div>
    </div>
    ${renderRoundChips(rounds)}`;
  }

  for (const round of rounds) {
    const front = [], back = [];
    for (let h = 1; h <= 18; h++) {
      const hData = round.holes.find(x => x.hole === h) ?? null;
      (h <= 9 ? front : back).push({ h, hData });
    }

    const strokeKey   = opts.type === "bestball" ? "bestStrokes" : "strokes";
    const sumStrokes  = arr => arr.reduce((s, { hData }) => s + (hData?.[strokeKey] ?? 0), 0);
    const sumPar      = arr => arr.reduce((s, { hData }) => s + (hData?.par ?? 0), 0);
    const anyPlayed   = arr => arr.some(({ hData }) => hData !== null);

    const frontStrokes = sumStrokes(front), backStrokes = sumStrokes(back);
    const frontPar = sumPar(front), backPar = sumPar(back);
    const frontPlayed = anyPlayed(front), backPlayed = anyPlayed(back);
    const frontToPar = frontStrokes - frontPar, backToPar = backStrokes - backPar;

    html += `<div class="scorecard-round">`;
    html += `<div class="scorecard-round-label">Round ${round.roundNum}: ${round.totalStrokes} <span class="${scoreColorClass(round.toPar)}">${round.toParDisplay}</span></div>`;
    html += `<div class="scorecard-scroll-wrap"><table class="scorecard-table">`;

    // HOLE header row
    html += `<thead><tr><th class="sc-label-cell">HOLE</th>`;
    for (const { h } of front) html += `<th class="sc-hole-header">${h}</th>`;
    html += `<th class="sc-section-total sc-header-total">OUT</th>`;
    for (const { h } of back)  html += `<th class="sc-hole-header">${h}</th>`;
    html += `<th class="sc-section-total sc-header-total">IN</th>`;
    html += `<th class="sc-section-total sc-header-total">TOT</th>`;
    html += `</tr></thead><tbody>`;

    // PAR row
    html += `<tr class="sc-par-row"><td class="sc-label-cell">PAR</td>`;
    for (const { hData } of front) html += `<td class="sc-par-cell">${hData?.par ?? "-"}</td>`;
    html += `<td class="sc-section-total sc-par-cell">${frontPlayed ? frontPar : "-"}</td>`;
    for (const { hData } of back)  html += `<td class="sc-par-cell">${hData?.par ?? "-"}</td>`;
    html += `<td class="sc-section-total sc-par-cell">${backPlayed ? backPar : "-"}</td>`;
    html += `<td class="sc-section-total sc-par-cell">${frontPlayed || backPlayed ? frontPar + backPar : "-"}</td>`;
    html += `</tr>`;

    // SCORE row
    html += `<tr class="sc-score-row"><td class="sc-label-cell">SCORE</td>`;
    for (const { h, hData } of front) {
      const isBB = opts.type === "player" && opts.bbHighlightOn && (bbContribMap[round.roundNum]?.has(h) ?? false);
      html += renderScorecardCell(hData, opts.type, isBB);
    }
    html += renderTotalCell(frontPlayed, frontStrokes, frontToPar);
    for (const { h, hData } of back) {
      const isBB = opts.type === "player" && opts.bbHighlightOn && (bbContribMap[round.roundNum]?.has(h) ?? false);
      html += renderScorecardCell(hData, opts.type, isBB);
    }
    html += renderTotalCell(backPlayed, backStrokes, backToPar);
    html += renderTotalCell(frontPlayed || backPlayed, frontStrokes + backStrokes, frontToPar + backToPar);
    html += `</tr>`;

    /* // BY row (best ball only) — click-to-show tooltip
    if (opts.type === "bestball") {
      html += `<tr class="sc-by-row"><td class="sc-label-cell sc-by-label">BY</td>`;
      for (const { hData } of front) html += renderByCell(hData);
      html += `<td class="sc-section-total sc-by-cell"></td>`;
      for (const { hData } of back)  html += renderByCell(hData);
      html += `<td class="sc-section-total sc-by-cell"></td>`;
      html += `<td class="sc-section-total sc-by-cell"></td>`;
      html += `</tr>`;
    }
    */

    html += `</tbody></table></div></div>`; // table, scroll-wrap, scorecard-round
  }

  html += `</div>`; // hole-breakdown
  return html;
}

function renderScorecardCell(hData, type, isBB) {
  if (!hData) return `<td class="sc-score-cell sc-empty">–</td>`;
  const strokes = type === "bestball" ? hData.bestStrokes : hData.strokes;
  const bbClass = isBB ? " sc-bb-hole" : "";
  if (type === "bestball") {
    const players = hData.bestPlayers.map(playerInitials).join(" · ");
    return `<td class="sc-score-cell ${holeColorClass(hData.toPar)} sc-bb-clickable"
      data-players="${players}"
      onclick="event.stopPropagation(); showBBPopup(this, '${players}')">${strokes}</td>`;
  }
  return `<td class="sc-score-cell ${holeColorClass(hData.toPar)}${bbClass}"><span class="sc-stroke">${strokes}</span></td>`;
}

function renderTotalCell(played, strokes, toPar) {
  if (!played) return `<td class="sc-section-total sc-score-cell"><span class="sc-total-strokes">-</span></td>`;
  return `<td class="sc-section-total sc-score-cell ${scoreColorClass(toPar)}">
    <span class="sc-total-strokes">${strokes}</span>
    <span class="sc-total-topar">${formatToPar(toPar)}</span>
  </td>`;
}

function playerInitials(fullName) {
  if (!fullName) return "";
  const parts = fullName.trim().split(/\s+/);
  return parts.length === 1 ? parts[0][0].toUpperCase() : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ============================================================
//  UI HELPERS
// ============================================================

function toggleSet(set, key) {
  if (set.has(key)) set.delete(key);
  else set.add(key);
}

function scoreColorClass(val) {
  if (val == null) return "";
  if (val < 0)     return "score-under";
  if (val === 0)   return "score-even";
  return "score-over";
}

function holeColorClass(toPar) {
  if (toPar <= -2) return "hole-eagle";
  if (toPar === -1) return "hole-birdie";
  if (toPar === 0)  return "hole-par";
  if (toPar === 1)  return "hole-bogey";
  return "hole-double";
}

function setLoading(val) {
  state.loading = val;
  const btn = document.getElementById("refresh-btn");
  if (btn) btn.disabled = val;
  // visibility:hidden preserves space, display:none would cause layout shift
  const ind = document.getElementById("loading-indicator");
  if (ind) ind.style.visibility = val ? "visible" : "hidden";
}

function setError(msg) {
  state.error = msg;
  setLoading(false);
  renderLeaderboard();
}

function toggleManager(managerId) {
  if (state.expandedManagers.has(managerId)) {
    state.expandedManagers.delete(managerId);
    for (const key of [...state.expandedGolfers]) {
      if (key.startsWith(managerId + "|")) state.expandedGolfers.delete(key);
    }
    for (const key of [...state.bbHighlight]) {
      if (key.startsWith(managerId + "|")) state.bbHighlight.delete(key);
    }
    state.expandedBB.delete(managerId);
  } else {
    state.expandedManagers.add(managerId);
  }
  renderLeaderboard();
}

function toggleGolfer(managerId, golferName) {
  const key = `${managerId}|${golferName}`;
  if (state.expandedGolfers.has(key)) {
    state.expandedGolfers.delete(key);
    state.bbHighlight.delete(key);
  } else {
    state.expandedGolfers.add(key);
  }
  renderLeaderboard();
}

function toggleBBExpand(managerId) {
  toggleSet(state.expandedBB, managerId);
  renderLeaderboard();
}

function toggleBBHighlight(managerId, golferName) {
  toggleSet(state.bbHighlight, `${managerId}|${golferName}`);
  renderLeaderboard();
}

function showBBPopup(cell, players) {
  const existing = cell.querySelector(".bb-popup");
  document.querySelectorAll(".bb-popup").forEach(el => el.remove());
  if (existing) return;

  const popup = document.createElement("div");
  popup.className = "bb-popup";
  popup.textContent = players;
  cell.style.position = "relative";
  cell.appendChild(popup);

  // Close on next outside click
  setTimeout(() => {
    document.addEventListener("click", function handler() {
      document.querySelectorAll(".bb-popup").forEach(el => el.remove());
      document.removeEventListener("click", handler);
    });
  }, 0);
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
  document.getElementById("refresh-btn")?.addEventListener("click", fetchScores);

}

document.addEventListener("DOMContentLoaded", init);

// Expose globals needed by index.html
window.state             = state;
window.fetchScores       = fetchScores;
window.toggleManager     = toggleManager;
window.toggleGolfer      = toggleGolfer;
window.toggleBBExpand    = toggleBBExpand;
window.toggleBBHighlight = toggleBBHighlight;
window.showBBPopup       = showBBPopup;
window.setSortBy         = setSortBy;
