import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PatternCatalog } from '../../lib/patterns/catalog';
import { defaultPatternsConfig } from '../../lib/patterns/config';
import {
  archiveStalePending,
  computeSignature,
  recordFindings,
  type ReviewFinding,
} from '../../lib/patterns/record';
import { parseGitlabReviewTsv, rowToFinding, TsvFormatError } from '../../lib/patterns/gitlab-tsv';
import { parseDecisionJson, parseFindingsMarkdown, parseLedger, readReviewSource } from '../../lib/patterns/review-sources';

const HEADER = 'grupo\tproduto\trepo\tmr_iid\tmr_title\tjira_keys\tseverity\tcategory\tfile\tline\ttitle\tconfidence\tresolved\tn_human_replies\treview_decision\tnote_url';

function row(repo: string, mr: string, over: Partial<Record<string, string>> = {}): string {
  const v = {
    severity: 'HIGH',
    category: 'database',
    file: 'src/main/java/br/x/Pessoa.java',
    line: '12',
    title: 'nova-coluna-jpa-sem-migracao-correspondente',
    confidence: '80',
    resolved: 'true',
    n_human_replies: '1',
    note_url: `https://gitlab/${repo}/-/merge_requests/${mr}#note_1`,
    ...over,
  };
  return ['g', 'p', repo, mr, 't', 'J-1', v.severity, v.category, v.file, v.line, v.title, v.confidence, v.resolved, v.n_human_replies, 'BLOCK', v.note_url].join('\t');
}

