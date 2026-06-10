import {
	buildReviewPlan,
	splitDiffByFile,
	countChangedLines,
} from "../../../lib/harness/reviewers/planner";
import type { ReviewAggressivenessConfig } from "../../../lib/harness/types";

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
