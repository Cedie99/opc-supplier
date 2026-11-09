import { describe, expect, it, vi } from "vitest";
import { UploadFailure, uploadFormFiles, type UploadCache } from "./direct-upload";
import { MAX_UPLOAD_BYTES, uploadProblem } from "./upload-rules";

const pdf = (name = "permit.pdf", size = 6 * 1024 * 1024) => new File([new Uint8Array(size)], name, { type: "application/pdf", lastModified: 1 });
const ticket = { bucket: "docs", path: "supplier/file.pdf", token: "t" };

describe("uploadProblem", () => {
  it("accepts a file up to the limit", () => {
    expect(uploadProblem({ size: MAX_UPLOAD_BYTES, type: "application/pdf" })).toBeNull();
  });
  it("refuses empty, oversized and unsupported files", () => {
    expect(uploadProblem({ size: 0, type: "application/pdf" })).toMatch(/Choose/);
    expect(uploadProblem({ size: MAX_UPLOAD_BYTES + 1, type: "application/pdf" })).toMatch(/10 MB/);
    expect(uploadProblem({ size: 10, type: "text/html" })).toMatch(/Only PDF/);
  });
});

describe("uploadFormFiles", () => {
  it("replaces each file with a reference, so no file reaches the server action", async () => {
    const fd = new FormData();
    fd.set("name", "Acme");
    fd.set("doc:a", pdf());
    const send = vi.fn().mockResolvedValue(undefined);
    await uploadFormFiles(fd, async () => ticket, send, new Map());
    expect(send).toHaveBeenCalledOnce();
    expect(fd.get("name")).toBe("Acme");
    expect(JSON.parse(fd.get("doc:a") as string)).toEqual({ path: ticket.path, fileName: "permit.pdf" });
    expect([...fd.values()].some((v) => v instanceof File)).toBe(false);
  });

  it("drops inputs left empty", async () => {
    const fd = new FormData();
    fd.set("doc:a", new File([], "", { type: "application/octet-stream" }));
    await uploadFormFiles(fd, async () => ticket, vi.fn(), new Map());
    expect(fd.has("doc:a")).toBe(false);
  });

  it("does not upload the same file twice when the form is resubmitted", async () => {
    const cache: UploadCache = new Map();
    const send = vi.fn().mockResolvedValue(undefined);
    const requestUpload = vi.fn().mockResolvedValue(ticket);
    for (let i = 0; i < 2; i++) {
      const fd = new FormData();
      fd.set("doc:a", pdf());
      await uploadFormFiles(fd, requestUpload, send, cache);
      expect(fd.get("doc:a")).toContain(ticket.path);
    }
    expect(requestUpload).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledOnce();
  });

  it("reports which field failed, without contacting storage for a refused file", async () => {
    const fd = new FormData();
    fd.set("doc:a", new File(["x"], "virus.exe", { type: "application/x-msdownload" }));
    const requestUpload = vi.fn();
    await expect(uploadFormFiles(fd, requestUpload, vi.fn(), new Map())).rejects.toMatchObject({ field: "doc:a" });
    expect(requestUpload).not.toHaveBeenCalled();
  });

  it("surfaces a server refusal and a failed transfer", async () => {
    const refused = new FormData();
    refused.set("doc:a", pdf());
    await expect(uploadFormFiles(refused, async () => ({ error: "Link expired." }), vi.fn(), new Map())).rejects.toThrow("Link expired.");

    const failed = new FormData();
    failed.set("doc:a", pdf());
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(uploadFormFiles(failed, async () => ticket, vi.fn().mockRejectedValue(new Error("offline")), new Map())).rejects.toBeInstanceOf(UploadFailure);
    spy.mockRestore();
  });
});
