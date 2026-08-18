import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { PickemStandings } from "@/components/pickem-standings";
import { requireAppUser } from "@/lib/auth/app-user";
import { hasAdminRole } from "@/lib/auth/admin";
import { getAccountSummary } from "@/lib/eligibility/service";
import { getSeasonStandings } from "@/lib/standings/service";

export default async function StandingsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const appUser = await requireAppUser(userId);
  const [account, isAdmin, standings] = await Promise.all([
    getAccountSummary(appUser.id),
    hasAdminRole(appUser.id),
    getSeasonStandings(),
  ]);
  if (account.accountState !== "active" && !isAdmin) redirect("/profile");

  return <PickemStandings account={account} isAdmin={isAdmin} standings={standings} currentUserId={appUser.id} />;
}
