import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import {
	aggregateCarrascoResponses,
	evaluateGateStatus,
	saveCarrascoReview,
	featureReviewDir,
	type CarrascoResponse,
} from "../../../lib/harness/reviewers/aggregator";
import {
	parseRedTeamReport,
	applyRedTeamReport,
	foldRedTeamReport,
	prepareRedTeamRecheck,
} from "../../../lib/harness/reviewers/red-team-report";
import type { ReviewAggressivenessConfig } from "../../../lib/harness/types";

function raConfig(severityThreshold = "High"): ReviewAggressivenessConfig {
	return {
		enabled: true,
		level: "carrasco",
		chunking: { enabled: true, maxFilesPerChunk: 10, maxLinesPerChunk: 2000, byTopic: true },
		carrasco: {
			redTeamEnabled: true,
			redTeamParallel: true,
			requireReproducibleTrigger: true,
			focusCategories: ["logic-bugs"],
			severityThreshold,
		},
		standards: { autoDetect: true, paths: [] },
		exclude: { useDefaults: true, patterns: [] },
		reportOutput: { saveToHarness: true, format: "json" },
	} as ReviewAggressivenessConfig;
}

const APPROVE: CarrascoResponse = {
	chunkId: "chunk-1",
	text: '<!-- REVIEWER_DECISION -->\n```json\n{"harness_action":"APPROVE","metrics":{"total_findings":0,"critical_high_count":0},"asi_target":null,"findings":[]}\n```\n<!-- /REVIEWER_DECISION -->',
};

const TS = "2026-09-25T00:00:00.000Z";

const REPORT_HIGH = `## Breakage Report

### High — Retry double-charges the card
**Trigger:** two POST /pay with the same idempotency key 5 ms apart
**What breaks:** both are charged
**Root cause:** src/pay.ts:42 reads then writes without a lock
**Test case:**
\`\`\`ts
// skeleton
\`\`\`

### Medium — Very long memo truncates silently
**Trigger:** 10 MB memo
**What breaks:** memo cut
**Root cause:** src/memo.ts:7

## Summary
- Total scenarios found: 2
- Critical: 0 | High: 1 | Medium: 1
- Recommendation: Fix critical issues before merge
`;

const REPORT_CLEAN = `## Breakage Report

I could not find ways to break the code.

## Summary
- Total scenarios found: 0
- Critical: 0 | High: 0 | Medium: 0
- Recommendation: Acceptable risk
`;

describe("parseRedTeamReport", () => {
	test("counts entries by severity and extracts file:line from the root cause", () => {
		const r = parseRedTeamReport(REPORT_HIGH);
		expect(r).not.toBeNull();
		expect(r!.critical).toBe(0);
		expect(r!.high).toBe(1);
		expect(r!.medium).toBe(1);
		const high = r!.entries.find((e) => e.severity === "High")!;
		expect(high.file).toBe("src/pay.ts");
		expect(high.line).toBe(42);
	});

	test("an explicit clean report parses to zero findings", () => {
		const r = parseRedTeamReport(REPORT_CLEAN);
		expect(r).not.toBeNull();
		expect(r!.critical + r!.high + r!.medium).toBe(0);
	});

	test("a summary that counts more than the entries wins (conservative)", () => {
		const r = parseRedTeamReport("## Breakage Report\n\n## Summary\n- Critical: 1 | High: 2 | Medium: 0\n");
		expect(r!.critical).toBe(1);
		expect(r!.high).toBe(2);
	});

	test("prose with no entries, no summary counts and no explicit clean verdict is unreadable", () => {
		expect(parseRedTeamReport("I looked around and it seems mostly fine, some risk in pay.ts.")).toBeNull();
		expect(parseRedTeamReport("")).toBeNull();
	});
});

describe("applyRedTeamReport", () => {
	const approved = () => aggregateCarrascoResponses("feat", [APPROVE], raConfig(), TS);

	test("a red-team High blocks an otherwise approved review at the High threshold", () => {
		const out = applyRedTeamReport(approved(), REPORT_HIGH, raConfig());
		expect(out.harness_action).toBe("BLOCK");
		expect(out.metrics.critical_high_count).toBe(1);
		expect(out.findings.some((f) => f.file === "src/pay.ts" && f.line === 42)).toBe(true);
		expect(out.redTeam).toMatchObject({ status: "parsed", high: 1, blocking: 1 });
	});

	test("the same threshold applies: with Critical, a red-team High does not block", () => {
		const base = aggregateCarrascoResponses("feat", [APPROVE], raConfig("Critical"), TS);
		const out = applyRedTeamReport(base, REPORT_HIGH, raConfig("Critical"));
		expect(out.harness_action).toBe("APPROVE");
		expect(out.redTeam!.blocking).toBe(0);
	});

	test("a clean red-team report leaves the verdict alone", () => {
		const out = applyRedTeamReport(approved(), REPORT_CLEAN, raConfig());
		expect(out.harness_action).toBe("APPROVE");
	});

	test("an unreadable red-team report is NEEDS_HUMAN_REVIEW, never a silent pass", () => {
		const out = applyRedTeamReport(approved(), "garbage without structure", raConfig());
		expect(out.harness_action).toBe("NEEDS_HUMAN_REVIEW");
		expect(out.redTeam!.status).toBe("unreadable");
	});

	test("an unreadable red-team report never downgrades a BLOCK", () => {
		const blocked = { ...approved(), harness_action: "BLOCK" as const };
		expect(applyRedTeamReport(blocked, "garbage", raConfig()).harness_action).toBe("BLOCK");
	});
});

