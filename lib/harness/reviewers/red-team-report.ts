import * as fs from "node:fs";
import * as path from "node:path";
import type {
	AggregatedReviewReport,
	RedTeamOutcome,
	ReviewAggressivenessConfig,
	ReviewerFinding,
	ReviewerSeverity,
} from "../types";
import { buildRedTeamDispatch } from "./red-team";

/**
 * The red team's Breakage Report (agents/red-team.md) is free-form markdown,
 * not a REVIEWER_DECISION block, so it cannot go through parseReviewerResponse.
 * It used to sit next to the aggregated decision without ever reaching it: a
 * red-team Critical blocked nothing. This module reads it defensively and folds
 * its findings into the aggregated verdict with the same severity threshold.
 */

const SEVERITY_RANK: Record<ReviewerSeverity, number> = {
	Low: 1,
	Medium: 2,
	High: 3,
	Critical: 4,
};

export interface RedTeamEntry {
	severity: ReviewerSeverity;
	title: string;
	file?: string;
	line?: number;
}

export interface ParsedRedTeamReport {
	critical: number;
	high: number;
	medium: number;
	entries: RedTeamEntry[];
}

// "### High — Title", "### [Critical] - Title", "#### Medium: Title"
const ENTRY_HEADING =
	/^#{2,4}\s*\[?\s*(Critical|High|Medium|Low)\s*\]?\s*(?:—|–|-|:)\s*(.+?)\s*$/i;
const SUMMARY_COUNTS =
	/Critical\**\s*:\s*\**\s*(\d+)\s*\**\s*\|\s*\**\s*High\**\s*:\s*\**\s*(\d+)(?:\s*\**\s*\|\s*\**\s*Medium\**\s*:\s*\**\s*(\d+))?/i;
const EXPLICIT_CLEAN =
	/Total scenarios found\**\s*:\s*\**\s*0\b|could not find (?:any )?ways to break|no (?:breakage|failure) scenarios/i;
const FILE_LINE = /([A-Za-z0-9_./\\-]+\.[A-Za-z0-9]+):(\d+)/;

function canonicalSeverity(s: string): ReviewerSeverity {
	const lower = s.toLowerCase();
	return (lower.charAt(0).toUpperCase() + lower.slice(1)) as ReviewerSeverity;
}

