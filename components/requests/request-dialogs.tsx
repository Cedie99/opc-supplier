"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckIcon, CopyIcon, EyeIcon, PaperclipIcon, SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormDialog } from "@/components/form/form-dialog";
import { SelectField, TextAreaField, TextField } from "@/components/form/fields";
import type { ActionState } from "@/lib/action-state";
import { REQUEST_TYPE_LABELS, type RequestType } from "@/lib/constants";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/** The types a buyer can send through a link (complaints are logged separately). */
const SENDABLE: RequestType[] = ["quotation", "delivery_follow_up", "order_follow_up", "urgent_request", "other"];

const PLACEHOLDERS: Partial<Record<RequestType, string>> = {
  quotation: "Please quote your best price for 10,000 pcs of 1L HDPE bottles (38mm neck, natural). Include lead time and validity.",
  delivery_follow_up: "Please confirm the delivery date and quantity for PO 4500123.",
  order_follow_up: "Please confirm that you accept PO 4500123 as issued.",
};

export function SendRequestDialog({ action, email, size = "sm" }: { action: Action; email?: string | null; size?: "sm" | "default" }) {
  const [type, setType] = useState<RequestType>("quotation");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  return (
    <FormDialog
      trigger={
        <Button size={size}>
          <SendIcon /> Send request
        </Button>
      }
      title="Send a request to the supplier"
      description="The supplier gets an email with a link and replies there. The reply time is recorded automatically in business hours and feeds the Responsiveness rating."
      action={action}
      submitLabel="Send request"
      keepOpenOnSuccess
      onSuccess={(s) => {
        setLink(s.link ?? null);
        setCopied(false);
      }}
    >
      <SelectField
        label="Type"
        name="requestType"
        value={type}
        onChange={(e) => setType(e.target.value as RequestType)}
        options={SENDABLE.map((t) => ({ value: t, label: REQUEST_TYPE_LABELS[t] }))}
      />
      <TextField label="Subject" name="subject" required placeholder="e.g. Quotation for 1L HDPE bottles" />
      <TextAreaField label="Message" name="message" required rows={4} placeholder={PLACEHOLDERS[type] ?? "Write your request…"} />
      <TextField label="Send to (supplier email)" name="email" type="email" required defaultValue={email ?? ""} />
      {link && (
        <div className="bg-secondary/60 grid gap-1.5 rounded-2xl p-3">
          <Label>Sent. Supplier link (in case you also want to send it another way)</Label>
          <div className="flex gap-2">
            <Input readOnly value={link} onFocus={(e) => e.target.select()} />
            <Button
              type="button"
              variant="secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(link);
                setCopied(true);
                toast.success("Link copied.");
              }}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
            </Button>
          </div>
        </div>
      )}
    </FormDialog>
  );
}

export function RecordOutsideReplyDialog({ action }: { action: Action }) {
  const nowLocal = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  };
  return (
    <FormDialog
      trigger={
        <Button size="xs" variant="outline">
          Replied elsewhere
        </Button>
      }
      title="Record a reply received outside the system"
      description="Use this only when the supplier answered by phone, chat or email instead of the link. It is marked as a manual entry."
      action={action}
      submitLabel="Save"
    >
      <input type="hidden" name="tzOffset" value={new Date().getTimezoneOffset()} />
      <TextField label="Replied at" name="respondedAt" type="datetime-local" required defaultValue={nowLocal()} />
      <TextAreaField label="What did they say? (optional)" name="note" rows={3} />
    </FormDialog>
  );
}

export function ViewReplyDialog({
  subject,
  message,
  entries,
  fileUrl,
  fileName,
  meta,
}: {
  subject: string;
  message: string | null;
  entries: { label: string; value: string }[];
  fileUrl?: string | null;
  fileName?: string | null;
  meta: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="xs" variant="outline">
          <EyeIcon /> View reply
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{subject}</DialogTitle>
          <DialogDescription>{meta}</DialogDescription>
        </DialogHeader>
        {message && (
          <div>
            <p className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">Our request</p>
            <p className="bg-muted/60 rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap">{message}</p>
          </div>
        )}
        <div>
          <p className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">Their reply</p>
          {entries.length === 0 ? (
            <p className="text-muted-foreground text-sm">No details were recorded.</p>
          ) : (
            <dl className="grid grid-cols-[150px_1fr] gap-x-4 gap-y-2 text-sm">
              {entries.map((e) => (
                <div key={e.label} className="contents">
                  <dt className="text-muted-foreground">{e.label}</dt>
                  <dd className="whitespace-pre-wrap">{e.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
        {fileUrl && (
          <a href={fileUrl} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1.5 text-sm hover:underline">
            <PaperclipIcon className="size-4" /> {fileName ?? "Attachment"}
          </a>
        )}
      </DialogContent>
    </Dialog>
  );
}
