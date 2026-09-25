#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import {
	verify,
	loadProjectConfig,
	detectStack,
	extractFeatureName,
	buildReviewPlan,
	buildRecheckPrompt,
	aggregateCarrascoResponses,
	foldRedTeamReport,
	prepareRedTeamRecheck,
	RED_TEAM_REPORT,
	RED_TEAM_PREVIOUS,
	saveCarrascoReview,
	evaluateGateStatus,
	resolveMergeBase,
	baseRefWarning,
	reviewDiff,
	featureReviewDir,
	buildReviewExclude,
	resolveInlineChunking,
	INLINE_CONFIRM_ABOVE_FILES,
	type CarrascoResponse,
	type SavedDecision,
} from "../../lib/harness/index.js";
import { validateDuplication } from "../../lib/harness/validators/duplication.js";
import { validateComplexity } from "../../lib/harness/validators/complexity.js";
import {
	verifyCompleteness,
	formatCompletenessMarkdown,
} from "../../lib/harness/completeness/verifier.js";
import {
	detectDeadCode,
	formatDeadCodeMarkdown,
} from "../../lib/harness/deadcode/detector.js";
import {
	analyzeDrift,
	formatDriftMarkdown,
} from "../../lib/harness/drift/analyzer.js";

const args = process.argv.slice(2);
const command = args[0] || "local";

const modeMap: Record<
	string,
	"verify-local" | "verify-all" | "verify-security"
> = {
	local: "verify-local",
	all: "verify-all",
	security: "verify-security",
};

function findSpecPath(): string | null {
	const specFlag = args.indexOf("--spec");
	if (specFlag !== -1 && args[specFlag + 1]) return args[specFlag + 1];

	const candidates = [
		"docs/specs/latest.md",
		"docs/spec.md",
		"SPEC.md",
		"spec.md",
	];
	for (const c of candidates) {
		try {
			require("node:fs").accessSync(c);
			return c;
		} catch {
			/* skip */
		}
	}
	return null;
}

function getProjectRoot(): string {
	const rootFlag = args.indexOf("--root");
	if (rootFlag !== -1 && args[rootFlag + 1]) return args[rootFlag + 1];
	return process.cwd();
}

function getFlag(name: string): string | undefined {
	const i = args.indexOf(name);
	return i !== -1 && args[i + 1] ? args[i + 1] : undefined;
}

// Parses a --flag into a positive integer, ignoring anything unparsable —
// fails open like the rest of this file rather than crashing the CLI over a
// malformed override.
function getPositiveIntFlag(name: string): number | undefined {
	const raw = getFlag(name);
	if (raw === undefined) return undefined;
	const n = Number(raw);
	return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}

function getBoolFlag(name: string): boolean | undefined {
	const raw = getFlag(name);
	if (raw === undefined) return undefined;
	return raw === "true";
}

function gitOut(cwd: string, gitArgs: string[]): string | null {
	const res = spawnSync("git", gitArgs, {
		cwd,
		encoding: "utf8",
		timeout: 10000,
		maxBuffer: 50 * 1024 * 1024,
	});
	if (res.status !== 0 || res.error) return null;
	return res.stdout ?? "";
}

// The change set fed to the reviewers: tracked changes plus untracked files
// (a new file nobody committed yet is exactly what most needs reviewing),
// minus everything the project's exclusion list rules out — see
// `reviewAggressiveness.exclude` and DEFAULT_REVIEW_EXCLUDE.
function gatherChangedFiles(
	cwd: string,
	exclude: RegExp[],
	base?: string,
): string[] {
	const range = base || "HEAD";
	const files = new Set<string>();
	const tracked = gitOut(cwd, ["diff", "--name-only", range]);
	if (tracked) {
		for (const f of tracked.split("\n").map((s) => s.trim()).filter(Boolean)) {
			files.add(f);
		}
	}
	const untracked = gitOut(cwd, ["ls-files", "--others", "--exclude-standard"]);
	if (untracked) {
		for (const f of untracked.split("\n").map((s) => s.trim()).filter(Boolean)) {
			files.add(f);
		}
	}
	return [...files].filter((f) => !exclude.some((re) => re.test(f)));
}

