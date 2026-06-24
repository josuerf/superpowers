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
			"java-springboot": 10,
			"csharp-dotnet": 15,
			"csharp-aspnet": 15,
			"python-fastapi": 10,
			"go-std": 10,
		},
	},
	reviewAggressiveness: {
		enabled: true,
		level: "carrasco",
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
		reportOutput: {
			saveToHarness: true,
			format: "both",
		},
	},
};

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
	return {
		...base,
		...o,
		chunking: { ...base.chunking, ...obj(o.chunking) },
		carrasco: { ...base.carrasco, ...obj(o.carrasco) },
		standards: { ...base.standards, ...obj(o.standards) },
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
