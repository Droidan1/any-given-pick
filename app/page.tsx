import { PickemApp } from "@/components/pickem-app";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import { getOptionalAccountSummary } from "@/lib/auth/app-user";

export default async function Home() {
  const account = await getOptionalAccountSummary();

  return (
    <>
      <PickemApp account={account} />
      <ServiceWorkerRegistration />
    </>
  );
}
