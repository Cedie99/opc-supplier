import Link from "next/link";
import { SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/form/fields";

type Option = { value: string; label: string };

/** A plain GET form: filters live in the URL, so lists are shareable and work without client JS. */
export function FilterBar({
  q,
  selects = [],
  placeholder = "Search…",
  resetHref,
}: {
  q?: string;
  selects?: { name: string; value?: string; options: Option[]; allLabel: string }[];
  placeholder?: string;
  resetHref: string;
}) {
  return (
    <form className="mb-4 flex flex-wrap items-center gap-2" method="get">
      <div className="relative min-w-56 flex-1">
        <SearchIcon className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input name="q" defaultValue={q} placeholder={placeholder} className="pl-8" aria-label="Search" />
      </div>
      {selects.map((s) => (
        <NativeSelect key={s.name} name={s.name} defaultValue={s.value ?? ""} className="w-auto" aria-label={s.allLabel}>
          <option value="">{s.allLabel}</option>
          {s.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </NativeSelect>
      ))}
      <Button type="submit" variant="secondary">
        Filter
      </Button>
      <Button variant="ghost" asChild>
        <Link href={resetHref}>Reset</Link>
      </Button>
    </form>
  );
}

export function Pagination({ page, pageSize, total, params, basePath }: { page: number; pageSize: number; total: number; params: Record<string, string | undefined>; basePath: string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const sp = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
    sp.set("page", String(p));
    return `${basePath}?${sp.toString()}`;
  };
  return (
    <div className="text-muted-foreground mt-4 flex items-center justify-between text-sm">
      <span>
        {total === 0 ? "No results" : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`}
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" asChild disabled={page <= 1}>
          {page <= 1 ? <span aria-disabled>Previous</span> : <Link href={href(page - 1)}>Previous</Link>}
        </Button>
        <Button variant="outline" size="sm" asChild disabled={page >= pages}>
          {page >= pages ? <span aria-disabled>Next</span> : <Link href={href(page + 1)}>Next</Link>}
        </Button>
      </div>
    </div>
  );
}

/** Reads a single string search param. */
export function param(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

export function pageParam(sp: Record<string, string | string[] | undefined>) {
  const n = Number(param(sp, "page") ?? 1);
  return Number.isInteger(n) && n > 0 ? n : 1;
}
