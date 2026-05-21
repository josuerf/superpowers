import type { DuplicationResult, ParsedError, DuplicationConfig } from "../types";
import { runCommand, compressOutput } from "../runner";
import * as path from "node:path";
import * as fs from "node:fs";

export async function validateDuplication(
	cwd: string,
	config: DuplicationConfig,
	timeout: number = 60000,
): Promise<DuplicationResult> {
	const start = Date.now();
	const errors: ParsedError[] = [];
	const warnings: string[] = [];

	const ignoreArgs = config.ignorePatterns.flatMap((p) => ["--ignore", p]);

	const cmd = [
		"npx",
		"jscpd",
		"--json",
		`--output`,
		path.join(cwd, ".harness", ".jscpd-report.json"),
		`--min-lines`,
		String(config.minLines),
		`--min-tokens`,
		String(config.minTokens),
		`--threshold`,
		String(config.maxDuplication),
		...ignoreArgs,
		".",
	].join(" ");

	const result = await runCommand(cmd, cwd, timeout);
	const output = result.stderr || result.stdout;

	// jscpd exits 0 when under threshold, 1 when over threshold
	// Exit code 124 = timeout, other non-zero = tool error
	if (result.exitCode === 124) {
		warnings.push(`jscpd: timeout after ${timeout}ms`);
		return { passed: true, duplicationPercent: 0, totalDuplicationLines: 0, errors, warnings, duration: Date.now() - start };
	}

	if (result.exitCode > 1) {
		// Tool not found or other error — fail open
		warnings.push(`jscpd: tool error — ${compressOutput(output, 10)}`);
		return { passed: true, duplicationPercent: 0, totalDuplicationLines: 0, errors, warnings, duration: Date.now() - start };
	}

	// Parse the JSON report
	const reportPath = path.join(cwd, ".harness", ".jscpd-report.json");
	if (fs.existsSync(reportPath)) {
		try {
			const raw = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
			const duplicationPercent = raw.duplications?.percentage || 0;
			const totalDuplicationLines = raw.duplications?.lines || 0;

			if (raw.duplications?.detection?.length > 0) {
				for (const detection of raw.duplications.detection) {
					for (const file of detection.duplicatedFiles || []) {
						const err: ParsedError = {
							file: file.file || "",
							line: file.startLine || 0,
							column: 0,
							message: `Duplicate block (${detection.lines} lines, ${detection.tokens} tokens) also found in: ${(detection.duplicatedFiles || []).map((f: any) => f.file).join(", ")}`,
							rule: "jscpd",
							severity: duplicationPercent > config.maxDuplication ? "error" : "warning",
						};

						if (duplicationPercent > config.maxDuplication) {
							errors.push(err);
						} else {
							warnings.push(`${file.file}:${file.startLine} — ${err.message}`);
						}
					}
				}
			}

			return {
				passed: duplicationPercent <= config.maxDuplication,
				duplicationPercent,
				totalDuplicationLines,
				errors,
				warnings,
				duration: Date.now() - start,
			};
		} catch {
			warnings.push("jscpd: report JSON could not be parsed");
			return { passed: true, duplicationPercent: 0, totalDuplicationLines: 0, errors, warnings, duration: Date.now() - start };
		}
	}

	// No report file — jscpd ran but produced no output
	return { passed: true, duplicationPercent: 0, totalDuplicationLines: 0, errors, warnings, duration: Date.now() - start };
}
