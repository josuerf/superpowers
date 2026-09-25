#!/usr/bin/env node
/**
 * Eval nivel 1 — decisao.
 *
 * Mede as duas decisoes que as skills tomam, sem executar trabalho real:
 *   1. brainstorming oferece o visual companion quando a demanda tem superficie visual?
 *   2. writing-plans escolhe inline ou subagentes no handoff, e justifica?
 *   3. (--suite business) o carrasco reencontra achados business-rule reais
 *      no diff do MR? Fora de "both": cada caso e uma revisao inteira.
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
 *   node tools/skill-evals/run.js --suite visual|execution|both|business [--reps N]
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

function runClaude(prompt, extraArgs = ['--max-turns', '4']) {
  // O prompt carrega a SKILL.md inteira e estoura o limite de linha de comando
  // do Windows (~8k). Entregar por stdin evita isso e dispensa escaping.
  const args = ['-p', '--output-format', 'stream-json', '--verbose', ...extraArgs];
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

function runSuite(name, cfgFile, buildPrompt, checkpoint) {
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
      // Grava a cada execucao: uma suite completa leva dezenas de minutos e ja
      // foi perdida inteira por uma interrupcao. Parcial pontua normalmente —
      // score.js divide pelo que existe, nao pelo que era esperado.
      checkpoint({ suite: name, skill: cfg.skill, runs });
    }
  }
  return { suite: name, skill: cfg.skill, runs };
}

/**
 * Suite business-rule: o prompt do carrasco montado pelo proprio harness
 * (build-review-prompt.ts) sobre o diff real do MR. Sem ferramentas: o
 * revisor ve so o diff, porque o repositorio daquele MR nao esta aqui.
 * Casos que compartilham fixture (mesmo MR) reaproveitam a mesma resposta
 * na mesma repeticao — e a mesma revisao, pontuada contra achados diferentes.
 */
function runBusinessRule(checkpoint) {
  const cfgFile = 'cases-business-rule-reviewer.json';
  const cfg = JSON.parse(fs.readFileSync(path.join(HERE, cfgFile), 'utf8'));
  const cases = (ONLY ? cfg.cases.filter((c) => c.id === ONLY) : cfg.cases).filter((c) => c.fixture);
  const runs = [];
  const cache = new Map();
  const total = cases.length * REPS;
  let n = 0;
  for (const c of cases) {
    for (let rep = 1; rep <= REPS; rep++) {
      n += 1;
      const key = `${c.fixture}#${rep}`;
      process.stderr.write(`  [business-rule] ${n}/${total} ${c.id} rep${rep} ... `);
      let r = cache.get(key);
      if (r) {
        process.stderr.write('reaproveitado\n');
        runs.push({ caseId: c.id, rep, ...c, text: r.text, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }, ms: 0, error: r.error, sharedWith: r.caseId });
        checkpoint({ suite: 'business-rule', skill: cfg.skill, runs });
        continue;
      }
      const built = spawnSync('npx', ['tsx', path.join(HERE, 'build-review-prompt.ts'), path.join(HERE, 'fixtures', c.fixture), c.expected.file], {
        encoding: 'utf8', cwd: ROOT, shell: process.platform === 'win32', maxBuffer: 64 * 1024 * 1024,
      });
      if (built.status !== 0) throw new Error(`build-review-prompt falhou em ${c.id}: ${built.stderr}`);
      const { prompt, chunkId, chunks } = JSON.parse(built.stdout);
      r = { ...runClaude(prompt, ['--max-turns', '2', '--tools', '']), caseId: c.id };
      cache.set(key, r);
      process.stderr.write(r.error ? `ERRO (${r.ms}ms)\n` : `ok (${r.ms}ms, ${r.usage.total} tok)\n`);
      runs.push({ caseId: c.id, rep, ...c, chunkId, chunks, text: r.text, usage: r.usage, ms: r.ms, error: r.error });
      checkpoint({ suite: 'business-rule', skill: cfg.skill, runs });
    }
  }
  return { suite: 'business-rule', skill: cfg.skill, runs };
}

function main() {
  fs.mkdirSync(RESULTS, { recursive: true });
  const ref = currentRef();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(RESULTS, `${stamp}_${ref.replace(/[^\w.-]/g, '-')}${LABEL ? '_' + LABEL : ''}.json`);
  const suites = [];

  const flush = (partial) => {
    const done = partial ? [...suites, partial] : suites;
    fs.writeFileSync(file, JSON.stringify(
      { ref, label: LABEL, model: MODEL || '(default)', reps: REPS, at: new Date().toISOString(), partial: !!partial, suites: done },
      null, 2,
    ));
  };

  if (SUITE === 'visual' || SUITE === 'both') {
    suites.push(runSuite('visual-companion', 'cases-visual-companion.json',
      (skill, c) => buildVisualPrompt(skill, c.prompt), flush));
  }
  if (SUITE === 'execution' || SUITE === 'both') {
    suites.push(runSuite('execution-choice', 'cases-execution-choice.json', (skill, c) => {
      const planPath = `docs/superpowers-prepared/plans/${c.fixture}`;
      const planText = fs.readFileSync(path.join(HERE, 'fixtures', 'plans', c.fixture), 'utf8');
      return buildExecutionPrompt(skill, planText, planPath);
    }, flush));
  }

  if (SUITE === 'business') {
    suites.push(runBusinessRule(flush));
  }

  flush(null);
  console.log(file);
}

main();