// "**Severity:** Critical", "- Severity: High", "Severity: [Medium]"
const SEVERITY_LINE =
	/^\s*(?:[-*]\s*)?\**\s*Severity\s*\**\s*:\s*\**\s*\[?\s*(Critical|High|Medium|Low)\b/i;
// Body lines that mark a heading as a scenario entry (agents/red-team.md format).
const ENTRY_BODY = /^\s*\**\s*(Trigger|What breaks|Root cause)\s*:?\s*\**\s*:/i;

interface PendingEntry {
	title: string;
	file?: string;
	line?: number;
	looksLikeEntry: boolean;
}

/**
 * Entries from the report, each with the first `file:line` of its body (the
 * report's rules require one per scenario). An entry's severity comes from its
 * heading (`### High — title`) or from a `**Severity:** X` line under any
 * heading (`### Scenario 3`). Severity counts come from the entries; a Summary
 * line that counts MORE wins, so a report whose entries were mangled still
 * cannot under-report.
 *
 * A "nothing found" phrase only counts when there is no entry and no count
 * above zero: an explicit severity is never cancelled by a stray sentence
 * like "no failure scenarios found here". Returns null when nothing can be
 * read — no entry, no summary counts, no explicit clean verdict — or when a
 * scenario (a heading with Trigger / What breaks / Root cause) carries no
 * severity at all: the caller must not treat either as clean.
 */
export function parseRedTeamReport(text: string): ParsedRedTeamReport | null {
	if (typeof text !== "string" || text.trim().length === 0) return null;
	const lines = text.split(/\r?\n/);
	const entries: RedTeamEntry[] = [];
	let current: RedTeamEntry | null = null;
	let pending: PendingEntry | null = null;
	let unratedScenario = false;
	const closePending = () => {
		if (pending && pending.looksLikeEntry) unratedScenario = true;
		pending = null;
	};
	let inFence = false;
	for (const line of lines) {
		if (/^\s*```/.test(line)) inFence = !inFence;
		if (inFence) continue;
		const m = line.match(ENTRY_HEADING);
		if (m) {
			closePending();
			current = { severity: canonicalSeverity(m[1]), title: m[2] };
			entries.push(current);
			continue;
		}
		const heading = line.match(/^#{1,4}\s+(.*)$/);
		if (heading) {
			closePending();
			current = null;
			if (/^#{2,4}\s/.test(line) && !/^(summary|breakage report)\b/i.test(heading[1].trim())) {
				pending = { title: heading[1].trim(), looksLikeEntry: false };
			}
			continue;
		}
		const sev = line.match(SEVERITY_LINE);
		if (sev) {
			if (pending) {
				current = { severity: canonicalSeverity(sev[1]), title: pending.title, file: pending.file, line: pending.line };
				entries.push(current);
				pending = null;
			} else if (!current) {
				current = { severity: canonicalSeverity(sev[1]), title: "(untitled scenario)" };
				entries.push(current);
			}
			continue;
		}
		if (pending && ENTRY_BODY.test(line)) pending.looksLikeEntry = true;
		const target: { file?: string; line?: number } | null = current ?? pending;
		if (target && target.file === undefined) {
			const fl = line.match(FILE_LINE);
			if (fl) {
				target.file = fl[1].replace(/\\/g, "/");
				target.line = Number(fl[2]);
			}
		}
	}
	closePending();
	if (unratedScenario) return null;

	const count = (sev: ReviewerSeverity) => entries.filter((e) => e.severity === sev).length;
	let critical = count("Critical");
	let high = count("High");
	let medium = count("Medium");

	const summary = text.match(SUMMARY_COUNTS);
	if (summary) {
		critical = Math.max(critical, Number(summary[1]));
		high = Math.max(high, Number(summary[2]));
		if (summary[3] !== undefined) medium = Math.max(medium, Number(summary[3]));
	}

	const anyFinding = entries.length > 0 || critical + high + medium > 0;
	if (!anyFinding && !summary && !EXPLICIT_CLEAN.test(text)) return null;
	return { critical, high, medium, entries };
}

/**
 * Fold a red-team report into an aggregated verdict. Entries at or above
 * `carrasco.severityThreshold` block, exactly like carrasco findings; they are
 * added to `findings` (tagged "[red team]") so the fix loop and the report see
 * them. Counts the summary claims beyond the listed entries block too. An
 * unreadable report lifts APPROVE to NEEDS_HUMAN_REVIEW and never downgrades.
 */
export function applyRedTeamReport(
	report: AggregatedReviewReport,
	text: string,
	config: ReviewAggressivenessConfig,
): AggregatedReviewReport {
	const parsed = parseRedTeamReport(text);
	if (!parsed) {
		const redTeam: RedTeamOutcome = { status: "unreadable", critical: 0, high: 0, medium: 0, blocking: 0 };
		return {
			...report,
			harness_action: report.harness_action === "APPROVE" ? "NEEDS_HUMAN_REVIEW" : report.harness_action,
			redTeam,
		};
	}

	const minRank = SEVERITY_RANK[config.carrasco.severityThreshold as ReviewerSeverity] ?? SEVERITY_RANK.High;
	const blockingEntries = parsed.entries.filter((e) => SEVERITY_RANK[e.severity] >= minRank);
	// Summary counts not backed by a listed entry still count against the threshold.
	const unlisted = (sev: ReviewerSeverity, claimed: number) =>
		SEVERITY_RANK[sev] >= minRank
			? Math.max(0, claimed - parsed.entries.filter((e) => e.severity === sev).length)
			: 0;
	const blocking =
		blockingEntries.length +
		unlisted("Critical", parsed.critical) +
		unlisted("High", parsed.high) +
		unlisted("Medium", parsed.medium);

	const added: ReviewerFinding[] = parsed.entries
		.filter((e) => SEVERITY_RANK[e.severity] >= Math.min(SEVERITY_RANK.High, minRank))
		.map((e) => ({
			severity: e.severity,
			file: e.file ?? "red-team.md",
			line: e.line ?? 0,
			issue: `[red team] ${e.title}`,
			suggestion: "See red-team.md for the trigger and the test case skeleton.",
		}));

	const findings = [...report.findings, ...added].sort(
		(a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity],
	);
	const redTeam: RedTeamOutcome = {
		status: "parsed",
		critical: parsed.critical,
		high: parsed.high,
		medium: parsed.medium,
		blocking,
	};
	return {
		...report,
		harness_action: blocking > 0 ? "BLOCK" : report.harness_action,
		metrics: {
			...report.metrics,
			total_findings: report.metrics.total_findings + added.length,
			critical_high_count: report.metrics.critical_high_count + parsed.critical + parsed.high,
		},
		findings,
		redTeam,
	};
}

export const RED_TEAM_REPORT = "red-team.md";
export const RED_TEAM_PROMPT = "red-team-prompt.md";
export const RED_TEAM_PREVIOUS = "red-team.prev.md";

/**
 * What `review aggregate` does with the red team, given the review directory:
 * a `red-team.md` is folded in (applyRedTeamReport); a red team that `review
 * plan` asked for (`red-team-prompt.md` written) but whose report is missing
 * lifts APPROVE to NEEDS_HUMAN_REVIEW — "nobody ran it" must not read as "it
 * found nothing". With neither file the verdict is returned untouched.
 */
export function foldRedTeamReport(
	report: AggregatedReviewReport,
	reviewDir: string,
	config: ReviewAggressivenessConfig,
): AggregatedReviewReport {
	const reportPath = path.join(reviewDir, RED_TEAM_REPORT);
	if (fs.existsSync(reportPath)) {
		return applyRedTeamReport(report, fs.readFileSync(reportPath, "utf8"), config);
	}
	if (fs.existsSync(path.join(reviewDir, RED_TEAM_PROMPT))) {
		const redTeam: RedTeamOutcome = { status: "missing", critical: 0, high: 0, medium: 0, blocking: 0 };
		return {
			...report,
			harness_action: report.harness_action === "APPROVE" ? "NEEDS_HUMAN_REVIEW" : report.harness_action,
			redTeam,
		};
	}
	return report;
}

/**
 * `review recheck` re-reviews the fix, not the original diff. A red team whose
 * findings blocked (or whose report was unreadable) would otherwise keep
 * blocking forever: its report never changes. So its prompt is rebuilt against
 * the fresh diff with the plan's risk flags, and the old report is moved to
 * red-team.prev.md — until a new report is written, aggregate sees the planned
 * prompt without a report and stops for human review instead of passing.
 * Returns the prompt path, or null when the red team needs no re-run.
 */
export function prepareRedTeamRecheck(
	reviewDir: string,
	previous: RedTeamOutcome | undefined,
	freshDiff: string,
	config: ReviewAggressivenessConfig,
): string | null {
	if (!previous || (previous.status === "parsed" && previous.blocking === 0)) return null;
	let flags: string[] = [];
	try {
		const plan = JSON.parse(fs.readFileSync(path.join(reviewDir, "plan.json"), "utf8"));
		if (Array.isArray(plan?.redTeam?.flags)) flags = plan.redTeam.flags;
	} catch {
		// no plan.json: fall back to re-using the prompt already on disk
	}
	const promptPath = path.join(reviewDir, RED_TEAM_PROMPT);
	const dispatch = buildRedTeamDispatch(flags, freshDiff, config);
	if (dispatch) {
		fs.writeFileSync(promptPath, `${dispatch.prompt}\n`);
	} else if (!fs.existsSync(promptPath)) {
		return null;
	}
	const reportPath = path.join(reviewDir, RED_TEAM_REPORT);
	if (fs.existsSync(reportPath)) fs.renameSync(reportPath, path.join(reviewDir, RED_TEAM_PREVIOUS));
	return promptPath;
}
