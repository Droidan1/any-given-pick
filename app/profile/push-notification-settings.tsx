"use client";

import { useEffect, useState } from "react";
import {
  removePushSubscriptionAction,
  savePushSubscriptionAction,
} from "./push-notification-actions";

type PushState =
  | "checking"
  | "unsupported"
  | "install_required"
  | "blocked"
  | "off"
  | "on"
  | "working";

function isIosDevice(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  const iosNavigator = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches
    || iosNavigator.standalone === true;
}

function decodeVapidKey(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replaceAll("-", "+").replaceAll("_", "/");
  const binary = window.atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function subscriptionInput(subscription: PushSubscription) {
  const serialized = subscription.toJSON();
  if (!serialized.endpoint || !serialized.keys?.p256dh || !serialized.keys.auth) return null;
  return {
    endpoint: serialized.endpoint,
    keys: { p256dh: serialized.keys.p256dh, auth: serialized.keys.auth },
    userAgent: navigator.userAgent.slice(0, 256),
  };
}

export function PushNotificationSettings({ vapidPublicKey }: { vapidPublicKey: string }) {
  const [state, setState] = useState<PushState>("checking");
  const [message, setMessage] = useState("Checking this device…");

  useEffect(() => {
    let active = true;
    async function check() {
      if (
        !vapidPublicKey
        || !("serviceWorker" in navigator)
        || !("PushManager" in window)
        || !("Notification" in window)
      ) {
        if (active) {
          setState("unsupported");
          setMessage("Push alerts are not available in this browser yet.");
        }
        return;
      }
      if (isIosDevice() && !isStandalone()) {
        if (active) {
          setState("install_required");
          setMessage("On iPhone or iPad, install Any Given Pick on your Home Screen first.");
        }
        return;
      }
      if (Notification.permission === "denied") {
        if (active) {
          setState("blocked");
          setMessage("Alerts are blocked in this device’s notification settings.");
        }
        return;
      }
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        const subscription = await registration.pushManager.getSubscription();
        if (!active) return;
        if (subscription) {
          const input = subscriptionInput(subscription);
          if (!input) {
            setState("off");
            setMessage("This device’s saved subscription could not be verified. Turn push on again.");
            return;
          }
          const result = await savePushSubscriptionAction(input);
          if (!active) return;
          setState(result.ok ? "on" : "off");
          setMessage(result.ok
            ? "This device is ready for game-week alerts."
            : result.message);
          return;
        }
        setState("off");
        setMessage("Turn on alerts for this device when the call sheet changes.");
      } catch {
        if (active) {
          setState("unsupported");
          setMessage("Push alerts could not be prepared on this device.");
        }
      }
    }
    void check();
    return () => { active = false; };
  }, [vapidPublicKey]);

  async function enablePush() {
    setState("working");
    setMessage("Waiting for notification permission…");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        setMessage(permission === "denied"
          ? "Alerts are blocked in this device’s notification settings."
          : "Push notifications were not enabled.");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js");
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeVapidKey(vapidPublicKey),
      });
      const input = subscriptionInput(subscription);
      if (!input) throw new Error("Subscription keys were unavailable.");
      const result = await savePushSubscriptionAction(input);
      if (!result.ok) {
        if (!existing) await subscription.unsubscribe();
        setState("off");
        setMessage(result.message);
        return;
      }
      setState("on");
      setMessage(result.message);
    } catch {
      setState("off");
      setMessage("Push notifications could not be enabled. Try again from this device.");
    }
  }

  async function disablePush() {
    setState("working");
    setMessage("Turning off alerts for this device…");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const result = await removePushSubscriptionAction(subscription.endpoint);
        if (!result.ok) {
          setState("on");
          setMessage(result.message);
          return;
        }
        await subscription.unsubscribe();
      }
      setState("off");
      setMessage("Push notifications are off for this device.");
    } catch {
      setState("on");
      setMessage("This device could not update its push setting. Try again.");
    }
  }

  const canEnable = state === "off";
  const canDisable = state === "on";
  const statusLabel = state === "on"
    ? "On"
    : state === "working"
      ? "Working"
      : state === "blocked"
        ? "Blocked"
        : state === "install_required"
          ? "Install app"
          : state === "unsupported"
            ? "Unavailable"
            : "Off";

  return (
    <section className="push-notification-card" aria-labelledby="push-notifications-title">
      <div className="push-notification-card__heading">
        <div>
          <p className="card-kicker">Pocket play call</p>
          <h2 id="push-notifications-title">Web push</h2>
        </div>
        <strong className={`push-notification-status push-notification-status--${state}`}>{statusLabel}</strong>
      </div>
      <p className="push-notification-card__intro">
        Get the same four game-week updates on this device: card published, deadline approaching, picks submitted, and results available.
      </p>
      <div className="push-notification-device-row">
        <div>
          <strong>This device</strong>
          <span>{message}</span>
        </div>
        {canEnable ? (
          <button className="review-action" type="button" onClick={enablePush}>Turn on push</button>
        ) : null}
        {canDisable ? (
          <button className="text-action" type="button" onClick={disablePush}>Turn off</button>
        ) : null}
      </div>
      {state === "install_required" ? (
        <p className="push-notification-help">Open Share in Safari, choose <strong>Add to Home Screen</strong>, then open the installed app and return here.</p>
      ) : null}
      {state === "blocked" ? (
        <p className="push-notification-help">Open your device settings, allow notifications for Any Given Pick, then reload this page.</p>
      ) : null}
      <p className="sr-only" aria-live="polite">{message}</p>
    </section>
  );
}
