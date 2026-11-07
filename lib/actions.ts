import "server-only";
import { z } from "zod";
import { ActionError } from "@/lib/auth";

import type { ActionState } from "@/lib/action-state";

export type { ActionState };

/** Runs a server action body and turns expected errors into a message the form can show. */
export async function runAction(fn: () => Promise<ActionState | void>): Promise<ActionState> {
  try {
    return (await fn()) ?? { ok: true };
  } catch (err) {
    // redirect() and notFound() work by throwing; let them through.
    if (err && typeof err === "object" && "digest" in err && typeof err.digest === "string" && err.digest.startsWith("NEXT_")) {
      throw err;
    }
    if (err instanceof ActionError) return { error: err.message };
    if (err instanceof z.ZodError) {
      return { error: "Please check the highlighted fields.", fieldErrors: z.flattenError(err).fieldErrors as ActionState["fieldErrors"] };
    }
    console.error("[action]", err);
    return { error: "Something went wrong. Please try again." };
  }
}

/** FormData → plain object (empty strings become undefined). Repeated keys become arrays. */
export function formToObject(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, raw] of formData.entries()) {
    if (key.startsWith("$ACTION")) continue;
    const value = typeof raw === "string" ? (raw.trim() === "" ? undefined : raw.trim()) : raw;
    if (key in out) {
      const prev = out[key];
      out[key] = Array.isArray(prev) ? [...prev, value] : [prev, value];
    } else {
      out[key] = value;
    }
  }
  return out;
}

// Common zod helpers for form fields
export const zText = (max = 500) => z.string().max(max).optional();
export const zRequired = (label: string, max = 200) => z.string({ error: `${label} is required.` }).min(1, `${label} is required.`).max(max);
export const zInt = z.coerce.number().int().optional();
export const zNumber = z.coerce.number().optional();
export const zBool = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());
export const zUuid = z.uuid();

/**
 * Parses a <input type="datetime-local"> value ("2026-11-07T14:30") typed in the browser's timezone.
 * `tzOffsetMinutes` is the browser's Date#getTimezoneOffset() (e.g. -480 for Manila, UTC+8).
 */
export function parseLocalDateTime(value: string, tzOffsetMinutes: number): Date {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) {
    throw new z.ZodError([{ code: "custom", path: ["respondedAt"], message: "Enter a valid date and time.", input: value }]);
  }
  const asUtc = new Date(`${value.length === 16 ? `${value}:00` : value}Z`);
  return new Date(asUtc.getTime() + (Number.isFinite(tzOffsetMinutes) ? tzOffsetMinutes : 0) * 60_000);
}
