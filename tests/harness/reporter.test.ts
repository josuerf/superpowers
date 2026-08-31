import { generateReport } from "../../lib/harness/reporter.js";
import type { ValidationResult } from "../../lib/harness/types.js";

function emptyValidationResult(): ValidationResult {
	return { passed: true, errors: [], warnings: [], duration: 0 };
}

describe("generateReport", () => {
	it("does not throw when a real complexity result (violations, no warnings/errors) is present", () => {
		const results: Record<string, ValidationResult> = {
			lint: emptyValidationResult(),
			typecheck: emptyValidationResult(),
			test: emptyValidationResult(),
			coverage: emptyValidationResult(),
			patterns: emptyValidationResult(),
		};
		(results as Record<string, unknown>).complexity = {
			passed: false,
			maxComplexityFound: 15,
			violations: [
				{ file: "src/foo.ts", line: 42, name: "doTheThing", complexity: 15, threshold: 10 },
			],
			duration: 5,
		};

		expect(() =>
			generateReport({ feature: "test", mode: "verify-local", results, coverageTarget: 80 }),
		).not.toThrow();
	});

	it("surfaces each complexity violation as an issue with file, line, and a readable message", () => {
		const results: Record<string, ValidationResult> = {
			lint: emptyValidationResult(),
			typecheck: emptyValidationResult(),
			test: emptyValidationResult(),
			coverage: emptyValidationResult(),
			patterns: emptyValidationResult(),
		};
		(results as Record<string, unknown>).complexity = {
			passed: false,
			maxComplexityFound: 15,
			violations: [
				{ file: "src/foo.ts", line: 42, name: "doTheThing", complexity: 15, threshold: 10 },
			],
			duration: 5,
		};

		const report = generateReport({ feature: "test", mode: "verify-local", results, coverageTarget: 80 });

		expect(report.issues).toContainEqual(
			expect.objectContaining({
				file: "src/foo.ts",
				line: 42,
				message: expect.stringContaining("doTheThing"),
			}),
		);
	});
});
