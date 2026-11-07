"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { PlusIcon, TrashIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/form/fields";
import { validateTemplate } from "@/lib/scoring/engine";
import type { Band, CriterionConfig, InputMode } from "@/lib/scoring/types";
import type { ActionState } from "@/lib/action-state";
import { TEMPLATE_KIND_LABELS, type TemplateKind } from "@/lib/constants";

const MODES: { value: InputMode; label: string }[] = [
  { value: "percent_ratio", label: "Percentage: A ÷ B × 100" },
  { value: "price_diff", label: "Price difference: (A − B) ÷ B × 100" },
  { value: "average", label: "Average: A ÷ B" },
  { value: "value", label: "Single number" },
  { value: "manual", label: "Manual rating (guideline)" },
];

const blankCriterion = (n: number): CriterionConfig => ({
  key: `criterion_${n}`,
  name: "New criterion",
  weight: 0,
  guideline: "",
  metricLabel: "",
  inputMode: "percent_ratio",
  direction: "higher_better",
  unit: "%",
  numeratorLabel: "",
  denominatorLabel: "",
  allowNa: false,
  thresholds: [5, 4, 3, 2, 1].map((r) => ({ rating: r as 1 | 2 | 3 | 4 | 5, min: null, max: null, label: "", description: "" })),
});

const toNum = (v: string) => (v.trim() === "" ? null : Number(v));