describe("gate-status and red-team.md", () => {
	let repo: string;
	beforeEach(() => {
		repo = fs.mkdtempSync(path.join(os.tmpdir(), "rt-gate-"));
		spawnSync("git", ["init", "-q"], { cwd: repo });
		fs.writeFileSync(path.join(repo, "a.ts"), "export const a = 1;\n");
		fs.writeFileSync(path.join(repo, ".gitignore"), ".harness/\n");
	});
	afterEach(() => fs.rmSync(repo, { recursive: true, force: true }));

	test("decision.json carries the red-team outcome for review recheck", () => {
		const report = applyRedTeamReport(
			aggregateCarrascoResponses("feat", [APPROVE], raConfig(), TS),
			REPORT_HIGH,
			raConfig(),
		);
		const saved = saveCarrascoReview(repo, report, raConfig());
		const decision = JSON.parse(fs.readFileSync(saved.decisionPath, "utf8"));
		expect(decision.redTeam).toMatchObject({ status: "parsed", blocking: 1 });
		expect(evaluateGateStatus(repo, "feat").gate).toBe("block");
	});

	test("a red-team report written after the aggregated decision makes the gate stale", () => {
		const report = aggregateCarrascoResponses("feat", [APPROVE], raConfig(), TS);
		const saved = saveCarrascoReview(repo, report, raConfig());
		expect(evaluateGateStatus(repo, "feat").gate).toBe("pass");
		const rt = path.join(featureReviewDir(repo, "feat"), "red-team.md");
		fs.writeFileSync(rt, REPORT_HIGH);
		const later = new Date(fs.statSync(saved.decisionPath).mtimeMs + 5000);
		fs.utimesSync(rt, later, later);
		const status = evaluateGateStatus(repo, "feat");
		expect(status.gate).toBe("block");
		expect(status.reason).toMatch(/red team/i);
	});
});

describe("foldRedTeamReport (review directory)", () => {
	let dir: string;
	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), "rt-dir-"));
	});
	afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
	const approved = () => aggregateCarrascoResponses("feat", [APPROVE], raConfig(), TS);

	test("no red team planned and no report: verdict untouched, no redTeam field", () => {
		const out = foldRedTeamReport(approved(), dir, raConfig());
		expect(out.harness_action).toBe("APPROVE");
		expect(out.redTeam).toBeUndefined();
	});

	test("red-team.md present: read and folded", () => {
		fs.writeFileSync(path.join(dir, "red-team.md"), REPORT_HIGH);
		expect(foldRedTeamReport(approved(), dir, raConfig()).harness_action).toBe("BLOCK");
	});

	test("red team planned (prompt written) but no report: NEEDS_HUMAN_REVIEW, not a silent pass", () => {
		fs.writeFileSync(path.join(dir, "red-team-prompt.md"), "## Red Team Context\n");
		const out = foldRedTeamReport(approved(), dir, raConfig());
		expect(out.harness_action).toBe("NEEDS_HUMAN_REVIEW");
		expect(out.redTeam!.status).toBe("missing");
	});
});

describe("prepareRedTeamRecheck", () => {
	let dir: string;
	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), "rt-recheck-"));
		fs.writeFileSync(
			path.join(dir, "plan.json"),
			JSON.stringify({ redTeam: { agent: "superpowers-prepared:red-team", flags: ["security"], focusCategories: [], parallel: true, prompt: "old" } }),
		);
		fs.writeFileSync(path.join(dir, "red-team-prompt.md"), "old prompt\n");
		fs.writeFileSync(path.join(dir, "red-team.md"), REPORT_HIGH);
	});
	afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

	test("a blocking red team is re-dispatched against the fresh diff; the old report is kept aside", () => {
		const r = prepareRedTeamRecheck(dir, { status: "parsed", critical: 0, high: 1, medium: 1, blocking: 1 }, "diff --git a/src/pay.ts", raConfig());
		expect(r).not.toBeNull();
		expect(fs.readFileSync(path.join(dir, "red-team-prompt.md"), "utf8")).toContain("diff --git a/src/pay.ts");
		expect(fs.existsSync(path.join(dir, "red-team.md"))).toBe(false);
		expect(fs.readFileSync(path.join(dir, "red-team.prev.md"), "utf8")).toContain("Retry double-charges");
	});

	test("a red team that blocked nothing is left alone", () => {
		expect(prepareRedTeamRecheck(dir, { status: "parsed", critical: 0, high: 0, medium: 1, blocking: 0 }, "d", raConfig())).toBeNull();
		expect(fs.existsSync(path.join(dir, "red-team.md"))).toBe(true);
	});
});
