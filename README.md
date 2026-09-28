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
| AI extraction: vendor, vendor's original bill number, date, line items as JSON | Done — Claude vision (`backend/src/lib/extraction/`); the raw AI reading is kept (§8.2) |
| Review/edit screen with the photo, field and line flags | Done — unclear or low-confidence fields are highlighted, never silently guessed |
| Duplicate-bill warning (same vendor + original bill no. + date) | Done — matches "44-71" and "4471", "Gulf Hardware LLC" and "Gulf Hardware L.L.C." |
| Bills list with search and filters; Home shows bills to review | Done |
| Tests | 41 backend tests, incl. isolation of bills and bill images between organizations |

**Turn on AI reading:** add `ANTHROPIC_API_KEY=...` to `backend/.env` and
restart the backend. Without a key, bills still upload and open for you to
type the details in. For a demo without a key, set `EXTRACTION_PROVIDER=mock`.

## Run the backend

Needs Node.js 22 or newer.

```bash
cd backend
cp .env.example .env        # then set JWT_SECRET to a long random value
npm install
npm test                    # 41 tests
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

## Next: Phase 3 (Weeks 6–8)

Template builder with live preview, Word template upload with placeholder
detection and field mapping, and the merge engine for uploaded templates.
