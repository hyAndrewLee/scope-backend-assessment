# Fresh-fork implementation plan

## Starting point

Start from the original assessment fork at `15805e7`, not from the current implementation. Use the later work only as reference for behavior and useful service tests. Do not cherry-pick its architecture or create it just to delete it.

Assume a new, empty hosted database. There is no existing application data to migrate. Do not reset an already populated database without separate approval.

Deliver a single Next.js application with real server-backed data, the existing console and preview, real Gemini reconciliation, and focused service tests. No local database, runtime mocks, anonymous sandboxes, persisted plans, sessions, scopes, or custom database namespace.

This plan has now been implemented from `15805e7` in small Conventional Commits. README is the current setup and behavior reference. Hosted table initialization/seeding and live provider/browser verification remain operator follow-ups; existing hosted data has not been changed.

## Smallest architecture

Use **route handlers → domain services → hosted Postgres**. Services may use Drizzle directly. Group tables under `schema/`, workflows under `services/`, pure helpers under `utils/`, and provider code under `ai/`. These are navigation boundaries, not extra architectural layers. Do not add service classes, a controller layer, repository interfaces, database wrappers per entity, custom data-context layers, or another backend. Use one TanStack Query provider for client-side server state.

Use TanStack Query for server reads and mutations, with Axios as the HTTP transport. Keep only UI state in the existing page: selected IDs, filters, open preview, and draft edits. Reuse the existing components, types, debounce hook, and styling. Do not copy query results into parallel `useState` stores.

### Bun runtime and tooling

Use Bun as both the JavaScript/TypeScript runtime and package manager, not merely as an npm replacement. Pin the locally verified Bun version in `package.json` (`packageManager`) and use it in CI. For managed deployment, use the provider's documented Bun runtime range and disclose version differences. Commit `bun.lock`; use `bun install --frozen-lockfile` in CI.

Run Next.js with `bun --bun next dev`, `bun --bun next build`, and `bun --bun next start` so its Node shebang does not silently select Node. Run TypeScript setup/check/seed scripts directly with Bun; no `tsx` dependency. Use Bun's built-in test runner (`bun test`, imports from `bun:test`) for service tests. Keep `node:crypto` imports where useful: Bun implements those compatibility APIs, and importing them does not select the Node runtime.

Verify Next.js, Drizzle/Postgres, and Gemini SDK behavior under the pinned Bun version. Deployment must run the application on Bun too; changing only the install command does not accomplish that. Verify hosting support and configure its documented Bun runtime setting, or use a Bun-capable host. A Next.js route's `runtime = "nodejs"` setting distinguishes Node-compatible server execution from Edge; it does not by itself guarantee the host uses Bun.

### Database

Define six tables under `src/server/schema/`, one file per table and one column per line, using ordinary `pgTable`:

- `users`: ID, display name, email for the existing display, role, and `all_theaters`.
- `theaters`: ID, name, location, timezone, and revision.
- `user_theaters`: user/theater membership, with a composite primary key.
- `auditoriums`: ID, theater ID, canonical name, and supported formats.
- `movies`: ID, theater ID, canonical title, movie review status, and supported formats.
- `showtimes`: ID, theater/movie/auditorium IDs, partner title, start/end times, language, format, rating, partner update time, server update time, and lifecycle status.

A screening's format must be supported by both its movie and its auditorium. Use composite foreign keys to prevent cross-theater assignments and a database trigger as a write backstop. AI can suggest an existing compatible auditorium but cannot mutate capability metadata. Revalidate at preview/review/confirmation and direct status activation.

Movies are theater-specific. Join movie status into schedule responses to preserve the table's presentation. Enforce matching theater/movie references, valid values, end after start, and one active screening per `(theater_id, movie_id, start_time)` through database constraints.

All-theater access uses `all_theaters`; otherwise membership rows determine access, including no rows for no access. Admin status does not automatically grant membership.

Use theater revision and row locking for every write. Add theater/start-time indexes and a `pg_trgm` GIN index for substring movie-title search. Keep pagination and deterministic sorting in SQL, not in the browser.

### Preview and confirmation

Keep original/proposed values, explanations, edits, exclusions, validation, cancellation, and explicit confirmation. Preview and review validation never write schedule data.

Return bounded plain JSON instead of storing or signing a plan. This is an editable demo, not a cryptographic approval system. No signing secret or expiration machinery is needed. Treat every submitted change as untrusted admin input and validate it against current database state.

Read a consistent database snapshot, release the transaction, then call Gemini. Validate all model references and compute archive decisions in server code. Exact matches may skip AI. Ambiguous matches block destructive application. Missing non-archived screenings are proposed for archival across the selected theater's complete schedule.

