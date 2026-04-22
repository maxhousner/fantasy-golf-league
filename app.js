// ============================================================
//  SPGA FANTASY — Sub-Par Golf Association Fantasy Golf League
//  app.js  |  ESPN API + Scoring Engine + UI Controller
// ============================================================

const ESPN_BASE  = "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard";
const CORS_PROXY = "https://corsproxy.io/?url=";
const REFRESH_MS = 120000; // 2 minutes

// Canonical hole-type keys. Order mirrors POINTS_CONFIG.perHole.
const HOLE_KEYS = ["doubleEagle", "eagle", "birdie", "par", "bogey", "double", "worse"];

// ============================================================
//  STATE
// ============================================================

const state = {
  playerScores: {},            // { [normalizedName]: playerObject } — keys normalized via normalizeName()
  leaderboard: [],             // computed manager results
  lastUpdated: null,
  loading: false,
  error: null,
  tournamentState: null,       // "pre" | "live" | "post"
  expandedManagers: new Set(), // managerId strings
  expandedGolfers: new Set(),  // "managerId|golferName" strings
  expandedBB: new Set(),       // managerId strings with BB panel open
  bbHighlight: new Set(),      // "managerId|golferName" strings
  expandedPoints: new Set(),   // "managerId|golferName" strings
  sortBy: "points",            // "combined" | "bestball" | "points"
  cutLowestPlayer: true,
  showCombined: false,
  activeView: "fantasy",       // "fantasy" | "field"
  expandedFieldGolfers: new Set(),
  expandedFieldPoints: new Set(),
  fieldGolferPoints: {},       // { [normalizedName]: pointsObject } — scored once per fetch, shared by manager and field views
  fieldSortBy: "score",        // "pts" | "score"
  autoExpandedFor: null,       // tournament key that pre-tournament rosters have been auto-expanded for; reset on tab switch
  animatingExpand: new Set(),  // keys to play the expand animation once on next render; cleared at end of render()
};

// ============================================================
//  HELPERS
// ============================================================

const normalizeName = name => String(name ?? "").trim().toLowerCase();

function getPlayer(name) { return state.playerScores[normalizeName(name)]; }
function getPoints(name) { return state.fieldGolferPoints[normalizeName(name)]; }

const zeroCounts = () => Object.fromEntries(HOLE_KEYS.map(k => [k, 0]));

function classifyHole(toPar) {
  if (toPar <= -3) return "doubleEagle";
  if (toPar === -2) return "eagle";
  if (toPar === -1) return "birdie";
  if (toPar === 0)  return "par";
  if (toPar === 1)  return "bogey";
  if (toPar === 2)  return "double";
  return "worse";
}

function deleteByPrefix(set, prefix) {
  for (const key of [...set]) if (key.startsWith(prefix)) set.delete(key);
}

function toggleSet(set, key) {
  if (set.has(key)) set.delete(key);
  else set.add(key);
}

// ============================================================
//  DATE HELPERS
// ============================================================

function parseDate(yyyymmdd) {
  const s = String(yyyymmdd);
  return new Date(parseInt(s.slice(0, 4)), parseInt(s.slice(4, 6)) - 1, parseInt(s.slice(6, 8)));
}

function todayMidnight() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

