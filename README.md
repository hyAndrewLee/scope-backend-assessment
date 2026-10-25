# Theater Showtimes Manager

Extends the assessment’s mocked console with persistent schedules and a real Gemini-backed CSV review flow. Built with Next.js, Bun, Drizzle, and hosted PostgreSQL.

## Setup

Requires Bun **1.2.23**, `psql`, an empty hosted PostgreSQL database, and a Gemini API key.

```bash
bun install --frozen-lockfile
cp .env.example .env.local # skip if already present
```

Set server-only variables in `.env.local`:

```dotenv
DATABASE_URL=<hosted Postgres URL with dedicated runtime-role credentials>
APP_ORIGIN=http://localhost:3000
GEMINI_API_KEY=<your key>
GEMINI_MODEL=gemini-2.5-flash
```

Use a model available to your Google project. Database connections require verified TLS; credentials never belong in `NEXT_PUBLIC_*` variables.

Create a dedicated database runtime role first (not Supabase `anon`/`authenticated`). Initialize **empty application tables only**, using owner credentials and the actual runtime role name:

```bash
psql "$OWNER_DATABASE_URL" -1 -v ON_ERROR_STOP=1 \
  -v runtime_role=YOUR_APP_ROLE -f scripts/schema.sql
bun run db:check
bun run db:seed
bun run dev
```

Schema setup and seeding are explicit, not startup behavior; seeding refuses populated tables. Open `http://localhost:3000`, select an admin demo persona and one theater, then upload a matching CSV from `sample-data/`.

## Key decisions

- **Full-schedule imports:** CSV replaces one theater’s schedule conceptually. Missing screenings become archive proposals, never deletions. Identical duplicates collapse; conflicting duplicates fail validation.
- **Validate first, then use AI:** Deterministic parsing, normalization, and duplicate checks run before Gemini; exact unchanged schedules skip AI. An AI-first flow is possible, but predictable cases do not need model judgment. Gemini proposes title/room matches with explanations; reviewers edit, exclude, and confirm changes. Movie-status suggestions never apply automatically.
- **Server remains authoritative:** Shared Zod contracts validate CSV, model output, and reviewed edits. Movie/room format compatibility and protected identities are rechecked before writes.
- **Atomic persistence:** Confirmation locks the theater, rejects stale revisions, and saves changes transactionally. Database constraints enforce active movie/start uniqueness and projection compatibility.
- **Existing auditoriums only:** Imports can match known rooms, not create them or expand format capabilities. Room creation belongs in a separate theater-onboarding feature backed by verified equipment metadata.
- **Demo storage scope:** Raw uploaded CSV files are not retained; confirmed schedule records persist. Raw-file retention and import audit history are deferred beyond this demo.
- **Evaluation coverage:** 37 golden CSV scenarios check expected reconciliation behavior and validation of model-shaped proposals. These deterministic evals test the surrounding safeguards, not live Gemini accuracy.

## Code style

Named `#region` / `#endregion` comments for large sections. ESLint enforces statement spacing; Prettier enforces formatting. Region boundaries remain a manual readability decision.

Run `bun run lint:fix` and `bun run format` to apply fixes. `bun run check` rejects spacing or formatting violations locally; deployment builds skip lint and Prettier.

## Checks and deployment

```bash
bun run check      # lint, typecheck, tests
bun run eval:csv   # 37 deterministic CSV edge cases; no live AI required
bun run build
```

Import into Vercel; set the same server variables, with `APP_ORIGIN` matching the deployment URL. `vercel.json` configures Bun install and build. Initialize the hosted database separately.

**Demo limits:** 256 KiB/100 CSV rows; at most 200 stored screenings per reconciliation, including archives. Previews are unsigned, temporary client state; confirmed schedule changes persist, but no approval-history log exists. Seeded format capabilities are inferred from starter data. Auditorium booking overlaps are not checked.
