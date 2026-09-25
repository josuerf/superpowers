import type { ReviewAggressivenessConfig, RedTeamDispatch } from "../types";
import { getFocusGuidance } from "./aggressiveness";

/**
 * Which red-team focus categories each plan `Risk flags` value turns on. The
 * same table lives in subagent-driven-development/SKILL.md ("3. Review the
 * task"), where the controller dispatches the red team per batch; this copy
 * drives the harness `review plan` path. Keep the two aligned.
 */
export const RISK_FLAG_FOCUS: Readonly<Record<string, readonly string[]>> = {
	security: ["adversarial-inputs", "assumption-violations"],
	concurrency: ["concurrency-timing", "state-corruption", "error-cascading"],
	"data-migration": ["state-corruption", "production-context-assumptions"],
	regulatory: ["production-context-assumptions", "assumption-violations"],
	"backward-compat": ["production-context-assumptions", "error-cascading"],
};

export const RED_TEAM_AGENT = "superpowers-prepared:red-team";

/**
 * Collect every risk flag a plan declares, across all its tasks. Reads
 * `**Risk flags:** ...` lines and, for plans written before that field, the
 * legacy `**Security flag:** \`security\`` line. Only backticked values that
 * name a known flag count: the field's own explanatory text (which mentions
 * every flag) must not switch them all on.
 */
export function parseRiskFlags(planText: string): string[] {
	const found = new Set<string>();
	for (const line of planText.split(/\r?\n/)) {
		const m = line.match(/^\s*(?:[-*]\s*)?\*\*(Risk flags|Security flag):\*\*(.*)$/i);
		if (!m) continue;
		// Drop the parenthesised explanation the template carries after the value.
		const value = m[2].replace(/\*?\(.*$/, "");
		for (const tok of value.matchAll(/`([^`]+)`/g)) {
			for (const flag of tok[1].split(/[,\s]+/)) {
				const f = flag.trim().toLowerCase();
				if (f && f in RISK_FLAG_FOCUS) found.add(f);
			}
		}
	}
	return Object.keys(RISK_FLAG_FOCUS).filter((f) => found.has(f));
}

/**
 * The extra red-team dispatch a flagged plan earns, or null when there is
 * none. `carrasco.redTeamEnabled` gates it: false switches the dispatch off
 * (it already gates the focus guidance in the carrasco prompt, see
 * `buildAggressivenessDirectives`). `redTeamParallel` says whether it runs in
 * the same message as the carrasco chunks or after them.
 */
export function buildRedTeamDispatch(
	flags: string[],
	gitDiff: string,
	config: ReviewAggressivenessConfig,
): RedTeamDispatch | null {
	if (!config.carrasco.redTeamEnabled) return null;
	const known = flags.filter((f) => f in RISK_FLAG_FOCUS);
	if (known.length === 0) return null;
	const focusCategories = Array.from(
		new Set(known.flatMap((f) => RISK_FLAG_FOCUS[f])),
	);
	const prompt = [
		"## Red Team Context",
		"",
		`The plan behind this change declares \`Risk flags: ${known.join(", ")}\`.`,
		"Attack the change along the focus categories below; report concrete",
		"failure scenarios in your Breakage Report format.",
		"",
		getFocusGuidance(focusCategories),
		"",
		"## Git Diff",
		"",
		"```diff",
		gitDiff,
		"```",
		"",
	].join("\n");
	return {
		agent: RED_TEAM_AGENT,
		flags: known,
		focusCategories,
		parallel: config.carrasco.redTeamParallel,
		prompt,
	};
}
