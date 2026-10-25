# Theater Showtimes Manager

A single Next.js application rebuilt from the original assessment at `15805e7`. Bun runs the application, scripts, and tests. The original console uses TanStack Query and Axios; all business data comes from the server and hosted Postgres. CSV reconciliation uses real Gemini output, validated by the server before review and confirmation.

## Setup

Use Bun **1.2.23** (the locally verified version):

```bash
bun install --frozen-lockfile
cp .env.example .env.local # only if .env.local does not already exist
```

Fill in the server-only settings in `.env.local`:

- `DATABASE_URL`: hosted Postgres connection string, including credentials. Loopback URLs and unverified TLS modes are rejected. There is no local database or data fallback.
- `APP_ORIGIN`: exact application origin, such as `http://localhost:3000`.
- `GEMINI_API_KEY` and `GEMINI_MODEL`: a real Google project key and a structured-output-capable model available to that project. The configurable default is `gemini-2.5-flash`; its current project availability is not guaranteed. Missing AI configuration fails preview honestly, never with fabricated output.

No credentials belong in `NEXT_PUBLIC_*` variables or Git. Supabase's public CA is bundled automatically for its database/pooler hosts; certificate verification remains enabled. No CA or preview-signing environment variable is needed.

### Empty hosted database only

Create a dedicated server runtime role first. As the database owner, initialize **new, empty application tables** with:

```bash
psql "$OWNER_DATABASE_URL" -1 -v ON_ERROR_STOP=1 \
  -v runtime_role=YOUR_SERVER_APP_ROLE -f scripts/schema.sql
bun run db:check
bun run db:seed
bun run dev
```

The SQL enables `pg_trgm`, constraints, indexes, RLS, and policies for the specified server role. Never use Supabase's `anon` or `authenticated` role as that server role. The app uses the direct Postgres connection, not the hosted browser data API. Table creation and seeding are explicit operator actions; neither runs during startup or requests. Seeding refuses nonempty application tables and rolls back on failure. Do not run setup against populated tables or drop another application's schema.

The seed imports starter users, memberships, theaters, auditoriums, movies, and showtimes. Initial movie/room format sets are the union of formats observed in the starter records, not an authoritative hardware/distribution inventory; verify them before real imports. New movies receive only the formats of their included, reviewed screenings. No CSV or model output can expand an existing movie's or room's allowed formats. Capability administration is intentionally outside the CSV workflow: use trusted metadata, hold the theater row lock, verify existing active screenings remain compatible, and increment its revision when changing capabilities or room names. Combined IMAX-3D and auditorium booking-overlap rules are not modeled. It merges the starter's conflicting per-screening movie statuses conservatively: flagged, then needs-review, then draft, then approved. Theater-wide movies now have one review status. Starter data is never imported by the visible application.

Open `http://localhost:3000`, select a demo persona, and choose one theater or all accessible theaters.

## Behavior

- Server-side search, filters, sort, pagination, totals, active counts, and dropdown options. Dates use inclusive UTC days. Title substring search has a trigram index; no separate search service.
- Admin personas may upload, clear, and edit statuses only for accessible theaters. Viewer responses omit movie review status. Some/none/all memberships are supported independently of role.
- A CSV describes **one theater's complete schedule**, not just filtered dates. Missing non-archived screenings are proposed for archival, never deletion. Clear Schedule also archives.
- CSV headers: `movie_title,theater_name,auditorium,start_time,end_time,language,format,rating,last_updated`. Case/separator differences normalize without AI. Minor spelling mistakes are sent to a separate AI header mapper; only a one-to-one mapping onto these nine names, within two normalized character edits, is accepted. Exact canonical headers cannot be remapped. Uncertain, duplicate, extra, instruction-like, or unrelated headers fail closed. Recognized mappings are displayed in the preview before confirmation. Use timestamps with explicit UTC/offsets and the selected theater's exact database name. See `sample-data/` for example uploads, not canned API responses.
- Exact duplicate records are applied once. Exact normalized full-schedule matches skip AI. Other uploads use Gemini to propose known matches/new identities and explain naming corrections. Unknown/repeated/foreign references are rejected; uncertain matches block confirmation and suppress archival.
- The preview shows original/proposed fields, explanations, editable values, and exclusions. Validate edits before confirmation. Movie IDs, theater IDs, and movie review status cannot be edited by CSV. Preview, validation, and cancellation do not write schedule data.
- Auditoriums are real records with supported formats, and movies have their own allowed-format set. A screening's requested format must belong to **both** sets: a 3D-only movie cannot be assigned a 2D screening or a 2D-only room. IMAX does not implicitly mean 3D. AI may propose an existing compatible room, but it cannot change capability metadata. Preview, edit validation, confirmation, status activation, and a database trigger enforce compatibility. The preview lists available rooms/formats; unknown or incompatible assignments block confirmation.
- Confirmation locks the theater, checks revision and access again, and applies included changes atomically. Every clear/status write also locks the theater and advances revision. The database independently enforces unique active movie/start identities.
- Errors remain visible. A failed preview is not a successful no-change preview. No API or UI path substitutes fixture data when the server fails.

