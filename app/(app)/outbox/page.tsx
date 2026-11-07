import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { MailWarningIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Pill } from "@/components/status-badge";
import { EmailPreviewDialog, ResendButton } from "@/components/requests/outbox-controls";
import { db } from "@/lib/db";
import { emailOutbox, suppliers } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { isEmailConfigured } from "@/lib/email";
import { fmtDateTime } from "@/lib/format";
import { resendEmail } from "../requests/actions";

export const metadata = { title: "Email outbox" };

const STATUS = {
  sent: { tone: "green", label: "Sent" },
  pending: { tone: "blue", label: "Sending" },
  failed: { tone: "red", label: "Failed" },
  not_configured: { tone: "amber", label: "Not sent — email not set up" },
} as const;

const KIND: Record<string, string> = {
  request: "Request",
  request_reminder: "Reminder",
  request_reply: "Reply notice (to staff)",
  invite: "Registration link",
  resubmission: "Re-upload link",
};

export default async function OutboxPage() {
  await requireUser("inviteSuppliers");
  const configured = isEmailConfigured();
  const rows = await db
    .select({ e: emailOutbox, supplierName: suppliers.name })
    .from(emailOutbox)
    .leftJoin(suppliers, eq(suppliers.id, emailOutbox.supplierId))
    .orderBy(desc(emailOutbox.createdAt))
    .limit(200);

  return (
    <>
      <PageHeader title="Email outbox" description="Every email the system sends: requests, reminders, links and reply notices." />
      {!configured && (
        <Alert className="mb-6 rounded-2xl border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          <MailWarningIcon />
          <AlertTitle>Email sending is not set up yet</AlertTitle>
          <AlertDescription className="text-inherit">
            Emails are saved here instead of being sent. Add the SMTP settings (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM) to the server
            settings and restart; then use Send on any email below to send it.
          </AlertDescription>
        </Alert>
      )}
      <Card>
        <CardContent>
          {rows.length === 0 ? (
            <EmptyState title="No emails yet" />
          ) : (
            <ul className="divide-y">
              {rows.map(({ e, supplierName }) => {
                const st = STATUS[e.status];
                return (
                  <li key={e.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="truncate font-medium">{e.subject}</p>
                      <p className="text-muted-foreground text-xs">
                        {KIND[e.relatedType ?? ""] ?? "Email"} · to {e.toEmail}
                        {supplierName && e.supplierId && (
                          <>
                            {" · "}
                            <Link href={`/suppliers/${e.supplierId}`} className="hover:underline">
                              {supplierName}
                            </Link>
                          </>
                        )}{" "}
                        · {fmtDateTime(e.sentAt ?? e.createdAt)}
                      </p>
                      {e.status === "failed" && e.error && <p className="text-destructive mt-0.5 text-xs">{e.error}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Pill tone={st.tone}>{st.label}</Pill>
                      <EmailPreviewDialog subject={e.subject} html={e.html} to={e.toEmail} />
                      {configured && e.status !== "sent" && <ResendButton action={resendEmail.bind(null, e.id)} />}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
