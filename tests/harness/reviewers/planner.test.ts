import {
	buildReviewPlan,
	buildRecheckPrompt,
	splitDiffByFile,
	countChangedLines,
} from "../../../lib/harness/reviewers/planner";
import { parseRiskFlags } from "../../../lib/harness/reviewers/red-team";
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

	test("standard level still includes Decision Policy, matching the promise in base-prompt.md", () => {
		const plan = buildReviewPlan({
			feature: "feat-x",
			changedFiles: ["src/auth/login.ts"],
			gitDiff: DIFF,
			config: raConfig({ level: "standard" }),
			generatedAt: "2026-06-10T00:00:00.000Z",
		});
		expect(plan.chunks[0].prompt).toContain("## Decision Policy");
	});
});

describe("red-team dispatch from plan Risk flags", () => {
	const PLAN = [
		"### Task 1: Batch the ledger postings",
		"",
		"**Risk flags:** `concurrency` *(one or more of: `security` — touches auth; `concurrency` — shared state; `regulatory` — TCE export)*",
		"",
		"### Task 2: Rename a helper",
		"",
		"**Risk flags:** `none` *(one or more of: `security`, `data-migration`)*",
	].join("\n");

	const build = (planText: string | undefined, overrides = {}) =>
		buildReviewPlan({
			feature: "feat-x",
			changedFiles: ["src/auth/login.ts", "src/billing/charge.ts"],
			gitDiff: DIFF,
			config: raConfig(overrides),
			generatedAt: "2026-06-10T00:00:00.000Z",
			planText,
		});

	test("a plan with Risk flags: concurrency adds a red-team dispatch with the table's focus", () => {
		const plan = build(PLAN);
		expect(plan.totalChunks).toBe(1);
		expect(plan.redTeam).toBeDefined();
		expect(plan.redTeam!.agent).toBe("superpowers-prepared:red-team");
		expect(plan.redTeam!.flags).toEqual(["concurrency"]);
		expect(plan.redTeam!.focusCategories).toEqual([
			"concurrency-timing",
			"state-corruption",
			"error-cascading",
		]);
		expect(plan.redTeam!.parallel).toBe(true);
		expect(plan.redTeam!.prompt).toContain("Concurrency & timing");
		expect(plan.redTeam!.prompt).toContain("console.log");
	});

	test("redTeamEnabled: false switches the dispatch off", () => {
		const plan = build(PLAN, {
			carrasco: { ...raConfig().carrasco, redTeamEnabled: false },
		});
		expect(plan.redTeam).toBeUndefined();
	});

	test("redTeamParallel: false asks for a sequential dispatch", () => {
		const plan = build(PLAN, {
			carrasco: { ...raConfig().carrasco, redTeamParallel: false },
		});
		expect(plan.redTeam!.parallel).toBe(false);
	});

	test("no plan, or a plan whose flags are all none, adds nothing", () => {
		expect(build(undefined).redTeam).toBeUndefined();
		expect(build("**Risk flags:** `none`").redTeam).toBeUndefined();
	});

	test("parseRiskFlags ignores the explanation, unions tasks, reads legacy Security flag", () => {
		expect(parseRiskFlags(PLAN)).toEqual(["concurrency"]);
		expect(
			parseRiskFlags(
				"**Security flag:** `security`\n**Risk flags:** `data-migration, backward-compat`",
			),
		).toEqual(["security", "data-migration", "backward-compat"]);
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

	test("standard level still includes Decision Policy, matching the promise in base-prompt.md", () => {
		const prompt = buildRecheckPrompt({
			chunkId: "chunk-1",
			files: ["src/auth/login.ts"],
			priorFindings,
			freshDiff: fixDiff,
			config: raConfig({ level: "standard" }),
		});
		expect(prompt).toContain("## Decision Policy");
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
