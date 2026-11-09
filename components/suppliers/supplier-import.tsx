"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { AlertCircleIcon, CheckCircle2Icon, DownloadIcon, FileSpreadsheetIcon, Loader2Icon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { importSuppliers, previewSupplierImport } from "@/app/(app)/suppliers/import/actions";
import { ImportFileError, IMPORT_COLUMNS, MAX_IMPORT_FILE_BYTES, MAX_IMPORT_PAYLOAD_CHARS, MAX_IMPORT_ROWS, readImportSheet, type RawImportRow, type RowResult } from "@/lib/supplier-import";

type Review = { fileName: string; rows: RawImportRow[]; results: RowResult[]; ignoredColumns: string[] };
type Done = { results: RowResult[]; created: { id: string; code: string; name: string }[] };

const STATUS = {
  ready: { label: "Ready", variant: "secondary" },
  duplicate: { label: "Already exists", variant: "outline" },
  invalid: { label: "Needs fixing", variant: "destructive" },
} as const;
const PROBLEMS_FIRST = { invalid: 0, duplicate: 1, ready: 2 };

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

function ResultsTable({ results, caption }: { results: RowResult[]; caption: string }) {
  const sorted = [...results].sort((a, b) => PROBLEMS_FIRST[a.status] - PROBLEMS_FIRST[b.status] || a.rowNumber - b.rowNumber);
  return (
    <div className="max-h-[28rem] overflow-auto rounded-lg border">
      <Table>
        <caption className="sr-only">{caption}</caption>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">Row</TableHead>
            <TableHead>Company</TableHead>
            <TableHead className="w-32">Result</TableHead>
            <TableHead>Details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((row) => (
            <TableRow key={row.rowNumber}>
              <TableCell className="tabular-nums align-top">{row.rowNumber}</TableCell>
              <TableCell className="max-w-64 align-top font-medium whitespace-normal">{row.name || <span className="text-muted-foreground font-normal">No name</span>}</TableCell>
              <TableCell className="align-top">
                <Badge variant={STATUS[row.status].variant}>{STATUS[row.status].label}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground align-top text-sm whitespace-normal">
                {row.messages.map((message) => (
                  <div key={message}>{message}</div>
                ))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function SupplierImport({ categories }: { categories: string[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const startOver = () => {
    setReview(null);
    setDone(null);
    setError(null);
  };

  const readFile = (file: File) => {
    setError(null);
    setReview(null);
    if (!/\.xlsx$/i.test(file.name)) return setError("Choose an Excel .xlsx file. For an older .xls file, open it in Excel and save it as .xlsx first.");
    if (file.size > MAX_IMPORT_FILE_BYTES) return setError("The file is larger than 5 MB.");

    startTransition(async () => {
      try {
        const { readSheet } = await import("read-excel-file/browser");
        const { rows, ignoredColumns } = readImportSheet(await readSheet(file));
        if (JSON.stringify(rows).length > MAX_IMPORT_PAYLOAD_CHARS) return setError("The file has too much text to import at once. Split it into two smaller files.");
        const preview = await previewSupplierImport(rows);
        if ("error" in preview) return setError(preview.error);
        setReview({ fileName: file.name.slice(-200), rows, results: preview.rows, ignoredColumns });
      } catch (err) {
        if (err instanceof ImportFileError) return setError(err.message);
        console.error("[supplier import] could not read file", err);
        setError("This file could not be read. Check that it is a real Excel .xlsx file without a password, then try again.");
      }
    });
  };

  const runImport = () => {
    if (!review) return;
    setError(null);
    startTransition(async () => {
      try {
        const outcome = await importSuppliers(review.rows, review.fileName);
        if ("error" in outcome) return setError(outcome.error);
        setReview(null);
        setDone({ results: outcome.rows, created: outcome.created });
      } catch (err) {
        console.error("[supplier import] failed", err);
        setError("The connection dropped during the import. Check the Suppliers list before trying again.");
      }
    });
  };

  const alert = error && (
    <Alert variant="destructive">
      <AlertCircleIcon />
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  );

  if (done) {
    const left = done.results.filter((r) => r.status !== "ready");
    return (
      <div className="grid gap-4">
        <Alert>
          <CheckCircle2Icon />
          <AlertDescription>
            {done.created.length ? `${plural(done.created.length, "supplier")} registered as Prospects, ${done.created[0].code}${done.created.length > 1 ? ` to ${done.created[done.created.length - 1].code}` : ""}.` : "No suppliers were registered."}
            {left.length > 0 && ` ${plural(left.length, "row")} left out.`}
          </AlertDescription>
        </Alert>
        {left.length > 0 && <ResultsTable results={left} caption="Rows that were left out" />}
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/suppliers">View suppliers</Link>
          </Button>
          <Button variant="outline" onClick={startOver}>
            Import another file
          </Button>
        </div>
      </div>
    );
  }

  if (review) {
    const ready = review.results.filter((r) => r.status === "ready").length;
    const duplicates = review.results.filter((r) => r.status === "duplicate").length;
    const invalid = review.results.filter((r) => r.status === "invalid").length;
    return (
      <div className="grid gap-4">
        {alert}
        <Card>
          <CardHeader>
            <CardTitle className="break-all">{review.fileName}</CardTitle>
            <CardDescription>
              {plural(ready, "supplier")} ready to import
              {duplicates > 0 && `, ${duplicates} already registered`}
              {invalid > 0 && `, ${invalid} to fix`}. Nothing has been saved yet.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {review.ignoredColumns.length > 0 && <p className="text-muted-foreground text-sm">Columns not imported: {review.ignoredColumns.join(", ")}.</p>}
            <ResultsTable results={review.results} caption="What will happen to each row" />
            {ready > 0 && duplicates + invalid > 0 && <p className="text-muted-foreground text-sm">Rows that are not ready will be left out. You can fix them and import the file again; suppliers already imported will be recognised and skipped.</p>}
            <div className="flex flex-wrap gap-2">
              <Button onClick={runImport} disabled={pending || ready === 0}>
                {pending && <Loader2Icon className="animate-spin" />}
                {pending ? "Importing…" : `Import ${plural(ready, "supplier")}`}
              </Button>
              <Button variant="outline" onClick={startOver} disabled={pending}>
                Choose a different file
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {alert}
      <Card>
        <CardHeader>
          <CardTitle>Choose your Excel file</CardTitle>
          <CardDescription>You will see a check of every row before anything is saved. Up to {MAX_IMPORT_ROWS} suppliers per file, on the first sheet of an .xlsx file.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            aria-label="Excel file to import"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) readFile(file);
            }}
          />
          <Button onClick={() => inputRef.current?.click()} disabled={pending}>
            {pending ? <Loader2Icon className="animate-spin" /> : <FileSpreadsheetIcon />}
            {pending ? "Checking the file…" : "Choose file"}
          </Button>
          <Button variant="outline" asChild>
            <a href="/templates/supplier-import-template.xlsx" download>
              <DownloadIcon /> Download template
            </a>
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>What the file should contain</CardTitle>
          <CardDescription>Only Company name is required. Columns can be in any order, and other columns are ignored.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <p>
            <span className="font-medium">Columns: </span>
            {IMPORT_COLUMNS.map((c) => c.label).join(", ")}.
          </p>
          <p>
            <span className="font-medium">Tier: </span>Critical, High spend or Standard. Blank means Standard.
          </p>
          <p>
            <span className="font-medium">Mold ownership: </span>Not applicable, Owned by us, Owned by supplier or Shared ownership. Blank means Not applicable.
          </p>
          <p>
            <span className="font-medium">Single source: </span>Yes or No. Blank means No.
          </p>
          <p>
            <span className="font-medium">Categories: </span>
            {categories.length ? `${categories.join("; ")}. Separate several with a semicolon.` : "None set up yet. An administrator can add them in Settings."}
          </p>
          <p>
            <span className="font-medium">Left out automatically: </span>a row with the same company name, TIN or ERP vendor code as a registered supplier or an earlier row.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
