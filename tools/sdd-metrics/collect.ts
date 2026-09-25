#!/usr/bin/env node
/**
 * sdd-metrics collect — measure how a workspace uses SDD (plan M, M0.3).
 *
 * Scans git history, docs/superpowers-prepared/plans/, .superpowers/sdd/ and
 * the SDD-Plan commit trailers (M0.2) of a workspace — its own repository and
 * every repository under projects/* — and emits JSON with exactly nine
 * series (`series`). The metric set is fixed on purpose: measuring the wrong
 * thing is this tool's main risk, so a new series needs a justification, not
 * just a use.
 *
 * Two keys sit beside `series` and are not process-quality series:
 *   - `gates`: the gate-log.jsonl counter (M1 `mode: "warn"`). It decides the
 *     warn→block promotion of the Stop gate, so it has to be collected where
 *     the rest of the process is measured, but it measures the gate, not SDD.
 *   - `retroativo`: a declared heuristic that credits commits made while a
 *     batch was open to SDD, for history recorded before trailers existed.
 *
 * `achados_por_100_linhas` and `reincidencia_por_categoria` need review data
 * no workspace holds: pass `--findings <tsv>` (one row per review finding)
 * and `--mrs <json>` (one object per MR, with lines changed and merge date).
 * Without them both series are `null`, with the reason alongside.
 *
 * Usage:
 *   npx tsx tools/sdd-metrics/collect.ts --workspace <path> [--since YYYY-MM-DD]
 *        [--findings <tsv> --mrs <json>] [--out <file>]
 *   npx tsx tools/sdd-metrics/collect.ts --discover <dir> [...same options]
 *
 * --discover treats every child of <dir> that has scripts/validate_known_issues.js
 * or .harness.config.json as a workspace.
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

export const SERIES = [
	"planos_por_mes",
	"tarefas_por_plano",
	"briefs_emitidos",
	"reports_recebidos",
	"achados_do_revisor_por_lote",
	"readbacks",
	"mrs_com_trailer_sdd",
	"achados_por_100_linhas",
	"reincidencia_por_categoria",
] as const;

export interface CollectOptions {
	workspace: string;
	/** ISO date (YYYY-MM-DD); only activity on or after it is counted. */
	since?: string;
	findingsTsv?: string;
	mrsJson?: string;
	/** Clock for tests. */
	now?: Date;
}

interface Commit {
	repo: string;
	hash: string;
	author: string;
	date: string;
	body: string;
	plan: string | null;
}

interface Artifact {
	/** Path relative to the workspace, forward slashes. */
	rel: string;
	abs: string;
	date: string;
}

const PLANS_DIR = "docs/superpowers-prepared/plans";
const TRAILER_RE = /^SDD-Plan:[ \t]*(\S.*?)\s*$/m;
const TASK_HEADING_RE = /^#+[ \t]+Task[ \t]+\d+/gm;
// The readback section a brief asks for (M8/M9) and a report answers with.
const READBACK_RE =
	/^#+[ \t].*(confirm (the |your )?contract|confirme o contrato|readback)/im;
const RETRO_OPEN_MS = 60 * 60 * 1000;
const RETRO_NO_REPORT_MS = 48 * 60 * 60 * 1000;

// --------------------------------------------------------------------------
// Filesystem and git helpers
// --------------------------------------------------------------------------

function git(args: string[], cwd: string): string {
	try {
		return execFileSync("git", args, {
			cwd,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
			maxBuffer: 64 * 1024 * 1024,
		});
	} catch {
		return "";
	}
}

function toSlash(p: string): string {
	return p.split(path.sep).join("/");
}

function month(iso: string): string {
	return new Date(iso).toISOString().slice(0, 7);
}

function isRepo(dir: string): boolean {
	return fs.existsSync(path.join(dir, ".git"));
}

/** Children of `dir/projects` (or `dir` itself), sorted. */
function childDirs(dir: string): string[] {
	try {
		return fs
			.readdirSync(dir, { withFileTypes: true })
			.filter((e) => e.isDirectory())
			.map((e) => path.join(dir, e.name))
			.sort();
	} catch {
		return [];
	}
}

/** The workspace's own repository (when it is one) plus projects/* repositories. */
export function listRepos(workspace: string): { name: string; dir: string }[] {
	const repos: { name: string; dir: string }[] = [];
	if (isRepo(workspace)) repos.push({ name: ".", dir: workspace });
	for (const dir of childDirs(path.join(workspace, "projects"))) {
		if (isRepo(dir)) repos.push({ name: `projects/${path.basename(dir)}`, dir });
	}
	return repos;
}

