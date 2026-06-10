import * as path from "node:path";
import type { ReviewAggressivenessConfig } from "../types";
import { resolveStacksForFiles } from "./loader";

export interface ChunkFileInput {
	path: string;
	lines: number;
}

export interface ChunkResult {
	id: string;
	topic: string;
	files: string[];
	stacks: string[];
	estimatedLines: number;
}

type ChunkingConfig = ReviewAggressivenessConfig["chunking"];

/**
 * Derive a "topic" key for a changed file from its first up-to-two directory
 * segments. This groups files by feature/module area so a chunk stays
 * cohesive (one carrasco reviews one subject) instead of mixing unrelated
 * concerns. Git always reports forward-slash paths; we tolerate backslashes too.
 */
export function topicOf(file: string): string {
	const dir = path.posix.dirname(file.replace(/\\/g, "/"));
	if (dir === "." || dir === "" || dir === "/") return "(root)";
	const segs = dir.split("/").filter(Boolean);
	return segs.slice(0, 2).join("/");
}

function packGroup(
	groupFiles: ChunkFileInput[],
	maxFiles: number,
	maxLines: number,
): ChunkFileInput[][] {
	const chunks: ChunkFileInput[][] = [];
	let current: ChunkFileInput[] = [];
	let currentLines = 0;
	for (const file of groupFiles) {
		const wouldExceed =
			current.length > 0 &&
			(current.length + 1 > maxFiles || currentLines + file.lines > maxLines);
		if (wouldExceed) {
			chunks.push(current);
			current = [];
			currentLines = 0;
		}
		current.push(file);
		currentLines += file.lines;
	}
	if (current.length > 0) chunks.push(current);
	return chunks;
}

/**
 * Split the changed files into review chunks.
 *
 * - Chunking only kicks in when there are "many" changes: if chunking is
 *   disabled, or the change set fits within both limits, a single chunk
 *   covering everything is returned (review each file together).
 * - When over the limits and `byTopic` is set, files are grouped by topic
 *   (directory area) first, then packed within `maxFilesPerChunk` /
 *   `maxLinesPerChunk`. With `byTopic` off, files are packed by path order.
 */
export function chunkChangedFiles(
	files: ChunkFileInput[],
	config: ChunkingConfig,
): ChunkResult[] {
	const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
	const totalLines = sorted.reduce((sum, f) => sum + f.lines, 0);

	const fitsInOneChunk =
		!config.enabled ||
		(sorted.length <= config.maxFilesPerChunk &&
			totalLines <= config.maxLinesPerChunk);

	const toChunkResult = (
		group: ChunkFileInput[],
		index: number,
		topic: string,
	): ChunkResult => {
		const filePaths = group.map((f) => f.path);
		return {
			id: `chunk-${index + 1}`,
			topic,
			files: filePaths,
			stacks: resolveStacksForFiles(filePaths),
			estimatedLines: group.reduce((sum, f) => sum + f.lines, 0),
		};
	};

	if (fitsInOneChunk) {
		if (sorted.length === 0) return [];
		return [toChunkResult(sorted, 0, "(all)")];
	}

	const packed: Array<{ files: ChunkFileInput[]; topic: string }> = [];
	if (config.byTopic) {
		const groups = new Map<string, ChunkFileInput[]>();
		for (const file of sorted) {
			const topic = topicOf(file.path);
			const arr = groups.get(topic) ?? [];
			arr.push(file);
			groups.set(topic, arr);
		}
		for (const topic of [...groups.keys()].sort()) {
			const chunks = packGroup(
				groups.get(topic)!,
				config.maxFilesPerChunk,
				config.maxLinesPerChunk,
			);
			for (const c of chunks) packed.push({ files: c, topic });
		}
	} else {
		const chunks = packGroup(
			sorted,
			config.maxFilesPerChunk,
			config.maxLinesPerChunk,
		);
		for (const c of chunks) packed.push({ files: c, topic: "(mixed)" });
	}

	return packed.map((p, i) => toChunkResult(p.files, i, p.topic));
}
