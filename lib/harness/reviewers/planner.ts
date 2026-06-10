import type {
	ReviewAggressivenessConfig,
	ReviewChunk,
	ReviewPlan,
} from "../types";
import {
	buildReviewerPrompt,
	resolveStacksForFiles,
	detectOrmFromDiff,
} from "./loader";
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
