import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "Any Given Pick — One sheet. Every call.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const displayFont = readFile(
  join(
    process.cwd(),
    "node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-700-normal.woff",
  ),
);

const brandMark = readFile(join(process.cwd(), "public/pwa-icon-192.png")).then(
  (data) => `data:image/png;base64,${data.toString("base64")}`,
);

export default async function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        overflow: "hidden",
        background: "#123f31",
        color: "#f7f0df",
        fontFamily: "Barlow Condensed",
      }}
    >
      <div style={{ width: 42, height: "100%", display: "flex", background: "#bc4f25" }} />
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "68px 72px 76px 78px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <img src={await brandMark} width={88} height={88} alt="" />
          <div style={{ display: "flex", fontSize: 46, letterSpacing: 7, textTransform: "uppercase" }}>
            Any Given
          </div>
        </div>
        <div
          style={{
            display: "flex",
            marginTop: -10,
            color: "#f2c928",
            fontSize: 218,
            fontWeight: 700,
            letterSpacing: -5,
            lineHeight: 0.9,
            textTransform: "uppercase",
          }}
        >
          Pick
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 22,
            marginTop: 30,
            color: "#f7f0df",
            fontSize: 34,
            letterSpacing: 5,
            textTransform: "uppercase",
          }}
        >
          <span>One sheet</span>
          <span style={{ color: "#f2c928" }}>·</span>
          <span>Every call</span>
        </div>
      </div>
      <div
        style={{
          width: 324,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          margin: "42px 42px 42px 0",
          padding: "46px 38px",
          background: "#f7f0df",
          color: "#123f31",
        }}
      >
        <div style={{ display: "flex", fontSize: 30, letterSpacing: 3, textTransform: "uppercase" }}>
          Weekly football picks
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {["Pick the winners", "Call the total", "Review the sheet"].map((line, index) => (
            <div key={line} style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 27 }}>
              <span
                style={{
                  width: 32,
                  height: 32,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: index === 2 ? "#f2c928" : "#123f31",
                  color: index === 2 ? "#123f31" : "#f7f0df",
                }}
              >
                {index + 1}
              </span>
              <span>{line}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", color: "#bc4f25", fontSize: 26, letterSpacing: 2 }}>
          ANYGIVENPICK.APP
        </div>
      </div>
    </div>,
    {
      ...size,
      fonts: [{ name: "Barlow Condensed", data: await displayFont, weight: 700 }],
    },
  );
}
