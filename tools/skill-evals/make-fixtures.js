#!/usr/bin/env node
/**
 * Gera os planos sinteticos usados por cases-execution-choice.json.
 *
 * Os planos precisam ser realistas o bastante para o agente contar tarefas e
 * fases e julgar acoplamento e tamanho de diff — e nada alem disso. Manter a
 * geracao em codigo (em vez de 6 markdowns escritos a mao) e o que garante que
 * a unica diferenca entre dois fixtures seja a variavel sob teste.
 */
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'fixtures', 'plans');

const header = (goal, arch) => `# ${goal} Implementation Plan

**Goal:** ${goal}
**Architecture:** ${arch}
**Tech Stack:** TypeScript, Node, Postgres, Jest

## Global Constraints

- Node 20+
- Todos os endpoints exigem autenticacao por token
- Cobertura minima de 80% nos modulos tocados

---
`;

const task = (n, name, files, consumes, produces) => `### Task ${n}: ${name}

**Files:**
${files.map((f) => `- Modify: \`${f}\``).join('\n')}
- Test: \`tests/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.test.ts\`

**Interfaces:**
- Consumes: ${consumes}
- Produces: ${produces}

**Steps:**

- [ ] **Step 1: Write failing test**

\`\`\`ts
it('${name}', () => { expect(run()).toBe(true); });
\`\`\`

- [ ] **Step 2: Run test to verify it fails**

Run: \`npx jest tests/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}\`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

\`\`\`ts
export function run() { return true; }
\`\`\`

- [ ] **Step 4: Run test to verify it passes**

Run: \`npx jest tests/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}\`
Expected: PASS

- [ ] **Step 5: Commit**

\`\`\`bash
git add -A && git commit -m "feat: ${name}"
\`\`\`
`;

const phase = (p, name, depends, cohesion) => `## Phase ${p}: ${name}

**Depends on:** ${depends}
**Cohesion:** ${cohesion}
`;

function build({ file, goal, arch, phases }) {
  let out = header(goal, arch);
  let n = 0;
  for (const ph of phases) {
    if (ph.name) out += `\n${phase(ph.index, ph.name, ph.depends, ph.cohesion)}\n`;
    for (const t of ph.tasks) {
      n += 1;
      out += `\n${task(n, t.name, t.files, t.consumes, t.produces)}\n`;
    }
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, file), out);
  const phaseCount = phases.filter((p) => p.name).length;
  console.log(`${file}: ${n} tarefas, ${phaseCount || 0} fases`);
}

const f = (...names) => names.map((x) => `src/${x}.ts`);
const INDEP = 'nada de tarefas anteriores';

// --- 3 tarefas, 1 fase (default: inline) ---
build({
  file: 'plan-03-1fase.md',
  goal: 'Exportacao de relatorio de contratos',
  arch: 'Um endpoint novo no modulo de contratos, reusando o servico de consulta existente.',
  phases: [{
    tasks: [
      { name: 'Consulta de contratos por periodo', files: f('contracts/query'), consumes: INDEP, produces: '`queryByPeriod(from, to): Contract[]`' },
      { name: 'Serializacao CSV', files: f('contracts/csv'), consumes: '`queryByPeriod`', produces: '`toCsv(rows): string`' },
      { name: 'Endpoint de exportacao', files: f('contracts/routes'), consumes: '`toCsv`', produces: 'rota GET /contracts/export' },
    ],
  }],
});

// --- 6 tarefas, 1 fase (default: inline, no limite) ---
build({
  file: 'plan-06-1fase.md',
  goal: 'Autenticacao por token de servico',
  arch: 'Middleware novo de autenticacao no gateway, com emissao e revogacao de tokens.',
  phases: [{
    tasks: [
      { name: 'Modelo de token', files: f('auth/model'), consumes: INDEP, produces: '`ServiceToken`' },
      { name: 'Emissao de token', files: f('auth/issue'), consumes: '`ServiceToken`', produces: '`issue(scope): string`' },
      { name: 'Validacao de token', files: f('auth/verify'), consumes: '`ServiceToken`', produces: '`verify(raw): Claims`' },
      { name: 'Middleware de autenticacao', files: f('gateway/middleware'), consumes: '`verify`', produces: 'middleware `requireToken`' },
      { name: 'Revogacao de token', files: f('auth/revoke'), consumes: '`ServiceToken`', produces: '`revoke(id): void`' },
      { name: 'Endpoint administrativo de tokens', files: f('auth/routes'), consumes: '`issue`, `revoke`', produces: 'rotas /admin/tokens' },
    ],
  }],
});