async function runReview(): Promise<void> {
	const sub = args[1] || "plan";
	const cwd = getProjectRoot();
	const config = loadProjectConfig(cwd);
	const ra = config.reviewAggressiveness;
	const feature = getFlag("--feature") || extractFeatureName(cwd);
	// Comparison ref: --base, else verifyOnStop.baseRef. The range starts at
	// merge-base(baseRef, HEAD) so it covers the branch's own commits and not
	// whatever landed on the base since; a ref that does not resolve here
	// degrades to the working tree (HEAD), same as passing no base at all.
	const baseRef = getFlag("--base") || config.verifyOnStop.baseRef;
	const dir = featureReviewDir(cwd, feature);
	const baseWarning = baseRefWarning(cwd, baseRef);
	if (baseWarning) console.error(baseWarning);

	if (sub === "gate-status") {
		if (!ra.enabled) {
			console.log(
				JSON.stringify({
					gate: "pass",
					action: null,
					reason: "carrasco review disabled in config",
				}),
			);
			process.exit(0);
		}
		const status = evaluateGateStatus(cwd, feature, baseRef);
		console.log(JSON.stringify(status));
		process.exit(status.gate === "pass" ? 0 : 1);
	}

	// reviewAggressiveness.enabled only gates the automatic Stop-hook trigger
	// (checked above, in the gate-status branch). A direct invocation of
	// plan/recheck/aggregate — by a human or by the carrasco-review skill
	// itself — always runs regardless of the flag, per the skill's documented
	// contract ("Invoking the skill directly ... always works regardless of
	// this flag").

	if (sub === "plan") {
		const base = resolveMergeBase(cwd, baseRef) ?? undefined;
		const changedFiles = gatherChangedFiles(cwd, buildReviewExclude(ra), base);
		if (changedFiles.length === 0) {
			console.log("No changed files to review.");
			process.exit(0);
		}
		let planConfig = ra;
		if (args.includes("--inline")) {
			const overrides: Partial<{
				maxChunks: number;
				maxFilesPerChunk: number;
				byTopic: boolean;
			}> = {};
			const maxChunks = getPositiveIntFlag("--max-chunks");
			if (maxChunks !== undefined) overrides.maxChunks = maxChunks;
			const maxFilesPerChunk = getPositiveIntFlag("--max-files-per-chunk");
			if (maxFilesPerChunk !== undefined) overrides.maxFilesPerChunk = maxFilesPerChunk;
			const byTopic = getBoolFlag("--by-topic");
			if (byTopic !== undefined) overrides.byTopic = byTopic;

			const resolved = resolveInlineChunking(
				cwd,
				ra.chunking,
				changedFiles.length,
				overrides,
			);
			if (resolved.needsConfirmation) {
				console.log(
					JSON.stringify({
						needsConfirmation: true,
						fileCount: changedFiles.length,
						confirmAboveFiles: INLINE_CONFIRM_ABOVE_FILES,
						suggestedDefaults: { maxChunks: 2, maxFilesPerChunk: 20, byTopic: true },
					}),
				);
				process.exit(3);
			}
			planConfig = { ...ra, chunking: resolved.chunking };
		}

		const gitDiff = reviewDiff(cwd, baseRef);
		// --plan-file: the implementation plan behind the change. Its `Risk flags`
		// add a red-team dispatch (gated by carrasco.redTeamEnabled).
		const planFile = getFlag("--plan-file");
		let planText: string | undefined;
		if (planFile) {
			const planPath = path.resolve(cwd, planFile);
			if (!fs.existsSync(planPath)) {
				console.error(`Plan file not found: ${planPath}`);
				process.exit(1);
			}
			planText = fs.readFileSync(planPath, "utf8");
		}
		const plan = buildReviewPlan({
			feature,
			changedFiles,
			gitDiff,
			config: planConfig,
			generatedAt: new Date().toISOString(),
			planText,
			projectRoot: cwd,
		});

		fs.mkdirSync(dir, { recursive: true });
		fs.mkdirSync(path.join(dir, "prompts"), { recursive: true });
		fs.mkdirSync(path.join(dir, "responses"), { recursive: true });
		fs.writeFileSync(
			path.join(dir, "plan.json"),
			`${JSON.stringify(plan, null, 2)}\n`,
		);
		for (const chunk of plan.chunks) {
			fs.writeFileSync(
				path.join(dir, "prompts", `${chunk.id}.md`),
				`${chunk.prompt}\n`,
			);
		}
		// A fresh plan starts a fresh review: a red-team report from an earlier
		// plan must not be folded into this one's verdict.
		const staleRedTeam = path.join(dir, RED_TEAM_REPORT);
		if (fs.existsSync(staleRedTeam)) fs.renameSync(staleRedTeam, path.join(dir, RED_TEAM_PREVIOUS));
		const redTeamPromptPath = path.join(dir, "red-team-prompt.md");
		if (plan.redTeam) {
			fs.writeFileSync(redTeamPromptPath, `${plan.redTeam.prompt}\n`);
		} else if (fs.existsSync(redTeamPromptPath)) {
			fs.rmSync(redTeamPromptPath);
		}

		console.log(`Carrasco review plan — feature: ${feature} | level: ${plan.level}`);
		console.log(
			`${plan.totalFiles} file(s) → ${plan.totalChunks} chunk(s) | stacks: ${plan.stacks.join(", ") || "universal"}`,
		);
		for (const chunk of plan.chunks) {
			console.log(
				`  ${chunk.id} [${chunk.topic}] — ${chunk.files.length} file(s), ~${chunk.estimatedLines} changed lines, stacks: ${chunk.stacks.join(", ") || "universal"}`,
			);
		}
		for (const f of plan.deterministicFindings ?? []) {
			console.log(`  WARNING ${f.file}:${f.line} [${f.category}] ${f.issue}`);
		}
		console.log(`\nPlan saved to: ${path.join(dir, "plan.json")}`);
		console.log(`Per-chunk prompts: ${path.join(dir, "prompts")}/`);
		console.log(
			`Dispatch one carrasco subagent per chunk, then write each response to ${path.join(dir, "responses")}/<chunk-id>.txt and run: review aggregate --feature ${feature}`,
		);
		if (plan.redTeam) {
			console.log(
				`Red team (Risk flags: ${plan.redTeam.flags.join(", ")}): dispatch ${plan.redTeam.agent} with ${redTeamPromptPath} ${plan.redTeam.parallel ? "in the same message as the chunks" : "after the chunks"} — focus: ${plan.redTeam.focusCategories.join(", ")}. Write its report to ${path.join(dir, "red-team.md")} (not responses/) BEFORE review aggregate: aggregate reads it and its findings at or above severityThreshold block like any carrasco finding.`,
			);
		}
		process.exit(0);
	}

	if (sub === "recheck") {
		const decisionPath = path.join(dir, "decision.json");
		if (!fs.existsSync(decisionPath)) {
			console.error(`No prior review found for '${feature}' at ${decisionPath}. Run 'review plan' (and 'review aggregate') first.`);
			process.exit(1);
		}
		let decision: SavedDecision;
		try {
			decision = JSON.parse(fs.readFileSync(decisionPath, "utf8"));
		} catch {
			console.error(`Could not parse ${decisionPath}.`);
			process.exit(1);
		}
		if (!decision.chunkVerdicts || decision.chunkVerdicts.length === 0) {
			console.error(
				"The prior decision has no per-chunk verdicts (from an older review). Run a full 'review plan' instead.",
			);
			process.exit(1);
		}

		const explicitChunks = getFlag("--chunks");
		const note = getFlag("--note");
		const targetIds = explicitChunks
			? explicitChunks.split(",").map((s) => s.trim()).filter(Boolean)
			: decision.chunkVerdicts
					.filter((c) => c.action !== "APPROVE")
					.map((c) => c.chunkId);

		// A red team that blocked (or whose report was unreadable/missing) is
		// re-run against the fix; otherwise its old report would block forever.
		const redTeamRecheck = prepareRedTeamRecheck(
			dir,
			decision.redTeam,
			reviewDiff(cwd, baseRef),
			ra,
		);

		if (targetIds.length === 0 && !redTeamRecheck) {
			console.log(
				`No blocked chunks to recheck for '${feature}' — the last review already approved everything.`,
			);
			process.exit(0);
		}

		fs.mkdirSync(path.join(dir, "prompts"), { recursive: true });
		fs.mkdirSync(path.join(dir, "responses"), { recursive: true });

		const rechecked: string[] = [];
		for (const chunkId of targetIds) {
			const verdict = decision.chunkVerdicts.find((c) => c.chunkId === chunkId);
			if (!verdict) {
				console.error(`  Unknown chunk id '${chunkId}' — skipping (not in the last review).`);
				continue;
			}
			const freshDiff =
				verdict.files.length > 0
					? gitOut(cwd, ["diff", "HEAD", "--", ...verdict.files]) || ""
					: "";
			const prompt = buildRecheckPrompt({
				chunkId,
				files: verdict.files,
				priorFindings: verdict.findings,
				freshDiff,
				note,
				config: ra,
				projectRoot: cwd,
			});
			fs.writeFileSync(path.join(dir, "prompts", `${chunkId}.md`), `${prompt}\n`);
			const responsePath = path.join(dir, "responses", `${chunkId}.txt`);
			if (fs.existsSync(responsePath)) fs.rmSync(responsePath);
			rechecked.push(chunkId);
		}

		console.log(
			`Recheck plan — feature: ${feature} | ${rechecked.length} of ${decision.chunkVerdicts.length} chunk(s) targeted`,
		);
		for (const id of rechecked) console.log(`  ${id}`);
		console.log(
			`\nDispatch ONE carrasco subagent per listed chunk with its prompt at ${path.join(dir, "prompts")}/<chunk-id>.md`,
		);
		console.log(
			`Write each response to ${path.join(dir, "responses")}/<chunk-id>.txt, then run: review aggregate --feature ${feature}`,
		);
		console.log(
			"Chunks not listed above keep their previous verdict — their response files are untouched and merge back in automatically.",
		);
		if (redTeamRecheck) {
			console.log(
				`Red team: re-dispatch superpowers-prepared:red-team with ${redTeamRecheck} and write its report to ${path.join(dir, RED_TEAM_REPORT)} before review aggregate (the previous report is in ${RED_TEAM_PREVIOUS}).`,
			);
		}
		process.exit(0);
	}

	if (sub === "aggregate") {
		const responsesDir = path.join(dir, "responses");
		if (!fs.existsSync(responsesDir)) {
			console.error(`No responses directory at ${responsesDir}. Run 'review plan' first.`);
			process.exit(1);
		}
		const responses: CarrascoResponse[] = fs
			.readdirSync(responsesDir)
			.filter((f) => f.endsWith(".txt") || f.endsWith(".md"))
			.sort()
			.map((f) => ({
				chunkId: f.replace(/\.(txt|md)$/, ""),
				text: fs.readFileSync(path.join(responsesDir, f), "utf8"),
			}));
		if (responses.length === 0) {
			console.error(`No carrasco responses found in ${responsesDir}.`);
			process.exit(1);
		}

		let chunkFilesById: Record<string, string[]> = {};
		const planPath = path.join(dir, "plan.json");
		if (fs.existsSync(planPath)) {
			try {
				const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
				for (const c of plan.chunks ?? []) chunkFilesById[c.id] = c.files;
			} catch {
				// plan.json is optional context for chunkVerdicts.files — ignore if unreadable
			}
		}

		let report = aggregateCarrascoResponses(
			feature,
			responses,
			ra,
			new Date().toISOString(),
			chunkFilesById,
		);
		// The red team's Breakage Report is not a REVIEWER_DECISION block, so it
		// lives outside responses/; fold it in here so its findings reach the gate.
		const redTeamPath = path.join(dir, RED_TEAM_REPORT);
		report = foldRedTeamReport(report, dir, ra);
		if (ra.reportOutput.saveToHarness) {
			const saved = saveCarrascoReview(cwd, report, ra, baseRef);
			console.log(`Report saved to: ${saved.dir}`);
		}

		console.log(`\nCarrasco verdict: ${report.harness_action}`);
		console.log(
			`  Findings: ${report.metrics.total_findings} | Critical/High: ${report.metrics.critical_high_count} | Chunks: ${report.metrics.chunks_reviewed}`,
		);
		if (report.metrics.chunks_unparseable > 0) {
			console.log(
				`  ⚠️ Unparseable chunks: ${report.unparseableChunks.join(", ")}`,
			);
		}
		if (report.redTeam) {
			console.log(
				report.redTeam.status !== "parsed"
					? `  ⚠️ Red team report ${report.redTeam.status} (${redTeamPath}) — needs human review`
					: `  Red team: Critical ${report.redTeam.critical} | High ${report.redTeam.high} | Medium ${report.redTeam.medium} (${report.redTeam.blocking} blocking)`,
			);
		}
		await recordReviewPatterns(cwd, report);
		if (report.harness_action === "BLOCK") process.exit(2);
		if (report.harness_action === "NEEDS_HUMAN_REVIEW") process.exit(3);
		process.exit(0);
	}

	console.error(`Unknown review subcommand: ${sub}. Use plan | recheck | aggregate | gate-status.`);
	process.exit(1);
}