function formatDateDisplay(yyyymmdd) {
  return parseDate(yyyymmdd).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

// Prefers tournament.draftDate; falls back to 4 days before startDate via Date arithmetic.
function draftDateDisplay(tournament) {
  if (tournament.draftDate) return formatDateDisplay(tournament.draftDate);
  const d = parseDate(tournament.startDate);
  d.setDate(d.getDate() - 4);
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

// ============================================================
//  FETCH
// ============================================================

async function fetchScores() {
  const tournament = TOURNAMENTS[ACTIVE_TOURNAMENT];
  if (!tournament) { setError("No active tournament configured in data.js"); return; }

  const tState = getTournamentState(tournament);
  state.tournamentState = tState;

  if (tState === "pre") {
    state.playerScores      = {};
    state.fieldGolferPoints = {};
    if (state.autoExpandedFor !== ACTIVE_TOURNAMENT) {
      for (const m of MANAGERS) {
        if ((m.golfers[ACTIVE_TOURNAMENT] ?? []).length > 0) state.expandedManagers.add(m.id);
      }
      state.autoExpandedFor = ACTIVE_TOURNAMENT;
    }
    state.leaderboard       = computeLeaderboard();
    state.lastUpdated       = new Date();
    state.error             = null;
    render();
    return;
  }

  setLoading(true);
  const url = tState === "post" ? `${ESPN_BASE}?dates=${tournament.endDate}` : ESPN_BASE;
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

  state.playerScores      = parseESPN(data);
  state.fieldGolferPoints = calcPoints();
  state.leaderboard       = computeLeaderboard();
  state.lastUpdated       = new Date();
  state.error             = null;
  setLoading(false);
  render();
}

// ============================================================
//  PARSE ESPN RESPONSE
// ============================================================

function parseESPN(data) {
  const competitors = data?.events?.[0]?.competitions?.[0]?.competitors ?? [];

  const playerList = [];
  for (const comp of competitors) {
    const name = comp.athlete?.displayName;
    if (!name) continue;
    const rounds = parseRounds(comp.linescores ?? []);
    const overallToPar = rounds.reduce((s, r) => s + r.toPar, 0);
    playerList.push({
      name,
      order:               comp.order ?? 999,
      missedCut:           inferMissedCut(comp),
      overallToPar,
      overallToParDisplay: rounds.length > 0 ? formatToPar(overallToPar) : (comp.score ?? "E"),
      espnSortScore:       parseToParValue(comp.score ?? "E"), // includes playoff result, used only for position ranking
      rounds,
    });
  }

  // Rank a sorted group, prefixing ties with "T".
  function assignPositions(list, startRank) {
    let rank = startRank;
    for (let i = 0; i < list.length; ) {
      const score = list[i].espnSortScore;
      let j = i;
      while (j < list.length && list[j].espnSortScore === score) j++;
      const tied = j - i > 1;
      for (let k = i; k < j; k++) list[k].position = tied ? `T${rank}` : `${rank}`;
      rank = j + 1;
      i = j;
    }
  }

  const byScore = (a, b) => a.espnSortScore - b.espnSortScore || a.order - b.order;
  const active  = playerList.filter(p => !p.missedCut).sort(byScore);
  const cut     = playerList.filter(p =>  p.missedCut).sort(byScore);

  assignPositions(active, 1);

  const scores = {};
  for (const player of [...active, ...cut]) {
    scores[normalizeName(player.name)] = {
      name:                player.name,
      position:            player.missedCut ? "--" : (player.position ?? "--"),
      missedCut:           player.missedCut,
      overallToPar:        player.overallToPar,
      overallToParDisplay: player.overallToParDisplay,
      rounds:              player.rounds,
    };
  }
  return scores;
}

// ============================================================
//  PARSE ROUNDS & HOLES
// ============================================================

function parseRounds(linescores) {
  const rounds = [];
  for (const ls of linescores) {
    if (ls.period > 4) continue; // skip playoff holes (period 5+)
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
  if (withHoles.length !== 2) return false;
  if (ls.some(r => r.period === 4)) return false;
  const r3 = ls.find(r => r.period === 3);
  return r3 !== undefined && "value" in r3 && (r3.linescores?.length ?? 0) === 0;
}

// ============================================================
//  SCORING ENGINE
// ============================================================

function calcCombined(golferNames) {
  let total = 0, hasScore = false;
  for (const name of golferNames) {
    const g = getPlayer(name);
    if (!g) continue;
    total += g.overallToPar;
    hasScore = true;
  }
  return { total: hasScore ? total : null, totalDisplay: hasScore ? formatToPar(total) : "--" };
}

function calcBestBall(golferNames) {
  const players = golferNames.map(getPlayer).filter(Boolean);
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

function formatPoints(val) {
  if (val === null || val === undefined) return "--";
  const r = Math.round(val * 10) / 10;
  return r % 1 === 0 ? String(r) : r.toFixed(1);
}

function getFinishPoints(position) {
  if (!position || position === "--") return 0;
  const pos = parseInt(String(position).replace("T", ""));
  if (isNaN(pos)) return 0;
  const range = POINTS_CONFIG.finishPosition.find(r => pos >= r.min && pos <= r.max);
  return range ? range.pts : 0;
}

// Scores every player in state.playerScores once. Returned map is keyed by normalizedName and is the single
// source of truth consumed by both the manager leaderboard and the field view.
function calcPoints() {
  const cfg    = POINTS_CONFIG.perHole;
  const bonus  = POINTS_CONFIG.bonuses;
  const result = {};

  for (const [key, g] of Object.entries(state.playerScores)) {
    const counts = zeroCounts();
    let holeInOnes = 0, birdieStreaks = 0, bogeyFreeRounds = 0;
    const perRoundPoints = [];

    for (const round of g.rounds) {
      const roundCounts = zeroCounts();
      let roundHoleInOnes = 0, streak = 0, awardedThisRound = false, roundBirdieStreaks = 0;

      for (const hole of round.holes) {
        if (hole.strokes === 1) { holeInOnes++; roundHoleInOnes++; }
        const cls = classifyHole(hole.toPar);
        counts[cls]++;
        roundCounts[cls]++;

        if (hole.toPar <= -1) {
          streak++;
          if (streak >= 3 && !awardedThisRound) { birdieStreaks++; roundBirdieStreaks++; awardedThisRound = true; }
        } else {
          streak = 0;
        }
      }

      const roundBogeyFree = round.holes.length === 18 && round.holes.every(h => h.toPar <= 0);
      if (roundBogeyFree) bogeyFreeRounds++;

      const roundPerHole = HOLE_KEYS.reduce((s, k) => s + roundCounts[k] * cfg[k], 0);
      perRoundPoints.push({
        roundNum: round.roundNum,
        points:   roundPerHole
                  + roundBirdieStreaks * bonus.birdieStreak
                  + (roundBogeyFree ? bonus.bogeyFreeRound : 0)
                  + roundHoleInOnes * bonus.holeInOne,
      });
    }

    const perHolePoints = Object.fromEntries(HOLE_KEYS.map(k => [k, counts[k] * cfg[k]]));
    perHolePoints.total = HOLE_KEYS.reduce((s, k) => s + perHolePoints[k], 0);

    const fourRoundsComplete = state.tournamentState === "post"
      || (g.rounds.length >= 4 && g.rounds[g.rounds.length - 1]?.holes.length === 18);
    const finishEligible = fourRoundsComplete && !g.missedCut;
    const finishPts      = finishEligible ? getFinishPoints(g.position) : 0;

    const allUnder70 = g.rounds.length >= 4 && !g.missedCut
      && g.rounds.every(r => r.holes.length === 18 && r.totalStrokes < 70);

    const bonusPoints = {
      birdieStreaks:   birdieStreaks   * bonus.birdieStreak,
      bogeyFreeRounds: bogeyFreeRounds * bonus.bogeyFreeRound,
      allUnder70:      allUnder70      ? bonus.allUnder70 : 0,
      holeInOne:       holeInOnes      * bonus.holeInOne,
    };
    bonusPoints.total = bonusPoints.birdieStreaks + bonusPoints.bogeyFreeRounds
      + bonusPoints.allUnder70 + bonusPoints.holeInOne;

    result[key] = {
      counts,
      bonusCounts:  { birdieStreaks, bogeyFreeRounds, allUnder70, holeInOne: holeInOnes },
      perHolePoints,
      finishPoints: { position: g.position, points: finishPts },
      bonusPoints,
      perRoundPoints,
      grandTotal:   perHolePoints.total + finishPts + bonusPoints.total,
    };
  }
  return result;
}

// ============================================================
//  FIELD HELPERS
// ============================================================

function tournamentHasRosters() {
  return MANAGERS.some(m => (m.golfers[ACTIVE_TOURNAMENT] ?? []).length > 0);
}

function getDraftedBy(golferName) {
  const target = normalizeName(golferName);
  const drafted = [];
  for (const manager of MANAGERS) {
    const roster = manager.golfers[ACTIVE_TOURNAMENT] ?? [];
    if (roster.some(n => normalizeName(n) === target)) drafted.push(manager.name);
  }
  return drafted;
}

// ============================================================
//  LEADERBOARD BUILDER
// ============================================================

function computeLeaderboard() {
  const results = MANAGERS.map(manager => {
    const golferNames = manager.golfers[ACTIVE_TOURNAMENT] ?? [];

    // Re-key per-manager: roster-name → pointsObject, by looking up the shared fieldGolferPoints map.
    const golferPoints = {};
    for (const name of golferNames) {
      const pts = state.fieldGolferPoints[normalizeName(name)];
      if (pts) golferPoints[name] = pts;
    }
    const scoredNames = golferNames.filter(n => golferPoints[n]);

    let cutPlayerName = null;
    if (state.cutLowestPlayer && scoredNames.length > 0) {
      cutPlayerName = scoredNames.reduce((min, n) =>
        golferPoints[n].grandTotal < golferPoints[min].grandTotal ? n : min
      );
    }

    // teamPoints: manager total after dropping the cutPlayer (if that toggle is on). Null while pre-tournament.
    const teamPoints = golferNames.length > 0 && state.tournamentState !== "pre"
      ? scoredNames.filter(n => n !== cutPlayerName).reduce((s, n) => s + golferPoints[n].grandTotal, 0)
      : null;

    return {
      manager,
      golferNames,
      combined: calcCombined(golferNames),
      bestBall: calcBestBall(golferNames),
      golferPoints,
      teamPoints,
      cutPlayerName,
    };
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
    if (state.sortBy === "points") {
      const d = (b.teamPoints ?? -9999) - (a.teamPoints ?? -9999);
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
      const p = results[i - 1], c = results[i];
      const tied = state.sortBy === "points"
        ? p.teamPoints === c.teamPoints
        : p.combined.total === c.combined.total && p.bestBall.total === c.bestBall.total;
      if (!tied) rank = i + 1;
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
  if (state.activeView === "field") renderFieldLeaderboard();
  state.animatingExpand.clear();
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

  const thCombined = document.getElementById("th-combined");
  if (thCombined) thCombined.style.display = state.showCombined ? "" : "none";

  const colspan = state.showCombined ? 6 : 5;

  if (state.loading && !state.leaderboard.length) {
    container.innerHTML = `<tr><td colspan="${colspan}" class="loading-cell">Fetching scores from ESPN…</td></tr>`;
    return;
  }
  if (state.error && !state.leaderboard.length) {
    container.innerHTML = `<tr><td colspan="${colspan}" class="error-cell">${state.error}</td></tr>`;
    return;
  }

  let html = "";

  if (state.tournamentState === "pre") {
    const t = TOURNAMENTS[ACTIVE_TOURNAMENT];
    html += `<tr><td colspan="${colspan}" class="info-cell">Tournament Starts: ${formatDateDisplay(t.startDate)} | Draft: ${draftDateDisplay(t)}</td></tr>`;
  }
  if (state.error) {
    html += `<tr><td colspan="${colspan}" class="error-cell" style="padding:8px 20px;">${state.error}</td></tr>`;
  }

  for (const result of state.leaderboard) {
    if (state.tournamentState !== "pre" && result.golferNames.length === 0) continue;
    const isExpanded = state.expandedManagers.has(result.manager.id);
    const hasRoster  = result.golferNames.length > 0;
    const hasScores  = result.combined.total !== null;
    const hasTeamPoints = result.teamPoints !== null;

    html += `
      <tr class="manager-row ${isExpanded ? "expanded" : ""} ${!hasRoster ? "no-roster" : ""}"
          data-rank="${result.rank}"
          onclick="${hasRoster ? `toggleManager('${result.manager.id}')` : ""}">
        <td class="rank-cell">${result.rank}</td>
        <td class="name-cell">
          <span class="manager-name">${result.manager.name}</span>
          <span class="team-name">${result.manager.teamName[ACTIVE_TOURNAMENT] ?? ""}</span>
        </td>
        <td class="pts-cell">
          <span class="score-primary">${hasTeamPoints ? formatPoints(result.teamPoints) : "--"}</span>
        </td>
        <td class="score-cell ${hasScores ? scoreColorClass(result.bestBall.total) : ""}">
          <span class="score-primary">${result.bestBall.totalDisplay}</span>
        </td>
        ${state.showCombined ? `<td class="score-cell ${hasScores ? scoreColorClass(result.combined.total) : ""}">
          <span class="score-primary">${result.combined.totalDisplay}</span>
        </td>` : ""}
        <td class="expand-cell">${hasRoster ? (isExpanded ? "▲" : "▼") : ""}</td>
      </tr>`;

    if (isExpanded && hasRoster) {
      const animMgr = state.animatingExpand.has(`mgr:${result.manager.id}`) ? " animating" : "";
      html += `<tr class="detail-row"><td colspan="${colspan}"><div class="detail-panel${animMgr}">`;
      html += `<div class="detail-section-label">Roster</div>`;
      html += `<div class="golfer-list">`;

      for (const golferName of result.golferNames) {
        const g    = getPlayer(golferName);
        const gKey = `${result.manager.id}|${golferName}`;
        const isGolferExpanded = state.expandedGolfers.has(gKey);
        const bbOn = state.bbHighlight.has(gKey);

        if (!g) {
          const isPre = state.tournamentState === "pre";
          html += `
            <div class="golfer-list-item ${isPre ? "" : "not-found"}">
              <div class="golfer-list-main no-cursor">
                <div class="golfer-list-left">
                  <span class="golfer-name">${golferName}</span>
                </div>
                <span class="golfer-score">${isPre ? "--" : "N/A"}</span>
              </div>
            </div>`;
          continue;
        }

        const cutBadge  = g.missedCut ? `<span class="cut-badge">MC</span>` : "";
        const gPts      = result.golferPoints[golferName];
        const lastRound = g.rounds[g.rounds.length - 1];
        const isPlaying = state.tournamentState === "live" && lastRound?.holes.length >= 1 && lastRound.holes.length < 18;
        const safeName  = golferName.replace(/'/g, "\\'");

        html += `
          <div class="golfer-list-item ${g.missedCut ? "cut" : ""} ${isGolferExpanded ? "expanded" : ""}">
            <div class="golfer-list-main"
                 onclick="toggleGolfer('${result.manager.id}', '${safeName}')">
              <div class="golfer-list-left">
                <span class="golfer-name">${golferName}${cutBadge}</span>
                <span class="golfer-position">${g.position}</span>${isPlaying ? `<span class="playing-dot">●</span>` : ""}
              </div>
              <div class="golfer-list-right">
                ${gPts ? `<span class="golfer-pts ${golferName === result.cutPlayerName ? "pts-cut" : ""}">${formatPoints(gPts.grandTotal)}</span>` : ""}
                <span class="golfer-score ${scoreColorClass(g.overallToPar)}">${g.overallToParDisplay}</span>
                <span class="golfer-expand-chevron">${isGolferExpanded ? "▲" : "▼"}</span>
              </div>
            </div>`;

        if (isGolferExpanded) {
          html += renderScorecard(g.rounds, {
            type: "player", g, managerId: result.manager.id, golferName, bbHighlightOn: bbOn,
            animating: state.animatingExpand.has(`gfr:${gKey}`),
          });
        }

        html += `</div>`; // golfer-list-item
      }

      html += `</div>`; // golfer-list

      // Best ball expandable row — outside the roster list
      if (result.bestBall.rounds.length > 0) {
        const bbExpanded = state.expandedBB.has(result.manager.id);
        html += `<div class="bb-section">`;
        html += `<div class="golfer-list-item ${bbExpanded ? "expanded" : ""}">
          <div class="golfer-list-main" onclick="toggleBBExpand('${result.manager.id}')">
            <div class="golfer-list-left">
              <span class="golfer-name">Team Best Ball</span>
            </div>
            <div class="golfer-list-right">
              <span class="golfer-score ${scoreColorClass(result.bestBall.total)}">${result.bestBall.totalDisplay}</span>
              <span class="golfer-expand-chevron">${bbExpanded ? "▲" : "▼"}</span>
            </div>
          </div>`;
        if (bbExpanded) {
          html += renderScorecard(result.bestBall.rounds, {
            type: "bestball",
            animating: state.animatingExpand.has(`bb:${result.manager.id}`),
          });
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

// Builds the round-header label shared by player and field scorecards.
function renderScorecardRoundLabel(round, roundPts) {
  const ptsDisplay = roundPts !== null && roundPts !== undefined
    ? `<span class="score-blue">${formatPoints(roundPts)}</span> / `
    : "";
  return `<div class="scorecard-round-label">Round ${round.roundNum}: ${round.totalStrokes} / ${ptsDisplay}<span class="${scoreColorClass(round.toPar)}">${round.toParDisplay}</span></div>`;
}

// Unified scorecard renderer for player hole-by-hole and best ball breakdown.
// opts.type = "player" | "bestball" | "field"
// "player"   opts: g, managerId, golferName, bbHighlightOn
// "bestball" opts: (just rounds passed in, holes use .bestStrokes + .bestPlayers)
// "field"    opts: g, golferName, gPts
function renderScorecard(rounds, opts) {
  if (!rounds.length) return "";

  const bbContribMap = {};
  let html = `<div class="hole-breakdown${opts.animating ? " animating" : ""}">`;

  if (opts.type === "player") {
    const result = state.leaderboard.find(r => r.manager.id === opts.managerId);
    if (result) {
      for (const bbRound of result.bestBall.rounds) {
        bbContribMap[bbRound.roundNum] = new Set(
          bbRound.holes.filter(h => h.bestPlayers.includes(opts.g.name)).map(h => h.hole)
        );
      }
    }
    const gPts = result?.golferPoints[opts.golferName];
    const safeName = opts.golferName.replace(/'/g, "\\'");
    const isPointsExpanded = state.expandedPoints.has(`${opts.managerId}|${opts.golferName}`);
    const bbLabel  = opts.bbHighlightOn ? "Hide BB Holes" : "Show BB Holes";
    const ptsLabel = isPointsExpanded   ? "Hide Points Breakdown" : "Show Points Breakdown";
    html += `${renderRoundChips(opts.g.rounds)}
    <div class="scorecard-btn-row">
      <button class="scorecard-btn pts-toggle-btn ${isPointsExpanded ? "active" : ""}"
        onclick="event.stopPropagation(); togglePointsBreakdown('${opts.managerId}', '${safeName}')">${ptsLabel}</button>
      <button class="scorecard-btn bb-toggle-btn ${opts.bbHighlightOn ? "active" : ""}"
        onclick="event.stopPropagation(); toggleBBHighlight('${opts.managerId}', '${safeName}')">${bbLabel}</button>
    </div>
    ${isPointsExpanded && gPts ? renderPointsBreakdown(gPts) : ""}`;
  }

  if (opts.type === "bestball") {
    html += `${renderRoundChips(rounds)}
    <div class="hole-breakdown-title bb">Tap score for contributing players</div>`;
  }

  if (opts.type === "field") {
    const safeName = opts.golferName.replace(/'/g, "\\'");
    const isPointsExpanded = state.expandedFieldPoints.has(opts.golferName);
    const ptsLabel = isPointsExpanded ? "Hide Points Breakdown" : "Show Points Breakdown";
    html += `${renderRoundChips(opts.g.rounds)}
    <div class="scorecard-btn-row">
      <button class="scorecard-btn pts-toggle-btn ${isPointsExpanded ? "active" : ""}"
        onclick="event.stopPropagation(); toggleFieldPointsBreakdown('${safeName}')">${ptsLabel}</button>
    </div>
    ${isPointsExpanded && opts.gPts ? renderPointsBreakdown(opts.gPts) : ""}`;
  }

  for (const round of rounds) {
    const front = [], back = [];
    for (let h = 1; h <= 18; h++) {
      const hData = round.holes.find(x => x.hole === h) ?? null;
      (h <= 9 ? front : back).push({ h, hData });
    }

    const strokeKey  = opts.type === "bestball" ? "bestStrokes" : "strokes";
    const sumStrokes = arr => arr.reduce((s, { hData }) => s + (hData?.[strokeKey] ?? 0), 0);
    const sumPar     = arr => arr.reduce((s, { hData }) => s + (hData?.par ?? 0), 0);
    const allPlayed  = arr => arr.every(({ hData }) => hData !== null);

    const frontStrokes = sumStrokes(front), backStrokes = sumStrokes(back);
    const frontPar = sumPar(front), backPar = sumPar(back);
    const frontPlayed = allPlayed(front), backPlayed = allPlayed(back);
    const frontToPar = frontStrokes - frontPar, backToPar = backStrokes - backPar;

    html += `<div class="scorecard-round">`;
    if (opts.type === "player") {
      const result   = state.leaderboard.find(r => r.manager.id === opts.managerId);
      const gPts     = result?.golferPoints[opts.golferName];
      const roundPts = gPts?.perRoundPoints?.find(r => r.roundNum === round.roundNum)?.points ?? null;
      html += renderScorecardRoundLabel(round, roundPts);
    } else if (opts.type === "field") {
      const roundPts = opts.gPts?.perRoundPoints?.find(r => r.roundNum === round.roundNum)?.points ?? null;
      html += renderScorecardRoundLabel(round, roundPts);
    } else {
      html += renderScorecardRoundLabel(round, null);
    }
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
    html += `<td class="sc-section-total sc-par-cell">${frontPlayed && backPlayed ? frontPar + backPar : "-"}</td>`;
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
    html += renderTotalCell(frontPlayed && backPlayed, frontStrokes + backStrokes, frontToPar + backToPar);
    html += `</tr>`;

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
//  FIELD LEADERBOARD RENDER
// ============================================================

function renderFieldLeaderboard() {
  const container = document.getElementById("field-body");
  if (!container) return;

  if (state.tournamentState === "pre") {
    const t = TOURNAMENTS[ACTIVE_TOURNAMENT];
    container.innerHTML = `<tr><td colspan="5" class="info-cell">Tournament Starts: ${formatDateDisplay(t.startDate)} | Draft: ${draftDateDisplay(t)}</td></tr>`;
    return;
  }

  if (state.loading && !Object.keys(state.playerScores).length) {
    container.innerHTML = `<tr><td colspan="5" class="loading-cell">Fetching field from ESPN…</td></tr>`;
    return;
  }

  if (!Object.keys(state.playerScores).length) {
    container.innerHTML = `<tr><td colspan="5" class="loading-cell">No field data available.</td></tr>`;
    return;
  }

  document.querySelectorAll(".th-field-sortable").forEach(th => {
    th.classList.toggle("sort-active", th.dataset.fieldSort === state.fieldSortBy);
  });

  const hasRosters = tournamentHasRosters();

  const parsePos = p => {
    if (!p.position || p.position === "--") return 9999;
    return parseInt(String(p.position).replace("T", "")) || 9999;
  };

  const golfers = Object.values(state.playerScores).slice().sort((a, b) => {
    if (a.missedCut !== b.missedCut) return a.missedCut ? 1 : -1;
    if (state.fieldSortBy === "pts") {
      const aPts = getPoints(a.name)?.grandTotal ?? -Infinity;
      const bPts = getPoints(b.name)?.grandTotal ?? -Infinity;
      const d = bPts - aPts;
      return d !== 0 ? d : parsePos(a) - parsePos(b);
    }
    // "score" — sort by to-par, use ESPN position order to break ties
    const d = a.overallToPar - b.overallToPar;
    return d !== 0 ? d : parsePos(a) - parsePos(b);
  });

  let html = "";
  for (const g of golfers) {
    const isExpanded = state.expandedFieldGolfers.has(g.name);
    const gPts       = getPoints(g.name);
    const cutBadge   = g.missedCut ? `<span class="cut-badge">MC</span>` : "";
    const lastRound  = g.rounds[g.rounds.length - 1];
    const isPlaying  = state.tournamentState === "live" && lastRound?.holes.length >= 1 && lastRound.holes.length < 18;
    const safeName   = g.name.replace(/'/g, "\\'");

    let draftedHtml = "";
    if (hasRosters) {
      const drafted = getDraftedBy(g.name);
      if (drafted.length > 0) draftedHtml = `<span class="team-name">${drafted.join(", ")}</span>`;
    }

    html += `
      <tr class="manager-row ${isExpanded ? "expanded" : ""} ${g.missedCut ? "field-cut-row" : ""}"
          onclick="toggleFieldGolfer('${safeName}')">
        <td class="rank-cell">${g.position}</td>
        <td class="${draftedHtml ? "name-cell" : "name-cell field-name-single"}">
          <span class="manager-name">${g.name}${cutBadge}${isPlaying ? `<span class="playing-dot" style="margin-left:4px">●</span>` : ""}</span>
          ${draftedHtml}
        </td>
        <td class="pts-cell">
          <span class="score-primary">${gPts ? formatPoints(gPts.grandTotal) : "--"}</span>
        </td>
        <td class="score-cell ${scoreColorClass(g.overallToPar)}">
          <span class="score-primary">${g.overallToParDisplay}</span>
        </td>
        <td class="expand-cell">${isExpanded ? "▲" : "▼"}</td>
      </tr>`;

    if (isExpanded) {
      const animFld = state.animatingExpand.has(`fld:${g.name}`) ? " animating" : "";
      html += `<tr class="detail-row"><td colspan="5"><div class="detail-panel${animFld}">`;
      html += renderScorecard(g.rounds, { type: "field", g, golferName: g.name, gPts });
      html += `</div></td></tr>`;
    }
  }

  container.innerHTML = html;
}

function toggleFieldView() {
  const entering = state.activeView !== "field";
  state.activeView = entering ? "field" : "fantasy";
  document.getElementById("leaderboard-main").style.display          = entering ? "none" : "";
  document.getElementById("field-view").style.display                = entering ? "" : "none";
  document.getElementById("field-tab").classList.toggle("active", entering);
  document.querySelector(".combined-toggle-container").style.display = entering ? "none" : "";
  if (entering) renderFieldLeaderboard();
}

function toggleFieldGolfer(golferName) {
  toggleSet(state.expandedFieldGolfers, golferName);
  if (state.expandedFieldGolfers.has(golferName)) state.animatingExpand.add(`fld:${golferName}`);
  renderFieldLeaderboard();
  state.animatingExpand.clear();
}

function toggleFieldPointsBreakdown(golferName) {
  toggleSet(state.expandedFieldPoints, golferName);
  renderFieldLeaderboard();
}

function setFieldSortBy(col) {
  state.fieldSortBy = col;
  renderFieldLeaderboard();
}

// ============================================================
//  UI HELPERS
// ============================================================

function scoreColorClass(val) {
  if (val == null)  return "";
  if (val < 0)      return "score-under";
  if (val === 0)    return "score-even";
  return "score-over";
}

function holeColorClass(toPar) {
  if (toPar <= -2)  return "hole-eagle";
  if (toPar === -1) return "hole-birdie";
  if (toPar === 0)  return "hole-par";
  if (toPar === 1)  return "hole-bogey";
  return "hole-double";
}

function setLoading(val) {
  state.loading = val;
  const btn = document.getElementById("refresh-btn");
  if (btn) btn.disabled = val;
  const ind = document.getElementById("loading-indicator");
  if (ind) {
    ind.style.transition = val ? "opacity 0.1s ease" : "opacity 1s ease";
    ind.style.opacity    = val ? "1" : "0";
  }
}

function setError(msg) {
  state.error = msg;
  setLoading(false);
  render();
}

function toggleManager(managerId) {
  if (state.expandedManagers.has(managerId)) {
    state.expandedManagers.delete(managerId);
    deleteByPrefix(state.expandedGolfers, managerId + "|");
    deleteByPrefix(state.bbHighlight,     managerId + "|");
    deleteByPrefix(state.expandedPoints,  managerId + "|");
    state.expandedBB.delete(managerId);
  } else {
    state.expandedManagers.add(managerId);
    state.animatingExpand.add(`mgr:${managerId}`);
  }
  render();
}

function toggleGolfer(managerId, golferName) {
  const key = `${managerId}|${golferName}`;
  if (state.expandedGolfers.has(key)) {
    state.expandedGolfers.delete(key);
    state.bbHighlight.delete(key);
  } else {
    state.expandedGolfers.add(key);
    state.animatingExpand.add(`gfr:${key}`);
  }
  render();
}

function toggleBBExpand(managerId) {
  toggleSet(state.expandedBB, managerId);
  if (state.expandedBB.has(managerId)) state.animatingExpand.add(`bb:${managerId}`);
  render();
}

function toggleBBHighlight(managerId, golferName) {
  toggleSet(state.bbHighlight, `${managerId}|${golferName}`);
  render();
}

function showBBPopup(cell, players) {
  const existing = cell.querySelector(".bb-popup");
  document.querySelectorAll(".bb-popup").forEach(el => el.remove());
  document.querySelectorAll(".sc-bb-active").forEach(el => el.classList.remove("sc-bb-active"));
  if (existing) return;

  const popup = document.createElement("div");
  popup.className = "bb-popup";
  popup.textContent = players;
  cell.style.position = "relative";
  cell.classList.add("sc-bb-active");
  cell.appendChild(popup);

  // Close on next outside click
  setTimeout(() => {
    document.addEventListener("click", function handler() {
      document.querySelectorAll(".bb-popup").forEach(el => el.remove());
      document.querySelectorAll(".sc-bb-active").forEach(el => el.classList.remove("sc-bb-active"));
      document.removeEventListener("click", handler);
    });
  }, 0);
}

function setSortBy(col) {
  state.sortBy = col;
  state.leaderboard = computeLeaderboard();
  render();
}

function togglePointsBreakdown(managerId, golferName) {
  toggleSet(state.expandedPoints, `${managerId}|${golferName}`);
  render();
}

function renderPointsBreakdown(pts) {
  const { counts, perHolePoints, finishPoints, bonusCounts, bonusPoints } = pts;
  const rows = [];

  const add = (label, points) => { if (points !== 0) rows.push({ label, points }); };

  add(`Double Eagles (${counts.doubleEagle})`, perHolePoints.doubleEagle);
  add(`Eagles (${counts.eagle})`,              perHolePoints.eagle);
  add(`Birdies (${counts.birdie})`,            perHolePoints.birdie);
  add(`Pars (${counts.par})`,                  perHolePoints.par);
  add(`Bogeys (${counts.bogey})`,              perHolePoints.bogey);
  add(`Double Bogeys (${counts.double})`,      perHolePoints.double);
  add(`Double Bogeys+(${counts.worse})`,       perHolePoints.worse);

  if (bonusPoints.birdieStreaks !== 0)
    add(`3+ Birdie Streak (${bonusCounts.birdieStreaks})`, bonusPoints.birdieStreaks);
  if (bonusPoints.bogeyFreeRounds !== 0)
    add(`Bogey-Free Round (${bonusCounts.bogeyFreeRounds})`, bonusPoints.bogeyFreeRounds);
  if (bonusPoints.allUnder70 !== 0)
    add("All Rounds < 70", bonusPoints.allUnder70);
  if (bonusPoints.holeInOne !== 0)
    add(`Hole-in-One (${bonusCounts.holeInOne})`, bonusPoints.holeInOne);

  if (finishPoints.points !== 0)
    add(`Finish Position (${finishPoints.position})`, finishPoints.points);

  const rowsHtml = rows.map(r => `
    <tr>
      <td class="pts-bd-label">${r.label}</td>
      <td class="pts-bd-value">${formatPoints(r.points)}</td>
    </tr>`).join("");

  return `<div class="pts-breakdown">
    <table class="pts-breakdown-table"><tbody>
      ${rowsHtml}
      <tr class="pts-bd-total-row">
        <td class="pts-bd-label">Total</td>
        <td class="pts-bd-value">${formatPoints(pts.grandTotal)}</td>
      </tr>
    </tbody></table>
  </div>`;
}

// ============================================================
//  POINTS GUIDE
// ============================================================

function buildPointsGuide() {
  const popup = document.getElementById("points-guide-popup");
  if (!popup) return;

  const perHoleLabels = {
    doubleEagle: "Double Eagle",
    eagle:       "Eagle",
    birdie:      "Birdie",
    par:         "Par",
    bogey:       "Bogey",
    double:      "Double Bogey",
    worse:       "Double Bogey+",
  };

  const bonusLabels = {
    birdieStreak:   "3+ Birdie Streak<br><span style='opacity:0.7'>(1 per round)</span>",
    bogeyFreeRound: "Bogey-Free Round",
    allUnder70:     "All Rounds < 70",
    holeInOne:      "Hole-in-One",
  };

  function ordinal(n) {
    const v = n % 100;
    if (v >= 11 && v <= 13) return `${n}th`;
    switch (n % 10) {
      case 1:  return `${n}st`;
      case 2:  return `${n}nd`;
      case 3:  return `${n}rd`;
      default: return `${n}th`;
    }
  }

  const ptSign = val => val > 0 ? `+${val}` : `${val}`;

  const perHoleRows = Object.entries(POINTS_CONFIG.perHole).map(([key, val]) =>
    `<tr><td class="pg-label">${perHoleLabels[key] ?? key}</td><td class="pg-value">${ptSign(val)}</td></tr>`
  ).join("");

  const finishRows = POINTS_CONFIG.finishPosition.map(r => {
    const range = r.min === r.max ? ordinal(r.min) : `${ordinal(r.min)}–${ordinal(r.max)}`;
    return `<tr><td class="pg-label">${range}</td><td class="pg-value">+${r.pts}</td></tr>`;
  }).join("");

  const bonusRows = Object.entries(POINTS_CONFIG.bonuses).map(([key, val]) =>
    `<tr><td class="pg-label">${bonusLabels[key] ?? key}</td><td class="pg-value">+${val}</td></tr>`
  ).join("");

  popup.innerHTML = `
    <div class="pg-inner">
      <div class="pg-col">
        <div class="pg-section">
          <div class="pg-section-title">Per Hole</div>
          <table class="pg-table"><tbody>${perHoleRows}</tbody></table>
        </div>
        <div class="pg-section" style="margin-top:12px">
          <div class="pg-section-title">Bonus</div>
          <table class="pg-table"><tbody>${bonusRows}</tbody></table>
        </div>
        <div class="pg-section" style="margin-top:12px">
          <table class="pg-table"><tbody>
            <tr><td class="pg-label"><span class="playing-dot" style="position:relative;top:-1px;font-size:7px">●</span> Player in round</td></tr>
          </tbody></table>
        </div>
        <div class="pg-section" style="margin-top:12px; display:flex; justify-content:center">
          <button id="cut-lowest-btn" class="pg-toggle-btn ${state.cutLowestPlayer ? "active" : ""}"
            style="width:auto; text-align:center"
            onclick="event.stopPropagation(); toggleCutLowest()">Cut Lowest Player</button>
        </div>
      </div>
      <div class="pg-col">
        <div class="pg-section">
          <div class="pg-section-title">Finish Position</div>
          <table class="pg-table"><tbody>${finishRows}</tbody></table>
        </div>
      </div>
    </div>`;

  popup.onclick = e => e.stopPropagation();
}

function togglePointsGuide(event) {
  event.stopPropagation();
  const popup = document.getElementById("points-guide-popup");
  const btn = event.currentTarget;
  popup?.classList.toggle("open");
  btn?.classList.toggle("lit", popup?.classList.contains("open"));
}

document.addEventListener("click", () => {
  document.getElementById("points-guide-popup")?.classList.remove("open");
  document.querySelector(".points-guide-btn")?.classList.remove("lit");
});

function toggleCutLowest() {
  state.cutLowestPlayer = !state.cutLowestPlayer;
  document.getElementById("cut-lowest-btn")?.classList.toggle("active", state.cutLowestPlayer);
  state.leaderboard = computeLeaderboard();
  render();
}

function toggleCombined() {
  state.showCombined = !state.showCombined;
  if (!state.showCombined && state.sortBy === "combined") {
    state.sortBy = "points";
  }
  const btn = document.getElementById("combined-toggle-btn");
  if (btn) btn.textContent = state.showCombined ? "Hide Combined Scores" : "Show Combined Scores";
  btn?.classList.toggle("active", state.showCombined);
  renderLeaderboard();
}

// ============================================================
//  TOURNAMENT TAB SWITCHING
// ============================================================

function switchTournament(key) {
  if (!TOURNAMENTS[key]) return;
  ACTIVE_TOURNAMENT = key;
  highlightActiveTab();

  // Return to fantasy view if field was open
  if (state.activeView === "field") {
    state.activeView = "fantasy";
    document.getElementById("leaderboard-main").style.display          = "";
    document.getElementById("field-view").style.display                = "none";
    document.getElementById("field-tab").classList.remove("active");
    document.querySelector(".combined-toggle-container").style.display = "";
  }

  state.expandedManagers.clear();
  state.expandedGolfers.clear();
  state.expandedBB.clear();
  state.bbHighlight.clear();
  state.expandedPoints.clear();
  state.expandedFieldGolfers.clear();
  state.expandedFieldPoints.clear();
  state.fieldSortBy = "score";
  state.autoExpandedFor = null;

  fetchScores();
}

function highlightActiveTab() {
  document.querySelectorAll(".tourney-tab[data-key]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.key === ACTIVE_TOURNAMENT);
  });
}

// ============================================================
//  BOOTSTRAP
// ============================================================

async function init() {
  renderHeader();
  buildPointsGuide();
  highlightActiveTab();
  await fetchScores();
  setInterval(fetchScores, REFRESH_MS);
  document.getElementById("refresh-btn")?.addEventListener("click", fetchScores);
}

document.addEventListener("DOMContentLoaded", init);

// Expose globals needed by inline onclick handlers in index.html / rendered markup.
window.state                      = state;
window.fetchScores                = fetchScores;
window.toggleManager              = toggleManager;
window.toggleGolfer               = toggleGolfer;
window.toggleBBExpand             = toggleBBExpand;
window.toggleBBHighlight          = toggleBBHighlight;
window.togglePointsBreakdown      = togglePointsBreakdown;
window.showBBPopup                = showBBPopup;
window.setSortBy                  = setSortBy;
window.togglePointsGuide          = togglePointsGuide;
window.toggleCutLowest            = toggleCutLowest;
window.toggleCombined             = toggleCombined;
window.toggleFieldView            = toggleFieldView;
window.toggleFieldGolfer          = toggleFieldGolfer;
window.toggleFieldPointsBreakdown = toggleFieldPointsBreakdown;
window.setFieldSortBy             = setFieldSortBy;
window.switchTournament           = switchTournament;
