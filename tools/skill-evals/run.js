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
 *   node tools/skill-evals/run.js --suite visual|execution|both|blast|readback|risk|all [--reps N]
 *                                 [--model NOME] [--label TEXTO] [--case ID]
 */
const fs = require('fs');
const os = require('os');
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

/** Chamadas de ferramenta do stream, na ordem — o que a execucao FEZ, nao o que disse. */
function toolUses(lines) {
  const out = [];
  for (const line of lines) {
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    if (ev.type === 'assistant' && ev.message?.content) {
      for (const part of ev.message.content) {
        if (part.type === 'tool_use') {
          const input = {};
          for (const [k, v] of Object.entries(part.input || {})) input[k] = String(v).slice(0, 200);
          out.push({ name: part.name, input });
        }
      }
    }
  }
  return out;
}

function runClaude(prompt, opts = {}) {
  // O prompt carrega a SKILL.md inteira e estoura o limite de linha de comando
  // do Windows (~8k). Entregar por stdin evita isso e dispensa escaping.
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--max-turns', String(opts.maxTurns || 4)];
  if (MODEL) args.push('--model', MODEL);
  // Suites por caso: ferramentas de leitura liberadas, sem MCP da maquina — um
  // servidor instalado aqui mudaria o que o caso mede de uma maquina para outra.
  if (opts.allowedTools) args.push('--allowedTools', opts.allowedTools.join(','));
  if (opts.strictMcp) args.push('--strict-mcp-config');
  const started = Date.now();
  const res = spawnSync('claude', args, {
    encoding: 'utf8',
    cwd: opts.cwd || ROOT,
    input: prompt,
    maxBuffer: 64 * 1024 * 1024,
  });
  const lines = (res.stdout || '').split('\n').filter((l) => l.trim().startsWith('{'));
  return {
    text: assistantText(lines),
    tools: toolUses(lines),
    usage: sumStreamUsage(lines),
    ms: Date.now() - started,
    error: res.status !== 0 ? (res.stderr || res.stdout || '').slice(0, 400) : null,
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

// --- suites por caso (blast-radius, readback, risk-flags) --------------------
// Cada caso roda num diretorio temporario FORA do repositorio: o CLAUDE.md do
// plugin nao entra no contexto, e o que o modelo encontra ao pesquisar e so o
// fixture. Os checks de cada caso (checks.js) pontuam em score.js.

const BASH = process.env.SKILL_EVALS_BASH || 'bash';
const READ_TOOLS = ['Read', 'Grep', 'Glob', 'Bash(grep:*)', 'Bash(rg:*)', 'Bash(git grep:*)', 'Bash(find:*)', 'Bash(ls:*)'];

function tempCase(caseId, repo) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `skill-evals-${caseId}-`));
  if (repo) fs.cpSync(path.join(HERE, 'fixtures', 'repos', repo), dir, { recursive: true });
  return dir;
}

function buildPlanFromSpecPrompt(skillText, specText, brief) {
  const ask = brief === 'flags'
    ? `O codigo nao esta disponivel nesta sessao: planeje a partir do spec. Traga
apenas as tarefas, e de cada tarefa so o titulo e as linhas de metadados em
negrito que o template de tarefa da skill pede (as linhas \`**X:**\`). Omita os
passos, o codigo e as secoes do cabecalho.`
    : `O repositorio do projeto e o diretorio atual; voce pode le-lo e pesquisa-lo.
Traga o cabecalho do plano e TODAS as secoes que a skill exige antes das
tarefas, completas. Das tarefas, traga so o titulo e as linhas de metadados em
negrito que o template de tarefa pede (as linhas \`**X:**\`) — omita os passos
e o codigo.`;
  return `Voce e um agente de engenharia seguindo a skill abaixo, que ja esta carregada.
Siga-a exatamente como faria numa sessao real.

<SKILL name="writing-plans">
${skillText}
</SKILL>

O design foi aprovado pelo seu parceiro humano. O spec esta em \`docs/spec.md\`:

<SPEC>
${specText}
</SPEC>

Escreva AGORA o plano de implementacao deste spec, na sua resposta — nao grave
arquivo nenhum. ${ask}
Nao faca o Execution Handoff.`;
}

function fillTemplate(text, map) {
  return Object.entries(map).reduce((t, [k, v]) => t.split(k).join(v), text);
}