/** Directories that may hold SDD artifacts: the workspace and each projects/* child. */
function candidateRoots(workspace: string): string[] {
	return [workspace, ...childDirs(path.join(workspace, "projects"))];
}

/**
 * Date of a file: the commit that added it when tracked (a checkout resets
 * mtimes, so for versioned artifacts git is the only honest clock), else its
 * mtime.
 */
function artifactDate(abs: string): string {
	const dir = path.dirname(abs);
	const added = git(
		["log", "--diff-filter=A", "--follow", "--format=%aI", "-1", "--", path.basename(abs)],
		dir,
	).trim();
	if (added) return new Date(added).toISOString();
	return fs.statSync(abs).mtime.toISOString();
}

/** Files under each root's .superpowers/sdd (flat and one plan level deep) matching `re`. */
function sddFiles(workspace: string, re: RegExp): Artifact[] {
	const out: Artifact[] = [];
	for (const root of candidateRoots(workspace)) {
		const sdd = path.join(root, ".superpowers", "sdd");
		const visit = (dir: string, depth: number) => {
			let entries: fs.Dirent[] = [];
			try {
				entries = fs.readdirSync(dir, { withFileTypes: true });
			} catch {
				return;
			}
			for (const e of entries) {
				const full = path.join(dir, e.name);
				if (e.isFile() && re.test(e.name)) {
					out.push({ rel: toSlash(path.relative(workspace, full)), abs: full, date: artifactDate(full) });
				} else if (e.isDirectory() && depth === 0) {
					visit(full, 1);
				}
			}
		};
		visit(sdd, 0);
	}
	return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

function afterSince(iso: string, since?: string): boolean {
	return !since || iso >= new Date(since).toISOString();
}

function readSafe(file: string): string {
	try {
		return fs.readFileSync(file, "utf8");
	} catch {
		return "";
	}
}

// --------------------------------------------------------------------------
// Git history
// --------------------------------------------------------------------------

export function readCommits(workspace: string, since?: string): Commit[] {
	const commits: Commit[] = [];
	for (const repo of listRepos(workspace)) {
		const args = ["log", "--all", "--format=%H%x1f%an%x1f%aI%x1f%B%x1e"];
		if (since) args.splice(1, 0, `--since=${since}`);
		for (const rec of git(args, repo.dir).split("\x1e")) {
			const [hash, author, date, body] = rec.replace(/^\s+/, "").split("\x1f");
			if (!hash || !date) continue;
			const m = (body || "").match(TRAILER_RE);
			commits.push({
				repo: repo.name,
				hash,
				author,
				date: new Date(date).toISOString(),
				body: body || "",
				plan: m ? m[1] : null,
			});
		}
	}
	return commits;
}

// --------------------------------------------------------------------------
// The nine series
// --------------------------------------------------------------------------

function planosPorMes(workspace: string, since?: string) {
	const porMes: Record<string, number> = {};
	const autores = new Set<string>();
	let commits = 0;
	for (const repo of listRepos(workspace)) {
		const args = ["log", "--all", "--format=%aI%x1f%an", "--", PLANS_DIR];
		if (since) args.splice(1, 0, `--since=${since}`);
		for (const line of git(args, repo.dir).split("\n")) {
			const [date, author] = line.split("\x1f");
			if (!date) continue;
			const m = month(date);
			porMes[m] = (porMes[m] || 0) + 1;
			autores.add(author);
			commits++;
		}
	}
	return { commits, por_mes: sortKeys(porMes), autores: autores.size };
}

function tarefasPorPlano(workspace: string) {
	const planos: Record<string, number> = {};
	for (const root of candidateRoots(workspace)) {
		const dir = path.join(root, PLANS_DIR);
		let files: string[] = [];
		try {
			files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
		} catch {
			continue;
		}
		for (const f of files) {
			const abs = path.join(dir, f);
			planos[toSlash(path.relative(workspace, abs))] = (readSafe(abs).match(TASK_HEADING_RE) || []).length;
		}
	}
	const counts = Object.values(planos);
	return {
		planos: sortKeys(planos),
		media: counts.length ? round(counts.reduce((a, b) => a + b, 0) / counts.length) : null,
	};
}

function byMonth(items: Artifact[]): Record<string, number> {
	const out: Record<string, number> = {};
	for (const i of items) out[month(i.date)] = (out[month(i.date)] || 0) + 1;
	return sortKeys(out);
}

const loteOf = (rel: string, suffix: RegExp) => rel.replace(/^.*?\.superpowers\/sdd\//, "").replace(suffix, "");

function reportsRecebidos(briefs: Artifact[], reports: Artifact[]) {
	const reported = new Set(reports.map((r) => r.rel.replace(/-report\.md$/, "")));
	return {
		total: reports.length,
		por_mes: byMonth(reports),
		lotes_incompletos: briefs
			.filter((b) => !reported.has(b.rel.replace(/-brief\.md$/, "")))
			.map((b) => b.rel),
	};
}

/**
 * Findings per batch from the reviewer's findings files. The summary line
 * (`N Critical, N Important, N Minor`) wins when present; otherwise list
 * items under the severity headings are counted. Round 1 is the batch's
 * finding count; later rounds are re-reviews of the same findings.
 */
export function countReviewFindings(content: string): { critical: number; important: number; minor: number } {
	const summary = content.match(/(\d+)\s+Critical,\s*(\d+)\s+Important,\s*(\d+)\s+Minor/i);
	if (summary) {
		return { critical: Number(summary[1]), important: Number(summary[2]), minor: Number(summary[3]) };
	}
	const counts = { critical: 0, important: 0, minor: 0 };
	let current: keyof typeof counts | null = null;
	for (const line of content.split("\n")) {
		const h = line.match(/^#+\s+(Critical|Important|Minor)\b/i);
		if (h) {
			current = h[1].toLowerCase() as keyof typeof counts;
			continue;
		}
		if (/^#+\s/.test(line)) {
			current = null;
			continue;
		}
		if (current && /^\s{0,3}(?:[-*]|\d+\.)\s+\S/.test(line) && !/^\s*[-*]?\s*(none|nenhum)\b/i.test(line)) {
			counts[current]++;
		}
	}
	return counts;
}

function achadosDoRevisorPorLote(reviews: Artifact[]) {
	const lotes: Record<string, { rodadas: number; critical: number; important: number; minor: number }> = {};
	for (const r of reviews) {
		const m = r.rel.match(/-review-(\d+)\.md$/);
		if (!m) continue;
		const lote = loteOf(r.rel, /-review-\d+\.md$/);
		const entry = (lotes[lote] ||= { rodadas: 0, critical: 0, important: 0, minor: 0 });
		entry.rodadas = Math.max(entry.rodadas, Number(m[1]));
		if (m[1] === "1") Object.assign(entry, countReviewFindings(readSafe(r.abs)), { rodadas: entry.rodadas });
	}
	const totals = Object.values(lotes).map((l) => l.critical + l.important + l.minor);
	return {
		lotes: sortKeys(lotes),
		media_por_lote: totals.length ? round(totals.reduce((a, b) => a + b, 0) / totals.length) : null,
	};
}

function readbacks(briefs: Artifact[], reports: Artifact[]) {
	return {
		emitidos: briefs.filter((b) => READBACK_RE.test(readSafe(b.abs))).length,
		lidos: reports.filter((r) => READBACK_RE.test(readSafe(r.abs))).length,
	};
}

function mrsComTrailerSdd(commits: Commit[]) {
	const withTrailer = commits.filter((c) => c.plan);
	const planos: Record<string, number> = {};
	const repos: Record<string, number> = {};
	for (const c of withTrailer) {
		planos[c.plan as string] = (planos[c.plan as string] || 0) + 1;
		repos[c.repo] = (repos[c.repo] || 0) + 1;
	}
	return {
		commits: withTrailer.length,
		commits_total: commits.length,
		planos: sortKeys(planos),
		repos: sortKeys(repos),
	};
}

// --------------------------------------------------------------------------
// Review-data series (--findings + --mrs)
// --------------------------------------------------------------------------

interface Finding {
	repo: string;
	mr: string;
	category: string;
	title: string;
	jira: string[];
}

interface Mr {
	repo: string;
	mr: string;
	lines: number;
	mergedAt: string;
	jira: string[];
}

export function parseFindingsTsv(content: string): Finding[] {
	const [header, ...rows] = content.split(/\r?\n/).filter((l) => l.trim());
	if (!header) return [];
	const cols = header.split("\t");
	const idx = (name: string) => cols.indexOf(name);
	const get = (r: string[], name: string) => (idx(name) >= 0 ? r[idx(name)] || "" : "");
	return rows.map((line) => {
		const r = line.split("\t");
		return {
			repo: get(r, "repo"),
			mr: get(r, "mr_iid"),
			category: get(r, "category") || "unknown",
			title: get(r, "title"),
			jira: get(r, "jira_keys").split(/\s+/).filter(Boolean),
		};
	});
}

export function parseMrsJson(content: string): Mr[] {
	const raw = JSON.parse(content);
	const list: Record<string, unknown>[] = Array.isArray(raw) ? raw : raw.mrs || [];
	return list.map((m) => ({
		repo: String(m.repo || ""),
		mr: String(m.iid ?? m.mr_iid ?? ""),
		lines: Number(m.churn ?? Number(m.lines_added || 0) + Number(m.lines_deleted || 0)) || 0,
		mergedAt: String(m.merged_at || m.created_at || ""),
		jira: Array.isArray(m.jira_keys) ? (m.jira_keys as string[]) : [],
	}));
}

/** Repository basenames that belong to this workspace. */
function workspaceRepoNames(workspace: string): Set<string> {
	return new Set(listRepos(workspace).map((r) => (r.name === "." ? path.basename(workspace) : path.basename(r.dir))));
}

const repoBase = (repo: string) => repo.split("/").pop() || repo;

/**
 * An MR counts as SDD when a commit with an SDD-Plan trailer in the same
 * repository mentions one of the MR's Jira keys. The trailer is on commits,
 * the finding is on the MR, and the Jira key is what both carry.
 */
function sddMrKeys(mrs: Mr[], commits: Commit[]): Set<string> {
	const trailerBodies = new Map<string, string[]>();
	for (const c of commits) {
		if (!c.plan) continue;
		const base = c.repo === "." ? "." : path.basename(c.repo);
		const list = trailerBodies.get(base) || [];
		list.push(c.body);
		trailerBodies.set(base, list);
	}
	const sdd = new Set<string>();
	for (const mr of mrs) {
		const bodies = [...(trailerBodies.get(repoBase(mr.repo)) || []), ...(trailerBodies.get(".") || [])];
		if (mr.jira.some((k) => bodies.some((b) => b.includes(k)))) sdd.add(`${mr.repo}#${mr.mr}`);
	}
	return sdd;
}

function reviewData(opts: CollectOptions, commits: Commit[]) {
	if (!opts.findingsTsv || !opts.mrsJson) {
		const motivo = "requer --findings <tsv> e --mrs <json>: achados e linhas por MR não moram no workspace";
		return { perLines: { valor: null, motivo }, recurrence: { valor: null, motivo } };
	}
	const names = workspaceRepoNames(opts.workspace);
	const mrs = parseMrsJson(readSafe(opts.mrsJson)).filter(
		(m) => names.has(repoBase(m.repo)) && (!m.mergedAt || afterSince(m.mergedAt, opts.since)),
	);
	const mrIndex = new Map(mrs.map((m) => [`${m.repo}#${m.mr}`, m]));
	const findings = parseFindingsTsv(readSafe(opts.findingsTsv)).filter((f) => mrIndex.has(`${f.repo}#${f.mr}`));
	const sdd = sddMrKeys(mrs, commits);

	const slice = (isSdd: boolean) => {
		const ms = mrs.filter((m) => sdd.has(`${m.repo}#${m.mr}`) === isSdd);
		const keys = new Set(ms.map((m) => `${m.repo}#${m.mr}`));
		const lines = ms.reduce((a, m) => a + m.lines, 0);
		const n = findings.filter((f) => keys.has(`${f.repo}#${f.mr}`)).length;
		return { mrs: ms.length, achados: n, linhas: lines, valor: lines ? round((n * 100) / lines) : null };
	};
	const allLines = mrs.reduce((a, m) => a + m.lines, 0);
	const perLines = {
		global: allLines ? round((findings.length * 100) / allLines) : null,
		sdd: slice(true),
		nao_sdd: slice(false),
		heuristica: "MR é SDD quando um commit com trailer SDD-Plan no mesmo repositório cita uma das chaves Jira do MR",
	};

	// Recurrence: a finding recurs when its signature (category + key phrase)
	// already appeared in an earlier monthly window.
	const byWindow = findings
		.map((f) => ({ f, w: month(mrIndex.get(`${f.repo}#${f.mr}`)?.mergedAt || "1970-01-01") }))
		.sort((a, b) => a.w.localeCompare(b.w));
	const firstWindow = byWindow.length ? byWindow[0].w : "";
	const seen = new Map<string, string>(); // signature -> first window
	const perCat: Record<string, { achados: number; reincidentes: number; taxa: number | null }> = {};
	for (const { f, w } of byWindow) {
		const sig = findingSignature(f.category, f.title);
		const cat = (perCat[f.category] ||= { achados: 0, reincidentes: 0, taxa: null });
		const first = seen.get(sig);
		if (w !== firstWindow) cat.achados++;
		if (first !== undefined && first < w) cat.reincidentes++;
		if (first === undefined) seen.set(sig, w);
	}
	for (const c of Object.values(perCat)) c.taxa = c.achados ? round(c.reincidentes / c.achados) : null;
	return {
		perLines,
		recurrence: {
			categorias: sortKeys(perCat),
			heuristica:
				"assinatura = categoria + as 3 palavras de conteúdo mais longas do título; janela = mês do merge; " +
				"taxa = achados cuja assinatura já apareceu em janela anterior / achados fora da primeira janela",
		},
	};
}

const STOPWORDS = new Set(
	"para como quando sem com que por dos das nos nas uma uns umas este esta isso sobre entre mais menos also with from that this when without into the and not".split(
		" ",
	),
);

export function findingSignature(category: string, title: string): string {
	const words = title
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.split(/[^a-z0-9_]+/)
		.filter((w) => w.length >= 4 && !STOPWORDS.has(w));
	const key = [...new Set(words)].sort((a, b) => b.length - a.length || a.localeCompare(b)).slice(0, 3).sort();
	return `${category}:${key.join("+")}`;
}

// --------------------------------------------------------------------------
// Side keys: gates and the retroactive reconstruction
// --------------------------------------------------------------------------

function gates(workspace: string, since?: string) {
	const porRepo: Record<string, number> = {};
	let eventos = 0;
	let wouldBlock = 0;
	for (const root of candidateRoots(workspace)) {
		for (const line of readSafe(path.join(root, ".superpowers", "gate-log.jsonl")).split("\n")) {
			if (!line.trim()) continue;
			let e: { ts?: string; wouldBlock?: boolean; repo?: string };
			try {
				e = JSON.parse(line);
			} catch {
				continue;
			}
			if (e.ts && !afterSince(new Date(e.ts).toISOString(), since)) continue;
			eventos++;
			if (e.wouldBlock === true) {
				wouldBlock++;
				const repo = e.repo || toSlash(path.relative(workspace, root)) || ".";
				porRepo[repo] = (porRepo[repo] || 0) + 1;
			}
		}
	}
	return { gate_would_block: wouldBlock, eventos, por_repo: sortKeys(porRepo) };
}

function retroativo(briefs: Artifact[], reports: Artifact[], commits: Commit[]) {
	const reportByLote = new Map(reports.map((r) => [r.rel.replace(/-report\.md$/, ""), r]));
	const credited = new Set<string>();
	const lotes = briefs.map((b) => {
		const report = reportByLote.get(b.rel.replace(/-brief\.md$/, ""));
		const start = new Date(b.date).getTime() - RETRO_OPEN_MS;
		const end = report
			? new Date(report.date).getTime() + RETRO_OPEN_MS
			: new Date(b.date).getTime() + RETRO_NO_REPORT_MS;
		const inWindow = commits.filter((c) => {
			const t = new Date(c.date).getTime();
			return t >= start && t <= end;
		});
		for (const c of inWindow) credited.add(`${c.repo}@${c.hash}`);
		return {
			lote: loteOf(b.rel, /-brief\.md$/),
			inicio: new Date(start).toISOString(),
			fim: new Date(end).toISOString(),
			commits_no_periodo: inWindow.length,
			commits_com_trailer: inWindow.filter((c) => c.plan).length,
		};
	});
	return {
		heuristica:
			"commit (em qualquer repositório do workspace) com data de autoria entre 1h antes do brief e 1h depois do " +
			"report do mesmo lote — ou 48h depois do brief, se não há report — é creditado ao SDD",
		lotes,
		commits_provaveis_sdd: credited.size,
	};
}

// --------------------------------------------------------------------------
// Entry points
// --------------------------------------------------------------------------

function sortKeys<T>(obj: Record<string, T>): Record<string, T> {
	return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
}

function round(n: number): number {
	return Math.round(n * 100) / 100;
}

export function collectWorkspace(opts: CollectOptions) {
	const workspace = path.resolve(opts.workspace);
	const o = { ...opts, workspace };
	const commits = readCommits(workspace, opts.since);
	const inRange = (a: Artifact) => afterSince(a.date, opts.since);
	const briefs = sddFiles(workspace, /-brief\.md$/).filter(inRange);
	const reports = sddFiles(workspace, /-report\.md$/).filter(inRange);
	const reviews = sddFiles(workspace, /-review-\d+\.md$/).filter(inRange);
	const review = reviewData(o, commits);

	const series = {
		planos_por_mes: planosPorMes(workspace, opts.since),
		tarefas_por_plano: tarefasPorPlano(workspace),
		briefs_emitidos: { total: briefs.length, por_mes: byMonth(briefs) },
		reports_recebidos: reportsRecebidos(briefs, reports),
		achados_do_revisor_por_lote: achadosDoRevisorPorLote(reviews),
		readbacks: readbacks(briefs, reports),
		mrs_com_trailer_sdd: mrsComTrailerSdd(commits),
		achados_por_100_linhas: review.perLines,
		reincidencia_por_categoria: review.recurrence,
	};
	return {
		workspace: toSlash(workspace),
		nome: path.basename(workspace),
		gerado_em: (opts.now || new Date()).toISOString(),
		desde: opts.since || null,
		repositorios: listRepos(workspace).map((r) => r.name),
		series,
		gates: gates(workspace, opts.since),
		retroativo: retroativo(briefs, reports, commits),
	};
}

export type WorkspaceMetrics = ReturnType<typeof collectWorkspace>;

/** Children of `dir` that are harness workspaces. */
export function discoverWorkspaces(dir: string): string[] {
	return childDirs(path.resolve(dir)).filter(
		(d) =>
			fs.existsSync(path.join(d, "scripts", "validate_known_issues.js")) ||
			fs.existsSync(path.join(d, ".harness.config.json")),
	);
}

export interface CliArgs {
	workspaces: string[];
	discover?: string;
	since?: string;
	findings?: string;
	mrs?: string;
	out?: string;
	input?: string;
}

export function parseArgs(argv: string[]): CliArgs {
	const args: CliArgs = { workspaces: [] };
	for (let i = 0; i < argv.length; i++) {
		const next = () => {
			const v = argv[++i];
			if (v === undefined) throw new Error(`${argv[i - 1]} needs a value`);
			return v;
		};
		switch (argv[i]) {
			case "--workspace":
				args.workspaces.push(next());
				break;
			case "--discover":
				args.discover = next();
				break;
			case "--since":
				args.since = next();
				break;
			case "--findings":
				args.findings = next();
				break;
			case "--mrs":
				args.mrs = next();
				break;
			case "--out":
				args.out = next();
				break;
			case "--input":
				args.input = next();
				break;
			default:
				throw new Error(`unknown argument: ${argv[i]}`);
		}
	}
	if (args.since && Number.isNaN(new Date(args.since).getTime())) {
		throw new Error(`--since is not a date: ${args.since}`);
	}
	return args;
}

/** Collect every workspace the arguments name. */
export function collectFromArgs(args: CliArgs): { workspaces: WorkspaceMetrics[] } {
	const dirs = [...args.workspaces, ...(args.discover ? discoverWorkspaces(args.discover) : [])];
	if (dirs.length === 0) throw new Error("pass --workspace <path> or --discover <dir>");
	return {
		workspaces: dirs.map((w) =>
			collectWorkspace({ workspace: w, since: args.since, findingsTsv: args.findings, mrsJson: args.mrs }),
		),
	};
}

function main() {
	try {
		const args = parseArgs(process.argv.slice(2));
		const json = JSON.stringify(collectFromArgs(args), null, 2);
		if (args.out) fs.writeFileSync(args.out, `${json}\n`);
		else process.stdout.write(`${json}\n`);
	} catch (e) {
		console.error(e instanceof Error ? e.message : e);
		process.exit(2);
	}
}

if (process.argv[1] && /collect\.[jt]s$/.test(process.argv[1])) main();
