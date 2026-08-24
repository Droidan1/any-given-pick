const ESPN_TEAM_CODES: Record<string, string> = {
  ARI: "ari",
  ATL: "atl",
  BAL: "bal",
  BUF: "buf",
  CAR: "car",
  CHI: "chi",
  CIN: "cin",
  CLE: "cle",
  DAL: "dal",
  DEN: "den",
  DET: "det",
  GB: "gb",
  HOU: "hou",
  IND: "ind",
  JAX: "jax",
  KC: "kc",
  LAC: "lac",
  LAR: "lar",
  LV: "lv",
  MIA: "mia",
  MIN: "min",
  NE: "ne",
  NO: "no",
  NYG: "nyg",
  NYJ: "nyj",
  PHI: "phi",
  PIT: "pit",
  SEA: "sea",
  SF: "sf",
  TB: "tb",
  TEN: "ten",
  WAS: "wsh",
};

const TEAM_CODE_ALIASES: Record<string, string> = {
  JAC: "JAX",
  OAK: "LV",
  SD: "LAC",
  STL: "LAR",
  WSH: "WAS",
};

export function canonicalTeamCode(code: string): string {
  const normalized = code.trim().toLocaleUpperCase("en-US");
  return TEAM_CODE_ALIASES[normalized] ?? normalized;
}

export function getTeamLogoUrl(code: string): string | null {
  const espnCode = ESPN_TEAM_CODES[canonicalTeamCode(code)];
  return espnCode
    ? `https://a.espncdn.com/i/teamlogos/nfl/500/${espnCode}.png`
    : null;
}

