import { describe, expect, it } from "vitest";
import { detectInstallPlatform } from "./install";

describe("detectInstallPlatform", () => {
  it("recognizes Safari on iPhone", () => {
    expect(detectInstallPlatform({
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
      platform: "iPhone",
      maxTouchPoints: 5,
    })).toBe("ios-safari");
  });

  it("separates alternate iOS browsers from Safari", () => {
    expect(detectInstallPlatform({
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/140.0 Mobile/15E148 Safari/604.1",
      platform: "iPhone",
      maxTouchPoints: 5,
    })).toBe("ios-other");
  });

  it("recognizes Android", () => {
    expect(detectInstallPlatform({
      userAgent: "Mozilla/5.0 (Linux; Android 16; Pixel 10) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36",
      platform: "Linux armv8l",
      maxTouchPoints: 5,
    })).toBe("android");
  });

  it("recognizes iPad desktop mode", () => {
    expect(detectInstallPlatform({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15",
      platform: "MacIntel",
      maxTouchPoints: 5,
    })).toBe("ios-safari");
  });
});
