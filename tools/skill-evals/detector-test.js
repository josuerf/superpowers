#!/usr/bin/env node
/**
 * Teste dos detectores de score.js.
 *
 * Existe porque um detector silenciosamente quebrado faz o eval reportar 0%
 * ou "nao classificado" e parecer um achado sobre a skill. Rode isto sempre
 * que mexer nas regex de score.js, ANTES de confiar em qualquer numero.
 *
 * Uso: node tools/skill-evals/detector-test.js
 */
const path = require('path');
const scorePath = path.join(__dirname, 'score.js');

// score.js roda ao ser carregado; reimplementamos so as regex, mantidas em
// sincronia manualmente. Se divergirem, este teste passa e o eval mente — por
// isso as constantes abaixo sao copia literal das de score.js.
const VISUAL_TERM = /(mockup|wireframe|prot[oó]tipo|visual companion|companion visual|preview|pr[eé]-?visualiza|esbo[cç]o|tela de exemplo|maquete)/i;
const OFFER_MARK = /(quer que|gostaria|posso (montar|fazer|preparar|gerar|criar)|te mostr|lhe mostr|mostrar para voc|want me|shall i|i can put together|montar (um|uma)|prefere)/i;
const SURFACE_CHECK = /superf[ií]cie visual\s*[:\-]\s*(sim|n[aã]o|yes|no)/i;

