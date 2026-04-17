# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the App

This is a static frontend app — no build step or package manager. Open `index.html` directly in a browser or serve it with any static file server:

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

## Architecture

Single-page app with no framework or dependencies. Three files do all the work:

- **`data.js`** — All mutable league config: `ACTIVE_TOURNAMENT`, `TOURNAMENTS`, `MANAGERS` (with rosters), and `DRAFT_LOG`. Loaded before `app.js`.
- **`app.js`** — ESPN API fetch → parse → score → render pipeline. Holds a single `state` object; all UI is re-rendered from scratch on state change.
- **`index.html` / `style.css`** — Static shell; the leaderboard body (`#leaderboard-body`) is entirely innerHTML-replaced by `renderLeaderboard()`.

## Key Data Flow

1. `init()` on DOMContentLoaded calls `fetchScores()`, which auto-refreshes every 2 minutes.
2. `fetchScores()` determines tournament state (`pre`/`live`/`post`) from today's date vs. `TOURNAMENTS[ACTIVE_TOURNAMENT]` dates, then hits the ESPN scoreboard API (with CORS proxy fallback).
3. `parseESPN()` builds `state.playerScores` — a map of `{ displayName → playerObject }`. Golfer names in rosters **must match ESPN `displayName` exactly**.
4. `computeLeaderboard()` runs `calcCombined()` and `calcBestBall()` per manager, sorts, and assigns ranks. Best ball is computed hole-by-hole across all roster golfers.
5. `render()` calls `renderHeader()` + `renderLeaderboard()`, which generates all HTML as template literal strings and sets `innerHTML`.

## Updating Rosters / Tournaments

- Change `ACTIVE_TOURNAMENT` in `data.js` to switch the active event (keys: `the_masters`, `pga_championship`, `us_open`, `the_open`).
- Add golfer names to each manager's `golfers[tournament]` array. Names must match ESPN's `displayName` exactly — check the ESPN API response if a player shows as "N/A".
- Add new seasons by extending `TOURNAMENTS` and adding matching keys to each manager's `golfers` object.
