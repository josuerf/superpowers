import { detectCommentedOutLogic } from "../../../lib/harness/validators/commented-out";
import { buildReviewPlan } from "../../../lib/harness/reviewers/planner";
import type { ReviewAggressivenessConfig } from "../../../lib/harness/types";

const JAVA_DIFF = `diff --git a/src/main/java/EmpenhoRepository.java b/src/main/java/EmpenhoRepository.java
index 1111111..2222222 100644
--- a/src/main/java/EmpenhoRepository.java
+++ b/src/main/java/EmpenhoRepository.java
@@ -10,6 +10,6 @@ public class EmpenhoRepository {
     public List<Empenho> find(Long entidade) {
         return query
-            .where(e.exercicio.eq(exercicio))
+            // .where(e.exercicio.eq(exercicio))
             .fetch();
     }
@@ -40,4 +40,6 @@ public class EmpenhoRepository {
     void validar(Empenho e) {
-        if (e == null) throw new IllegalArgumentException();
+        //if (e == null) throw new IllegalArgumentException();
+        //throw new NegocioException("saldo");
+        // total = total.add(e.getValor());
     }
`;

const SQL_DIFF = `diff --git a/db/query.sql b/db/query.sql
--- a/db/query.sql
+++ b/db/query.sql
@@ -1,3 +1,3 @@
 SELECT * FROM empenho e
 WHERE e.entidade = :entidade
--AND e.selecionado = 1
+-- AND e.selecionado = 1
`;

const PROSE_DIFF = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,1 +1,4 @@
 const x = 1;
+// This function returns the total for the entity.
+// Note: where possible, prefer the cached value
+const y = 2;
diff --git a/README.md b/README.md
--- a/README.md
+++ b/README.md
@@ -1,1 +1,2 @@
 # Title
+# where x = 1
`;

describe("detectCommentedOutLogic", () => {
	test("flags a commented-out WHERE clause as business-rule with file:line", () => {
		const f = detectCommentedOutLogic(JAVA_DIFF);
		const where = f.find((x) => x.issue.includes(".where("));
		expect(where).toBeDefined();
		expect(where!.category).toBe("business-rule");
		expect(where!.file).toBe("src/main/java/EmpenhoRepository.java");
		expect(where!.line).toBe(12);
		expect(where!.severity).toBe("Medium");
	});

	test("flags commented-out guard, throw and assignment as correctness", () => {
		const f = detectCommentedOutLogic(JAVA_DIFF).filter(
			(x) => x.category === "correctness",
		);
		expect(f.map((x) => x.line)).toEqual([41, 42, 43]);
		expect(f[0].issue).toContain("a guard");
		expect(f[1].issue).toContain("a throw");
		expect(f[2].issue).toContain("an assignment");
	});

	test("flags a SQL `-- AND` clause", () => {
		const f = detectCommentedOutLogic(SQL_DIFF);
		expect(f).toHaveLength(1);
		expect(f[0]).toMatchObject({
			file: "db/query.sql",
			line: 3,
			category: "business-rule",
		});
	});

	test("ignores prose comments and markdown headings", () => {
		expect(detectCommentedOutLogic(PROSE_DIFF)).toEqual([]);
	});

	test("ignores removed lines and empty diffs", () => {
		expect(detectCommentedOutLogic("")).toEqual([]);
		expect(
			detectCommentedOutLogic(
				"--- a/x.ts\n+++ b/x.ts\n@@ -1,1 +1,0 @@\n-// .where(a)\n",
			),
		).toEqual([]);
	});
});

describe("buildReviewPlan wiring", () => {
	const config: ReviewAggressivenessConfig = {
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
			focusCategories: [],
			severityThreshold: "High",
		},
		standards: { autoDetect: true, paths: [] },
		exclude: { useDefaults: true, patterns: [] },
		reportOutput: { saveToHarness: true, format: "both" },
	};

	test("the plan carries the warnings and the chunk prompt lists them", () => {
		const plan = buildReviewPlan({
			feature: "f",
			changedFiles: ["db/query.sql"],
			gitDiff: SQL_DIFF,
			config,
			generatedAt: "2026-09-25T00:00:00.000Z",
		});
		expect(plan.deterministicFindings).toHaveLength(1);
		expect(plan.chunks[0].prompt).toContain(
			"## Deterministic Pre-check: commented out instead of decided",
		);
		expect(plan.chunks[0].prompt).toContain("`db/query.sql:3`");
	});

	test("a clean diff adds no section and no field", () => {
		const plan = buildReviewPlan({
			feature: "f",
			changedFiles: ["src/a.ts"],
			gitDiff: PROSE_DIFF,
			config,
			generatedAt: "2026-09-25T00:00:00.000Z",
		});
		expect(plan.deterministicFindings).toBeUndefined();
		expect(plan.chunks[0].prompt).not.toContain("Deterministic Pre-check");
	});
});
