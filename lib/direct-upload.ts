import { uploadProblem, type UploadRef, type UploadRequest, type UploadTicket, type UploadTicketResult } from "@/lib/upload-rules";

/** A file that could not be sent. `field` is the form input it belongs to. */
export class UploadFailure extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
  }
}

export type RequestUpload = (file: UploadRequest) => Promise<UploadTicketResult>;
export type SendFile = (ticket: UploadTicket, file: File) => Promise<void>;

/** Remembers finished uploads, so fixing a validation error does not upload the same files again. */
export type UploadCache = Map<string, UploadRef>;

/** Sends a file straight to Supabase Storage. The client is loaded only when a form actually uploads. */
export const sendToStorage =
  (url: string, anonKey: string): SendFile =>
  async (ticket, file) => {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await supabase.storage.from(ticket.bucket).uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type });
    if (error) throw error;
  };

/**
 * Hosting platforms cap the size of a request, so files must not travel through a server action.
 * Each chosen file goes directly to storage, one at a time, and the form data keeps only a reference to it.
 */
export async function uploadFormFiles(formData: FormData, requestUpload: RequestUpload, send: SendFile, cache: UploadCache) {
  for (const [field, value] of [...formData.entries()]) {
    if (!(value instanceof File)) continue;
    if (value.size === 0) {
      formData.delete(field); // An input left empty.
      continue;
    }
    const problem = uploadProblem(value);
    if (problem) throw new UploadFailure(field, problem);

    const key = [field, value.name, value.size, value.lastModified, value.type].join("|");
    let ref = cache.get(key);
    if (!ref) {
      const ticket = await requestUpload({ name: value.name, size: value.size, type: value.type });
      if ("error" in ticket) throw new UploadFailure(field, ticket.error);
      try {
        await send(ticket, value);
      } catch (err) {
        console.error("[upload] failed", err);
        throw new UploadFailure(field, `${value.name} could not be uploaded. Check your connection and try again.`);
      }
      ref = { path: ticket.path, fileName: value.name.slice(0, 200) };
      cache.set(key, ref);
    }
    formData.set(field, JSON.stringify(ref));
  }
}
