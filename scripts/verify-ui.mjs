import { writeFile } from "node:fs/promises";

const chromeHost = "http://127.0.0.1:9223";
const appUrl = "http://127.0.0.1:3210";
const screenshotRoot = new URL("../.impeccable/screenshots/", import.meta.url);

const pageTarget = await fetch(`${chromeHost}/json/new?${encodeURIComponent(appUrl)}`, {
  method: "PUT",
}).then((response) => response.json());

const socket = new WebSocket(pageTarget.webSocketDebuggerUrl);
let commandId = 0;
const pending = new Map();
const browserFindings = [];

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  }

  if (message.method === "Runtime.exceptionThrown") {
    browserFindings.push(`Runtime exception: ${message.params.exceptionDetails.text}`);
  }
  if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
    browserFindings.push(`Console error: ${message.params.entry.text}`);
  }
});

await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

function send(method, params = {}) {
  commandId += 1;
  const id = commandId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  return result.result.value;
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 700));
  await evaluate("document.fonts.ready.then(() => true)");
}

async function setViewport(width, height, mobile) {
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
    screenWidth: width,
    screenHeight: height,
  });
}

async function navigate() {
  await send("Page.navigate", { url: appUrl });
  await settle();
}

async function screenshot(filename) {
  const result = await send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await writeFile(new URL(filename, screenshotRoot), Buffer.from(result.data, "base64"));
}

async function clickByLabel(label) {
  const clicked = await evaluate(`(() => {
    const target = [...document.querySelectorAll("button")].find((button) =>
      button.getAttribute("aria-label") === ${JSON.stringify(label)} || button.textContent?.trim() === ${JSON.stringify(label)}
    );
    if (!target) return false;
    target.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`Could not find button: ${label}`);
  await new Promise((resolve) => setTimeout(resolve, 150));
}

await send("Page.enable");
await send("Runtime.enable");
await send("Log.enable");
await setViewport(1440, 900, false);
await navigate();
await evaluate("localStorage.clear(); true");

await evaluate(`localStorage.setItem("pickem-prototype-draft:v1", JSON.stringify({
  picks: { "tb-no": "NO" },
  mondayTotal: 51,
})); true`);
await navigate();
const draftMigration = await evaluate(`({
  selected: document.querySelector(".progress-measure")?.getAttribute("aria-label"),
  mondayTotal: document.querySelector("#monday-total")?.value,
  newKeyCreated: !!localStorage.getItem("any-given-pick-draft:v1"),
  legacyKeyRemoved: !localStorage.getItem("pickem-prototype-draft:v1"),
})`);
await evaluate("localStorage.clear(); true");

await navigate();
const desktop = await evaluate(`({
  heading: document.querySelector("h1")?.textContent,
  brand: document.querySelector(".brand-home")?.textContent?.replace(/\\s+/g, " ").trim(),
  title: document.title,
  noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth,
  sideNavVisible: getComputedStyle(document.querySelector(".side-nav")).display !== "none",
  reviewVisible: !!document.querySelector(".review-action"),
})`);
await screenshot("desktop.png");

await setViewport(390, 844, true);
await navigate();
const mobile = await evaluate(`({
  heading: document.querySelector("h1")?.textContent,
  brand: document.querySelector(".mobile-brand")?.textContent?.replace(/\\s+/g, " ").trim(),
  noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth,
  bottomNavVisible: getComputedStyle(document.querySelector(".bottom-nav")).display !== "none",
  selected: document.querySelector(".progress-measure")?.getAttribute("aria-label"),
})`);
await screenshot("mobile.png");

await evaluate(`(() => {
  const input = document.querySelector("#monday-total");
  const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  if (!input || !setValue) return false;
  setValue.call(input, "44.5");
  input.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
})()`);
await new Promise((resolve) => setTimeout(resolve, 150));
const normalizedMondayTotal = await evaluate("document.querySelector('#monday-total')?.value");

await clickByLabel("Review 8 picks");
const incompleteStatus = await evaluate("document.querySelector('.status-message')?.textContent");

await clickByLabel("Pick New Orleans");
await clickByLabel("Pick Cleveland");
await clickByLabel("Pick Los Angeles");
await clickByLabel("Review 8 picks");
const reviewHeading = await evaluate("document.querySelector('#review-title')?.textContent");
await clickByLabel("Create prototype receipt");
const receipt = await evaluate(`({
  heading: document.querySelector("#receipt-title")?.textContent,
  serverDisclosure: document.querySelector(".receipt small")?.textContent,
  selected: document.querySelector(".progress-measure")?.getAttribute("aria-label"),
})`);
await evaluate("document.querySelector('#receipt-title')?.scrollIntoView({ block: 'center' })");
await new Promise((resolve) => setTimeout(resolve, 300));
await screenshot("mobile-complete.png");

const manifestResponse = await fetch(`${appUrl}/manifest.webmanifest`);
const manifest = {
  status: manifestResponse.status,
  type: manifestResponse.headers.get("content-type"),
  body: await manifestResponse.json(),
};
const worker = await fetch(`${appUrl}/sw.js`).then((response) => ({
  status: response.status,
  type: response.headers.get("content-type"),
}));
const icon192 = await fetch(`${appUrl}/pwa-icon-192`).then((response) => ({
  status: response.status,
  type: response.headers.get("content-type"),
}));
const openGraphImage = await fetch(`${appUrl}/opengraph-image`).then((response) => ({
  status: response.status,
  type: response.headers.get("content-type"),
}));
const sitemap = await fetch(`${appUrl}/sitemap.xml`).then((response) => ({
  status: response.status,
  type: response.headers.get("content-type"),
}));

console.log(JSON.stringify({
  desktop,
  mobile,
  interaction: { draftMigration, normalizedMondayTotal, incompleteStatus, reviewHeading, receipt },
  pwa: { manifest, worker, icon192, openGraphImage, sitemap },
  browserFindings,
}, null, 2));

socket.close();
