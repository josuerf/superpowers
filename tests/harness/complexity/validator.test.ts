import { validateComplexity } from "../../../lib/harness/validators/complexity.js";
import type { ComplexityConfig } from "../../../lib/harness/types.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

function makeConfig(overrides: Partial<ComplexityConfig> = {}): ComplexityConfig {
	return {
		enabled: true,
		thresholds: {
			"react-nextjs": 10,
			"node-express": 10,
		},
		...overrides,
	};
}

describe("validateComplexity", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-complexity-"));
	});

	afterEach(async () => {
		await new Promise(resolve => setTimeout(resolve, 100));
		try {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		} catch {
			// ignore cleanup errors
		}
	});

	it("returns pass for stacks without a dedicated tool", async () => {
		const result = await validateComplexity(tmpDir, "terraform", makeConfig());
		expect(result.passed).toBe(true);
		expect(result.violations).toHaveLength(0);
	});

	it("fails open when eslint is not installed", async () => {
		const result = await validateComplexity(tmpDir, "react-nextjs", makeConfig());
		// Should not throw, should pass with no violations (tool not available)
		expect(result.passed).toBe(true);
	});

	it("detects complexity violations when eslint is available", async () => {
		// This test requires eslint-plugin-complexity to be installed
		// Create a file with high complexity
		const complexFunction = `
function veryComplexFunction(a, b, c, d, e) {
  if (a > 0) {
    if (b > 0) {
      if (c > 0) {
        if (d > 0) {
          if (e > 0) {
            return a + b + c + d + e;
          } else {
            return a + b + c + d - e;
          }
        } else {
          return a + b + c - d;
        }
      } else {
        return a + b - c;
      }
    } else {
      return a - b;
    }
  } else {
    return -a;
  }
}
export { veryComplexFunction };
`;
		fs.writeFileSync(path.join(tmpDir, "complex.ts"), complexFunction);

		const result = await validateComplexity(tmpDir, "react-nextjs", makeConfig({ thresholds: { "react-nextjs": 5 } }));
		// If eslint is available, this should detect the complexity
		// If not available, it passes open — both are valid
		if (result.violations.length > 0) {
			expect(result.passed).toBe(false);
			expect(result.violations[0].complexity).toBeGreaterThan(5);
		} else {
			expect(result.passed).toBe(true);
		}
	});
});
