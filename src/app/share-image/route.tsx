import { ImageResponse } from "next/og";
export async function GET() {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: "#0b1011",
        color: "#f6f7f4",
        padding: "58px 68px",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", fontSize: 29, fontWeight: 700 }}>
        grocerycodes<span style={{ color: "#c4f4ca" }}>.</span>
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 62,
          color: "#c4f4ca",
          fontSize: 19,
          letterSpacing: "4px",
        }}
      >
        SOUTH AFRICAN GROCERY PROMOTIONS
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: 18,
          fontSize: 82,
          fontWeight: 700,
          letterSpacing: "-4px",
          lineHeight: 1.06,
        }}
      >
        <div style={{ display: "flex" }}>A little less</div>
        <div style={{ display: "flex", color: "#c4f4ca" }}>at checkout.</div>
      </div>
      <div style={{ display: "flex", marginTop: 26, fontSize: 23, color: "#a0a7aa" }}>
        Coupon codes. Delivery benefits. Clear terms.
      </div>
      <div style={{ display: "flex", marginTop: "auto", gap: 14 }}>
        {["Sixty60", "Pick n Pay", "Woolworths", "Shoprite", "SPAR2U", "Makro"].map((name) => (
          <div
            key={name}
            style={{
              display: "flex",
              padding: "12px 17px",
              borderRadius: 18,
              background: "#1f262a",
              fontSize: 17,
            }}
          >
            {name}
          </div>
        ))}
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      headers: { "Cache-Control": "public, max-age=86400", "X-Robots-Tag": "noindex" },
    },
  );
}
