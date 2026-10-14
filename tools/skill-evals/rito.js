/**
 * Suite modo-rito (card C123): as skills brainstorming, writing-plans e
 * subagent-driven-development com e sem o marcador `@@RITO:`.
 *
 * Diferente das outras suites, esta precisa observar o que a sessao FEZ no
 * repositorio: arquivo gravado no destino, commit, branch. Cada caso roda num
 * repositorio git temporario montado aqui a partir de `fixtures/rito/<repo>`
 * (commit inicial; e um commit de topo quando o caso e uma revisao de onda), com
 * ferramentas de escrita liberadas. Depois da sessao, o estado do repositorio vai
 * para `observed`, que rito-checks.js pontua. O repositorio e apagado em seguida.
 *
 * Modos de caso:
 *   rito-request  o pedido do forge (C-10 a C-14) primeiro e a skill carregada
 *                 depois, como a ferramenta Skill entrega, com a pasta da skill
 *                 legivel por --add-dir (e la que mora o rito.md)
 *   chat          a skill e uma fala do parceiro humano, sem marcador
 *   handoff       o Execution Handoff de writing-plans com um plano pronto
 *   implementer   o prompt do implementador preenchido, em dois turnos: o
 *                 primeiro e o readback, o segundo (--resume) manda seguir
 *
 * A ferramenta Skill nunca e liberada: chamada nela carregaria a versao do
 * plugin instalada na maquina, nao o ref em teste.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const WRITE_TOOLS = ['Read', 'Grep', 'Glob', 'Write', 'Edit', 'Bash'];
const READ_TOOLS = ['Read', 'Grep', 'Glob', 'Bash(git log:*)', 'Bash(git status:*)', 'Bash(ls:*)'];
// Sessao de revisao da onda (C-16): sem Bash nem Edit; le o diff que o forge grava.
const REVIEW_TOOLS = ['Read', 'Grep', 'Glob', 'Write'];
const TOOLS = { write: WRITE_TOOLS, read: READ_TOOLS, review: REVIEW_TOOLS };
const SESSION_TIMEOUT_MS = 25 * 60 * 1000;
// Toda sessao da suite roda como a sessao de etapa do forge: com a variavel que cala
// a escrita dos hooks na pasta corrente (contrato C-35 da fase 22).
const RITO_ENV = { SUPERPOWERS_PREPARED_RITO: '1' };
const HOOKS_SILENCED_SINCE = [7, 0, 1];

const olderThan = (v, ref) => {
  const p = String(v).split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) if ((p[i] || 0) !== ref[i]) return (p[i] || 0) < ref[i];
  return false;
};

/**
 * A sessao carrega o plugin INSTALADO na maquina, nao o desta worktree. Antes da
 * 7.0.1 os hooks dele ignoram SUPERPOWERS_PREPARED_RITO e gravam .harness.config.json
 * e .gitignore na pasta da sessao. true quando alguma instalacao que vale para `dir`
 * (escopo user, ou projeto/local que contem `dir`) e anterior, ou quando nao da para
 * saber; rito-checks.js so tolera esses dois arquivos novos nesse caso.
 */
function installedHooksWriteInTree(dir) {
  try {
    const file = path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const entries = (data.plugins || data)['superpowers-prepared@superpowers-prepared'] || [];
    const norm = (p) => String(p).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    const here = norm(fs.realpathSync.native(dir));
    const applies = entries.filter((e) => e.scope === 'user' || (e.projectPath && (here === norm(e.projectPath) || here.startsWith(norm(e.projectPath) + '/'))));
    return applies.length === 0 ? false : applies.some((e) => olderThan(e.version, HOOKS_SILENCED_SINCE));
  } catch (e) {
    // Sem o arquivo nao ha plugin instalado, logo nenhum hook escreve nada.
    return e && e.code === 'ENOENT' ? false : true;
  }
}

