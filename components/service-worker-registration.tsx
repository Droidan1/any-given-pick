"use client";

import { useEffect, useState } from "react";
import { Icon } from "./icons";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function ServiceWorkerRegistration() {
  const [isOffline, setIsOffline] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }

    const syncNetwork = () => setIsOffline(!navigator.onLine);
    const captureInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };

    syncNetwork();
    window.addEventListener("online", syncNetwork);
    window.addEventListener("offline", syncNetwork);
    window.addEventListener("beforeinstallprompt", captureInstall);

    return () => {
      window.removeEventListener("online", syncNetwork);
      window.removeEventListener("offline", syncNetwork);
      window.removeEventListener("beforeinstallprompt", captureInstall);
    };
  }, []);

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstallPrompt(null);
  };

  return (
    <div className="pwa-utilities" aria-live="polite">
      {isOffline && <div className="network-banner">Offline · Picks stay on this device until you reconnect</div>}
      {installPrompt && (
        <button className="install-prompt" type="button" onClick={install}>
          <Icon name="install" />
          Install Any Given Pick
        </button>
      )}
    </div>
  );
}
