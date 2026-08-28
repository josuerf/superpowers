import * as fs from "node:fs";
import * as path from "node:path";
import type {
	HarnessConfig,
	WorkspaceConfig,
	ProjectConfig,
	WorkspaceProject,
} from "./types";

const DEFAULT_CONFIG: HarnessConfig = {
	coverageMin: 80,
	verifyOnStop: { minFiles: 3 },
	securityScan: {
		enabled: true,
		tools: { semgrep: true, gitleaks: true, npmAudit: true, trivy: false },
	},
	domainSpecific: {},
	timeout: { verifyLocal: 30, verifyAll: 300 },
	failOn: { lint: "error", coverage: "warning", security: "error" },
	duplication: {
		enabled: true,
		maxDuplication: 5,
		minLines: 5,
		minTokens: 50,
		ignorePatterns: ["**/*.test.ts", "**/*.spec.ts", "**/node_modules/**", "**/*.min.js"],
	},
	complexity: {
		enabled: true,
		thresholds: {
			"react-nextjs": 10,
			"node-express": 10,
			"node-fastify": 10,
			"node-elysia": 10,
			"node-std": 10,
			"java-springboot": 10,
			"csharp-dotnet": 15,
			"csharp-aspnet": 15,
			"python-fastapi": 10,
			"go-std": 10,
		},
	},
	reviewAggressiveness: {
		enabled: false,
		level: "standard",
		chunking: {
			enabled: true,
			maxFilesPerChunk: 10,
			maxLinesPerChunk: 2000,
			byTopic: true,
		},
		carrasco: {
			redTeamEnabled: true,
			redTeamParallel: true,
			requireReproducibleTrigger: true,
			focusCategories: [
				"logic-bugs",
				"adversarial-inputs",
				"state-corruption",
				"concurrency-timing",
				"resource-exhaustion",
				"error-cascading",
				"assumption-violations",
				"production-context-assumptions",
			],
			severityThreshold: "High",
		},
		standards: {
			autoDetect: true,
			paths: [],
		},
		exclude: {
			useDefaults: true,
			patterns: [],
		},
		reportOutput: {
			saveToHarness: true,
			format: "both",
		},
	},
};

/**
 * Built-in exclusions for the reviewed change set: generated, vendored, and
 * lock artifacts, plus the agent/harness config trees. `.claude/` and
 * `.harness/` are here because the review reads untracked files too — a repo
 * that keeps local skills or review reports under those directories without
 * committing them would otherwise feed every one of those files to a reviewer.
 * Add project-specific patterns via `reviewAggressiveness.exclude.patterns`.
 */
export const DEFAULT_REVIEW_EXCLUDE: string[] = [
	"(^|[\\\\/])node_modules[\\\\/]",
	"(^|[\\\\/])dist[\\\\/]",
	"(^|[\\\\/])\\.claude[\\\\/]",
	"(^|[\\\\/])\\.harness[\\\\/]",
	"[\\\\/]?package-lock\\.json$",
	"[\\\\/]?pnpm-lock\\.yaml$",
	"[\\\\/]?yarn\\.lock$",
	"[\\\\/]?bun\\.lockb$",
	"\\.min\\.(js|css)$",
	"\\.map$",
];

/**
 * Compile the effective exclusion list for a project. An invalid regex from a
 * project config is skipped with a warning rather than crashing the review —
 * a typo in one pattern must not take the whole gate down.
 */
export function buildReviewExclude(
	config: HarnessConfig["reviewAggressiveness"],
): RegExp[] {
	const raw = config.exclude.useDefaults
		? [...DEFAULT_REVIEW_EXCLUDE, ...config.exclude.patterns]
		: [...config.exclude.patterns];
	const compiled: RegExp[] = [];
	for (const p of raw) {
		try {
			compiled.push(new RegExp(p));
		} catch {
			console.warn(
				`reviewAggressiveness.exclude: ignoring invalid regular expression ${JSON.stringify(p)}`,
			);
		}
	}
	return compiled;
}

/**
 * The severity threshold is compared against reviewer-reported severities,
 * which are capitalised ("High"). A config written as "HIGH" or "high" used to
 * miss the lookup and fall back to High silently — harmless for High itself,
 * but "CRITICAL" would then quietly tighten to High instead of loosening.
 * Canonicalise on load so both the gate and the reviewer prompt see one form.
 */
function normalizeSeverityThreshold(
	value: unknown,
	fallback: HarnessConfig["reviewAggressiveness"]["carrasco"]["severityThreshold"],
): HarnessConfig["reviewAggressiveness"]["carrasco"]["severityThreshold"] {
	if (typeof value !== "string") return fallback;
	switch (value.trim().toLowerCase()) {
		case "critical":
			return "Critical";
		case "high":
			return "High";
		case "medium":
			return "Medium";
		default:
			console.warn(
				`reviewAggressiveness.carrasco.severityThreshold: unknown value ${JSON.stringify(value)}; using ${fallback}`,
			);
			return fallback;
	}
}

// Deep-merge a user-provided reviewAggressiveness block over the defaults so a
// partial config (e.g. just `{ "level": "strict" }`) does not wipe nested
// defaults like focusCategories or chunking. A plain `{ ...default, ...raw }`
// would replace the whole nested object.
function mergeReviewAggressiveness(
	base: HarnessConfig["reviewAggressiveness"],
	override: unknown,
): HarnessConfig["reviewAggressiveness"] {
	if (typeof override !== "object" || override === null) return base;
	const o = override as Record<string, unknown>;
	const obj = (v: unknown): Record<string, unknown> =>
		typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
	const carrasco = { ...base.carrasco, ...obj(o.carrasco) };
	carrasco.severityThreshold = normalizeSeverityThreshold(
		carrasco.severityThreshold,
		base.carrasco.severityThreshold,
	);
	return {
		...base,
		...o,
		chunking: { ...base.chunking, ...obj(o.chunking) },
		carrasco,
		standards: { ...base.standards, ...obj(o.standards) },
		exclude: { ...base.exclude, ...obj(o.exclude) },
		reportOutput: { ...base.reportOutput, ...obj(o.reportOutput) },
	} as HarnessConfig["reviewAggressiveness"];
}

