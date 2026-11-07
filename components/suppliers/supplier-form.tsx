import { ActionForm } from "@/components/form/action-form";
import { CheckboxField, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/form/fields";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { ActionState } from "@/lib/action-state";
import {
  MOLD_OWNERSHIP,
  MOLD_OWNERSHIP_LABELS,
  SUPPLIER_TIERS,
  SUPPLIER_TIER_LABELS,
  TIER_FREQUENCY,
} from "@/lib/constants";
import type { materialCategories, suppliers } from "@/lib/db/schema";

type Supplier = typeof suppliers.$inferSelect;
type Category = typeof materialCategories.$inferSelect;

export function SupplierForm({
  action,
  supplier,
  categories,
  selected = [],
  submitLabel,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  supplier?: Supplier;
  categories: Category[];
  selected?: { categoryId: string; materials: string | null }[];
  submitLabel: string;
}) {
  const sel = new Map(selected.map((s) => [s.categoryId, s.materials]));
  return (
    <ActionForm action={action} successMessage="Saved." className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Company</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <TextField label="Registered company name" name="name" required defaultValue={supplier?.name} />
          <TextField label="Trade name" name="tradeName" defaultValue={supplier?.tradeName ?? ""} />
          <TextField label="TIN" name="tin" defaultValue={supplier?.tin ?? ""} />
          <TextField
            label="Year established"
            name="yearEstablished"
            type="number"
            inputMode="numeric"
            defaultValue={supplier?.yearEstablished ?? ""}
            hint="Used for the Company Credibility rating."
          />
          <TextAreaField label="Address" name="address" className="md:col-span-2" rows={2} defaultValue={supplier?.address ?? ""} />
          <TextField label="Website" name="website" defaultValue={supplier?.website ?? ""} />
          <TextField label="ERP vendor code" name="erpVendorCode" defaultValue={supplier?.erpVendorCode ?? ""} hint="Fill in once the vendor is created in the ERP." />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <TextField label="Contact person" name="contactPerson" defaultValue={supplier?.contactPerson ?? ""} />
          <TextField label="Email" name="email" type="email" defaultValue={supplier?.email ?? ""} />
          <TextField label="Phone" name="phone" defaultValue={supplier?.phone ?? ""} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Classification and risk</CardTitle>
          <CardDescription>Critical and high-spend suppliers are evaluated every quarter; standard suppliers yearly or when there is an issue.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <SelectField
            label="Tier"
            name="tier"
            defaultValue={supplier?.tier ?? "standard"}
            options={SUPPLIER_TIERS.map((t) => ({ value: t, label: `${SUPPLIER_TIER_LABELS[t]} — ${TIER_FREQUENCY[t]}` }))}
          />
          <TextField
            label="Credit terms (days)"
            name="creditTermsDays"
            type="number"
            inputMode="numeric"
            min={0}
            defaultValue={supplier?.creditTermsDays ?? ""}
          />
          <SelectField
            label="Mold ownership"
            name="moldOwnership"
            defaultValue={supplier?.moldOwnership ?? "not_applicable"}
            options={MOLD_OWNERSHIP.map((m) => ({ value: m, label: MOLD_OWNERSHIP_LABELS[m] }))}
          />
          <div className="md:col-span-3">
            <CheckboxField
              name="isSingleSource"
              label="Single source"
              hint="No approved alternative supplier exists, for example because the supplier holds our dedicated molds."
              defaultChecked={supplier?.isSingleSource}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Materials supplied</CardTitle>
          <CardDescription>Tick each category and describe the specific materials.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {categories.length === 0 && <p className="text-muted-foreground text-sm">No categories yet. An administrator can add them in Settings.</p>}
          {categories.map((c) => (
            <div key={c.id} className="grid items-center gap-2 md:grid-cols-[220px_1fr]">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" name="categoryIds" value={c.id} defaultChecked={sel.has(c.id)} className="accent-primary size-4" />
                {c.name}
                {c.isCritical && <span className="text-muted-foreground text-xs">(critical)</span>}
              </label>
              <Input name={`materials:${c.id}`} placeholder="e.g. 1L HDPE bottle, 38mm cap" defaultValue={sel.get(c.id) ?? ""} aria-label={`Materials for ${c.name}`} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <TextAreaField label="Internal notes" name="notes" rows={3} defaultValue={supplier?.notes ?? ""} />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <SubmitButton pendingText="Saving…">{submitLabel}</SubmitButton>
      </div>
    </ActionForm>
  );
}
