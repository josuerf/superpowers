import type { ComplexityResult, ParsedError, ComplexityConfig } from "../types";
import { runCommand, compressOutput } from "../runner";

interface StackTool {
	cmd: string | ((threshold: number) => string);
	installHint: string;
	parseOutput: (output: string, threshold: number, cwd: string) => Array<{ file: string; line: number; name: string; complexity: number; threshold: number }>;
}

const parseEslintOutput = (output: string, threshold: number, cwd: string) => {
	const violations: Array<{ file: string; line: number; name: string; complexity: number; threshold: number }> = [];
	try {
		const parsed = JSON.parse(output);
		if (!Array.isArray(parsed)) return violations;
		for (const file of parsed) {
			for (const msg of file.messages || []) {
				if (msg.ruleId === "complexity" && msg.severity === 2) {
					const match = msg.message.match(/'(.+?)' is \((\d+)\)/);
					if (match) {
						violations.push({
							file: file.filePath || "",
							line: msg.line || 0,
							name: match[1],
							complexity: parseInt(match[2], 10),
							threshold,
						});
					}
				}
			}
		}
	} catch {
		// eslint not available or output not JSON — fail open
	}
	return violations;
};

const STACK_TOOLS: Record<string, StackTool> = {
	"react-nextjs": {
		cmd: (threshold: number) => `npx eslint --rule 'complexity: [error, ${threshold}]' --format json . 2>&1 || true`,
		installHint: "npx eslint-plugin-complexity is bundled with eslint",
		parseOutput: parseEslintOutput,
	},
	"node-express": {
		cmd: (threshold: number) => `npx eslint --rule 'complexity: [error, ${threshold}]' --format json . 2>&1 || true`,
		installHint: "npx eslint-plugin-complexity is bundled with eslint",
		parseOutput: parseEslintOutput,
	},
	"node-fastify": {
		cmd: (threshold: number) => `npx eslint --rule 'complexity: [error, ${threshold}]' --format json . 2>&1 || true`,
		installHint: "npx eslint-plugin-complexity is bundled with eslint",
		parseOutput: parseEslintOutput,
	},
	"node-elysia": {
		cmd: (threshold: number) => `npx eslint --rule 'complexity: [error, ${threshold}]' --format json . 2>&1 || true`,
		installHint: "npx eslint-plugin-complexity is bundled with eslint",
		parseOutput: parseEslintOutput,
	},
	"python-fastapi": {
		cmd: () => "radon cc --min C --json src/ 2>&1 || true",
		installHint: "pip install radon",
		parseOutput: (output: string, threshold: number, cwd: string) => {
			const violations: Array<{ file: string; line: number; name: string; complexity: number; threshold: number }> = [];
			try {
				const parsed = JSON.parse(output);
				for (const [filePath, entries] of Object.entries(parsed)) {
					for (const entry of entries as any[]) {
						if (entry.complexity >= threshold) {
							violations.push({
								file: filePath,
								line: entry.lineno || 0,
								name: entry.name || "unknown",
								complexity: entry.complexity,
								threshold,
							});
						}
					}
				}
			} catch {
				// radon not available or output not JSON — fail open
			}
			return violations;
		},
	},
	"go-std": {
		cmd: (threshold: number) => `gocyclo -over ${threshold} -json . 2>&1 || gocyclo -over ${threshold} . 2>&1 || true`,
		installHint: "go install github.com/fzipp/gocyclo/cmd/gocyclo@latest",
		parseOutput: (output: string, threshold: number, cwd: string) => {
			const violations: Array<{ file: string; line: number; name: string; complexity: number; threshold: number }> = [];
			// gocyclo text format: "complexity funcName file:line"
			for (const line of output.split("\n")) {
				const match = line.match(/^(\d+)\s+:\w+\s+(.+?):(\d+)/);
				if (match) {
					violations.push({
						file: match[2],
						line: parseInt(match[3], 10),
						name: line.split(":")[1]?.trim() || "unknown",
						complexity: parseInt(match[1], 10),
						threshold,
					});
				}
			}
			return violations;
		},
	},
};

export async function validateComplexity(
	cwd: string,
	stack: string,
	config: ComplexityConfig,
	timeout: number = 30000,
): Promise<ComplexityResult> {
	const start = Date.now();
	const threshold = config.thresholds[stack] || 10;

	// Stacks without a dedicated tool — fail open, let LLM review handle it
	if (!(stack in STACK_TOOLS)) {
		return { passed: true, maxComplexityFound: 0, violations: [], duration: Date.now() - start };
	}

	const tool = STACK_TOOLS[stack];
	const cmd = typeof tool.cmd === "function" ? tool.cmd(threshold) : tool.cmd;

	const result = await runCommand(cmd, cwd, timeout);
	const output = result.stderr || result.stdout;

	const violations = tool.parseOutput(output, threshold, cwd);
	const maxComplexityFound = violations.length > 0 ? Math.max(...violations.map(v => v.complexity)) : 0;

	return {
		passed: violations.length === 0,
		maxComplexityFound,
		violations,
		duration: Date.now() - start,
	};
}