// --- 10 tarefas, 3 fases (default: subagentes) ---
build({
  file: 'plan-10-3fases.md',
  goal: 'Modulo de conciliacao bancaria',
  arch: 'Tres camadas independentes: ingestao de extratos, motor de conciliacao e relatorios.',
  phases: [
    {
      index: 1, name: 'Ingestao de extratos', depends: 'none',
      cohesion: 'tudo que le e normaliza arquivos de banco, sem depender do motor',
      tasks: [
        { name: 'Parser OFX', files: f('ingest/ofx'), consumes: INDEP, produces: '`parseOfx(buf): Entry[]`' },
        { name: 'Parser CNAB', files: f('ingest/cnab'), consumes: INDEP, produces: '`parseCnab(buf): Entry[]`' },
        { name: 'Normalizacao de lancamentos', files: f('ingest/normalize'), consumes: '`Entry`', produces: '`normalize(e): NormalEntry`' },
        { name: 'Deteccao de duplicidade na ingestao', files: f('ingest/dedupe'), consumes: '`NormalEntry`', produces: '`dedupe(list): NormalEntry[]`' },
      ],
    },
    {
      index: 2, name: 'Motor de conciliacao', depends: 'Phase 1',
      cohesion: 'as regras de casamento, todas sobre NormalEntry',
      tasks: [
        { name: 'Casamento exato por valor e data', files: f('match/exact'), consumes: '`NormalEntry`', produces: '`matchExact(a, b): Match[]`' },
        { name: 'Casamento aproximado por janela', files: f('match/fuzzy'), consumes: '`NormalEntry`', produces: '`matchFuzzy(a, b, days): Match[]`' },
        { name: 'Resolucao de conflitos entre casamentos', files: f('match/resolve'), consumes: '`Match`', produces: '`resolve(ms): Match[]`' },
      ],
    },
    {
      index: 3, name: 'Relatorios', depends: 'Phase 2',
      cohesion: 'saidas para o usuario final, todas leem Match',
      tasks: [
        { name: 'Relatorio de pendencias', files: f('report/pending'), consumes: '`Match`', produces: '`pendingReport(): Row[]`' },
        { name: 'Relatorio de divergencias', files: f('report/diff'), consumes: '`Match`', produces: '`diffReport(): Row[]`' },
        { name: 'Exportacao dos relatorios', files: f('report/export'), consumes: '`Row`', produces: 'rota GET /reconcile/report' },
      ],
    },
  ],
});

// --- 18 tarefas, 3 fases (default: subagentes, plano longo) ---
build({
  file: 'plan-18-3fases.md',
  goal: 'Portal de autoatendimento do contribuinte',
  arch: 'Tres modulos independentes: cadastro, debitos e emissao de guias.',
  phases: [
    {
      index: 1, name: 'Cadastro', depends: 'none', cohesion: 'dados cadastrais do contribuinte',
      tasks: Array.from({ length: 6 }, (_, i) => ({
        name: `Cadastro parte ${i + 1}`, files: f(`cadastro/part${i + 1}`),
        consumes: i === 0 ? INDEP : `\`cadastroPart${i}\``, produces: `\`cadastroPart${i + 1}()\``,
      })),
    },
    {
      index: 2, name: 'Debitos', depends: 'none', cohesion: 'consulta e composicao de debitos',
      tasks: Array.from({ length: 6 }, (_, i) => ({
        name: `Debitos parte ${i + 1}`, files: f(`debitos/part${i + 1}`),
        consumes: i === 0 ? INDEP : `\`debitosPart${i}\``, produces: `\`debitosPart${i + 1}()\``,
      })),
    },
    {
      index: 3, name: 'Guias', depends: 'Phase 2', cohesion: 'emissao e baixa de guias',
      tasks: Array.from({ length: 6 }, (_, i) => ({
        name: `Guias parte ${i + 1}`, files: f(`guias/part${i + 1}`),
        consumes: i === 0 ? '`debitosPart6`' : `\`guiasPart${i}\``, produces: `\`guiasPart${i + 1}()\``,
      })),
    },
  ],
});

// --- 5 tarefas, diff enorme (default seria inline; razao para desviar) ---
build({
  file: 'plan-05-diff-grande.md',
  goal: 'Troca da biblioteca de acesso a dados',
  arch: 'Substituicao do ORM em todo o projeto. Poucas tarefas, cada uma varrendo dezenas de arquivos.',
  phases: [{
    tasks: [
      { name: 'Trocar a camada de repositorios', files: Array.from({ length: 11 }, (_, i) => `src/repo/r${i + 1}.ts`), consumes: INDEP, produces: 'repositorios no novo ORM' },
      { name: 'Trocar os mapeamentos de entidade', files: Array.from({ length: 9 }, (_, i) => `src/entity/e${i + 1}.ts`), consumes: 'repositorios', produces: 'entidades no novo ORM' },
      { name: 'Ajustar as transacoes nos servicos', files: Array.from({ length: 10 }, (_, i) => `src/service/s${i + 1}.ts`), consumes: 'entidades', produces: 'servicos transacionais' },
      { name: 'Atualizar as consultas dos relatorios', files: Array.from({ length: 8 }, (_, i) => `src/report/rep${i + 1}.ts`), consumes: 'entidades', produces: 'relatorios migrados' },
      { name: 'Remover o ORM antigo e suas configuracoes', files: ['src/db/legacy.ts', 'src/db/config.ts', 'package.json'], consumes: 'tudo acima', produces: 'projeto sem o ORM antigo' },
    ],
  }],
});

// --- 12 tarefas fortemente acopladas (default seria subagente; razao para desviar) ---
build({
  file: 'plan-12-acoplado.md',
  goal: 'Motor de calculo tributario',
  arch: 'Uma unica cadeia de calculo: cada etapa consome a estrutura produzida pela anterior e devolve a mesma estrutura enriquecida. As assinaturas mudam ao longo do plano.',
  phases: [{
    tasks: Array.from({ length: 12 }, (_, i) => ({
      name: `Etapa ${i + 1} da cadeia de calculo`,
      files: f('tax/pipeline'),
      consumes: i === 0 ? '`Lancamento`' : `\`TaxContext\` com os campos acrescentados ate a etapa ${i}`,
      produces: `\`TaxContext\` acrescido de \`campoEtapa${i + 1}\` (a assinatura de \`apply()\` muda nesta etapa)`,
    })),
  }],
});

console.log(`\nfixtures em ${OUT}`);
