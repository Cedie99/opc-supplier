import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  BuildingIcon,
  CalendarClockIcon,
  CalendarIcon,
  CalendarXIcon,
  CheckIcon,
  ChevronLeftIcon,
  CircleDashedIcon,
  ClipboardCheckIcon,
  ClockIcon,
  FileCheckIcon,
  FileTextIcon,
  GlobeIcon,
  HashIcon,
  HistoryIcon,
  LayoutGridIcon,
  MailIcon,
  MapPinIcon,
  MessagesSquareIcon,
  PackageIcon,
  PaperclipIcon,
  PencilIcon,
  PhoneIcon,
  PlusIcon,
  TriangleAlertIcon,
  UserIcon,
  WrenchIcon,
  XIcon,
} from "lucide-react";
import { ScoreRing } from "@/components/score-ring";
import { SendRequestDialog } from "@/components/requests/request-dialogs";
import { RequestList } from "@/components/requests/request-list";
import { getHolidaySet } from "@/lib/requests";
import { sendRequest } from "@/app/(app)/requests/actions";
import type { Classification } from "@/lib/scoring/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/page-header";
import {
  ClassificationBadge,
  CorrectiveActionBadge,
  DocumentStatusBadge,
  Pill,
  SupplierStatusBadge,
  TierBadge,
  WorkflowBadge,
} from "@/components/status-badge";
import {
  ChangeStatusDialog,
  InviteDialog,
  RequestReuploadDialog,
  LogCommunicationDialog,
  LogComplaintDialog,
  ResolveComplaintDialog,
  ReviewDocumentDialog,
  UploadDocumentDialog,
} from "@/components/suppliers/supplier-dialogs";
import { db } from "@/lib/db";
import {
  auditEvents,
  canvassEntries,
  canvasses,
  communicationLogs,
  complaints,
  correctiveActions,
  documentTypes,
  evaluations,
  materialCategories,
  profiles,
  supplierCategories,
  supplierDocuments,
  suppliers,
} from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getCompliance } from "@/lib/accreditation";
import { MOLD_OWNERSHIP_LABELS, SUPPLIER_TIER_LABELS, TIER_FREQUENCY, DOCUMENT_EXPIRY_WARNING_DAYS } from "@/lib/constants";

const CLASSIFICATIONS = ["preferred", "approved", "conditional", "not_qualified"] as const;
import { daysUntil, fmtDate, fmtDateTime, quarterLabel, todayIso } from "@/lib/format";
import {
  changeSupplierStatus,
  createInvite,
  createResubmissionLink,
  logCommunication,
  logComplaint,
  resolveComplaint,
  reviewDocument,
  uploadDocument,
} from "../actions";

