"use client";

import { InfoIcon, LockIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NativeSelect } from "@/components/form/fields";
import { RatingDot } from "@/components/status-badge";
import type { CriterionConfig, CriterionResult } from "@/lib/scoring/types";
import type { ScoreInput } from "@/lib/db/schema";
import { fmtNumber } from "@/lib/format";

const num = (v: string) => (v.trim() === "" ? null : Number(v));

export function ThresholdHelp({ criterion }: { criterion: CriterionConfig }) {
  return (
    <Popover>
      <PopoverTrigger className="text-muted-foreground hover:text-foreground inline-flex" aria-label={`How ${criterion.name} is rated`}>
        <InfoIcon className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent className="w-80 text-sm" align="start">
        <p className="font-medium">{criterion.name}</p>
        <p className="text-muted-foreground mt-1 text-xs">{criterion.guideline}</p>
        <table className="mt-3 w-full text-xs">
          <tbody>
            {[...criterion.thresholds]
              .sort((a, b) => b.rating - a.rating)
              .map((t) => (
                <tr key={t.rating} className="border-t">
                  <td className="py-1 pr-2 font-medium tabular-nums">{t.rating}</td>
                  <td className="py-1 pr-2">{t.label}</td>
                  <td className="text-muted-foreground py-1">{criterion.inputMode === "manual" ? t.description : t.description}</td>
                </tr>
              ))}
          </tbody>
        </table>
        {criterion.basis && <p className="text-muted-foreground mt-2 text-xs">Basis: {criterion.basis}</p>}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Inputs for one criterion: the raw numbers (or a manual rating), an optional override with a reason, and N/A.
 * `lockedDenominator` is used by the canvass, where the price benchmark is computed automatically.
 */
export function CriterionInputRow({
  criterion,
  value,
  result,
  onChange,
  readOnly,
  hideNumbers,
  suggestion,
  owner,
}: {
  criterion: CriterionConfig;
  value: ScoreInput;
  result?: CriterionResult;
  onChange: (next: ScoreInput) => void;
  readOnly?: boolean;
  /** Hide the numerator/denominator inputs (e.g. price in a canvass, which comes from landed cost). */
  hideNumbers?: React.ReactNode;
  suggestion?: { label: string; apply: Partial<ScoreInput> } | null;
  /** Who fills this criterion; shown as a tag, with a lock when the current user cannot edit it. */
  owner?: { label: string; locked: boolean };
}) {
  const set = (patch: Partial<ScoreInput>) => onChange({ ...value, ...patch });
  const manual = criterion.inputMode === "manual";
  const isNa = Boolean(value.isNa);
  const idBase = `c-${criterion.key}`;

  return (
    <div className="grid gap-3 border-b py-4 last:border-b-0 md:grid-cols-[minmax(180px,1fr)_minmax(260px,2fr)_120px]">
      <div>
        <div className="flex items-center gap-1.5">
          <span className="font-medium">{criterion.name}</span>
          <ThresholdHelp criterion={criterion} />
        </div>
        {owner && (
          <span
            className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${owner.locked ? "bg-muted text-muted-foreground" : "bg-secondary text-primary"}`}
          >
            {owner.locked && <LockIcon className="size-3" />}
            Filled by {owner.label}
          </span>
        )}
        <p className="text-muted-foreground text-xs">
          {criterion.weight}% · {criterion.metricLabel}
        </p>
      </div>

      <div className="grid gap-2">
        {isNa ? (
          <p className="text-muted-foreground text-sm">Not applicable this period — weight shared among the other criteria.</p>
        ) : manual ? (
          <div className="grid gap-1">
            <Label htmlFor={`${idBase}-rating`} className="text-xs">
              Rating
            </Label>
            <NativeSelect
              id={`${idBase}-rating`}
              disabled={readOnly}
              value={value.manualRating ?? ""}
              onChange={(e) => set({ manualRating: num(e.target.value) })}
            >
              <option value="">Choose a rating…</option>
              {[...criterion.thresholds]
                .sort((a, b) => b.rating - a.rating)
                .map((t) => (
                  <option key={t.rating} value={t.rating}>
                    {t.rating} — {t.label}: {t.description}
                  </option>
                ))}
            </NativeSelect>
          </div>
        ) : hideNumbers ? (
          hideNumbers
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <NumberBox
              id={`${idBase}-a`}
              label={criterion.numeratorLabel ?? "Value"}
              value={value.numerator}
              readOnly={readOnly}
              onChange={(v) => set({ numerator: v })}
            />
            {criterion.inputMode !== "value" && (
              <NumberBox
                id={`${idBase}-b`}
                label={criterion.denominatorLabel ?? "Total"}
                value={value.denominator}
                readOnly={readOnly}
                onChange={(v) => set({ denominator: v })}
              />
            )}
          </div>
        )}

        {!isNa && !manual && result?.rawValue != null && (
          <p className="text-muted-foreground text-xs">
            Measured: <span className="text-foreground font-medium">{fmtNumber(result.rawValue)} {criterion.unit}</span> → rating {result.calculatedRating}
          </p>
        )}

        {suggestion && !readOnly && !isNa && (
          <button type="button" className="text-primary w-fit text-xs hover:underline" onClick={() => set(suggestion.apply)}>
            Use logged data: {suggestion.label}
          </button>
        )}

        {!manual && !isNa && (
          <details className="text-xs" open={Boolean(value.manualRating)}>
            <summary className="text-muted-foreground cursor-pointer select-none">Override the calculated rating</summary>
            <div className="mt-2 grid gap-2 sm:grid-cols-[140px_1fr]">
              <NativeSelect
                aria-label="Override rating"
                disabled={readOnly}
                value={value.manualRating ?? ""}
                onChange={(e) => set({ manualRating: num(e.target.value) })}
              >
                <option value="">No override</option>
                {[5, 4, 3, 2, 1].map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </NativeSelect>
              <Input
                aria-label="Reason for override"
                placeholder="Reason (required for an override)"
                disabled={readOnly || !value.manualRating}
                value={value.overrideReason ?? ""}
                onChange={(e) => set({ overrideReason: e.target.value })}
              />
            </div>
          </details>
        )}

        {criterion.allowNa && (
          <label className="flex w-fit items-center gap-2 text-xs">
            <input type="checkbox" className="accent-primary" disabled={readOnly} checked={isNa} onChange={(e) => set({ isNa: e.target.checked })} />
            Not applicable this period
          </label>
        )}
      </div>

      <div className="flex items-start justify-between gap-2 md:flex-col md:items-end">
        <RatingDot rating={result?.rating} />
        <span className="text-muted-foreground text-xs tabular-nums">
          {result && !result.isNa ? `${fmtNumber(result.points)} / ${fmtNumber(result.effectiveWeight)} pts` : "—"}
        </span>
      </div>
    </div>
  );
}

export function NumberBox({
  id,
  label,
  value,
  onChange,
  readOnly,
}: {
  id: string;
  label: string;
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={id} className="text-xs font-normal">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        step="any"
        min={0}
        disabled={readOnly}
        value={value ?? ""}
        onChange={(e) => onChange(num(e.target.value))}
      />
    </div>
  );
}
