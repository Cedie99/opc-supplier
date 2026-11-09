"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BanIcon, CheckIcon, InfoIcon, Loader2Icon, LockIcon, SaveIcon, SendIcon, StarIcon, TrashIcon, TrophyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClassificationBadge, Pill, RatingDot } from "@/components/status-badge";
import { ScoreRing } from "@/components/score-ring";
import { CriterionInputRow, NumberBox } from "./criterion-input";
import { ScoreSummary } from "./score-summary";
import { scoreCanvass } from "@/lib/scoring/canvass";
import type { Band, CriterionConfig } from "@/lib/scoring/types";
import type { ScoreInput } from "@/lib/db/schema";
import type { ActionState } from "@/lib/action-state";
import type { Role } from "@/lib/constants";
import { FIELD_OWNER_LABELS, canFill, criterionOwner } from "@/lib/scoring/ownership";
import { fmtMoney, fmtNumber, fmtScore } from "@/lib/format";
import { cn } from "@/lib/utils";

export type MatrixEntry = {
  id: string;
  supplierId: string;
  supplierName: string;
  supplierCode: string;
  landedCost: number | null;
  quotationRef: string | null;
  criticalSpecFailed: boolean;
  notes: string | null;
  inputs: ScoreInput[];
  blockingDocuments: string[];
};

type Props = {
  criteria: CriterionConfig[];
  bands: Band[];
  entries: MatrixEntry[];
  recommendedSupplierId: string | null;
  recommendation: string | null;
  readOnly: boolean;
  role: Role;
  save: (json: string) => Promise<ActionState>;
  submit: (json: string) => Promise<ActionState>;
  remove: (entryId: string) => Promise<ActionState>;
};

/** Rating → cell tint for the comparison heat map. */
const HEAT: Record<number, string> = {
  5: "bg-emerald-50 dark:bg-emerald-500/10",
  4: "bg-teal-50/70 dark:bg-teal-500/10",
  3: "bg-blue-50/50 dark:bg-blue-500/5",
  2: "bg-amber-50 dark:bg-amber-500/10",
  1: "bg-red-50 dark:bg-red-500/10",
};
const BAR: Record<number, string> = {
  5: "bg-emerald-600",
  4: "bg-teal-600",
  3: "bg-blue-600",
  2: "bg-amber-500",
  1: "bg-red-600",
};

