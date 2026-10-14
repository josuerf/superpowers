/**
 * Checagens da suite modo-rito (card C123). Deterministicas, como as de checks.js:
 * leem o que a execucao deixou no repositorio temporario (`run.observed`, gravado
 * por run.js depois da sessao) e a ultima mensagem (`run.finalText`).
 *
 * Tipos:
 *   last-line     { pattern }           a ultima linha nao vazia da mensagem final casa
 *   no-question   { expect? }           nenhuma linha da mensagem final (fora de bloco de
 *                                       codigo) termina em "?"; expect=false: alguma termina
 *   git-commits   { count | min }       commits novos depois do preparo do caso
 *   verify-ok     {}                    o comando `verify` do caso saiu 0 depois da sessao
 *   git-state     {}                    nenhuma branch nova, nenhuma worktree nova, nada no index
 *   changed-only  { allow, require? }   todo caminho do `git status` casa `allow`; com
 *                                       `require`, algum caminho casa `require`
 *   json-file     { path, shape }       o arquivo existe, e JSON, e valida a forma
 *                                       (spec | plano | achados), como o forge valida
 *   json-includes { path, list, field, value }  algum item de `list` tem `value` em `field`
 *   json-min-items { path, list, min }  a lista tem pelo menos `min` itens
 *   json-achado   { path, arquivo, severidade }  algum achado no arquivo, com a severidade
 *   no-tool       { pattern }           nenhuma chamada de ferramenta com nome que case
 *   first-turn-regex   { pattern, expect? }  regex no texto do 1o turno (casos de dois turnos)
 *   first-turn-no-edit {}              nenhuma escrita no 1o turno (Edit/Write ou Bash que grava)
 *   writes-only   { allow }            todo Write/Edit do stream cai no repositorio do caso, em caminho que casa allow
 *   readback-first { pattern }         um texto que casa sai antes da primeira escrita
 *                                       (Edit/Write ou Bash que grava arquivo), pela ordem do stream
 */

const RISCOS = ['seguranca', 'concorrencia', 'migracao_dados', 'regulatorio', 'compatibilidade'];
const HOOK_NOISE = ['?? .harness.config.json', '?? .gitignore'];
const NODE_ID = /^[A-Z]{2,10}-\d{3,}$/;

function lastLine(text) {
  const lines = String(text || '').split('\n').map((l) => l.trimEnd()).filter((l) => l.trim());
  return lines.length ? lines[lines.length - 1].trim() : '';
}

function stripFences(text) {
  return String(text || '').replace(/```[\s\S]*?```/g, '');
}

