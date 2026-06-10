import type {
	ReviewAggressivenessLevel,
	ReviewAggressivenessConfig,
} from "../types";

/**
 * Aggressiveness directive builders.
 *
 * These produce the text blocks that escalate a review's rigor without
 * touching the carefully-tuned `base-prompt.md` / `stacks/*.md` content.
 * `standard` returns an empty directive so it preserves the existing
 * (calibrated) reviewer behavior exactly. `strict` and `carrasco` layer
 * progressively harsher enforcement on top.
 */

// Maps the hyphenated config focus-category keys to the human-facing category
// descriptions used by the red-team agent (agents/red-team.md). Keeping these
// aligned means the carrasco subagent and the red-team agent speak the same
// language about failure modes.
const FOCUS_CATEGORY_GUIDANCE: Record<string, string> = {
	"logic-bugs":
		"Logic bugs — off-by-one, boolean/operator mistakes (=== vs ==, && vs ||, < vs <=), unreachable or missing state transitions, null/undefined propagation through call chains.",
	"adversarial-inputs":
		"Adversarial inputs — the SPECIFIC input that breaks it: 10MB strings, Unicode edge cases (zero-width, RTL, homoglyphs), negatives where positive is assumed, empty vs null vs undefined vs missing key, NaN/Infinity/-0/MAX_SAFE_INTEGER+1, deeply nested objects, strings that look like other types (\"__proto__\", \"null\", \"0\").",
	"state-corruption":
		"State corruption — partial writes with no rollback, stale cache reads, non-idempotent retries, ordering assumptions on events that may arrive out of order.",
	"concurrency-timing":
		"Concurrency & timing — race conditions on shared resources, TOCTOU, deadlocks, lost updates (read-modify-write without locking), stale closures.",
	"resource-exhaustion":
		"Resource exhaustion — behavior at 100k items not 10, leaked listeners/handles, unbounded caches/queues/buffers, unbounded recursion, ReDoS.",
	"error-cascading":
		"Error cascading — dependency unavailability, one failed request poisoning later ones, unhandled rejections, error handlers that throw, retry storms without backoff.",
	"assumption-violations":
		"Assumption violations — timezone/DST, floating point, file-path (case, separators, symlinks, spaces), encoding (UTF-8 vs Latin-1, BOM), platform (line endings, available commands), network (always succeeds/fast/resolves).",
	"production-context-assumptions":
		"Production context assumptions (the dominant production failure class) — data-shape drift (fields nullable in prod, ints arriving as strings, arrays empty in prod), external contract drift (pagination at real scale, fixture vs prod API), deployment ordering (migration before column read, flag before branch reachable), scale/concurrency (multi-instance, multi-worker), accumulated state (10M rows, queries that time out under real volume).",
};

export function getFocusGuidance(categories: string[]): string {
	if (!categories || categories.length === 0) return "";
	const lines = categories
		.map((c) => FOCUS_CATEGORY_GUIDANCE[c])
		.filter((v): v is string => Boolean(v))
		.map((v) => `- ${v}`);
	if (lines.length === 0) return "";
	return [
		"## Adversarial Focus Categories",
		"",
		"Beyond the checklist, actively try to BREAK the code along these axes:",
		"",
		...lines,
	].join("\n");
}

export function getLevelDirective(level: ReviewAggressivenessLevel): string {
	if (level === "standard") {
		// Preserve existing calibrated behavior — no extra pressure.
		return "";
	}
	if (level === "strict") {
		return [
			"## Review Posture: STRICT",
			"",
			"- Hold every stack-specific rule and the Universal Engineering Checklist as a requirement, not a suggestion. A clear violation of an established rule is at minimum a Medium finding.",
			"- Do not approve code that ignores an explicit project convention without a documented reason.",
			"- Vague praise does not offset concrete defects. Lead with the defects.",
		].join("\n");
	}
	// carrasco
	return [
		"## Review Posture: CARRASCO (uncompromising)",
		"",
		"You are the executioner gate. Nothing sloppy ships past you. Be rigorous, specific, and unforgiving — but never invent findings.",
		"",
		"- **Stack rules are BLOCKING.** Any violation of a rule in the active technology rules below, or of the workspace's own established conventions, is a **High** finding (Critical if it risks data loss, corruption, auth bypass, or an outage). There is no \"minor style nit\" exemption for an established, enforced rule.",
		"- **No benefit of the doubt.** If the diff depends on an assumption you cannot verify from the code, treat the assumption as wrong and report the failure it causes.",
		"- **No reward for working happy-path code.** Correct-looking code that breaks the project's architecture, duplicates existing logic, or ignores a workspace pattern is a finding even if it passes tests.",
		"- **Cut the praise.** Do not pad the report with reassurance. One line of accurate acknowledgement at most; spend the rest on what must change.",
		"- Approve ONLY when you have genuinely tried to break the change and the established standards are fully met.",
	].join("\n");
}