export function loadProjectConfig(projectRoot: string): HarnessConfig {
	const configPath = path.join(projectRoot, ".harness.config.json");
	if (!fs.existsSync(configPath)) return DEFAULT_CONFIG;
	try {
		const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
		const merged = { ...DEFAULT_CONFIG, ...raw };
		merged.reviewAggressiveness = mergeReviewAggressiveness(
			DEFAULT_CONFIG.reviewAggressiveness,
			raw.reviewAggressiveness,
		);
		return merged;
	} catch {
		return DEFAULT_CONFIG;
	}
}

/**
 * Chunking defaults used ONLY for an --inline (Stop-hook-triggered) review
 * plan when the project hasn't tuned chunking itself. These exist to keep an
 * automatic, unattended review cheap by default (2 carrasco subagents max) —
 * a project that has already tuned `reviewAggressiveness.chunking` always
 * keeps its own values instead, inline or not. See resolveInlineChunking.
 */
export const INLINE_CHUNKING_DEFAULTS = {
	maxChunks: 2,
	maxFilesPerChunk: 20,
	byTopic: true,
} as const;

/**
 * Above this many changed files, an untuned inline run must not silently
 * dispatch reviewers — the caller (the agent following the carrasco-review
 * skill) is expected to surface the cost to its human partner and get a
 * chunking config confirmed before proceeding. See resolveInlineChunking.
 */
export const INLINE_CONFIRM_ABOVE_FILES = 40;

/**
 * True when the project's .harness.config.json explicitly sets ANY key under
 * reviewAggressiveness.chunking. Deliberately reads the RAW file rather than
 * loadProjectConfig's merged result: the merged config always has a fully
 * populated chunking block courtesy of DEFAULT_CONFIG, so only the raw file
 * can tell "the user set this" apart from "the default filled it in".
 */
export function hasExplicitChunkingConfig(projectRoot: string): boolean {
	const configPath = path.join(projectRoot, ".harness.config.json");
	try {
		const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
		const chunking = raw?.reviewAggressiveness?.chunking;
		return (
			typeof chunking === "object" &&
			chunking !== null &&
			Object.keys(chunking).length > 0
		);
	} catch {
		return false;
	}
}

export interface ResolveInlineChunkingResult {
	chunking: HarnessConfig["reviewAggressiveness"]["chunking"];
	/**
	 * True when the change set is large, the project hasn't tuned chunking,
	 * and no override was supplied — the caller must get human confirmation
	 * (and, typically, a chosen chunking config passed back as `overrides`)
	 * before running a plan. `chunking` is returned unchanged in this case.
	 */
	needsConfirmation: boolean;
}

/**
 * Resolve the chunking config to use for an --inline review plan.
 *
 * - A project that has explicitly tuned `reviewAggressiveness.chunking`
 *   always keeps its own values — inline defaults are a fallback only.
 * - `overrides` (explicit --max-chunks/--max-files-per-chunk/--by-topic CLI
 *   flags) always win, over both project config and inline defaults: their
 *   presence signals a human already confirmed (or adjusted) a proposal.
 * - Otherwise, an untuned project gets the cheap INLINE_CHUNKING_DEFAULTS —
 *   unless the change set exceeds INLINE_CONFIRM_ABOVE_FILES, in which case
 *   this returns needsConfirmation: true instead of guessing.
 */
export function resolveInlineChunking(
	projectRoot: string,
	base: HarnessConfig["reviewAggressiveness"]["chunking"],
	changedFileCount: number,
	overrides: Partial<{
		maxChunks: number;
		maxFilesPerChunk: number;
		byTopic: boolean;
	}>,
): ResolveInlineChunkingResult {
	const hasOverrides = Object.keys(overrides).length > 0;
	if (hasOverrides || hasExplicitChunkingConfig(projectRoot)) {
		return { chunking: { ...base, ...overrides }, needsConfirmation: false };
	}
	if (changedFileCount > INLINE_CONFIRM_ABOVE_FILES) {
		return { chunking: base, needsConfirmation: true };
	}
	return {
		chunking: { ...base, ...INLINE_CHUNKING_DEFAULTS },
		needsConfirmation: false,
	};
}

export function loadWorkspaceConfig(
	workspaceRoot: string,
): WorkspaceConfig | ProjectConfig | null {
	const configPath = path.join(workspaceRoot, ".harness-workspace.json");
	if (!fs.existsSync(configPath)) return null;
	try {
		return JSON.parse(fs.readFileSync(configPath, "utf-8"));
	} catch {
		return null;
	}
}

export function isWorkspaceMode(
	config: WorkspaceConfig | ProjectConfig,
): config is WorkspaceConfig {
	return (
		"projects" in config && Array.isArray((config as WorkspaceConfig).projects)
	);
}

export function getProjects(
	config: WorkspaceConfig | ProjectConfig,
): WorkspaceProject[] {
	if (isWorkspaceMode(config)) return config.projects;
	return [
		{
			path: (config as ProjectConfig).projectRoot || ".",
			stack: (config as ProjectConfig).stack,
			config: (config as ProjectConfig).config,
		},
	];
}

export function saveWorkspaceConfig(
	workspaceRoot: string,
	config: WorkspaceConfig | ProjectConfig,
): void {
	const configPath = path.join(workspaceRoot, ".harness-workspace.json");
	fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
}
