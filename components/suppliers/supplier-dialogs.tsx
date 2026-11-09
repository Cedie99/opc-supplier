"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckIcon, CopyIcon, LinkIcon, UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormDialog } from "@/components/form/form-dialog";
import { CheckboxField, SelectField, TextAreaField, TextField } from "@/components/form/fields";
import { FieldErrorText } from "@/components/form/field-errors";
import type { ActionState } from "@/lib/action-state";
import { REQUEST_TYPES, REQUEST_TYPE_LABELS, SUPPLIER_STATUSES, SUPPLIER_STATUS_LABELS, type SupplierStatus } from "@/lib/constants";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

export function UploadDocumentDialog({
  action,
  documentTypes,
  defaultTypeId,
  triggerLabel = "Upload document",
  variant = "default",
}: {
  action: Action;
  documentTypes: { id: string; name: string; hasExpiry: boolean }[];
  defaultTypeId?: string;
  triggerLabel?: string;
  variant?: "default" | "outline" | "ghost";
}) {
  const [typeId, setTypeId] = useState(defaultTypeId ?? documentTypes[0]?.id ?? "");
  const needsExpiry = documentTypes.find((t) => t.id === typeId)?.hasExpiry;
  return (
    <FormDialog
      trigger={
        <Button size="sm" variant={variant}>
          <UploadIcon /> {triggerLabel}
        </Button>
      }
      title="Upload a document"
      description="PDF, JPG, PNG or WEBP, up to 10 MB. The upload replaces the current file of the same type; older versions stay in the history."
      action={action}
      submitLabel="Upload"
    >
      <SelectField
        label="Document type"
        name="documentTypeId"
        required
        value={typeId}
        onChange={(e) => setTypeId(e.target.value)}
        options={documentTypes.map((t) => ({ value: t.id, label: t.name }))}
      />
      <div className="grid gap-1.5">
        <Label htmlFor="file">File</Label>
        <Input id="file" name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required />
        <FieldErrorText name="file" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Issued on" name="issuedOn" type="date" />
        <TextField label="Expires on" name="expiresOn" type="date" required={needsExpiry} hint={needsExpiry ? "Required for this document." : undefined} />
      </div>
    </FormDialog>
  );
}

export function ReviewDocumentDialog({ action, documentName }: { action: Action; documentName: string }) {
  return (
    <div className="flex gap-1">
      <FormDialog
        trigger={
          <Button size="xs" variant="outline">
            Verify
          </Button>
        }
        title={`Verify ${documentName}`}
        description="Confirm the document is genuine, complete, legible and valid."
        action={action}
        submitLabel="Mark as verified"
      >
        <input type="hidden" name="decision" value="verified" />
        <TextAreaField label="Note (optional)" name="reviewNote" rows={2} />
      </FormDialog>
      <FormDialog
        trigger={
          <Button size="xs" variant="ghost" className="text-destructive">
            Reject
          </Button>
        }
        title={`Reject ${documentName}`}
        description="The supplier must provide a replacement. A rejected mandatory document blocks accreditation."
        action={action}
        submitLabel="Reject document"
        submitVariant="destructive"
      >
        <input type="hidden" name="decision" value="rejected" />
        <TextAreaField label="Reason" name="reviewNote" rows={3} required />
      </FormDialog>
    </div>
  );
}

export function ChangeStatusDialog({ action, current }: { action: Action; current: SupplierStatus }) {
  return (
    <FormDialog
      trigger={
        <Button size="sm" variant="outline">
          Change status
        </Button>
      }
      title="Change supplier status"
      description="Statuses normally change automatically when a Selection Matrix or quarterly evaluation is approved. Use this for exceptions, such as deactivating a supplier. The reason is kept in the history."
      action={action}
      submitLabel="Change status"
    >
      <SelectField
        label="New status"
        name="status"
        defaultValue={current}
        options={SUPPLIER_STATUSES.map((s) => ({ value: s, label: SUPPLIER_STATUS_LABELS[s] }))}
      />
      <TextAreaField label="Reason" name="note" rows={3} required />
    </FormDialog>
  );
}

export function InviteDialog({ action, email }: { action: Action; email?: string | null }) {
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  return (
    <FormDialog
      trigger={
        <Button size="sm" variant="outline">
          <LinkIcon /> Registration link
        </Button>
      }
      title="Send a registration link"
      description="The supplier opens this link to fill in its company details and upload its documents. The link works for 14 days and can be used once."
      action={action}
      submitLabel="Create link"
      keepOpenOnSuccess
      onSuccess={(s) => {
        setLink(s.link ?? null);
        setCopied(false);
      }}
    >
      <TextField label="Supplier email" name="email" type="email" defaultValue={email ?? ""} />
      <CheckboxField name="sendEmail" label="Email the link to the supplier" hint="Uncheck to only create the link and send it yourself." defaultChecked />
      {link && <CopyLink link={link} copied={copied} onCopied={() => setCopied(true)} />}
    </FormDialog>
  );
}

