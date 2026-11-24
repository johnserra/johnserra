import { ImageResponse } from "next/og";

export const alt =
  "John Serra — Practical Analytics for Better Small-Business Decisions";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: "#ffffff",
          color: "#222222",
          fontFamily: "sans-serif",
        }}
      >
        {/* 3-band ArsDigita top accent */}
        <div style={{ display: "flex", width: "100%", height: 10, background: "#666666" }} />
        <div style={{ display: "flex", width: "100%", height: 4, background: "#999999" }} />
        <div style={{ display: "flex", width: "100%", height: 14, background: "#0077ad" }} />

        {/* Main body */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            flex: 1,
            padding: "48px 68px 44px",
          }}
        >
          {/* Header row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div
                style={{
                  display: "flex",
                  width: 12,
                  height: 12,
                  borderRadius: 99,
                  background: "#22c55e",
                }}
              />
              <span
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  letterSpacing: 4,
                  color: "#222222",
                }}
              >
                JOHN SERRA
              </span>
            </div>
            <div
              style={{
                display: "flex",
                padding: "8px 18px",
                border: "1px solid #006b9e",
                background: "#f0f8fc",
                color: "#006b9e",
                fontSize: 17,
                fontWeight: 600,
                letterSpacing: 1.5,
              }}
            >
              PRACTICAL ANALYTICS · AI-ASSISTED DATA SYSTEMS
            </div>
          </div>

          {/* Center headline */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 18,
              maxWidth: 1020,
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 58,
                fontWeight: 700,
                lineHeight: 1.12,
                letterSpacing: -1,
                color: "#222222",
              }}
            >
              Practical Analytics for Better Small-Business Decisions.
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 30,
                fontWeight: 500,
                lineHeight: 1.3,
                color: "#006b9e",
              }}
            >
              Clear metrics, trustworthy data, and reports your team can act on.
            </div>
          </div>

          {/* Carbon keyline telemetry strip */}
          <div
            style={{
              display: "flex",
              width: "100%",
              borderTop: "1px solid #cccccc",
              paddingTop: 26,
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "30%" }}>
              <span style={{ fontSize: 24, fontWeight: 700, color: "#222222" }}>Grain First</span>
              <span style={{ fontSize: 17, color: "#545454" }}>Table &amp; Metric Clarity</span>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                width: "36%",
                borderLeft: "1px solid #cccccc",
                paddingLeft: 28,
              }}
            >
              <span style={{ fontSize: 24, fontWeight: 700, color: "#006b9e" }}>4 Pillars</span>
              <span style={{ fontSize: 17, color: "#545454" }}>
                Metrics · Data · Reporting · Ownership
              </span>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                width: "30%",
                borderLeft: "1px solid #cccccc",
                paddingLeft: 28,
              }}
            >
              <span style={{ fontSize: 24, fontWeight: 700, color: "#222222" }}>johnserra.com</span>
              <span style={{ fontSize: 17, color: "#545454" }}>
                Data Analytics · Operations · AI
              </span>
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
