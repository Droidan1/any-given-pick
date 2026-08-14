export type InstallPlatform = "android" | "ios-safari" | "ios-other" | "other";

export function detectInstallPlatform({
  userAgent,
  platform,
  maxTouchPoints,
}: {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
}): InstallPlatform {
  const isIPadDesktopMode = platform === "MacIntel" && maxTouchPoints > 1;
  const isIos = /iPad|iPhone|iPod/i.test(userAgent) || isIPadDesktopMode;
  if (isIos) {
    const isAlternateIosBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(userAgent);
    return isAlternateIosBrowser ? "ios-other" : "ios-safari";
  }
  if (/Android/i.test(userAgent)) return "android";
  return "other";
}
