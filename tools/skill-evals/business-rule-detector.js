/**
 * Detector da suite business-rule: o carrasco reencontrou o achado real?
 *
 * Modulo proprio (e nao dentro de score.js) para detector-test.js testar o
 * mesmo codigo que pontua, sem copia de regex mantida a mao.
 *
 * Fonte dos achados: o bloco <!-- REVIEWER_DECISION --> que o base-prompt
 * exige. Sem o bloco, ou com JSON invalido, o run conta como "sem bloco" —
 * nao como "nao achou" — porque ai o que falhou foi o formato, nao a revisao.
 */

const SEVERITY_RANK = { low: 1, medium: 2, high: 3, critical: 4 };

function tryFindings(raw) {
  try {
    const obj = JSON.parse(raw.trim());
    return Array.isArray(obj.findings) ? obj.findings : null;
  } catch {
    return null;
  }
}

/**
 * Devolve { findings, harnessParses }. Primeiro tenta como o parser do
 * harness (lib/harness/reviewers/parser.ts, parseJsonFence: a cerca de
 * fechamento e o primeiro ``` cujo corpo e JSON valido, entao um bloco ```java
 * dentro da string "suggestion" nao corta mais a decisao). Se falhar, tenta da
 * primeira cerca ate a ULTIMA dentro dos marcadores, aceitando cerca sem
 * "json". `harnessParses: false` separa "o revisor achou, mas o harness
 * perderia a decisao" de "o revisor nao achou". Espelha so a extracao do
 * bloco, nao a validacao campo a campo do harness.
 */
function harnessFence(text, open) {
  const m = open.exec(text);
  if (!m) return null;
  const start = m.index + m[0].length;
  for (let close = text.indexOf('```', start); close !== -1; close = text.indexOf('```', close + 3)) {
    const f = tryFindings(text.slice(start, close));
    if (f) return f;
  }
  return null;
}

function extractDecision(text) {
  if (!text) return { findings: null, harnessParses: false };
  const marked = text.match(/<!--\s*REVIEWER_DECISION\s*-->([\s\S]*?)<!--\s*\/REVIEWER_DECISION\s*-->/);
  const region = marked ? marked[1] : text;
  const strict = !marked ? harnessFence(region, /```json\s*\n/)
    : region.includes('```json') ? harnessFence(region, /```json\s*\n?/)
      : tryFindings(region);
  if (strict) return { findings: strict, harnessParses: true };
  const open = region.indexOf('```');
  const close = region.lastIndexOf('```');
  if (open > -1 && close > open) {
    const greedy = tryFindings(region.slice(open, close).replace(/^```(?:json)?/, ''));
    if (greedy) return { findings: greedy, harnessParses: false };
  }
  return { findings: null, harnessParses: false };
}

function extractFindings(text) {
  return extractDecision(text).findings;
}

/** Normaliza para comparar por sufixo: barra, prefixo a/ b/ e ./ fora. */
function normPath(p) {
  return String(p || '').replace(/\\/g, '/').replace(/^(?:[ab]\/|\.\/)/, '').trim();
}

/** O revisor pode citar com ou sem o prefixo projects/<repo>/; os dois valem. */
function sameFile(cited, expected) {
  const c = normPath(cited);
  const e = normPath(expected);
  if (!c || !e) return false;
  return c === e || e.endsWith('/' + c) || c.endsWith('/' + e);
}

/** A linha pode vir numero, "44", "44-46" ou "Foo.java:44". */
function lineOf(f) {
  const m = String(f.line ?? '').match(/\d+/) || String(f.file || '').match(/:(\d+)/);
  return m ? parseInt(m[1] ?? m[0], 10) : null;
}

function atLeast(sev, min) {
  return (SEVERITY_RANK[String(sev || '').toLowerCase()] || 0) >= (SEVERITY_RANK[String(min || 'low').toLowerCase()] || 0);
}

/**
 * Classifica um run contra o achado esperado.
 *   hit           arquivo certo, linha na tolerancia, category business-rule
 *   wrongCategory arquivo e linha certos, outra categoria
 *   wrongLine     arquivo certo, business-rule, fora da tolerancia
 *   miss          nada disso
 *   noBlock       resposta sem bloco REVIEWER_DECISION parseavel
 * `severityOk` so vale para hit: o achado veio na severidade minima esperada?
 * `harnessParses` diz se o parser do harness leria esse bloco.
 */
function classify(text, expected) {
  const { findings, harnessParses } = extractDecision(text);
  if (!findings) return { verdict: 'noBlock', finding: null, severityOk: false, total: 0, harnessParses };
  return { ...match(findings, expected), harnessParses };
}

function match(findings, expected) {
  const tol = expected.lineTolerance ?? 3;
  const inFile = findings.filter((f) => sameFile(f.file, expected.file));
  const near = inFile.filter((f) => {
    const l = lineOf(f);
    return l !== null && Math.abs(l - expected.line) <= tol;
  });
  const isBR = (f) => String(f.category || '').toLowerCase() === 'business-rule';
  const hit = near.find(isBR);
  if (hit) return { verdict: 'hit', finding: hit, severityOk: atLeast(hit.severity, expected.minSeverity), total: findings.length };
  if (near.length) return { verdict: 'wrongCategory', finding: near[0], severityOk: false, total: findings.length };
  const brInFile = inFile.find(isBR);
  if (brInFile) return { verdict: 'wrongLine', finding: brInFile, severityOk: false, total: findings.length };
  return { verdict: 'miss', finding: null, severityOk: false, total: findings.length };
}

module.exports = { extractDecision, extractFindings, sameFile, lineOf, classify };
