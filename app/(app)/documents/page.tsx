import Link from "next/link";
import { and, asc, eq, isNotNull, lte, or } from "drizzle-orm";
import { addDays, format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { DocumentStatusBadge } from "@/components/status-badge";
import { db } from "@/lib/db";
import { documentTypes, supplierDocuments, suppliers } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { DOCUMENT_EXPIRY_WARNING_DAYS } from "@/lib/constants";
import { daysUntil, fmtDate, todayIso } from "@/lib/format";

export const metadata = { title: "Documents" };

export default async function DocumentsPage() {
  await requireUser();
  const today = todayIso();
  const warnDate = format(addDays(new Date(), DOCUMENT_EXPIRY_WARNING_DAYS), "yyyy-MM-dd");
  const select = {
    id: supplierDocuments.id,
    fileName: supplierDocuments.fileName,
    expiresOn: supplierDocuments.expiresOn,
    status: supplierDocuments.status,
    createdAt: supplierDocuments.createdAt,
    typeName: documentTypes.name,
    isMandatory: documentTypes.isMandatory,
    supplierId: suppliers.id,
    supplierName: suppliers.name,
  };
  const base = () =>
    db
      .select(select)
      .from(supplierDocuments)
      .innerJoin(documentTypes, eq(documentTypes.id, supplierDocuments.documentTypeId))
      .innerJoin(suppliers, eq(suppliers.id, supplierDocuments.supplierId));

  const [expiring, pending] = await Promise.all([
    base()
      .where(and(eq(supplierDocuments.isCurrent, true), isNotNull(supplierDocuments.expiresOn), lte(supplierDocuments.expiresOn, warnDate)))
      .orderBy(asc(supplierDocuments.expiresOn))
      .limit(200),
    base()
      .where(and(eq(supplierDocuments.isCurrent, true), or(eq(supplierDocuments.status, "pending"))))
      .orderBy(asc(supplierDocuments.createdAt))
      .limit(200),
  ]);

  return (
    <>
      <PageHeader title="Documents" description={`Documents waiting for review, and documents expired or expiring within ${DOCUMENT_EXPIRY_WARNING_DAYS} days.`} />
      <div className="grid gap-6">
        <DocTable
          title="Expired or expiring soon"
          description="Ask the supplier for a renewed copy before it expires. An expired mandatory document blocks accreditation."
          rows={expiring}
          today={today}
          empty="No documents expiring in the next 30 days."
          showExpiry
        />
        <DocTable title="Waiting for review" description="Uploaded documents that still need to be verified or rejected." rows={pending} today={today} empty="Nothing waiting for review." />
      </div>
    </>
  );
}

type Row = {
  id: string;
  fileName: string;
  expiresOn: string | null;
  status: "pending" | "verified" | "rejected";
  createdAt: Date;
  typeName: string;
  isMandatory: boolean;
  supplierId: string;
  supplierName: string;
};

function DocTable({ title, description, rows, today, empty, showExpiry }: { title: string; description: string; rows: Row[]; today: string; empty: string; showExpiry?: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        {rows.length === 0 ? (
          <p className="text-muted-foreground px-6 text-sm">{empty}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Supplier</TableHead>
                <TableHead>Document</TableHead>
                <TableHead>{showExpiry ? "Expires" : "Uploaded"}</TableHead>
                <TableHead className="pr-6">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const days = daysUntil(r.expiresOn);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="pl-6">
                      <Link href={`/suppliers/${r.supplierId}?tab=documents`} className="font-medium hover:underline">
                        {r.supplierName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      <a href={`/api/documents/${r.id}`} target="_blank" rel="noreferrer" className="hover:underline">
                        {r.typeName}
                      </a>
                      {r.isMandatory && <span className="text-muted-foreground text-xs"> · mandatory</span>}
                    </TableCell>
                    <TableCell className="text-sm">
                      {showExpiry ? (
                        <>
                          {fmtDate(r.expiresOn)}
                          {days != null && <span className="text-muted-foreground"> ({days < 0 ? `${-days}d ago` : `in ${days}d`})</span>}
                        </>
                      ) : (
                        fmtDate(r.createdAt)
                      )}
                    </TableCell>
                    <TableCell className="pr-6">
                      <DocumentStatusBadge status={r.status} expired={Boolean(r.expiresOn && r.expiresOn < today)} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
