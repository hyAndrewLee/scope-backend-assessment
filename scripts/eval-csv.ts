import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { assessmentData } from "../src/data/assessment-data";
import {
  showtimeSchema,
  type CsvRow,
  type Proposal,
} from "../src/features/reconciliation/schemas";
import { parseCsv, uniqueRows } from "../src/server/utils/csv";
import {
  compilePreview,
  exactProposal,
} from "../src/server/utils/reconciliation";
import { validateAssignments } from "../src/server/utils/auditoriums";
import { availablePreviewFormats } from "../src/features/reconciliation/display";
import { AppError } from "../src/server/errors";
import golden from "../sample-data/edge-cases/golden.json";

// #region Evaluation context

const directory = fileURLToPath(
  new URL("../sample-data/edge-cases/", import.meta.url),
);

const fields: (keyof CsvRow)[] = [
  "theaterName",
  "movieTitle",
  "auditorium",
  "startTime",
  "endTime",
  "language",
  "format",
  "rating",
  "partnerLastUpdated",
];

const seed = assessmentData.showtimes.filter(
  (s) => s.theaterId === "theater-downtown",
);

const snapshot = seed.map((s) =>
  showtimeSchema.parse({
    ...s,
    movieId: `movie-${seed.findIndex((other) => other.movieTitle === s.movieTitle)}`,
    partnerTitle: s.movieTitle,
    partnerLastUpdated: s.lastUpdated,
  }),
);

const rooms = [...new Set(snapshot.map((s) => s.auditorium))].map(
  (name, i) => ({
    id: `room-${i}`,
    theaterId: "theater-downtown",
    name,
    supportedFormats: [
      ...new Set(
        snapshot.filter((s) => s.auditorium === name).map((s) => s.format),
      ),
    ],
  }),
);

const movies = [...new Set(snapshot.map((s) => s.movieId))].map((id) => ({
  id,
  supportedFormats: [
    ...new Set(snapshot.filter((s) => s.movieId === id).map((s) => s.format)),
  ],
}));

const metadata = {
  personaId: "eval-admin",
  theaterId: "theater-downtown",
  revision: 0,
  model: "local-golden",
};

// #endregion

// #region Golden scenario evaluation

// Deterministic decisions isolate application validation from model variability.
// These are evaluation inputs only, never an application AI fallback.
function decisionsFor(rows: CsvRow[]): Proposal {
  return {
    decisions: rows.map((row, sourceRow) => {
      const match = snapshot.find(
        (s) => s.movieTitle === row.movieTitle && s.startTime === row.startTime,
      );

      const movie = snapshot.find((s) => s.movieTitle === row.movieTitle);

      return {
        sourceRow,
        kind: match ? "match" : "add",
        showtimeId: match?.id ?? null,
        movieId: match ? null : (movie?.movieId ?? null),
        title: null,
        auditorium: null,
        reason: "Golden evaluation decision",
      };
    }),
  };
}

export async function runCsvEvals() {
  const results: { file: string; passed: boolean; error?: string }[] = [];
  const columnChecks = Object.fromEntries(
    golden.columns.map((name) => [name, 0]),
  );

  for (const scenario of golden.cases) {
    try {
      const bytes = new Uint8Array(
        await Bun.file(directory + scenario.file).arrayBuffer(),
      );

      if (scenario.outcome === "invalid") {
        let failure: unknown;

        try {
          parseCsv(bytes);
        } catch (error) {
          failure = error;
        }

        assert(
          failure instanceof AppError,
          "Invalid CSV was accepted or failed unexpectedly",
        );
        assert([400, 413].includes(failure.status));
        if ("errorColumn" in scenario)
          assert(
            failure.message.includes(scenario.errorColumn!),
            `Error must identify ${scenario.errorColumn}: ${failure.message}`,
          );
      } else {
        const parsed = parseCsv(
          bytes,
          "mapping" in scenario ? scenario.mapping : undefined,
        );

        const rows =
          scenario.outcome === "conflict" ? parsed : uniqueRows(parsed);

        assert("rows" in scenario);
        assert.equal(rows.length, scenario.rows!.length, "Unique row count");
        for (const [index, row] of rows.entries()) {
          for (const [column, field] of fields.entries()) {
            assert.equal(
              row[field],
              scenario.rows![index]![column],
              `Row ${index + 2}, ${golden.columns[column]}`,
            );
            columnChecks[golden.columns[column]!]!++;
          }
        }

        if (scenario.outcome === "unchanged") {
          const proposal = exactProposal(rows, snapshot);

          assert(proposal, "Unchanged schedule should bypass AI");
          const preview = validateAssignments(
            compilePreview(rows, snapshot, proposal, metadata),
            rooms,
            movies,
          );

          assert(preview.entries.every((e) => e.kind === "unchanged"));
          assert.equal(preview.blockers.length, 0);
        } else if (scenario.outcome === "capability-blocked") {
          const preview = validateAssignments(
            compilePreview(rows, snapshot, decisionsFor(rows), metadata),
            rooms,
            movies,
          );

          assert(
            preview.blockers.length > 0,
            "Incompatible assignment must block confirmation",
          );
          for (const entry of preview.entries) {
            if (!entry.after) continue;
            const formats = availablePreviewFormats(
              preview,
              entry,
              entry.after.auditorium,
            );

            const room = rooms.find((r) => r.name === entry.after?.auditorium);
            const movie = movies.find((m) => m.id === entry.after?.movieId);

            assert(
              formats.every(
                (f) =>
                  room?.supportedFormats.includes(f) &&
                  movie?.supportedFormats.includes(f),
              ),
            );
          }
        } else if (scenario.outcome === "archive") {
          const preview = compilePreview(
            rows,
            snapshot,
            decisionsFor(rows),
            metadata,
          );

          const archives = preview.entries.filter((e) => e.kind === "archive");

          assert.equal(archives.length, 1);
          assert.equal(archives[0]!.after?.movieTitle, "Kung Fu Panda 4");
        } else if (scenario.outcome === "conflict") {
          assert.throws(
            () => uniqueRows(rows),
            (error) =>
              error instanceof AppError &&
              error.status === 409 &&
              error.message.includes("different details"),
            "Conflicting duplicates must be rejected before AI",
          );
        } else if (scenario.outcome === "wrong-theater") {
          assert(rows.some((row) => row.theaterName !== "Downtown Cinema 7"));
        }
      }

      results.push({ file: scenario.file, passed: true });
    } catch (error) {
      results.push({
        file: scenario.file,
        passed: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    passed: results.filter((r) => r.passed).length,
    total: results.length,
    columnChecks,
    results,
  };
}

// #endregion

// #region Command-line report

if (import.meta.main) {
  const report = await runCsvEvals();

  for (const result of report.results)
    console.log(
      `${result.passed ? "PASS" : "FAIL"} ${result.file}${result.error ? `: ${result.error}` : ""}`,
    );
  console.log(
    `\n${report.passed}/${report.total} scenarios passed. Column-by-column checks:`,
    report.columnChecks,
  );
  if (report.passed !== report.total) process.exitCode = 1;
}

// #endregion
