import { z } from "zod";

export const profileInputSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(3, "Use at least 3 characters.")
    .max(24, "Use no more than 24 characters.")
    .regex(
      /^[a-zA-Z0-9][a-zA-Z0-9 _-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]{3}$/,
      "Use letters, numbers, spaces, hyphens, or underscores.",
    ),
  birthDate: z.string().date("Enter a valid birth date."),
});

export function normalizeDisplayName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

export function isAtLeast21(birthDate: string, asOf = new Date()): boolean {
  const [year, month, day] = birthDate.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return false;
  }

  const cutoff = new Date(
    Date.UTC(asOf.getUTCFullYear() - 21, asOf.getUTCMonth(), asOf.getUTCDate()),
  );
  return parsed <= cutoff;
}

export function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1_000);
}
