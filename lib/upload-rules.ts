/** Rules for supplier files, shared by the browser and the server. */

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

export type UploadRequest = { name: string; size: number; type: string };
export type UploadTicket = { bucket: string; path: string; token: string };
export type UploadTicketResult = UploadTicket | { error: string };
/** What the form sends to the server action in place of the file itself. */
export type UploadRef = { path: string; fileName: string };

/** The reason a file is not accepted, or null when it is fine. */
export function uploadProblem(file: Pick<UploadRequest, "size" | "type">): string | null {
  if (file.size === 0) return "Choose a file to upload.";
  if (file.size > MAX_UPLOAD_BYTES) return "The file is larger than 10 MB.";
  if (!ALLOWED_MIME.includes(file.type)) return "Only PDF, JPG, PNG or WEBP files are accepted.";
  return null;
}
