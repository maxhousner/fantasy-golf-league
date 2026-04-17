/* ============================================================
   SPGA FANTASY — Sub-Par Golf Association Fantasy Golf League
   data.js
============================================================ */

// ============================================================
//  ACTIVE TOURNAMENT
//  Options: "the_masters" | "pga_championship" | "us_open" | "the_open"
// ============================================================

let ACTIVE_TOURNAMENT = "the_masters";

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
    endDate:   "20260412",
  },
  pga_championship: {
    name: "PGA Championship",
    shortName: "PGA Champ",
    espnEventId: "401811947",
    location: "Aronimink Golf Club, Newtown Square, PA",
    startDate: "20260514", // modified just for testing
    endDate:   "20260517",
  },
  us_open: {
    name: "U.S. Open",
    shortName: "U.S. Open",
    espnEventId: "401811952",
    location: "Shinnecock Hills Golf Club, Southampton, NY",
    startDate: "20260618",
    endDate:   "20260621",
  },
  the_open: {
    name: "The Open Championship",
    shortName: "The Open",
    espnEventId: "401811957",
    location: "Royal Birkdale Golf Club, Southport, England",
    startDate: "20260716",
    endDate:   "20260719",
  },
};

// ============================================================
//  MANAGERS & ROSTERS
//
//  Golfer names must match ESPN displayName exactly.
// ============================================================

const MANAGERS = [
  {
    id: "manager_1",
    name: "Max",
    teamName: "[TEAM NAME]",
    golfers: {
      the_masters: [
        "Scottie Scheffler",
        "Collin Morikawa",
        "Justin Rose",
        "Ben Griffin",
        "Akshay Bhatia",
      ],
      pga_championship: [],
      us_open: [],
      the_open: [],
    },
  },
  {
    id: "manager_2",
    name: "Bennett",
    teamName: "[TEAM NAME]",
    golfers: {
      the_masters: [
        "Scottie Scheffler",
        "Patrick Cantlay",
        "Tommy Fleetwood",
        "Ben Griffin",
        "Justin Rose",
      ],
      pga_championship: [],
      us_open: [],
      the_open: [],
    },
  },
  {
    id: "manager_3",
    name: "Paul",
    teamName: "[TEAM NAME]",
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
    teamName: "[TEAM NAME]",
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
    teamName: "[TEAM NAME]",
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
    teamName: "[TEAM NAME]",
    golfers: {
      the_masters: [],
      pga_championship: [],
      us_open: [],
      the_open: [],
    },
  },
];

// ============================================================
//  DRAFT LOG  (reference only — does not affect scoring)
// ============================================================

const DRAFT_LOG = {
  the_masters:      { round_1: [], round_2: [], round_3: [], round_4: [], round_5: [] },
  pga_championship: { round_1: [], round_2: [], round_3: [], round_4: [], round_5: [] },
  us_open:          { round_1: [], round_2: [], round_3: [], round_4: [], round_5: [] },
  the_open:         { round_1: [], round_2: [], round_3: [], round_4: [], round_5: [] },
};
