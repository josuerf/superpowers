import {
	buildReviewPlan,
	buildRecheckPrompt,
	splitDiffByFile,
	countChangedLines,
} from "../../../lib/harness/reviewers/planner";
import type {
	ReviewAggressivenessConfig,
	ReviewerFinding,
} from "../../../lib/harness/types";

const DIFF = `diff --git a/src/auth/login.ts b/src/auth/login.ts
index 1111111..2222222 100644
--- a/src/auth/login.ts
+++ b/src/auth/login.ts
@@ -1,3 +1,4 @@
 export function login() {
+  console.log("hi");
 }
diff --git a/src/billing/charge.ts b/src/billing/charge.ts
index 3333333..4444444 100644
--- a/src/billing/charge.ts
+++ b/src/billing/charge.ts
@@ -1,2 +1,3 @@
 export function charge() {}
+const fee = 1;
-const old = 0;
`;

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

describe("splitDiffByFile", () => {
	test("splits a multi-file diff keyed by b/ path", () => {
		const map = splitDiffByFile(DIFF);
		expect([...map.keys()]).toEqual([
			"src/auth/login.ts",
			"src/billing/charge.ts",
		]);
		expect(map.get("src/auth/login.ts")).toContain("console.log");
	});
	test("empty diff yields empty map", () => {
		expect(splitDiffByFile("").size).toBe(0);
	});
});

describe("countChangedLines", () => {
	test("counts +/- excluding headers", () => {
		const section = splitDiffByFile(DIFF).get("src/billing/charge.ts")!;
		// one added (+const fee) + one removed (-const old) = 2
		expect(countChangedLines(section)).toBe(2);
	});
});

describe("buildReviewPlan", () => {
	test("single chunk under limits, prompt carries diff and posture", () => {
		const plan = buildReviewPlan({
			feature: "feat-x",
			changedFiles: ["src/auth/login.ts", "src/billing/charge.ts"],
			gitDiff: DIFF,
			config: raConfig(),
			generatedAt: "2026-06-10T00:00:00.000Z",
		});
		expect(plan.totalFiles).toBe(2);
		expect(plan.totalChunks).toBe(1);
		expect(plan.chunks[0].prompt).toContain("console.log");
		expect(plan.chunks[0].prompt).toContain("CARRASCO");
	});

	test("chunks by topic when over limits, each prompt isolated to its files", () => {
		const plan = buildReviewPlan({
			feature: "feat-x",
			changedFiles: ["src/auth/login.ts", "src/billing/charge.ts"],
			gitDiff: DIFF,
			config: raConfig({
				chunking: {
					enabled: true,
					maxFilesPerChunk: 1,
					maxLinesPerChunk: 2000,
					byTopic: true,
				},
			}),
			generatedAt: "2026-06-10T00:00:00.000Z",
		});
		expect(plan.totalChunks).toBe(2);
		const authChunk = plan.chunks.find((c) =>
			c.files.includes("src/auth/login.ts"),
		)!;
		expect(authChunk.prompt).toContain("console.log");
		expect(authChunk.prompt).not.toContain("const fee");
	});

	test("standard level produces no posture directive", () => {
		const plan = buildReviewPlan({
			feature: "feat-x",
			changedFiles: ["src/auth/login.ts"],
			gitDiff: DIFF,
			config: raConfig({ level: "standard" }),
			generatedAt: "2026-06-10T00:00:00.000Z",
		});
		expect(plan.chunks[0].prompt).not.toContain("CARRASCO");
	});
});

describe("buildRecheckPrompt", () => {
	const priorFindings: ReviewerFinding[] = [
		{
			severity: "High",
			file: "src/auth/login.ts",
			line: 2,
			issue: "logs a secret",
			suggestion: "remove the console.log",
		},
	];
	const fixDiff = `diff --git a/src/auth/login.ts b/src/auth/login.ts
--- a/src/auth/login.ts
+++ b/src/auth/login.ts
@@ -1,4 +1,3 @@
 export function login() {
-  console.log("hi");
 }
`;

	test("includes only the targeted chunk's files, prior findings, and the fix diff — not an unrelated chunk's content", () => {
		const prompt = buildRecheckPrompt({
			chunkId: "chunk-1",
			files: ["src/auth/login.ts"],
			priorFindings,
			freshDiff: fixDiff,
			config: raConfig(),
		});
		expect(prompt).toContain("src/auth/login.ts");
		expect(prompt).toContain("logs a secret");
		expect(prompt).toContain("remove the console.log");
		expect(prompt).toContain('console.log("hi");');
		expect(prompt).not.toContain("src/billing/charge.ts");
		expect(prompt).not.toContain("const fee");
	});

	test("includes the controller's note when provided", () => {
		const prompt = buildRecheckPrompt({
			chunkId: "chunk-1",
			files: ["src/auth/login.ts"],
			priorFindings,
			freshDiff: fixDiff,
			note: "Also verify the new rate-limit check requested in the follow-up.",
			config: raConfig(),
		});
		expect(prompt).toContain("Also verify the new rate-limit check");
	});

	test("omits the note section when none is given", () => {
		const prompt = buildRecheckPrompt({
			chunkId: "chunk-1",
			files: ["src/auth/login.ts"],
			priorFindings,
			freshDiff: fixDiff,
			config: raConfig(),
		});
		expect(prompt).not.toContain("Note from the controller");
	});

	test("standard level produces no posture directive", () => {
		const prompt = buildRecheckPrompt({
			chunkId: "chunk-1",
			files: ["src/auth/login.ts"],
			priorFindings,
			freshDiff: fixDiff,
			config: raConfig({ level: "standard" }),
		});
		expect(prompt).not.toContain("CARRASCO");
	});

	test("handles a chunk with no prior findings recorded", () => {
		const prompt = buildRecheckPrompt({
			chunkId: "chunk-1",
			files: ["src/auth/login.ts"],
			priorFindings: [],
			freshDiff: fixDiff,
			config: raConfig(),
		});
		expect(prompt).toContain("no prior findings recorded");
	});
});
