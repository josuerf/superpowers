import { validateDuplication } from "../../../lib/harness/validators/duplication.js";
import type { DuplicationConfig } from "../../../lib/harness/types.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

function makeConfig(overrides: Partial<DuplicationConfig> = {}): DuplicationConfig {
	return {
		enabled: true,
		maxDuplication: 5,
		minLines: 5,
		minTokens: 50,
		ignorePatterns: ["**/*.test.ts", "**/node_modules/**"],
		...overrides,
	};
}

describe("validateDuplication", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-dup-"));
		fs.mkdirSync(path.join(tmpDir, ".harness"), { recursive: true });
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("passes when no duplication exists", async () => {
		fs.writeFileSync(path.join(tmpDir, "unique1.ts"), "export function foo() { return 1; }");
		fs.writeFileSync(path.join(tmpDir, "unique2.ts"), "export function bar() { return 2; }");

		const result = await validateDuplication(tmpDir, makeConfig());
		expect(result.passed).toBe(true);
		expect(result.errors).toHaveLength(0);
	});

	it("detects duplicated blocks when threshold is exceeded", async () => {
		const duplicatedBlock = `
function processData(input: string): string {
  const trimmed = input.trim();
  const normalized = trimmed.toLowerCase();
  const validated = normalized.replace(/[^a-z0-9]/g, '');
  return validated;
}
`.repeat(1);

		fs.writeFileSync(path.join(tmpDir, "file1.ts"), duplicatedBlock);
		fs.writeFileSync(path.join(tmpDir, "file2.ts"), duplicatedBlock);
		fs.writeFileSync(path.join(tmpDir, "file3.ts"), duplicatedBlock);

		const result = await validateDuplication(tmpDir, makeConfig({ maxDuplication: 0 }));
		// With maxDuplication: 0, any duplication should fail
		expect(result.passed).toBe(false);
		expect(result.errors.length).toBeGreaterThan(0);
	});

	it("ignores files matching ignorePatterns", async () => {
		const block = "export function test() { return 1; }";
		fs.writeFileSync(path.join(tmpDir, "file1.ts"), block);
		fs.writeFileSync(path.join(tmpDir, "file1.test.ts"), block);

		const result = await validateDuplication(tmpDir, makeConfig({ maxDuplication: 5 }));
		// Test files should be ignored
		expect(result.passed).toBe(true);
	});

	it("fails open when jscpd is not installed", async () => {
		const result = await validateDuplication(tmpDir, makeConfig(), 100);
		// Should not throw, should pass with warning
		expect(result.passed).toBe(true);
		expect(result.warnings.length).toBeGreaterThan(0);
	});
});
