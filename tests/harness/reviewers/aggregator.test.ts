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
	findings: Array<{
		severity: string;
		file: string;
		line: number;
		category?: string;
		issue?: string;
	}>,
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
			...(f.category ? { category: f.category } : {}),
			file: f.file,
			line: f.line,
			issue: f.issue ?? "issue",
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

	// The reviewer is asked to judge whether sub-threshold findings "require
	// engineering judgement" (see getSeverityPolicy). When it answers APPROVE,
	// that judgement has been made. Overriding it on a raw finding count turns
	// the gate into "zero findings", which is not the published policy.
	test("APPROVE survives Low findings when the chunk approved", () => {
		const report = aggregateCarrascoResponses(
			"feat",
			[
				decisionResponse("chunk-1", "APPROVE", [
					{ severity: "Low", file: "a.ts", line: 1 },
					{ severity: "Low", file: "b.ts", line: 2 },
				]),
			],
			raConfig(),
			TS,
		);
		expect(report.harness_action).toBe("APPROVE");
		expect(report.findings).toHaveLength(2);
		expect(report.metrics.non_blocking_count).toBe(2);
	});

	test("a Low finding categorised security escalates to BLOCK", () => {
		const report = aggregateCarrascoResponses(
			"feat",
			[
				decisionResponse("chunk-1", "APPROVE", [
					{
						severity: "Low",
						category: "security",
						file: "a.rs",
						line: 340,
					},
				]),
			],
			raConfig(),
			TS,
		);
		expect(report.harness_action).toBe("BLOCK");
	});

	test("a Low finding categorised governance escalates to BLOCK", () => {
		const report = aggregateCarrascoResponses(
			"feat",
			[
				decisionResponse("chunk-1", "APPROVE", [
					{
						severity: "Low",
						category: "governance",
						file: "a.ts",
						line: 10,
					},
				]),
			],
			raConfig(),
			TS,
		);
		expect(report.harness_action).toBe("BLOCK");
	});

	test("an uncategorised Low finding does not escalate", () => {
		const report = aggregateCarrascoResponses(
			"feat",
			[
				decisionResponse("chunk-1", "APPROVE", [
					{ severity: "Low", file: "a.ts", line: 1 },
				]),
			],
			raConfig(),
			TS,
		);
		expect(report.harness_action).toBe("APPROVE");
	});

	test("a maintainability Low finding does not escalate", () => {
		const report = aggregateCarrascoResponses(
			"feat",
			[
				decisionResponse("chunk-1", "APPROVE", [
					{
						severity: "Low",
						category: "maintainability",
						file: "a.ts",
						line: 1,
					},
				]),
			],
			raConfig(),
			TS,
		);
		expect(report.harness_action).toBe("APPROVE");
	});

	// An explicit BLOCK from the reviewer is honoured even with no findings
	// attached: the chunk-level verdict is the reviewer's conclusion, and the
	// aggregator must not talk it out of a stop.
	test("an explicit chunk BLOCK is honoured with zero findings", () => {
		const report = aggregateCarrascoResponses(
			"feat",
			[decisionResponse("chunk-1", "BLOCK", [])],
			raConfig(),
			TS,
		);
		expect(report.harness_action).toBe("BLOCK");
	});

	test("Medium findings still stop for human review", () => {
		const report = aggregateCarrascoResponses(
			"feat",
			[
				decisionResponse("chunk-1", "APPROVE", [
					{ severity: "Medium", file: "a.ts", line: 1 },
				]),
			],
			raConfig(),
			TS,
		);
		expect(report.harness_action).toBe("NEEDS_HUMAN_REVIEW");
	});

	// Regressions built from verdicts that actually shipped, not invented
	// fixtures. Each one is a case where the old rule cost real time, so a
	// future change that reintroduces "any finding stops the line" fails here
	// with the card number attached.
	describe("regressions from real verdicts", () => {
		// C40 (forge, 2026-08-29): seven correction rounds, the same two Low
		// findings byte-identical every round. The reviewer had written "nenhuma
		// acao e necessaria agora" about the duplication and the implementer
		// agreed; the aggregator counted findings.length and asked again. The
		// card took 5h and its final verdict was APPROVE with zero findings,
		// reached by grinding the report empty rather than by fixing anything.
		test("C40: two Low findings the reviewer approved do not stop the card", () => {
			const report = aggregateCarrascoResponses(
				"C40",
				[
					decisionResponse("chunk-1", "APPROVE", [
						{
							severity: "Low",
							file: "src/core/paralelismo/proposta-teto.test.ts",
							line: 0,
							issue: "Nenhum teste prova explicitamente que uma proposta pendente EXISTENTE sobrevive a um novo ciclo.",
						},
						{
							severity: "Low",
							file: "src/core/paralelismo/avaliar-historico.test.ts",
							line: 19,
							issue: "Helper de teste amostraComCandidato duplicado entre avaliar-historico.test.ts e proposta-teto.test.ts.",
						},
					]),
				],
				raConfig(),
				TS,
			);
			expect(report.harness_action).toBe("APPROVE");
			expect(report.metrics.non_blocking_count).toBe(2);
		});

		// C41 (app, 2026-08-29, 18:57 verdict): chunk voted APPROVE with two Low
		// findings and critical_high_count 0, and the aggregate came back
		// NEEDS_HUMAN_REVIEW anyway. The card stopped in 'fix' without a commit.
		test("C41: chunk APPROVE with only Low findings aggregates to APPROVE", () => {
			const report = aggregateCarrascoResponses(
				"C41",
				[
					decisionResponse("chunk-1", "APPROVE", [
						{
							severity: "Low",
							file: "src/screens/cockpit/CockpitScreen.tsx",
							line: 453,
							issue: "`aprovarTeto` and `recusarTeto` duplicate nearly identical boilerplate.",
						},
						{
							severity: "Low",
							file: "src-tauri/src/teto/source.rs",
							line: 340,
							issue: "`decidir_proposta` passes `autor` directly as a `--autor` argv element to the forge sidecar.",
						},
					]),
				],
				raConfig(),
				TS,
			);
			expect(report.harness_action).toBe("APPROVE");
		});

		// Same verdict, with the argv-injection finding carrying the category
		// the reviewer should now emit. The identity of whoever operated is an
		// invariant of this product, so it must stop the line even though the
		// reviewer rated its blast radius Low - the whole reason category
		// exists as a field separate from severity.
		test("C41: the same Low finding blocks once categorised security", () => {
			const report = aggregateCarrascoResponses(
				"C41",
				[
					decisionResponse("chunk-1", "APPROVE", [
						{
							severity: "Low",
							file: "src/screens/cockpit/CockpitScreen.tsx",
							line: 453,
							issue: "`aprovarTeto` and `recusarTeto` duplicate nearly identical boilerplate.",
						},
						{
							severity: "Low",
							category: "security",
							file: "src-tauri/src/teto/source.rs",
							line: 340,
							issue: "`decidir_proposta` passes `autor` directly as a `--autor` argv element to the forge sidecar.",
						},
					]),
				],
				raConfig(),
				TS,
			);
			expect(report.harness_action).toBe("BLOCK");
		});

		// C41 re-reviewed at 20:42 after reviewfix1: three findings, one of them
		// Medium. Medium is the floor for "a human should look", so this one
		// SHOULD stop - and stopping here is correct behaviour, not the bug.
		// Pinned so that relaxing Low is never mistaken for relaxing Medium.
		test("C41 (post-fix): a Medium finding still stops for human review", () => {
			const report = aggregateCarrascoResponses(
				"C41",
				[
					decisionResponse("chunk-1", "APPROVE", [
						{
							severity: "Medium",
							file: "src/screens/cockpit/CockpitScreen.tsx",
							line: 453,
							issue: '`decidirTeto` uses a single in-flight guard key "teto" shared between aprovar/recusar.',
						},
						{
							severity: "Low",
							file: "src/screens/cockpit/CockpitScreen.tsx",
							line: 461,
							issue: "On successful decision, `getPropostaTeto()` refetch failure only logs to console.",
						},
						{
							severity: "Low",
							file: "src-tauri/src/teto/source.rs",
							line: 128,
							issue: "`decidir_proposta` passes `autor` as a bare CLI argument rather than via stdin.",
						},
					]),
				],
				raConfig(),
				TS,
			);
			expect(report.harness_action).toBe("NEEDS_HUMAN_REVIEW");
			expect(report.metrics.non_blocking_count).toBe(2);
		});
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