Review edits accept only allowlisted fields and exclusions. Validate the resulting schedule and return plain JSON. IDs cannot be changed through CSV review. Administrators can choose a movie review status or explicitly apply an advisory AI suggestion; the selection is shared across the movie’s screenings and saved only on confirmation.

Confirmation rechecks permissions, locks the theater row, checks revision, compares before-values against real database records, validates protected fields and final identities, writes atomically, and increments revision once. Handle affected active rows in two phases when needed to avoid transient uniqueness conflicts. Reload persisted data after success.

Tradeoff: previews do not survive a page reload and confirmations have no durable replay receipt. An already-applied preview fails its old revision check, preventing duplicate application. After a lost response, refresh and report uncertainty; do not promise that retry returns the previous result.

## Add

### Server and shared contracts

- **`src/server/database.ts`** — one server-only Postgres/Drizzle connection. Require the hosted URL, verified TLS, bounded pool/timeouts, and pooler-compatible settings. Bundle Supabase's official public CA automatically; no CA env setting. Reject loopback URLs; never fall back to fixtures.
- **`src/server/schema/users.ts`**, **`theaters.ts`**, **`user-theaters.ts`**, **`movies.ts`**, **`showtimes.ts`**, **`auditoriums.ts`** — one table per file, with its constraints/index definitions. Import referenced tables directly; no barrel file is required.
- **`src/server/services/users.ts`** — database-backed persona reads and shared role/membership checks. Accept a transaction when checks must share the write transaction.
- **`src/server/services/theaters.ts`** — accessible-theater reads.
- **`src/server/services/auditoriums.ts`** — internal theater-scoped room/movie capability reads after permission checks.
- **`src/server/services/schedule.ts`** — paginated schedule reads, counts/options, clear, and screening/movie status mutations. Own the shared theater lock/revision protocol.
- **`src/server/services/reconciliation.ts`** — orchestrate preview generation, review validation, and atomic confirmation. Call pure utilities and the AI adapter; keep database access and transaction ownership here or in the schedule service, not in utilities.
- **`src/server/utils/csv.ts`** — bounded UTF-8 CSV parsing, header/row validation, normalization, exact duplicate grouping, and row-level errors. Use `csv-parse`, not a handwritten CSV parser.
- **`src/server/utils/reconciliation.ts`** — pure matching-input preparation, proposal validation, diff compilation, edit validation, and final-identity checks. No database, network, or HTTP dependencies. Keep uncertain matches blocked.
- **`src/server/ai/model.ts`** — real structured-output Gemini call with cancellation, timeout, validated output, and safe failures. No static-success fallback. Verify supported model/project access during implementation rather than copying an old availability claim.
- **`src/server/utils/preview.ts`** — small schema/size/persona/theater validation helper; no signing.
- **`src/server/utils/headers.ts`** and **`src/server/ai/headers.ts`** — normalize exact column names; ask AI to map minor typos only. Bound input, restrict mappings to a bijection over canonical headers, preserve exact names, and reject unrelated/instruction-like names or mappings beyond two normalized character edits. Show mappings in the preview; send only headers to this separate AI request.
- **`src/server/utils/auditoriums.ts`** — pure format compatibility and assignment checks; never trust model-proposed hardware capabilities.
- **`src/server/utils/read-body.ts`** — bounded body reading for CSV and preview requests. Enforce the actual streamed byte limit, not only `Content-Length`.
- **`src/server/errors.ts`** — small shared domain error and sanitized response conversion; no HTTP framework or route wrapper. Routes retain plain `try/catch`, input validation, and same-origin write checks.
- **`src/features/reconciliation/schemas.ts`** — shared Zod contracts for query parameters, CSV rows, proposals, previews, edits, and mutation inputs. Infer types instead of maintaining duplicate definitions.
Use **TanStack Query + Axios**, not competing alternatives: Query owns loading/error/cache state and mutation lifecycles; Axios sends application API requests. Call Axios directly inside `useQuery` query functions and `useMutation` mutation functions. No native `fetch`, `http.ts`, custom `api-client.ts`, Axios wrapper, or interceptor framework is planned.

Include persona ID, theater selection, and filters/pagination in query keys. Pass TanStack Query's cancellation signal to Axios for reads. Do not display previous-persona results while a new query loads. Invalidate affected schedule/theater queries after successful writes; preview state must still be discarded when changing persona or theater. Disable automatic mutation retries, especially confirmation. Keep response validation and safe Axios-error handling. The Gemini SDK owns its provider transport.

- **`src/app/providers.tsx`** — one client `QueryClientProvider` with a stable per-mount `QueryClient`; no custom data context or global server-shared client.

### API routes

Each route validates HTTP input, calls a service, and returns a response. Never trust client-supplied roles or membership lists.

