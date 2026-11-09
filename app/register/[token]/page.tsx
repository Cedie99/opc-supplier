import { and, asc, eq, inArray } from "drizzle-orm";
import { BrandLockup } from "@/components/brand";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionForm } from "@/components/form/action-form";
import { CheckboxField, SubmitButton, TextAreaField, TextField } from "@/components/form/fields";
import { FieldErrorText } from "@/components/form/field-errors";
import { db } from "@/lib/db";
import { documentTypes, supplierDocuments, supplierInvites, suppliers } from "@/lib/db/schema";
import { fmtDate } from "@/lib/format";
import { requestInviteUpload, submitRegistration, submitResubmission } from "./actions";

export const metadata = { title: "Supplier registration", robots: { index: false } };

export default async function RegisterPage({ params }: PageProps<"/register/[token]">) {
  const { token } = await params;
  const invite = await db.query.supplierInvites.findFirst({ where: eq(supplierInvites.token, token) });
  const valid = invite && !invite.submittedAt && invite.expiresAt > new Date() && invite.supplierId;

  if (!valid) {
    return (
      <Shell>
        <Card>
          <CardHeader>
            <CardTitle>Link not valid</CardTitle>
            <CardDescription>
              {invite?.submittedAt
                ? "This link has already been used. Thank you for your submission."
                : "This link has expired or does not exist. Please ask our Purchasing team for a new link."}
            </CardDescription>
          </CardHeader>
        </Card>
      </Shell>
    );
  }

  if (invite.purpose === "resubmission") return <Resubmission token={token} invite={invite} />;

  const [supplier, types] = await Promise.all([
    db.query.suppliers.findFirst({ where: eq(suppliers.id, invite.supplierId!) }),
    db.select().from(documentTypes).where(and(eq(documentTypes.isActive, true))).orderBy(asc(documentTypes.sortOrder)),
  ]);

  return (
    <Shell>
      <ActionForm action={submitRegistration.bind(null, token)} requestUpload={requestInviteUpload.bind(null, token)} className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Supplier accreditation — registration</CardTitle>
            <CardDescription>
              Please complete your company details and upload the requested documents. This link expires on {fmtDate(invite.expiresAt)} and can be submitted once.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <TextField label="Registered company name" name="name" required defaultValue={supplier?.name} />
            <TextField label="Trade name" name="tradeName" defaultValue={supplier?.tradeName ?? ""} />
            <TextField label="Contact person" name="contactPerson" required defaultValue={supplier?.contactPerson ?? ""} />
            <TextField label="Email" name="email" type="email" required defaultValue={supplier?.email ?? invite.email ?? ""} />
            <TextField label="Phone" name="phone" required defaultValue={supplier?.phone ?? ""} />
            <TextField label="TIN" name="tin" defaultValue={supplier?.tin ?? ""} />
            <TextAreaField label="Business address" name="address" required rows={2} className="md:col-span-2" defaultValue={supplier?.address ?? ""} />
            <TextField label="Website" name="website" defaultValue={supplier?.website ?? ""} />
            <TextField label="Year established" name="yearEstablished" type="number" defaultValue={supplier?.yearEstablished ?? ""} />
            <TextField label="Credit terms offered (days)" name="creditTermsDays" type="number" min={0} defaultValue={supplier?.creditTermsDays ?? ""} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Documents</CardTitle>
            <CardDescription>PDF, JPG, PNG or WEBP, up to 10 MB each. Items marked * are required.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {types.map((t) => (
              <div key={t.id} className="grid gap-2 rounded-lg border p-3 md:grid-cols-[1fr_180px]">
                <div className="grid gap-1.5">
                  <Label htmlFor={`doc:${t.id}`}>
                    {t.name}
                    {t.isMandatory && <span className="text-destructive">*</span>}
                  </Label>
                  {t.description && <p className="text-muted-foreground text-xs">{t.description}</p>}
                  <Input id={`doc:${t.id}`} name={`doc:${t.id}`} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" />
                  <FieldErrorText name={`doc:${t.id}`} />
                </div>
                {t.hasExpiry && (
                  <div className="grid content-start gap-1.5">
                    <Label htmlFor={`exp:${t.id}`}>Expiry date</Label>
                    <Input id={`exp:${t.id}`} name={`exp:${t.id}`} type="date" />
                    <FieldErrorText name={`exp:${t.id}`} />
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid gap-4">
            <CheckboxField name="confirm" label="I confirm that the information and documents submitted are true and correct." />
            <FieldErrorText name="confirm" />
            <SubmitButton pendingText="Submitting…" className="w-fit">
              Submit registration
            </SubmitButton>
          </CardContent>
        </Card>
      </ActionForm>
    </Shell>
  );
}

async function Resubmission({ token, invite }: { token: string; invite: typeof supplierInvites.$inferSelect }) {
  const typeIds = invite.documentTypeIds ?? [];
  const [supplier, types, current] = await Promise.all([
    db.query.suppliers.findFirst({ where: eq(suppliers.id, invite.supplierId!) }),
    typeIds.length ? db.select().from(documentTypes).where(inArray(documentTypes.id, typeIds)).orderBy(asc(documentTypes.sortOrder)) : [],
    typeIds.length
      ? db
          .select()
          .from(supplierDocuments)
          .where(
            and(
              eq(supplierDocuments.supplierId, invite.supplierId!),
              eq(supplierDocuments.isCurrent, true),
              inArray(supplierDocuments.documentTypeId, typeIds),
            ),
          )
      : [],
  ]);

  return (
    <Shell subtitle="Document re-upload">
      <ActionForm action={submitResubmission.bind(null, token)} requestUpload={requestInviteUpload.bind(null, token)} className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Please upload {types.length === 1 ? "this document" : "these documents"} again</CardTitle>
            <CardDescription>
              {supplier?.name ? `For ${supplier.name}. ` : ""}
              Our Purchasing team could not accept the {types.length === 1 ? "document" : "documents"} below. Upload a corrected file for each one. This link
              expires on {fmtDate(invite.expiresAt)} and can be submitted once. PDF, JPG, PNG or WEBP, up to 10 MB each.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {types.map((t) => {
              const doc = current.find((d) => d.documentTypeId === t.id);
              return (
                <div key={t.id} className="grid gap-3 rounded-2xl border p-4 md:grid-cols-[1fr_180px]">
                  <div className="grid gap-1.5">
                    <Label htmlFor={`doc:${t.id}`}>
                      {t.name}
                      <span className="text-destructive">*</span>
                    </Label>
                    {doc?.status === "rejected" && doc.reviewNote && (
                      <p className="text-destructive bg-destructive/5 rounded-xl px-3 py-2 text-xs">
                        <span className="font-medium">Reason:</span> {doc.reviewNote}
                      </p>
                    )}
                    {doc?.status !== "rejected" && doc?.expiresOn && (
                      <p className="text-muted-foreground text-xs">The file we have expired on {fmtDate(doc.expiresOn)}.</p>
                    )}
                    {!doc && <p className="text-muted-foreground text-xs">We have not received this document yet.</p>}
                    <Input id={`doc:${t.id}`} name={`doc:${t.id}`} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" />
                    <FieldErrorText name={`doc:${t.id}`} />
                  </div>
                  {t.hasExpiry && (
                    <div className="grid content-start gap-1.5">
                      <Label htmlFor={`exp:${t.id}`}>Expiry date</Label>
                      <Input id={`exp:${t.id}`} name={`exp:${t.id}`} type="date" />
                      <FieldErrorText name={`exp:${t.id}`} />
                    </div>
                  )}
                </div>
              );
            })}
            <SubmitButton pendingText="Uploading…" className="w-fit">
              Submit {types.length === 1 ? "document" : "documents"}
            </SubmitButton>
          </CardContent>
        </Card>
      </ActionForm>
    </Shell>
  );
}

function Shell({ children, subtitle = "Supplier registration" }: { children: React.ReactNode; subtitle?: string }) {
  return (
    <main className="bg-muted/40 min-h-svh">
      <header className="bg-forest text-forest-foreground">
        <div className="mx-auto max-w-3xl px-4 py-5">
          <BrandLockup subtitle={subtitle} />
        </div>
        <div className="bg-highlight h-1" aria-hidden />
      </header>
      <div className="mx-auto grid max-w-3xl gap-6 px-4 py-10">{children}</div>
    </main>
  );
}
