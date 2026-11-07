import { cn } from "@/lib/utils";

/** Brand colours of the company drop mark. Fixed values: they do not change with the theme. */
export const BRAND = {
  green: "#1E8C4B",
  yellow: "#F2CC0F",
  forest: "#0E3B24",
} as const;

/** The two drop halves, drawn in a 100×100 box. Shared by the React mark, the favicon and the app icon. */
export const MARK_PATHS = {
  left: "M44 4C25 19 10 37 10 57c0 17 12 28 31 29 1-28 2-55 3-82Z",
  right: "M54 16c20 1 34 14 34 33 0 17-11 32-29 49-2-28-4-55-5-82Z",
} as const;

/** The company drop mark alone (green and yellow halves). */
export function LogoMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={cn("size-8 shrink-0", className)} role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      <path d={MARK_PATHS.left} fill={BRAND.green} />
      <path d={MARK_PATHS.right} fill={BRAND.yellow} />
    </svg>
  );
}

/**
 * App icon, concept A: white tile, the drop mark, and a dark green check badge for "accredited".
 * Below 40 px the badge is dropped, matching the icon guidelines.
 */
export function AppIcon({ className, badge = true }: { className?: string; badge?: boolean }) {
  return (
    <span className={cn("relative inline-flex size-9 shrink-0 items-center justify-center rounded-[28%] bg-white shadow-sm ring-1 ring-black/5", className)}>
      <svg viewBox="0 0 100 100" className="size-[74%]" aria-hidden>
        {/* With the badge, the mark shrinks toward the top-left so the badge gets its own corner. */}
        <g transform={badge ? "translate(3 2) scale(0.8)" : undefined}>
          <path d={MARK_PATHS.left} fill={BRAND.green} />
          <path d={MARK_PATHS.right} fill={BRAND.yellow} />
        </g>
        {badge && (
          <g>
            <circle cx="79" cy="79" r="17" fill={BRAND.forest} stroke="#fff" strokeWidth="4" />
            <path d="M71.5 79.5l5.5 5.5 10.5-11.5" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        )}
      </svg>
    </span>
  );
}

/** Icon + product name. `tone="dark"` for use on the green brand surface. */
export function BrandLockup({
  className,
  subtitle = "Oracle Petroleum",
  tone = "dark",
}: {
  className?: string;
  subtitle?: string;
  tone?: "dark" | "light";
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <AppIcon className="size-10" />
      <div className="leading-tight">
        <p className="font-semibold">Supplier Accreditation</p>
        <p className={cn("text-xs", tone === "dark" ? "text-forest-foreground/70" : "text-muted-foreground")}>{subtitle}</p>
      </div>
    </div>
  );
}

/** Kept for existing imports: the app icon at sidebar size. */
export function BrandMark({ className }: { className?: string }) {
  return <AppIcon className={cn("size-8", className)} badge={false} />;
}
