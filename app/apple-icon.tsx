import { ImageResponse } from "next/og";
import { BRAND, MARK_PATHS } from "@/components/brand";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** 180 px home-screen icon (concept A): white tile, drop mark, dark green check badge. iOS rounds the corners. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff" }}>
        <svg width="136" height="136" viewBox="0 0 100 100">
          <g transform="translate(3 2) scale(0.8)">
            <path d={MARK_PATHS.left} fill={BRAND.green} />
            <path d={MARK_PATHS.right} fill={BRAND.yellow} />
          </g>
          <circle cx="79" cy="79" r="17" fill={BRAND.forest} stroke="#ffffff" strokeWidth="4" />
          <path d="M71.5 79.5l5.5 5.5 10.5-11.5" fill="none" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    ),
    size,
  );
}
