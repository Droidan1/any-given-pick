import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { PickemApp } from "@/components/pickem-app";
import { requireAppUser } from "@/lib/auth/app-user";
import { hasAdminRole } from "@/lib/auth/admin";
import { getAccountSummary } from "@/lib/eligibility/service";
import { getCurrentPlayerWeek } from "@/lib/entries/service";

export default async function PicksPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const appUser = await requireAppUser(userId);
  const [account, week, isAdmin] = await Promise.all([
    getAccountSummary(appUser.id),
    getCurrentPlayerWeek(appUser.id, { includeLivePicks: true }),
    hasAdminRole(appUser.id),
  ]);
  if (account.accountState !== "active" && !isAdmin) redirect("/profile");

  return (
    <PickemApp
      account={account}
      week={week}
      isAdmin={isAdmin}
      draftOwnerId={appUser.id}
      standings={null}
      initialView="picks"
    />
  );
}
