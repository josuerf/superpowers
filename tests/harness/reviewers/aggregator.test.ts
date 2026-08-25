import {
	aggregateCarrascoResponses,
	formatAggregatedMarkdown,
	evaluateGateStatus,
	computeDiffFingerprint,
	type CarrascoResponse,
} from "../../../lib/harness/reviewers/aggregator";
import type { ReviewAggressivenessConfig } from "../../../lib/harness/types";

function raConfig(
	overrides: Partial<ReviewAggressivenessConfig> = {},
): ReviewAggressivenessConfig {
	return {
		enabled: true,
		level: "carrasco",
		chunking: {
			enabled: true,
			maxFilesPerChunk: 10,
			maxLinesPerChunk: 2000,
			byTopic: true,
		},
		carrasco: {
			redTeamEnabled: true,
			redTeamParallel: true,
			requireReproducibleTrigger: true,
			focusCategories: ["logic-bugs"],
			severityThreshold: "High",
		},
		standards: { autoDetect: true, paths: [] },
		exclude: { useDefaults: true, patterns: [] },
		reportOutput: { saveToHarness: true, format: "both" },
		...overrides,
	};
}

function decisionResponse(
	chunkId: string,
	action: string,
	findings: Array<{ severity: string; file: string; line: number }>,
): CarrascoResponse {
	const json = {
		harness_action: action,
		metrics: {
			total_findings: findings.length,
			critical_high_count: findings.filter(
				(f) => f.severity === "High" || f.severity === "Critical",
			).length,
		},
		asi_target:
			findings.length > 0
				? {
						file: findings[0].file,
						line: findings[0].line,
						issue_summary: "summary",
						fix_instruction: "fix it",
					}
				: null,
		findings: findings.map((f) => ({
			severity: f.severity,
			file: f.file,
			line: f.line,
			issue: "issue",
			suggestion: "suggestion",
		})),
	};
	return {
		chunkId,
		text: `<!-- REVIEWER_DECISION -->\n\`\`\`json\n${JSON.stringify(json)}\n\`\`\`\n<!-- /REVIEWER_DECISION -->`,
	};
}

const TS = "2026-06-10T00:00:00.000Z";

describe("aggregateCarrascoResponses", () => {
	test("BLOCK when a finding reaches the threshold", () => {
		const report = aggregateCarrascoResponses(
			"feat",
			[
				decisionResponse("chunk-1", "BLOCK", [
					{ severity: "High", file: "a.ts", line: 5 },
				]),
			],
			raConfig(),
			TS,
		);
		expect(report.harness_action).toBe("BLOCK");
		expect(report.metrics.critical_high_count).toBe(1);
		expect(report.asi_target?.file).toBe("a.ts");
	});

	test("NEEDS_HUMAN_REVIEW when only below-threshold findings exist", () => {
		const report = aggregateCarrascoResponses(
			"feat",
			[
				decisionResponse("chunk-1", "NEEDS_HUMAN_REVIEW", [
					{ severity: "Medium", file: "a.ts", line: 1 },
				]),
			],
			raConfig(),
			TS,
		);
		expect(report.harness_action).toBe("NEEDS_HUMAN_REVIEW");
	});

	test("APPROVE when no findings", () => {
		const report = aggregateCarrascoResponses(
			"feat",
			[decisionResponse("chunk-1", "APPROVE", [])],
			raConfig(),
			TS,
		);
		expect(report.harness_action).toBe("APPROVE");
	});

	test("unparseable chunks are tracked and force human review", () => {
		const report = aggregateCarrascoResponses(
			"feat",
			[{ chunkId: "chunk-1", text: "no decision block here" }],
			raConfig(),
			TS,
		);
		expect(report.metrics.chunks_unparseable).toBe(1);
		expect(report.unparseableChunks).toContain("chunk-1");
		expect(report.harness_action).toBe("NEEDS_HUMAN_REVIEW");
	});

	test("aggregates findings across multiple chunks and sorts by severity", () => {
		const report = aggregateCarrascoResponses(
			"feat",
			[
				decisionResponse("chunk-1", "NEEDS_HUMAN_REVIEW", [
					{ severity: "Medium", file: "a.ts", line: 1 },
				]),
				decisionResponse("chunk-2", "BLOCK", [
					{ severity: "Critical", file: "b.ts", line: 2 },
				]),
			],
			raConfig(),
			TS,
		);
		expect(report.harness_action).toBe("BLOCK");
		expect(report.findings[0].severity).toBe("Critical");
		expect(report.metrics.total_findings).toBe(2);
	});

	test("records a per-chunk verdict for every parseable response, with files attached from the caller's map", () => {
		const report = aggregateCarrascoResponses(
			"feat",
			[
				decisionResponse("chunk-1", "BLOCK", [
					{ severity: "High", file: "a.ts", line: 5 },
				]),
				decisionResponse("chunk-2", "APPROVE", []),
			],
			raConfig(),
			TS,
			{ "chunk-1": ["a.ts"], "chunk-2": ["b.ts"] },
		);
		expect(report.chunkVerdicts).toHaveLength(2);
		const c1 = report.chunkVerdicts.find((c) => c.chunkId === "chunk-1")!;
		expect(c1.action).toBe("BLOCK");
		expect(c1.files).toEqual(["a.ts"]);
		expect(c1.findings).toHaveLength(1);
		const c2 = report.chunkVerdicts.find((c) => c.chunkId === "chunk-2")!;
		expect(c2.action).toBe("APPROVE");
	});

	test("chunkVerdicts.files defaults to empty array when no map is provided", () => {
		const report = aggregateCarrascoResponses(
			"feat",
			[decisionResponse("chunk-1", "APPROVE", [])],
			raConfig(),
			TS,
		);
		expect(report.chunkVerdicts[0].files).toEqual([]);
	});

	test("unparseable chunks do not produce a chunkVerdict", () => {
		const report = aggregateCarrascoResponses(
			"feat",
			[{ chunkId: "chunk-1", text: "no decision block here" }],
			raConfig(),
			TS,
		);
		expect(report.chunkVerdicts).toHaveLength(0);
	});

	test("threshold Critical does not block on a High finding", () => {
		const report = aggregateCarrascoResponses(
			"feat",
			[
				decisionResponse("chunk-1", "NEEDS_HUMAN_REVIEW", [
					{ severity: "High", file: "a.ts", line: 1 },
				]),
			],
			raConfig({
				carrasco: { ...raConfig().carrasco, severityThreshold: "Critical" },
			}),
			TS,
		);
		expect(report.harness_action).toBe("NEEDS_HUMAN_REVIEW");
	});
});

describe("formatAggregatedMarkdown", () => {
	test("includes the verdict and findings", () => {
		const report = aggregateCarrascoResponses(
			"feat",
			[
				decisionResponse("chunk-1", "BLOCK", [
					{ severity: "High", file: "a.ts", line: 5 },
				]),
			],
			raConfig(),
			TS,
		);
		const md = formatAggregatedMarkdown(report);
		expect(md).toContain("BLOCK");
		expect(md).toContain("a.ts:5");
	});
});

describe("evaluateGateStatus / computeDiffFingerprint (git-backed)", () => {
	test("computeDiffFingerprint returns a hash inside a git repo", () => {
		const fp = computeDiffFingerprint(process.cwd());
		expect(typeof fp === "string" && fp.length === 64).toBe(true);
	});

	test("gate is absent when no decision exists for the feature", () => {
		const status = evaluateGateStatus(
			process.cwd(),
			"nonexistent-feature-zzz-12345",
		);
		expect(status.gate).toBe("absent");
	});
});
