import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import type {
	AggregatedReviewReport,
	AsiTarget,
	ChunkVerdict,
	HarnessAction,
	ReviewAggressivenessConfig,
	ReviewerDecision,
	ReviewerFinding,
	ReviewerSeverity,
} from "../types";
import { parseReviewerResponse } from "./parser";

const SEVERITY_RANK: Record<ReviewerSeverity, number> = {
	Low: 1,
	Medium: 2,
	High: 3,
	Critical: 4,
};

function thresholdRank(
	threshold: ReviewAggressivenessConfig["carrasco"]["severityThreshold"],
): number {
	return SEVERITY_RANK[threshold as ReviewerSeverity] ?? SEVERITY_RANK.High;
}

/**
 * A finding with no category is read as maintainability - the harmless end of
 * the scale. Defaulting the other way would make every reviewer that predates
 * the field escalate everything it reports.
 */
const DEFAULT_CATEGORY: NonNullable<ReviewerFinding["category"]> =
	"maintainability";

/** Categories that block regardless of severity. */
const ESCALATING_CATEGORIES: ReadonlySet<string> = new Set([
	"security",
	"governance",
]);

export interface CarrascoResponse {
	chunkId: string;
	text: string;
}

/**
 * Merge per-chunk carrasco verdicts into a single decision. The overall action
 * is recomputed from the merged findings against the configured severity
 * threshold (a per-chunk reviewer cannot see the whole picture), but an
 * explicit per-chunk BLOCK is always honored.
 */
export function aggregateCarrascoResponses(
	feature: string,
	responses: CarrascoResponse[],
	config: ReviewAggressivenessConfig,
	timestamp: string,
	chunkFilesById: Record<string, string[]> = {},
): AggregatedReviewReport {
	const findings: ReviewerFinding[] = [];
	const unparseableChunks: string[] = [];
	const decisions: ReviewerDecision[] = [];
	const chunkVerdicts: ChunkVerdict[] = [];

	for (const r of responses) {
		const decision = parseReviewerResponse(r.text);
		if (!decision) {
			unparseableChunks.push(r.chunkId);
			continue;
		}
		decisions.push(decision);
		findings.push(...decision.findings);
		chunkVerdicts.push({
			chunkId: r.chunkId,
			files: chunkFilesById[r.chunkId] ?? [],
			action: decision.harness_action,
			findings: decision.findings,
		});
	}

	const minRank = thresholdRank(config.carrasco.severityThreshold);
	const atOrAboveThreshold = findings.filter(
		(f) => SEVERITY_RANK[f.severity] >= minRank,
	);
	const criticalHigh = findings.filter(
		(f) => SEVERITY_RANK[f.severity] >= SEVERITY_RANK.High,
	);
	// Categories that stop the line at ANY severity. Severity measures blast
	// radius; these measure what kind of thing broke. A reviewer once rated
	// "the operator identity is passed as a raw argv element to a sidecar" as
	// Low - the same rating it gave a duplicated test helper in the same
	// verdict. No severity-only rule can keep the first and let the second by.
	const invariantFindings = findings.filter((f) =>
		ESCALATING_CATEGORIES.has(f.category ?? DEFAULT_CATEGORY),
	);
	// Medium is the floor for "a human should look at this". Below it, the
	// reviewer's own verdict decides - which is what getSeverityPolicy already
	// tells the reviewer: NEEDS_HUMAN_REVIEW is for findings that "require
	// engineering judgement", a judgement only it can make per finding.
	const mediumPlus = findings.filter(
		(f) => SEVERITY_RANK[f.severity] >= SEVERITY_RANK.Medium,
	);
	const anyChunkBlocked = decisions.some(
		(d) => d.harness_action === "BLOCK",
	);
	const anyChunkNeedsReview = decisions.some(
		(d) => d.harness_action === "NEEDS_HUMAN_REVIEW",
	);

	// Why this is not `findings.length > 0`: that condition made ANY finding,
	// at any severity, force NEEDS_HUMAN_REVIEW - which contradicts the policy
	// this same codebase hands the reviewer in getSeverityPolicy, and turns a
	// driver that only accepts APPROVE into a "zero findings" gate. Measured
	// cost of that gate: one card spent seven correction rounds on the same
	// two Low findings, byte-identical each round, which the reviewer itself
	// had marked as needing no action. Report them, do not stop for them.
	// Opt-out for a project that genuinely wants every finding to stop the
	// line. Absent means the new rule - the escape hatch has to be asked for.
	const noiseFloor = config.carrasco.noiseFloor !== false;
	const stopsForReview = noiseFloor ? mediumPlus.length > 0 : findings.length > 0;

	let action: HarnessAction | "APPROVE";
	if (
		atOrAboveThreshold.length > 0 ||
		invariantFindings.length > 0 ||
		anyChunkBlocked
	) {
		action = "BLOCK";
	} else if (
		stopsForReview ||
		anyChunkNeedsReview ||
		unparseableChunks.length > 0
	) {
		action = "NEEDS_HUMAN_REVIEW";
	} else {
		action = "APPROVE";
	}

	// Everything reported that did not itself force a stop. Feeds the driver's
	// record of what was let through, so no finding is lost by not blocking.
	const nonBlocking = findings.filter(
		(f) =>
			SEVERITY_RANK[f.severity] < minRank &&
			SEVERITY_RANK[f.severity] < SEVERITY_RANK.Medium &&
			!ESCALATING_CATEGORIES.has(f.category ?? DEFAULT_CATEGORY),
	);

	return {
		feature,
		level: config.level,
		timestamp,
		harness_action: action,
		metrics: {
			total_findings: findings.length,
			critical_high_count: criticalHigh.length,
			chunks_reviewed: decisions.length,
			chunks_unparseable: unparseableChunks.length,
			non_blocking_count: nonBlocking.length,
		},
		asi_target: pickGlobalAsi(decisions, findings),
		findings: sortFindings(findings),
		unparseableChunks,
		chunkVerdicts,
	};
}

