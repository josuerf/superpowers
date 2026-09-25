import * as fs from 'fs';
import * as path from 'path';
import {
  detectStack,
  detectStackDeep,
  resolveDeclaredRootStack,
  expandProjectRoots,
  scanWorkspace,
  shouldRescan,
} from '../../lib/harness/discovery';

const TEST_DIR = path.join(__dirname, '..', '..', 'tmp-test-harness-discovery');

function setup() {
  if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR, { recursive: true });
}

function teardown() {
  if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true, force: true });
}

describe('detectStack', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('detects React/Next.js project', () => {
    fs.writeFileSync(path.join(TEST_DIR, 'package.json'), JSON.stringify({ dependencies: { next: '^14.0.0', react: '^18.0.0' } }));
    expect(detectStack(TEST_DIR)).toBe('react-nextjs');
  });

  test('detects Go project', () => {
    fs.writeFileSync(path.join(TEST_DIR, 'go.mod'), 'module test\n\ngo 1.21');
    expect(detectStack(TEST_DIR)).toBe('go-std');
  });

  test('detects Terraform project', () => {
    fs.writeFileSync(path.join(TEST_DIR, 'main.tf'), 'resource "aws_instance" "test" {}');
    expect(detectStack(TEST_DIR)).toBe('terraform');
  });

  test('returns null for empty directory', () => {
    expect(detectStack(TEST_DIR)).toBeNull();
  });

  test('falls back to node-std for a plain Node project with no package.json', () => {
    fs.writeFileSync(path.join(TEST_DIR, 'index.js'), 'console.log("hi");');
    expect(detectStack(TEST_DIR)).toBe('node-std');
  });

  test('prefers a more specific stack over node-std when both could match', () => {
    fs.writeFileSync(path.join(TEST_DIR, 'index.js'), 'console.log("hi");');
    fs.writeFileSync(path.join(TEST_DIR, 'package.json'), JSON.stringify({ dependencies: { express: '^4.0.0' } }));
    expect(detectStack(TEST_DIR)).toBe('node-express');
  });

  test('finds node-std source files nested under a subdirectory (e.g. test/*.test.js)', () => {
    const testDir = path.join(TEST_DIR, 'test');
    fs.mkdirSync(testDir);
    fs.writeFileSync(path.join(testDir, 'sample.test.js'), "require('node:test');");
    expect(detectStack(TEST_DIR)).toBe('node-std');
  });

  test('ignores node_modules when looking for node-std source files', () => {
    const nm = path.join(TEST_DIR, 'node_modules', 'some-pkg');
    fs.mkdirSync(nm, { recursive: true });
    fs.writeFileSync(path.join(nm, 'index.js'), 'module.exports = {};');
    expect(detectStack(TEST_DIR)).toBeNull();
  });
});

describe('scanWorkspace', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('scans and detects projects in workspace', () => {
    const frontend = path.join(TEST_DIR, 'frontend');
    const backend = path.join(TEST_DIR, 'backend');
    fs.mkdirSync(frontend);
    fs.mkdirSync(backend);
    fs.writeFileSync(path.join(frontend, 'package.json'), JSON.stringify({ dependencies: { next: '^14.0.0' } }));
    fs.writeFileSync(path.join(backend, 'go.mod'), 'module test');

    const config = scanWorkspace(TEST_DIR);
    expect(config.projects).toHaveLength(2);
    expect(config.projects.find(p => p.path === 'frontend')?.stack).toBe('react-nextjs');
    expect(config.projects.find(p => p.path === 'backend')?.stack).toBe('go-std');
  });
});

describe('declared project roots (M3/M4)', () => {
  beforeEach(setup);
  afterEach(teardown);

  const mk = (rel: string, content = '') => {
    const p = path.join(TEST_DIR, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  };

  test('expanding "projects/*" finds each project and classifies it', () => {
    mk('projects/a/pom.xml', '<project/>');
    mk('projects/b/package.json', JSON.stringify({ dependencies: { express: '^4' } }));
    mk('projects/.git/HEAD', 'ref');
    mk('projects/README.md', '# not a dir');
    const roots = expandProjectRoots(TEST_DIR, ['projects/*']);
    expect(roots.map((r) => path.relative(TEST_DIR, r).split(path.sep).join('/'))).toEqual([
      'projects/a',
      'projects/b',
    ]);
    expect(roots.map((r) => detectStack(r))).toEqual(['java-springboot', 'node-express']);
  });

  test('literal entries pass through and missing ones are dropped', () => {
    mk('apps/web/package.json', '{}');
    const roots = expandProjectRoots(TEST_DIR, ['apps/web', 'apps/ghost', '']);
    expect(roots).toEqual([path.join(TEST_DIR, 'apps', 'web')]);
  });

  test('(a) a pom.xml two levels down is detected as java-springboot, with its directory', () => {
    mk('projects/api-x/backend/core/pom.xml', '<project/>');
    const match = detectStackDeep(path.join(TEST_DIR, 'projects', 'api-x'));
    expect(match).toEqual({
      stack: 'java-springboot',
      dir: path.join(TEST_DIR, 'projects', 'api-x', 'backend', 'core'),
    });
  });

  test('a manifest deeper than 3 levels is not searched', () => {
    mk('projects/deep/a/b/c/d/pom.xml', '<project/>');
    expect(detectStackDeep(path.join(TEST_DIR, 'projects', 'deep'))).toBeNull();
  });

  test('a real manifest below wins over stray scripts at the root', () => {
    mk('projects/mixed/tool.js', 'console.log(1)');
    mk('projects/mixed/svc/go.mod', 'module x');
    expect(detectStackDeep(path.join(TEST_DIR, 'projects', 'mixed'))?.stack).toBe('go-std');
  });

  test('(b) a declared root with no marker returns an identifiable error, not undefined', () => {
    mk('projects/api-y/src/Foo.java', 'class Foo {}');
    const res = resolveDeclaredRootStack(path.join(TEST_DIR, 'projects', 'api-y'));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe('undetected-stack');
      expect(res.message).toMatch(/Could not detect stack/);
    }
  });

  test('(c) without declared roots detectStack keeps the root-only behavior', () => {
    mk('projects/api-x/backend/pom.xml', '<project/>');
    expect(detectStack(path.join(TEST_DIR, 'projects', 'api-x'))).toBeNull();
  });
});