/**
 * M13: the aggregated verdict's Critical/High findings become pending
 * `error_pattern` entries (lib/patterns/record.ts), so the catalog fills
 * without anyone remembering to run `patterns record`. This caller is the
 * memory gate's strict side: it never promotes (promotion needs a later
 * explicit `record`/import or `promote`), and a finding whose `file:line`
 * does not resolve in this checkout is discarded and counted in the wiki log.
 * The verdict is the point of `aggregate`; this is a byproduct, so any failure
 * here is a warning and never changes the exit code.
 */
async function recordReviewPatterns(cwd: string, report: { feature: string; findings: import("../../lib/harness/types.js").ReviewerFinding[] }): Promise<void> {
	try {
		const { PatternCatalog } = await import("../../lib/patterns/catalog.js");
		const { loadPatternsConfig, resolveReviewPatternsWiki } = await import("../../lib/patterns/config.js");
		const { recordFindings } = await import("../../lib/patterns/record.js");
		const { parseDecisionJson } = await import("../../lib/patterns/review-sources.js");
		const cfg = loadPatternsConfig(cwd);
		if (!cfg.enabled || report.findings.length === 0) return;
		// The project's wiki, never the global one (see resolveReviewPatternsWiki).
		const wiki = resolveReviewPatternsWiki(cfg, cwd);
		if (!wiki) {
			console.log(
				`  Patterns record skipped: no project patterns wiki in ${cwd} (.superpowers/patterns-wiki or docs/superpowers-prepared/patterns-wiki)`,
			);
			return;
		}
		const project = path.basename(cwd);
		const findings = parseDecisionJson(JSON.stringify({ feature: report.feature, findings: report.findings }), project);
		const s = recordFindings(findings, new PatternCatalog(wiki, wiki), cfg, {
			promote: false,
			verifyCitesRoot: cwd,
			logPath: path.join(wiki, "patterns.log"),
			trigger: `review-aggregate:${report.feature}`,
		});
		if (s.created + s.incremented > 0 || s.discarded.unresolvableCite + s.discarded.noCite > 0) {
			console.log(
				`  Patterns: ${s.created} new pending, ${s.incremented} recurrence(s) recorded; ${s.discarded.noCite + s.discarded.unresolvableCite} discarded without a resolvable citation (${wiki})`,
			);
		}
	} catch (e) {
		console.warn(`  Patterns record skipped: ${e instanceof Error ? e.message : e}`);
	}
}

