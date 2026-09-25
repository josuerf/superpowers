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
check(fenced.verdict === 'hit' && fenced.harnessParses === false, 'cerca ``` dentro da suggestion: acha, e marca que o harness nao leria');
check(classify(block([F({})]), EXP).harnessParses === true, 'bloco limpo: harness leria');
check(classify(block([F({ severity: 'Medium' })]), EXP).severityOk === false, 'hit Medium nao cumpre minSeverity High');
check(classify(block([F({ severity: 'Critical' })]), EXP).severityOk === true, 'hit Critical cumpre minSeverity High');

console.log('\ndetector: ' + ok + '/' + (ok + bad) + ' corretos');
process.exit(bad === 0 ? 0 : 1);
