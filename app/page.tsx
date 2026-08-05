import { PickemApp } from "@/components/pickem-app";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";

export default function Home() {
  return (
    <>
      <PickemApp />
      <ServiceWorkerRegistration />
    </>
  );
}