async function main() {
	if (command === "review") {
		await runReview();
		return;
	}

	if (command === "explain-drift") {
		const specPath = findSpecPath();
		if (!specPath) {
			console.error("No spec found. Use --spec to specify path.");
			process.exit(1);
		}
		const report = analyzeDrift({ specPath, projectRoot: getProjectRoot() });
		console.log(formatDriftMarkdown(report));
		process.exit(report.overallStatus === "aligned" ? 0 : 1);
	}

	if (command === "completeness") {
		const specPath = findSpecPath();
		if (!specPath) {
			console.error("No spec found. Use --spec to specify path.");
			process.exit(1);
		}
		const report = await verifyCompleteness({
			specPath,
			projectRoot: getProjectRoot(),
		});
		console.log(formatCompletenessMarkdown(report));
		process.exit(report.overallStatus === "pass" ? 0 : 1);
	}

	if (command === "deadcode") {
		const filesFlag = args.indexOf("--files");
		const taskFiles =
			filesFlag !== -1 && args[filesFlag + 1]
				? args[filesFlag + 1].split(",")
				: [];
		if (taskFiles.length === 0) {
			console.error("No files specified. Use --files=file1.ts,file2.ts");
			process.exit(1);
		}
		const report = detectDeadCode({ taskFiles, projectRoot: getProjectRoot() });
		console.log(formatDeadCodeMarkdown(report));
		process.exit(report.summary.dead === 0 ? 0 : 1);
	}

	if (command === "duplication") {
		const config = loadProjectConfig(getProjectRoot());
		const thresholdOverride = args.indexOf("--threshold");
		if (thresholdOverride !== -1 && args[thresholdOverride + 1]) {
			config.duplication.maxDuplication = parseInt(args[thresholdOverride + 1], 10);
		}
		const report = await validateDuplication(getProjectRoot(), config.duplication);
		console.log(`Duplication: ${report.duplicationPercent.toFixed(1)}% (threshold: ${config.duplication.maxDuplication}%)`);
		console.log(`Total duplicated lines: ${report.totalDuplicationLines}`);
		if (report.errors.length > 0) {
			console.log(`\n${report.errors.length} error(s):`);
			report.errors.forEach((e, i) => console.log(`  ${i + 1}. ${e.file}:${e.line} - ${e.message}`));
		}
		if (report.warnings.length > 0) {
			console.log(`\n${report.warnings.length} warning(s):`);
			report.warnings.forEach((w, i) => console.log(`  ${i + 1}. ${w}`));
		}
		process.exit(report.passed ? 0 : 1);
	}

	if (command === "complexity") {
		const config = loadProjectConfig(getProjectRoot());
		const targetStack = getFlag("--stack") || detectStack(getProjectRoot());
		if (!targetStack) {
			console.error("Could not detect stack. Use --stack to specify.");
			process.exit(1);
		}
		const thresholdOverride = args.indexOf("--threshold");
		if (thresholdOverride !== -1 && args[thresholdOverride + 1]) {
			config.complexity.thresholds[targetStack] = parseInt(args[thresholdOverride + 1], 10);
		}
		const report = await validateComplexity(getProjectRoot(), targetStack, config.complexity);
		console.log(`Complexity (stack: ${targetStack}): max found = ${report.maxComplexityFound} (threshold: ${config.complexity.thresholds[targetStack] || 10})`);
		if (report.violations.length > 0) {
			console.log(`\n${report.violations.length} violation(s):`);
			report.violations.forEach((v, i) => console.log(`  ${i + 1}. ${v.file}:${v.line} - ${v.name} (complexity: ${v.complexity})`));
		}
		process.exit(report.passed ? 0 : 1);
	}

	const verifyMode = modeMap[command] || "verify-local";

	const secOpsResponseFlag = args.indexOf("--secops-response");
	const secOpsResponse =
		secOpsResponseFlag !== -1 ? args[secOpsResponseFlag + 1] : undefined;

	console.log(`Running ${verifyMode}...`);
	try {
		const report = await verify({
			mode: verifyMode,
			cwd: getProjectRoot(),
			secOpsResponse,
			stack: getFlag("--stack"),
		});

		console.log(`\nReport saved to: .harness/reports/${report.feature}/`);
		console.log(`Duration: ${(report.duration / 1000).toFixed(1)}s`);

		if (report.summary.security) {
			const sec = report.summary.security;
			console.log(`\nSecurity: ${sec.decision}`);
			console.log(
				`  Total: ${sec.totalFindings} | TP: ${sec.truePositives} | FP: ${sec.falsePositives} | Needs Review: ${sec.needsInvestigation}`,
			);
		}

		if (report.harnessAction && report.harnessAction !== "APPROVE") {
			console.log(`\nHarness Action: ${report.harnessAction}`);
			if (report.harnessAction === "BLOCK") {
				console.log(
					"Build blocked by SecOps — true positives require remediation",
				);
				process.exit(2);
			}
			if (report.harnessAction === "NEEDS_HUMAN_REVIEW") {
				console.log(
					"SecOps requires human review — findings need engineering judgment",
				);
				process.exit(3);
			}
		}

		const allPassed = report.issues.length === 0;
		if (allPassed) {
			console.log("All checks passed");
			process.exit(0);
		} else {
			console.log(`\n${report.issues.length} issue(s) found:`);
			report.issues.forEach((issue, i) => {
				console.log(
					`  ${i + 1}. ${issue.file}:${issue.line} - ${issue.message}`,
				);
			});
			process.exit(1);
		}
	} catch (error: any) {
		console.error(`Error: ${error.message}`);
		process.exit(1);
	}
}

main();
