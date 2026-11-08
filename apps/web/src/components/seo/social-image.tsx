import { ImageResponse } from "next/og";
import type { OgModel } from "../../seo/social-preview";
export function socialImage(model: OgModel) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#f3efe4",
          color: "#17291f",
          padding: "64px 76px",
          fontFamily: "sans-serif",
          border: "18px solid #315d48",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div
            style={{
              display: "flex",
              width: 80,
              height: 80,
              borderRadius: 40,
              background: "#315d48",
              color: "white",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 56,
              fontWeight: 700,
            }}
          >
            S
          </div>
          <div style={{ fontSize: 46, fontWeight: 700 }}>{model.title}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.08, maxWidth: 1000 }}>
            {model.subtitle}
          </div>
          <div style={{ fontSize: 30, color: "#465c4c", maxWidth: 1000, lineHeight: 1.35 }}>
            {model.caption}
          </div>
        </div>
        <div style={{ fontSize: 22, color: "#946145", letterSpacing: 5 }}>
          DE / EN · SAMMLERRAUM
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        "cache-control": "public, max-age=86400, stale-while-revalidate=3600",
        "x-content-type-options": "nosniff",
      },
    },
  );
}
