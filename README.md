# OpsNest Smart Invoicing

React Native app (Android + iOS) and Node.js API, built phase by phase from
the development roadmap. Phases 1 and 2 are in place.

## Phase 2: AI-Assisted Extraction (Weeks 4–5)

**Exit criterion:** a user can photograph a real bill on their phone and
reach a corrected, save-ready draft within the app.

| Roadmap item | Where |
|---|---|
| Native camera, photo library, and file (PDF) picker | `mobile/src/bills/capture.js`, `mobile/src/components/AddBillButtons.js` |
| Image upload endpoint + organization-namespaced storage | `backend/src/routes/bills.js`, `backend/src/storage.js` |
| Vision AI extraction → vendor, date, bill no., line items as JSON | `backend/src/extraction/claudeExtractor.js` (Claude, structured outputs) |
| Review/edit screen for every field and line item | `mobile/src/screens/BillReviewScreen.js` |
| Low-confidence fields visibly flagged, not guessed | model returns `unclear` + reason per field; shown in amber until edited or confirmed |
| Duplicate-bill warning (same vendor + bill no. + date) | `findDuplicates` in `backend/src/routes/bills.js` |

How it flows: the phone resizes the photo to ≤ 2000 px JPEG and uploads it.
The API stores the original, creates a **draft** bill, and runs extraction
in the background while the app polls. The reviewer fixes anything flagged
and taps **Mark ready**, which the API refuses while any flag is unresolved
or a line lacks description, quantity, or rate. The AI's original read is
kept in `bills.extraction_json` and never overwritten by edits.

**Extraction needs an `ANTHROPIC_API_KEY`** in `backend/.env`. Without one,
uploads still work but extraction fails with a clear message, and the
reviewer can retry or type the bill in by hand. The model
(`EXTRACTION_MODEL`, default `claude-opus-5`) and effort
(`EXTRACTION_EFFORT`, default `medium`) are env settings so they can be
tuned against real bill photos for the design doc's under-15-seconds target.

## Phase 1: Foundation & Onboarding (Weeks 1–3)

**Exit criterion:** a new organization can sign up, complete onboarding, and
land on an empty but fully configured account on both platforms.

| Roadmap item | Where |
|---|---|
| CI/CD for backend + Android/iOS | `.github/workflows/ci.yml`, `mobile/eas.json` |
| Multi-tenant schema (Organization, User, auth) | `backend/src/db/index.js` |
| Sign-up, login, JWT sessions | `backend/src/routes/auth.js`, `backend/src/middleware/auth.js` |
| App shell + navigation (Android + iOS) | `mobile/App.js`, `mobile/src/navigation/` |
| Company Profile form + logo upload (6.1) | `routes/companyProfile.js`, `routes/assets.js` |
| Issuing Identity form + logo, defaults to Company Profile (6.2) | `routes/issuingIdentities.js` |
| Recipient form (6.3) | `routes/recipients.js` |
| Conversion Rule form: markup, tax %, tax label, currency, decimals (6.4) | `routes/conversionRules.js` |
| Filename Pattern form with placeholders and live preview (6.6) | `routes/filenamePatterns.js`, `src/filenamePattern.js` |
| Batch Report Template form, first cut (6.7) | `routes/reportTemplates.js` |
| Onboarding wizard (6 steps, resumes where you left off) | `mobile/src/onboarding/steps.js`, `mobile/src/screens/onboarding/` |
| Automated multi-tenant isolation tests (roadmap §5) | `backend/test/tenantIsolation.test.js` |

## Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev        # http://localhost:4000
npm test           # 42 tests: auth, onboarding forms, uploads, bills/extraction, tenant isolation
```

Uses `better-sqlite3` for zero-install local development; every route goes
through the `db` object in `src/db/index.js`, so moving to PostgreSQL is
confined to that file. Uploaded logos are stored on disk under
`uploads/<organizationId>/` (see `src/storage.js`, the one place to swap in
S3-compatible storage). `JWT_SECRET` is **required** when
`NODE_ENV=production`.

### API

| Endpoint | Purpose |
|---|---|
| `POST /api/auth/signup`, `POST /api/auth/login` | Create account / sign in |
| `GET /api/me` | Restore a session from a token |
| `GET/POST /api/company-profile` | One per organization (upsert) |
| `GET/POST/DELETE /api/issuing-identities` | Letterhead identities |
| `GET/POST/DELETE /api/recipients` | Clients invoices are addressed to |
| `GET/POST/DELETE /api/conversion-rules` | Markup/tax rule profiles |
| `GET/POST /api/filename-patterns`, `GET …/placeholders` | Filename convention (one per organization) |
| `GET/POST/DELETE /api/report-templates`, `GET …/options` | Batch report layouts |
| `POST /api/assets/logo`, `GET /api/assets/:id` | Logo upload (PNG/JPEG, ≤ 2 MB) and download |
| `GET /api/onboarding/status`, `POST /api/onboarding/complete` | Wizard progress; completing requires every form saved |
| `POST /api/bills` | Upload a bill (JPEG/PNG ≤ 5 MB, PDF ≤ 20 MB); starts extraction |
| `GET /api/bills`, `GET /api/bills/:id` | List bills; one bill with line items, flags, and duplicates |
| `PUT /api/bills/:id` | Save review edits; `markReady: true` to finish |
| `POST /api/bills/:id/extract` | Retry a failed extraction |
| `DELETE /api/bills/:id` | Delete a bill |

## Mobile (React Native / Expo SDK 57, Android + iOS)

### Try it on your phone with Expo Go

You need Node.js 22+ on your computer, and your phone and computer on the
**same Wi-Fi network**.

1. Install **Expo Go** from the App Store or Google Play. It must support
   SDK 57; the current store version does.
2. Start the backend (see above). It listens on port 4000 on every network
   interface, so the phone can reach it.
3. Find your computer's LAN IP address: `ipconfig` on Windows (the IPv4
   address), `ipconfig getifaddr en0` on macOS, `hostname -I` on Linux.
4. In a second terminal, start the app with that IP:

   ```bash
   cd mobile
   npm install
   EXPO_PUBLIC_API_BASE_URL=http://192.168.1.23:4000 npx expo start
   ```

   On Windows PowerShell, set the variable first:
   `$env:EXPO_PUBLIC_API_BASE_URL="http://192.168.1.23:4000"; npx expo start`
5. Scan the QR code: with the Camera app on iPhone, or from inside Expo Go
   on Android.

If the phone can't connect: allow Node.js through your computer's firewall
for port 4000 (and 8081 for Expo), or run `npx expo start --tunnel`. The
tunnel only covers the app bundle; the backend URL must still be reachable
from the phone. To use a simulator instead, press `a` (Android emulator) or
`i` (iOS simulator, macOS only); there `http://localhost:4000` works for
iOS, and Android's emulator uses `http://10.0.2.2:4000`.

## CI/CD

Every push and pull request runs the backend test suite and compiles the
production JS bundle for Android and iOS. Pushes to `main` additionally
start native Android + iOS builds on EAS Build **once an `EXPO_TOKEN`
repository secret is configured**. That also needs a one-time
`eas init` in `mobile/` to link an Expo project; until then the job skips.

## Verification status

- Backend: 42 automated tests pass, including the tenant-isolation suite
  (another organization can't list, read, edit, delete, or duplicate-match
  anything it doesn't own: settings, logos, and bills). Tests use a stub
  extractor; the real Claude client was checked against a mock API for its
  request shape and its success, refusal, and auth-failure handling.
- Mobile: the Android and iOS bundles compile. Onboarding and the bill
  review flow (reading state, flags, resolving them, mark ready, duplicate
  warning, failed extraction) were clicked through in a browser build
  against the real backend with no runtime errors.
- **Not yet verified:** extraction against real bill photos with a real API
  key (accuracy and the 15-second target), and anything on a physical
  device or simulator. That covers camera, photo and file picking, image
  resizing, and the bill thumbnail, which can't be tested in a browser build.
  The roadmap budgets Phase 2 time to tune the prompt on real samples
  (handwritten, multi-language, low-quality scans).

## Next: Phase 3, Template Builder & Upload

In-app invoice template builder with live preview, and `.docx` template
upload with token detection and field mapping.
