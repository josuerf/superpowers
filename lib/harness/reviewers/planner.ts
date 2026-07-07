import type {
	ReviewAggressivenessConfig,
	ReviewChunk,
	ReviewerFinding,
	ReviewPlan,
} from "../types";
import {
	buildReviewerPrompt,
	loadReviewerPrompt,
	resolveStacksForFiles,
	detectOrmFromDiff,
} from "./loader";
import { buildAggressivenessDirectives } from "./aggressiveness";
import { chunkChangedFiles, type ChunkFileInput } from "./chunker";

/**
 * Split a unified git diff into per-file sections keyed by the file's `b/`
 * path. Sections start at each `diff --git a/<x> b/<y>` line.
 */
export function splitDiffByFile(gitDiff: string): Map<string, string> {
	const map = new Map<string, string>();
	if (!gitDiff) return map;
	const lines = gitDiff.split("\n");
	let currentFile: string | null = null;
	let buffer: string[] = [];
	const flush = () => {
		if (currentFile !== null) {
			map.set(currentFile, buffer.join("\n"));
		}
	};
	for (const line of lines) {
		if (line.startsWith("diff --git ")) {
			flush();
			buffer = [line];
			currentFile = parseDiffGitPath(line);
		} else {
			buffer.push(line);
		}
	}
	flush();
	return map;
}

function parseDiffGitPath(diffGitLine: string): string {
	// Format: diff --git a/path/to/file b/path/to/file
	// Prefer the b/ path (destination). Tolerate quoted paths and spaces.
	const match = diffGitLine.match(/ b\/(.+)$/);
	if (match) {
		let p = match[1].trim();
		if (p.startsWith('"') && p.endsWith('"')) p = p.slice(1, -1);
		return p;
	}
	return diffGitLine.replace("diff --git ", "").trim();
}

/** Count changed (added/removed) lines in a diff section, excluding headers. */
export function countChangedLines(diffSection: string): number {
	if (!diffSection) return 0;
	let count = 0;
	for (const line of diffSection.split("\n")) {
		if (
			(line.startsWith("+") && !line.startsWith("+++")) ||
			(line.startsWith("-") && !line.startsWith("---"))
		) {
			count++;
		}
	}
	return count;
}

export interface BuildReviewPlanOptions {
	feature: string;
	changedFiles: string[];
	gitDiff: string;
	config: ReviewAggressivenessConfig;
	/** ISO timestamp; injected by the caller so the planner stays deterministic. */
	generatedAt: string;
}

/**
 * Build a deterministic review plan: chunk the changed files (by topic when
 * there are many changes), and for each chunk assemble the per-chunk diff and
 * the full carrasco prompt (technology rules + aggressiveness directives).
 */
export function buildReviewPlan(options: BuildReviewPlanOptions): ReviewPlan {
	const { feature, changedFiles, gitDiff, config, generatedAt } = options;
	const diffByFile = splitDiffByFile(gitDiff);

	const fileInputs: ChunkFileInput[] = changedFiles.map((path) => ({
		path,
		lines: countChangedLines(diffByFile.get(path) ?? ""),
	}));

	const chunkResults = chunkChangedFiles(fileInputs, config.chunking);

	const chunks: ReviewChunk[] = chunkResults.map((c) => {
		const chunkDiff = c.files
			.map((f) => diffByFile.get(f))
			.filter((d): d is string => Boolean(d))
			.join("\n");
		const ormStacks = detectOrmFromDiff(chunkDiff);
		const stacks = Array.from(new Set([...c.stacks, ...ormStacks]));
		const prompt = buildReviewerPrompt(c.files, chunkDiff, stacks, {
			aggressiveness: config,
		});
		return {
			id: c.id,
			topic: c.topic,
			files: c.files,
			stacks,
			estimatedLines: c.estimatedLines,
			diff: chunkDiff,
			prompt,
		};
	});

	const allStacks = Array.from(
		new Set([
			...resolveStacksForFiles(changedFiles),
			...detectOrmFromDiff(gitDiff),
		]),
	);

	return {
		feature,
		level: config.level,
		generatedAt,
		totalFiles: changedFiles.length,
		totalChunks: chunks.length,
		stacks: allStacks,
		chunks,
	};
}

export interface BuildRecheckPromptOptions {
	chunkId: string;
	files: string[];
	priorFindings: ReviewerFinding[];
	/** Diff of just this chunk's files since the previous review — the fix, not the original change. */
	freshDiff: string;
	/** Optional one-line context from the controller: what changed and why, or a new follow-up ask. */
	note?: string;
	config: ReviewAggressivenessConfig;
}

/**
 * Build a lean re-review prompt for ONE previously-blocked chunk. Unlike
 * `buildReviewPlan`, this does not restate the chunk's original diff or drag
 * in unrelated chunks — it hands the reviewer only the findings it raised
 * last time, the diff of the fix, and the controller's note, so a re-review
 * costs a fraction of a full chunk review.
 */
export function buildRecheckPrompt(options: BuildRecheckPromptOptions): string {
	const { files, priorFindings, freshDiff, note, config } = options;
	const stacks = Array.from(
		new Set([...resolveStacksForFiles(files), ...detectOrmFromDiff(freshDiff)]),
	);
	const basePrompt = loadReviewerPrompt(stacks);

	const findingsBlock =
		priorFindings.length > 0
			? priorFindings
					.map(
						(f) =>
							`- [${f.severity}] \`${f.file}:${f.line}\` — ${f.issue}\n  Suggested fix: ${f.suggestion}`,
					)
					.join("\n")
			: "(no prior findings recorded for this chunk — re-check anyway per the note below.)";

	const header = [
		"## Re-review Context (scoped recheck — not a fresh full review)",
		"",
		"This chunk previously did not approve. You are re-checking ONLY the",
		"findings and files listed below. Do not re-review files, chunks, or",
		"concerns outside this scope.",
		"",
		"**Files in this chunk:**",
		...files.map((f) => `- ${f}`),
		"",
		"**Findings to verify (from the previous review):**",
		findingsBlock,
		"",
		...(note ? ["**Note from the controller:**", note, ""] : []),
		"## Diff since the previous review (the fix)",
		"",
		"```diff",
		freshDiff || "(no changes detected in these files since the previous review)",
		"```",
		"",
		"## Task",
		"For each finding above, report RESOLVED or STILL PRESENT based on the diff.",
		"Flag a NEW finding only if the diff introduces a Critical/High issue in",
		"these files — do not re-surface anything already out of scope. Return the",
		"same `<!-- REVIEWER_DECISION -->` JSON block as a normal review.",
		"",
	].join("\n");

	const prompt = `${header}\n\n${basePrompt}`;
	if (config.level !== "standard") {
		const directives = buildAggressivenessDirectives(config);
		if (directives.trim().length > 0) {
			return `${prompt}\n\n---\n\n${directives}`;
		}
	}
	return prompt;
}
