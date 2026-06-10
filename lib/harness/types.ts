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
	};
	carrasco: {
		redTeamEnabled: boolean;
		redTeamParallel: boolean;
		requireReproducibleTrigger: boolean;
		focusCategories: string[];
		severityThreshold: "Critical" | "High" | "Medium";
	};
	standards: {
		autoDetect: boolean;
		paths: string[];
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
	};
	asi_target: AsiTarget | null;
	findings: ReviewerFinding[];
	unparseableChunks: string[];
}

export interface HarnessConfig {
	coverageMin: number;
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
export interface ReviewerFinding {
	severity: ReviewerSeverity;
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
