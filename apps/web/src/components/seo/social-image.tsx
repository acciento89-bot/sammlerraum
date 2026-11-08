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
          background: "#142139",
          color: "#fffaf0",
          padding: "64px 76px",
          fontFamily: "sans-serif",
          border: "18px solid #c5a249",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div
            style={{
              display: "flex",
              width: 80,
              height: 80,
              borderRadius: 40,
              background: "#24344c",
              color: "white",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 56,
              fontWeight: 700,
            }}
          >
            <svg width="52" height="56" viewBox="0 0 38 42" fill="none">
              <path
                d="m19 1 18 10-18 10L1 11z M1 14l16 9v18L1 32z M21 23l16-9v18l-16 9z"
                fill="#efd17b"
              />
              <path d="m9 7 18 10" stroke="#142139" strokeWidth="2.5" />
            </svg>
          </div>
          <div style={{ fontSize: 46, fontWeight: 700 }}>{model.title}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.08, maxWidth: 1000 }}>
            {model.subtitle}
          </div>
          <div style={{ fontSize: 30, color: "#cad0dd", maxWidth: 1000, lineHeight: 1.35 }}>
            {model.caption}
          </div>
        </div>
        <div style={{ fontSize: 22, color: "#efd17b", letterSpacing: 5 }}>
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