function buildCheckPrompt(mode, skillText, c, dir) {
  if (mode === 'plan-from-spec') {
    const spec = fs.readFileSync(path.join(HERE, 'fixtures', 'specs', c.fixture), 'utf8');
    fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'docs', 'spec.md'), spec);
    return buildPlanFromSpecPrompt(skillText, spec, c.brief);
  }
  if (mode === 'implementer-readback') {
    // O brief sai do task-brief DO REF EM TESTE: e o que muda entre antes e depois.
    fs.copyFileSync(path.join(HERE, 'fixtures', 'readback', c.fixture), path.join(dir, 'plan.md'));
    const tb = path.join(ROOT, 'skills', 'subagent-driven-development', 'scripts', 'task-brief');
    const r = spawnSync(BASH, [tb, 'plan.md', c.tasks || '1', 'brief.md'], { cwd: dir, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`task-brief falhou: ${r.stderr || r.error}`);
    const dispatch = fillTemplate(skillText, {
      '[BRIEF_FILE]': 'brief.md', '[REPORT_FILE]': 'report.md', '[directory]': 'o diretorio atual',
      '[SUGGESTED_SKILLS — optional. Name the project or\n    implementation-support skills that match this task\'s work, or write\n    "none". A named suggestion saves the subagent a discovery step.]': 'none',
    });
    return `Voce e o subagente implementador. O controlador te despachou com o prompt
abaixo (o template ja preenchido). O brief esta em \`brief.md\`, no diretorio
atual. Siga o prompt exatamente como faria numa sessao real.

<DISPATCH>
${dispatch}
</DISPATCH>`;
  }
  if (mode === 'plan-review') {
    fs.copyFileSync(path.join(HERE, 'fixtures', 'readback', c.fixture), path.join(dir, 'plan.md'));
    fs.copyFileSync(path.join(HERE, 'fixtures', 'readback', c.spec), path.join(dir, 'review-spec.md'));
    const dispatch = fillTemplate(skillText, { '[PLAN_FILE_PATH]': 'plan.md', '[SPEC_FILE_PATH]': 'review-spec.md' });
    return `Voce e o subagente revisor de plano. O controlador te despachou com o
prompt abaixo (o template ja preenchido); os arquivos estao no diretorio atual.
Siga o prompt exatamente como faria numa sessao real e produza a revisao.

<DISPATCH>
${dispatch}
</DISPATCH>`;
  }
  throw new Error(`modo desconhecido: ${mode}`);
}

function runCheckSuite(name, cfgFile, checkpoint) {
  const cfg = JSON.parse(fs.readFileSync(path.join(HERE, cfgFile), 'utf8'));
  const cases = ONLY ? cfg.cases.filter((c) => c.id === ONLY) : cfg.cases;
  const runs = [];
  let n = 0;
  const total = cases.length * REPS;
  for (const c of cases) {
    const mode = c.mode || cfg.mode;
    const skillText = readSkill(c.skill || cfg.skill);
    const brief = c.brief || cfg.brief;
    for (let rep = 1; rep <= REPS; rep++) {
      n += 1;
      process.stderr.write(`  [${name}] ${n}/${total} ${c.id} rep${rep} ... `);
      const dir = tempCase(c.id, c.repo ?? cfg.repo);
      let r;
      try {
        const prompt = buildCheckPrompt(mode, skillText, { ...c, brief }, dir);
        r = runClaude(prompt, {
          cwd: dir, maxTurns: c.maxTurns || cfg.maxTurns, allowedTools: READ_TOOLS, strictMcp: true,
        });
      } catch (e) {
        r = { text: '', tools: [], usage: { total: 0 }, ms: 0, error: String(e.message || e).slice(0, 400) };
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
      process.stderr.write(r.error ? `ERRO (${r.ms}ms)\n` : `ok (${r.ms}ms, ${r.usage.total} tok)\n`);
      runs.push({ caseId: c.id, rep, ...c, mode, text: r.text, tools: r.tools, usage: r.usage, ms: r.ms, error: r.error });
      checkpoint({ suite: name, skill: cfg.skill, kind: 'checks', runs });
    }
  }
  return { suite: name, skill: cfg.skill, kind: 'checks', runs };
}

const CHECK_SUITES = {
  blast: ['blast-radius', 'cases-blast-radius.json'],
  readback: ['readback', 'cases-readback.json'],
  risk: ['risk-flags', 'cases-risk-flags.json'],
};

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

  if (SUITE === 'visual' || SUITE === 'both' || SUITE === 'all') {
    suites.push(runSuite('visual-companion', 'cases-visual-companion.json',
      (skill, c) => buildVisualPrompt(skill, c.prompt), flush));
  }
  for (const [key, [name, cfgFile]] of Object.entries(CHECK_SUITES)) {
    if (SUITE === key || SUITE === 'all') suites.push(runCheckSuite(name, cfgFile, flush));
  }
  if (SUITE === 'execution' || SUITE === 'both' || SUITE === 'all') {
    suites.push(runSuite('execution-choice', 'cases-execution-choice.json', (skill, c) => {
      const planPath = `docs/superpowers-prepared/plans/${c.fixture}`;
      const planText = fs.readFileSync(path.join(HERE, 'fixtures', 'plans', c.fixture), 'utf8');
      return buildExecutionPrompt(skill, planText, planPath);
    }, flush));
  }

  flush(null);
  console.log(file);
}

main();
