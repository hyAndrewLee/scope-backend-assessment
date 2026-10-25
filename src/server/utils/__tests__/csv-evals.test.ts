import { expect, test } from "bun:test";
import { runCsvEvals } from "../../../../scripts/eval-csv";

test("CSV golden dataset checks all nine columns and edge-case outcomes", async () => {
  const report = await runCsvEvals();

  expect(report.results.filter((result) => !result.passed)).toEqual([]);
  expect(report.passed).toBe(report.total);
  expect(report.total).toBeGreaterThanOrEqual(10);
  expect(Object.keys(report.columnChecks)).toHaveLength(9);
  for (const count of Object.values(report.columnChecks))
    expect(count).toBeGreaterThan(0);
});
