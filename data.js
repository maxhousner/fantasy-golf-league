// ============================================================
//  SPGA — Sub-Par Golf Association
//  data.js  |  Edit this file to manage league
// ============================================================

// ============================================================
//  ACTIVE TOURNAMENT:
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
  rosterSize: 5,   // <-- change this before each draft
};

// ============================================================
//  TOURNAMENT DEFINITIONS
// ============================================================

const TOURNAMENTS = {
  the_masters: {
    name: "The Masters",
    shortName: "The Masters",
    espnEventId: "401811941",
    location: "Augusta National Golf Club, Augusta, GA",
    startDate: "2026-04-09",
    endDate: "2026-04-12",
  },
  pga_championship: {
    name: "PGA Championship",
    shortName: "PGA Champ",
    espnEventId: "401811947",
    location: "Aronimink Golf Club, Newtown Square, PA",
    startDate: "2026-05-14",
    endDate: "2026-05-17",
  },
  us_open: {
    name: "U.S. Open",
    shortName: "U.S. Open",
    espnEventId: "401811952",
    location: "Shinnecock Hills Golf Club, Southampton, NY",
    dates: "June 18–21, 2026",
    startDate: "2026-06-18",
    endDate: "2026-06-21",
  },
  the_open: {
    name: "The Open Championship",
    shortName: "The Open",
    espnEventId: "401811957",
    location: "Royal Birkdale Golf Club, Southport, England",
    dates: "July 16–19, 2026",
    startDate: "2026-07-16",
    endDate: "2026-07-19",
  },
};

// ============================================================
//  MANAGERS & ROSTERS
// ============================================================

const MANAGERS = [
  {
    id: "manager_1",
    name: "Max",
    teamName: "Bunker? I Barely Know Her",
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
    teamName: "BENNETT'S BOYS",
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
    teamName: "I'm Brandon!",
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
    teamName: "re-birdie",
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
    teamName: "[team name]",
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
    teamName: "[team name]",
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
