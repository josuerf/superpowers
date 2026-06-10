import {
	getLevelDirective,
	getFocusGuidance,
	getSeverityPolicy,
	getStandardsDirective,
	getReproducibleTriggerDirective,
	buildAggressivenessDirectives,
} from "../../../lib/harness/reviewers/aggressiveness";
import type { ReviewAggressivenessConfig } from "../../../lib/harness/types";

function raConfig(
	overrides: Partial<ReviewAggressivenessConfig> = {},
): ReviewAggressivenessConfig {
	return {
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
			focusCategories: ["logic-bugs", "adversarial-inputs"],
			severityThreshold: "High",
		},
		standards: { autoDetect: true, paths: [] },
		reportOutput: { saveToHarness: true, format: "both" },
		...overrides,
	};
}

describe("getLevelDirective", () => {
	test("standard preserves current behavior (empty directive)", () => {
		expect(getLevelDirective("standard")).toBe("");
	});
	test("strict escalates rigor", () => {
		expect(getLevelDirective("strict")).toContain("STRICT");
	});
	test("carrasco makes stack rules blocking", () => {
		const d = getLevelDirective("carrasco");
		expect(d).toContain("CARRASCO");
		expect(d).toContain("BLOCKING");
	});
});

describe("getFocusGuidance", () => {
	test("maps known categories to descriptions", () => {
		expect(getFocusGuidance(["logic-bugs"])).toContain("Logic bugs");
	});
	test("empty for no categories", () => {
		expect(getFocusGuidance([])).toBe("");
	});
	test("empty for only unknown categories", () => {
		expect(getFocusGuidance(["totally-unknown"])).toBe("");
	});
});

describe("getSeverityPolicy", () => {
	test("BLOCK threshold reflected", () => {
		const p = getSeverityPolicy("High");
		expect(p).toContain("BLOCK");
		expect(p).toContain("High");
	});
});

describe("getStandardsDirective", () => {
	test("autoDetect mentions CLAUDE.md", () => {
		expect(getStandardsDirective({ autoDetect: true, paths: [] })).toContain(
			"CLAUDE.md",
		);
	});
	test("configured paths are enforced", () => {
		const d = getStandardsDirective({
			autoDetect: false,
			paths: ["docs/architecture.md"],
		});
		expect(d).toContain("docs/architecture.md");
	});
});

describe("getReproducibleTriggerDirective", () => {
	test("returns directive when required", () => {
		expect(getReproducibleTriggerDirective(true)).toContain("reproducible");
	});
	test("empty when not required", () => {
		expect(getReproducibleTriggerDirective(false)).toBe("");
	});
});

describe("buildAggressivenessDirectives", () => {
	test("carrasco assembles posture + focus + severity", () => {
		const d = buildAggressivenessDirectives(raConfig());
		expect(d).toContain("CARRASCO");
		expect(d).toContain("Adversarial Focus Categories");
		expect(d).toContain("Decision Policy");
	});
	test("standard still includes standards + severity policy but no posture", () => {
		const d = buildAggressivenessDirectives(raConfig({ level: "standard" }));
		expect(d).not.toContain("CARRASCO");
		expect(d).toContain("Decision Policy");
	});
});
