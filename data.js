// ============================================================
//  SPGA — Sub-Par Golf Association
//  data.js  |  Edit this file to manage your league
// ============================================================
//
//  HOW TO UPDATE ROSTERS:
//  1. Edit the managers and their golfers below
//  2. Save the file
//  3. Git add, commit, and push to update the live site
//
//  ACTIVE TOURNAMENT:
//  Change this to switch which event the dashboard displays.
//  Options: "pga_championship" | "us_open" | "the_open"
// ============================================================

const ACTIVE_TOURNAMENT = "pga_championship";

// ============================================================
//  TOURNAMENT DEFINITIONS
//  espnEventId: The ESPN event ID used to fetch live scores.
//  Update these IDs each year if needed.
// ============================================================

const TOURNAMENTS = {
  pga_championship: {
    name: "PGA Championship",
    shortName: "PGA Champ.",
    espnEventId: "401580351",   // 2025 PGA Championship
    location: "Quail Hollow Club, Charlotte, NC",
    dates: "May 15–18, 2025",
  },
  us_open: {
    name: "U.S. Open",
    shortName: "U.S. Open",
    espnEventId: "401580353",   // 2025 U.S. Open — update if needed
    location: "Oakmont Country Club, Oakmont, PA",
    dates: "June 12–15, 2025",
  },
  the_open: {
    name: "The Open Championship",
    shortName: "The Open",
    espnEventId: "401580354",   // 2025 The Open — update if needed
    location: "Royal Portrush Golf Club, Northern Ireland",
    dates: "July 17–20, 2025",
  },
};

// ============================================================
//  LEAGUE SETTINGS
//  rosterSize: how many golfers each manager drafts per Major.
//  Change this before each event's draft.
// ============================================================

const LEAGUE_SETTINGS = {
  leagueName: "Sub-Par Golf Association",
  leagueShortName: "SPGA",
  season: "2025",
  rosterSize: 6,   // <-- change this before each draft
};

// ============================================================
//  MANAGERS & ROSTERS
//
//  Each manager has:
//    - id:      unique slug, no spaces (used internally)
//    - name:    display name shown on the dashboard
//    - golfers: object with one array per tournament
//               Each golfer entry is the player's full name
//               exactly as it appears on ESPN.
//
//  To clear rosters for a new tournament, replace the
//  golfer arrays with empty arrays: []
//
//  EXAMPLE GOLFER NAME FORMAT:
//    "Scottie Scheffler"  ✓
//    "scheffler"          ✗  (won't match ESPN data)
// ============================================================

const MANAGERS = [
  {
    id: "manager_1",
    name: "Commissioner",          // <-- replace with your name
    golfers: {
      pga_championship: [
        "Scottie Scheffler",
        "Rory McIlroy",
        "Xander Schauffele",
        "Collin Morikawa",
        "Tommy Fleetwood",
        "Shane Lowry",
      ],
      us_open: [],
      the_open: [],
    },
  },
  {
    id: "manager_2",
    name: "Player 2",             // <-- replace with manager name
    golfers: {
      pga_championship: [
        "Jon Rahm",
        "Ludvig Åberg",
        "Viktor Hovland",
        "Tyrrell Hatton",
        "Matt Fitzpatrick",
        "Cameron Young",
      ],
      us_open: [],
      the_open: [],
    },
  },
  {
    id: "manager_3",
    name: "Player 3",
    golfers: {
      pga_championship: [],
      us_open: [],
      the_open: [],
    },
  },
  {
    id: "manager_4",
    name: "Player 4",
    golfers: {
      pga_championship: [],
      us_open: [],
      the_open: [],
    },
  },
  {
    id: "manager_5",
    name: "Player 5",
    golfers: {
      pga_championship: [],
      us_open: [],
      the_open: [],
    },
  },
  {
    id: "manager_6",
    name: "Player 6",
    golfers: {
      pga_championship: [],
      us_open: [],
      the_open: [],
    },
  },
  {
    id: "manager_7",
    name: "Player 7",
    golfers: {
      pga_championship: [],
      us_open: [],
      the_open: [],
    },
  },
  {
    id: "manager_8",
    name: "Player 8",
    golfers: {
      pga_championship: [],
      us_open: [],
      the_open: [],
    },
  },
  {
    id: "manager_9",
    name: "Player 9",
    golfers: {
      pga_championship: [],
      us_open: [],
      the_open: [],
    },
  },
  {
    id: "manager_10",
    name: "Player 10",
    golfers: {
      pga_championship: [],
      us_open: [],
      the_open: [],
    },
  },
];

// ============================================================
//  SNAKE DRAFT ORDER  (optional — for reference)
//
//  Record your draft order here after each draft.
//  Round 1: picks 1–10 (or however many managers)
//  Round 2: picks reverse (snake back)
//  This is just a reference log — it doesn't affect scoring.
// ============================================================

const DRAFT_LOG = {
  pga_championship: {
    round_1: [
      // "Manager Name",   // Pick 1
      // "Manager Name",   // Pick 2
      // ... fill in after draft
    ],
    round_2: [],
    round_3: [],
    round_4: [],
    round_5: [],
    round_6: [],
  },
  us_open: {
    round_1: [],
    round_2: [],
    round_3: [],
    round_4: [],
    round_5: [],
    round_6: [],
  },
  the_open: {
    round_1: [],
    round_2: [],
    round_3: [],
    round_4: [],
    round_5: [],
    round_6: [],
  },
};
