import { cn } from "@/lib/utils";
import type { Classification } from "@/lib/scoring/types";

const RING_COLOR: Record<Classification, string> = {
  preferred: "var(--primary)",
  approved: "oklch(0.6 0.1 175)",
  conditional: "oklch(0.75 0.15 75)",
  not_qualified: "oklch(0.58 0.2 27)",
};

/** A donut showing a 0–100 score, coloured by classification. */
export function ScoreRing({
  score,
  classification,
  size = 96,
  stroke = 9,
  className,
  label,
  track = "var(--muted)",
  textClassName,
}: {
  score: number | null | undefined;
  classification?: Classification | null;
  size?: number;
  stroke?: number;
  className?: string;
  label?: string;
  track?: string;
  textClassName?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = score == null ? 0 : Math.max(0, Math.min(100, score));
  const color = classification ? RING_COLOR[classification] : "var(--primary)";
  return (
    <div className={cn("relative inline-grid shrink-0 place-items-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        {score != null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * c} ${c}`}
          />
        )}
      </svg>
      <div className={cn("absolute inset-0 grid place-content-center text-center leading-none", textClassName)}>
        <span className="font-semibold tabular-nums" style={{ fontSize: size * 0.24 }}>
          {score == null ? "—" : `${Math.round(score)}`}
          {score != null && <span style={{ fontSize: size * 0.12 }}>%</span>}
        </span>
        {label && (
          <span className="mt-1 opacity-70" style={{ fontSize: Math.max(9, size * 0.1) }}>
            {label}
          </span>
        )}
      </div>
    </div>
  );
}
