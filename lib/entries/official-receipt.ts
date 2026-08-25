import { draftPayloadSignature } from "./rules";

type ReceiptGame = {
  id: string;
  awayTeamCode: string;
  homeTeamCode: string;
};

export function hasUnsubmittedOfficialEdits(input: {
  games: ReceiptGame[];
  draftPicks: Record<string, string>;
  draftMondayPrediction: number | null;
  officialPicks: Record<string, string>;
  officialMondayPrediction: number | null;
}): boolean {
  return draftPayloadSignature({
    games: input.games,
    picks: input.draftPicks,
    mondayPrediction: input.draftMondayPrediction,
  }) !== draftPayloadSignature({
    games: input.games,
    picks: input.officialPicks,
    mondayPrediction: input.officialMondayPrediction,
  });
}
