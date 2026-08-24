import { redirect } from "next/navigation";
import { PickemHome } from "@/components/pickem-home";
import { requireAppUser } from "@/lib/auth/app-user";
import { hasAdminRole } from "@/lib/auth/admin";
import { getAccountSummary } from "@/lib/eligibility/service";
import { getCurrentPlayerWeek } from "@/lib/entries/service";
import { getActiveCommissionerAnnouncement } from "@/lib/announcements/service";
import { auth } from "@clerk/nextjs/server";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const [{ userId }, params] = await Promise.all([auth(), searchParams]);
  if (!userId) redirect("/sign-in");
  if (params.view === "profile") redirect("/profile");
  if (params.view === "picks") redirect("/picks");
  if (params.view === "standings") redirect("/standings");

  const appUser = await requireAppUser(userId);
  const [account, week, isAdmin, announcement] = await Promise.all([
    getAccountSummary(appUser.id),
    getCurrentPlayerWeek(appUser.id),
    hasAdminRole(appUser.id),
    getActiveCommissionerAnnouncement(),
  ]);

  if (account.accountState !== "active" && !isAdmin) redirect("/profile");
  return <PickemHome account={account} week={week} isAdmin={isAdmin} announcement={announcement} />;
}
