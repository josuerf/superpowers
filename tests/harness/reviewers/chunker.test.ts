import {
	chunkChangedFiles,
	topicOf,
	type ChunkFileInput,
} from "../../../lib/harness/reviewers/chunker";
import type { ReviewAggressivenessConfig } from "../../../lib/harness/types";

type ChunkingConfig = ReviewAggressivenessConfig["chunking"];

function chunking(overrides: Partial<ChunkingConfig> = {}): ChunkingConfig {
	return {
		enabled: true,
		maxFilesPerChunk: 10,
		maxLinesPerChunk: 2000,
		byTopic: true,
		...overrides,
	};
}

function files(paths: string[], lines = 10): ChunkFileInput[] {
	return paths.map((path) => ({ path, lines }));
}

describe("topicOf", () => {
	test("uses first two directory segments", () => {
		expect(topicOf("src/auth/login.ts")).toBe("src/auth");
	});
	test("root files map to (root)", () => {
		expect(topicOf("index.ts")).toBe("(root)");
	});
	test("tolerates backslashes", () => {
		expect(topicOf("src\\auth\\login.ts")).toBe("src/auth");
	});
});

describe("chunkChangedFiles", () => {
	test("returns empty for no files", () => {
		expect(chunkChangedFiles([], chunking())).toEqual([]);
	});

	test("single chunk when under limits", () => {
		const result = chunkChangedFiles(
			files(["src/a.ts", "src/b.ts", "lib/c.ts"]),
			chunking(),
		);
		expect(result).toHaveLength(1);
		expect(result[0].topic).toBe("(all)");
		expect(result[0].files).toHaveLength(3);
	});

	test("single chunk when chunking disabled even over limits", () => {
		const result = chunkChangedFiles(
			files(["a.ts", "b.ts", "c.ts"]),
			chunking({ enabled: false, maxFilesPerChunk: 1 }),
		);
		expect(result).toHaveLength(1);
	});

	test("splits by file count when over maxFilesPerChunk", () => {
		const result = chunkChangedFiles(
			files(["api/a.ts", "api/b.ts", "api/c.ts", "api/d.ts"]),
			chunking({ maxFilesPerChunk: 2, byTopic: false }),
		);
		expect(result.length).toBeGreaterThan(1);
		for (const c of result) expect(c.files.length).toBeLessThanOrEqual(2);
	});

	test("groups by topic when byTopic and over limits", () => {
		const result = chunkChangedFiles(
			[
				...files(["src/auth/a.ts", "src/auth/b.ts"]),
				...files(["src/billing/c.ts", "src/billing/d.ts"]),
			],
			chunking({ maxFilesPerChunk: 2, byTopic: true }),
		);
		const topics = result.map((c) => c.topic);
		expect(topics).toContain("src/auth");
		expect(topics).toContain("src/billing");
	});

	test("splits when total changed lines exceed maxLinesPerChunk", () => {
		const result = chunkChangedFiles(
			files(["api/a.ts", "api/b.ts"], 1500),
			chunking({ maxFilesPerChunk: 10, maxLinesPerChunk: 2000, byTopic: false }),
		);
		expect(result.length).toBe(2);
	});

	test("resolves stacks per chunk", () => {
		const result = chunkChangedFiles(files(["app/page.tsx"]), chunking());
		expect(result[0].stacks).toContain("react-nextjs");
	});
});