export default async function SupplierPage({ params, searchParams }: PageProps<"/suppliers/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const { tab } = await searchParams;
  const supplier = await db.query.suppliers.findFirst({ where: eq(suppliers.id, id) });
  if (!supplier) notFound();

  const actor = alias(profiles, "actor");
  const sender = alias(profiles, "sender");
  const holidaySet = await getHolidaySet();
  const [categories, compliance, docHistory, types, evals, actions, comms, complaintRows, history, canvassRows] = await Promise.all([
    db
      .select({ id: materialCategories.id, name: materialCategories.name, materials: supplierCategories.materials, isCritical: materialCategories.isCritical })
      .from(supplierCategories)
      .innerJoin(materialCategories, eq(materialCategories.id, supplierCategories.categoryId))
      .where(eq(supplierCategories.supplierId, id))
      .orderBy(asc(materialCategories.name)),
    getCompliance(id),
    db
      .select({ doc: supplierDocuments, typeName: documentTypes.name })
      .from(supplierDocuments)
      .innerJoin(documentTypes, eq(documentTypes.id, supplierDocuments.documentTypeId))
      .where(and(eq(supplierDocuments.supplierId, id), eq(supplierDocuments.isCurrent, false)))
      .orderBy(desc(supplierDocuments.createdAt))
      .limit(50),
    db.select().from(documentTypes).where(eq(documentTypes.isActive, true)).orderBy(asc(documentTypes.sortOrder)),
    db.select().from(evaluations).where(eq(evaluations.supplierId, id)).orderBy(desc(evaluations.year), desc(evaluations.quarter)),
    db.select().from(correctiveActions).where(eq(correctiveActions.supplierId, id)).orderBy(desc(correctiveActions.createdAt)),
    db
      .select({ r: communicationLogs, senderName: sender.fullName })
      .from(communicationLogs)
      .leftJoin(sender, eq(sender.id, communicationLogs.loggedBy))
      .where(eq(communicationLogs.supplierId, id))
      .orderBy(desc(communicationLogs.requestedAt))
      .limit(50)
      .then((rows) => rows.map(({ r, senderName }) => ({ ...r, senderName }))),
    db.select().from(complaints).where(eq(complaints.supplierId, id)).orderBy(desc(complaints.raisedOn)).limit(50),
    db
      .select({ e: auditEvents, actorName: actor.fullName })
      .from(auditEvents)
      .leftJoin(actor, eq(actor.id, auditEvents.actorId))
      .where(eq(auditEvents.supplierId, id))
      .orderBy(desc(auditEvents.createdAt))
      .limit(100),
    db
      .select({ c: canvasses, entry: canvassEntries })
      .from(canvassEntries)
      .innerJoin(canvasses, eq(canvasses.id, canvassEntries.canvassId))
      .where(eq(canvassEntries.supplierId, id))
      .orderBy(desc(canvasses.createdAt)),
  ]);

  const today = todayIso();
  const canManage = can(user.role, "manageSuppliers");
  const canUpload = can(user.role, "uploadDocuments");
  const canVerify = can(user.role, "verifyDocuments");
  const canInvite = can(user.role, "inviteSuppliers");
  const reuploadItems = compliance.items.flatMap(({ type, document, state }) =>
    state === "rejected" || state === "expired" || (state === "missing" && type.isMandatory)
      ? [{ typeId: type.id, name: type.name, state, reason: state === "rejected" ? document?.reviewNote : null, mandatory: type.isMandatory }]
      : [],
  );
  const rejectedCount = reuploadItems.filter((i) => i.state === "rejected").length;
  const canLog = can(user.role, "logActivity");
  const typeOptions = types.map((t) => ({ id: t.id, name: t.name, hasExpiry: t.hasExpiry }));
  const openActions = actions.filter((a) => a.status !== "closed");
  const compliancePct = compliance.mandatoryTotal ? Math.round((compliance.mandatoryOk / compliance.mandatoryTotal) * 100) : 100;
  const defaultTab = typeof tab === "string" ? tab : "overview";

  const classification = (CLASSIFICATIONS as readonly string[]).includes(supplier.status) ? (supplier.status as Classification) : null;
  const docCounts = {
    verified: compliance.items.filter((i) => i.state === "verified").length,
    pending: compliance.items.filter((i) => i.state === "pending").length,
    attention: compliance.items.filter((i) => i.state === "rejected" || i.state === "expired").length,
    missing: compliance.items.filter((i) => i.state === "missing").length,
  };
  const docsNeedingAction = docCounts.attention + compliance.items.filter((i) => i.state === "missing" && i.type.isMandatory).length;
  const overdueActions = openActions.filter((a) => a.dueDate < today).length;
  const openComplaints = complaintRows.filter((c) => c.status !== "resolved").length;
  const initials = supplier.name
    .replace(/\(.*?\)/g, "")
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

  return (
    <>
      {/* Profile header on the brand's forest surface, like the dashboard hero. */}
      <section className="bg-forest text-forest-foreground relative mb-6 overflow-hidden rounded-[1.75rem]">
        <div aria-hidden className="pointer-events-none absolute -top-28 -right-20 size-80 rounded-full bg-white/[0.05]" />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 left-1/3 size-56 rounded-full bg-white/[0.03]" />
        <div aria-hidden className="bg-highlight pointer-events-none absolute top-8 right-[38%] hidden size-2.5 rounded-full md:block" />
        <div className="relative p-6 md:p-8">
          <Link href="/suppliers" className="text-forest-foreground/70 hover:text-forest-foreground mb-5 inline-flex items-center gap-1 text-sm">
            <ChevronLeftIcon className="size-4" /> Suppliers
          </Link>
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
            <div className="flex min-w-0 flex-1 items-start gap-4">
              <span className="text-forest flex size-16 shrink-0 items-center justify-center rounded-2xl bg-white text-xl font-semibold shadow-lg shadow-black/20">
                {initials || "S"}
              </span>
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{supplier.name}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-forest-foreground/70 font-mono text-xs">{supplier.code}</span>
                  <SupplierStatusBadge status={supplier.status} />
                  <TierBadge tier={supplier.tier} />
                  {supplier.isSingleSource && <Pill tone="amber">Single source</Pill>}
                  {supplier.erpVendorCode && <Pill tone="gray">ERP {supplier.erpVendorCode}</Pill>}
                </div>
                <div className="text-forest-foreground/75 mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
                  {supplier.contactPerson && (
                    <span className="inline-flex items-center gap-1.5">
                      <UserIcon className="size-3.5" /> {supplier.contactPerson}
                    </span>
                  )}
                  {supplier.email && (
                    <a href={`mailto:${supplier.email}`} className="hover:text-forest-foreground inline-flex items-center gap-1.5">
                      <MailIcon className="size-3.5" /> {supplier.email}
                    </a>
                  )}
                  {supplier.phone && (
                    <span className="inline-flex items-center gap-1.5">
                      <PhoneIcon className="size-3.5" /> {supplier.phone}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4 lg:border-l lg:border-white/15 lg:pl-6">
              <ScoreRing score={supplier.latestScore} classification={classification} size={92} track="rgb(255 255 255 / 0.14)" />
              <div className="text-sm">
                <p className="text-highlight text-xs font-semibold tracking-wider uppercase">Latest score</p>
                <p className="text-forest-foreground/75 mt-1">{supplier.latestScoreAt ? `as of ${fmtDate(supplier.latestScoreAt)}` : "Not scored yet"}</p>
                <p className="text-forest-foreground/75">{supplier.accreditedAt ? `Accredited ${fmtDate(supplier.accreditedAt)}` : "Not accredited yet"}</p>
              </div>
            </div>
          </div>
          <div className="text-foreground mt-6 flex flex-wrap gap-2 border-t border-white/10 pt-5">
            {canManage && (
              <Button size="sm" asChild className="bg-highlight text-highlight-foreground hover:bg-highlight/90 font-semibold">
                <Link href={`/suppliers/${id}/edit`}>
                  <PencilIcon /> Edit details
                </Link>
              </Button>
            )}
            {canInvite && <InviteDialog action={createInvite.bind(null, id)} email={supplier.email} />}
            {can(user.role, "approve") && <ChangeStatusDialog action={changeSupplierStatus.bind(null, id)} current={supplier.status} />}
          </div>
        </div>
      </section>

      {compliance.blocking.length > 0 && (
        <Alert className="mb-6 rounded-2xl border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          <TriangleAlertIcon />
          <AlertTitle>Accreditation blocked</AlertTitle>
          <AlertDescription className="text-inherit">Mandatory documents not yet verified: {compliance.blocking.join(", ")}.</AlertDescription>
        </Alert>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={FileCheckIcon}
          label="Mandatory documents"
          value={`${compliance.mandatoryOk} / ${compliance.mandatoryTotal}`}
          sub={<Progress value={compliancePct} className="mt-2 h-1.5" />}
          alert={compliance.blocking.length > 0}
        />
        <Stat
          icon={WrenchIcon}
          label="Open corrective actions"
          value={String(openActions.length)}
          sub={overdueActions ? `${overdueActions} overdue` : "None overdue"}
          alert={overdueActions > 0}
        />
        <Stat
          icon={ClipboardCheckIcon}
          label="Evaluations"
          value={String(evals.length)}
          sub={evals[0] ? `Last: ${quarterLabel(evals[0].year, evals[0].quarter)}` : "None yet"}
        />
        <Stat icon={CalendarClockIcon} label="Evaluation frequency" value={TIER_FREQUENCY[supplier.tier]} sub={`${SUPPLIER_TIER_LABELS[supplier.tier]} tier`} small />
      </div>

      <Tabs defaultValue={defaultTab} className="gap-4">
        <TabsList>
          <TabsTrigger value="overview">
            <LayoutGridIcon /> Overview
          </TabsTrigger>
          <TabsTrigger value="documents">
            <FileTextIcon /> Documents
            {docsNeedingAction > 0 && <Count alert>{docsNeedingAction}</Count>}
          </TabsTrigger>
          <TabsTrigger value="evaluations">
            <ClipboardCheckIcon /> Evaluations
            {evals.length > 0 && <Count>{evals.length}</Count>}
          </TabsTrigger>
          <TabsTrigger value="actions">
            <WrenchIcon /> Corrective actions
            {openActions.length > 0 && <Count alert={overdueActions > 0}>{openActions.length}</Count>}
          </TabsTrigger>
          <TabsTrigger value="activity">
            <MessagesSquareIcon /> Activity log
            {openComplaints > 0 && <Count alert>{openComplaints}</Count>}
          </TabsTrigger>
          <TabsTrigger value="history">
            <HistoryIcon /> History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Company details</CardTitle>
              <CardDescription>Registered information and commercial terms.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6">
              <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
                <Info icon={BuildingIcon} label="Trade name" value={supplier.tradeName} />
                <Info icon={HashIcon} label="TIN" value={supplier.tin} />
                <Info icon={MapPinIcon} label="Address" value={supplier.address} className="sm:col-span-2" />
                <Info
                  icon={GlobeIcon}
                  label="Website"
                  value={
                    supplier.website ? (
                      <a href={supplier.website} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                        {supplier.website.replace(/^https?:\/\//, "")}
                      </a>
                    ) : null
                  }
                />
                <Info
                  icon={CalendarIcon}
                  label="Year established"
                  value={supplier.yearEstablished ? `${supplier.yearEstablished} · ${new Date().getFullYear() - supplier.yearEstablished} years in business` : null}
                />
                <Info icon={UserIcon} label="Contact person" value={supplier.contactPerson} />
                <Info icon={MailIcon} label="Email" value={supplier.email} />
                <Info icon={PhoneIcon} label="Phone" value={supplier.phone} />
              </dl>
              <div className="bg-muted/60 grid gap-4 rounded-2xl p-4 sm:grid-cols-3">
                <Term label="Credit terms" value={supplier.creditTermsDays != null ? `${supplier.creditTermsDays} days` : "—"} />
                <Term label="Mold ownership" value={MOLD_OWNERSHIP_LABELS[supplier.moldOwnership]} />
                <Term label="ERP vendor code" value={supplier.erpVendorCode ?? "Not linked yet"} />
              </div>
              {supplier.notes && (
                <div>
                  <p className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">Notes</p>
                  <p className="text-sm whitespace-pre-wrap">{supplier.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
          <div className="grid content-start gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Materials supplied</CardTitle>
              </CardHeader>
              <CardContent>
                {categories.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No categories assigned.</p>
                ) : (
                  <ul className="grid gap-3">
                    {categories.map((c) => (
                      <li key={c.id} className="flex items-start gap-3">
                        <span className="bg-secondary text-primary flex size-8 shrink-0 items-center justify-center rounded-full">
                          <PackageIcon className="size-4" />
                        </span>
                        <span className="min-w-0 text-sm">
                          <span className="flex flex-wrap items-center gap-1.5 font-medium">
                            {c.name}
                            {c.isCritical && <Pill tone="violet">Critical</Pill>}
                          </span>
                          {c.materials && <span className="text-muted-foreground block text-xs">{c.materials}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Selection Matrix</CardTitle>
                <CardDescription>Canvasses this supplier took part in.</CardDescription>
              </CardHeader>
              <CardContent>
                {canvassRows.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Not part of any canvass yet.</p>
                ) : (
                  <ul className="-mx-2 grid gap-1">
                    {canvassRows.map(({ c, entry }) => (
                      <li key={entry.id}>
                        <Link href={`/canvass/${c.id}`} className="hover:bg-muted flex items-center gap-3 rounded-2xl p-2">
                          <ScoreRing score={entry.totalScore} classification={entry.classification} size={42} stroke={5} />
                          <span className="min-w-0 flex-1 text-sm">
                            <span className="block truncate font-medium">{c.title}</span>
                            <span className="text-muted-foreground text-xs">{c.reference}</span>
                          </span>
                          {c.recommendedSupplierId === id && <Pill tone="green">Selected</Pill>}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="documents" className="grid gap-4">
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
              <div>
                <CardTitle>Accreditation checklist</CardTitle>
                <CardDescription>Mandatory documents must be verified by QA and valid before the supplier can be accredited.</CardDescription>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {canInvite && reuploadItems.length > 0 && (
                  <RequestReuploadDialog action={createResubmissionLink.bind(null, id)} items={reuploadItems} email={supplier.email} />
                )}
                {canUpload && <UploadDocumentDialog action={uploadDocument.bind(null, id)} documentTypes={typeOptions} />}
              </div>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <DocCount tone="green" label="Verified" value={docCounts.verified} />
                <DocCount tone="blue" label="Waiting for QA" value={docCounts.pending} />
                <DocCount tone="red" label="Rejected or expired" value={docCounts.attention} />
                <DocCount tone="gray" label="Not received" value={docCounts.missing} />
              </div>
              {rejectedCount > 0 && (
                <Alert variant="destructive" className="rounded-2xl">
                  <TriangleAlertIcon />
                  <AlertTitle>
                    QA rejected {rejectedCount} {rejectedCount === 1 ? "document" : "documents"}
                  </AlertTitle>
                  <AlertDescription>
                    {canInvite ? "Use Request re-upload to send the supplier a link for just those files." : "Purchasing will ask the supplier for corrected files."}
                  </AlertDescription>
                </Alert>
              )}
              <ul className="divide-y rounded-2xl border">
                {compliance.items.map(({ type, document, state }) => {
                  const days = daysUntil(document?.expiresOn);
                  const soon = days != null && days >= 0 && days <= DOCUMENT_EXPIRY_WARNING_DAYS;
                  return (
                    <li key={type.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <DocStateIcon state={state} />
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-1.5 font-medium">
                            {type.name}
                            {type.isMandatory && <span className="text-muted-foreground text-xs font-normal">· mandatory</span>}
                          </p>
                          <p className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                            {document ? (
                              <a
                                href={`/api/documents/${document.id}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-foreground inline-flex items-center gap-1 hover:underline"
                              >
                                <PaperclipIcon className="size-3" /> {document.fileName}
                              </a>
                            ) : (
                              <span>Not uploaded</span>
                            )}
                            {document && <span>Uploaded {fmtDate(document.createdAt)}</span>}
                            {document?.expiresOn && (
                              <span className={soon || state === "expired" ? "font-medium text-amber-700 dark:text-amber-400" : ""}>
                                {state === "expired" ? "Expired" : "Expires"} {fmtDate(document.expiresOn)}
                                {soon && ` · ${days} days left`}
                              </span>
                            )}
                          </p>
                          {document?.reviewNote && (
                            <p className={state === "rejected" ? "text-destructive mt-1 text-xs" : "text-muted-foreground mt-1 text-xs"}>QA: {document.reviewNote}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 sm:justify-end">
                        {state === "missing" ? <Pill tone="gray">Missing</Pill> : <DocumentStatusBadge status={document!.status} expired={state === "expired"} />}
                        {canVerify && document && document.status === "pending" && state !== "expired" && (
                          <ReviewDocumentDialog action={reviewDocument.bind(null, document.id)} documentName={type.name} />
                        )}
                        {canUpload && (!document || state === "expired" || state === "rejected") && (
                          <UploadDocumentDialog
                            action={uploadDocument.bind(null, id)}
                            documentTypes={typeOptions}
                            defaultTypeId={type.id}
                            triggerLabel={document ? "Replace" : "Upload"}
                            variant="outline"
                          />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
          {docHistory.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Previous versions</CardTitle>
                <CardDescription>Older files kept for the record.</CardDescription>
              </CardHeader>
              <CardContent className="px-0">
                <Table>
                  <TableBody>
                    {docHistory.map(({ doc, typeName }) => (
                      <TableRow key={doc.id}>
                        <TableCell className="pl-6 font-medium">{typeName}</TableCell>
                        <TableCell>
                          <a href={`/api/documents/${doc.id}`} target="_blank" rel="noreferrer" className="text-sm hover:underline">
                            {doc.fileName}
                          </a>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">Uploaded {fmtDate(doc.createdAt)}</TableCell>
                        <TableCell className="pr-6 text-right">
                          <DocumentStatusBadge status={doc.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="evaluations">
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
              <div>
                <CardTitle>Quarterly evaluations</CardTitle>
                <CardDescription>Approved evaluations update the supplier&apos;s status and latest score.</CardDescription>
              </div>
              {can(user.role, "prepareEvaluation") && (
                <Button size="sm" asChild>
                  <Link href={`/evaluations?supplier=${id}`}>
                    <PlusIcon /> Start an evaluation
                  </Link>
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {evals.length === 0 ? (
                <EmptyState title="No evaluations yet" description="Quarterly evaluations start once the supplier is accredited." />
              ) : (
                <ul className="grid gap-2">
                  {evals.map((e) => (
                    <li key={e.id}>
                      <Link href={`/evaluations/${e.id}`} className="hover:bg-muted/60 grid grid-cols-[auto_1fr_auto] items-center gap-4 rounded-2xl border p-3">
                        <ScoreRing score={e.totalScore} classification={e.classification} size={48} stroke={5} />
                        <div className="min-w-0">
                          <p className="font-medium">{quarterLabel(e.year, e.quarter)}</p>
                          <div className="bg-muted mt-2 h-1.5 max-w-md rounded-full">
                            <div className="bg-primary h-1.5 rounded-full" style={{ width: `${e.totalScore ?? 0}%` }} />
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <WorkflowBadge status={e.status} />
                          <ClassificationBadge value={e.classification} />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="actions">
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
              <div>
                <CardTitle>Corrective actions</CardTitle>
                <CardDescription>Opened automatically for any criterion rated below 3, or added by hand.</CardDescription>
              </div>
              {can(user.role, "manageCorrectiveActions") && (
                <Button size="sm" asChild>
                  <Link href={`/corrective-actions/new?supplier=${id}`}>
                    <PlusIcon /> New corrective action
                  </Link>
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {actions.length === 0 ? (
                <EmptyState title="No corrective actions" description="Nothing to fix for this supplier." />
              ) : (
                <ul className="grid gap-2">
                  {actions.map((a) => {
                    const overdue = a.status !== "closed" && a.dueDate < today;
                    return (
                      <li key={a.id}>
                        <Link
                          href={`/corrective-actions/${a.id}`}
                          className={`hover:bg-muted/60 flex flex-col gap-2 rounded-2xl border p-4 sm:flex-row sm:items-center ${overdue ? "border-red-300 dark:border-red-500/40" : ""}`}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-center gap-2 text-sm">
                              <span className="font-mono text-xs font-medium">{a.reference}</span>
                              {a.criterion && <Pill tone="gray">{a.criterion}</Pill>}
                            </p>
                            <p className="mt-1 line-clamp-2 text-sm">{a.issue}</p>
                          </div>
                          <div className="flex items-center gap-3 text-sm sm:flex-col sm:items-end sm:gap-1">
                            <CorrectiveActionBadge status={a.status} overdue={overdue} />
                            <span className="text-muted-foreground text-xs">Due {fmtDate(a.dueDate)}</span>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="grid gap-4">
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
              <div>
                <CardTitle>Requests and replies</CardTitle>
                <CardDescription>
                  Send requests from here: the supplier replies through a link and the reply time is recorded automatically in business hours. This is the
                  basis of the Responsiveness rating.
                </CardDescription>
              </div>
              {canLog && (
                <div className="flex flex-wrap gap-2">
                  {supplier.status !== "inactive" && <SendRequestDialog action={sendRequest.bind(null, id)} email={supplier.email} />}
                  <LogCommunicationDialog action={logCommunication.bind(null, id)} />
                </div>
              )}
            </CardHeader>
            <CardContent>
              {comms.length === 0 ? (
                <EmptyState title="No requests yet" description="Use Send request for quotations, PO and delivery confirmations, and other questions to the supplier." />
              ) : (
                <RequestList rows={comms} holidays={holidaySet} canLog={canLog} />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
              <div>
                <CardTitle>Complaints</CardTitle>
                <CardDescription>Feeds the After-Sales Support rating (complaints resolved by their due date).</CardDescription>
              </div>
              {canLog && <LogComplaintDialog action={logComplaint.bind(null, id)} />}
            </CardHeader>
            <CardContent>
              {complaintRows.length === 0 ? (
                <EmptyState title="No complaints logged" description="Log delivery or quality problems here and resolve them by the agreed date." />
              ) : (
                <ul className="grid gap-2">
                  {complaintRows.map((c) => (
                    <li key={c.id} className="flex flex-col gap-2 rounded-2xl border p-3 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1 text-sm">
                        <p>{c.description}</p>
                        <p className="text-muted-foreground text-xs">
                          Raised {fmtDate(c.raisedOn)} · due {fmtDate(c.dueOn)}
                        </p>
                        {c.resolution && <p className="text-muted-foreground mt-1 text-xs">Resolution: {c.resolution}</p>}
                      </div>
                      {c.status === "resolved" ? (
                        <Pill tone={c.resolvedOn && c.resolvedOn <= c.dueOn ? "green" : "amber"}>
                          Resolved {fmtDate(c.resolvedOn)}
                          {c.resolvedOn && c.resolvedOn > c.dueOn ? " (late)" : ""}
                        </Pill>
                      ) : canLog ? (
                        <ResolveComplaintDialog action={resolveComplaint.bind(null, c.id, id)} />
                      ) : (
                        <Pill tone={c.dueOn < today ? "red" : "amber"}>Open</Pill>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
              <CardDescription>Every change and decision, newest first.</CardDescription>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <EmptyState title="No history yet" />
              ) : (
                <ol className="before:bg-border relative grid gap-5 before:absolute before:top-2 before:bottom-2 before:left-[7px] before:w-px">
                  {history.map(({ e, actorName }, i) => (
                    <li key={e.id} className="relative grid grid-cols-[15px_1fr] gap-4 text-sm">
                      <span
                        aria-hidden
                        className={`border-card mt-1 size-[15px] rounded-full border-[3px] ring-1 ${i === 0 ? "bg-highlight ring-highlight" : "bg-primary ring-primary/40"}`}
                      />
                      <div className="min-w-0">
                        <p>
                          <span className="font-medium">{actorName ?? e.actorLabel ?? "System"}</span>{" "}
                          <span className="text-muted-foreground">{e.action.replaceAll("_", " ")}</span>{" "}
                          <Pill tone="gray" className="ml-1">
                            {e.entityType.replaceAll("_", " ")}
                          </Pill>
                        </p>
                        {e.note && <p className="text-muted-foreground mt-0.5">{e.note}</p>}
                        <p className="text-muted-foreground mt-0.5 text-xs">{fmtDateTime(e.createdAt)}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  sub,
  alert,
  small,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: React.ReactNode;
  alert?: boolean;
  small?: boolean;
}) {
  return (
    <Card className="gap-1 py-5">
      <CardContent className="flex items-start gap-4 px-5">
        <span
          className={`flex size-11 shrink-0 items-center justify-center rounded-full ${alert ? "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300" : "bg-secondary text-primary"}`}
        >
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</p>
          <p className={`mt-0.5 font-semibold tabular-nums ${small ? "text-lg leading-8" : "text-2xl"}`}>{value}</p>
          {sub && <div className={alert && typeof sub === "string" ? "text-sm text-red-700 dark:text-red-400" : "text-muted-foreground text-sm"}>{sub}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function Count({ children, alert }: { children: React.ReactNode; alert?: boolean }) {
  return (
    <span
      className={`min-w-5 rounded-full px-1.5 text-center text-[11px] leading-5 font-semibold tabular-nums ${alert ? "bg-highlight text-highlight-foreground" : "bg-current/15"}`}
    >
      {children}
    </span>
  );
}

function Info({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-start gap-3 ${className ?? ""}`}>
      <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <dt className="text-muted-foreground text-xs">{label}</dt>
        <dd className="text-sm break-words">{value || "—"}</dd>
      </div>
    </div>
  );
}

function Term({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

const COUNT_TONE = {
  green: "text-emerald-700 dark:text-emerald-300",
  blue: "text-blue-700 dark:text-blue-300",
  red: "text-red-700 dark:text-red-300",
  gray: "text-foreground",
} as const;

function DocCount({ tone, label, value }: { tone: keyof typeof COUNT_TONE; label: string; value: number }) {
  return (
    <div className="bg-muted/60 rounded-2xl px-4 py-3">
      <p className={`text-2xl font-semibold tabular-nums ${value ? COUNT_TONE[tone] : "text-muted-foreground"}`}>{value}</p>
      <p className="text-muted-foreground text-xs">{label}</p>
    </div>
  );
}

const DOC_STATE_ICON = {
  verified: { Icon: CheckIcon, cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" },
  pending: { Icon: ClockIcon, cls: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300" },
  rejected: { Icon: XIcon, cls: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300" },
  expired: { Icon: CalendarXIcon, cls: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300" },
  missing: { Icon: CircleDashedIcon, cls: "bg-muted text-muted-foreground" },
} as const;

function DocStateIcon({ state }: { state: keyof typeof DOC_STATE_ICON }) {
  const { Icon, cls } = DOC_STATE_ICON[state];
  return (
    <span className={`flex size-9 shrink-0 items-center justify-center rounded-full ${cls}`}>
      <Icon className="size-4" />
    </span>
  );
}
