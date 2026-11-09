import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { documentsBucket } from "@/lib/env";
import { ActionError } from "@/lib/auth";
import { uploadProblem, type UploadRef, type UploadRequest, type UploadTicket, type UploadTicketResult } from "@/lib/upload-rules";

const uploadRequest = z.object({ name: z.string().max(500), size: z.number().int().nonnegative(), type: z.string().max(200) });
const uploadRef = z.object({ path: z.string().max(300), fileName: z.string().min(1).max(200) });
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** Runs the access check for a file and turns expected errors into a message the form can show. */
export async function runUploadTicket(fn: () => Promise<UploadTicket>): Promise<UploadTicketResult> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message };
    console.error("[storage] ticket failed", err);
    return { error: "The file could not be uploaded. Please try again." };
  }
}

/**
 * One-time permission for the browser to send a file straight to the private bucket, because hosting platforms
 * cap the size of a request. Callers must first check that the user or link may upload for this supplier.
 */
export async function createUploadTicket(supplierId: string, request: UploadRequest): Promise<UploadTicket> {
  const file = uploadRequest.parse(request);
  const problem = uploadProblem(file);
  if (problem) throw new ActionError(problem);

  const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
  const path = `${supplierId}/${randomUUID()}.${ext}`;
  const bucket = documentsBucket();
  const { data, error } = await createAdminClient().storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data) {
    console.error("[storage] could not create upload link", error);
    throw new ActionError("The file could not be uploaded. Please try again.");
  }
  return { bucket, path: data.path, token: data.token };
}

/** Reads the reference a form sends in place of a file. Null when the field was left empty. */
export function readUploadRef(formData: FormData, field: string): UploadRef | null {
  const value = formData.get(field);
  if (typeof value !== "string" || !value) return null;
  try {
    return uploadRef.parse(JSON.parse(value));
  } catch {
    return null;
  }
}

/**
 * Confirms a file really is in this supplier's folder and within the rules, using what storage holds
 * rather than what the browser claims. Returns the details to save.
 */
export async function confirmUpload(supplierId: string, ref: UploadRef) {
  if (!new RegExp(`^${supplierId}/${UUID}\\.[a-z0-9]{1,5}$`).test(ref.path)) {
    throw new ActionError("The uploaded file could not be verified. Please upload it again.");
  }
  const { data, error } = await createAdminClient().storage.from(documentsBucket()).info(ref.path);
  if (error || !data) {
    console.error("[storage] uploaded file not found", error);
    throw new ActionError("A file did not finish uploading. Please upload it again.");
  }
  const size = data.size ?? 0;
  const mimeType = data.contentType ?? "";
  const problem = uploadProblem({ size, type: mimeType });
  if (problem) throw new ActionError(problem);
  return { path: ref.path, fileName: ref.fileName, fileSize: size, mimeType };
}

/** Short-lived link to view a private file. */
export async function signedFileUrl(path: string, seconds = 60) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage.from(documentsBucket()).createSignedUrl(path, seconds);
  if (error || !data) throw new Error("Could not create a link to the file.");
  return data.signedUrl;
}
