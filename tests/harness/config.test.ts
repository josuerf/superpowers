import * as fs from 'fs';
import * as path from 'path';
import {
  loadProjectConfig,
  loadWorkspaceConfig,
  isWorkspaceMode,
  getProjects,
  buildReviewExclude,
  DEFAULT_REVIEW_EXCLUDE,
} from '../../lib/harness/config';

const TEST_DIR = path.join(__dirname, '..', '..', 'tmp-test-harness');

function setup() {
  if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR, { recursive: true });
}

function teardown() {
  if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true, force: true });
}

describe('loadProjectConfig', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('returns default config when no file exists', () => {
    const config = loadProjectConfig(TEST_DIR);
    expect(config.coverageMin).toBe(80);
    expect(config.securityScan.enabled).toBe(true);
  });

  test('merges user config with defaults', () => {
    fs.writeFileSync(
      path.join(TEST_DIR, '.harness.config.json'),
      JSON.stringify({ coverageMin: 90 })
    );
    const config = loadProjectConfig(TEST_DIR);
    expect(config.coverageMin).toBe(90);
    expect(config.securityScan.enabled).toBe(true);
  });

  test('default reviewAggressiveness is disabled, standard level, with standards block', () => {
    const config = loadProjectConfig(TEST_DIR);
    expect(config.reviewAggressiveness.enabled).toBe(false);
    expect(config.reviewAggressiveness.level).toBe('standard');
    expect(config.reviewAggressiveness.standards.autoDetect).toBe(true);
    expect(Array.isArray(config.reviewAggressiveness.carrasco.focusCategories)).toBe(true);
  });

  test('deep-merges a partial reviewAggressiveness without wiping nested defaults', () => {
    fs.writeFileSync(
      path.join(TEST_DIR, '.harness.config.json'),
      JSON.stringify({ reviewAggressiveness: { level: 'strict', standards: { paths: ['docs/arch.md'] } } })
    );
    const config = loadProjectConfig(TEST_DIR);
    // overridden values
    expect(config.reviewAggressiveness.level).toBe('strict');
    expect(config.reviewAggressiveness.standards.paths).toEqual(['docs/arch.md']);
    // nested defaults preserved
    expect(config.reviewAggressiveness.standards.autoDetect).toBe(true);
    expect(config.reviewAggressiveness.carrasco.focusCategories.length).toBeGreaterThan(0);
    expect(config.reviewAggressiveness.chunking.maxFilesPerChunk).toBe(10);
  });

  test('normalizes a severityThreshold written in the wrong case', () => {
    fs.writeFileSync(
      path.join(TEST_DIR, '.harness.config.json'),
      JSON.stringify({ reviewAggressiveness: { carrasco: { severityThreshold: 'CRITICAL' } } })
    );
    const config = loadProjectConfig(TEST_DIR);
    expect(config.reviewAggressiveness.carrasco.severityThreshold).toBe('Critical');
  });

  test('falls back to the default severityThreshold on an unknown value', () => {
    fs.writeFileSync(
      path.join(TEST_DIR, '.harness.config.json'),
      JSON.stringify({ reviewAggressiveness: { carrasco: { severityThreshold: 'blocker' } } })
    );
    const config = loadProjectConfig(TEST_DIR);
    expect(config.reviewAggressiveness.carrasco.severityThreshold).toBe('High');
  });

  test('exclude defaults keep agent and harness config trees out of the change set', () => {
    const config = loadProjectConfig(TEST_DIR);
    expect(config.reviewAggressiveness.exclude.useDefaults).toBe(true);
    expect(config.reviewAggressiveness.exclude.patterns).toEqual([]);
    const exclude = buildReviewExclude(config.reviewAggressiveness);
    const excluded = (f: string) => exclude.some((re) => re.test(f));
    // The untracked-file sweep used to feed every one of these to a reviewer.
    expect(excluded('.claude/skills/media-use/scripts/lib/util.py')).toBe(true);
    expect(excluded('.harness/reviews/C65/plan.json')).toBe(true);
    expect(excluded('node_modules/left-pad/index.js')).toBe(true);
    // Real source still goes through.
    expect(excluded('src/core/rito/step-catalog.ts')).toBe(false);
    expect(excluded('src-tauri/src/lib.rs')).toBe(false);
  });

  test('project exclude patterns add to the defaults, and can replace them', () => {
    fs.writeFileSync(
      path.join(TEST_DIR, '.harness.config.json'),
      JSON.stringify({ reviewAggressiveness: { exclude: { patterns: ['(^|[\\\\/])generated[\\\\/]'] } } })
    );
    const added = buildReviewExclude(loadProjectConfig(TEST_DIR).reviewAggressiveness);
    expect(added.some((re) => re.test('src/generated/api.ts'))).toBe(true);
    expect(added.some((re) => re.test('node_modules/x/index.js'))).toBe(true);

    fs.writeFileSync(
      path.join(TEST_DIR, '.harness.config.json'),
      JSON.stringify({
        reviewAggressiveness: { exclude: { useDefaults: false, patterns: ['(^|[\\\\/])generated[\\\\/]'] } },
      })
    );
    const replaced = buildReviewExclude(loadProjectConfig(TEST_DIR).reviewAggressiveness);
    expect(replaced.some((re) => re.test('src/generated/api.ts'))).toBe(true);
    expect(replaced.some((re) => re.test('node_modules/x/index.js'))).toBe(false);
  });

  test('an invalid exclude pattern is skipped instead of breaking the review', () => {
    fs.writeFileSync(
      path.join(TEST_DIR, '.harness.config.json'),
      JSON.stringify({ reviewAggressiveness: { exclude: { patterns: ['([unclosed'] } } })
    );
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const exclude = buildReviewExclude(loadProjectConfig(TEST_DIR).reviewAggressiveness);
    expect(exclude.length).toBe(DEFAULT_REVIEW_EXCLUDE.length);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test('default verifyOnStop.minFiles is 3', () => {
    const config = loadProjectConfig(TEST_DIR);
    expect(config.verifyOnStop.minFiles).toBe(3);
  });

  test('honors a user-provided verifyOnStop.minFiles', () => {
    fs.writeFileSync(
      path.join(TEST_DIR, '.harness.config.json'),
      JSON.stringify({ verifyOnStop: { minFiles: 1 } })
    );
    const config = loadProjectConfig(TEST_DIR);
    expect(config.verifyOnStop.minFiles).toBe(1);
    // unrelated defaults preserved
    expect(config.coverageMin).toBe(80);
  });
});

describe('loadWorkspaceConfig', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('returns null when no file exists', () => {
    expect(loadWorkspaceConfig(TEST_DIR)).toBeNull();
  });

  test('parses workspace mode config', () => {
    const wsConfig = {
      version: '1', generated: '2026-05-17', lastScan: '2026-05-17',
      projects: [{ path: 'frontend', stack: 'react-nextjs' }],
      workspaceConfig: { autoRescan: true, reportPath: '.harness/reports' },
    };
    fs.writeFileSync(path.join(TEST_DIR, '.harness-workspace.json'), JSON.stringify(wsConfig));
    const loaded = loadWorkspaceConfig(TEST_DIR);
    expect(isWorkspaceMode(loaded!)).toBe(true);
    expect(getProjects(loaded!)).toHaveLength(1);
  });

  test('parses project mode config', () => {
    const projConfig = {
      version: '1', generated: '2026-05-17',
      projectRoot: '.', stack: 'react-nextjs', config: './.harness.config.json',
    };
    fs.writeFileSync(path.join(TEST_DIR, '.harness-workspace.json'), JSON.stringify(projConfig));
    const loaded = loadWorkspaceConfig(TEST_DIR);
    expect(isWorkspaceMode(loaded!)).toBe(false);
    expect(getProjects(loaded!)).toHaveLength(1);
    expect(getProjects(loaded!)[0].stack).toBe('react-nextjs');
  });
});
