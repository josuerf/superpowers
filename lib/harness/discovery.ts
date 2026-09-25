import * as fs from "node:fs";
import * as path from "node:path";
import type { WorkspaceConfig, WorkspaceProject } from "./types";
import {
	loadWorkspaceConfig,
	saveWorkspaceConfig,
	isWorkspaceMode,
} from "./config";

// Evaluated in insertion order: the first detector that matches wins, so a
// more specific detector must precede the general one it narrows. `match`,
// when present, must also pass.
const STACK_DETECTORS: Record<
	string,
	{ files: string[]; deps?: string[]; match?: (projectRoot: string) => boolean }
> = {
	"react-nextjs": { files: ["package.json"], deps: ["next", "react"] },
	"csharp-dotnet": { files: ["*.csproj", "*.sln"] },
	"csharp-aspnet": { files: ["*.csproj", "*.sln"] },
	"node-fastify": { files: ["package.json"], deps: ["fastify"] },
	"node-elysia": { files: ["package.json"], deps: ["elysia"] },
	"node-express": { files: ["package.json"], deps: ["express"] },
	"python-fastapi": {
		files: ["requirements.txt", "pyproject.toml"],
		deps: ["fastapi"],
	},
	"java-springboot": { files: ["pom.xml", "build.gradle", "build.gradle.kts"] },
	"go-std": { files: ["go.mod"] },
	terraform: { files: ["*.tf", "terraform.tf"] },
};

const NODE_SOURCE_EXTENSIONS = [".js", ".mjs", ".cjs", ".ts"];
const NODE_STD_SKIP_DIRS = new Set([
	"node_modules",
	"dist",
	"build",
	".harness",
	".git",
]);

/**
 * Bounded-depth recursive scan for plain Node/TS source files, used only by
 * the node-std fallback below. Unlike the other detectors' `files` globs
 * (root-level only — a package.json, go.mod, etc. is conventionally there),
 * a manifest-less Node project has no fixed root marker, so source files
 * have to be found wherever they actually live (e.g. `test/*.test.js`).
 * Depth is capped to keep this cheap on large, unrelated repos.
 */
function hasNodeSourceFiles(dir: string, depth = 3): boolean {
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return false;
	}
	if (
		entries.some(
			(e) =>
				e.isFile() &&
				NODE_SOURCE_EXTENSIONS.some((ext) => e.name.endsWith(ext)),
		)
	) {
		return true;
	}
	if (depth <= 0) return false;
	return entries.some(
		(e) =>
			e.isDirectory() &&
			!e.name.startsWith(".") &&
			!NODE_STD_SKIP_DIRS.has(e.name) &&
			hasNodeSourceFiles(path.join(dir, e.name), depth - 1),
	);
}

export function detectStack(projectRoot: string): string | null {
	const stack = detectManifestStack(projectRoot);
	if (stack) return stack;
	// Catch-all: a plain Node/TS project with no framework and no
	// package.json (e.g. tests run via the built-in `node --test` runner).
	if (hasNodeSourceFiles(projectRoot)) return "node-std";
	return null;
}

/** Stack detected from a manifest in `projectRoot` itself — no node-std fallback. */
function detectManifestStack(projectRoot: string): string | null {
	for (const [stack, detector] of Object.entries(STACK_DETECTORS)) {
		const hasFiles = detector.files.some((pattern) => {
			if (pattern.includes("*")) {
				const dir = projectRoot;
				try {
					const entries = fs.readdirSync(dir);
					return entries.some((f) => {
						const ext = pattern.replace("*.", "");
						return f.endsWith(ext);
					});
				} catch {
					return false;
				}
			}
			return fs.existsSync(path.join(projectRoot, pattern));
		});
		if (!hasFiles) continue;
		if (detector.match) {
			if (detector.match(projectRoot)) return stack;
			continue;
		}

		if (detector.deps && detector.files.includes("package.json")) {
			try {
				const pkg = JSON.parse(
					fs.readFileSync(path.join(projectRoot, "package.json"), "utf-8"),
				);
				const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
				if (detector.deps.some((dep) => dep in allDeps)) return stack;
			} catch {
				return stack;
			}
		} else if (!detector.deps) {
			return stack;
		}
	}
	return null;
}

/** How far below a declared project root a manifest is searched for. */
export const MAX_STACK_DEPTH = 3;

const DEEP_SKIP_DIRS = new Set([
	...NODE_STD_SKIP_DIRS,
	"target",
	"bin",
	"obj",
	"vendor",
]);

export interface DeepStackMatch {
	stack: string;
	/** Directory holding the manifest — where the stack's commands must run. */
	dir: string;
}

/**
 * Stack detection that looks below `projectRoot`: a workspace's project may
 * keep its build one or more levels down (projects/api/backend/pom.xml). The
 * root is tried first, then its subdirectories breadth-first up to `maxDepth`
 * levels (hidden and build-output directories skipped), and the shallowest
 * manifest wins. The node-std fallback is applied only to the root itself, and
 * only after no manifest was found at any depth — otherwise a stray script at
 * the top would hide the real project underneath.
 */
