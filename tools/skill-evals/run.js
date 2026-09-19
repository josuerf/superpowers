#!/usr/bin/env node
/**
 * Eval nivel 1 — decisao.
 *
 * Mede as duas decisoes que as skills tomam, sem executar trabalho real:
 *   1. brainstorming oferece o visual companion quando a demanda tem superficie visual?
 *   2. writing-plans escolhe inline ou subagentes no handoff, e justifica?
 *
 * Como funciona: o conteudo da SKILL.md sob teste e injetado no prompt e o
 * cenario e apresentado logo depois. Isso mede exatamente o que estamos
 * mudando — o texto da skill — sem depender de ter o plugin instalado, e
 * permite comparar dois refs lendo o arquivo de cada um.
 *
 * LIMITE HONESTO: isto NAO mede roteamento (se a skill seria ativada sozinha).
 * Mede o comportamento dado que ela esta carregada. As duas queixas que
 * originaram este eval sao sobre comportamento dentro da skill, nao sobre
 * ativacao.
 *
 * Uso:
 *   node tools/skill-evals/run.js --suite visual|execution|both [--reps N]
 *                                 [--model NOME] [--label TEXTO] [--case ID]
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const HERE = __dirname;
const RESULTS = path.join(HERE, 'results');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const SUITE = arg('suite', 'both');
const REPS = parseInt(arg('reps', '3'), 10);
const MODEL = arg('model', '');
const ONLY = arg('case', '');
const LABEL = arg('label', '');

const PROJECT_CONTEXT = `Contexto do projeto, ja explorado nesta sessao: sistema web de gestao
publica em React no front e Node/TypeScript no back. Ha telas em \`src/pages\`,
componentes compartilhados em \`src/components\`, API REST em \`src/api\`, acesso a
dados em \`src/repo\` e relatorios em \`src/report\`. O repositorio ja tem
CLAUDE.md e testes em Jest.`;

/** Soma o usage do STREAM. O evento `result` final subestima o consumo. */
function sumStreamUsage(lines) {
  let input = 0, output = 0, cacheRead = 0, cacheWrite = 0;
  for (const line of lines) {
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    if (ev.type === 'result') continue; // nunca contar o result
    const u = ev.message?.usage || ev.usage;
    if (!u) continue;
    input += u.input_tokens || 0;
    output += u.output_tokens || 0;
    cacheRead += u.cache_read_input_tokens || 0;
    cacheWrite += u.cache_creation_input_tokens || 0;
  }
  return { input, output, cacheRead, cacheWrite, total: input + output + cacheRead + cacheWrite };
}

function assistantText(lines) {
  const out = [];
  for (const line of lines) {
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    if (ev.type === 'assistant' && ev.message?.content) {
      for (const part of ev.message.content) {
        if (part.type === 'text' && part.text) out.push(part.text);
      }
    }
  }
  return out.join('\n');
}

function runClaude(prompt) {
  // O prompt carrega a SKILL.md inteira e estoura o limite de linha de comando
  // do Windows (~8k). Entregar por stdin evita isso e dispensa escaping.
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--max-turns', '4'];
  if (MODEL) args.push('--model', MODEL);
  const started = Date.now();
  const res = spawnSync('claude', args, {
    encoding: 'utf8',
    cwd: ROOT,
    input: prompt,
    maxBuffer: 64 * 1024 * 1024,
  });
  const lines = (res.stdout || '').split('\n').filter((l) => l.trim().startsWith('{'));
  return {
    text: assistantText(lines),
    usage: sumStreamUsage(lines),
    ms: Date.now() - started,
    error: res.status !== 0 ? (res.stderr || '').slice(0, 400) : null,
  };
}

function buildVisualPrompt(skillText, scenario) {
  return `Voce e um agente de engenharia seguindo a skill abaixo, que ja esta carregada.
Siga-a exatamente como faria numa sessao real.

<SKILL name="brainstorming">
${skillText}
</SKILL>

${PROJECT_CONTEXT}

Seu parceiro humano acaba de escrever:

"${scenario}"

Produza AGORA a proxima mensagem que voce enviaria a ele, e apenas ela.
Nao implemente nada e nao escreva codigo.`;
}

function buildExecutionPrompt(skillText, planText, planPath) {
  return `Voce e um agente de engenharia seguindo a skill abaixo, que ja esta carregada.
Siga-a exatamente como faria numa sessao real.

<SKILL name="writing-plans">
${skillText}
</SKILL>

${PROJECT_CONTEXT}

Voce acabou de escrever o plano abaixo e ja concluiu o self-review dele. O plano
esta salvo em \`${planPath}\`.

<PLANO>
${planText}
</PLANO>

Execute agora a etapa de Execution Handoff da skill: produza a mensagem que voce
enviaria ao seu parceiro humano neste momento, e apenas ela.`;
}

function readSkill(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function currentRef() {
  const r = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8', cwd: ROOT });
  const b = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8', cwd: ROOT });
  return `${(b.stdout || '').trim()}@${(r.stdout || '').trim()}`;
}

function runSuite(name, cfgFile, buildPrompt) {
  const cfg = JSON.parse(fs.readFileSync(path.join(HERE, cfgFile), 'utf8'));
  const skillText = readSkill(cfg.skill);
  const cases = ONLY ? cfg.cases.filter((c) => c.id === ONLY) : cfg.cases;
  const runs = [];
  let n = 0;
  const total = cases.length * REPS;
  for (const c of cases) {
    for (let rep = 1; rep <= REPS; rep++) {
      n += 1;
      process.stderr.write(`  [${name}] ${n}/${total} ${c.id} rep${rep} ... `);
      const prompt = buildPrompt(skillText, c);
      const r = runClaude(prompt);
      process.stderr.write(r.error ? `ERRO (${r.ms}ms)\n` : `ok (${r.ms}ms, ${r.usage.total} tok)\n`);
      runs.push({ caseId: c.id, rep, ...c, text: r.text, usage: r.usage, ms: r.ms, error: r.error });
    }
  }
  return { suite: name, skill: cfg.skill, runs };
}

function main() {
  fs.mkdirSync(RESULTS, { recursive: true });
  const ref = currentRef();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const suites = [];

  if (SUITE === 'visual' || SUITE === 'both') {
    suites.push(runSuite('visual-companion', 'cases-visual-companion.json',
      (skill, c) => buildVisualPrompt(skill, c.prompt)));
  }
  if (SUITE === 'execution' || SUITE === 'both') {
    suites.push(runSuite('execution-choice', 'cases-execution-choice.json', (skill, c) => {
      const planPath = `docs/superpowers-prepared/plans/${c.fixture}`;
      const planText = fs.readFileSync(path.join(HERE, 'fixtures', 'plans', c.fixture), 'utf8');
      return buildExecutionPrompt(skill, planText, planPath);
    }));
  }

  const out = { ref, label: LABEL, model: MODEL || '(default)', reps: REPS, at: new Date().toISOString(), suites };
  const file = path.join(RESULTS, `${stamp}_${ref.replace(/[^\w.-]/g, '-')}${LABEL ? '_' + LABEL : ''}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(file);
}

main();
