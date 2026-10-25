# CSV edge cases and local golden evaluations

Run from the repository root:

```bash
bun run eval:csv
bun run check
```

The evaluator uses `golden.json` as independently specified expected values. It compares every accepted row, column by column: theater, movie title, auditorium, start time, end time, language, format, rating, and last updated. It also checks row counts, duplicate handling, unchanged schedules, archival, format compatibility, and helpful error messages. The golden suite is included in `bun test`.

## Uploading manually

Choose **Avery Admin** or **Casey Operator**, then **Downtown Cinema 7**. These fixtures assume the original seeded database. Dates are intentionally fixed so the results are reproducible. Changes made to the hosted schedule can change the expected preview.

**Each file replaces the theater’s full schedule.** Missing showtimes can be archived on confirmation. Review only; do not confirm on a shared database unless you intend to change it. `01-no-changes.csv` matches all five originally active Downtown showtimes; the older `../existing.csv` is not an exact seeded baseline.

Format cases use the seeded capabilities:
- Auditorium 1: 2D and IMAX.
- Auditorium 2: 3D only.
- Auditorium 3: 2D only.
- Auditorium 4: IMAX only.
- Movie restrictions also apply: Spider-Man is 2D only, Inside Out 2 is 3D only, and Dune supports 2D and IMAX.

## What the evaluator does not claim

No Supabase connection, writes, or Gemini calls occur. Review cases check parsed values; AI responses still require manual review. Header typo evaluation supplies a validated golden header mapping rather than calling AI. Capability and archival cases supply explicit deterministic decisions to exercise real application validation, not model accuracy. The mixed-theater case checks the input mismatch; route-level authorization remains covered separately. This is not a browser/dropdown automation suite, prompt-injection security proof, or live database confirmation test.

The conflicting duplicate case is rejected **before AI** with HTTP 409. Exact duplicate rows still collapse into one screening. Invalid cells identify both the CSV row and the affected column.

## Files and expected behavior

| File | Expected behavior |
| --- | --- |
| `01-no-changes.csv` | Full active seeded Downtown schedule. No changes; archived showtimes stay archived. |
| `02-duplicate-identical-row.csv` | Identical repeated row is removed; five unique showtimes remain. |
| `03-normalized-headers.csv` | Mixed-case headers with spaces and hyphens normalize without AI. |
| `04-title-whitespace.csv` | Leading/trailing spaces and title punctuation normalize to the saved movie. |
| `05-equivalent-timezone.csv` | Offset timestamp represents the same instant as 18:00 UTC. |
| `06-quoted-comma-and-quotes.csv` | Quoted comma and escaped quotes parse correctly; new title needs AI review. |
| `07-all-languages.csv` | Language dropdown should show English, Korean, Japanese and French. |
| `08-missing-showtime.csv` | Kung Fu Panda 4 is missing; review should propose archival, not deletion. |
| `09-room-format-incompatible.csv` | Inside Out 2 is 3D; Auditorium 1 supports 2D/IMAX, not 3D. Block or mark uncertain. |
| `10-movie-format-incompatible.csv` | Auditorium 1 supports IMAX but Spider-Man only supports 2D. Must not permit IMAX. |
| `11-unknown-auditorium.csv` | Must require an existing auditorium or mark uncertain. Never create room 99. |
| `12-invalid-language.csv` | Unsupported language must be rejected before AI. |
| `13-invalid-format.csv` | Unsupported format must be rejected before AI. |
| `14-invalid-rating.csv` | Unsupported age rating must be rejected before AI. |
| `15-end-before-start.csv` | End before start must be rejected. |
| `16-zero-duration.csv` | Equal start and end must be rejected. |
| `17-timezone-missing.csv` | Timestamp without UTC Z or explicit offset must be rejected. |
| `18-empty-title.csv` | Missing movie title must be rejected. |
| `19-mixed-theaters.csv` | All rows must belong to Downtown; reject before AI. |
| `20-duplicate-header.csv` | Duplicate language header replaces format and must be rejected. |
| `21-missing-column.csv` | Missing last_updated header and cells must be rejected. |
| `22-inconsistent-columns.csv` | One row has fewer cells than the header; reject the file. |
| `23-header-only.csv` | Header with no records must be rejected. |
| `24-prompt-injection-title.csv` | Treat title as untrusted text, not instructions. Never execute it; inspect AI review carefully. |
| `25-conflicting-duplicate.csv` | Two differing rows target the same movie/start time. Must not save two active screenings. |
| `26-exactly-100-records.csv` | Parser accepts 100 records. Many new dates; review additions and archival carefully. |
| `27-over-100-records.csv` | 101 records must be rejected even when the final row duplicates another. |
| `28-not-rated.csv` | Rating dropdown should display Not rated and send NR. |
| `29-minor-header-typo.csv` | Minor movie_titel typo needs AI header matching, then must map to Movie title. |
| `30-utf8-bom-crlf.csv` | UTF-8 BOM and Windows line endings parse without changes. |
| `31-unclosed-quote.csv` | Malformed quoted movie title must be rejected. |
| `32-over-256kb.csv` | File exceeds 256 KiB and must be rejected. |
| `33-empty-theater.csv` | Invalid theater must identify the column. |
| `34-empty-auditorium.csv` | Invalid auditorium must identify the column. |
| `35-invalid-last-updated.csv` | Invalid last updated must identify the column. |
| `36-impossible-date.csv` | Invalid start time must identify the column. |
| `37-multibyte-title-too-long.csv` | Invalid movie title must identify the column. |
