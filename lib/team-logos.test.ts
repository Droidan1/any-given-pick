import { describe, expect, it } from "vitest";
import { canonicalTeamCode, getTeamLogoUrl } from "./team-logos";

describe("team logo assets", () => {
  it("maps every current NFL team to an ESPN logo", () => {
    const teams = [
      "ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE",
      "DAL", "DEN", "DET", "GB", "HOU", "IND", "JAX", "KC",
      "LAC", "LAR", "LV", "MIA", "MIN", "NE", "NO", "NYG",
      "NYJ", "PHI", "PIT", "SEA", "SF", "TB", "TEN", "WAS",
    ];

    expect(teams.every((team) => getTeamLogoUrl(team)?.endsWith(".png"))).toBe(true);
  });

  it("normalizes common provider and historical abbreviations", () => {
    expect(canonicalTeamCode("wsh")).toBe("WAS");
    expect(canonicalTeamCode("JAC")).toBe("JAX");
    expect(getTeamLogoUrl("WSH")).toContain("/wsh.png");
  });

  it("returns null for an unknown team", () => {
    expect(getTeamLogoUrl("TBD")).toBeNull();
  });
});

