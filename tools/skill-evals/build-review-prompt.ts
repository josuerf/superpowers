/**
 * Monta o prompt do carrasco para um fixture de diff, pelo mesmo caminho do
 * harness: buildReviewPlan (chunking + pre-check deterministico de logica
 * comentada) com reviewAggressiveness no nivel carrasco. Devolve o prompt do
 * chunk que contem o arquivo alvo, para o eval medir exatamente o que o
 * revisor receberia.
 *
 * Uso (chamado por run.js): npx tsx tools/skill-evals/build-review-prompt.ts <fixture.diff> <arquivo-alvo>
 * Saida: JSON { chunkId, files, stacks, chunks, prompt } em stdout.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { loadProjectConfig } from "../../lib/harness/config";
import { buildReviewPlan, splitDiffByFile } from "../../lib/harness/reviewers/planner";

const [fixture, target] = process.argv.slice(2);
if (!fixture || !target) {
	console.error("uso: build-review-prompt.ts <fixture.diff> <arquivo-alvo>");
	process.exit(2);
}

const gitDiff = fs.readFileSync(fixture, "utf8");
const changedFiles = [...splitDiffByFile(gitDiff).keys()];

// Config default do harness (diretorio sem .harness.config.json), elevada ao
// carrasco como um workspace que habilitou a revisao agressiva.
const base = loadProjectConfig(path.join(os.tmpdir(), "skill-evals-no-config"));
const config = { ...base.reviewAggressiveness, enabled: true, level: "carrasco" as const };

const plan = buildReviewPlan({
	feature: "skill-evals-business-rule",
	changedFiles,
	gitDiff,
	config,
	generatedAt: "1970-01-01T00:00:00.000Z",
});

const chunk = plan.chunks.find((c) => c.files.includes(target));
if (!chunk) {
	console.error(`arquivo alvo fora de todos os chunks: ${target}`);
	process.exit(1);
}
process.stdout.write(
	JSON.stringify({
		chunkId: chunk.id,
		files: chunk.files,
		stacks: chunk.stacks,
		chunks: plan.chunks.length,
		prompt: chunk.prompt,
	}),
);