/** Side-by-side Supplier Selection Matrix with live scoring. The server re-scores on save. */
export function CanvassMatrix({ criteria, bands, entries: initial, recommendedSupplierId, recommendation, readOnly, role, save, submit, remove }: Props) {
  // Each role fills only its own fields; the server enforces the same rule.
  const canPurchasing = !readOnly && canFill(role, "purchasing");
  const canQa = !readOnly && canFill(role, "qa");
  const qaFields = [...criteria.filter((c) => criterionOwner(c) === "qa").map((c) => c.name), "the critical specification check"].join(" and ");
  const router = useRouter();
  const [entries, setEntries] = useState(initial);
  const [recommended, setRecommended] = useState<string | null>(recommendedSupplierId);
  const [reason, setReason] = useState(recommendation ?? "");
  const [pending, startTransition] = useTransition();
  const [dirty, setDirty] = useState(false);
  const [activeTab, setActiveTab] = useState(initial[0]?.id ?? "");

  const scored = useMemo(() => scoreCanvass(criteria, bands, entries), [criteria, bands, entries]);
  const priceKeys = criteria.filter((c) => c.inputMode === "price_diff").map((c) => c.key);
  const byId = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);

  // Rank: qualified suppliers by score, then blocked ones.
  const ranked = useMemo(
    () =>
      [...scored.results].sort((a, b) => {
        if (a.blocked !== b.blocked) return a.blocked ? 1 : -1;
        return (b.result.total ?? -1) - (a.result.total ?? -1);
      }),
    [scored.results],
  );
  const rankOf = (id: string) => ranked.findIndex((r) => r.id === id) + 1;

  const update = (id: string, patch: Partial<MatrixEntry>) => {
    setDirty(true);
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  };
  const setInput = (id: string, input: ScoreInput) => {
    const entry = entries.find((e) => e.id === id)!;
    const others = entry.inputs.filter((i) => i.key !== input.key);
    update(id, { inputs: [...others, input] });
  };

  const payload = () =>
    JSON.stringify({
      entries: entries.map((e) => ({
        id: e.id,
        landedCost: e.landedCost,
        quotationRef: e.quotationRef,
        criticalSpecFailed: e.criticalSpecFailed,
        notes: e.notes,
        inputs: e.inputs,
      })),
      recommendedSupplierId: recommended,
      recommendation: reason.trim() || null,
    });

  const run = (fn: (json: string) => Promise<ActionState>) =>
    startTransition(async () => {
      const res = await fn(payload());
      if (res.error) toast.error(res.error);
      else {
        toast.success(res.message ?? "Saved.");
        setDirty(false);
        router.refresh();
      }
    });

  const openRatings = (id: string) => {
    setActiveTab(id);
    document.getElementById("ratings")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (entries.length === 0) {
    return (
      <div className="text-muted-foreground rounded-2xl border border-dashed p-10 text-center text-sm">
        Add the suppliers you want to compare (at least 2, ideally 3).
      </div>
    );
  }

  const bestId = scored.best?.id ?? null;
  const recommendedEntry = entries.find((e) => e.supplierId === recommended);
  const columns = scored.results; // keep the order the suppliers were added in

  return (
    <div className="grid gap-6">
      {/* ─── Scorecards ─────────────────────────────────────────────── */}
      <div className={cn("grid gap-4", columns.length >= 3 ? "md:grid-cols-2 xl:grid-cols-3" : "md:grid-cols-2", columns.length >= 4 && "2xl:grid-cols-4")}>
        {columns.map((r) => {
          const e = byId.get(r.id)!;
          const isBest = r.id === bestId;
          const isRecommended = e.supplierId === recommended;
          const isLowest = scored.lowestLandedCost != null && e.landedCost === scored.lowestLandedCost && !e.criticalSpecFailed;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => openRatings(r.id)}
              className={cn(
                "bg-card group relative overflow-hidden rounded-[1.5rem] border p-5 text-left transition-shadow hover:shadow-md",
                isBest && "border-primary ring-primary/25 ring-2",
                r.blocked && "bg-muted/40",
              )}
            >
              {isBest && (
                <span className="bg-highlight text-highlight-foreground absolute top-0 right-0 inline-flex items-center gap-1 rounded-bl-2xl px-3 py-1 text-xs font-semibold">
                  <TrophyIcon className="size-3.5" /> Highest score
                </span>
              )}
              <div className="flex items-start gap-4">
                <ScoreRing score={r.result.total} classification={r.blocked ? "not_qualified" : r.result.classification} size={76} stroke={7} />
                <div className="min-w-0 flex-1 pt-1">
                  <p className={cn("text-muted-foreground text-xs font-semibold tracking-wider uppercase", isBest && "pr-28")}>Rank #{rankOf(r.id)}</p>
                  <p className="mt-0.5 leading-snug font-semibold">{e.supplierName}</p>
                  <p className="text-muted-foreground text-xs">{e.supplierCode}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {r.blocked ? <Pill tone="red">Blocked</Pill> : <ClassificationBadge value={r.result.classification} />}
                    {isRecommended && (
                      <Pill tone="green">
                        <CheckIcon className="mr-0.5 size-3" /> Recommended
                      </Pill>
                    )}
                  </div>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t pt-4 text-sm">
                <div>
                  <dt className="text-muted-foreground text-xs">Landed cost / unit</dt>
                  <dd className="flex items-center gap-1.5 font-semibold tabular-nums">
                    {fmtMoney(e.landedCost)}
                    {isLowest && <Pill tone="green">Lowest</Pill>}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Still to rate</dt>
                  <dd className="font-semibold">{r.result.missing.length ? r.result.missing.length : <span className="text-emerald-700 dark:text-emerald-400">Complete</span>}</dd>
                </div>
              </dl>
              {r.blocked && (
                <p className="text-destructive mt-3 flex items-start gap-1.5 text-xs">
                  <BanIcon className="mt-0.5 size-3.5 shrink-0" /> {r.blockReasons.join("; ")}
                </p>
              )}
              {!r.blocked && r.result.belowStandard.length > 0 && (
                <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">Below 3: {r.result.belowStandard.join(", ")}</p>
              )}
              <span className="text-primary mt-3 block text-xs font-medium opacity-0 transition-opacity group-hover:opacity-100">
                {readOnly ? "View ratings →" : "Edit ratings →"}
              </span>
            </button>
          );
        })}
      </div>

      {/* ─── Comparison table ───────────────────────────────────────── */}
      <Card className="gap-0 overflow-hidden pb-0">
        <CardHeader className="pb-5">
          <CardTitle>Side-by-side comparison</CardTitle>
          <CardDescription>
            Weighted points per criterion; the strongest supplier on each row is marked with a star. Price is compared with the lowest landed cost among technically qualified
            suppliers{scored.lowestLandedCost != null && ` (${fmtMoney(scored.lowestLandedCost)})`}.
          </CardDescription>
        </CardHeader>
        <div className="overflow-x-auto border-t">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th scope="col" className="bg-muted/95 sticky left-0 z-10 px-5 py-3 text-left font-medium">
                  Criterion
                </th>
                {columns.map((r) => {
                  const e = byId.get(r.id)!;
                  return (
                    <th key={r.id} scope="col" className={cn("min-w-44 px-4 py-3 text-left font-medium", r.id === bestId && "bg-secondary")}>
                      <span className="flex items-center gap-1.5">
                        <span className="bg-forest text-forest-foreground inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] tabular-nums">
                          {rankOf(r.id)}
                        </span>
                        <span className="line-clamp-2">{e.supplierName}</span>
                        {r.id === bestId && <TrophyIcon className="size-3.5 shrink-0 text-amber-500" aria-label="Highest score" />}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {criteria.map((c) => {
                const cells = columns.map((r) => r.result.criteria.find((x) => x.key === c.key)!);
                const top = Math.max(...cells.map((x) => (x.rating ? x.points : -1)));
                const topCount = cells.filter((x) => x.rating && x.points === top).length;
                return (
                  <tr key={c.key} className="border-t">
                    <th scope="row" className="bg-card sticky left-0 z-10 px-5 py-3 text-left font-normal">
                      <span className="block font-medium">{c.name}</span>
                      <span className="text-muted-foreground text-xs">
                        {c.weight}% · {c.metricLabel}
                      </span>
                    </th>
                    {cells.map((cr, i) => {
                      const r = columns[i];
                      const isTop = cr.rating != null && cr.points === top && top > 0 && topCount < columns.length;
                      const width = cr.effectiveWeight ? Math.min(100, (cr.points / cr.effectiveWeight) * 100) : 0;
                      return (
                        <td key={r.id} className={cn("px-4 py-3 align-top", cr.rating ? HEAT[cr.rating] : "", r.blocked && "opacity-60")}>
                          {cr.isNa ? (
                            <span className="text-muted-foreground text-xs">Not applicable</span>
                          ) : cr.rating == null ? (
                            <span className="text-muted-foreground text-xs">Not rated yet</span>
                          ) : (
                            <div className="grid gap-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="flex items-center gap-1.5">
                                  <RatingDot rating={cr.rating} />
                                  {isTop && <StarIcon className="size-3.5 fill-amber-400 text-amber-500" aria-label="Best on this criterion" />}
                                </span>
                                <span className="tabular-nums">
                                  <span className="font-semibold">{fmtNumber(cr.points)}</span>
                                  <span className="text-muted-foreground text-xs"> / {fmtNumber(cr.effectiveWeight)}</span>
                                </span>
                              </div>
                              <div className="h-1.5 rounded-full bg-black/5 dark:bg-white/10">
                                <div className={cn("h-1.5 rounded-full", BAR[cr.rating])} style={{ width: `${width}%` }} />
                              </div>
                              {cr.rawValue != null && (
                                <span className="text-muted-foreground text-xs tabular-nums">
                                  Measured {fmtNumber(cr.rawValue)} {c.unit}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-forest text-forest-foreground">
                <th scope="row" className="bg-forest sticky left-0 z-10 px-5 py-4 text-left">
                  <span className="block font-semibold">Total score</span>
                  <span className="text-forest-foreground/70 text-xs font-normal">out of 100</span>
                </th>
                {columns.map((r) => (
                  <td key={r.id} className="px-4 py-4">
                    <span className={cn("text-2xl font-semibold tabular-nums", r.id === bestId && "text-highlight")}>{fmtScore(r.result.total)}</span>
                  </td>
                ))}
              </tr>
              <tr className="border-t">
                <th scope="row" className="bg-card sticky left-0 z-10 px-5 py-3 text-left font-medium">
                  Classification
                </th>
                {columns.map((r) => (
                  <td key={r.id} className="px-4 py-3">
                    <div className="grid gap-1">
                      {r.blocked ? <Pill tone="red" className="w-fit">Blocked</Pill> : <ClassificationBadge value={r.result.classification} />}
                      {!r.blocked && r.result.band && <span className="text-muted-foreground text-xs">{r.result.band.action}</span>}
                    </div>
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {/* ─── Ratings per supplier ───────────────────────────────────── */}
      <Card id="ratings" className="scroll-mt-20">
        <CardHeader>
          <CardTitle>Ratings per supplier</CardTitle>
          <CardDescription>Enter the measured values; ratings are calculated from the thresholds. Click ⓘ to see how each criterion is rated.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {!readOnly && (
            <div className="bg-secondary/60 flex items-start gap-3 rounded-2xl px-4 py-3 text-sm">
              <InfoIcon className="text-primary mt-0.5 size-4 shrink-0" />
              <p>
                {canPurchasing && canQa
                  ? "As Admin you can fill in every field."
                  : canQa
                    ? `You fill in the quality fields: ${qaFields}. The Purchasing Associate fills in the rest and submits the canvass.`
                    : `You fill in the commercial fields and submit the canvass. The Purchasing Officer fills in ${qaFields}.`}
              </p>
            </div>
          )}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-4">
            <TabsList>
              {entries.map((e) => {
                const r = scored.results.find((x) => x.id === e.id)!;
                return (
                  <TabsTrigger key={e.id} value={e.id}>
                    <span className="max-w-48 truncate">{e.supplierName}</span>
                    <span className="rounded-full bg-current/15 px-1.5 text-[11px] leading-5 font-semibold tabular-nums">{fmtScore(r.result.total)}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
            {entries.map((e) => {
              const r = scored.results.find((x) => x.id === e.id)!;
              return (
                <TabsContent key={e.id} value={e.id} className="grid gap-4">
                  <div className="grid gap-5 rounded-2xl border p-5 md:grid-cols-[1fr_300px]">
                    <div className="grid content-start gap-4 sm:grid-cols-2">
                      <NumberBox
                        id={`landed-${e.id}`}
                        label="Total landed cost per unit (₱)"
                        value={e.landedCost}
                        readOnly={!canPurchasing}
                        onChange={(v) => update(e.id, { landedCost: v })}
                      />
                      <div className="grid gap-1">
                        <Label htmlFor={`quote-${e.id}`} className="text-xs font-normal">
                          Quotation reference
                        </Label>
                        <Input
                          id={`quote-${e.id}`}
                          disabled={!canPurchasing}
                          value={e.quotationRef ?? ""}
                          onChange={(ev) => update(e.id, { quotationRef: ev.target.value || null })}
                        />
                      </div>
                      <label
                        className={cn(
                          "flex items-start gap-3 rounded-2xl border p-3 text-sm sm:col-span-2",
                          e.criticalSpecFailed && "border-red-300 bg-red-50/60 dark:border-red-500/40 dark:bg-red-500/10",
                        )}
                      >
                        <input
                          type="checkbox"
                          className="accent-destructive mt-0.5 size-4"
                          disabled={!canQa}
                          checked={e.criticalSpecFailed}
                          onChange={(ev) => update(e.id, { criticalSpecFailed: ev.target.checked })}
                        />
                        <span>
                          <span className="flex flex-wrap items-center gap-2 font-medium">
                            Failed a critical specification
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                                canQa ? "bg-secondary text-primary" : "bg-muted text-muted-foreground",
                              )}
                            >
                              {!canQa && <LockIcon className="size-3" />} Filled by Purchasing Officer
                            </span>
                          </span>
                          <span className="text-muted-foreground block text-xs">Set by the Purchasing Officer. The supplier cannot be selected and is left out of the price benchmark.</span>
                        </span>
                      </label>
                    </div>
                    <div className="bg-muted/50 rounded-2xl p-4">
                      <ScoreSummary result={r.result} blockReasons={r.blockReasons} />
                    </div>
                  </div>

                  <div className="rounded-2xl border px-5">
                    {criteria.map((c) => {
                      const value = e.inputs.find((i) => i.key === c.key) ?? { key: c.key };
                      const result = r.result.criteria.find((x) => x.key === c.key);
                      const isPrice = priceKeys.includes(c.key);
                      const owner = criterionOwner(c);
                      const locked = !canFill(role, owner);
                      return (
                        <CriterionInputRow
                          key={c.key}
                          criterion={c}
                          value={value}
                          result={result}
                          readOnly={readOnly || locked}
                          owner={readOnly ? undefined : { label: FIELD_OWNER_LABELS[owner], locked }}
                          onChange={(next) => setInput(e.id, next)}
                          hideNumbers={
                            isPrice ? (
                              <p className="text-muted-foreground text-sm">
                                From landed cost: {fmtMoney(e.landedCost)} vs lowest qualified {fmtMoney(scored.lowestLandedCost)}.
                              </p>
                            ) : undefined
                          }
                        />
                      );
                    })}
                  </div>

                  <div className="grid gap-1">
                    <Label htmlFor={`notes-${e.id}`}>Notes</Label>
                    <Textarea id={`notes-${e.id}`} rows={2} disabled={readOnly} value={e.notes ?? ""} onChange={(ev) => update(e.id, { notes: ev.target.value || null })} />
                  </div>

                  {canPurchasing && (
                    <div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            const res = await remove(e.id);
                            if (res.error) toast.error(res.error);
                            else {
                              setEntries((prev) => prev.filter((x) => x.id !== e.id));
                              router.refresh();
                            }
                          })
                        }
                      >
                        <TrashIcon /> Remove {e.supplierName} from this canvass
                      </Button>
                    </div>
                  )}
                </TabsContent>
              );
            })}
          </Tabs>
        </CardContent>
      </Card>

      {/* ─── Recommendation ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Recommendation</CardTitle>
          <CardDescription>
            {scored.best
              ? `Highest qualified score: ${byId.get(scored.best.id)?.supplierName} (${fmtScore(scored.best.result.total)}). If you recommend another supplier, explain why.`
              : "Complete every rating to see the highest qualified supplier."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div role="radiogroup" aria-label="Recommended supplier" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {ranked.map((r) => {
              const e = byId.get(r.id)!;
              const checked = recommended === e.supplierId;
              const disabled = !canPurchasing || r.blocked;
              return (
                <label
                  key={e.id}
                  className={cn(
                    "relative flex items-center gap-3 rounded-2xl border p-4 text-sm transition-colors",
                    checked ? "border-primary bg-secondary ring-primary/20 ring-2" : "hover:bg-muted/50",
                    disabled ? "cursor-not-allowed" : "cursor-pointer",
                    r.blocked && "opacity-60",
                  )}
                >
                  <input
                    type="radio"
                    name="recommended"
                    className="sr-only"
                    disabled={disabled}
                    checked={checked}
                    onChange={() => {
                      setRecommended(e.supplierId);
                      setDirty(true);
                    }}
                  />
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full border-2",
                      checked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
                    )}
                  >
                    {checked && <CheckIcon className="size-3" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{e.supplierName}</span>
                    <span className="text-muted-foreground text-xs">
                      Rank #{rankOf(r.id)} · {fmtMoney(e.landedCost)}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block font-semibold tabular-nums">{fmtScore(r.result.total)}</span>
                    {r.blocked ? <Pill tone="red">Blocked</Pill> : r.id === bestId ? <Pill tone="amber">Top</Pill> : null}
                  </span>
                </label>
              );
            })}
          </div>
          {recommendedEntry && bestId && recommendedEntry.id !== bestId && (
            <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
              {recommendedEntry.supplierName} is not the top scorer, so a justification is required.
            </p>
          )}
          <div className="grid gap-1">
            <Label htmlFor="recommendation">Justification</Label>
            <Textarea
              id="recommendation"
              rows={3}
              disabled={!canPurchasing}
              placeholder="Why this supplier? E.g. better lead time, capacity, or risk spread."
              value={reason}
              onChange={(ev) => {
                setReason(ev.target.value);
                setDirty(true);
              }}
            />
          </div>
          {!readOnly && (
            <div className="flex flex-wrap items-center gap-2 border-t pt-5">
              <Button type="button" variant="outline" disabled={pending} onClick={() => run(save)}>
                {pending ? <Loader2Icon className="animate-spin" /> : <SaveIcon />} Save draft
              </Button>
              {canPurchasing ? (
                <Button type="button" disabled={pending} onClick={() => run(submit)}>
                  <SendIcon /> Submit for approval
                </Button>
              ) : (
                <span className="text-muted-foreground text-xs">Purchasing chooses the supplier and submits the canvass.</span>
              )}
              {dirty && (
                <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                  <span className="bg-highlight size-1.5 rounded-full" aria-hidden /> Unsaved changes
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