function pickGlobalAsi(
	decisions: ReviewerDecision[],
	findings: ReviewerFinding[],
): AsiTarget | null {
	const withAsi = decisions
		.filter((d) => d.asi_target !== null)
		.sort(
			(a, b) =>
				bestSeverityRank(b.findings) - bestSeverityRank(a.findings),
		);
	if (withAsi.length > 0) return withAsi[0].asi_target;

	const top = sortFindings(findings)[0];
	if (!top) return null;
	return {
		file: top.file,
		line: top.line,
		issue_summary: top.issue,
		fix_instruction: top.suggestion,
	};
}

function bestSeverityRank(findings: ReviewerFinding[]): number {
	return findings.reduce((max, f) => Math.max(max, SEVERITY_RANK[f.severity]), 0);
}

function sortFindings(findings: ReviewerFinding[]): ReviewerFinding[] {
	return [...findings].sort(
		(a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity],
	);
}

export function formatAggregatedMarkdown(
	report: AggregatedReviewReport,
): string {
	const icon =
		report.harness_action === "APPROVE"
			? "✅"
			: report.harness_action === "BLOCK"
				? "🚫"
				: "⚠️";
	const lines: string[] = [];
	lines.push(`# Carrasco Code Review — ${report.feature}`);
	lines.push(
		`Date: ${report.timestamp} | Level: ${report.level} | Verdict: ${icon} ${report.harness_action}`,
	);
	lines.push("");
	lines.push("## Summary");
	lines.push(`- Total findings: ${report.metrics.total_findings}`);
	lines.push(`- Critical/High: ${report.metrics.critical_high_count}`);
	lines.push(`- Chunks reviewed: ${report.metrics.chunks_reviewed}`);
	if (report.metrics.chunks_unparseable > 0) {
		lines.push(
			`- ⚠️ Chunks with no parseable verdict: ${report.metrics.chunks_unparseable} (${report.unparseableChunks.join(", ")})`,
		);
	}
	lines.push("");
	if (report.asi_target) {
		lines.push("## Fix First (ASI)");
		lines.push(
			`- \`${report.asi_target.file}:${report.asi_target.line}\` — ${report.asi_target.issue_summary}`,
		);
		lines.push(`  Fix: ${report.asi_target.fix_instruction}`);
		lines.push("");
	}
	if (report.findings.length > 0) {
		lines.push("## Findings");
		lines.push("");
		for (const f of report.findings) {
			const sevIcon =
				f.severity === "Critical"
					? "🔴"
					: f.severity === "High"
						? "🟠"
						: f.severity === "Medium"
							? "🟡"
							: "🔵";
			lines.push(
				`${sevIcon} **[${f.severity}]** \`${f.file}:${f.line}\` — ${f.issue}`,
			);
			lines.push(`   Fix: ${f.suggestion}`);
			lines.push("");
		}
	} else {
		lines.push("No findings reported.");
	}
	return lines.join("\n");
}

/**
 * Fingerprint the current working-tree changes (tracked diff vs HEAD plus
 * untracked/staged status). Used to tie a saved decision to the exact change
 * set it reviewed, so the stop gate can detect when a review is stale. Returns
 * null when git is unavailable (caller should fail open).
 */
export function computeDiffFingerprint(cwd: string): string | null {
	const diff = runGit(["diff", "HEAD"], cwd);
	const status = runGit(["status", "--porcelain"], cwd);
	if (diff === null && status === null) return null;
	return createHash("sha256")
		.update(`${diff ?? ""}\n--STATUS--\n${status ?? ""}`)
		.digest("hex");
}