function git(dir, args, { raw = false } = {}) {
  const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${(r.stderr || '').slice(0, 300)}`);
  // raw: o git status --porcelain comeca a linha com espaco (" M arquivo"); trim()
  // comeria o da primeira linha e a faria parecer staged.
  return raw ? (r.stdout || '') : (r.stdout || '').trim();
}

function commitAll(dir, msg) {
  git(dir, ['add', '-A']);
  git(dir, ['-c', 'user.name=skill-evals', '-c', 'user.email=skill-evals@example.invalid', 'commit', '-q', '--no-verify', '-m', msg]);
  return git(dir, ['rev-parse', 'HEAD']);
}

function fillTemplate(text, map) {
  return Object.entries(map).reduce((t, [k, v]) => t.split(k).join(v), text);
}

/** Monta o repositorio do caso. Devolve o diretorio e os shas de base e topo. */
function prepareRepo(ctx, c) {
  const { HERE, ROOT, BASH } = ctx;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `skill-evals-rito-${c.id}-`));
  const fx = path.join(HERE, 'fixtures', 'rito');
  fs.cpSync(path.join(fx, c.repo), dir, { recursive: true });
  for (const [dest, src] of Object.entries(c.files || {})) {
    fs.mkdirSync(path.dirname(path.join(dir, dest)), { recursive: true });
    fs.copyFileSync(path.join(fx, src), path.join(dir, dest));
  }
  if (c.mode === 'implementer') {
    const tb = path.join(ROOT, 'skills', 'subagent-driven-development', 'scripts', 'task-brief');
    const r = spawnSync(BASH, [tb, 'plan.md', c.tasks || '1', 'brief.md'], { cwd: dir, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`task-brief falhou: ${r.stderr || r.error}`);
  }
  git(dir, ['init', '-q', '-b', 'main']);
  const base = commitAll(dir, 'base');
  let topo = base;
  if (c.topo) {
    fs.cpSync(path.join(fx, c.topo), dir, { recursive: true });
    topo = commitAll(dir, 'topo');
  }
  if (c.diff) {
    // C-16: o forge grava o diff da onda para a sessao de revisao, que nao tem Bash.
    // Fica fora do git status, como no Produto (.superpowers/ nao e versionado).
    const diff = git(dir, ['diff', '-U10', base, topo], { raw: true });
    fs.mkdirSync(path.dirname(path.join(dir, c.diff)), { recursive: true });
    fs.writeFileSync(path.join(dir, c.diff), diff);
    fs.appendFileSync(path.join(dir, '.git', 'info', 'exclude'), '\n.superpowers/\n');
  }
  const commits = parseInt(git(dir, ['rev-list', '--count', 'HEAD']), 10);
  return { dir, base, topo, commits };
}

function skillBlock(ctx, skillRel) {
  const file = path.join(ctx.ROOT, skillRel);
  const name = path.basename(path.dirname(file));
  return `<skill name="${name}" carregada-pela="ferramenta Skill">
Base directory for this skill: ${path.dirname(file)}

${fs.readFileSync(file, 'utf8')}
</skill>`;
}

function buildPrompt(ctx, c, repo) {
  const fill = (s) => fillTemplate(s, { '{{BASE}}': repo.base, '{{TOPO}}': repo.topo });
  if (c.mode === 'rito-request') {
    return `${fill(c.request.join('\n'))}\n\n${skillBlock(ctx, c.skill)}`;
  }
  if (c.mode === 'chat') {
    return `${skillBlock(ctx, c.skill)}

O repositorio do projeto e o diretorio atual. Seu parceiro humano acaba de
escrever:

"${c.prompt}"

Responda a ele como faria numa sessao real, seguindo a skill acima.`;
  }
  if (c.mode === 'handoff') {
    const planText = fs.readFileSync(path.join(ctx.HERE, 'fixtures', 'plans', c.fixture), 'utf8');
    const skill = fs.readFileSync(path.join(ctx.ROOT, c.skill), 'utf8');
    return ctx.buildExecutionPrompt(skill, planText, `docs/superpowers-prepared/plans/${c.fixture}`);
  }
  if (c.mode === 'implementer') {
    const tpl = fs.readFileSync(path.join(ctx.ROOT, c.skill), 'utf8');
    const dispatch = fillTemplate(tpl, {
      '[BRIEF_FILE]': 'brief.md', '[REPORT_FILE]': 'report.md', '[directory]': 'o diretorio atual',
      '[SUGGESTED_SKILLS — optional. Name the project or\n    implementation-support skills that match this task\'s work, or write\n    "none". A named suggestion saves the subagent a discovery step.]': 'none',
    });
    return `Voce e o subagente implementador. O controlador te despachou com o prompt
abaixo (o template ja preenchido). O brief esta em \`brief.md\`, no diretorio
atual, que e o repositorio. Siga o prompt exatamente como faria numa sessao real.

<DISPATCH>
${dispatch}
</DISPATCH>`;
  }
  throw new Error(`modo desconhecido: ${c.mode}`);
}