### Deliberate limits

Uploads are limited to 256 KiB and 100 input records. Full-schedule reconciliation supports at most 200 saved screenings, including archives, and a bounded model context; oversized imports fail without truncation. Large-catalog paginated search does not imply unlimited whole-schedule AI reconciliation.

Previews are plain editable JSON, not signed tokens, and are not stored in a plans table. They disappear on page reload. Confirmation treats submitted changes like any admin mutation: validate scope, current database rows, protected identity/status fields, capabilities, final identities, and revision. It does not prove that a payload is the original AI response. No approval history, sandbox sessions, scopes, or durable confirmation receipts exist. Replaying an applied preview fails its old revision check. After a lost confirmation response, close/refresh and inspect the persisted schedule; do not assume either success or failure or automatically retry the write.

**Demo persona selection is not authentication.** The server looks up the selected persona and applies database roles/memberships, but anyone can deliberately select another persona. This demonstrates access rules, not secure real-user identity. A trusted identity source is required before claiming production authorization. No login system is included.

## Layout

```text
src/server/
  database.ts         # Shared hosted connection
  schema/             # One file per table
  services/           # Users, theaters, schedules, reconciliation workflows
  utils/              # CSV/diff/preview helpers and bounded body reading
  ai/                 # Gemini adapter
  errors.ts           # Small sanitized error responder
src/app/api/          # Plain Next.js route handlers
src/features/reconciliation/schemas.ts  # Shared Zod contracts
```

Routes call domain services, which use Drizzle directly. No controller/repository framework, generic HTTP wrapper, or custom API client. One Query provider owns client server-state caching; Axios provides transport. Mutations do not retry automatically.

## Checks and deployment

```bash
bun test
bun run typecheck
bun run lint
bun run build
bun run start
```

Header matching receives only bounded header strings, never row contents. Both AI stages treat CSV text as untrusted data, have no tools or write authority, and return constrained structured output. Server-side allowlists, reference checks, capability rules, and explicit human review remain the trust boundary; prompting alone is not a guarantee against model manipulation.

Service/helper tests run without a database; isolated doubles are confined to tests. They cover access, CSV validation, matching/archival, edits, forged-payload rejection, stale/replayed confirmations, and transaction orchestration. They do **not** prove real SQL rollback, query performance at hundreds of thousands of rows, browser rendering, or provider availability. Verify those separately against an authorized hosted demo theater; do not use destructive production checks.

`dev`, `build`, and `start` explicitly use `bun --bun next`, not a Node shebang. `vercel.json` uses the documented [`bunVersion: "1.x"`](https://vercel.com/docs/functions/runtimes/bun) server runtime setting as well as Bun install/build commands. Vercel manages that range separately from the locally pinned version; exact runtime parity and deployed behavior are not claimed. No deployment was performed.

Implementation checks: Bun production build, typecheck, clean lint, 32 service/helper tests, a read-only hosted TLS connection check, and local production-server HTTP smoke checks (console 200, missing persona 401, cross-origin write 403, uninitialized schema safely returns 500). The configured host does not yet have these six `public` tables, so operator initialization/seeding is still required. No hosted data was changed and no live Gemini request was made.
