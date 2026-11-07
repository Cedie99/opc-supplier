import "server-only";

/** Branded, table-based HTML emails (renders in Outlook and Gmail). All dynamic text is escaped. */

const GREEN = "#0E3B24";
const ACCENT = "#1E8C4B";
const YELLOW = "#F2CC0F";

export function esc(value: string | null | undefined) {
  return (value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type Layout = {
  preheader: string;
  heading: string;
  /** Paragraphs of plain text (escaped). */
  paragraphs: string[];
  /** Optional block of labelled details. */
  details?: { label: string; value: string }[];
  /** Optional quoted message (escaped, line breaks kept). */
  quote?: string | null;
  button?: { label: string; url: string };
  footnote?: string;
};

export function renderEmail(l: Layout): { html: string; text: string } {
  const p = l.paragraphs.map((x) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#1f2a24">${esc(x)}</p>`).join("");
  const details = l.details?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:6px 0 18px;border-collapse:collapse">${l.details
        .map(
          (d) =>
            `<tr><td style="padding:6px 12px 6px 0;font-size:13px;color:#5b6b62;white-space:nowrap;vertical-align:top">${esc(d.label)}</td><td style="padding:6px 0;font-size:14px;color:#1f2a24">${esc(d.value)}</td></tr>`,
        )
        .join("")}</table>`
    : "";
  const quote = l.quote
    ? `<div style="margin:4px 0 18px;padding:12px 14px;border-left:3px solid ${ACCENT};background:#f3f7f4;font-size:14px;line-height:1.55;color:#1f2a24">${esc(l.quote).replace(/\n/g, "<br>")}</div>`
    : "";
  const button = l.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 18px"><tr><td style="border-radius:999px;background:${YELLOW}"><a href="${esc(l.button.url)}" style="display:inline-block;padding:12px 26px;font-size:15px;font-weight:600;color:${GREEN};text-decoration:none;border-radius:999px">${esc(l.button.label)}</a></td></tr></table><p style="margin:0 0 14px;font-size:12px;color:#5b6b62">Or copy this link: <span style="word-break:break-all">${esc(l.button.url)}</span></p>`
    : "";
  const foot = l.footnote ? `<p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#5b6b62">${esc(l.footnote)}</p>` : "";

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#eef2ef;font-family:'DM Sans',Segoe UI,Arial,sans-serif">
<span style="display:none;max-height:0;overflow:hidden">${esc(l.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2ef;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden">
<tr><td style="background:${GREEN};padding:20px 28px;color:#ffffff;font-size:16px;font-weight:600">Oracle Petroleum · Supplier Accreditation</td></tr>
<tr><td style="height:4px;background:${YELLOW};font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:${GREEN}">${esc(l.heading)}</h1>
${p}${details}${quote}${button}${foot}
</td></tr></table>
<p style="margin:14px 0 0;font-size:11px;color:#7a877f">This message was sent by Oracle Petroleum's supplier accreditation system.</p>
</td></tr></table></body></html>`;

  const text = [
    l.heading,
    "",
    ...l.paragraphs,
    ...(l.details?.length ? ["", ...l.details.map((d) => `${d.label}: ${d.value}`)] : []),
    ...(l.quote ? ["", l.quote] : []),
    ...(l.button ? ["", `${l.button.label}: ${l.button.url}`] : []),
    ...(l.footnote ? ["", l.footnote] : []),
  ].join("\n");
  return { html, text };
}
