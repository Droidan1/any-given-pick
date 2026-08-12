import { redirect } from "next/navigation";
import { PickemApp } from "@/components/pickem-app";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import { requireAppUser } from "@/lib/auth/app-user";
import { hasAdminRole } from "@/lib/auth/admin";
import { getAccountSummary } from "@/lib/eligibility/service";
import { getCurrentPlayerWeek } from "@/lib/entries/service";
import { getSeasonStandings } from "@/lib/standings/service";
import { auth } from "@clerk/nextjs/server";

const initialViews = new Set(["home", "picks", "standings", "profile"] as const);

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const [{ userId }, params] = await Promise.all([auth(), searchParams]);
  if (!userId) redirect("/sign-in");

  const initialView = initialViews.has(params.view as "home" | "picks" | "standings" | "profile")
    ? params.view as "home" | "picks" | "standings" | "profile"
    : "home";

  const appUser = await requireAppUser(userId);
  const [account, week, isAdmin, standings] = await Promise.all([
    getAccountSummary(appUser.id),
    getCurrentPlayerWeek(appUser.id),
    hasAdminRole(appUser.id),
    getSeasonStandings(),
  ]);

  if (account.accountState !== "active" && !isAdmin) redirect("/profile");

  return (
    <>
      <PickemApp
        account={account}
        week={week}
        isAdmin={isAdmin}
        draftOwnerId={appUser.id}
        standings={standings}
        initialView={initialView}
      />
      <ServiceWorkerRegistration />
    </>
  );
}
