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

function extractFindings(text) {
  if (!text) return null;
  const marked = text.match(/<!--\s*REVIEWER_DECISION\s*-->([\s\S]*?)<!--\s*\/REVIEWER_DECISION\s*-->/);
  const region = marked ? marked[1] : text;
  const fence = region.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fence ? fence[1] : region).trim();
  try {
    const obj = JSON.parse(raw);
    return Array.isArray(obj.findings) ? obj.findings : null;
  } catch {
    return null;
  }
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
 */
function classify(text, expected) {
  const findings = extractFindings(text);
  if (!findings) return { verdict: 'noBlock', finding: null, severityOk: false, total: 0 };
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

module.exports = { extractFindings, sameFile, lineOf, classify };