- **`src/app/api/users/route.ts`** — `GET`: database demo personas and their display/access information.
- **`src/app/api/theaters/route.ts`** — `GET`: theaters available to the selected persona.
- **`src/app/api/schedule/route.ts`** — `GET`: selected theater or all accessible theaters; search, filters, sorting, pagination, totals, active count, and filter options from the server.
- **`src/app/api/theaters/[theaterId]/preview/route.ts`** — `POST`: raw CSV to explained preview.
- **`src/app/api/theaters/[theaterId]/preview/review/route.ts`** — `POST`: plain preview plus edits to validated preview.
- **`src/app/api/theaters/[theaterId]/confirm/route.ts`** — `POST`: plain preview and explicit acknowledgment to atomic writes.
- **`src/app/api/theaters/[theaterId]/schedule/route.ts`** — `DELETE`: archive the selected theater's schedule after acknowledgment; do not hard-delete.
- **`src/app/api/showtimes/[showtimeId]/route.ts`** — `PATCH`: admin screening lifecycle change.
- **`src/app/api/movies/[movieId]/route.ts`** — `PATCH`: admin movie review status change.

### Setup and tests

- **`scripts/schema.sql`** — one-time empty-hosted-database setup, matching the Drizzle schema, constraints, indexes, and least-privilege grants. No migration framework.
- **`scripts/seed.ts`** — explicitly import starter users, memberships, theaters, movies, and showtimes once. Reject duplicate/conflicting input; never run on page load or server startup.
- **`scripts/check-database.ts`** — explicit connection/read check against the configured hosted database.
- **`bun.lock`** — Bun's committed dependency lockfile, generated from the fresh fork's updated dependencies. No Vitest/Jest configuration is needed; use Bun's built-in test runner.
- **`src/server/utils/__tests__/csv.test.ts`** — valid/invalid uploads, duplicates, and empty input.
- **`src/server/utils/__tests__/reconciliation.test.ts`** — identity preservation, minor naming changes, full-schedule archival, ambiguity, exclusions, edits, and no-op behavior.
- **`src/server/utils/__tests__/preview.test.ts`** — schema validation, persona/theater binding, and payload bounds.
- **`src/server/services/__tests__/users.test.ts`** — some/none/all access and admin/viewer rules.
- **`src/server/services/__tests__/schedule.test.ts`** — allowed reads/mutations and revision changes.
- **`src/server/services/__tests__/reconciliation.test.ts`** — wrong-theater uploads, stale revisions, confirmation orchestration, and visible failures.
- **`src/server/ai/__tests__/model.test.ts`** — provider-response validation, invalid references, timeout, and provider failure handling.

Adapt useful tests from the later implementation rather than reproducing every historical suite. Test doubles are allowed only inside isolated tests, never in application data paths.

## Edit

- **`src/app/page.tsx`** — preserve the existing JSX layout and styling. Replace mock user selection, static schedules, local filtering, fake preview generation, and local-only mutations with API calls. Keep selected IDs, filter inputs, preview, and draft edits as UI state; use TanStack Query for server data and request status. Add pagination and refresh. Clear stale data on persona/theater changes and cancel outdated reads.
- **`src/app/_components/PreviewModal.tsx`** — keep the modal and confirmation flow; render real original/proposed values and explanations. Support edits/exclusions and server validation. Add distinct failure/no-change/blocked states, accessible native dialog behavior, and honest uncertain-confirmation handling.
- **`src/app/_components/FileUpload.tsx`** — send the actual file with client size checks; no predefined preview lookup.
- **`src/app/_components/FilterBar.tsx`** — preserve controls; receive server-backed options and send filter changes to the page.
- **`src/app/_components/ShowtimesTable.tsx`** — make search/sort controlled by the page, not local filtering of one page. Keep both status controls and wire them to server mutations. Include movie IDs in responses for movie-status writes.
- **`src/types/assessment.ts`** — preserve presentation types that remain useful; replace obsolete preview-only interfaces with inferred shared contracts. Do not duplicate schema definitions.
- **`src/data/assessment-data.ts`** — retain starter records solely as explicit seed input. Remove fabricated preview outcomes. No runtime page/component/service imports of this file; only the seed script may use its business records.
- **`src/env.js`** — validate required hosted `DATABASE_URL`, server-only Gemini configuration, and application origin. No CA or signing-secret variables. Keep secrets out of client variables. Missing Gemini configuration may fail preview honestly without preventing schedule reads.
- **`.env.example`** — document the required server settings without credentials.
- **`package.json`** — add `@tanstack/react-query`, Axios, Drizzle, `postgres`, `csv-parse`, and Gemini SDK dependencies. Pin Bun in `packageManager`; remove the npm package-manager declaration. Keep existing Next/React/Zod versions unless verified Bun compatibility requires a change. Set dev/build/start scripts to `bun --bun next ...`, tests to `bun test`, lint to `bun --bun eslint .`, and typecheck to `bun --bun tsc --noEmit`. Run hosted seed/check TypeScript scripts with `bun`; add explicit hosted setup instructions/scripts. No Vitest, Jest, or `tsx` dependency.
- **`vercel.json`** — replace npm install/build commands with frozen Bun installation and Bun build commands. Verify and configure the deployment's actual Bun server runtime using supported platform settings; do not invent a runtime flag or claim Bun deployment solely from these commands.
- **`README.md`** — replace mock/FastAPI instructions with hosted setup, explicit seeding, API behavior, test commands, persona-security limitations, and preview/retry limits. Keep one current setup reference.

