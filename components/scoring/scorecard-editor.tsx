"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { InfoIcon, Loader2Icon, SaveIcon, SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CriterionInputRow } from "./criterion-input";
import { ScoreSummary } from "./score-summary";
import { scoreSupplier } from "@/lib/scoring/engine";
import type { Band, CriterionConfig } from "@/lib/scoring/types";
import type { ScoreInput } from "@/lib/db/schema";
import type { ActionState } from "@/lib/action-state";
import type { Role } from "@/lib/constants";
import { FIELD_OWNER_LABELS, canFill, criterionOwner, type FieldOwner } from "@/lib/scoring/ownership";

export type Suggestions = Record<string, { label: string; apply: Partial<ScoreInput> } | null>;

/** Quarterly scorecard with live scoring. The server re-scores on save, submit and approval. */
export function ScorecardEditor({
  criteria,
  bands,
  inputs: initial,
  comments: initialComments,
  readOnly,
  role,
  suggestions = {},
  save,
  submit,
}: {
  criteria: CriterionConfig[];
  bands: Band[];
  inputs: ScoreInput[];
  comments: string | null;
  readOnly: boolean;
  role: Role;
  suggestions?: Suggestions;
  save: (json: string) => Promise<ActionState>;
  submit: (json: string) => Promise<ActionState>;
}) {
  const router = useRouter();
  const [inputs, setInputs] = useState(initial);
  const [comments, setComments] = useState(initialComments ?? "");
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const result = useMemo(() => scoreSupplier(criteria, inputs, bands), [criteria, inputs, bands]);
  // Each role fills only its own criteria; the server enforces the same rule.
  const owners = criteria.map((c) => criterionOwner(c, "quarterly"));
  const mine = criteria.filter((_, i) => canFill(role, owners[i])).map((c) => c.name);
  const canSubmit = !readOnly && canFill(role, "purchasing");
  const others = [...new Set(owners)].filter((o) => !canFill(role, o)) as FieldOwner[];

  const setInput = (next: ScoreInput) => {
    setDirty(true);
    setInputs((prev) => [...prev.filter((i) => i.key !== next.key), next]);
  };

  const run = (fn: (json: string) => Promise<ActionState>) =>
    start(async () => {
      const res = await fn(JSON.stringify({ inputs, comments: comments.trim() || null }));
      if (res.error) toast.error(res.error);
      else {
        toast.success(res.message ?? "Saved.");
        setDirty(false);
        router.refresh();
      }
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader>
          <CardTitle>Scorecard</CardTitle>
          <CardDescription>Enter this quarter&apos;s actual results. Ratings come from the thresholds; click ⓘ for each criterion&apos;s rating guide.</CardDescription>
        </CardHeader>
        <CardContent>
          {!readOnly && (
            <div className="bg-secondary/60 mb-2 flex items-start gap-3 rounded-2xl px-4 py-3 text-sm">
              <InfoIcon className="text-primary mt-0.5 size-4 shrink-0" />
              <p>
                {others.length === 0
                  ? "As Admin you can fill in every criterion."
                  : mine.length === 0
                    ? "You have no criteria to fill in on this scorecard."
                    : `You fill in: ${mine.join(", ")}.`}
                {others.length > 0 && ` The rest is filled by ${others.map((o) => FIELD_OWNER_LABELS[o]).join(" and ")}.`}
                {!canSubmit && " Purchasing submits the evaluation once everything is rated."}
              </p>
            </div>
          )}
          {criteria.map((c, i) => {
            const locked = !canFill(role, owners[i]);
            return (
              <CriterionInputRow
                key={c.key}
                criterion={c}
                value={inputs.find((x) => x.key === c.key) ?? { key: c.key }}
                result={result.criteria.find((x) => x.key === c.key)}
                readOnly={readOnly || locked}
                owner={readOnly ? undefined : { label: FIELD_OWNER_LABELS[owners[i]], locked }}
                onChange={setInput}
                suggestion={locked ? null : (suggestions[c.key] ?? null)}
              />
            );
          })}
          <div className="mt-4 grid gap-1">
            <Label htmlFor="comments">Evaluator comments</Label>
            <Textarea
              id="comments"
              rows={3}
              disabled={readOnly}
              value={comments}
              onChange={(e) => {
                setComments(e.target.value);
                setDirty(true);
              }}
            />
          </div>
        </CardContent>
      </Card>
      <div className="grid content-start gap-4 lg:sticky lg:top-16">
        <Card>
          <CardContent>
            <ScoreSummary result={result} />
          </CardContent>
        </Card>
        {!readOnly && (
          <div className="grid gap-2">
            <Button type="button" variant="outline" disabled={pending} onClick={() => run(save)}>
              {pending ? <Loader2Icon className="animate-spin" /> : <SaveIcon />} Save draft
            </Button>
            {canSubmit ? (
              <Button type="button" disabled={pending || !result.complete} onClick={() => run(submit)}>
                <SendIcon /> Submit for approval
              </Button>
            ) : (
              <p className="text-muted-foreground text-center text-xs">Purchasing submits the evaluation once everything is rated.</p>
            )}
            {dirty && <p className="text-muted-foreground text-center text-xs">Unsaved changes</p>}
          </div>
        )}
      </div>
    </div>
  );
}
