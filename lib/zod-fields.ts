import { z } from "zod";

// Common zod helpers for form fields. Safe to import from client and server code.
export const zText = (max = 500) => z.string().max(max).optional();
export const zRequired = (label: string, max = 200) => z.string({ error: `${label} is required.` }).min(1, `${label} is required.`).max(max);
export const zInt = z.coerce.number().int().optional();
export const zNumber = z.coerce.number().optional();
export const zBool = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());
export const zUuid = z.uuid();
