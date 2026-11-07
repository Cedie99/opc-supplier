import { BRAND, MARK_PATHS } from "@/components/brand";

/**
 * Original illustration for the sign-in page: an accreditation checklist with a check seal,
 * lubricant packaging (drum, pail, bottles) and soft floating bubbles. Decorative only.
 */
export function LoginIllustration({ className }: { className?: string }) {
  const mint = "#DCEFE4";
  const mintDeep = "#BFE0CC";
  const forest = BRAND.forest;
  const green = BRAND.green;
  const yellow = BRAND.yellow;
  return (
    <svg viewBox="0 0 520 440" className={className} aria-hidden>
      {/* Soft backdrop blobs and bubbles */}
      <path d="M86 250c-22-86 48-170 150-182 98-12 196 34 214 118 18 82-40 168-142 186-104 18-200-36-222-122Z" fill={mint} />
      <path d="M140 262c-12-56 36-110 104-116 66-6 130 22 142 76 12 54-26 108-96 118-70 10-138-24-150-78Z" fill={mintDeep} opacity="0.55" />
      <circle cx="70" cy="96" r="22" fill={mint} opacity="0.8" />
      <circle cx="452" cy="74" r="14" fill={mint} />
      <circle cx="486" cy="300" r="20" fill={mint} opacity="0.7" />
      <circle cx="42" cy="330" r="12" fill={mint} />
      <circle cx="404" cy="400" r="9" fill={mintDeep} opacity="0.7" />

      {/* Ground shadow */}
      <ellipse cx="270" cy="372" rx="190" ry="16" fill={forest} opacity="0.12" />

      {/* Steel drum */}
      <g>
        <rect x="88" y="236" width="88" height="132" rx="10" fill={green} />
        <rect x="88" y="236" width="88" height="14" rx="7" fill={forest} />
        <rect x="88" y="290" width="88" height="8" fill={forest} opacity="0.45" />
        <rect x="88" y="328" width="88" height="8" fill={forest} opacity="0.45" />
        <rect x="104" y="252" width="10" height="108" rx="5" fill="#fff" opacity="0.18" />
        <svg x="110" y="300" width="44" height="44" viewBox="0 0 100 100">
          <path d={MARK_PATHS.left} fill="#fff" opacity="0.9" />
          <path d={MARK_PATHS.right} fill={yellow} />
        </svg>
      </g>

      {/* Clipboard with checklist */}
      <g>
        <rect x="200" y="96" width="168" height="228" rx="16" fill={forest} />
        <rect x="212" y="110" width="144" height="202" rx="10" fill="#fff" />
        <rect x="250" y="86" width="68" height="26" rx="8" fill={green} />
        {[148, 190, 232, 274].map((y, i) => (
          <g key={y}>
            <rect x="228" y={y - 11} width="22" height="22" rx="6" fill={i < 3 ? green : mint} />
            {i < 3 && <path d={`M233 ${y}l5 5 9-10`} fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />}
            <rect x="262" y={y - 8} width={i % 2 ? 62 : 78} height="7" rx="3.5" fill={forest} opacity="0.75" />
            <rect x="262" y={y + 3} width={i % 2 ? 42 : 54} height="5" rx="2.5" fill={forest} opacity="0.25" />
          </g>
        ))}
      </g>

      {/* Accreditation seal */}
      <g>
        <circle cx="372" cy="292" r="40" fill={yellow} />
        <circle cx="372" cy="292" r="31" fill="none" stroke={forest} strokeWidth="3" strokeDasharray="4 5" opacity="0.5" />
        <path d="M356 292l11 11 21-23" fill="none" stroke={forest} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      {/* Pail */}
      <g>
        <path d="M398 318h72l-8 52h-56Z" fill="#fff" stroke={forest} strokeWidth="3" strokeLinejoin="round" />
        <path d="M402 318c0-22 64-22 64 0" fill="none" stroke={forest} strokeWidth="3" />
        <rect x="396" y="314" width="76" height="9" rx="4.5" fill={green} />
        <rect x="412" y="336" width="44" height="12" rx="3" fill={yellow} />
      </g>

      {/* Bottles */}
      <g>
        <rect x="190" y="318" width="40" height="52" rx="9" fill={yellow} />
        <rect x="202" y="306" width="16" height="14" rx="3" fill={forest} />
        <rect x="198" y="334" width="24" height="16" rx="3" fill="#fff" opacity="0.85" />
        <rect x="240" y="328" width="34" height="42" rx="8" fill={green} />
        <rect x="250" y="318" width="14" height="12" rx="3" fill={forest} />
        <rect x="246" y="340" width="22" height="12" rx="3" fill="#fff" opacity="0.85" />
      </g>

      {/* Floating leaves echoing the mark */}
      <svg x="420" y="150" width="40" height="40" viewBox="0 0 100 100">
        <path d={MARK_PATHS.left} fill={green} opacity="0.85" />
      </svg>
      <svg x="120" y="150" width="30" height="30" viewBox="0 0 100 100">
        <path d={MARK_PATHS.right} fill={yellow} />
      </svg>
    </svg>
  );
}