function observe(dir, c, repo) {
  const out = { files: {}, hookNoiseExpected: installedHooksWriteInTree(dir) };
  try {
    out.newCommits = parseInt(git(dir, ['rev-list', '--count', '--all']), 10) - repo.commits;
    out.status = git(dir, ['status', '--porcelain', '--untracked-files=all'], { raw: true })
      .split('\n').map((l) => l.replace(/\r$/, '')).filter(Boolean);
    out.branches = git(dir, ['branch', '--format=%(refname:short)']).split('\n').filter(Boolean);
    out.worktrees = git(dir, ['worktree', 'list', '--porcelain']).split('\n').filter((l) => l.startsWith('worktree ')).length;
    out.head = git(dir, ['rev-parse', 'HEAD']);
    out.topo = repo.topo;
    out.tags = git(dir, ['tag', '--list']).split('\n').filter(Boolean).length;
    // Conteudo dos arquivos que o hook antigo cria: rito-checks so os tolera se forem
    // exatamente o que o hook escreve.
    out.hookFiles = {};
    for (const f of ['.gitignore', '.harness.config.json']) {
      const p = path.join(dir, f);
      if (out.status.includes(`?? ${f}`) && fs.existsSync(p)) out.hookFiles[f] = fs.readFileSync(p, 'utf8');
    }
  } catch (e) {
    out.error = String(e.message || e).slice(0, 300);
  }
  if (c.verify) {
    const v = spawnSync(c.verify[0], c.verify.slice(1), { cwd: dir, encoding: 'utf8', timeout: 120000 });
    out.verifyStatus = v.status;
    out.verifyTail = `${v.stdout || ''}${v.stderr || ''}`.split('\n')
      .filter((l) => /^\S* ?(tests|pass|fail) \d+/.test(l.trim())).join(' | ');
  }
  for (const f of c.observeFiles || []) {
    const p = path.join(dir, f);
    out.files[f] = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
  }
  return out;
}

function runRitoSuite(ctx, checkpoint) {
  const cfg = JSON.parse(fs.readFileSync(path.join(ctx.HERE, 'cases-modo-rito.json'), 'utf8'));
  const cases = ctx.ONLY ? cfg.cases.filter((c) => c.id === ctx.ONLY) : cfg.cases;
  const runs = [];
  const total = cases.length * ctx.REPS;
  let n = 0;
  for (const c of cases) {
    for (let rep = 1; rep <= ctx.REPS; rep++) {
      n += 1;
      process.stderr.write(`  [modo-rito] ${n}/${total} ${c.id} rep${rep} ... `);
      let r;
      let observed = null;
      let repo = null;
      try {
        repo = prepareRepo(ctx, c);
        const prompt = buildPrompt(ctx, c, repo);
        const skillDir = path.dirname(path.join(ctx.ROOT, c.skill));
        const opts = {
          cwd: repo.dir,
          maxTurns: c.maxTurns || cfg.maxTurns,
          allowedTools: TOOLS[c.tools] || READ_TOOLS,
          strictMcp: true,
          extraArgs: ['--add-dir', skillDir],
          timeout: SESSION_TIMEOUT_MS,
          env: RITO_ENV,
        };
        r = ctx.runClaude(prompt, opts);
        if (c.turn2 && !r.error && r.sessionId) {
          const r2 = ctx.runClaude(c.turn2, { ...opts, extraArgs: [...opts.extraArgs, '--resume', r.sessionId] });
          const usage = {};
          for (const k of Object.keys(r.usage)) usage[k] = r.usage[k] + (r2.usage[k] || 0);
          r = {
            text: `${r.text}\n\n---\n\n${r2.text}`, finalText: r2.finalText, firstText: r.text,
            tools: [...r.tools, ...r2.tools], firstTools: r.tools,
            timeline: [...(r.timeline || []), ...(r2.timeline || [])],
            usage, ms: r.ms + r2.ms, error: r2.error, sessionId: r.sessionId,
          };
        }
        if (!ctx.DRY) observed = observe(repo.dir, c, repo);
      } catch (e) {
        r = { text: '', finalText: '', tools: [], usage: { total: 0 }, ms: 0, error: String(e.message || e).slice(0, 400) };
      } finally {
        if (repo) fs.rmSync(repo.dir, { recursive: true, force: true });
      }
      process.stderr.write(r.error ? `ERRO (${r.ms}ms)\n` : `ok (${r.ms}ms, ${r.usage.total} tok)\n`);
      runs.push({
        caseId: c.id, rep, ...c, text: r.text, finalText: r.finalText, firstText: r.firstText,
        tools: r.tools, firstTools: r.firstTools, timeline: r.timeline, observed, usage: r.usage, ms: r.ms, error: r.error,
      });
      checkpoint({ suite: 'modo-rito', skill: 'varias', kind: 'checks', runs });
    }
  }
  return { suite: 'modo-rito', skill: 'varias', kind: 'checks', runs };
}

module.exports = { runRitoSuite, prepareRepo, buildPrompt, observe };
