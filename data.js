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
//  Options: "the_masters" | "pga_championship" | "us_open" | "the_open"
// ============================================================

let ACTIVE_TOURNAMENT = "the_masters";

// ============================================================
//  TOURNAMENT DEFINITIONS
//  espnEventId: The ESPN event ID used to  live scores.
// ============================================================

const TOURNAMENTS = {
  the_masters: {
    name: "The Masters",
    shortName: "The Masters",
    espnEventId: "401811941",
    location: "Augusta National Golf Club, Augusta, GA",
    dates: "April 9-12, 2026",
    finalScores: {},
  },
  pga_championship: {
    name: "PGA Championship",
    shortName: "PGA Champ",
    espnEventId: "401811947",
    location: "Aronimink Golf Club, Newtown Square, PA",
    dates: "May 14–17, 2026",
    finalScores: {},
  },
  us_open: {
    name: "U.S. Open",
    shortName: "U.S. Open",
    espnEventId: "401811952",
    location: "Shinnecock Hills Golf Club, Southampton, NY",
    dates: "June 18–21, 2026",
    finalScores: {},
  },
  the_open: {
    name: "The Open Championship",
    shortName: "The Open",
    espnEventId: "401811957",
    location: "Royal Birkdale Golf Club, Southport, England",
    dates: "July 16–19, 2026",
    finalScores: {},
  },
};

// ============================================================
//  LEAGUE SETTINGS
// ============================================================

const LEAGUE_SETTINGS = {
  leagueName: "Sub-Par Golf Association",
  leagueShortName: "SPGA",
  season: "2026",
  rosterSize: 5,   // <-- change this before each draft
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
    name: "Max",
    golfers: {
      the_masters: [
        "Scottie Scheffler",
        "Collin Morikawa",
        "Justin Rose",
        "Ben Griffin",
        "Akshay Bhatia",
      ],
      pga_championship: [
        "Scottie Scheffler",
        "Rory McIlroy",
        "Xander Schauffele",
        "Collin Morikawa",
        "Tommy Fleetwood",
      ],
      us_open: [],
      the_open: [],
    },
  },
  {
    id: "manager_2",
    name: "Bennett",
    golfers: {
      the_masters: [
        "Scottie Scheffler",
        "Patrick Cantlay",
        "Tommy Fleetwood",
        "Ben Griffin",
        "Justin Rose",
      ],
      pga_championship: [
        "Jon Rahm",
        "Ludvig Åberg",
        "Viktor Hovland",
        "Tyrrell Hatton",
        "Matt Fitzpatrick",
      ],
      us_open: [],
      the_open: [],
    },
  },
  {
    id: "manager_3",
    name: "Paul",
    golfers: {
      the_masters: [
        "Scottie Scheffler",
        "Bryson DeChambeau",
        "Corey Conners",
        "Chris Gotterup",
        "Ludvig Åberg",
      ],
      pga_championship: [],
      us_open: [],
      the_open: [],
    },
  },
  {
    id: "manager_4",
    name: "Rehan",
    golfers: {
      the_masters: [
        "Bubba Watson",
        "Keegan Bradley",
        "Tyrrell Hatton",
        "Sami Valimaki",
        "Nicolai Højgaard",
      ],
      pga_championship: [],
      us_open: [],
      the_open: [],
    },
  },
  {
    id: "manager_5",
    name: "Alex",
    golfers: {
      the_masters: [],
      pga_championship: [],
      us_open: [],
      the_open: [],
    },
  },
  {
    id: "manager_6",
    name: "Will",
    golfers: {
      the_masters: [],
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
  the_masters: {
    round_1: [],
    round_2: [],
    round_3: [],
    round_4: [],
    round_5: [],
    round_6: [],
  },
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
