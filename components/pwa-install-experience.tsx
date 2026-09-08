"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { detectInstallPlatform, type InstallPlatform } from "@/lib/pwa/install";
import { Icon } from "./icons";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type PwaInstallContextValue = {
  bannerVisible: boolean;
  firstRunVisible: boolean;
  guideOpen: boolean;
  homeCardVisible: boolean;
  isOffline: boolean;
  platform: InstallPlatform;
  profileAccessVisible: boolean;
  completeGuide: () => void;
  dismissFirstRun: () => void;
  dismissHomeCard: () => void;
  openInstall: () => Promise<void>;
  closeGuide: () => void;
};

const InstallContext = createContext<PwaInstallContextValue | null>(null);
const DAY_MS = 24 * 60 * 60 * 1000;
const INSTALL_MEMORY_MS = 90 * DAY_MS;

function storedNumber(key: string): number {
  try {
    return Number.parseInt(window.localStorage.getItem(key) ?? "0", 10) || 0;
  } catch {
    return 0;
  }
}

function storeValue(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Install controls still work when storage is unavailable.
  }
}

function removeStoredValue(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Install controls still work when storage is unavailable.
  }
}

function isRunningStandalone(): boolean {
  const iosNavigator = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || iosNavigator.standalone === true;
}

export function PwaInstallProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [platform, setPlatform] = useState<InstallPlatform>("other");
  const [loadedStorageId, setLoadedStorageId] = useState("");
  const [firstRunSeen, setFirstRunSeen] = useState(false);
  const [homeDismissedUntil, setHomeDismissedUntil] = useState(0);
  const [bannerSnoozedUntil, setBannerSnoozedUntil] = useState(0);
  const [guideOpen, setGuideOpen] = useState(false);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [clock, setClock] = useState(0);

  const userStorageId = userId ?? "anonymous";
  const firstRunKey = `agp:pwa:first-run:v1:${userStorageId}`;
  const homeDismissKey = `agp:pwa:home-dismiss:v1:${userStorageId}`;
  const bannerSnoozeKey = `agp:pwa:banner-snooze:v1:${userStorageId}`;
  const installedKey = "agp:pwa:installed-at:v1";

  useEffect(() => {
    let registrationTimer = 0;
    const queueServiceWorkerRegistration = () => {
      registrationTimer = window.setTimeout(() => {
        if ("serviceWorker" in navigator) {
          navigator.serviceWorker.register("/sw.js").catch(() => undefined);
        }
      }, 1_200);
    };
    if (document.readyState === "complete") queueServiceWorkerRegistration();
    else window.addEventListener("load", queueServiceWorkerRegistration, { once: true });

    const mobileQuery = window.matchMedia("(max-width: 61.25rem)");
    const standaloneQuery = window.matchMedia("(display-mode: standalone)");
    const syncEnvironment = () => {
      const rememberedInstall = storedNumber(installedKey);
      setInstalled(isRunningStandalone() || Date.now() - rememberedInstall < INSTALL_MEMORY_MS);
      setIsMobile(mobileQuery.matches && (navigator.maxTouchPoints > 0 || /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent)));
      setIsOffline(!navigator.onLine);
      setPlatform(detectInstallPlatform({
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        maxTouchPoints: navigator.maxTouchPoints,
      }));
      setClock(Date.now());
    };
    const captureInstall = (event: Event) => {
      event.preventDefault();
      removeStoredValue(installedKey);
      setInstalled(false);
      setInstallPrompt(event as InstallPromptEvent);
    };
    const completeInstall = () => {
      storeValue(installedKey, String(Date.now()));
      setInstalled(true);
      setInstallPrompt(null);
      setGuideOpen(false);
    };

    syncEnvironment();
    window.addEventListener("online", syncEnvironment);
    window.addEventListener("offline", syncEnvironment);
    window.addEventListener("beforeinstallprompt", captureInstall);
    window.addEventListener("appinstalled", completeInstall);
    mobileQuery.addEventListener("change", syncEnvironment);
    standaloneQuery.addEventListener("change", syncEnvironment);
    return () => {
      window.clearTimeout(registrationTimer);
      window.removeEventListener("load", queueServiceWorkerRegistration);
      window.removeEventListener("online", syncEnvironment);
      window.removeEventListener("offline", syncEnvironment);
      window.removeEventListener("beforeinstallprompt", captureInstall);
      window.removeEventListener("appinstalled", completeInstall);
      mobileQuery.removeEventListener("change", syncEnvironment);
      standaloneQuery.removeEventListener("change", syncEnvironment);
    };
  }, [installedKey]);

  useEffect(() => {
    if (!isLoaded) return;
    const frame = window.requestAnimationFrame(() => {
      setFirstRunSeen(storedNumber(firstRunKey) > 0);
      setHomeDismissedUntil(storedNumber(homeDismissKey));
      setBannerSnoozedUntil(storedNumber(bannerSnoozeKey));
      try {
        setSessionComplete(window.sessionStorage.getItem("agp:pwa:install-complete:v1") === "true");
      } catch {
        setSessionComplete(false);
      }
      setClock(Date.now());
      setLoadedStorageId(userStorageId);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [bannerSnoozeKey, firstRunKey, homeDismissKey, isLoaded, userStorageId]);

  const rememberFirstRun = () => {
    storeValue(firstRunKey, String(Date.now()));
    setFirstRunSeen(true);
  };

  const snoozePrompts = (homeUntil: number, bannerUntil: number) => {
    storeValue(homeDismissKey, String(homeUntil));
    storeValue(bannerSnoozeKey, String(bannerUntil));
    setHomeDismissedUntil(homeUntil);
    setBannerSnoozedUntil(bannerUntil);
    setClock(Date.now());
  };

  const dismissFirstRun = () => {
    const tomorrow = Date.now() + DAY_MS;
    rememberFirstRun();
    snoozePrompts(tomorrow, tomorrow);
  };

  const dismissHomeCard = () => {
    const tomorrow = Date.now() + DAY_MS;
    const nextWeek = Date.now() + (7 * DAY_MS);
    snoozePrompts(nextWeek, tomorrow);
  };

  const openInstall = async () => {
    rememberFirstRun();
    if (!installPrompt) {
      setGuideOpen(true);
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (choice.outcome === "accepted") {
      storeValue(installedKey, String(Date.now()));
      setInstalled(true);
      return;
    }
    const tomorrow = Date.now() + DAY_MS;
    snoozePrompts(tomorrow, tomorrow);
  };

  const completeGuide = () => {
    rememberFirstRun();
    setGuideOpen(false);
    setSessionComplete(true);
    try {
      window.sessionStorage.setItem("agp:pwa:install-complete:v1", "true");
    } catch {
      // The guide still closes when session storage is unavailable.
    }
  };

  const available = Boolean(
    isLoaded && isSignedIn && loadedStorageId === userStorageId && isMobile && !installed && !sessionComplete,
  );
  const value: PwaInstallContextValue = {
    bannerVisible: available && firstRunSeen && !guideOpen && bannerSnoozedUntil <= clock && homeDismissedUntil > clock,
    firstRunVisible: available && !firstRunSeen && !guideOpen,
    guideOpen: available && guideOpen,
    homeCardVisible: available && firstRunSeen && !guideOpen && homeDismissedUntil <= clock,
    isOffline,
    platform,
    profileAccessVisible: available && !guideOpen,
    completeGuide,
    dismissFirstRun,
    dismissHomeCard,
    openInstall,
    closeGuide: () => {
      const tomorrow = Date.now() + DAY_MS;
      setGuideOpen(false);
      snoozePrompts(tomorrow, tomorrow);
    },
  };

  return <InstallContext.Provider value={value}>{children}</InstallContext.Provider>;
}

function usePwaInstall() {
  const context = useContext(InstallContext);
  if (!context) throw new Error("PWA install controls require PwaInstallProvider.");
  return context;
}

function InstallPrimaryButton({ label = "Install app" }: { label?: string }) {
  const { openInstall } = usePwaInstall();
  return (
    <button className="pwa-install-primary" type="button" onClick={() => void openInstall()}>
      <Icon name="install" /><span>{label}</span><Icon name="arrow" />
    </button>
  );
}

export function PwaInstallHomeCard() {
  const { dismissHomeCard, homeCardVisible } = usePwaInstall();
  if (!homeCardVisible) return null;
  return (
    <section className="pwa-install-home" aria-labelledby="pwa-home-title">
      <div className="pwa-install-home__message">
        <Image src="/pwa-icon-192.png" alt="" width={72} height={72} />
        <div><h2 id="pwa-home-title">Put the app on your Home Screen</h2><p>Open your picks faster. No app store needed.</p></div>
      </div>
      <InstallPrimaryButton />
      <button className="pwa-install-secondary" type="button" onClick={dismissHomeCard}>Not now</button>
    </section>
  );
}

export function PwaInstallProfileAccess() {
  const { openInstall, profileAccessVisible } = usePwaInstall();
  if (!profileAccessVisible) return null;
  return (
    <section className="pwa-install-profile" aria-labelledby="pwa-profile-title">
      <Image src="/pwa-icon-192.png" alt="" width={64} height={64} />
      <div><h2 id="pwa-profile-title">Install Any Given Pick</h2><p>Add it to your Home Screen for faster access.</p></div>
      <button type="button" onClick={() => void openInstall()}>Install</button>
    </section>
  );
}

function PwaInstallFirstRun() {
  const { dismissFirstRun, firstRunVisible, openInstall } = usePwaInstall();
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (firstRunVisible && !dialog.open) dialog.showModal();
    if (!firstRunVisible && dialog.open) dialog.close();
  }, [firstRunVisible]);
  return (
    <dialog className="pwa-install-dialog pwa-install-dialog--first" ref={dialogRef} onCancel={(event) => { event.preventDefault(); dismissFirstRun(); }}>
      <div className="pwa-install-first-run">
        <Image src="/pwa-icon-192.png" alt="Any Given Pick" width={96} height={96} priority />
        <h2>Keep every week one tap away.</h2>
        <p>Add Any Given Pick to your Home Screen for faster access to picks and results.</p>
        <div className="pwa-install-phone-map" aria-hidden="true"><Image src="/pwa-icon-192.png" alt="" width={72} height={72} /><span /><span /><span /><span /></div>
        <button className="pwa-install-primary" type="button" onClick={() => void openInstall()}><Icon name="install" /><span>Install app</span><Icon name="arrow" /></button>
        <button className="pwa-install-secondary" type="button" onClick={dismissFirstRun}>Maybe later — go to Home</button>
      </div>
    </dialog>
  );
}

function InstallGuide() {
  const { closeGuide, completeGuide, guideOpen, platform } = usePwaInstall();
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (guideOpen && !dialog.open) dialog.showModal();
    if (!guideOpen && dialog.open) dialog.close();
  }, [guideOpen]);

  const iosOther = platform === "ios-other";
  const heading = iosOther ? "Finish in Safari" : platform === "ios-safari" ? "Add it from Safari" : "Install from your browser";
  const steps = platform === "ios-safari"
    ? ["Tap Safari’s Share button.", "Choose Add to Home Screen.", "Turn on Open as Web App, then tap Add."]
    : iosOther
      ? ["Copy this page’s address.", "Open Safari and paste the address.", "Tap Share, then Add to Home Screen."]
      : ["Open your browser menu.", "Choose Install app or Add to Home screen.", "Confirm the installation."];

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <dialog className="pwa-install-dialog pwa-install-dialog--guide" ref={dialogRef} onCancel={(event) => { event.preventDefault(); closeGuide(); }}>
      <div className="pwa-install-guide">
        <button className="pwa-install-guide__close" type="button" onClick={closeGuide}>Close</button>
        <Image src="/pwa-icon-192.png" alt="" width={64} height={64} />
        <h2>{heading}</h2>
        <ol>{steps.map((step, index) => <li key={step}><strong>{index + 1}</strong><span>{step}</span></li>)}</ol>
        {iosOther ? <button className="pwa-install-copy" type="button" onClick={() => void copyAddress()}>{copied ? "Address copied" : "Copy web address"}</button> : null}
        <button className="pwa-install-primary" type="button" onClick={completeGuide}><Icon name="check" /><span>Done</span><Icon name="arrow" /></button>
      </div>
    </dialog>
  );
}

function PwaInstallBanner() {
  const { bannerVisible, openInstall } = usePwaInstall();
  if (!bannerVisible) return null;
  return (
    <button className="pwa-install-banner" type="button" onClick={() => void openInstall()}>
      <Icon name="install" /><span>Install the app</span><Icon name="arrow" />
    </button>
  );
}

export function PwaInstallGlobal() {
  const pathname = usePathname();
  const { bannerVisible, isOffline } = usePwaInstall();
  const playerSurface = pathname === "/" || ["/profile", "/activity", "/results"].some((path) => pathname.startsWith(path));

  useEffect(() => {
    if (playerSurface && bannerVisible) document.documentElement.dataset.pwaInstallBanner = "true";
    else delete document.documentElement.dataset.pwaInstallBanner;
    return () => { delete document.documentElement.dataset.pwaInstallBanner; };
  }, [bannerVisible, playerSurface]);

  if (!playerSurface) return null;
  return (
    <>
      {isOffline ? <div className="pwa-network-banner" role="status">Offline · reconnect before submitting</div> : null}
      <PwaInstallFirstRun />
      <InstallGuide />
      <PwaInstallBanner />
    </>
  );
}