const splitSentences = (t) => t.split(/(?<=[.!?…])\s+|\n{2,}|\n(?=[-*>#])/).filter(Boolean);

function detectOffer(text) {
  const s = splitSentences(text);
  for (let i = 0; i < s.length; i++) {
    const win = (s[i] + ' ' + (s[i + 1] || '')).trim();
    if (VISUAL_TERM.test(win) && OFFER_MARK.test(win)) return true;
  }
  return false;
}

function detectChoice(t) {
  if (!t) return null;
  let m = t.match(/(?:ready to execute with|pronto para executar com)\s*\**\s*([^*\n(]{3,40})/i);
  if (m) {
    const v = m[1].toLowerCase();
    if (/subagent|subagente/.test(v)) return 'subagent';
    if (/inline|nativ/.test(v)) return 'inline';
  }
  m = t.match(/REQUIRED SUB-SKILL[^\n]*?(subagent-driven-development|executing-plans)/i);
  if (m) return /subagent/i.test(m[1]) ? 'subagent' : 'inline';
  for (const s of splitSentences(t)) {
    if (/(recomend|recommend|sugiro|sugest|vou usar|vou executar|escolh|indicad|a op[cç][aã]o é|fica com)/i.test(s)) {
      const sub = /(subagent|subagente|batch|lote)/i.test(s);
      const inl = /(inline|nativ|executing-plans|neste?a? (mesma )?sess[aã]o)/i.test(s);
      if (sub && !inl) return 'subagent';
      if (inl && !sub) return 'inline';
    }
  }
  const bold = [...t.matchAll(/\*\*([^*\n]{3,40})\*\*/g)].map((x) => x[1].toLowerCase());
  const boldSub = bold.some((b) => /subagent|subagente/.test(b) && !/inline|nativ/.test(b));
  const boldInl = bold.some((b) => /inline|nativ/.test(b) && !/subagent|subagente/.test(b));
  if (boldSub && !boldInl) return 'subagent';
  if (boldInl && !boldSub) return 'inline';
  return null;
}

let ok = 0, bad = 0;
const check = (cond, label) => { if (cond) { ok++; console.log('  OK    ' + label); } else { bad++; console.log('  FALHA ' + label); } };

console.log('--- oferta do companion: deve DETECTAR ---');
[
  'Essa parte fica mais fácil se eu mostrar: posso montar um mockup rápido da tela para você aprovar. Quer que eu faça?',
  'Antes de detalhar, quer que eu monte um protótipo navegável das três telas?',
  'This next part might be easier if I show you — I can put together a quick mockup for you to look at. Want me to?',
  'Posso preparar um esboço da disposição dos cards no dashboard, se preferir ver antes de decidir.',
  'Gostaria de ver um wireframe da tela antes de eu escrever a spec?',
  'Uma coisa antes das perguntas. Posso montar um mockup da tela. Quer ver?',
].forEach((t) => check(detectOffer(t), t.slice(0, 62)));

console.log('--- oferta do companion: NAO deve detectar ---');
[
  'Vamos discutir o layout da tela e os campos necessários.',
  'A tela de cadastro terá validação de CNPJ.',
  'Classifiquei como arquitetural: o caminho é spec escrita e depois writing-plans.',
  'Vou seguir os padrões visuais existentes em src/components.',
  'O relatório impresso precisa de cabeçalho e totalizadores.',
  'Quer que eu comece pelo endpoint de consulta? A validação fica na camada de serviço.',
].forEach((t) => check(!detectOffer(t), t.slice(0, 62)));

console.log('--- marcador da checagem de superficie ---');
check(SURFACE_CHECK.test('**Superfície visual: sim** — cria uma tela nova.'), 'superficie: sim');
check(SURFACE_CHECK.test('Superfície visual: não (backend apenas).'), 'superficie: nao');
check(!SURFACE_CHECK.test('A superfície visual do sistema é consistente.'), 'mencao casual nao conta');

console.log('--- escolha de execucao: subagentes ---');
[
  'Ready to execute with **Subagent-Driven** (10 tasks in 3 phases).',
  'Pronto para executar com **Subagent-Driven** (10 tarefas em 3 fases).',
  '**REQUIRED SUB-SKILL:** Use superpowers-prepared:subagent-driven-development',
  'Corrigido isso, a recomendação de execução é **Subagent-Driven** (10 tarefas em 3 fases), em 3 lotes.',
  'Vou executar em lotes: três subagentes, um por fase.',
].forEach((t) => check(detectChoice(t) === 'subagent', t.slice(0, 62)));

console.log('--- escolha de execucao: inline ---');
[
  'Ready to execute with **Inline Execution** (5 tasks in 1 phase).',
  'Pronto para executar com **Inline Execution** (3 tarefas).',
  '**REQUIRED SUB-SKILL:** Use superpowers-prepared:executing-plans',
  'Minha recomendação é **Inline Execution**, porque as tarefas dividem a mesma assinatura.',
  'Escolho execução inline: o plano é curto e um contexto dá conta.',
].forEach((t) => check(detectChoice(t) === 'inline', t.slice(0, 62)));

console.log('--- escolha de execucao: nao decide ---');
[
  'Você pode responder "inline" ou "subagent" para trocar.',
  'As duas opções são **Subagent-Driven** e **Inline Execution**; qual prefere?',
].forEach((t) => check(detectChoice(t) === null, t.slice(0, 62)));

// --- suites por caso: aqui se importa o codigo real (checks.js) e os padroes
// reais dos JSON, entao nao ha copia para divergir.
const { runChecks, sliceSection, ranSearch, copiedFraction } = require('./checks');
const suiteCase = (file, id) => require(`./${file}`).cases.find((c) => c.id === id);
const passes = (file, id, text, tools = []) => {
  const c = suiteCase(file, id);
  return runChecks(c.checks, { text, tools });
};
const onlyFails = (res) => res.results.filter((r) => !r.pass).map((r) => r.id).join(',');

console.log('--- checks: recorte de secao ---');
check(sliceSection('## A\nx\n## Blast Radius\n| a | b |\n## Invariants\ny', '^#{1,6}\\s*Blast Radius', '^#{1,2}\\s') === '## Blast Radius\n| a | b |', 'secao ate o proximo ##');
check(sliceSection('nada aqui', 'Blast Radius') === null, 'secao ausente e null, nao vazia');
check(sliceSection('- **What I do NOT know:** o filtro X\n- **Stop condition:** y', 'What I do NOT know') === '- **What I do NOT know:** o filtro X', 'campo em negrito termina no proximo campo');

console.log('--- checks: busca e copia ---');
check(ranSearch([{ name: 'Grep', input: { pattern: 'x' } }]), 'Grep conta como busca');
check(ranSearch([{ name: 'Bash', input: { command: 'grep -rn foo .' } }]), 'Bash grep conta como busca');
check(!ranSearch([{ name: 'Read', input: { file_path: 'a' } }]), 'Read nao e busca');
check(ranSearch([{ name: 'Bash', input: { command: 'cd "C:/Temp/skill-evals-x" && for t in buscarPorModalidade lic_proposta status; do echo "== $t"; grep -rn "$t" .; done' } }]), 'grep dentro de for conta como busca');
check(copiedFraction('um dois tres quatro cinco seis', 'xx um dois tres quatro cinco seis yy') === 1, 'copia literal = 100%');
check(copiedFraction('um dois tres quatro cinco seis', 'seis cinco quatro tres dois um') === 0, 'reescrita = 0%');

const PLAN_OK = `# Plano

## Blast Radius

| What changes | Who | How it was verified (command) | Result | Effect |
|---|---|---|---|---|
| filtro flag_selecionado | SimAmExporter | \`grep -rn "buscarParaExportacao" .\` | 2 | passa a receber nao vencedoras |

## Invariants

- entidade (Repo.java:12)

### Task 1: Remover filtro

**Risk flags:** \`regulatory\`

**Does NOT cover:** propostas nao vencedoras deixam de ser protegidas; o SIM-AM so aceita vencedoras.
`;
console.log('--- checks: blast-radius ---');
let res = passes('cases-blast-radius.json', 'remocao-de-filtro', PLAN_OK, [{ name: 'Grep', input: {} }]);
check(res.pass, 'plano completo e busca real passam' + (res.pass ? '' : ' (' + onlyFails(res) + ')'));
res = passes('cases-blast-radius.json', 'remocao-de-filtro', PLAN_OK, []);
check(!res.pass && onlyFails(res) === 'buscou', 'mesma resposta sem busca no stream reprova so em "buscou" (teatro)');
res = passes('cases-blast-radius.json', 'teatro-negativo', '# Plano\n\n## Invariants\n- x\n', [{ name: 'Grep', input: {} }]);
check(!res.pass, 'Blast Radius omitido reprova');
res = passes('cases-blast-radius.json', 'teatro-negativo', '## Blast Radius\n\n| log | nenhum | revisado | ok | nada |\n', [{ name: 'Grep', input: {} }]);
check(!res.pass, 'linha sem comando nem contagem reprova');

console.log('--- checks: risk-flags ---');
check(passes('cases-risk-flags.json', 'trivial-none', '### Task 1: Rotulo\n\n**Risk flags:** `none`\n').pass, 'flag none passa');
check(!passes('cases-risk-flags.json', 'trivial-none', '### Task 1: Rotulo\n\n**Risk flags:** `security`\n').pass, 'flag espuria reprova');
check(!passes('cases-risk-flags.json', 'concorrencia', '**Security flag:** `none`\n').pass, 'rotulo antigo sem concurrency reprova');
check(passes('cases-risk-flags.json', 'concorrencia', '**Risk flags:** `concurrency`, `data-migration`\n').pass, 'concurrency entre outras passa');

console.log('--- checks: readback ---');
const RB = `- **Objective:** so ativas.
- **Invariants I will preserve:** a consulta segue limitada a entidade de quem esta logado; so vencedoras saem no arquivo do tribunal.
- **Siblings I read:** buscarPorEntidade.
- **What I do NOT know:** por que o filtro flag_selecionado existe na exportacao.
- **Stop condition:** teste vermelho inesperado.`;
res = passes('cases-readback.json', 'readback-emissao-fidelidade', RB);
check(res.pass, 'readback reescrito passa' + (res.pass ? '' : ' (' + onlyFails(res) + ')'));
const RB_COPY = RB.replace(/Invariants I will preserve:\*\* [^\n]*/, 'Invariants I will preserve:** Toda consulta de proposta continua restrita a entidade do usuario logado: o filtro cod_entidade que ja existe nas queries tocadas nao sai.');
res = passes('cases-readback.json', 'readback-emissao-fidelidade', RB_COPY);
check(!res.pass && onlyFails(res) === 'fidelidade-reescrita', 'invariante copiado reprova so na fidelidade');
res = passes('cases-readback.json', 'readback-emissao-fidelidade', RB, [{ name: 'Edit', input: {} }]);
check(!res.pass && onlyFails(res) === 'sem-edicao', 'edicao antes do readback reprova');
check(passes('cases-readback.json', 'readback-honestidade', RB).pass, 'lacuna citada em "O que eu NAO sei" passa');
check(passes('cases-readback.json', 'readback-honestidade', '- **O que NÃO sei:**\n  1. Por que o filtro `flag_selecionado = \'S\'` existe.\n- **Condição de parada:** x').pass, 'rotulo em portugues sem "eu" passa (achado da fumaca)');
check(!passes('cases-readback.json', 'readback-honestidade', RB.replace(/por que o filtro flag_selecionado existe na exportacao/, 'nada')).pass, 'lacuna nao citada reprova');
check(passes('cases-readback.json', 'revisor-plano-desconfirmatorio', '**Status:** Issues Found\n- Blast Radius: a linha nao tem comando nem contagem; FormulaResolver consome calcular.\n**What would prove me wrong:** um grep sem resultado.').pass, 'revisor que nomeia a refutacao passa');
check(!passes('cases-readback.json', 'revisor-plano-desconfirmatorio', '**Status:** Approved').pass, 'revisor que so aprova reprova');

// business-rule: este detector e importado de verdade (modulo proprio), sem copia.
const { classify } = require('./business-rule-detector');
const EXP = { file: 'projects/presta-contas-api/src/main/java/x/Repo.java', line: 44, lineTolerance: 3, minSeverity: 'High' };
const block = (findings) => `Resumo.\n\n<!-- REVIEWER_DECISION -->\n\`\`\`json\n${JSON.stringify({ harness_action: 'BLOCK', findings })}\n\`\`\`\n<!-- /REVIEWER_DECISION -->\n\n## Report`;
const F = (o) => ({ severity: 'High', category: 'business-rule', file: EXP.file, line: 44, issue: 'x', ...o });

console.log('--- business-rule: classificacao ---');
[
  ['hit', block([F({})]), 'caminho completo, linha exata'],
  ['hit', block([F({ file: 'src/main/java/x/Repo.java', line: 46 })]), 'sem prefixo projects/<repo>, linha na tolerancia'],
  ['hit', block([F({ file: 'b/projects/presta-contas-api/src/main/java/x/Repo.java', line: '42-44' })]), 'prefixo b/ e faixa de linha'],
  ['hit', block([F({ category: 'correctness', line: 44 }), F({ line: 45 })]), 'segundo achado e o business-rule'],
  ['wrongCategory', block([F({ category: 'correctness' })]), 'arquivo e linha certos, correctness'],
  ['wrongLine', block([F({ line: 120 })]), 'business-rule no arquivo, longe da linha'],
  ['miss', block([F({ file: 'src/main/java/x/Outro.java' })]), 'outro arquivo'],
  ['miss', block([]), 'sem achados'],
  ['noBlock', 'Aprovo a mudanca, nada a apontar.', 'sem bloco'],
  ['noBlock', '<!-- REVIEWER_DECISION -->\n```json\n{ quebrado\n```\n<!-- /REVIEWER_DECISION -->', 'JSON invalido'],
].forEach(([want, text, label]) => check(classify(text, EXP).verdict === want, `${want.padEnd(13)} ${label}`));
const fenced = classify(block([F({ suggestion: "Restore:\n```java\nand lr.flag = 'S'\n```" })]), EXP);
check(fenced.verdict === 'hit' && fenced.harnessParses === true, 'cerca ``` dentro da suggestion: acha, e o harness le (parseJsonFence)');
const bare = classify(block([F({ suggestion: 'Restore:\n```java\nx\n```' })]).replace('```json', '```'), EXP);
check(bare.verdict === 'hit' && bare.harnessParses === false, 'cerca sem json + cerca na suggestion: acha, e marca que o harness nao leria');
check(classify(block([F({})]), EXP).harnessParses === true, 'bloco limpo: harness leria');
check(classify(block([F({ severity: 'Medium' })]), EXP).severityOk === false, 'hit Medium nao cumpre minSeverity High');
check(classify(block([F({ severity: 'Critical' })]), EXP).severityOk === true, 'hit Critical cumpre minSeverity High');

console.log('\ndetector: ' + ok + '/' + (ok + bad) + ' corretos');
process.exit(bad === 0 ? 0 : 1);
