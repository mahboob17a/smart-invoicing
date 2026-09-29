# OpsNest Smart Invoicing

Turns vendor bills into your own branded invoices. React Native (Expo) app for
Android and iOS from one codebase, with a Node.js + Express API.

Built against **Design Document v5.1** and **Development Roadmap v1.1**.

## Status — Phase 1: Foundation & Onboarding (Weeks 1–3)

| Roadmap item | State |
| --- | --- |
| Multi-tenant data model, sign-up, login, JWT sessions | Done |
| App shell with navigation (Android + iOS) | Done — tab bar with centre capture button |
| Company Profile (with logo upload), Issuing Identities, Recipients (with client code), Conversion Rules (with decimal places) | Done — create, edit, delete |
| Invoice Numbering (§6.8): Auto/Blank, format, digits, next number, yearly/monthly reset, per-letterhead or shared, live preview | Done |
| Filename pattern (§6.6), default identifies the source bill by `{OriginalBillNo}` | Done |
| Batch report layout (§6.7), first cut | Done |
| 7-step onboarding wizard that resumes at the first unsaved step | Done |
| Every setup form editable later from Settings | Done |
| CI (GitHub Actions): backend tests + Android/iOS bundle check | Done |
| Automated multi-tenant isolation tests | Done — `backend/test/isolation.test.js` |

**Bill-number rule (v5.1 §8.8).** The vendor's original bill number only
identifies the source bill and names the file. Every generated invoice gets
its own number from the Invoice Numbering settings. The allocator
(`backend/src/lib/invoiceNumber.js → allocateNext`) is built and tested now;
Phase 4 calls it when an invoice is generated.

Look and feel follows the UI Design Board choices: **Indigo & Stamp Red**
palette, **IBM Plex Sans**, centre capture tab, light and dark mode
(`mobile/src/theme/theme.js`).

## Status — Phase 2: AI-assisted extraction (Weeks 4–5)

| Roadmap item | State |
| --- | --- |
| Native camera capture, photo library (up to 5 pages) and PDF picker | Done — photos are resized to ~1800 px JPEG on the phone before upload |
| Bill upload and storage, per organization | Done — originals are only served to signed-in users of the same organization |
| AI extraction: vendor, vendor's original bill number, date, line items as JSON | Done — OpenAI or Claude vision (`backend/src/lib/extraction/`); the raw AI reading is kept (§8.2) |
| Review/edit screen with the photo, field and line flags | Done — unclear or low-confidence fields are highlighted, never silently guessed |
| Duplicate-bill warning (same vendor + original bill no. + date) | Done — matches "44-71" and "4471", "Gulf Hardware LLC" and "Gulf Hardware L.L.C." |
| Bills list with search and filters; Home shows bills to review | Done |
| Tests | 46 backend tests, incl. isolation of bills and bill images between organizations |

**Turn on AI reading:** add either `OPENAI_API_KEY=...` or
`ANTHROPIC_API_KEY=...` to `backend/.env`, then run `npm run check-ai` in
`backend` to confirm the key works and see which model will be used. With
OpenAI you don't need to know the model name: the app picks the best vision
model your key can use (set `EXTRACTION_MODEL` to choose one yourself).
Restart the backend after changing `.env`. Without a key, bills still upload
and open for you to type in. For a demo without a key, set
`EXTRACTION_PROVIDER=mock`.

## Status — Phase 3: Invoice templates (Weeks 6–8)

| Roadmap item | State |
| --- | --- |
| Template builder with live preview | Done — title, accent colour, columns, row shading and height, logo and invoice-number position, declaration, signature, supplier reference, footer note; the preview uses your letterhead, a sample client and your next invoice number |
| Word (.docx) template upload with `{{Token}}` detection | Done — item rows are any `{{#items}}…{{/items}}` loop; broken or unclosed tokens give a readable error; example template download |
| Field mapping | Done — suggestions from token names; unmapped tokens can be left as written; warns if an invoice-number token is mapped to the vendor's original bill number |
| Merge engine | Done — fills builder and uploaded templates with the §8.4 invoice math; "Download sample" gives the finished .docx |
| Versioning | Done — uploading a new version keeps mappings for tokens that are still there and flags new ones |
| Tests | 59 backend tests, incl. merge output, versioning and template isolation between organizations |

Open **Settings → Invoice templates** in the app. Phase 4 uses the default
template when an invoice is generated.

## Status — Phase 4: Conversion & generation (Weeks 9–10)

| Roadmap item | State |
| --- | --- |
| Conversion engine wired to either template type | Done — pick client, conversion rule, template (and issuing identity if you have more than one); totals follow §8.4 |
| Invoice number at generation time | Done — taken only when you tap Generate, in the same database transaction as the invoice; previews never use a number; Blank mode assigns none |
| Same number on regenerate / re-download | Done — Regenerate remakes the files from the corrected bill with the same number and date |
| No gaps from failed generations | Done — the template is test-filled before a number is taken; if the files still fail, the invoice keeps its number and can be regenerated |
| PDF + Word output, share sheet / save to phone | Done — LibreOffice makes exact PDFs of every template when installed; without it, builder templates use the built-in PDF renderer and uploaded templates offer the Word file |
| Filenames from the saved pattern | Done — `{OriginalBillNo}` identifies the vendor bill, `{InvoiceNo}` and `{Seq}` where you add them |
| Concurrency tests | Done — 12 conversions at once, a double tap on one bill, and 4 server processes sharing one database: no duplicates, no gaps |
| Tests | 74 backend tests |

