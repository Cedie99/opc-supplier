"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { SupplierStatusBadge } from "@/components/status-badge";
import type { SupplierStatus } from "@/lib/constants";

type Option = { id: string; name: string; code: string; status: SupplierStatus; categoryIds: string[] };

/** Searchable checkbox list of suppliers (name="supplierIds"). Highlights suppliers in the chosen category. */
export function SupplierPicker({ suppliers, categorySelectName = "categoryId" }: { suppliers: Option[]; categorySelectName?: string }) {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const ref = useRef<HTMLDivElement>(null);

  // Follow the category <select> elsewhere in the same form.
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const onChange = (e: Event) => {
      const target = e.target as HTMLSelectElement;
      if (target.name === categorySelectName) setCategory(target.value);
    };
    form.addEventListener("change", onChange);
    return () => form.removeEventListener("change", onChange);
  }, [categorySelectName]);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return suppliers
      .filter((s) => !term || s.name.toLowerCase().includes(term) || s.code.toLowerCase().includes(term))
      .sort((a, b) => Number(b.categoryIds.includes(category)) - Number(a.categoryIds.includes(category)) || a.name.localeCompare(b.name));
  }, [suppliers, q, category]);

  return (
    <div ref={ref} className="grid gap-2">
      <Input placeholder="Search suppliers…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search suppliers" />
      {/* Hidden inputs keep selections that the search filter currently hides. */}
      {[...checked].map((id) => (
        <input key={id} type="hidden" name="supplierIds" value={id} />
      ))}
      <p className="text-muted-foreground text-xs">{checked.size} selected. Suppliers in the chosen category are listed first.</p>
      <div className="max-h-72 overflow-y-auto rounded-lg border">
        {visible.length === 0 && <p className="text-muted-foreground p-3 text-sm">No suppliers match.</p>}
        {visible.map((s) => (
          <label key={s.id} className="hover:bg-muted/50 flex items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0">
            <input
              type="checkbox"
              className="accent-primary size-4"
              checked={checked.has(s.id)}
              onChange={(e) =>
                setChecked((prev) => {
                  const next = new Set(prev);
                  if (e.target.checked) next.add(s.id);
                  else next.delete(s.id);
                  return next;
                })
              }
            />
            <span className="flex-1">
              <span className="font-medium">{s.name}</span> <span className="text-muted-foreground text-xs">{s.code}</span>
              {category && s.categoryIds.includes(category) && <span className="text-primary text-xs"> · in category</span>}
            </span>
            <SupplierStatusBadge status={s.status} />
          </label>
        ))}
      </div>
    </div>
  );
}