export function getHeadSha(cwd: string): string | null {
	const sha = runGit(["rev-parse", "HEAD"], cwd);
	return sha === null ? null : sha.trim();
}

function runGit(args: string[], cwd: string): string | null {
	try {
		const res = spawnSync("git", args, {
			cwd,
			encoding: "utf8",
			timeout: 5000,
			maxBuffer: 50 * 1024 * 1024,
		});
		if (res.status !== 0 || res.error) return null;
		return res.stdout ?? "";
	} catch {
		return null;
	}
}

export interface SavedDecision {
	feature: string;
	level: string;
	harness_action: HarnessAction | "APPROVE";
	timestamp: string;
	fingerprint: string | null;
	headSha: string | null;
	metrics: AggregatedReviewReport["metrics"];
	/** Per-chunk verdicts from this decision — lets `review recheck` target only chunks that didn't approve. */
	chunkVerdicts: ChunkVerdict[];
}

export function reviewsDir(cwd: string): string {
	return path.join(cwd, ".harness", "reviews");
}

export function featureReviewDir(cwd: string, feature: string): string {
	return path.join(reviewsDir(cwd), feature);
}

/**
 * Persist the aggregated review to `.harness/reviews/<feature>/`. Writes the
 * markdown and/or json report per `format`, plus a `decision.json` carrying the
 * change-set fingerprint that the stop gate checks.
 */
export function saveCarrascoReview(
	cwd: string,
	report: AggregatedReviewReport,
	config: ReviewAggressivenessConfig,
): { dir: string; markdownPath?: string; jsonPath?: string; decisionPath: string } {
	const dir = featureReviewDir(cwd, report.feature);
	fs.mkdirSync(dir, { recursive: true });
	const result: {
		dir: string;
		markdownPath?: string;
		jsonPath?: string;
		decisionPath: string;
	} = { dir, decisionPath: path.join(dir, "decision.json") };

	const format = config.reportOutput.format;
	if (format === "markdown" || format === "both") {
		const mdPath = path.join(dir, "carrasco-review.md");
		fs.writeFileSync(mdPath, `${formatAggregatedMarkdown(report)}\n`);
		result.markdownPath = mdPath;
	}
	if (format === "json" || format === "both") {
		const jsonPath = path.join(dir, "carrasco-review.json");
		fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
		result.jsonPath = jsonPath;
	}

	const decision: SavedDecision = {
		feature: report.feature,
		level: report.level,
		harness_action: report.harness_action,
		timestamp: report.timestamp,
		fingerprint: computeDiffFingerprint(cwd),
		headSha: getHeadSha(cwd),
		metrics: report.metrics,
		chunkVerdicts: report.chunkVerdicts,
	};
	fs.writeFileSync(result.decisionPath, `${JSON.stringify(decision, null, 2)}\n`);
	return result;
}

export type GateOutcome = "pass" | "block" | "absent";
export interface GateStatus {
	gate: GateOutcome;
	action: HarnessAction | "APPROVE" | null;
	reason: string;
}

/**
 * Single source of truth for the stop gate. Compares the saved decision's
 * fingerprint against the current change set and reports whether a fresh
 * passing carrasco review exists. Fails open when git is unavailable.
 */
export function evaluateGateStatus(
	cwd: string,
	feature: string,
): GateStatus {
	const current = computeDiffFingerprint(cwd);
	if (current === null) {
		return {
			gate: "pass",
			action: null,
			reason: "git unavailable — carrasco gate skipped",
		};
	}

	const decisionPath = path.join(featureReviewDir(cwd, feature), "decision.json");
	if (!fs.existsSync(decisionPath)) {
		return {
			gate: "absent",
			action: null,
			reason: `no carrasco review found for '${feature}'`,
		};
	}

	let decision: SavedDecision;
	try {
		decision = JSON.parse(fs.readFileSync(decisionPath, "utf8"));
	} catch {
		return {
			gate: "absent",
			action: null,
			reason: "carrasco decision file is unreadable",
		};
	}

	if (decision.fingerprint !== current) {
		return {
			gate: "block",
			action: decision.harness_action,
			reason: "carrasco review is stale — the working tree changed since the last review",
		};
	}

	if (decision.harness_action === "BLOCK") {
		return {
			gate: "block",
			action: "BLOCK",
			reason: `carrasco review BLOCKED these changes (${decision.metrics.critical_high_count} critical/high finding(s))`,
		};
	}

	return {
		gate: "pass",
		action: decision.harness_action,
		reason:
			decision.harness_action === "NEEDS_HUMAN_REVIEW"
				? "carrasco review needs human judgement — surface findings to your partner"
				: "carrasco review approved these changes",
	};
}
