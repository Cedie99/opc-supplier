# OPC Supplier Accreditation System

Internal web system for **Oracle Petroleum — Pillar 2, Priority 1: Supplier Accreditation and Evaluation Program**.

It replaces the Word/Excel *Supplier Selection Matrix* with one place to register suppliers, verify their documents, compare them during canvassing, score them every quarter, measure their responsiveness, and follow up on corrective actions. It applies to **new suppliers** (Selection Matrix) and **existing suppliers** (Quarterly Performance Evaluation).

---

## Contents

1. [Why this system](#why-this-system)
2. [Workflow at a glance](#workflow-at-a-glance)
3. [Modules](#modules)
4. [Roles and who fills what](#roles-and-who-fills-what)
5. [Scoring rules](#scoring-rules)
6. [Measuring responsiveness](#measuring-responsiveness)
7. [Supplier statuses](#supplier-statuses)
8. [Tech stack and security](#tech-stack-and-security)
9. [Setup](#setup)
10. [Email and the reminder job](#email-and-the-reminder-job)
11. [Deployment](#deployment)
12. [Scripts](#scripts)
13. [Project structure](#project-structure)
14. [Troubleshooting](#troubleshooting)
15. [Open decisions and roadmap](#open-decisions-and-roadmap)

---

## Why this system

The source document identified these problems:

| Problem | Root cause | How the system addresses it |
| --- | --- | --- |
| Decisions based on lowest price | No standardized selection matrix | Weighted Selection Matrix: price is only 20% |
| Poor-quality materials | No quality standards | QA rates samples on specs passed ÷ specs tested; a critical spec failure blocks the supplier |
| Delayed deliveries | No lead-time monitoring | On-time in-full rate rated every quarter by Warehouse |
| Same suppliers every time | No canvassing or benchmarking | Canvass compares 2–3+ suppliers side by side |
| Dependence on one bottle supplier | No alternative sourcing | Sole-source and mold-ownership flags; dashboard lists critical categories with no alternative |
| Recurring supplier issues | No corrective action system | A corrective action opens automatically for any criterion rated below 3 |
| No performance records | No evaluation system | Full history per supplier: documents, scores, requests, actions, audit trail |

---

## Workflow at a glance

```
 NEW SUPPLIER                                   EXISTING SUPPLIER
 ────────────                                   ─────────────────
 1. Buyer adds supplier / sends registration    1. Buyer generates quarterly drafts
    link → supplier uploads documents           2. QA rates Product Quality
 2. QA verifies documents                       3. Warehouse rates On-Time Delivery
    (rejected → buyer sends a re-upload link    4. Buyer rates price, documentation and
     for only those documents)                     after-sales; Responsiveness is filled
 3. Buyer opens a canvass (Selection Matrix)       from request reply times
    and adds 2–3+ suppliers                     5. Buyer submits → Purchasing Manager
 4. Buyer enters price, payment terms,             approves
    delivery, responsiveness, credibility       6. Score updates supplier status;
 5. QA enters specs passed/tested and the          criteria below 3 open corrective actions
    critical-spec flag
 6. Buyer recommends one → submits
 7. Purchasing Manager approves → the chosen
    supplier becomes accredited
                  │                                         │
                  └──────────────► Masterlist ◄─────────────┘
                     (status, score, documents, history)
```

All through the year, buyers send **supplier requests** (quotations, PO and delivery confirmations, inquiries). Reply times feed the Responsiveness rating.

---

## Modules

| Module | Purpose |
| --- | --- |
| **Dashboard** | Accredited suppliers, evaluation progress, overdue corrective actions, expiring documents, critical categories without an alternative supplier, lowest scorers |
| **Suppliers** (Accredited Supplier Masterlist) | Status, tier, materials supplied, sole-source and mold-ownership flags, latest score. Each supplier page has tabs: Overview, Documents, Evaluations, Corrective actions, Activity log, History |
| **Documents** (Accreditation Checklist) | Upload, verify or reject documents; expiry tracking. Missing, rejected or expired mandatory documents **block accreditation** |
| **Registration link** | 14-day link (emailed automatically) for a supplier to fill in its details and upload its documents |
| **Re-upload link** | Link limited to the supplier's rejected, expired or missing documents. It shows QA's rejection reasons |
| **Selection Matrix** (canvass) | Compare suppliers side by side: scorecards, a heat-map comparison table, a recommendation with a reason. Price is compared with the lowest *qualified* landed cost |
| **Quarterly evaluations** | Drafts for every critical and high-spend supplier each quarter (standard tier in Q4). Logged response times and complaints are offered as inputs |
| **Corrective actions** | Root cause, action plan, owner, due date, verification and closure |
| **Supplier requests** | Requests the supplier answers through a link; reply times are recorded automatically |
| **Notifications** | Bell in the header for replies, no-responses and other events |
| **Email outbox** | Every email sent or waiting, with a preview. Waiting emails can be sent with one click once SMTP is configured |
| **Settings** | Versioned scoring templates (weights, thresholds, bands; per material category if needed), categories, document types, holidays, users and roles |

---

## Roles and who fills what

| Role | Responsibilities |
| --- | --- |
| **Buyer (Purchasing)** | Adds suppliers, sends registration, re-upload and request links, prepares and submits canvasses and evaluations, fills in the purchasing criteria |
| **QA Officer** | Verifies supplier documents; rates Product Quality (specs passed / specs tested) and the critical-spec flag; manages corrective actions |
| **Warehouse** | Rates On-Time Delivery in quarterly evaluations; logs activity |
| **Purchasing Manager** | Approves or rejects canvasses and evaluations; can do everything a buyer can |
| **Administrator** | Everything, including settings and users; backup document verifier |
| **Management** | View only |

**Field ownership.** Each criterion belongs to one role. Fields owned by another role are shown with a lock and a *Filled by …* tag. The server also discards any value a user sends for a field they don't own.

| Criterion | Selection Matrix | Quarterly evaluation |
| --- | --- | --- |
| Product Quality, critical-spec flag | QA | QA |
| On-Time Delivery | Purchasing | Warehouse |
| Price, payment terms, responsiveness, credibility, documentation, after-sales | Purchasing | Purchasing |

Ownership is set per criterion in the scoring template (`filledBy`). A preparer cannot approve their own canvass or evaluation; administrators are the exception.

Permissions are defined in `lib/permissions.ts`, and every server action checks one before touching data.

---

## Scoring rules

These come from the *Supplier Selection Matrix* document.

### Selection Matrix (new suppliers)

| Criterion | Weight | Metric | 5 = Excellent | 1 = Poor |
| --- | --- | --- | --- | --- |
| Price Competitiveness | 20% | % above the lowest qualified landed cost | 0–2% | >15% |
| Product Quality | 30% | Specs passed ÷ specs tested | 99–100% | <90% |
| Delivery Reliability | 20% | On-time in-full rate | 98–100% | <80% |
| Payment Terms | 10% | Credit days | 60+ days | <15 days / COD |
| Responsiveness | 10% | Average business hours to first reply | ≤2 h | >24 h |
| Company Credibility | 10% | Documents, years in business, references | Complete, 10+ yrs, strong refs | Invalid mandatory docs |

### Quarterly evaluation (existing suppliers)

| Criterion | Weight | Metric | 5 = Excellent | 1 = Poor |
| --- | --- | --- | --- | --- |
| Product Quality | 30% | Sample compliance rate | 100% | <80% |
| On-Time Delivery | 25% | On-time in-full rate | 98–100% | <80% |
| Price Competitiveness | 15% | % above lowest qualified price | 0–2% | >15% |
| Responsiveness | 15% | Average business hours to first reply | ≤2 h | >24 h |
| Documentation Compliance | 10% | Compliant ÷ required documents | 100% | <80% |
| After-Sales Support | 5% | Complaint resolution rate (N/A allowed) | 100% | <70% |

### How a score is calculated

- The raw value of each criterion is converted to a 1–5 rating using its threshold table.
- Weighted points = rating ÷ 5 × weight. The total is out of 100.
- **90+ Preferred · 80+ Approved · 70+ Conditional · below 70 Not Qualified / Needs Reassessment.**
- A criterion marked **N/A** (for example, no complaints were due) is removed and the remaining weights are scaled back to 100%. A perfect score is never assumed.
- **Blocking rules:** a failed critical specification, or unverified mandatory documents, mean *Not Qualified* regardless of score.
- Overriding a calculated rating requires a written reason.
- The server always re-scores; the browser preview is never trusted.
- Templates are versioned. Editing one creates a new version, and existing evaluations keep the rules they were scored with.

The scoring engine lives in `lib/scoring/` and has unit tests.

---

## Measuring responsiveness

Responsiveness is measured from real reply times, not estimated.

1. A buyer opens a supplier → **Activity log** → **Send request**, and chooses a type: quotation, PO confirmation, delivery date confirmation, urgent request, complaint follow-up or general inquiry.
2. The system emails the supplier a unique link, and the clock starts.
3. The supplier replies **through the link** with a short form for that type. For example, a quotation reply has unit price, lead time, validity and a file. Empty replies are refused.
4. The reply time is counted in **business hours**: Mon–Fri, 08:00–17:00 Philippine time, excluding the holidays in Settings.
5. The buyer is notified in the app and by email.
6. After **1 business day** without a reply, the supplier gets one automatic reminder.
7. After **3 business days** without a reply, the request is marked **No response** and counts at the 27-hour limit (rating 1). It is never simply ignored. A late reply is still recorded.
8. In the quarterly evaluation, **Use logged data** fills in the average reply time. It notes how many requests got no response, were recorded by hand or are still waiting, and warns when there are fewer than 3 requests.

Withdrawn requests don't count. Replies received by phone or chat can be recorded with **Replied elsewhere**; these are labelled as manual.

The rules are in `lib/business-hours.ts` and `lib/request-timing.ts`, and both have tests. The values (hours, limits, link validity) are in `lib/constants.ts`.

---

## Supplier statuses

| Status | Meaning |
| --- | --- |
| Prospect | Added; not yet evaluated |
| Under review | Being canvassed or awaiting document verification |
| Preferred | 90+; prioritize for regular purchasing |
| Approved | 80–89.99; qualified for regular transactions |
| Conditional | 70–79.99; corrective action and monitoring required |
| Not qualified | Below 70, or blocked by documents or a critical spec failure |
| Inactive | No longer used |

| Tier | Evaluated |
| --- | --- |
| Critical | Quarterly |
| High spend | Quarterly |
| Standard | Yearly (Q4) or when an issue comes up |

---

## Tech stack and security

- **Next.js 16** (App Router, Server Actions, `proxy.ts`), **React 19**, **TypeScript**
- **Tailwind CSS 4** + **shadcn/ui**, DM Sans font
- **Supabase**: Postgres, Auth, Storage
- **Drizzle ORM** (postgres.js) with SQL migrations in `drizzle/`
- **Zod** for validation, **Nodemailer** for SMTP, **Vitest** for tests

**Security model**

- The browser never talks to the database. All reads and writes happen on the server, behind a role check in every server action.
- Row Level Security is switched **on with no policies** for every table, so Supabase's public REST API exposes nothing, even with the anon key.
- Supplier files live in a **private** storage bucket and are opened through short-lived signed links after a session check.
- Public supplier pages (`/register/[token]`, `/respond/[token]`) work only with an unguessable, expiring token and can only touch that one supplier or request.
- The cron endpoint requires `Authorization: Bearer <CRON_SECRET>` and is disabled when the secret isn't set.
- Secrets live only in `.env.local`, which is git-ignored.

---

## Setup

**Requirements:** Node.js 20+, npm, and a Supabase project.

### 1. Supabase project

Create a project at [supabase.com](https://supabase.com). From **Project Settings**, collect:

- **API:** the Project URL, the `anon` key and the `service_role` key
- **Database → Connection string:** the *Transaction pooler* URI (port 6543) and the *Session pooler* or direct URI (port 5432)

### 2. Environment

```bash
cp .env.example .env.local
```

Fill in every value in `.env.local`:

| Variable | What it is |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project URL and anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only admin key (user management, storage) |
| `DATABASE_URL` | Transaction pooler URI (port 6543), used by the app |
| `DIRECT_URL` | Session pooler or direct URI (port 5432), used by migrations |
| `SUPABASE_DOCUMENTS_BUCKET` | Private bucket name (default `supplier-documents`) |
| `NEXT_PUBLIC_APP_URL` | Public address of the app, used in links sent to suppliers |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME` | First administrator, created by `npm run setup` |
| `SMTP_*` | Outgoing email (optional; see below) |
| `CRON_SECRET` | Secret for the hourly reminder job (optional) |

Never commit `.env.local`.

### 3. Install, migrate, seed

```bash
npm install
```

```bash
npm run db:migrate
```

```bash
npm run setup
```

- `db:migrate` creates the tables and turns on RLS.
- `setup` creates the private storage bucket, material categories, document types, the two default scoring templates and the administrator account.

Both are safe to run again.

### 4. Run

```bash
npm run dev
```

Open http://localhost:3000 and sign in as the administrator. Then:

1. **Settings → Users:** add Purchasing, QA, Warehouse and Purchasing Manager accounts.
2. **Settings → Categories & documents:** adjust categories, mark which are critical and which documents are mandatory, and add holidays.
3. **Settings → Scoring templates:** confirm weights and thresholds with management.
4. **Suppliers:** register existing suppliers (or send them registration links). Then upload and verify their documents.

---

## Email and the reminder job

**Email is optional at first.** Without `SMTP_HOST`, the system still works: every email is kept on the **Email outbox** page instead of being sent, and supplier links can be copied from the dialogs.

To send real emails, ask IT for a mailbox with SMTP access, fill in the values below in `.env.local`, then restart the app:

```
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=purchasing@yourcompany.com
SMTP_PASSWORD=...
SMTP_FROM=Company Purchasing <purchasing@yourcompany.com>
```

- **Microsoft 365:** `smtp.office365.com`, port 587. IT must enable *Authenticated SMTP* for the mailbox.
- **Google Workspace:** `smtp.gmail.com`, port 587, with an app password (or the Workspace SMTP relay).

Emails already waiting in the Outbox can then be sent with one click.

**Reminder job.** Reminders and the 3-day *no response* marking run automatically whenever staff use the app, at most every 10 minutes. To run them even when nobody is signed in, set `CRON_SECRET` and call this endpoint every hour:

```
GET /api/cron/requests
Authorization: Bearer <CRON_SECRET>
```

Any scheduler works: Vercel Cron, Supabase `pg_cron` + `pg_net`, or Windows Task Scheduler.

---

## Deployment

The app is a standard Next.js server.

1. Build and start it:

   ```bash
   npm run build
   ```

   ```bash
   npm start
   ```

2. Or deploy to any Node host (Vercel, a VM, Docker) and set the same environment variables there.
3. Set `NEXT_PUBLIC_APP_URL` to the public address, so links in supplier emails point to the right place.
4. Suppliers must be able to reach `/register/*` and `/respond/*`. The rest of the app requires sign-in.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm test` | Unit tests (scoring engine, field ownership, business hours, request timing) |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm run db:generate` | New migration after editing `lib/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run db:studio` | Browse the database |
| `npm run setup` | Bucket, reference data, templates, admin account |

---

## Project structure

```
app/
  (auth)/login             Sign in
  (app)/                   Signed-in area (sidebar layout)
    dashboard/
    suppliers/             Masterlist, supplier detail tabs, edit, server actions
    canvass/               Selection Matrix
    evaluations/           Quarterly evaluations
    corrective-actions/
    documents/             Expiring and pending documents
    requests/              Supplier requests overview and actions
    outbox/                Every email sent or waiting
    settings/              Templates, categories & documents, holidays, users
  register/[token]/        Public registration and re-upload page
  respond/[token]/         Public reply page for supplier requests
  api/documents/[id]       Signed-link redirect for private files
  api/requests/[id]/file   Attachment of a request reply
  api/cron/requests        Hourly reminders / no-response job
components/                UI (shadcn/ui primitives in components/ui)
lib/
  scoring/                 Scoring engine, canvass scoring, default templates, field ownership, tests
  db/                      Drizzle schema and client
  auth.ts, permissions.ts  Session and role checks
  accreditation.ts         Document checklist and blocking rules
  business-hours.ts        Working-hour calculation (tested)
  request-timing.ts        How a request counts towards Responsiveness (tested)
  requests.ts              Request emails, reminders, no-response sweep
  email.ts                 SMTP sending with Outbox fallback
  email-templates.ts       Branded HTML email layout
drizzle/                   SQL migrations
scripts/seed.ts            Setup script
proxy.ts                   Auth gate; public paths are /login, /register, /respond, /setup, /api/cron
```

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Sign-in is slow or a page shows "statement timeout" | A stuck pooler connection; reload. Make sure `DATABASE_URL` uses the transaction pooler (port 6543). |
| Links in emails point to `localhost` | Set `NEXT_PUBLIC_APP_URL` to the real address and restart. |
| Emails stay in the Outbox as *Not configured* | Set `SMTP_HOST` and `SMTP_FROM` (and user/password), restart, then press **Send** in the Outbox. |
| Microsoft 365 rejects SMTP login | IT must enable *Authenticated SMTP* for that mailbox. |
| `/api/cron/requests` returns 503 | `CRON_SECRET` isn't set. |
| A field is locked | Another role owns it (see [field ownership](#roles-and-who-fills-what)). |
| Supplier can't be accredited | Check the Documents tab for missing, rejected or expired mandatory documents, and the QA critical-spec flag. |

---

## Open decisions and roadmap

**To confirm with management.** The source document is inconsistent on these points. All of them can be changed in **Settings → Scoring templates** without code changes.

- Selection Matrix weights: the detailed table (Price 20%, Quality 30%) is used, not the sample matrix (25% / 25%).
- Quality thresholds differ between new (99/97/95/90) and existing suppliers (100/95/90/80), as in the document.
- Quarterly quality is rated on supplier samples, as the document says.
- Who verifies legal documents (QA or Purchasing), and who gives final approval.

**Next phases**

- **Bulk import** of existing suppliers from Excel/CSV.
- **ERP data link:** import purchase orders, goods receipts and QA inspection results, so delivery and quality fill automatically.
- **Status sync to ERP:** warn or block purchase orders to non-accredited suppliers.
- **More email notifications:** approvals waiting, documents expiring, corrective actions due.
