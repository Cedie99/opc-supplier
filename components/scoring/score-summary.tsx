import { Progress } from "@/components/ui/progress";
import { ClassificationBadge } from "@/components/status-badge";
import type { ScoreResult } from "@/lib/scoring/types";
import { fmtScore } from "@/lib/format";

export function ScoreSummary({ result, blockReasons = [] }: { result: ScoreResult; blockReasons?: string[] }) {
  return (
    <div className="grid gap-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Total weighted score</p>
          <p className="text-3xl font-semibold tabular-nums">{fmtScore(result.total)}</p>
        </div>
        <div className="text-right">
          <ClassificationBadge value={result.classification} />
          {result.band && <p className="text-muted-foreground mt-1 text-xs">{result.band.action}</p>}
        </div>
      </div>
      <Progress value={result.total ?? 0} className="h-2" />
      {blockReasons.length > 0 && (
        <p className="text-destructive text-sm">Blocked — {blockReasons.join("; ")}. Classified as Not Qualified regardless of the score.</p>
      )}
      {result.missing.length > 0 && <p className="text-muted-foreground text-sm">Still to rate: {result.missing.join(", ")}.</p>}
      {result.belowStandard.length > 0 && (
        <p className="text-sm text-amber-700 dark:text-amber-400">Below 3 (supplier concern opens on approval): {result.belowStandard.join(", ")}.</p>
      )}
    </div>
  );
}
