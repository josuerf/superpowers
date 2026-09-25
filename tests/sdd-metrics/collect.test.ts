import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
	SERIES,
	collectWorkspace,
	countReviewFindings,
	discoverWorkspaces,
	findingSignature,
	parseArgs,
} from '../../tools/sdd-metrics/collect';
import { renderReport } from '../../tools/sdd-metrics/report';

const TEST_DIR = path.join(__dirname, '..', '..', 'tmp-test-sdd-metrics');
const WS = path.join(TEST_DIR, 'demo-workspace');
const PRODUCT = path.join(WS, 'projects', 'api-demo');

const GIT_ENV = {
	...process.env,
	GIT_AUTHOR_NAME: 'Dev',
	GIT_AUTHOR_EMAIL: 'dev@example.com',
	GIT_COMMITTER_NAME: 'Dev',
	GIT_COMMITTER_EMAIL: 'dev@example.com',
};

function git(cwd: string, ...args: string[]) {
	execFileSync('git', args, { cwd, env: GIT_ENV, stdio: 'ignore' });
}

function write(file: string, content: string) {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, content);
}

function commit(repo: string, file: string, message: string, date: string) {
	write(path.join(repo, file), `${message}\n${Math.random()}\n`);
	git(repo, 'add', '-A');
	execFileSync('git', ['commit', '-q', '-m', message], {
		cwd: repo,
		env: { ...GIT_ENV, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
		stdio: 'ignore',
	});
}

function initRepo(dir: string) {
	fs.mkdirSync(dir, { recursive: true });
	git(dir, 'init', '-q');
	git(dir, 'config', 'core.autocrlf', 'false');
}

const PLAN = [
	'# Demo plan',
	...[1, 2, 3, 4, 5, 6].map((n) => `\n### Task ${n}: step ${n}\n\n- [ ] do it`),
].join('\n');

let metrics: ReturnType<typeof collectWorkspace>;

beforeAll(() => {
	fs.rmSync(TEST_DIR, { recursive: true, force: true });

	// Workspace repository: a plan with six tasks, committed.
	initRepo(WS);
	write(path.join(WS, '.harness.config.json'), '{}');
	write(path.join(WS, 'docs/superpowers-prepared/plans/2026-09-01-demo.md'), PLAN);
	commit(WS, 'README.md', 'docs: plano demo', '2026-09-01T10:00:00Z');

	// Product repository under projects/*: one commit with the trailer, one without.
	initRepo(PRODUCT);
	commit(
		PRODUCT,
		'src/a.ts',
		'feat: tarefa 1 [CONTAB-1]\n\nSDD-Plan: docs/superpowers-prepared/plans/2026-09-01-demo.md\nSDD-Task: 1\nSDD-Batch: 1-3',
		'2026-09-02T10:30:00Z',
	);
	commit(PRODUCT, 'src/b.ts', 'fix: ajuste avulso [CONTAB-2]', '2026-09-20T10:00:00Z');

	// SDD artifacts (untracked, as .superpowers/sdd/.gitignore keeps them): one
	// complete batch, one batch that never reported.
	const sdd = path.join(WS, '.superpowers', 'sdd', '2026-09-01-demo');
	write(path.join(sdd, 'batch-1-3-brief.md'), '# Batch brief\n\n## Before writing any code: confirm the contract\n');
	write(path.join(sdd, 'batch-1-3-report.md'), '# Report\n\n## Readback\n- goal: x\n');
	write(path.join(sdd, 'batch-1-3-review-1.md'), '# Review\n\n#### Critical (Must Fix)\n- a.ts:1 broken\n\n#### Important (Should Fix)\n- a.ts:2 x\n- a.ts:3 y\n\n#### Minor (Nice to Have)\nNone\n');
	write(path.join(sdd, 'batch-1-3-review-2.md'), '# Re-review\n0 Critical, 0 Important, 0 Minor\n');
	write(path.join(sdd, 'batch-4-6-brief.md'), '# Batch brief\n');
	const t = new Date('2026-09-02T10:00:00Z');
	fs.utimesSync(path.join(sdd, 'batch-1-3-brief.md'), t, t);
	const r = new Date('2026-09-02T11:00:00Z');
	fs.utimesSync(path.join(sdd, 'batch-1-3-report.md'), r, r);

	// Gate log (M1 warn mode): two would-block events, one pass.
	write(
		path.join(WS, '.superpowers', 'gate-log.jsonl'),
		[
			{ ts: '2026-09-03T10:00:00Z', wouldBlock: true, repo: 'projects/api-demo' },
			{ ts: '2026-09-04T10:00:00Z', wouldBlock: true, repo: 'projects/api-demo' },
			{ ts: '2026-09-05T10:00:00Z', wouldBlock: false },
		]
			.map((e) => JSON.stringify(e))
			.join('\n') + '\n',
	);

	// A sibling directory that is not a workspace.
	fs.mkdirSync(path.join(TEST_DIR, 'not-a-workspace'), { recursive: true });

	metrics = collectWorkspace({ workspace: WS });
});

afterAll(() => {
	fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('collectWorkspace', () => {
	test('emits exactly the nine series', () => {
		expect(Object.keys(metrics.series)).toEqual([...SERIES]);
		expect(SERIES).toHaveLength(9);
	});

	test('a plan with 6 tasks counts 6', () => {
		expect(metrics.series.tarefas_por_plano.planos['docs/superpowers-prepared/plans/2026-09-01-demo.md']).toBe(6);
	});

	test('plan commits are counted per month', () => {
		expect(metrics.series.planos_por_mes.por_mes).toEqual({ '2026-09': 1 });
		expect(metrics.series.planos_por_mes.autores).toBe(1);
	});

	test('a commit with the trailer counts, one without does not — including projects/* repos', () => {
		const t = metrics.series.mrs_com_trailer_sdd;
		expect(t.commits).toBe(1);
		expect(t.repos).toEqual({ 'projects/api-demo': 1 });
		expect(t.planos).toEqual({ 'docs/superpowers-prepared/plans/2026-09-01-demo.md': 1 });
		expect(t.commits_total).toBe(3);
	});

	test('a brief without its report shows as an incomplete batch', () => {
		expect(metrics.series.briefs_emitidos.total).toBe(2);
		expect(metrics.series.reports_recebidos.total).toBe(1);
		expect(metrics.series.reports_recebidos.lotes_incompletos).toEqual([
			'.superpowers/sdd/2026-09-01-demo/batch-4-6-brief.md',
		]);
	});

	test('reviewer findings per batch come from round 1, rounds counted', () => {
		expect(metrics.series.achados_do_revisor_por_lote.lotes).toEqual({
			'2026-09-01-demo/batch-1-3': { rodadas: 2, critical: 1, important: 2, minor: 0 },
		});
	});

	test('readbacks: emitted by the brief, read in the report', () => {
		expect(metrics.series.readbacks).toEqual({ emitidos: 1, lidos: 1 });
	});

	test('review-data series are null without --findings/--mrs', () => {
		expect(metrics.series.achados_por_100_linhas).toMatchObject({ valor: null });
		expect(metrics.series.reincidencia_por_categoria).toMatchObject({ valor: null });
	});

	test('gate-log would-block events are counted under gates', () => {
		expect(metrics.gates).toEqual({
			gate_would_block: 2,
			eventos: 3,
			por_repo: { 'projects/api-demo': 2 },
		});
	});

	test('retroactive reconstruction credits commits made while a batch was open', () => {
		const lote = metrics.retroativo.lotes.find((l) => l.lote === '2026-09-01-demo/batch-1-3');
		expect(lote).toMatchObject({ commits_no_periodo: 1, commits_com_trailer: 1 });
		expect(metrics.retroativo.heuristica).toMatch(/1h/);
	});

	test('--since drops earlier activity', () => {
		const later = collectWorkspace({ workspace: WS, since: '2026-09-10' });
		expect(later.series.mrs_com_trailer_sdd.commits).toBe(0);
		expect(later.series.mrs_com_trailer_sdd.commits_total).toBe(1);
		expect(later.series.planos_por_mes.commits).toBe(0);
		expect(later.gates.gate_would_block).toBe(0);
	});
});

describe('review data (--findings + --mrs)', () => {
	test('findings per 100 lines split by SDD slice, and recurrence by category', () => {
		const tsv = path.join(TEST_DIR, 'findings.tsv');
		const mrs = path.join(TEST_DIR, 'mrs.json');
		write(
			tsv,
			[
				'repo\tmr_iid\tjira_keys\tseverity\tcategory\ttitle',
				'grp/api-demo\t10\tCONTAB-1\tHIGH\tbug\tFiltro de exercicio removido da consulta nativa',
				'grp/api-demo\t11\tCONTAB-2\tHIGH\tbug\tFiltro de exercicio removido da consulta nativa',
				'grp/api-demo\t11\tCONTAB-2\tLOW\tdesign\tNome confuso no helper',
				'grp/other\t99\tX-1\tLOW\tbug\tfora do workspace',
			].join('\n'),
		);
		write(
			mrs,
			JSON.stringify([
				{ repo: 'grp/api-demo', iid: 10, churn: 100, merged_at: '2026-08-10T00:00:00Z', jira_keys: ['CONTAB-1'] },
				{ repo: 'grp/api-demo', iid: 11, churn: 200, merged_at: '2026-09-21T00:00:00Z', jira_keys: ['CONTAB-2'] },
				{ repo: 'grp/other', iid: 99, churn: 50, merged_at: '2026-09-21T00:00:00Z', jira_keys: ['X-1'] },
			]),
		);
		const m = collectWorkspace({ workspace: WS, findingsTsv: tsv, mrsJson: mrs });
		const per = m.series.achados_por_100_linhas as {
			global: number;
			sdd: { mrs: number; achados: number; valor: number };
			nao_sdd: { mrs: number; achados: number; valor: number };
		};
		expect(per.global).toBe(1); // 3 findings / 300 lines
		expect(per.sdd).toMatchObject({ mrs: 1, achados: 1, valor: 1 });
		expect(per.nao_sdd).toMatchObject({ mrs: 1, achados: 2, valor: 1 });
		const rec = m.series.reincidencia_por_categoria as { categorias: Record<string, { reincidentes: number; taxa: number }> };
		expect(rec.categorias.bug).toMatchObject({ reincidentes: 1, taxa: 1 });
		expect(rec.categorias.design).toMatchObject({ reincidentes: 0, taxa: 0 });
	});
});

describe('helpers', () => {
	test('discoverWorkspaces finds harness workspaces by marker, not by name', () => {
		expect(discoverWorkspaces(TEST_DIR).map((d) => path.basename(d))).toEqual(['demo-workspace']);
	});

	test('countReviewFindings prefers the summary line', () => {
		expect(countReviewFindings('Findings: 2 Critical, 1 Important, 4 Minor')).toEqual({
			critical: 2,
			important: 1,
			minor: 4,
		});
	});

	test('findingSignature ignores accents and word order', () => {
		expect(findingSignature('bug', 'Filtro de exercício removido')).toBe(
			findingSignature('bug', 'removido o filtro do exercicio'),
		);
	});

	test('parseArgs rejects unknown flags and bad dates', () => {
		expect(() => parseArgs(['--nope'])).toThrow(/unknown/);
		expect(() => parseArgs(['--workspace', 'x', '--since', 'ontem'])).toThrow(/date/);
	});

	test('renderReport prints every series and the gates and retroactive sections', () => {
		const md = renderReport({ workspaces: [metrics] });
		for (const s of SERIES) expect(md).toContain(s);
		expect(md).toMatch(/gate_would_block/);
		expect(md).toMatch(/Retroativo/);
	});
});
