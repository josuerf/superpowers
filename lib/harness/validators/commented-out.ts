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

// SQL `--` mid-line (`group by x--, y`, `on a.id = b.id --and a.f = b.f`) and
// commented SELECT columns. `--` is only a SQL comment where SQL lives: .sql
// files, and SQL embedded in source files (a string literal, a Java/Kotlin
// text block, or a line that starts like SQL). Anywhere else `i--` is a
// decrement and `--help` a CLI flag.
const SQL_EXT = /\.sql$/i;
const SQL_HOST_EXT =
	/\.(java|kt|kts|scala|groovy|ts|tsx|js|jsx|mjs|cjs|cs|go|php|py|rb|xml)$/i;
const TEXT_BLOCK_EXT = /\.(java|kt|kts|scala|groovy)$/i;
const SQL_LEAD =
	/^(select|from|where|and|or|having|union|(inner|left|right|full|cross)\s+(outer\s+)?join|join|(group|order|partition)\s+by)\b/i;
const SQL_KEYWORD =
	/\b(select|from|where|and|or|join|having|(group|order|partition)\s+by)\b/i;
const SQL_COL = String.raw`(?:[\w$"]+\.)?[\w$"]+(?:\([^)]*\))?(?:\s+as\s+[\w$"]+)?`;
// `--, a.b, c` after a column: the commented tail of a column list.
const SQL_COLUMN_TAIL = new RegExp(
	String.raw`^,\s*${SQL_COL}(?:\s*,\s*${SQL_COL})*\s*,?$`,
	"i",
);
// `--a.b as c,` / `--sum(x) as total,`: a whole SELECT column. Qualified or
// aliased, so a bare word in prose never matches.
const SQL_COLUMN = new RegExp(
	String.raw`^(?:[\w$"]+\.[\w$"]+|[\w$"]+\([^)]*\)(?=\s+as\s))(?:\s+as\s+[\w$"]+)?\s*,?$|^[\w$"]+\s+as\s+[\w$"]+\s*,$`,
	"i",
);

interface SqlComment {
	before: string;
	body: string;
}

function oddCount(s: string, ch: string): boolean {
	let n = 0;
	for (let i = 0; i < s.length; i++) {
		if (s[i] === "\\") i++;
		else if (s[i] === ch) n++;
	}
	return n % 2 === 1;
}

/**
 * The first `--` that is a SQL comment after some code on the line, or null.
 * A line that starts with `--` is left to `stripComment`.
 */
function sqlMidLineComment(
	code: string,
	file: string,
	inTextBlock: boolean,
): SqlComment | null {
	const t = code.trim();
	if (t.startsWith("--")) return null;
	const sqlFile = SQL_EXT.test(file);
	if (!sqlFile && !SQL_HOST_EXT.test(file)) return null;
	for (let i = t.indexOf("--"); i > 0; i = t.indexOf("--", i + 2)) {
		if (t[i - 1] === "!" || t[i + 2] === ">") continue; // <!-- -->
		const head = t.slice(0, i);
		let before = head;
		let rest = t.slice(i + 2);
		if (sqlFile || inTextBlock) {
			if (oddCount(head, "'")) continue;
		} else if (oddCount(head, '"')) {
			// Inside a string literal: SQL only if the string reads like SQL.
			before = head.slice(head.lastIndexOf('"') + 1);
			if (!SQL_KEYWORD.test(before) || oddCount(before, "'")) continue;
			rest = rest.split(/\\n|"/)[0];
		} else if (!SQL_LEAD.test(head) || head.includes(";")) {
			continue;
		} else if (oddCount(head, "'")) {
			continue;
		}
		return { before, body: rest.trim() };
	}
	return null;
}

function sqlColumnRule(c: SqlComment): Rule | null {
	if (SQL_COLUMN_TAIL.test(c.body)) {
		return /\b(group|order|partition)\s+by\b/i.test(c.before)
			? {
					re: SQL_COLUMN_TAIL,
					kind: "a GROUP BY/ORDER BY column",
					category: "business-rule",
				}
			: { re: SQL_COLUMN_TAIL, kind: "a SELECT column", category: "correctness" };
	}
	if (SQL_COLUMN.test(c.body)) {
		return { re: SQL_COLUMN, kind: "a SELECT column", category: "correctness" };
	}
	return null;
}

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

/**
 * A `"""` that ends its line after some code opens a text block; any other
 * `"""` closes it.
 */
function nextTextBlockState(code: string, inTextBlock: boolean): boolean {
	const n = code.split('"""').length - 1;
	if (n === 0) return inTextBlock;
	if (n % 2 === 0) return inTextBlock;
	if (inTextBlock) return false;
	return /\S\s*"""\s*$/.test(code);
}

function commentedOutFinding(
	code: string,
	file: string,
	inTextBlock: boolean,
): Omit<ReviewerFinding, "file" | "line"> | null {
	let rule: Rule | null | undefined;
	let shown: string;
	const body = stripComment(code, file);
	if (body !== null) {
		shown = body.trim();
		rule = RULES.find((r) => r.re.test(shown));
		const sqlComment = code.trim().startsWith("--");
		if (
			!rule &&
			sqlComment &&
			(SQL_EXT.test(file) || SQL_HOST_EXT.test(file))
		) {
			rule = sqlColumnRule({ before: "", body: shown });
		}
	} else {
		const c = sqlMidLineComment(code, file, inTextBlock);
		if (!c) return null;
		shown = code.trim();
		rule = RULES.find((r) => r.re.test(c.body)) ?? sqlColumnRule(c);
	}
	if (!rule) return null;
	return {
		severity: "Medium",
		category: rule.category,
		issue: `Commented-out ${rule.kind} instead of a decision: \`${shown}\`. Commenting it out changes behavior like deleting it, and the diff does not say why.`,
		suggestion:
			"Either restore the line or delete it and justify the removal in the diff, brief, or commit message (who stopped needing it).",
	};
}

export function detectCommentedOutLogic(gitDiff: string): ReviewerFinding[] {
	const findings: ReviewerFinding[] = [];
	if (!gitDiff) return findings;
	let file: string | null = null;
	let newLine = 0;
	let inTextBlock = false;
	for (const raw of gitDiff.split("\n")) {
		const line = raw.replace(/\r$/, "");
		if (line.startsWith("+++ ")) {
			const p = line.slice(4).trim();
			file = p === "/dev/null" ? null : p.replace(/^b\//, "");
			inTextBlock = false;
			continue;
		}
		if (line.startsWith("--- ") || line.startsWith("diff --git ")) continue;
		const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
		if (hunk) {
			newLine = Number(hunk[1]);
			// A hunk can start inside a text block; SQL_LEAD covers that case.
			inTextBlock = false;
			continue;
		}
		if (!file) continue;
		const added = line.startsWith("+");
		if (!added && !line.startsWith(" ")) continue;
		const code = line.slice(1);
		if (added) {
			const finding = commentedOutFinding(code, file, inTextBlock);
			if (finding) findings.push({ ...finding, file, line: newLine });
		}
		if (TEXT_BLOCK_EXT.test(file)) inTextBlock = nextTextBlockState(code, inTextBlock);
		newLine++;
	}
	return findings;
}
