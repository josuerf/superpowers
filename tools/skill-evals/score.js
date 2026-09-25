#!/usr/bin/env node
/**
 * Pontua os resultados de run.js. Determinstico: so regex, sem verificador LLM.
 *
 * Uso:
 *   node tools/skill-evals/score.js results/<arquivo>.json [results/<outro>.json]
 *
 * Com dois arquivos, imprime a comparacao antes/depois lado a lado.
 */
const fs = require('fs');
const { runChecks } = require('./checks');
const { classify } = require('./business-rule-detector');

// --- deteccao: oferta do visual companion ------------------------------------
// Um termo visual sozinho nao e oferta ("vamos discutir o layout" nao e).
// Exigimos um termo visual E um marcador de oferta na MESMA frase.
const VISUAL_TERM = /(mockup|wireframe|prot[oó]tipo|visual companion|companion visual|preview|pr[eé]-?visualiza|esbo[cç]o|tela de exemplo|maquete)/i;
const OFFER_MARK = /(quer que|gostaria|posso (montar|fazer|preparar|gerar|criar)|te mostr|lhe mostr|mostrar para voc|want me|shall i|i can put together|montar (um|uma)|prefere)/i;
// Marcador explicito da checagem de superficie (existe so depois da Fase 2).
const SURFACE_CHECK = /superf[ií]cie visual\s*[:\-]\s*(sim|n[aã]o|yes|no)/i;