export function getSeverityPolicy(
	threshold: ReviewAggressivenessConfig["carrasco"]["severityThreshold"],
): string {
	const order: Array<typeof threshold> = ["Medium", "High", "Critical"];
	const atOrAbove = order.slice(order.indexOf(threshold));
	return [
		"## Decision Policy",
		"",
		`- Set \`harness_action\` to **BLOCK** if there is at least one finding at severity ${atOrAbove.join(" or ")} (threshold: ${threshold}).`,
		"- Set **NEEDS_HUMAN_REVIEW** when findings exist below the threshold but require engineering judgement.",
		"- Set **APPROVE** only when no finding reaches the threshold.",
		"- Severity reflects real-world blast radius, not how many issues you found. Calibrate honestly.",
	].join("\n");
}

export function getReproducibleTriggerDirective(required: boolean): string {
	if (!required) return "";
	return [
		"## Evidence Requirement",
		"",
		"Every Critical or High finding MUST include a concrete, reproducible trigger: the exact input, the exact call sequence, or the exact production condition that causes the failure. A finding without a reproducible trigger must be downgraded to Medium or dropped. Reference `file:line` for every finding.",
	].join("\n");
}

export function getStandardsDirective(
	standards: ReviewAggressivenessConfig["standards"],
): string {
	const lines: string[] = [
		"## Respect the Workspace Architecture",
		"",
		"You are reviewing a change inside a host project that has its own established architecture and conventions. Judge the diff against THOSE standards, not generic ideals. Before deciding, gather the project's real conventions:",
		"",
	];
	if (standards.autoDetect) {
		lines.push(
			"- Read the nearest `CLAUDE.md` / `AGENTS.md` (walk up from the changed files to the repo root) to learn the project's stated rules.",
			"- Read 1–3 sibling files in the same directories as the changed files to infer the local conventions (naming, layering, error handling, test style, folder structure).",
			"- Match how this codebase already does things. A change that is 'correct' but inconsistent with the surrounding architecture is a finding.",
		);
	}
	if (standards.paths && standards.paths.length > 0) {
		lines.push(
			"",
			"**Authoritative standards documents — load and ENFORCE these as hard requirements:**",
			...standards.paths.map((p) => `- \`${p}\``),
			"A violation of a rule stated in these documents is at minimum a High finding at the carrasco level.",
		);
	}
	if (!standards.autoDetect && (!standards.paths || standards.paths.length === 0)) {
		// Nothing configured — still anchor on neighboring code.
		lines.push(
			"- No explicit standards source is configured; infer conventions from the surrounding code and keep the change consistent with it.",
		);
	}
	return lines.join("\n");
}

/**
 * Assemble the full aggressiveness preamble injected into a reviewer prompt for
 * a given config. Returns an empty string for `standard` with nothing else to
 * add, so backward-compatible callers see no change.
 */
export function buildAggressivenessDirectives(
	config: ReviewAggressivenessConfig,
): string {
	const blocks = [
		getLevelDirective(config.level),
		getStandardsDirective(config.standards),
	];
	if (config.level === "carrasco" && config.carrasco.redTeamEnabled) {
		blocks.push(getFocusGuidance(config.carrasco.focusCategories));
		blocks.push(
			getReproducibleTriggerDirective(config.carrasco.requireReproducibleTrigger),
		);
	}
	blocks.push(getSeverityPolicy(config.carrasco.severityThreshold));
	return blocks.filter((b) => b.trim().length > 0).join("\n\n");
}