describe('patterns record', () => {
  let wiki: string;
  let catalog: PatternCatalog;
  const config = defaultPatternsConfig(); // minFrequency 3, minProjects 2

  beforeEach(() => {
    wiki = fs.mkdtempSync(path.join(os.tmpdir(), 'patterns-record-'));
    catalog = new PatternCatalog(wiki, wiki);
  });
  afterEach(() => fs.rmSync(wiki, { recursive: true, force: true }));

  const importTsv = (lines: string[], promote = true) =>
    recordFindings(parseGitlabReviewTsv([HEADER, ...lines].join('\n')).map(rowToFinding), catalog, config, {
      promote,
      today: '2026-09-25',
    });

  it('folds two identical findings from different repos into one pending entry with frequency 2 / projects 2', () => {
    const s = importTsv([row('grp/repo-a', '1'), row('grp/repo-b', '7')]);
    expect(s.created).toBe(1);
    expect(s.incremented).toBe(1);
    const all = catalog.query({});
    expect(all).toHaveLength(1);
    expect(all[0].frequency).toBe(2);
    expect(all[0].projects).toEqual(['grp/repo-a', 'grp/repo-b']);
    expect(all[0].status).toBe('pending');
    expect(fs.existsSync(path.join(wiki, 'pending', `${all[0].id}.md`))).toBe(true);
  });

  it('promotes when three occurrences of one signature cross minFrequency across minProjects', () => {
    const s = importTsv([row('grp/repo-a', '1'), row('grp/repo-b', '7'), row('grp/repo-b', '9')]);
    const [e] = catalog.query({});
    expect(e.frequency).toBe(3);
    expect(e.status).toBe('promoted');
    expect(s.promoted).toEqual([e.id]);
    expect(fs.existsSync(path.join(wiki, 'errors', `${e.id}.md`))).toBe(true);
  });

  it('keeps three occurrences from a single project in pending (minProjects not met)', () => {
    importTsv([row('grp/repo-a', '1'), row('grp/repo-a', '2'), row('grp/repo-a', '3')]);
    const [e] = catalog.query({});
    expect(e.frequency).toBe(3);
    expect(e.status).toBe('pending');
  });

  it('never promotes when the caller is not allowed to (automatic path), and a later promoting run sweeps it', () => {
    importTsv([row('grp/repo-a', '1'), row('grp/repo-b', '7'), row('grp/repo-b', '9')], false);
    expect(catalog.query({})[0].status).toBe('pending');
    const s = recordFindings([], catalog, config, { promote: true });
    expect(s.promoted).toHaveLength(1);
    expect(catalog.query({})[0].status).toBe('promoted');
  });

  it('gives an unresolved, unanswered finding a lower confidence', () => {
    const [acted, ignored] = parseGitlabReviewTsv(
      [HEADER, row('r', '1'), row('r', '2', { resolved: 'false', n_human_replies: '0', title: 'npe-quando-campo-e-null' })].join('\n'),
    ).map(rowToFinding);
    expect(ignored.confidence!).toBeLessThan(acted.confidence!);
    recordFindings([acted, ignored], catalog, config, { promote: false });
    const confidences = catalog.query({}).map((e) => e.confidence);
    expect(confidences).toEqual(expect.arrayContaining([acted.confidence, ignored.confidence]));
  });

  it('is idempotent: recording the same source twice does not double-count', () => {
    importTsv([row('grp/repo-a', '1'), row('grp/repo-b', '7')]);
    const s = importTsv([row('grp/repo-a', '1'), row('grp/repo-b', '7')]);
    expect(s.alreadySeen).toBe(2);
    expect(catalog.query({})[0].frequency).toBe(2);
  });

  it('records only Critical/High by default', () => {
    const s = importTsv([row('r', '1', { severity: 'MEDIUM' }), row('r', '2', { severity: 'LOW' }), row('r', '3', { severity: 'CRITICAL' })]);
    expect(s.discarded.belowSeverity).toBe(2);
    expect(s.created).toBe(1);
  });

  it('groups differently worded findings that share category, layer and concept', () => {
    const a = computeSignature({ category: 'database', file: 'svc-a/src/Pessoa.java', title: 'nova-coluna-jpa-sem-migracao-e-sem-mecanismo-de-schema' });
    const b = computeSignature({ category: 'database', file: 'svc-b/src/Contrato.java', title: '6 tabelas novas sem migração Flyway visível neste repositório' });
    expect(a).toBe(b);
    const c = computeSignature({ category: 'bug', file: 'svc-a/src/Pessoa.java', title: 'nova coluna sem migração' });
    expect(c).not.toBe(a);
  });

  it('discards findings without a citation, and with an unresolvable one when cites are verified', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'patterns-root-'));
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'one\ntwo\nthree\n');
    const base = { severity: 'high' as const, category: 'correctness', project: 'p', title: 'null guard missing' };
    const findings: ReviewFinding[] = [
      { ...base, file: 'src/a.ts', line: 2, sourceKey: 'k1' },
      { ...base, file: 'src/a.ts', line: 99, sourceKey: 'k2' },
      { ...base, file: 'src/missing.ts', line: 1, sourceKey: 'k3' },
      { ...base, file: '', sourceKey: 'k4' },
    ];
    const s = recordFindings(findings, catalog, config, { promote: false, verifyCitesRoot: root, logPath: path.join(wiki, 'patterns.log') });
    expect(s.created).toBe(1);
    expect(s.discarded).toEqual({ belowSeverity: 0, noCite: 1, unresolvableCite: 2 });
    const log = fs.readFileSync(path.join(wiki, 'patterns.log'), 'utf-8');
    expect(log).toContain('"unresolvableCite":2');
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('archives stale pending entries and revives them to pending on recurrence', () => {
    const f: ReviewFinding = { severity: 'high', category: 'bug', file: 'a/B.java', line: 1, title: 'npe on null', project: 'p', sourceKey: 's1' };
    recordFindings([f], catalog, config, { promote: false, today: '2026-01-01' });
    expect(archiveStalePending(catalog, config, '2026-02-15')).toHaveLength(0);
    const archived = archiveStalePending(catalog, config, '2026-04-01');
    expect(archived).toHaveLength(1);
    expect(catalog.getById(archived[0])!.status).toBe('archived');
    recordFindings([{ ...f, sourceKey: 's2' }], catalog, config, { promote: false, today: '2026-04-02' });
    const e = catalog.getById(archived[0])!;
    expect(e.status).toBe('pending');
    expect(e.frequency).toBe(2);
  });
});

describe('gitlab review TSV', () => {
  it('rejects a TSV missing a required column', () => {
    const bad = HEADER.replace('\tseverity', '');
    expect(() => parseGitlabReviewTsv(`${bad}\n`)).toThrow(TsvFormatError);
    expect(() => parseGitlabReviewTsv(`${bad}\n`)).toThrow(/missing required column\(s\): severity/);
  });

  it('rejects a row with the wrong number of cells, naming the line', () => {
    const shifted = row('r', '1').split('\t').slice(1).join('\t');
    expect(() => parseGitlabReviewTsv([HEADER, row('r', '1'), shifted].join('\n'))).toThrow(/TSV line 3: expected 16 cells, found 15/);
  });

  it('rejects typed cells that do not parse', () => {
    expect(() => parseGitlabReviewTsv([HEADER, row('r', '1', { severity: 'URGENT' })].join('\n'))).toThrow(/invalid severity/);
    expect(() => parseGitlabReviewTsv([HEADER, row('r', '1', { resolved: 'maybe' })].join('\n'))).toThrow(/invalid resolved/);
    expect(() => parseGitlabReviewTsv([HEADER, row('r', '1', { confidence: 'high' })].join('\n'))).toThrow(/invalid confidence/);
  });
});

