export type Team = {
  abbreviation: string;
  city: string;
};

export type Game = {
  id: string;
  day: string;
  time: string;
  away: Team;
  home: Team;
};

export const games: Game[] = [
  { id: "ind-chi", day: "Thu", time: "8:15 PM", away: { abbreviation: "IND", city: "Indianapolis" }, home: { abbreviation: "CHI", city: "Chicago" } },
  { id: "buf-mia", day: "Sun", time: "1:00 PM", away: { abbreviation: "BUF", city: "Buffalo" }, home: { abbreviation: "MIA", city: "Miami" } },
  { id: "gb-min", day: "Sun", time: "1:00 PM", away: { abbreviation: "GB", city: "Green Bay" }, home: { abbreviation: "MIN", city: "Minnesota" } },
  { id: "dal-nyg", day: "Sun", time: "1:00 PM", away: { abbreviation: "DAL", city: "Dallas" }, home: { abbreviation: "NYG", city: "New York" } },
  { id: "sea-ari", day: "Sun", time: "4:05 PM", away: { abbreviation: "SEA", city: "Seattle" }, home: { abbreviation: "ARI", city: "Arizona" } },
  { id: "tb-no", day: "Sun", time: "4:25 PM", away: { abbreviation: "TB", city: "Tampa Bay" }, home: { abbreviation: "NO", city: "New Orleans" } },
  { id: "pit-cle", day: "Sun", time: "4:25 PM", away: { abbreviation: "PIT", city: "Pittsburgh" }, home: { abbreviation: "CLE", city: "Cleveland" } },
  { id: "lv-lac", day: "Sun", time: "8:20 PM", away: { abbreviation: "LV", city: "Las Vegas" }, home: { abbreviation: "LAC", city: "Los Angeles" } },
];

export const initialPicks: Record<string, string> = {
  "ind-chi": "IND",
  "buf-mia": "MIA",
  "gb-min": "MIN",
  "dal-nyg": "DAL",
  "sea-ari": "SEA",
};
