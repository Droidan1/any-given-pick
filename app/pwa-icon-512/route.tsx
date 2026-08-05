import { ImageResponse } from "next/og";

export async function GET() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#123f31",
        position: "relative",
      }}
    >
      <div
        style={{
          width: 300,
          height: 48,
          borderRadius: 24,
          background: "#f2c928",
          transform: "rotate(-45deg)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 96,
          right: 78,
          width: 134,
          height: 48,
          borderRadius: 24,
          background: "#f2c928",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 96,
          right: 96,
          width: 48,
          height: 134,
          borderRadius: 24,
          background: "#f2c928",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 78,
          bottom: 78,
          width: 80,
          height: 80,
          borderRadius: 40,
          background: "#f7f0df",
          border: "22px solid #f2c928",
        }}
      />
    </div>,
    { width: 512, height: 512 },
  );
}