- **`src/app/layout.tsx`** — wrap children once with the Query provider; retain the existing server layout, metadata, and styling.

Keep global styles, debounce hook, public assets, and Next configuration unchanged unless a concrete integration issue requires an edit. Keep deployment as a single Next.js application, with its Bun runtime verified.

## Delete

These files exist in the fresh fork and are unnecessary:

- **`backend/app/main.py`**
- **`backend/app/__init__.py`**
- **`backend/requirements.txt`**
- **`src/lib/mock-session.ts`** — after the page uses database-backed personas.
- **`package-lock.json`** — replace with `bun.lock`; do not maintain two package-manager lockfiles.

Do not create the following later-implementation artifacts at all:

- `plans`, `sessions`, `scopes`, `sandbox_id`, or `namespace.ts`.
- Demo-session endpoints, cookies for sandbox ownership, saved-plan endpoints, retention cleanup, legacy-plan compatibility, or learned approval history.
- Docker Compose, local/test database setup, automatic database fallback, or runtime seeding.
- Architecture/source-shape test suites, an integration-runner framework, or multiple progress/verification/feature-plan documents.

## Identity and hosted security

Preserve the take-home's persona selector as a clearly labeled demo control, backed by real database users. Enforce role/membership rules on every service operation, including direct API calls. Viewer responses should omit write-only review information and private fields; select allowed fields server-side rather than merely hiding columns.

A freely selectable persona ID is not authentication. Document that impersonation is intentional for this demo; do not claim this satisfies production identity security. A trusted identity source is a separate prerequisite for real-user authorization. No login system or application session table is introduced by this plan.

Use a least-privilege server database role. For Supabase tables in `public`, restrict data-API grants or apply appropriate RLS so using the default schema does not expose tables to anonymous clients.

## Implementation order and completion checks

1. **Hosted schema and seed:** add connection/schema/setup scripts; seed once. Verify users, memberships, theaters, and schedules through hosted reads. No migration or cleanup work is needed for an empty database.
2. **Real reads:** add contracts/read services/routes; wire persona selection, theater selection, table, counts, filters, search, sorting, and pagination. Verify all-accessible, single-theater, and no-access states. No runtime mock imports remain.
3. **Preview:** add CSV parsing, real model integration, pure reconciliation and review routes. Wire the existing modal. Invalid/ambiguous inputs cannot archive data; preview/cancel/review make no schedule writes.
4. **Writes:** add atomic confirmation, clear, and status mutations with one theater lock/revision protocol. Verify stale previews fail and writes persist after reload. Restrict upload/clear to a single theater.
5. **Finish:** remove mock/Python files, add focused service tests, update README, and run checks. Do not add another architecture or documentation layer.

Run `bun install --frozen-lockfile`, `bun test`, `bun run typecheck`, `bun run lint`, and `bun run build`. Smoke-test `bun run start` and verify the deployed server uses Bun, not only its installer/build process. Then, with authorization, use a dedicated hosted demo theater to verify real CSV preview, edited confirmation, reload persistence, stale rejection, and failed-write rollback. Unit tests do not prove SQL rollback or constraints. No local database is introduced, and destructive hosted checks require explicit approval.

Keep imports bounded by documented upload/record/model limits. Large-catalog search must remain database-paginated; it does not imply that an entire large theater schedule fits in one model request. Reject oversized reconciliation honestly rather than truncating it.

## Verification status

The fresh-fork implementation passes 32 Bun tests, typecheck, clean lint, and a Bun production build. Local production-server smoke checks verified the console and safe 401/403/500 failure responses under the Bun executable. A read-only hosted TLS connection check succeeded; the six new public tables do not exist yet on that host. No hosted schema/data writes, deployment, browser-rendering verification, or live Gemini call were performed. The previous implementation's commits were removed from remote main with an explicit force-with-lease push after saving a local backup branch and stash. Orchestration executed inline because no sub-agent tool is available: one agent, child depth zero.
