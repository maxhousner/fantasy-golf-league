/* ============================================================
   SPGA FANTASY — Sub-Par Golf Association Fantasy Golf League
   data.js
============================================================ */

// ============================================================
//  ACTIVE TOURNAMENT
//  Options: "the_masters" | "pga_championship" | "us_open" | "the_open"
// ============================================================

let ACTIVE_TOURNAMENT = "pga_championship";

// ============================================================
//  LEAGUE SETTINGS
// ============================================================

const LEAGUE_SETTINGS = {
  leagueName: "Sub-Par Golf Association",
  leagueShortName: "SPGA",
  season: "2026",
  rosterSize: 5,
};

// ============================================================
//  POINTS CONFIG
// ============================================================

const POINTS_CONFIG = {
  perHole: {
    doubleEagle: 13,
    eagle: 8,
    birdie: 3,
    par: 0.5,
    bogey: -0.5,
    double: -1,
    worse: -1,
  },
  finishPosition: [
    { min: 1, max: 1, pts: 30 },
    { min: 2, max: 2, pts: 20 },
    { min: 3, max: 3, pts: 18 },
    { min: 4, max: 4, pts: 16 },
    { min: 5, max: 5, pts: 14 },
    { min: 6, max: 6, pts: 12 },
    { min: 7, max: 7, pts: 10 },
    { min: 8, max: 8, pts: 9 },
    { min: 9, max: 9, pts: 8 },
    { min: 10, max: 10, pts: 7 },
    { min: 11, max: 15, pts: 6 },
    { min: 16, max: 20, pts: 5 },
    { min: 21, max: 25, pts: 4 },
    { min: 26, max: 30, pts: 3 },
    { min: 31, max: 40, pts: 2 },
    { min: 41, max: 50, pts: 1 },
  ],
  bonuses: {
    birdieStreak: 5,
    bogeyFreeRound: 5,
    allUnder70: 5,
    holeInOne: 20,
  },
};

// ============================================================
//  TOURNAMENT DEFINITIONS
//
//  startDate / endDate: YYYYMMDD format (no dashes)
//  espnEventId: from the ESPN scoreboard calendar
// ============================================================

const TOURNAMENTS = {
  the_masters: {
    name: "The Masters",
    shortName: "The Masters",
    espnEventId: "401811941",
    location: "Augusta National Golf Club, Augusta, GA",
    startDate: "20260409",
    endDate: "20260412",
  },
  pga_championship: {
    name: "PGA Championship",
    shortName: "PGA Champ",
    espnEventId: "401811947",
    location: "Aronimink Golf Club, Newtown Square, PA",
    startDate: "20260414", // modified just for testing
    endDate: "20260517",
  },
  us_open: {
    name: "U.S. Open",
    shortName: "U.S. Open",
    espnEventId: "401811952",
    location: "Shinnecock Hills Golf Club, Southampton, NY",
    startDate: "20260618",
    endDate: "20260621",
  },
  the_open: {
    name: "The Open Championship",
    shortName: "The Open",
    espnEventId: "401811957",
    location: "Royal Birkdale Golf Club, Southport, England",
    startDate: "20260716",
    endDate: "20260719",
  },
};

// ============================================================
//  MANAGERS & ROSTERS
// ============================================================

const MANAGERS = [
  {
    id: "manager_1",
    name: "Max",
    teamName: {
      the_masters: "Bunker? I Barely Know Her",
      pga_championship: "[TEAM NAME]",
      us_open: "[TEAM NAME]",
      the_open: "[TEAM NAME]",
    },
    golfers: {
      the_masters: [
        "Scottie Scheffler",
        "Collin Morikawa",
        "Justin Rose",
        "Ben Griffin",
        "Akshay Bhatia",
      ],
      pga_championship: [
        "Matt Fitzpatrick",
        "Patrick Cantlay",
        "Kurt Kitayama",
      ],
      us_open: [],
      the_open: [],
    },
  },
  {
    id: "manager_2",
    name: "Bennett",
    teamName: {
      the_masters: "BENNETT'S BOYS",
      pga_championship: "[TEAM NAME]",
      us_open: "[TEAM NAME]",
      the_open: "[TEAM NAME]",
    },
    golfers: {
      the_masters: [
        "Scottie Scheffler",
        "Patrick Cantlay",
        "Tommy Fleetwood",
        "Ben Griffin",
        "Justin Rose",
      ],
      pga_championship: [
        "Viktor Hovland",
        "Sepp Straka",
        "Aldrich Potgieter",
      ],
      us_open: [],
      the_open: [],
    },
  },
  {
    id: "manager_3",
    name: "Paul",
    teamName: {
      the_masters: "I'm Brandon!",
      pga_championship: "[TEAM NAME]",
      us_open: "[TEAM NAME]",
      the_open: "[TEAM NAME]",
    },
    golfers: {
      the_masters: [
        "Scottie Scheffler",
        "Bryson DeChambeau",
        "Corey Conners",
        "Chris Gotterup",
        "Ludvig Åberg",
      ],
      pga_championship: [
        "Harris English",
        "Ludvig Åberg",
        "Keegan Bradley",
      ],
      us_open: [],
      the_open: [],
    },
  },
  {
    id: "manager_4",
    name: "Rehan",
    teamName: {
      the_masters: "re-birdie",
      pga_championship: "[TEAM NAME]",
      us_open: "[TEAM NAME]",
      the_open: "[TEAM NAME]",
    },
    golfers: {
      the_masters: [
        "Bubba Watson",
        "Keegan Bradley",
        "Tyrrell Hatton",
        "Sami Välimäki",
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
    teamName: {
      the_masters: "[TEAM NAME]",
      pga_championship: "[TEAM NAME]",
      us_open: "[TEAM NAME]",
      the_open: "[TEAM NAME]",
    },
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
    teamName: {
      the_masters: "[TEAM NAME]",
      pga_championship: "[TEAM NAME]",
      us_open: "[TEAM NAME]",
      the_open: "[TEAM NAME]",
    },
    golfers: {
      the_masters: [],
      pga_championship: [],
      us_open: [],
      the_open: [],
    },
  },
  {
    id: "manager_7",
    name: "Stein",
    teamName: {
      the_masters: "[TEAM NAME]",
      pga_championship: "[TEAM NAME]",
      us_open: "[TEAM NAME]",
      the_open: "[TEAM NAME]",
    },
    golfers: {
      the_masters: [],
      pga_championship: [],
      us_open: [],
      the_open: [],
    },
  },
];

// ============================================================
//  STARTUP VALIDATION
// ============================================================

(function validateConfig() {
  if (!TOURNAMENTS[ACTIVE_TOURNAMENT]) {
    console.error(`[data.js] ACTIVE_TOURNAMENT "${ACTIVE_TOURNAMENT}" is not a valid key. Valid keys: ${Object.keys(TOURNAMENTS).join(", ")}`);
  }
  for (const manager of MANAGERS) {
    for (const [tournament, golfers] of Object.entries(manager.golfers)) {
      if (golfers.length > LEAGUE_SETTINGS.rosterSize) {
        console.warn(`[data.js] ${manager.name}'s ${tournament} roster has ${golfers.length} players, exceeds the ${LEAGUE_SETTINGS.rosterSize}-player limit`);
      }
    }
  }
})();
