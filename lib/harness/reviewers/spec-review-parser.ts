import type { SpecReviewReport } from "../types";

const REPORT_START = "<!-- SPEC_REVIEW_REPORT -->";
const REPORT_END = "<!-- /SPEC_REVIEW_REPORT -->";

export function parseSpecReviewReport(response: string): SpecReviewReport | null {
	const startIdx = response.indexOf(REPORT_START);
	const endIdx = response.indexOf(REPORT_END);

	if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
		// Try to find JSON block as fallback
		const jsonMatch = response.match(/```json\s*\n([\s\S]*?)\n\s*```/);
		if (jsonMatch) {
			try {
				const parsed = JSON.parse(jsonMatch[1]);
				return validateSpecReviewReport(parsed);
			} catch {
				return null;
			}
		}
		return null;
	}

	const jsonBlock = response
		.substring(startIdx + REPORT_START.length, endIdx)
		.trim();

	const codeMatch = jsonBlock.match(/```json\s*\n?([\s\S]*?)\n?\s*```/);
	const jsonStr = codeMatch ? codeMatch[1] : jsonBlock;

	try {
		const parsed = JSON.parse(jsonStr);
		return validateSpecReviewReport(parsed);
	} catch {
		return null;
	}
}

function validateSpecReviewReport(obj: unknown): SpecReviewReport | null {
	if (
		typeof obj !== "object" ||
		obj === null ||
		!("verdict" in obj) ||
		!("requirements_met" in obj) ||
		!("requirements_missing" in obj) ||
		!("files_reviewed" in obj)
	) {
		return null;
	}

	const report = obj as Record<string, unknown>;
	const verdict = report.verdict;
	if (verdict !== "PASS" && verdict !== "FAIL") return null;
	if (!Array.isArray(report.requirements_met)) return null;
	if (!Array.isArray(report.requirements_missing)) return null;
	if (!Array.isArray(report.files_reviewed)) return null;

	return {
		taskId: (report.taskId as string) || "unknown",
		verdict: verdict as "PASS" | "FAIL",
		requirements_met: report.requirements_met as string[],
		requirements_missing: report.requirements_missing as string[],
		extra_scope: (Array.isArray(report.extra_scope) ? report.extra_scope : []) as string[],
		files_reviewed: report.files_reviewed as string[],
		concerns: (Array.isArray(report.concerns) ? report.concerns : []) as string[],
		timestamp: (report.timestamp as string) || new Date().toISOString(),
	};
}
