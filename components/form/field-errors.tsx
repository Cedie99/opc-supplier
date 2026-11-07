"use client";

import { createContext, use } from "react";

export const FieldErrorsContext = createContext<Record<string, string[] | undefined>>({});

/** Error text for one field, read from the nearest ActionForm. */
export function FieldErrorText({ name }: { name: string }) {
  const errors = use(FieldErrorsContext)[name];
  if (!errors?.length) return null;
  return <p className="text-destructive text-sm">{errors[0]}</p>;
}