function hasQuestion(text) {
  // A pergunta pode fechar com negrito, italico, parentese, aspas ou colchete.
  return stripFences(text).split('\n').some((l) => /\?[\s*_)"'»\]]*$/.test(l.trim()));
}

function str(v) { return typeof v === 'string' && v.trim().length > 0; }

function nodes(list, prefix, where, problems, extra) {
  if (!Array.isArray(list)) { problems.push(`${where}: nao e lista`); return; }
  const seen = new Set();
  list.forEach((n, i) => {
    if (!n || typeof n !== 'object') { problems.push(`${where}[${i}]: nao e objeto`); return; }
    if (!NODE_ID.test(n.id || '') || (prefix && !String(n.id).startsWith(prefix + '-'))) {
      problems.push(`${where}[${i}].id invalido: ${n.id}`);
    }
    if (seen.has(n.id)) problems.push(`${where}: id repetido ${n.id}`);
    seen.add(n.id);
    if (extra) extra(n, i);
  });
}

/** Mesmas regras dos schemas zod do forge (spec-schema, plano-schema, suposicao). */
function validateShape(shape, obj) {
  const p = [];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return ['raiz nao e objeto'];
  if (obj.versao !== 1) p.push('versao deve ser 1');
  if (shape === 'achados') {
    if (!str(obj.onda)) p.push('onda ausente');
    if (!Array.isArray(obj.achados)) { p.push('achados nao e lista'); return p; }
    nodes(obj.achados, 'ACH', 'achados', p, (a, i) => {
      if (!['bloqueante', 'nao_bloqueante'].includes(a.severidade)) p.push(`achados[${i}].severidade invalida: ${a.severidade}`);
      if (!['revisao', 'red_team'].includes(a.origem)) p.push(`achados[${i}].origem invalida: ${a.origem}`);
      if (!str(a.arquivo)) p.push(`achados[${i}].arquivo ausente`);
      if (!str(a.texto)) p.push(`achados[${i}].texto ausente`);
      if (a.linha !== undefined && !(Number.isInteger(a.linha) && a.linha > 0)) p.push(`achados[${i}].linha invalida`);
    });
    return p;
  }
  if (!str(obj.titulo)) p.push('titulo ausente');
  if (!str(obj.demanda)) p.push('demanda ausente');
  if (obj.suposicoes !== undefined) {
    nodes(obj.suposicoes, 'SUP', 'suposicoes', p, (s, i) => { if (!str(s.texto)) p.push(`suposicoes[${i}].texto vazio`); });
  }
  const tarefa = (where) => (t, i) => {
    if (!str(t.titulo)) p.push(`${where}[${i}].titulo vazio`);
    if (!str(t.descricao)) p.push(`${where}[${i}].descricao vazia`);
    if (!Array.isArray(t.arquivos) || t.arquivos.length === 0 || !t.arquivos.every(str)) p.push(`${where}[${i}].arquivos vazio`);
    if (t.requisitoIds !== undefined && !(Array.isArray(t.requisitoIds) && t.requisitoIds.every((x) => NODE_ID.test(x)))) p.push(`${where}[${i}].requisitoIds invalido`);
    if (t.riscos !== undefined && !(Array.isArray(t.riscos) && t.riscos.every((r) => RISCOS.includes(r)))) p.push(`${where}[${i}].riscos fora do vocabulario: ${JSON.stringify(t.riscos)}`);
  };
  if (shape === 'spec') {
    if (!Array.isArray(obj.requisitos) || obj.requisitos.length === 0) p.push('requisitos vazio');
    nodes(obj.requisitos || [], null, 'requisitos', p, (r, i) => { if (!str(r.texto)) p.push(`requisitos[${i}].texto vazio`); });
    const reqIds = new Set((obj.requisitos || []).map((r) => r && r.id));
    if (!Array.isArray(obj.criteriosAceite) || obj.criteriosAceite.length === 0) p.push('criteriosAceite vazio');
    nodes(obj.criteriosAceite || [], null, 'criteriosAceite', p, (c, i) => {
      if (!str(c.texto)) p.push(`criteriosAceite[${i}].texto vazio`);
      if (c.requisitoId !== undefined && !reqIds.has(c.requisitoId)) p.push(`criteriosAceite[${i}].requisitoId sem requisito: ${c.requisitoId}`);
    });
    if (obj.regrasNegocio !== undefined) nodes(obj.regrasNegocio, null, 'regrasNegocio', p, (r, i) => { if (!str(r.texto)) p.push(`regrasNegocio[${i}].texto vazio`); });
    if (obj.foraDeEscopo !== undefined && !(Array.isArray(obj.foraDeEscopo) && obj.foraDeEscopo.every((x) => typeof x === 'string'))) p.push('foraDeEscopo invalido');
    return p;
  }
  if (shape === 'plano') {
    if (!Array.isArray(obj.tarefas) || obj.tarefas.length === 0) p.push('tarefas vazio');
    nodes(obj.tarefas || [], null, 'tarefas', p, tarefa('tarefas'));
    return p;
  }
  return [`forma desconhecida: ${shape}`];
}

/** O hook antigo escreve exatamente isto; outro conteudo e da sessao, e reprova. */
const HOOK_CONTENT = {
  '.gitignore': (s) => /^\s*# AI assistant artifacts\s*\ncontext-snapshot\.json\s*$/.test(s),
  '.harness.config.json': (s) => { try { const j = JSON.parse(s); return j.coverageMin !== undefined && j.patterns !== undefined; } catch { return false; } },
};

function isHookNoise(obs, line) {
  if (obs.hookNoiseExpected === false || !HOOK_NOISE.includes(line)) return false;
  const file = line.slice(3);
  if (!obs.hookFiles || !(file in obs.hookFiles)) return obs.hookFiles === undefined;
  return HOOK_CONTENT[file](obs.hookFiles[file]);
}

/**
 * Um comando de shell que grava no repositorio do caso. Texto entre aspas nao conta
 * (`grep "=>"` nao redireciona nada). Redirecionamento conta quando o alvo e relativo
 * (a sessao roda na raiz do repositorio) ou fica no diretorio temporario do caso
 * (`skill-evals-rito-`); /dev/null, /tmp e afins nao. Tambem contam sed -i, tee, cp,
 * mv, git apply e escrita por node -e (writeFileSync/appendFileSync).
 */
function bashWritesRepo(cmd) {
  const bare = String(cmd || '').replace(/'[^']*'|"[^"]*"/g, '""');
  // `2>arquivo` grava; `2>&1` nao (o alvo comeca por &).
  const targets = [...bare.matchAll(/(?:^|[^&<>=-])>{1,2}\s*([^\s|;&<>()]+)/g)].map((m) => m[1]);
  const inRepo = (t) => !/^(&|=|\/dev\/|\/tmp\/|~|\$)/.test(t) && (!/^([A-Za-z]:)?[\\/]/.test(t) || /skill-evals-rito-/.test(t));
  if (targets.some(inRepo)) return true;
  if (/\bsed\s+(-[a-zA-Z]*\s+)*-i/.test(bare) || /\btee\b/.test(bare)) return true;
  if (/(^|[;&|]\s*|\s)(cp|mv|rm|touch|mkdir)\s/.test(bare)) return true;
  if (/\bgit\s+(apply\b|restore\b|checkout\s+--(\s|$))/.test(bare) || /\s--(write|fix)\b/.test(bare)) return true;
  return /\b(writeFileSync|appendFileSync|writeFile)\b|\bopen\([^)]*['"][wa]\+?['"]/.test(String(cmd || ''));
}

/** Primeira escrita no repositorio: Edit/Write, ou Bash que grava (bashWritesRepo). */
function firstEditIndex(timeline) {
  return (timeline || []).findIndex((e) => e.k === 'tool'
    && (/^(Edit|Write|NotebookEdit|MultiEdit)$/.test(e.name) || (e.name === 'Bash' && bashWritesRepo(e.cmd))));
}

/** Linhas do git status --porcelain. Resultados gravados antes da correcao do run
 *  tinham a primeira linha aparada (' M a' virava 'M a'): devolve o espaco quando a
 *  linha tem um codigo de estado so, seguido de um espaco e do caminho. */
function statusLines(obs) {
  return (obs.status || []).map((s) => (/^[MADRCU?!] [^ ]/.test(s) ? ' ' + s : s));
}

function readJson(run, path) {
  const raw = run.observed?.files?.[path];
  if (raw === undefined || raw === null) return { error: `${path} nao existe` };
  try { return { value: JSON.parse(raw) }; } catch (e) { return { error: `${path} nao e JSON: ${String(e.message).slice(0, 80)}` }; }
}

function runRitoCheck(check, run) {
  const obs = run.observed || {};
  const expect = check.expect !== false;
  switch (check.type) {
    case 'last-line': {
      const l = lastLine(run.finalText ?? run.text);
      const ok = new RegExp(check.pattern, check.flags ?? '').test(l);
      return { pass: ok === expect, detail: `ultima linha: ${l.slice(0, 80)}` };
    }
    case 'no-question': {
      const q = hasQuestion(run.finalText ?? run.text);
      return { pass: expect ? !q : q, detail: q ? 'perguntou' : 'sem pergunta' };
    }
    case 'git-commits': {
      if (obs.newCommits === undefined) return { pass: false, detail: 'sem observacao do git' };
      const ok = check.min !== undefined ? obs.newCommits >= check.min : obs.newCommits === check.count;
      return { pass: ok, detail: `${obs.newCommits} commit(s) novo(s)` };
    }
    case 'git-state': {
      const bad = [];
      if ((obs.branches || []).length !== 1) bad.push(`branches: ${(obs.branches || []).join(',')}`);
      if ((obs.worktrees ?? 1) !== 1) bad.push(`worktrees: ${obs.worktrees}`);
      if (obs.topo && obs.head !== obs.topo) bad.push('HEAD mudou');
      if (obs.tags) bad.push(`tags: ${obs.tags}`);
      // Coluna do index preenchida (staged, conflito): tudo menos espaco, ?? e !!.
      if (statusLines(obs).some((s) => !/^[ ?!]/.test(s))) bad.push('index com arquivo staged ou em conflito');
      if (obs.stashes) bad.push(`stash: ${obs.stashes}`);
      if (obs.rootChanged) bad.push('a worktree do plugin em teste mudou');
      return { pass: bad.length === 0, detail: bad.join('; ') || 'git intacto' };
    }
    case 'changed-only': {
      // Plugin instalado anterior a 7.0.1 (observed.hookNoiseExpected, rito.js): os hooks
      // dele geram estes dois arquivos na pasta da sessao ao iniciar, mesmo com
      // SUPERPOWERS_PREPARED_RITO=1. Sao do ambiente, nao da sessao: so nesse caso, e so
      // quando novos (`??`), nao contam. Com a 7.0.1+ instalada a checagem e estrita.
      const paths = statusLines(obs)
        .filter((s) => !isHookNoise(obs, s))
        .map((s) => s.slice(3).replace(/^"|"$/g, ''));
      const allow = new RegExp(check.allow);
      const out = paths.filter((p) => !allow.test(p));
      const req = check.require ? paths.some((p) => new RegExp(check.require).test(p)) : true;
      return {
        pass: out.length === 0 && req,
        detail: out.length ? `fora do permitido: ${out.join(',')}` : (req ? `ok (${paths.length})` : 'nada mudou onde devia'),
      };
    }
    case 'json-file': {
      const r = readJson(run, check.path);
      if (r.error) return { pass: false, detail: r.error };
      const probs = validateShape(check.shape, r.value);
      return { pass: probs.length === 0, detail: probs.length ? probs.slice(0, 4).join('; ') : 'forma valida' };
    }
    case 'json-includes': {
      const r = readJson(run, check.path);
      if (r.error) return { pass: false, detail: r.error };
      const list = Array.isArray(r.value[check.list]) ? r.value[check.list] : [];
      const ok = list.some((it) => {
        const v = it && it[check.field];
        return Array.isArray(v) ? v.includes(check.value) : v === check.value;
      });
      return { pass: ok === expect, detail: ok ? 'encontrou' : 'nao encontrou' };
    }
    case 'json-min-items': {
      const r = readJson(run, check.path);
      if (r.error) return { pass: false, detail: r.error };
      const n = Array.isArray(r.value[check.list]) ? r.value[check.list].length : 0;
      return { pass: n >= check.min, detail: `${n} item(ns)` };
    }
    case 'json-achado': {
      const r = readJson(run, check.path);
      if (r.error) return { pass: false, detail: r.error };
      const re = new RegExp(check.arquivo);
      const hit = (r.value.achados || []).some((a) => a && re.test(String(a.arquivo)) && (!check.severidade || a.severidade === check.severidade));
      return { pass: hit, detail: hit ? 'achou' : `nenhum achado ${check.severidade || ''} em ${check.arquivo}` };
    }
    case 'verify-ok': {
      if (obs.verifyStatus === undefined) return { pass: false, detail: 'verificacao nao rodou' };
      return { pass: obs.verifyStatus === 0, detail: `saida ${obs.verifyStatus}: ${obs.verifyTail || ''}`.slice(0, 160) };
    }
    case 'readback-first': {
      const re = new RegExp(check.pattern, check.flags ?? 'i');
      const tl = run.timeline || [];
      const rb = tl.findIndex((e) => e.k === 'text' && re.test(e.s));
      const ed = firstEditIndex(tl);
      const ok = rb >= 0 && (ed < 0 || rb < ed);
      return { pass: ok, detail: rb < 0 ? 'sem readback' : (ok ? 'readback antes da 1a edicao' : 'readback depois de editar') };
    }
    case 'first-turn-regex': {
      const ok = new RegExp(check.pattern, check.flags ?? 'i').test(run.firstText || '');
      return { pass: ok === expect, detail: ok ? 'casou no 1o turno' : 'nao casou no 1o turno' };
    }
    case 'first-turn-no-edit': {
      const tl = (run.firstTools || []).map((t) => ({ k: 'tool', name: t.name, cmd: t.input?.command || '' }));
      const ed = firstEditIndex(tl);
      return { pass: ed < 0, detail: ed >= 0 ? 'editou no 1o turno' : 'sem edicao no 1o turno' };
    }
    case 'writes-only': {
      // Write/Edit fora do permitido, pelo file_path do stream (pega escrita fora do
      // repositorio, que nenhum git status ve). Caminho absoluto no repositorio do caso
      // vira relativo a ele (observed.dir).
      const allow = new RegExp(check.allow);
      // O nome da pasta temporaria do caso e unico (mkdtemp); casar por ele, e nao pelo
      // caminho inteiro, porque a sessao pode usar o nome curto 8.3 do Windows
      // (JOSUE~1.FRE) onde o realpath tem o longo.
      const caseDir = String(run.observed?.dir || '').replace(/\\/g, '/').split('/').filter(Boolean).pop() || '';
      const bad = (run.tools || []).filter((t) => /^(Edit|Write|NotebookEdit|MultiEdit)$/.test(t.name)).map((t) => {
        const p = String(t.input?.file_path || t.input?.notebook_path || '').replace(/\\/g, '/');
        const i = caseDir ? p.toLowerCase().indexOf(`/${caseDir.toLowerCase()}/`) : -1;
        if (i >= 0) return p.slice(i + caseDir.length + 2);
        return /^([A-Za-z]:)?\//.test(p) ? `FORA: ${p}` : p;
      }).filter((p) => !allow.test(p));
      return { pass: bad.length === 0, detail: bad.length ? `escreveu: ${[...new Set(bad)].join(', ').slice(0, 200)}` : 'so no permitido' };
    }
    case 'no-tool': {
      const re = new RegExp(check.pattern);
      const bad = (run.tools || []).filter((t) => re.test(t.name)).map((t) => t.name);
      return { pass: bad.length === 0, detail: bad.length ? `chamou: ${[...new Set(bad)].join(',')}` : 'nao chamou' };
    }
    default:
      return null;
  }
}

module.exports = { bashWritesRepo, runRitoCheck, validateShape, lastLine, hasQuestion };
