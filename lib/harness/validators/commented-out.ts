import type { ReviewerFinding } from "../types";

/**
 * Deterministic check for "commenting instead of deciding": an added diff line
 * that is a comment whose body is live logic - a WHERE/filter clause, a
 * `throw`, a guard, an assignment. Commenting one out changes semantics as
 * strongly as deleting it, and hides the change from whoever skims the diff.
 *
 * It only reports; it never blocks. The findings go to the carrasco (see
 * `buildReviewPlan`) so a reviewer judges each one with the diff in hand.
 */

// Comment openers, longest first. `#` is limited to languages where it is a
// comment, so a C preprocessor line or a markdown heading never matches.
const HASH_COMMENT_EXT =
	/\.(py|rb|sh|bash|ya?ml|properties|toml|conf|ps1|r|pl|tf)$/i;

interface Rule {
	re: RegExp;
	kind: string;
	category: NonNullable<ReviewerFinding["category"]>;
}

const RULES: Rule[] = [
	// Query-builder / ORM filters: `.where(`, `.andWhere(`, `.filter(`, `.eq(`
	{
		re: /^\.?(where|andWhere|orWhere|and|or|filter|eq|ne|in|having)\s*\(/i,
		kind: "a WHERE/filter clause",
		category: "business-rule",
	},
	// SQL: `WHERE x = ...`, `AND e.exercicio = :exercicio`, `OR ...`
	{
		re: /^(where|and|or)\s+[\w."`[\]]+\s*(=|<>|!=|<=|>=|<|>|\bin\b|\blike\b|\bis\b|\bbetween\b)/i,
		kind: "a WHERE/filter clause",
		category: "business-rule",
	},
	{
		re: /^(throw|raise)\b/,
		kind: "a throw",
		category: "correctness",
	},
	// Guards: `if (x == null) return;`, `if (!ok) throw ...`, `if x is None: raise`
	{
		re: /^if\b.*(\breturn\b|\bthrow\b|\braise\b|\bcontinue\b|\bbreak\b)/,
		kind: "a guard",
		category: "correctness",
	},
	// Assignments / setters ending a statement: `total = total.add(x);`, `e.setAtivo(true);`
	{
		re: /^[\w$.[\]]+\s*(=|\+=|-=|\*=|\/=)(?!=)\s*[^;]+;\s*$/,
		kind: "an assignment",
		category: "correctness",
	},
	{
		re: /^[\w$]+(\.[\w$]+)*\.set[A-Z]\w*\s*\(.*\)\s*;\s*$/,
		kind: "an assignment",
		category: "correctness",
	},
];

function stripComment(code: string, file: string): string | null {
	const t = code.trim();
	let m = t.match(/^\/\/+\s?(.*)$/);
	if (m) return m[1];
	m = t.match(/^\/\*+\s?(.*?)\s*\*\/\s*$/);
	if (m) return m[1];
	m = t.match(/^<!--\s?(.*?)\s*-->\s*$/);
	if (m) return m[1];
	m = t.match(/^--+\s?(.*)$/);
	if (m) return m[1];
	if (HASH_COMMENT_EXT.test(file)) {
		m = t.match(/^#+\s?(.*)$/);
		if (m) return m[1];
	}
	return null;
}

export function detectCommentedOutLogic(gitDiff: string): ReviewerFinding[] {
	const findings: ReviewerFinding[] = [];
	if (!gitDiff) return findings;
	let file: string | null = null;
	let newLine = 0;
	for (const raw of gitDiff.split("\n")) {
		const line = raw.replace(/\r$/, "");
		if (line.startsWith("+++ ")) {
			const p = line.slice(4).trim();
			file = p === "/dev/null" ? null : p.replace(/^b\//, "");
			continue;
		}
		if (line.startsWith("--- ") || line.startsWith("diff --git ")) continue;
		const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
		if (hunk) {
			newLine = Number(hunk[1]);
			continue;
		}
		if (!file) continue;
		if (line.startsWith("+")) {
			const body = stripComment(line.slice(1), file);
			if (body !== null) {
				const code = body.trim();
				const rule = RULES.find((r) => r.re.test(code));
				if (rule) {
					findings.push({
						severity: "Medium",
						category: rule.category,
						file,
						line: newLine,
						issue: `Commented-out ${rule.kind} instead of a decision: \`${code}\`. Commenting it out changes behavior like deleting it, and the diff does not say why.`,
						suggestion:
							"Either restore the line or delete it and justify the removal in the diff, brief, or commit message (who stopped needing it).",
					});
				}
			}
			newLine++;
		} else if (line.startsWith(" ")) {
			newLine++;
		}
	}
	return findings;
}