Invoiced bills can't be deleted or re-read (invoices are accounting records);
they can still be corrected and regenerated.

**PDFs of uploaded Word templates:** install LibreOffice (free) from
libreoffice.org and restart the backend. The startup message says which PDF
engine is in use.

## Hosting: Render (backend) + Supabase (database and files)

The backend runs on **Render** as a Docker service (with LibreOffice for PDFs);
**Supabase** provides the PostgreSQL database and private file storage. On your
PC nothing changes: `start-backend.bat` runs a local Postgres (PGlite) inside
the backend, with its data in `backend/.pgdata`.

1. **Supabase** (supabase.com): create a project in the same region you will use
   on Render (e.g. Singapore). Keep the database password somewhere safe.
   - Connect → **Session pooler** → copy the connection string (port 5432) and
     put your password in it. This is `DATABASE_URL`.
   - Project Settings → API: copy the **Project URL** (`SUPABASE_URL`) and the
     **service_role / secret key** (`SUPABASE_SERVICE_ROLE_KEY`). This key is
     server-only; never put it in the app or share it.
2. **GitHub**: push this repository (`git push origin main`).
3. **Render** (render.com): New + → **Blueprint** → choose this repository.
   Render reads `render.yaml`, then asks for `DATABASE_URL`, `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY` and optionally `OPENAI_API_KEY`. `JWT_SECRET` is
   generated for you. The first build takes about 10 minutes.
4. Open `https://<your-service>.onrender.com/health` — it should show `{"ok":true,...}`.
   The tables and the storage bucket are created on first start.
5. **Phone**: double-click `start-phone-cloud.bat`, paste the Render address once,
   and scan the QR code in Expo Go. The app reaches your PC through an Expo
   tunnel and the backend over the internet, so Wi-Fi and firewall settings don't matter.

The free Render plan sleeps after 15 minutes without use; the first request then
takes up to a minute. The Starter plan stays awake.

## Run the backend

Needs Node.js 22 or newer.

```bash
cd backend
cp .env.example .env        # then set JWT_SECRET to a long random value
npm install
npm test                    # 46 tests
npm run dev                 # http://localhost:4000
```

SQLite (`backend/dev.db`) for development. Existing databases from Weeks 1–2
are upgraded in place by the migrations in `src/db/index.js`.

## Run the mobile app

Needs Node.js 22 or newer and the **Expo Go** app (SDK 57) on your phone.

```bash
cd mobile
npm install
npx expo start
```

Scan the QR code with Expo Go. On a real phone, `localhost` means the phone,
so point the app at your computer's LAN address:

```bash
# macOS / Linux
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.23:4000 npx expo start
# Windows PowerShell
$env:EXPO_PUBLIC_API_BASE_URL="http://192.168.1.23:4000"; npx expo start
```

`npx expo start --web` opens a quick browser preview on your computer.

## API

| Endpoint | Purpose |
| --- | --- |
| `POST /api/auth/signup`, `POST /api/auth/login` | Create an organisation / sign in |
| `GET /api/me` | Session restore |
| `GET /api/onboarding/status`, `POST /api/onboarding/complete` | Wizard progress |
| `GET/POST /api/company-profile` | §6.1 |
| `/api/issuing-identities` (list, get, create, update, delete) | §6.2 |
| `/api/recipients` (…) | §6.3 |
| `/api/conversion-rules` (…) | §6.4 |
| `GET/POST /api/invoice-numbering`, `PUT /:id`, `GET /:id/preview`, `POST /preview`, `PUT /scope` | §6.8 |
| `GET/PUT /api/filename-patterns`, `POST /preview` | §6.6 |
| `/api/report-templates` (…) | §6.7 |
| `POST /api/uploads/logo` | Logo upload (multipart `file`) |
| `POST /api/bills` (multipart `files`: up to 5 photos or 1 PDF) | Upload a bill; reading starts in the background |
| `GET /api/bills?status=&q=`, `GET /api/bills/summary` | Bills list, Home counts |
| `GET/PUT/DELETE /api/bills/:id`, `POST /api/bills/:id/extract` | Review, save corrections, delete, read again |
| `GET /api/bills/:id/files/:fileId` | Original photo/PDF (signed-in, same organization) |

## Bill scanner with edge detection

**Scan bill** uses the phone's own document scanner (Google ML Kit on Android,
Apple VisionKit on iOS): it finds the bill's edges live, crops and straightens
the page, and handles several pages. It is a native module, so it is **not
available in Expo Go**. In Expo Go the Capture screen shows **Take photo**
instead (on Android you can trim the photo to the bill's edges on the crop
screen).

To get the scanner, install the Smart Invoicing development build once:

1. Create a free account at expo.dev.
2. In `mobile`: `npx eas-cli@latest login`, then
   `npx eas-cli@latest build -p android --profile development`
3. When the build finishes (about 10–20 minutes), open the link on your
   Android phone and install the APK.
4. Start Expo with `npm run start:devclient` (instead of `start-phone-test.bat`)
   and open the project from the installed Smart Invoicing app.

Everything else works the same in Expo Go and in the development build.

## Next: Phase 5 (Weeks 11–12)

Batches: group invoiced bills, track batch status, and generate the batch
summary report from your saved report layout.
