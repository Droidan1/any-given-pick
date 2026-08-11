export function canRevealWeeklyPicks(entryDeadline: Date, serverNow: Date): boolean {
  return serverNow.getTime() >= entryDeadline.getTime();
}