describe('review sources', () => {
  it('reads a saved decision.json through chunkVerdicts', () => {
    const doc = {
      feature: 'feat-x',
      chunkVerdicts: [
        { chunkId: 'c1', files: [], action: 'BLOCK', findings: [{ severity: 'High', category: 'security', file: 'src/a.ts', line: 3, issue: 'token hardcoded', suggestion: 'use env' }] },
        { chunkId: 'c2', files: [], action: 'APPROVE', findings: [{ severity: 'Low', file: 'src/b.ts', line: 1, issue: 'nit', suggestion: '' }] },
      ],
    };
    const f = parseDecisionJson(JSON.stringify(doc), 'proj');
    expect(f).toHaveLength(2);
    expect(f[0]).toMatchObject({ severity: 'high', category: 'security', file: 'src/a.ts', line: 3, title: 'token hardcoded', suggestion: 'use env' });
    expect(() => parseDecisionJson('{"foo":1}', 'proj')).toThrow(/not a review decision/);
  });

  it('reads the carrasco markdown report', () => {
    const md = [
      '# Carrasco Code Review — x',
      '## Findings',
      '',
      '🔴 **[Critical]** `src/auth.ts:10` — password compared with ==',
      '   Fix: use timingSafeEqual',
      '',
      '🔵 **[Low]** `src/a.ts:1` — naming',
      '   Fix: rename',
    ].join('\n');
    const f = parseFindingsMarkdown(md, 'p', 'carrasco-review.md');
    expect(f).toHaveLength(2);
    expect(f[0]).toMatchObject({ severity: 'critical', file: 'src/auth.ts', line: 10, suggestion: 'use timingSafeEqual' });
  });

  it('reads an SDD reviewer findings file (Critical/Important/Minor sections)', () => {
    const md = [
      '### Issues',
      '#### Critical (Must Fix)',
      '- `src/pay.ts:42` — refund applied twice when the webhook retries; make it idempotent',
      '#### Important (Should Fix)',
      '1. src/list.ts:7, findAll without pagination',
      '#### Minor (Nice to Have)',
      '- src/x.ts:1 naming',
      '### Assessment',
      '- not a finding src/y.ts:3',
    ].join('\n');
    const f = parseFindingsMarkdown(md, 'p', 'batch-1-2-review-1.md');
    expect(f.map((x) => [x.severity, x.file, x.line])).toEqual([
      ['critical', 'src/pay.ts', 42],
      ['high', 'src/list.ts', 7],
      ['low', 'src/x.ts', 1],
    ]);
  });

  it('reads the SDD ledger: parked and breaker rulings as high, deferred minors as low, preflight rulings skipped', () => {
    const ledger = [
      '# SDD ledger — plan: docs/plans/x.md',
      'Ruling: kept the v1 endpoint — spec says so — rework if wrong',
      'Batch 1 (Tasks 1-4): complete (commits a1b2c3d..c3d4e5f, review clean)',
      'Batch 1: minor (deferred): naming nit in src/install.js:3',
      'Batch 2: fix round 3/3 (1 addressed, 1 open — race in src/q.ts:9; commits a..b)',
      'Batch 2: parked — race in src/q.ts:9 when two workers dequeue — Ruling: single worker in prod',
      'Batch 3: Ruling: missing tenant filter in src/repo.ts:20 — added the filter before task 9',
    ].join('\n');
    const { kind, findings } = readReviewSource('progress.md', ledger, 'p');
    expect(kind).toBe('ledger');
    expect(findings.map((x) => [x.severity, x.file, x.line])).toEqual([
      ['low', 'src/install.js', 3],
      ['high', 'src/q.ts', 9],
      ['high', 'src/repo.ts', 20],
    ]);
    expect(findings[1].title).toBe('race in when two workers dequeue');
    expect(parseLedger(ledger, 'p', 'progress.md')).toHaveLength(3);
  });
});
