/**
 * Motor de checagens das suites por caso (blast-radius, readback, risk-flags).
 *
 * Cada caso declara `checks: [{ id, type, ... }]` no JSON da suite; uma
 * execucao passa num check ou nao, e o caso passa quando passa em todos.
 * Deterministico: regex, eventos de ferramenta do stream e sobreposicao de
 * n-gramas. Nada de verificador LLM, pelo mesmo motivo do score.js.
 *
 * Modulo separado (e nao dentro do score.js) para que o detector-test.js o
 * teste importando o codigo real, sem copia que possa divergir.
 *
 * Tipos:
 *   regex          { pattern, flags?, section?, until?, expect? }  expect=false inverte
 *   tool-search    a execucao chamou busca de verdade (Grep, Bash grep/rg/search.js, forge_*)
 *   no-edit-tool   a execucao NAO chamou Edit/Write/NotebookEdit
 *   no-literal-copy { phrases, n?, max?, section?, until? }  cada frase: fracao de
 *                  n-gramas copiados literalmente < max
 */

// Um "campo" em negrito (**X:**) ou um cabecalho encerram a secao corrente.
const DEFAULT_UNTIL = '^\\s*(#{1,6}\\s|[-*]\\s+\\*\\*[^*\\n]+:\\*\\*|\\*\\*[^*\\n]+:\\*\\*)';

/**
 * Recorta do texto a secao cuja primeira linha casa com `section` (regex,
 * case-insensitive), ate a proxima linha que casa com `until`. Devolve null
 * quando a secao nao existe — ausencia e informacao, nao string vazia.
 */
function sliceSection(text, section, until) {
  if (!text) return null;
  const lines = text.split('\n');
  const start = new RegExp(section, 'i');
  const stop = new RegExp(until || DEFAULT_UNTIL, 'i');
  const i = lines.findIndex((l) => start.test(l));
  if (i < 0) return null;
  const out = [lines[i]];
  for (let j = i + 1; j < lines.length; j++) {
    if (stop.test(lines[j])) break;
    out.push(lines[j]);
  }
  return out.join('\n');
}

const SEARCH_TOOL = /^(Grep|Glob)$|forge_(siblings|locate|context)/;
const SEARCH_CMD = /\b(grep|rg|git\s+grep|findstr|search\.js|Select-String)\b/;
const EDIT_TOOL = /^(Edit|Write|NotebookEdit|MultiEdit)$/;

function ranSearch(tools) {
  return (tools || []).some((t) => SEARCH_TOOL.test(t.name)
    || (/^(Bash|PowerShell)$/.test(t.name) && SEARCH_CMD.test(String(t.input?.command || ''))));
}

const words = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9_]+/g, ' ').trim().split(/\s+/).filter(Boolean);

function ngrams(ws, n) {
  const out = new Set();
  for (let i = 0; i + n <= ws.length; i++) out.add(ws.slice(i, i + n).join(' '));
  return out;
}

/** Fracao dos n-gramas da frase que aparecem literalmente no texto. */
function copiedFraction(phrase, text, n = 5) {
  const p = ngrams(words(phrase), n);
  if (p.size === 0) return 0;
  const t = ngrams(words(text || ''), n);
  let hit = 0;
  for (const g of p) if (t.has(g)) hit++;
  return hit / p.size;
}

function runCheck(check, run) {
  const scope = check.section
    ? sliceSection(run.text, check.section, check.until)
    : run.text;
  switch (check.type) {
    case 'regex': {
      const found = scope !== null && new RegExp(check.pattern, check.flags ?? 'i').test(scope || '');
      const expect = check.expect !== false;
      return { pass: found === expect, detail: scope === null ? 'secao ausente' : (found ? 'casou' : 'nao casou') };
    }
    case 'tool-search': {
      const ok = ranSearch(run.tools);
      return { pass: ok, detail: ok ? 'buscou' : 'nenhuma busca no stream' };
    }
    case 'no-edit-tool': {
      const bad = (run.tools || []).filter((t) => EDIT_TOOL.test(t.name)).map((t) => t.name);
      return { pass: bad.length === 0, detail: bad.length ? `editou: ${bad.join(',')}` : 'sem edicao' };
    }
    case 'no-literal-copy': {
      if (scope === null) return { pass: false, detail: 'secao ausente' };
      const max = check.max ?? 0.6;
      const fr = check.phrases.map((p) => copiedFraction(p, scope, check.n ?? 5));
      const worst = Math.max(...fr);
      return { pass: worst < max, detail: `copia maxima ${(worst * 100).toFixed(0)}%` };
    }
    default:
      return { pass: false, detail: `tipo desconhecido: ${check.type}` };
  }
}

function runChecks(checks, run) {
  const results = (checks || []).map((c) => ({ id: c.id, ...runCheck(c, run) }));
  return { results, pass: results.length > 0 && results.every((r) => r.pass) };
}

module.exports = { sliceSection, ranSearch, copiedFraction, runCheck, runChecks, DEFAULT_UNTIL };
