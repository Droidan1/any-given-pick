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
          width: 112,
          height: 18,
          borderRadius: 9,
          background: "#f2c928",
          transform: "rotate(-45deg)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 36,
          right: 29,
          width: 50,
          height: 18,
          borderRadius: 9,
          background: "#f2c928",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 36,
          right: 36,
          width: 18,
          height: 50,
          borderRadius: 9,
          background: "#f2c928",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 29,
          bottom: 29,
          width: 30,
          height: 30,
          borderRadius: 15,
          background: "#f7f0df",
          border: "8px solid #f2c928",
        }}
      />
    </div>,
    { width: 192, height: 192 },
  );
}
