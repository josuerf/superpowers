import { parseSpecReviewReport } from "../../../lib/harness/reviewers/spec-review-parser.js";

describe("parseSpecReviewReport", () => {
	it("parses valid report with markers", () => {
		const response = `
Some review text here.

<!-- SPEC_REVIEW_REPORT -->
\`\`\`json
{
  "taskId": "Task 1",
  "verdict": "PASS",
  "requirements_met": ["AC1", "AC2"],
  "requirements_missing": [],
  "extra_scope": [],
  "files_reviewed": ["src/foo.ts"],
  "concerns": [],
  "timestamp": "2026-05-21T10:00:00Z"
}
\`\`\`
<!-- /SPEC_REVIEW_REPORT -->
`;
		const result = parseSpecReviewReport(response);
		expect(result).not.toBeNull();
		expect(result!.verdict).toBe("PASS");
		expect(result!.taskId).toBe("Task 1");
		expect(result!.requirements_met).toEqual(["AC1", "AC2"]);
		expect(result!.files_reviewed).toEqual(["src/foo.ts"]);
	});

	it("parses FAIL verdict", () => {
		const response = `
<!-- SPEC_REVIEW_REPORT -->
{"taskId":"Task 2","verdict":"FAIL","requirements_met":[],"requirements_missing":["AC3"],"extra_scope":[],"files_reviewed":["src/bar.ts"],"concerns":["Missing AC3"],"timestamp":"2026-05-21T10:00:00Z"}
<!-- /SPEC_REVIEW_REPORT -->
`;
		const result = parseSpecReviewReport(response);
		expect(result).not.toBeNull();
		expect(result!.verdict).toBe("FAIL");
		expect(result!.requirements_missing).toEqual(["AC3"]);
	});

	it("returns null for malformed JSON", () => {
		const response = `
<!-- SPEC_REVIEW_REPORT -->
{invalid json}
<!-- /SPEC_REVIEW_REPORT -->
`;
		const result = parseSpecReviewReport(response);
		expect(result).toBeNull();
	});

	it("returns null when markers are missing", () => {
		const response = `{"verdict": "PASS", "requirements_met": [], "requirements_missing": [], "files_reviewed": []}`;
		const result = parseSpecReviewReport(response);
		// Falls back to JSON block detection — if it has the required fields, it parses
		// But without markers, it tries JSON code block fallback
		expect(result).toBeNull();
	});

	it("falls back to JSON code block when markers absent", () => {
		const response = `
\`\`\`json
{"taskId":"Task 3","verdict":"PASS","requirements_met":["AC1"],"requirements_missing":[],"extra_scope":[],"files_reviewed":["src/a.ts"],"concerns":[],"timestamp":"2026-05-21T10:00:00Z"}
\`\`\`
`;
		const result = parseSpecReviewReport(response);
		expect(result).not.toBeNull();
		expect(result!.verdict).toBe("PASS");
	});

	it("rejects invalid verdict values", () => {
		const response = `
<!-- SPEC_REVIEW_REPORT -->
{"taskId":"Task 4","verdict":"MAYBE","requirements_met":[],"requirements_missing":[],"files_reviewed":[]}
<!-- /SPEC_REVIEW_REPORT -->
`;
		const result = parseSpecReviewReport(response);
		expect(result).toBeNull();
	});

	it("requires mandatory fields", () => {
		const response = `
<!-- SPEC_REVIEW_REPORT -->
{"taskId":"Task 5","verdict":"PASS"}
<!-- /SPEC_REVIEW_REPORT -->
`;
		const result = parseSpecReviewReport(response);
		expect(result).toBeNull();
	});
});