function splitSentences(text) {
  return text.split(/(?<=[.!?…])\s+|\n{2,}|\n(?=[-*>#])/).filter(Boolean);
}

function detectOffer(text) {
  if (!text) return { offered: false, evidence: null };
  const s = splitSentences(text);
  // Janela de duas sentencas: uma oferta costuma se espalhar ("...posso montar
  // um mockup. Quer?"), e exigir os dois sinais na mesma frase perderia isso.
  for (let i = 0; i < s.length; i++) {
    const win = (s[i] + ' ' + (s[i + 1] || '')).trim();
    if (VISUAL_TERM.test(win) && OFFER_MARK.test(win)) {
      return { offered: true, evidence: win.slice(0, 160) };
    }
  }
  return { offered: false, evidence: null };
}

function detectSurfaceCheck(text) {
  const m = (text || '').match(SURFACE_CHECK);
  if (!m) return null;
  return /sim|yes/i.test(m[1]) ? 'sim' : 'nao';
}

// --- deteccao: escolha de execucao -------------------------------------------
function detectChoice(text) {
  if (!text) return { choice: null, how: 'vazio' };
  const t = text;

  // 1. Ready Message do fork: "Ready to execute with **X**" / "Pronto para executar com **X**"
  let m = t.match(/(?:ready to execute with|pronto para executar com)\s*\**\s*([^*\n(]{3,40})/i);
  if (m) {
    const v = m[1].toLowerCase();
    if (/subagent|subagente/.test(v)) return { choice: 'subagent', how: 'ready-message' };
    if (/inline|nativ/.test(v)) return { choice: 'inline', how: 'ready-message' };
  }

  // 2. Declaracao de sub-skill obrigatoria
  m = t.match(/REQUIRED SUB-SKILL[^\n]*?(subagent-driven-development|executing-plans)/i);
  if (m) return { choice: /subagent/i.test(m[1]) ? 'subagent' : 'inline', how: 'required-sub-skill' };

  // 3. Recomendacao explicita em uma frase
  for (const s of splitSentences(t)) {
    if (/(recomend|recommend|sugiro|sugest|vou usar|vou executar|escolh|indicad|a op[cç][aã]o é|fica com)/i.test(s)) {
      const sub = /(subagent|subagente|batch|lote)/i.test(s);
      const inl = /(inline|nativ|executing-plans|neste?a? (mesma )?sess[aã]o)/i.test(s);
      if (sub && !inl) return { choice: 'subagent', how: 'recomendacao' };
      if (inl && !sub) return { choice: 'inline', how: 'recomendacao' };
    }
  }

  // 4. Escolha marcada em negrito. A skill manda destacar a opcao escolhida;
  //    quando so uma das duas aparece assim, ela e a escolha. Se as duas
  //    aparecem, e o template literal copiado — nao decide nada.
  const bold = [...t.matchAll(/\*\*([^*\n]{3,40})\*\*/g)].map((m) => m[1].toLowerCase());
  const boldSub = bold.some((b) => /subagent|subagente/.test(b) && !/inline|nativ/.test(b));
  const boldInl = bold.some((b) => /inline|nativ/.test(b) && !/subagent|subagente/.test(b));
  if (boldSub && !boldInl) return { choice: 'subagent', how: 'negrito' };
  if (boldInl && !boldSub) return { choice: 'inline', how: 'negrito' };

  return { choice: null, how: 'nao-classificado' };
}

const AXES = {
  acoplamento: /(acopl|interface|assinatur|depend[eê]nci|coupl|consome o que|produz)/i,
  diff: /(\d+\s*arquivos|quantidade de arquivos|tamanho do diff|diff grande|abrang[eê]ncia|linhas alteradas|varre)/i,
  custo: /(custo de um erro|risco|em produ[cç][aã]o|caro|impacto de um erro|se passar)/i,
  contexto: /(janela|contexto (cheio|pressionad|dispon)|compacta|context window|%.{0,12}contexto)/i,
};

function detectAxes(text) {
  return Object.entries(AXES).filter(([, re]) => re.test(text || '')).map(([k]) => k);
}

// --- agregacao ---------------------------------------------------------------
const pct = (num, den) => (den === 0 ? '—' : `${((num / den) * 100).toFixed(0)}%`);

/**
 * Descarta execucoes sem resposta. Um run vazio (o CLI nao chegou a rodar, por
 * exemplo sob pressao de memoria) contaria como "nao ofereceu" e "nao
 * classificado", inventando um resultado ruim onde nao houve medicao.
 */
function usableRuns(suite) {
  const all = suite.runs.length;
  const runs = suite.runs.filter((r) => r.text && r.text.trim());
  return { runs, discarded: all - runs.length, all };
}

function scoreVisual(suite) {
  const byCase = new Map();
  for (const r of usableRuns(suite).runs) {
    if (!byCase.has(r.caseId)) byCase.set(r.caseId, { surface: r.surface, runs: [] });
    const d = detectOffer(r.text);
    byCase.get(r.caseId).runs.push({ ...d, check: detectSurfaceCheck(r.text), error: r.error });
  }
  let tp = 0, tpDen = 0, fp = 0, fpDen = 0, checks = 0, all = 0;
  const rows = [];
  for (const [id, c] of byCase) {
    const offered = c.runs.filter((r) => r.offered).length;
    const n = c.runs.length;
    all += n;
    checks += c.runs.filter((r) => r.check !== null).length;
    if (c.surface === true) { tp += offered; tpDen += n; }
    else if (c.surface === false) { fp += offered; fpDen += n; }
    rows.push({ id, surface: c.surface, offered, n, rate: pct(offered, n) });
  }
  return {
    descartados: usableRuns(suite).discarded,
    total: usableRuns(suite).all,
    rows,
    sensibilidade: { num: tp, den: tpDen, pct: pct(tp, tpDen) },
    falsoPositivo: { num: fp, den: fpDen, pct: pct(fp, fpDen) },
    marcadorChecagem: { num: checks, den: all, pct: pct(checks, all) },
  };
}

function scoreExecution(suite) {
  const byCase = new Map();
  for (const r of usableRuns(suite).runs) {
    if (!byCase.has(r.caseId)) byCase.set(r.caseId, { meta: r, runs: [] });
    byCase.get(r.caseId).runs.push({
      ...detectChoice(r.text), axes: detectAxes(r.text), error: r.error,
    });
  }
  let cleanHit = 0, cleanDen = 0, ovHit = 0, ovDen = 0, unparsed = 0, all = 0;
  const rows = [];
  for (const [id, c] of byCase) {
    const { expected, kind, expectedReasonAxis } = c.meta;
    const n = c.runs.length;
    all += n;
    const hits = c.runs.filter((r) => r.choice === expected).length;
    unparsed += c.runs.filter((r) => r.choice === null).length;
    // Em caso "override", so conta quando a escolha certa vem acompanhada do eixo
    // que a justifica — escolher certo sem enxergar a razao nao e a competencia medida.
    const withReason = expectedReasonAxis
      ? c.runs.filter((r) => r.choice === expected && r.axes.includes(expectedReasonAxis)).length
      : hits;
    if (kind === 'clean') { cleanHit += hits; cleanDen += n; }
    else { ovHit += withReason; ovDen += n; }
    rows.push({
      id, kind, expected, n, hits,
      withReason: expectedReasonAxis ? withReason : null,
      rate: pct(kind === 'clean' ? hits : withReason, n),
      axes: [...new Set(c.runs.flatMap((r) => r.axes))].join(',') || '—',
    });
  }
  return {
    descartados: usableRuns(suite).discarded,
    total: usableRuns(suite).all,
    rows,
    aderenciaDefault: { num: cleanHit, den: cleanDen, pct: pct(cleanHit, cleanDen) },
    desvioCorreto: { num: ovHit, den: ovDen, pct: pct(ovHit, ovDen) },
    naoClassificado: { num: unparsed, den: all, pct: pct(unparsed, all) },
  };
}

// --- suites por caso: checks declarados no JSON (checks.js) --------------------
function scoreChecks(suite) {
  const { runs, discarded, all } = usableRuns(suite);
  const byCase = new Map();
  const byCheck = new Map();
  for (const r of runs) {
    const res = runChecks(r.checks, r);
    if (!byCase.has(r.caseId)) byCase.set(r.caseId, { n: 0, pass: 0, fails: new Map() });
    const c = byCase.get(r.caseId);
    c.n += 1;
    if (res.pass) c.pass += 1;
    for (const x of res.results) {
      const key = `${r.caseId}/${x.id}`;
      if (!byCheck.has(key)) byCheck.set(key, { n: 0, pass: 0, detail: new Set() });
      const k = byCheck.get(key);
      k.n += 1;
      if (x.pass) k.pass += 1; else k.detail.add(x.detail);
    }
  }
  const rows = [...byCase].map(([id, c]) => ({ id, n: c.n, pass: c.pass, rate: pct(c.pass, c.n) }));
  const checks = [...byCheck].map(([id, k]) => ({ id, n: k.n, pass: k.pass, rate: pct(k.pass, k.n), falhas: [...k.detail].join('; ') }));
  const casePass = rows.reduce((a, r) => a + r.pass, 0);
  const caseDen = rows.reduce((a, r) => a + r.n, 0);
  return { kind: 'checks', descartados: discarded, total: all, rows, checks, casosAprovados: { num: casePass, den: caseDen, pct: pct(casePass, caseDen) } };
}

function scoreBusinessRule(suite) {
  const byCase = new Map();
  for (const r of usableRuns(suite).runs) {
    if (!byCase.has(r.caseId)) byCase.set(r.caseId, { meta: r, runs: [] });
    byCase.get(r.caseId).runs.push(classify(r.text, r.expected));
  }
  const count = (runs, v) => runs.filter((x) => x.verdict === v).length;
  let hits = 0, sevOk = 0, noBlock = 0, harnessLoses = 0, all = 0;
  const rows = [];
  for (const [id, c] of byCase) {
    const n = c.runs.length;
    const h = count(c.runs, 'hit');
    all += n; hits += h; noBlock += count(c.runs, 'noBlock');
    sevOk += c.runs.filter((x) => x.verdict === 'hit' && x.severityOk).length;
    harnessLoses += c.runs.filter((x) => x.verdict !== 'noBlock' && !x.harnessParses).length;
    rows.push({
      id, mechanism: c.meta.mechanism, n, hits: h, rate: pct(h, n),
      wrongCategory: count(c.runs, 'wrongCategory'), wrongLine: count(c.runs, 'wrongLine'),
      miss: count(c.runs, 'miss'), noBlock: count(c.runs, 'noBlock'),
      cited: c.runs.map((x) => x.finding ? `${x.finding.category}@${x.finding.line}/${x.finding.severity}` : '-').join(' '),
    });
  }
  return {
    descartados: usableRuns(suite).discarded,
    total: usableRuns(suite).all,
    rows,
    reencontro: { num: hits, den: all, pct: pct(hits, all) },
    severidadeOk: { num: sevOk, den: hits, pct: pct(sevOk, hits) },
    semBloco: { num: noBlock, den: all, pct: pct(noBlock, all) },
    harnessNaoLeria: { num: harnessLoses, den: all, pct: pct(harnessLoses, all) },
  };
}

function totalTokens(data) {
  return data.suites.flatMap((s) => s.runs).reduce((a, r) => a + (r.usage?.total || 0), 0);
}

function report(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const out = { file, ref: data.ref, label: data.label, model: data.model, reps: data.reps, tokens: totalTokens(data), suites: {} };
  for (const s of data.suites) {
    out.suites[s.suite] = s.kind === 'checks' ? scoreChecks(s)
      : s.suite === 'visual-companion' ? scoreVisual(s)
        : s.suite === 'business-rule' ? scoreBusinessRule(s)
          : scoreExecution(s);
  }
  return out;
}

function printOne(r) {
  console.log(`\n=== ${r.ref}${r.label ? ' [' + r.label + ']' : ''}  (modelo: ${r.model}, ${r.reps} repeticoes, ${r.tokens.toLocaleString()} tokens) ===`);
  const v = r.suites['visual-companion'];
  if (v) {
    console.log('\n-- visual companion --');
    for (const row of v.rows) {
      const tag = row.surface === true ? 'COM superficie' : row.surface === false ? 'sem superficie' : 'ambiguo      ';
      console.log(`  ${row.id.padEnd(30)} ${tag}  ofereceu ${row.offered}/${row.n} (${row.rate})`);
    }
    console.log(`  SENSIBILIDADE (deve ser alta): ${v.sensibilidade.pct}  [${v.sensibilidade.num}/${v.sensibilidade.den}]`);
    console.log(`  FALSO POSITIVO (deve ser baixo): ${v.falsoPositivo.pct}  [${v.falsoPositivo.num}/${v.falsoPositivo.den}]`);
    console.log(`  marcador de checagem presente: ${v.marcadorChecagem.pct}`);
  }
  const e = r.suites['execution-choice'];
  if (e) {
    console.log('\n-- escolha de execucao --');
    for (const row of e.rows) {
      const wr = row.withReason !== null ? ` (com a razao: ${row.withReason}/${row.n})` : '';
      console.log(`  ${row.id.padEnd(26)} ${row.kind.padEnd(8)} esperado=${row.expected.padEnd(8)} acertou ${row.hits}/${row.n}${wr}  eixos: ${row.axes}`);
    }
    console.log(`  ADERENCIA AO DEFAULT (casos limpos): ${e.aderenciaDefault.pct}  [${e.aderenciaDefault.num}/${e.aderenciaDefault.den}]`);
    console.log(`  DESVIO CORRETO (casos com razao plantada): ${e.desvioCorreto.pct}  [${e.desvioCorreto.num}/${e.desvioCorreto.den}]`);
    console.log(`  nao classificado: ${e.naoClassificado.pct}`);
  }
  for (const [name, c] of Object.entries(r.suites)) {
    if (c.kind !== 'checks') continue;
    console.log(`
-- ${name} --${c.descartados ? `  (${c.descartados} execucao(oes) sem resposta descartada(s))` : ''}`);
    for (const row of c.rows) console.log(`  ${row.id.padEnd(32)} caso aprovado ${row.pass}/${row.n} (${row.rate})`);
    for (const k of c.checks) {
      console.log(`    ${k.id.padEnd(52)} ${k.pass}/${k.n}${k.falhas ? '  [' + k.falhas + ']' : ''}`);
    }
    console.log(`  CASOS APROVADOS (todos os checks): ${c.casosAprovados.pct}  [${c.casosAprovados.num}/${c.casosAprovados.den}]`);
  }
  const b = r.suites['business-rule'];
  if (b) {
    console.log('\n-- business-rule (carrasco sobre diff real) --');
    for (const row of b.rows) {
      console.log(`  ${row.id.padEnd(28)} ${String(row.mechanism).padEnd(22)} achou ${row.hits}/${row.n}  outra-cat ${row.wrongCategory}  outra-linha ${row.wrongLine}  sem-bloco ${row.noBlock}  [${row.cited}]`);
    }
    console.log(`  REENCONTRO (arquivo + linha + business-rule): ${b.reencontro.pct}  [${b.reencontro.num}/${b.reencontro.den}]`);
    console.log(`  severidade >= minima entre os acertos: ${b.severidadeOk.pct}`);
    console.log(`  sem bloco REVIEWER_DECISION: ${b.semBloco.pct}`);
    console.log(`  bloco que o parser do harness rejeitaria (cerca dentro da string): ${b.harnessNaoLeria.pct}  [${b.harnessNaoLeria.num}/${b.harnessNaoLeria.den}]`);
  }
}

const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (files.length === 0) {
  console.error('uso: node tools/skill-evals/score.js <results/a.json> [results/b.json]');
  process.exit(2);
}
const reports = files.map(report);
reports.forEach(printOne);

if (reports.length === 2) {
  const [a, b] = reports;
  console.log('\n\n=== COMPARACAO ===');
  const line = (label, x, y) => console.log(`  ${label.padEnd(42)} ${String(x).padStart(6)}  ->  ${String(y).padStart(6)}`);
  if (a.suites['visual-companion'] && b.suites['visual-companion']) {
    line('sensibilidade (oferece quando deve)', a.suites['visual-companion'].sensibilidade.pct, b.suites['visual-companion'].sensibilidade.pct);
    line('falso positivo (oferece quando nao deve)', a.suites['visual-companion'].falsoPositivo.pct, b.suites['visual-companion'].falsoPositivo.pct);
  }
  if (a.suites['execution-choice'] && b.suites['execution-choice']) {
    line('aderencia ao default', a.suites['execution-choice'].aderenciaDefault.pct, b.suites['execution-choice'].aderenciaDefault.pct);
    line('desvio correto (com a razao)', a.suites['execution-choice'].desvioCorreto.pct, b.suites['execution-choice'].desvioCorreto.pct);
  }
  for (const name of Object.keys(a.suites)) {
    if (a.suites[name].kind === 'checks' && b.suites[name]?.kind === 'checks') {
      line(`${name}: casos aprovados`, a.suites[name].casosAprovados.pct, b.suites[name].casosAprovados.pct);
    }
  }
  if (a.suites['business-rule'] && b.suites['business-rule']) {
    line('reencontro business-rule', a.suites['business-rule'].reencontro.pct, b.suites['business-rule'].reencontro.pct);
  }
  line('tokens gastos no eval', a.tokens.toLocaleString(), b.tokens.toLocaleString());
  console.log('\n  Nota: com poucas repeticoes, diferencas de poucos pontos percentuais nao sao sinal.');
}
