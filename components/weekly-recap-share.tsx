"use client";

import { useState } from "react";
import { Icon } from "./icons";

export function WeeklyRecapShare({ text }: { text: string }) {
  const [message, setMessage] = useState("");

  async function shareRecap() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: "My Any Given Pick weekly recap", text, url });
        setMessage("Recap shared.");
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      setMessage("Recap copied. Paste it anywhere you want to share it.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage("Sharing was not available. Try copying the page link from your browser.");
    }
  }

  return (
    <div className="weekly-recap-share">
      <button type="button" onClick={shareRecap}>
        <Icon name="share" />
        <span>Share recap</span>
      </button>
      <p aria-live="polite">{message}</p>
    </div>
  );
}
