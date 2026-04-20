# SPGA Fantasy Golf League

Fantasy golf league dashboard for the Sub-Par Golf Association (me and my friends). Tracks live and historical scores across the four majors, computes per-hole points and bonuses for each manager's roster, and renders a sortable leaderboard alongside a full tournament field view.

---

## How It Works

- Fetches live and historical scoreboard data from the ESPN API (CORS proxy fallback for local dev)
- Matches each golfer on a manager's roster to their ESPN score by `displayName`
- Computes three scoring views per manager: **Points** (per-hole + bonuses), **Combined** (sum of all golfer scores to par), and **Best Ball** (best score per hole across the roster)
- **Field view** — shows every golfer in the tournament with their position, individual fantasy points, score, and expandable scorecard; sortable by points or score
- Re-renders the full leaderboard on every state change; managers with empty rosters are hidden during live and completed tournaments

Currently supports the four majors only. Rosters are set manually in `data.js`.

---

## Files

| File | Purpose |
|------|---------|
| `data.js` | Set `ACTIVE_TOURNAMENT`, define manager rosters per major, configure `POINTS_CONFIG` |
| `app.js` | ESPN API fetch, score parsing, leaderboard and field computation, all UI rendering |
| `index.html` | Static shell — tournament banner, fantasy leaderboard, field view, points guide, nav tabs |
| `style.css` | All styles; mobile breakpoints at 640px and 720px |

---

## Scoring

Configured in `POINTS_CONFIG` in `data.js`:

- **Per hole** — points for eagle, birdie, par, bogey, double+
- **Finish position** — awarded after round 4; missed cut = 0
- **Bonuses** — birdie streak (3+ consecutive, max 1/round), bogey-free round, all 4 rounds under 70, hole-in-one
