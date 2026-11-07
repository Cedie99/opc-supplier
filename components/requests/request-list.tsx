import Link from "next/link";
import { BellRingIcon, ClockIcon, LinkIcon, MailCheckIcon, PencilLineIcon, XIcon } from "lucide-react";
import { Pill } from "@/components/status-badge";
import { ConfirmActionButton } from "@/components/scoring/decision-panel";
import { RecordOutsideReplyDialog, ViewReplyDialog } from "./request-dialogs";
import type { communicationLogs } from "@/lib/db/schema";
import { REQUEST_NO_RESPONSE_AFTER_HOURS, REQUEST_TYPE_LABELS } from "@/lib/constants";
import { requestTiming } from "@/lib/requests";
import { formatBusinessHours } from "@/lib/business-hours";
import { responseEntries } from "@/lib/request-response";
import { fmtDateTime } from "@/lib/format";
import { closeRequest, recordOutsideReply } from "@/app/(app)/requests/actions";

export type RequestListRow = typeof communicationLogs.$inferSelect & { supplierName?: string; senderName?: string | null };

/** Requests with their business-hour timing. Server component; actions are wired per row. */
export function RequestList({ rows, holidays, canLog, showSupplier }: { rows: RequestListRow[]; holidays: Set<string>; canLog: boolean; showSupplier?: boolean }) {
  const now = new Date();
  return (
    <ul className="grid gap-2">
      {rows.map((r) => {
        const t = requestTiming(r, now, holidays);
        const viaLink = r.channel === "link";
        const manual = r.channel === "manual" || r.respondedVia === "other";
        const icon =
          t.state === "closed" ? (
            <XIcon className="size-4" />
          ) : r.respondedAt ? (
            <MailCheckIcon className="size-4" />
          ) : t.state === "no_response" ? (
            <BellRingIcon className="size-4" />
          ) : (
            <ClockIcon className="size-4" />
          );
        const iconTone =
          t.state === "replied"
            ? "bg-secondary text-primary"
            : t.state === "waiting"
              ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"
              : t.state === "closed"
                ? "bg-muted text-muted-foreground"
                : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300";
        return (
          <li key={r.id} className={`flex flex-col gap-3 rounded-2xl border p-3 sm:flex-row sm:items-center ${t.state === "closed" ? "opacity-60" : ""}`}>
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <span className={`flex size-9 shrink-0 items-center justify-center rounded-full ${iconTone}`}>{icon}</span>
              <div className="min-w-0 text-sm">
                <p className="truncate font-medium">
                  {showSupplier && r.supplierName && (
                    <Link href={`/suppliers/${r.supplierId}?tab=activity`} className="hover:underline">
                      {r.supplierName}
                    </Link>
                  )}
                  {showSupplier && r.supplierName && <span className="text-muted-foreground font-normal"> · </span>}
                  {r.subject}
                </p>
                <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                  <span>{REQUEST_TYPE_LABELS[r.requestType]}</span>
                  <span>· sent {fmtDateTime(r.requestedAt)}</span>
                  {r.senderName && <span>· by {r.senderName}</span>}
                  {viaLink ? (
                    <span className="inline-flex items-center gap-1">
                      · <LinkIcon className="size-3" /> via link{r.recipientEmail ? ` to ${r.recipientEmail}` : ""}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      · <PencilLineIcon className="size-3" /> logged by hand
                    </span>
                  )}
                  {r.reminderSentAt && !r.respondedAt && <span>· reminder sent</span>}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <StatusPill state={t.state} hours={t.elapsedHours} manual={manual && Boolean(r.respondedAt)} />
              {r.respondedAt && (r.response || r.responseFile) && (
                <ViewReplyDialog
                  subject={r.subject}
                  message={r.message}
                  entries={responseEntries(r.response)}
                  fileUrl={r.responseFile ? `/api/requests/${r.id}/file` : null}
                  fileName={r.responseFile?.fileName}
                  meta={`Replied ${fmtDateTime(r.respondedAt)} · ${formatBusinessHours(t.elapsedHours)} in business hours${manual ? " · recorded by hand" : ""}`}
                />
              )}
              {canLog && !r.respondedAt && t.state !== "closed" && (
                <>
                  <RecordOutsideReplyDialog action={recordOutsideReply.bind(null, r.id)} />
                  <ConfirmActionButton action={closeRequest.bind(null, r.id)} label="Withdraw" confirmLabel="Withdraw this request? It will not count towards Responsiveness." variant="ghost" />
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function StatusPill({ state, hours, manual }: { state: ReturnType<typeof requestTiming>["state"]; hours: number; manual: boolean }) {
  if (state === "closed") return <Pill tone="gray">Withdrawn</Pill>;
  if (state === "waiting") return <Pill tone="blue">Waiting · {formatBusinessHours(hours)}</Pill>;
  if (state === "no_response") return <Pill tone="red">No response · over {formatBusinessHours(REQUEST_NO_RESPONSE_AFTER_HOURS)}</Pill>;
  if (state === "replied_late") return <Pill tone="amber">Replied late · {formatBusinessHours(hours)}</Pill>;
  return (
    <Pill tone="green">
      Replied in {formatBusinessHours(hours)}
      {manual ? " · manual" : ""}
    </Pill>
  );
}
