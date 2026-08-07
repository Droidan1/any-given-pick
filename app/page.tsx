import { redirect } from "next/navigation";
import { PickemApp } from "@/components/pickem-app";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import { requireAppUser } from "@/lib/auth/app-user";
import { hasAdminRole } from "@/lib/auth/admin";
import { getAccountSummary } from "@/lib/eligibility/service";
import { getCurrentPlayerWeek } from "@/lib/entries/service";
import { auth } from "@clerk/nextjs/server";

export default async function Home() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const appUser = await requireAppUser();
  const [account, week, isAdmin] = await Promise.all([
    getAccountSummary(appUser.id),
    getCurrentPlayerWeek(appUser.id),
    hasAdminRole(appUser.id),
  ]);

  return (
    <>
      <PickemApp account={account} week={week} isAdmin={isAdmin} />
      <ServiceWorkerRegistration />
    </>
  );
}
