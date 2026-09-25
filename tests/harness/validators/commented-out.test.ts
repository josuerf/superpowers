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

	describe("SQL `--` in the middle of the line", () => {
		// Shape of api-licitacao MR 6287: SQL inside a Java text block whose
		// opening `"""` is outside the hunk.
		const JAVA_SQL_DIFF = `diff --git a/src/BiddingResultFilterImpl.java b/src/BiddingResultFilterImpl.java
--- a/src/BiddingResultFilterImpl.java
+++ b/src/BiddingResultFilterImpl.java
@@ -445,6 +445,6 @@ public class BiddingResultFilterImpl {
 				inner join contrato c on c.id = ca.contrato_id
-				inner join tab_temp ttsi on cai.item_id = ttsi.id and c.fornecedor_uuid = ttsi.fornecedorUuid
+				inner join tab_temp ttsi on cai.item_id = ttsi.id --and c.fornecedor_uuid = ttsi.fornecedorUuid
 				,valor_aditivos as(
 					select
-						cai.fornecedorUuid as fornecedorUuid,
+						--cai.fornecedorUuid as fornecedorUuid,
 						sum(cai.quantidade * cai.valor) as valor_aditivos
 					from aditivos cai
-					group by cai.solicitacao_item_id, cai.fornecedorUuid
+					group by cai.solicitacao_item_id--, cai.fornecedorUuid
 				)
`;

		test("flags a commented join condition, SELECT column and GROUP BY column", () => {
			const f = detectCommentedOutLogic(JAVA_SQL_DIFF);
			expect(f.map((x) => [x.line, x.category])).toEqual([
				[446, "business-rule"],
				[449, "correctness"],
				[452, "business-rule"],
			]);
			expect(f[0].issue).toContain("a WHERE/filter clause");
			expect(f[1].issue).toContain("a SELECT column");
			expect(f[2].issue).toContain("a GROUP BY/ORDER BY column");
			expect(f[2].issue).toContain("cai.fornecedorUuid");
		});

		test("flags it in .sql files, @Query strings and Java text blocks", () => {
			const diff = `diff --git a/db/q.sql b/db/q.sql
--- a/db/q.sql
+++ b/db/q.sql
@@ -1,1 +1,2 @@
 select a from t
+where t.x = 1 -- and t.y = 2
diff --git a/src/Repo.java b/src/Repo.java
--- a/src/Repo.java
+++ b/src/Repo.java
@@ -10,1 +10,6 @@
 class Repo {
+    @Query(value = "select * from lr where lr.a = :a --and lr.flag = 'S' ", nativeQuery = true)
+    String SQL = """
+        select x.id,
+               x.total--, x.fornecedor
+        """;
`;
			const f = detectCommentedOutLogic(diff);
			expect(f.map((x) => `${x.file}:${x.line}`)).toEqual([
				"db/q.sql:2",
				"src/Repo.java:11",
				"src/Repo.java:14",
			]);
		});

		test("does not treat decrements, CLI flags or quoted `--` as SQL comments", () => {
			const diff = `diff --git a/src/A.java b/src/A.java
--- a/src/A.java
+++ b/src/A.java
@@ -1,1 +1,7 @@
 class A {
+    for (int i = n; i >= 0; i--) { total--; }
+    f(i--, j.value);
+    while (n-- > 0) { x = count--, y.z; }
+    --i;
+    args.includes("--help");
+    String s = "a--, b.c";
diff --git a/db/q.sql b/db/q.sql
--- a/db/q.sql
+++ b/db/q.sql
@@ -1,1 +1,3 @@
 select 1
+where t.name = '--, t.other'
+select t.total -- the running total, see t.notes
diff --git a/docs/a.md b/docs/a.md
--- a/docs/a.md
+++ b/docs/a.md
@@ -1,1 +1,2 @@
 # A
+and then -- see config.yml, x.y
diff --git a/run.sh b/run.sh
--- a/run.sh
+++ b/run.sh
@@ -1,1 +1,2 @@
 #!/bin/sh
+set -- a.b c.d,
`;
			expect(detectCommentedOutLogic(diff)).toEqual([]);
		});
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
