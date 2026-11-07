import { eq } from "drizzle-orm";
import { BrandLockup } from "@/components/brand";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionForm } from "@/components/form/action-form";
import { SubmitButton, TextAreaField, TextField } from "@/components/form/fields";
import { FieldErrorText } from "@/components/form/field-errors";
import { db } from "@/lib/db";
import { communicationLogs, profiles, suppliers } from "@/lib/db/schema";
import { REQUEST_TYPE_LABELS } from "@/lib/constants";
import { RESPONSE_FORM } from "@/lib/request-response";
import { fmtDateTime } from "@/lib/format";
import { submitResponse } from "./actions";

export const metadata = { title: "Reply to a request", robots: { index: false } };

export default async function RespondPage({ params }: PageProps<"/respond/[token]">) {
  const { token } = await params;
  const r = await db.query.communicationLogs.findFirst({ where: eq(communicationLogs.token, token) });

  const invalid =
    !r || r.channel !== "link"
      ? "This link does not exist. Please check the link in your email."
      : r.respondedAt
        ? "This request has already been answered. Thank you."
        : r.status === "closed"
          ? "This request was withdrawn by Oracle Petroleum. No reply is needed."
          : r.expiresAt && r.expiresAt < new Date()
            ? "This link has expired. Please contact our Purchasing team."
            : null;

  if (invalid || !r) {
    return (
      <Shell>
        <Card>
          <CardHeader>
            <CardTitle>Link not available</CardTitle>
            <CardDescription>{invalid}</CardDescription>
          </CardHeader>
        </Card>
      </Shell>
    );
  }

  const [supplier, sender] = await Promise.all([
    db.query.suppliers.findFirst({ where: eq(suppliers.id, r.supplierId), columns: { name: true, contactPerson: true } }),
    r.loggedBy ? db.query.profiles.findFirst({ where: eq(profiles.id, r.loggedBy), columns: { fullName: true } }) : null,
  ]);
  const form = RESPONSE_FORM[r.requestType];

  return (
    <Shell>
      <Card>
        <CardHeader>
          <p className="text-primary text-xs font-semibold tracking-wider uppercase">{REQUEST_TYPE_LABELS[r.requestType]}</p>
          <CardTitle className="text-xl">{r.subject}</CardTitle>
          <CardDescription>
            For {supplier?.name ?? "your company"} · from {sender?.fullName ?? "Oracle Petroleum Purchasing"} · sent {fmtDateTime(r.requestedAt)}
          </CardDescription>
        </CardHeader>
        {r.message && (
          <CardContent>
            <div className="bg-muted/60 border-primary rounded-2xl border-l-4 px-4 py-3 text-sm whitespace-pre-wrap">{r.message}</div>
          </CardContent>
        )}
      </Card>

      <ActionForm action={submitResponse.bind(null, token)} className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Your reply</CardTitle>
            <CardDescription>Your reply is sent to our Purchasing team as soon as you submit. Fields marked * are required.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <TextField label="Your name" name="respondent" required defaultValue={supplier?.contactPerson ?? ""} className="md:col-span-2" />

            {form === "quotation" && (
              <>
                <TextField label="Unit price (₱)" name="unitPrice" type="number" step="0.0001" min={0} required />
                <TextField label="Lead time (days)" name="leadTimeDays" type="number" min={0} step={1} required />
                <TextField label="Quotation valid until" name="validUntil" type="date" />
                <FileField label="Quotation file (optional)" />
                <TextAreaField label="Remarks" name="remarks" rows={3} className="md:col-span-2" placeholder="Terms, minimum order quantity, freight…" />
              </>
            )}

            {form === "delivery" && (
              <>
                <TextField label="Confirmed delivery date" name="confirmedDate" type="date" required />
                <TextField label="Quantity" name="quantity" placeholder="e.g. 12,000 pcs" />
                <TextAreaField label="Remarks" name="remarks" rows={3} className="md:col-span-2" />
              </>
            )}

            {form === "po" && (
              <>
                <fieldset className="grid gap-2 md:col-span-2">
                  <legend className="mb-1 text-sm font-medium">
                    Do you accept the purchase order?<span className="text-destructive">*</span>
                  </legend>
                  <label className="flex items-center gap-3 rounded-2xl border p-3 text-sm">
                    <input type="radio" name="decision" value="accept" className="accent-primary size-4" /> Yes — accepted as issued
                  </label>
                  <label className="flex items-center gap-3 rounded-2xl border p-3 text-sm">
                    <input type="radio" name="decision" value="changes" className="accent-primary size-4" /> We need changes (describe below)
                  </label>
                  <FieldErrorText name="decision" />
                </fieldset>
                <TextAreaField label="Remarks / changes needed" name="remarks" rows={3} className="md:col-span-2" />
              </>
            )}

            {form === "general" && (
              <>
                <TextAreaField label="Your answer" name="answer" rows={5} required className="md:col-span-2" />
                <FileField label="Attachment (optional)" />
              </>
            )}

            <div className="md:col-span-2">
              <SubmitButton pendingText="Sending…" size="lg">
                Send reply
              </SubmitButton>
            </div>
          </CardContent>
        </Card>
      </ActionForm>
    </Shell>
  );
}

function FileField({ label }: { label: string }) {
  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor="file">{label}</Label>
      <Input id="file" name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" />
      <p className="text-muted-foreground text-xs">PDF, JPG, PNG or WEBP, up to 10 MB.</p>
      <FieldErrorText name="file" />
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="bg-muted/40 min-h-svh">
      <header className="bg-forest text-forest-foreground">
        <div className="mx-auto max-w-3xl px-4 py-5">
          <BrandLockup subtitle="Supplier request" />
        </div>
        <div className="bg-highlight h-1" aria-hidden />
      </header>
      <div className="mx-auto grid max-w-3xl gap-6 px-4 py-10">{children}</div>
    </main>
  );
}