export function detectStackDeep(
	projectRoot: string,
	maxDepth = MAX_STACK_DEPTH,
): DeepStackMatch | null {
	let level = [projectRoot];
	for (let depth = 0; depth <= maxDepth && level.length > 0; depth++) {
		const next: string[] = [];
		for (const dir of level) {
			const stack = detectManifestStack(dir);
			if (stack) return { stack, dir };
			let entries: fs.Dirent[];
			try {
				entries = fs.readdirSync(dir, { withFileTypes: true });
			} catch {
				continue;
			}
			for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
				if (
					e.isDirectory() &&
					!e.name.startsWith(".") &&
					!DEEP_SKIP_DIRS.has(e.name)
				) {
					next.push(path.join(dir, e.name));
				}
			}
		}
		level = next;
	}
	if (hasNodeSourceFiles(projectRoot)) {
		return { stack: "node-std", dir: projectRoot };
	}
	return null;
}

export type DeclaredRootStack =
	| { ok: true; stack: string; dir: string }
	| { ok: false; error: "undetected-stack"; root: string; message: string };

/**
 * Stack of a root the workspace DECLARED (verifyOnStop.projectRoots). A
 * declared root states that a project lives there, so failing to find a stack
 * is reported as an identifiable configuration error instead of `null` — the
 * Stop hook turns it into a fail-closed gate (see hooks/verify-on-stop.js).
 */
export function resolveDeclaredRootStack(root: string): DeclaredRootStack {
	const match = detectStackDeep(root);
	if (match) return { ok: true, ...match };
	return {
		ok: false,
		error: "undetected-stack",
		root,
		message: `Could not detect stack for declared project root ${root} (searched ${MAX_STACK_DEPTH} levels down)`,
	};
}

function segmentToRegExp(segment: string): RegExp {
	const body = segment
		.split("")
		.map((ch) => {
			if (ch === "*") return ".*";
			if (ch === "?") return ".";
			return ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
		})
		.join("");
	return new RegExp(`^${body}$`, process.platform === "win32" ? "i" : "");
}

/**
 * Expand verifyOnStop.projectRoots entries against `base`. Each entry is a
 * path relative to `base` whose segments may use `*` / `?` wildcards
 * ("projects/*"); matches are directories only, hidden ones skipped. Entries
 * that do not resolve to an existing directory are dropped. Mirrors the
 * expansion in hooks/verify-on-stop.js, which cannot import this module.
 */
export function expandProjectRoots(base: string, patterns: string[]): string[] {
	const isDir = (p: string) => {
		try {
			return fs.statSync(p).isDirectory();
		} catch {
			return false;
		}
	};
	const out: string[] = [];
	for (const raw of patterns) {
		if (typeof raw !== "string" || raw.trim().length === 0) continue;
		let current = [base];
		for (const segment of raw.trim().split(/[\\/]+/).filter(Boolean)) {
			if (!/[*?]/.test(segment)) {
				current = current.map((d) => path.join(d, segment));
				continue;
			}
			const re = segmentToRegExp(segment);
			const next: string[] = [];
			for (const dir of current) {
				let names: string[];
				try {
					names = fs.readdirSync(dir);
				} catch {
					continue;
				}
				for (const name of names.sort()) {
					if (name.startsWith(".") || !re.test(name)) continue;
					next.push(path.join(dir, name));
				}
			}
			current = next;
		}
		for (const dir of current) {
			if (isDir(dir) && !out.includes(dir)) out.push(dir);
		}
	}
	return out;
}

export function scanWorkspace(workspaceRoot: string): WorkspaceConfig {
	const existing = loadWorkspaceConfig(workspaceRoot);
	const projects: WorkspaceProject[] =
		existing && isWorkspaceMode(existing) ? [...existing.projects] : [];
	const existingPaths = new Set(projects.map((p) => p.path));

	const entries = fs.readdirSync(workspaceRoot, { withFileTypes: true });
	for (const entry of entries) {
		if (
			!entry.isDirectory() ||
			entry.name.startsWith(".") ||
			entry.name === "node_modules"
		)
			continue;
		const projectPath = path.join(workspaceRoot, entry.name);
		if (existingPaths.has(entry.name)) continue;
		const stack = detectStack(projectPath);
		if (stack) {
			projects.push({
				path: entry.name,
				stack,
				config: `./${entry.name}/.harness.config.json`,
			});
		}
	}

	const config: WorkspaceConfig = {
		version: "1",
		generated: new Date().toISOString(),
		lastScan: new Date().toISOString(),
		projects,
		workspaceConfig: { autoRescan: true, reportPath: ".harness/reports" },
	};

	saveWorkspaceConfig(workspaceRoot, config);
	return config;
}

export function shouldRescan(workspaceRoot: string): boolean {
	const config = loadWorkspaceConfig(workspaceRoot);
	if (!config || !isWorkspaceMode(config)) return true;
	if (!config.workspaceConfig.autoRescan) return false;
	const lastScan = new Date(config.lastScan).getTime();
	const now = Date.now();
	return now - lastScan > 5 * 60 * 1000;
}