export function TemplateEditor({
  kind,
  categoryId,
  categoryName,
  initialName,
  initialCriteria,
  initialBands,
  save,
}: {
  kind: TemplateKind;
  categoryId: string | null;
  categoryName: string | null;
  initialName: string;
  initialCriteria: CriterionConfig[];
  initialBands: Band[];
  save: (json: string) => Promise<ActionState>;
}) {
  const [name, setName] = useState(initialName);
  const [criteria, setCriteria] = useState(initialCriteria);
  const [bands, setBands] = useState(initialBands);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const problems = useMemo(() => validateTemplate(criteria, bands), [criteria, bands]);
  const totalWeight = criteria.reduce((s, c) => s + (Number(c.weight) || 0), 0);

  const setC = (i: number, patch: Partial<CriterionConfig>) => setCriteria((prev) => prev.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const setT = (i: number, rating: number, patch: Record<string, unknown>) =>
    setC(i, { thresholds: criteria[i].thresholds.map((t) => (t.rating === rating ? { ...t, ...patch } : t)) });
  const setB = (i: number, patch: Partial<Band>) => setBands((prev) => prev.map((b, j) => (j === i ? { ...b, ...patch } : b)));

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{TEMPLATE_KIND_LABELS[kind]}</CardTitle>
          <CardDescription>
            Applies to: {categoryName ?? "all categories without their own template"}. Saving creates a new version; evaluations already started keep the version they were created with.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 md:max-w-md">
          <Label htmlFor="tpl-name">Template name</Label>
          <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} />
        </CardContent>
      </Card>

      {criteria.map((c, i) => (
        <Card key={i}>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div className="grid flex-1 gap-3 md:grid-cols-[1fr_120px]">
              <div className="grid gap-1">
                <Label>Criterion</Label>
                <Input value={c.name} onChange={(e) => setC(i, { name: e.target.value })} />
              </div>
              <div className="grid gap-1">
                <Label>Weight (%)</Label>
                <Input type="number" min={0} max={100} step="any" value={c.weight} onChange={(e) => setC(i, { weight: Number(e.target.value) })} />
              </div>
            </div>
            <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${c.name}`} onClick={() => setCriteria((prev) => prev.filter((_, j) => j !== i))}>
              <TrashIcon />
            </Button>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="grid gap-1">
                <Label>Key</Label>
                <Input value={c.key} onChange={(e) => setC(i, { key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} />
              </div>
              <div className="grid gap-1">
                <Label>How it is measured</Label>
                <NativeSelect value={c.inputMode} onChange={(e) => setC(i, { inputMode: e.target.value as InputMode })}>
                  {MODES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              {c.inputMode !== "manual" && (
                <div className="grid gap-1">
                  <Label>Better when</Label>
                  <NativeSelect value={c.direction} onChange={(e) => setC(i, { direction: e.target.value as CriterionConfig["direction"] })}>
                    <option value="higher_better">Higher is better</option>
                    <option value="lower_better">Lower is better</option>
                  </NativeSelect>
                </div>
              )}
              <div className="grid gap-1">
                <Label>Metric label</Label>
                <Input value={c.metricLabel} onChange={(e) => setC(i, { metricLabel: e.target.value })} />
              </div>
              {c.inputMode !== "manual" && (
                <>
                  <div className="grid gap-1">
                    <Label>Unit</Label>
                    <Input value={c.unit} onChange={(e) => setC(i, { unit: e.target.value })} />
                  </div>
                  <div className="grid gap-1">
                    <Label>Input A label</Label>
                    <Input value={c.numeratorLabel ?? ""} onChange={(e) => setC(i, { numeratorLabel: e.target.value })} />
                  </div>
                  {c.inputMode !== "value" && (
                    <div className="grid gap-1">
                      <Label>Input B label</Label>
                      <Input value={c.denominatorLabel ?? ""} onChange={(e) => setC(i, { denominatorLabel: e.target.value })} />
                    </div>
                  )}
                </>
              )}
              <div className="grid gap-1 md:col-span-3">
                <Label>Evaluation guideline</Label>
                <Textarea rows={2} value={c.guideline} onChange={(e) => setC(i, { guideline: e.target.value })} />
              </div>
              <div className="grid gap-1 md:col-span-2">
                <Label>Basis of evaluation (data source)</Label>
                <Input value={c.basis ?? ""} onChange={(e) => setC(i, { basis: e.target.value })} />
              </div>
              <label className="flex items-center gap-2 self-end text-sm">
                <input type="checkbox" className="accent-primary" checked={c.allowNa} onChange={(e) => setC(i, { allowNa: e.target.checked })} />
                Allow “not applicable”
              </label>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-muted-foreground text-left text-xs">
                  <tr>
                    <th className="w-16 pb-1">Rating</th>
                    {c.inputMode !== "manual" && <th className="w-40 pb-1">{c.direction === "higher_better" ? "Minimum (≥)" : "Maximum (≤)"}</th>}
                    <th className="pb-1">Label</th>
                    <th className="pb-1">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {[...c.thresholds]
                    .sort((a, b) => b.rating - a.rating)
                    .map((t) => {
                      const boundKey = c.direction === "higher_better" ? "min" : "max";
                      return (
                        <tr key={t.rating}>
                          <td className="py-1 font-medium tabular-nums">{t.rating}</td>
                          {c.inputMode !== "manual" && (
                            <td className="py-1 pr-2">
                              {t.rating === 1 ? (
                                <span className="text-muted-foreground text-xs">everything else</span>
                              ) : (
                                <Input type="number" step="any" value={t[boundKey] ?? ""} onChange={(e) => setT(i, t.rating, { [boundKey]: toNum(e.target.value) })} aria-label={`Rating ${t.rating} bound`} />
                              )}
                            </td>
                          )}
                          <td className="py-1 pr-2">
                            <Input value={t.label} onChange={(e) => setT(i, t.rating, { label: e.target.value })} aria-label={`Rating ${t.rating} label`} />
                          </td>
                          <td className="py-1">
                            <Input value={t.description ?? ""} onChange={(e) => setT(i, t.rating, { description: e.target.value })} aria-label={`Rating ${t.rating} description`} />
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}

      <div>
        <Button type="button" variant="outline" onClick={() => setCriteria((prev) => [...prev, blankCriterion(prev.length + 1)])}>
          <PlusIcon /> Add criterion
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Classification bands</CardTitle>
          <CardDescription>The total score sets the supplier&apos;s classification. One band must start at 0%.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {bands.map((b, i) => (
            <div key={i} className="grid gap-2 md:grid-cols-[110px_180px_1fr_1fr]">
              <Input type="number" min={0} max={100} value={b.min} onChange={(e) => setB(i, { min: Number(e.target.value) })} aria-label="Minimum score" />
              <NativeSelect value={b.classification} onChange={(e) => setB(i, { classification: e.target.value as Band["classification"] })} aria-label="Classification">
                <option value="preferred">Preferred</option>
                <option value="approved">Approved</option>
                <option value="conditional">Conditional</option>
                <option value="not_qualified">Not qualified</option>
              </NativeSelect>
              <Input value={b.label} onChange={(e) => setB(i, { label: e.target.value })} aria-label="Label" />
              <Input value={b.action} onChange={(e) => setB(i, { action: e.target.value })} aria-label="Recommended action" />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-3">
          <p className={totalWeight === 100 ? "text-sm" : "text-destructive text-sm font-medium"}>Total weight: {totalWeight}%</p>
          {problems.length > 0 && (
            <ul className="text-destructive list-disc pl-5 text-sm">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          <div className="grid gap-1">
            <Label htmlFor="change-note">What changed and why</Label>
            <Textarea id="change-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Approved by management on Nov 10: Quality weight raised to 30%." />
          </div>
          <Button
            type="button"
            className="w-fit"
            disabled={pending || problems.length > 0 || note.trim().length < 3}
            onClick={() =>
              start(async () => {
                const res = await save(JSON.stringify({ kind, categoryId, name, criteria, bands, changeNote: note }));
                if (res?.error) toast.error(res.error);
              })
            }
          >
            Save as new version
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
