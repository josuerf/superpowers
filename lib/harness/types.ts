export interface ValidationResult {
	passed: boolean;
	errors: ParsedError[];
	warnings: string[];
	duration: number;
}

export interface ParsedError {
	file: string;
	line: number;
	column: number;
	message: string;
	rule: string;
	severity: "error" | "warning";
}

export interface SecurityTool {
	name: string;
	npmPackage: string;
	cmd: string;
	outputFormat: "json" | "text";
}

export interface DomainCheck {
	name: string;
	cmd: string;
	threshold?: number;
}

export interface IStackHandler {
	name: string;
	detect(projectRoot: string): boolean;
	lintCmd(): string;
	typecheckCmd(): string;
	testCmd(files?: string[]): string;
	coverageCmd(): string;
	securityTools(): SecurityTool[];
	domainChecks(domain: "frontend" | "backend" | "infra"): DomainCheck[];
}

export interface DuplicationConfig {
	enabled: boolean;
	maxDuplication: number;
	minLines: number;
	minTokens: number;
	ignorePatterns: string[];
}

export interface ComplexityConfig {
	enabled: boolean;
	thresholds: Record<string, number>;
}

export interface DuplicationResult {
	passed: boolean;
	duplicationPercent: number;
	totalDuplicationLines: number;
	errors: ParsedError[];
	warnings: string[];
	duration: number;
}

export interface ComplexityResult {
	passed: boolean;
	maxComplexityFound: number;
	violations: Array<{
		file: string;
		line: number;
		name: string;
		complexity: number;
		threshold: number;
	}>;
	duration: number;
}

export interface SpecReviewReport {
	taskId: string;
	verdict: "PASS" | "FAIL";
	requirements_met: string[];
	requirements_missing: string[];
	extra_scope: string[];
	files_reviewed: string[];
	concerns: string[];
	timestamp: string;
}

export type ReviewAggressivenessLevel = "standard" | "strict" | "carrasco";

export interface ReviewAggressivenessConfig {
	enabled: boolean;
	level: ReviewAggressivenessLevel;
	chunking: {
		enabled: boolean;
		maxFilesPerChunk: number;
		maxLinesPerChunk: number;
		byTopic: boolean;
		/**
		 * Hard ceiling on the number of chunks a plan can produce, regardless of
		 * `byTopic`/size limits — each chunk dispatches one carrasco subagent, so
		 * this is a direct cap on review cost/parallelism per card. `byTopic`
		 * alone cannot express this: it creates at least one chunk PER TOPIC
		 * touched, no matter how generous the size limits are. When the natural
		 * chunk count exceeds this, the smallest chunks are merged pairwise
		 * (by file count, topic label becomes "(mixed)" on a cross-topic merge)
		 * until the count fits. `undefined`/absent = no cap (prior behavior).
		 */
		maxChunks?: number;
	};
	carrasco: {
		redTeamEnabled: boolean;
		redTeamParallel: boolean;
		requireReproducibleTrigger: boolean;
		focusCategories: string[];
		severityThreshold: "Critical" | "High" | "Medium";
		/**
		 * When true (the default), findings below Medium are reported without
		 * changing the action - the reviewer's own verdict decides. Set to
		 * false to restore the prior behaviour, where ANY finding forced
		 * NEEDS_HUMAN_REVIEW.
		 *
		 * This only loosens what is ignored, never what is enforced: a
		 * `security` or `governance` finding blocks either way.
		 */
		noiseFloor?: boolean;
	};
	standards: {
		autoDetect: boolean;
		paths: string[];
	};
	/**
	 * Paths kept out of the reviewed change set. The review reads tracked
	 * changes AND untracked files, so a directory of generated or vendored
	 * content a project happens not to commit lands in the diff and multiplies
	 * the chunk count — one project measured 3 real files becoming 472 files
	 * across 49 chunks, i.e. 49 reviewer dispatches for one card.
	 *
	 * `patterns` are regular expressions matched against each repo-relative
	 * path (forward or backslash). They ADD to the built-in defaults unless
	 * `useDefaults` is false, in which case they replace them entirely.
	 */
	exclude: {
		useDefaults: boolean;
		patterns: string[];
	};
	reportOutput: {
		saveToHarness: boolean;
		format: "markdown" | "json" | "both";
	};
}

export interface ReviewChunk {
	id: string;
	topic: string;
	files: string[];
	stacks: string[];
	estimatedLines: number;
	diff: string;
	prompt: string;
}

export interface ReviewPlan {
	feature: string;
	level: ReviewAggressivenessLevel;
	generatedAt: string;
	totalFiles: number;
	totalChunks: number;
	stacks: string[];
	chunks: ReviewChunk[];
}

export interface ChunkVerdict {
	chunkId: string;
	files: string[];
	action: HarnessAction | "APPROVE";
	findings: ReviewerFinding[];
}

export interface AggregatedReviewReport {
	feature: string;
	level: ReviewAggressivenessLevel;
	timestamp: string;
	harness_action: HarnessAction | "APPROVE";
	metrics: {
		total_findings: number;
		critical_high_count: number;
		chunks_reviewed: number;
		chunks_unparseable: number;
		/**
		 * Findings that were reported but did not change the action. They are
		 * not discarded - a driver running unattended is expected to record
		 * them (as a plan assumption, a notification, or both) so that
		 * "did not block" never silently becomes "nobody ever saw it".
		 */
		non_blocking_count: number;
	};
	asi_target: AsiTarget | null;
	findings: ReviewerFinding[];
	unparseableChunks: string[];
	/** Per-chunk verdict — lets a later recheck target only the chunks that didn't approve. */
	chunkVerdicts: ChunkVerdict[];
}