function CopyLink({ link, copied, onCopied }: { link: string; copied: boolean; onCopied: () => void }) {
  return (
    <div className="grid gap-1.5">
      <Label>Link — copy it and send it to the supplier</Label>
      <div className="flex gap-2">
        <Input readOnly value={link} onFocus={(e) => e.target.select()} />
        <Button
          type="button"
          variant="secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(link);
            onCopied();
            toast.success("Link copied.");
          }}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </Button>
      </div>
    </div>
  );
}

export type ReuploadItem = { typeId: string; name: string; state: "missing" | "rejected" | "expired"; reason?: string | null; mandatory: boolean };

const REUPLOAD_STATE_LABEL: Record<ReuploadItem["state"], string> = { rejected: "Rejected", expired: "Expired", missing: "Not received" };

/** A link that asks the supplier for only the chosen documents (no company form). Rejected ones are pre-selected. */
export function RequestReuploadDialog({ action, items, email }: { action: Action; items: ReuploadItem[]; email?: string | null }) {
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  return (
    <FormDialog
      trigger={
        <Button size="sm" variant="outline">
          <LinkIcon /> Request re-upload
        </Button>
      }
      title="Ask the supplier to re-upload documents"
      description="The supplier gets a link that asks only for the documents you tick, with the Purchasing Officer's rejection reason. It works for 14 days, can be used once, and replaces any earlier re-upload link."
      action={action}
      submitLabel="Create link"
      keepOpenOnSuccess
      onSuccess={(s) => {
        setLink(s.link ?? null);
        setCopied(false);
      }}
    >
      <div className="grid gap-2">
        <Label>Documents to request</Label>
        {items.map((i) => (
          <label key={i.typeId} className="hover:bg-muted/50 flex items-start gap-3 rounded-2xl border p-3 text-sm">
            <input type="checkbox" name="documentTypeId" value={i.typeId} defaultChecked={i.state === "rejected"} className="accent-primary mt-0.5 size-4" />
            <span className="min-w-0">
              <span className="font-medium">{i.name}</span>
              {i.mandatory && <span className="text-muted-foreground text-xs"> · mandatory</span>}
              <span className={i.state === "rejected" ? "text-destructive block text-xs" : "text-muted-foreground block text-xs"}>
                {REUPLOAD_STATE_LABEL[i.state]}
                {i.reason ? `: ${i.reason}` : ""}
              </span>
            </span>
          </label>
        ))}
        <FieldErrorText name="documentTypeId" />
      </div>
      <TextField label="Supplier email" name="email" type="email" defaultValue={email ?? ""} />
      <CheckboxField name="sendEmail" label="Email the link to the supplier" hint="Uncheck to only create the link and send it yourself." defaultChecked />
      {link && <CopyLink link={link} copied={copied} onCopied={() => setCopied(true)} />}
    </FormDialog>
  );
}

const nowLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

export function LogCommunicationDialog({ action }: { action: Action }) {
  return (
    <FormDialog
      trigger={
        <Button size="sm" variant="outline">
          Log past request
        </Button>
      }
      title="Log a request made outside the system"
      description="Only for requests you already made by phone, chat or your own email. Prefer Send request: its times are recorded automatically. Manual entries are marked as such."
      action={action}
      submitLabel="Save"
    >
      <SelectField label="Type" name="requestType" options={REQUEST_TYPES.map((t) => ({ value: t, label: REQUEST_TYPE_LABELS[t] }))} />
      <input type="hidden" name="tzOffset" value={new Date().getTimezoneOffset()} />
      <TextField label="Subject" name="subject" required placeholder="e.g. Quotation for 1L bottles" />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Requested at" name="requestedAt" type="datetime-local" required defaultValue={nowLocal()} />
        <TextField label="Replied at" name="respondedAt" type="datetime-local" hint="Leave blank if no reply yet." />
      </div>
    </FormDialog>
  );
}

export function LogComplaintDialog({ action }: { action: Action }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <FormDialog
      trigger={
        <Button size="sm" variant="outline">
          Log complaint
        </Button>
      }
      title="Log a complaint"
      description="Defects, shortages, wrong items or other issues. The on-time resolution rate feeds the After-Sales Support rating."
      action={action}
      submitLabel="Save"
    >
      <TextAreaField label="What happened" name="description" rows={3} required />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Raised on" name="raisedOn" type="date" required defaultValue={today} />
        <TextField label="Agreed resolution date" name="dueOn" type="date" required />
      </div>
    </FormDialog>
  );
}

export function ResolveComplaintDialog({ action }: { action: Action }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <FormDialog
      trigger={
        <Button size="xs" variant="outline">
          Resolve
        </Button>
      }
      title="Resolve complaint"
      action={action}
      submitLabel="Mark resolved"
    >
      <TextField label="Resolved on" name="resolvedOn" type="date" required defaultValue={today} />
      <TextAreaField label="Resolution" name="resolution" rows={3} />
    </FormDialog>
  );
}
