import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { documentsBucket } from "@/lib/env";
import { ActionError } from "@/lib/auth";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

/** Validates and uploads a supplier document to the private bucket. Returns its storage path. */
export async function uploadSupplierFile(supplierId: string, file: File) {
  if (!file || file.size === 0) throw new ActionError("Choose a file to upload.");
  if (file.size > MAX_UPLOAD_BYTES) throw new ActionError("The file is larger than 10 MB.");
  if (!ALLOWED_MIME.includes(file.type)) throw new ActionError("Only PDF, JPG, PNG or WEBP files are accepted.");

  const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
  const path = `${supplierId}/${randomUUID()}.${ext}`;
  const supabase = createAdminClient();
  const { error } = await supabase.storage.from(documentsBucket()).upload(path, file, { contentType: file.type, upsert: false });
  if (error) {
    console.error("[storage] upload failed", error);
    throw new ActionError("The file could not be uploaded. Please try again.");
  }
  return { path, fileName: file.name.slice(0, 200), fileSize: file.size, mimeType: file.type };
}

/** Short-lived link to view a private file. */
export async function signedFileUrl(path: string, seconds = 60) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage.from(documentsBucket()).createSignedUrl(path, seconds);
  if (error || !data) throw new Error("Could not create a link to the file.");
  return data.signedUrl;
}