export interface HarnessConfig {
	coverageMin: number;
	/** Min source files edited this session to trigger the verify-on-stop gate. Default 3. */
	verifyOnStop: { minFiles: number };
	securityScan: {
		enabled: boolean;
		tools: Record<string, boolean>;
	};
	domainSpecific: Record<
		string,
		{ enabled: boolean; budget?: Record<string, number> }
	>;
	timeout: { verifyLocal: number; verifyAll: number };
	failOn: {
		lint: "error" | "warning";
		coverage: "error" | "warning";
		security: "error" | "warning" | "human_review";
	};
	duplication: DuplicationConfig;
	complexity: ComplexityConfig;
	reviewAggressiveness: ReviewAggressivenessConfig;
}

export interface WorkspaceProject {
	path: string;
	stack: string;
	config?: string;
}

export interface WorkspaceConfig {
	version: string;
	generated: string;
	lastScan: string;
	projects: WorkspaceProject[];
	workspaceConfig: {
		autoRescan: boolean;
		reportPath: string;
	};
}

export interface ProjectConfig {
	version: string;
	generated: string;
	projectRoot: string;
	stack: string;
	config: string;
}

export interface VerifyReport {
	feature: string;
	mode: "verify-local" | "verify-all" | "verify-security";
	timestamp: string;
	duration: number;
	summary: {
		lint: { errors: number; warnings: number; details: string };
		typecheck: { passed: boolean; files: number };
		tests: { passed: number; total: number; framework: string };
		coverage: { percentage: number; target: number; filesBelow: number };
		patterns?: { violations: number; blocked: number; warned: number };
		duplication?: { percentage: number; passed: boolean };
		complexity?: { maxFound: number; passed: boolean };
		security?: {
			decision: "APPROVE" | "BLOCK" | "NEEDS_HUMAN_REVIEW" | "NOT_ANALYZED";
			totalFindings: number;
			truePositives: number;
			falsePositives: number;
			needsInvestigation: number;
		};
	};
	issues: {
		file: string;
		line: number;
		message: string;
		specRequirement?: string;
		suggestion: string;
	}[];
	recommendations: string[];
	harnessAction?: "APPROVE" | "BLOCK" | "NEEDS_HUMAN_REVIEW";
}

export type HarnessAction = "APPROVE" | "BLOCK" | "NEEDS_HUMAN_REVIEW";
export type SecOpsClassification = "TP" | "FP" | "Needs Investigation";
export type SecOpsSeverity = "Critical" | "High" | "Medium" | "Low" | "Info";
export interface SecOpsFinding {
	tool: string;
	id: string;
	file?: string;
	line?: number;
	classification: SecOpsClassification;
	real_severity: SecOpsSeverity;
	suppression_applied: boolean;
	justification?: string;
	remediation?: string;
	exception_rule?: string;
}
export interface SecOpsDecision {
	harness_action: HarnessAction;
	summary: {
		total_findings: number;
		true_positives: number;
		false_positives: number;
		needs_investigation: number;
	};
	findings: SecOpsFinding[];
}
export interface SecOpsReport {
	decision: SecOpsDecision | null;
	rawFindings: SecurityRawFinding[];
	markdownReport: string;
	passed: boolean;
}
export interface SecurityRawFinding {
	tool: string;
	id: string;
	file?: string;
	line?: number;
	severity: string;
	message: string;
	raw: Record<string, unknown>;
}

export type ReviewerSeverity = "Critical" | "High" | "Medium" | "Low";
/**
 * What KIND of problem a finding is, independent of how big it is.
 *
 * Severity alone cannot carry this. A real case: a reviewer rated "the
 * operator identity is passed as a raw argv element to a sidecar" as Low,
 * next to "this test helper is duplicated" - also Low. One of those breaks
 * an invariant the product is built on; the other is housekeeping. With only
 * a severity to read, a gate must either stop on both or on neither.
 *
 * `security` and `governance` escalate to BLOCK at any severity - see
 * `aggregateCarrascoResponses`. The category describes the type of the
 * problem, never its weight.
 */
export type FindingCategory =
	| "security"
	| "governance"
	| "correctness"
	| "maintainability"
	| "test";
export interface ReviewerFinding {
	severity: ReviewerSeverity;
	/**
	 * Optional: a reviewer that predates this field, or one that omits it,
	 * still produces valid findings. Absent is read as "maintainability" by
	 * the aggregator, which is where the escalation rule lives - the parser
	 * deliberately leaves it `undefined` rather than inventing a default, so
	 * "the reviewer said nothing" stays distinguishable from a deliberate
	 * classification.
	 */
	category?: FindingCategory;
	file: string;
	line: number;
	issue: string;
	suggestion: string;
}
export interface AsiTarget {
	file: string;
	line: number;
	issue_summary: string;
	fix_instruction: string;
}
export interface ReviewerMetrics {
	total_findings: number;
	critical_high_count: number;
}
export interface ReviewerDecision {
	harness_action: HarnessAction | "APPROVE";
	metrics: ReviewerMetrics;
	asi_target: AsiTarget | null;
	findings: ReviewerFinding[];
}
