#!/usr/bin/env node
/**
 * Teste das checagens da suite modo-rito (rito-checks.js), pelos checks reais de
 * cases-modo-rito.json e pelo motor real (checks.js). Rode antes de confiar em
 * qualquer numero da suite, e sempre que mexer em rito-checks.js ou nos casos.
 *
 * Uso: node tools/skill-evals/rito-test.js
 */
const { runChecks } = require('./checks');
const { validateShape, hasQuestion, lastLine } = require('./rito-checks');
const cfg = require('./cases-modo-rito.json');

let ok = 0;
let bad = 0;
const check = (cond, label) => { if (cond) { ok++; console.log('  OK    ' + label); } else { bad++; console.log('  FALHA ' + label); } };
const caso = (id) => cfg.cases.find((c) => c.id === id);
const fails = (id, run) => runChecks(caso(id).checks, run).results.filter((r) => !r.pass).map((r) => r.id);

const SPEC = {
  versao: 1, titulo: 'Reservas expiram', demanda: 'EST-12',
  requisitos: [{ id: 'REQ-001', texto: 'Reserva aberta ha mais de 30 minutos devolve o saldo.' }],
  criteriosAceite: [{ id: 'CA-001', texto: 'Depois de 30 minutos o saldo volta.', requisitoId: 'REQ-001' }],
  regrasNegocio: [{ id: 'RN-001', texto: 'Saldo nunca negativo.' }],
  foraDeEscopo: ['Aviso ao solicitante.'],
  suposicoes: [{ id: 'SUP-001', texto: 'Assumi 30 minutos.' }],
};
const PLANO = {
  versao: 1, titulo: 'Plano', demanda: 'EST-21',
  tarefas: [{ id: 'TASK-001', titulo: 'Gravar em arquivo com trava', descricao: 'x', arquivos: ['src/estoque.js'], requisitoIds: ['REQ-002'], riscos: ['concorrencia'] }],
  suposicoes: [],
};
const ACHADOS = { versao: 1, onda: 'onda-1', achados: [{ id: 'ACH-001', severidade: 'bloqueante', arquivo: 'src/estoque.js', linha: 30, texto: 'cancelar duas vezes devolve o saldo duas vezes', origem: 'revisao' }] };
const git = (status = [], extra = {}) => ({ newCommits: 0, status, branches: ['main'], worktrees: 1, ...extra });

console.log('--- forma (como o zod do forge) ---');
check(validateShape('spec', SPEC).length === 0, 'spec valida');
check(validateShape('spec', { ...SPEC, requisitos: [] }).some((p) => /requisitos vazio/.test(p)), 'spec sem requisitos e invalida');
check(validateShape('spec', { ...SPEC, suposicoes: [{ id: 'SUPO-1', texto: 'x' }] }).length > 0, 'id de suposicao fora de SUP-NNN e invalido');
check(validateShape('spec', { ...SPEC, criteriosAceite: [{ id: 'CA-001', texto: 'x', requisitoId: 'REQ-009' }] }).length > 0, 'criterio apontando requisito inexistente e invalido');
check(validateShape('spec', { ...SPEC, requisitos: [SPEC.requisitos[0], SPEC.requisitos[0]] }).some((p) => /repetido/.test(p)), 'id repetido e invalido');
check(validateShape('plano', PLANO).length === 0, 'plano valido');
check(validateShape('plano', { ...PLANO, tarefas: [{ ...PLANO.tarefas[0], riscos: ['concurrency'] }] }).length > 0, 'risk flag em ingles e invalida');
check(validateShape('plano', { ...PLANO, tarefas: [{ ...PLANO.tarefas[0], arquivos: [] }] }).length > 0, 'tarefa sem arquivos e invalida');
check(validateShape('achados', ACHADOS).length === 0, 'achados validos');
check(validateShape('achados', { ...ACHADOS, achados: [] }).length === 0, 'onda limpa: lista vazia e valida');
check(validateShape('achados', { ...ACHADOS, achados: [{ ...ACHADOS.achados[0], severidade: 'High' }] }).length > 0, 'severidade fora do vocabulario e invalida');
check(validateShape('achados', { ...ACHADOS, achados: [{ ...ACHADOS.achados[0], origem: 'carrasco' }] }).length > 0, 'origem fora do vocabulario e invalida');

console.log('--- pergunta e ultima linha ---');
check(hasQuestion('Entendi.\nO que te incomoda hoje nas reservas?'), 'pergunta no fim de linha');
check(hasQuestion('Qual prazo faz sentido?**'), 'pergunta em negrito');
check(!hasQuestion('Pronto.\n```js\nconst a = b ? c : d?\n```\n@@ARTEFATO_PATH: x'), 'interrogacao dentro de bloco de codigo nao conta');
check(lastLine('texto\n\n@@ARTEFATO_PATH: a.json\n\n') === '@@ARTEFATO_PATH: a.json', 'ultima linha ignora linhas vazias');

console.log('--- casos: brainstorming ---');
const SPEC_PATH = '.harness/artefatos/spec.json';
const specRun = (o = {}) => ({
  text: 'Escrevi a especificacao.', finalText: `Escrevi a especificacao.\n\n@@ARTEFATO_PATH: ${SPEC_PATH}`, tools: [],
  observed: git([`?? ${SPEC_PATH}`], { files: { [SPEC_PATH]: JSON.stringify(SPEC) } }), ...o,
});
check(fails('brainstorming-rito', specRun()).length === 0, 'rito: spec valida no destino passa');
check(fails('brainstorming-rito', specRun({ finalText: `@@ARTEFATO_PATH: ${SPEC_PATH}\nQuer que eu ajuste?` })).includes('marcador-ultima-linha'), 'rito: texto depois do marcador reprova');
check(fails('brainstorming-rito', specRun({ observed: git([`?? ${SPEC_PATH}`], { newCommits: 1, files: { [SPEC_PATH]: JSON.stringify(SPEC) } }) })).includes('sem-commit'), 'rito: commit reprova');
check(fails('brainstorming-rito', specRun({ observed: git([`?? ${SPEC_PATH}`, '?? docs/notas.md'], { files: { [SPEC_PATH]: JSON.stringify(SPEC) } }) })).includes('so-o-destino'), 'rito: arquivo fora do destino reprova');
check(fails('brainstorming-rito', specRun({ observed: git([], { files: { [SPEC_PATH]: null } }) })).includes('spec-valida'), 'rito: destino ausente reprova');
check(fails('brainstorming-rito', specRun({ observed: git([`?? ${SPEC_PATH}`, '?? .harness.config.json', '?? .gitignore'], { files: { [SPEC_PATH]: JSON.stringify(SPEC) } }) })).length === 0, 'rito: arquivos novos do hook de session-start nao contam');
check(fails('brainstorming-rito', specRun({ observed: git([`?? ${SPEC_PATH}`, '?? .harness.config.json'], { hookNoiseExpected: false, files: { [SPEC_PATH]: JSON.stringify(SPEC) } }) })).includes('so-o-destino'), 'rito: com plugin 7.0.1+ instalado, .harness.config.json novo reprova');
check(fails('brainstorming-rito', specRun({ observed: git([`?? ${SPEC_PATH}`, ' M .gitignore'], { files: { [SPEC_PATH]: JSON.stringify(SPEC) } }) })).includes('so-o-destino'), 'rito: alterar .gitignore existente reprova');
check(fails('brainstorming-rito', specRun({ observed: git([`?? ${SPEC_PATH}`], { files: { [SPEC_PATH]: JSON.stringify({ ...SPEC, suposicoes: [] }) } }) })).includes('perguntas-viram-suposicoes'), 'rito: nenhuma suposicao reprova');
check(fails('brainstorming-rito', specRun({ observed: git([`A  ${SPEC_PATH}`], { files: { [SPEC_PATH]: JSON.stringify(SPEC) } }) })).includes('git-intacto'), 'rito: arquivo no index reprova');
check(fails('brainstorming-rito', specRun({ observed: git([`?? ${SPEC_PATH}`], { branches: ['main', 'feature/x'], files: { [SPEC_PATH]: JSON.stringify(SPEC) } }) })).includes('git-intacto'), 'rito: branch nova reprova');
const chat = (finalText, o = {}) => ({ text: finalText, finalText, tools: [{ name: 'Read', input: {} }], observed: git(), ...o });
check(fails('brainstorming-sem-marcador', chat('Se preferir pular as perguntas, e so dizer.\n\nO que acontece hoje quando ninguem busca o material?')).length === 0, 'sem marcador: pergunta passa');
check(fails('brainstorming-sem-marcador', chat('Vou escrever a spec.\n@@ARTEFATO_PATH: x')).length > 0, 'sem marcador: sem pergunta e com marcador reprova');
check(fails('brainstorming-sem-marcador', chat('Qual prazo?', { tools: [{ name: 'Write', input: {} }] })).includes('sem-edicao'), 'sem marcador: escrita reprova');

console.log('--- casos: writing-plans ---');
const PLANO_PATH = '.harness/artefatos/plano.json';
const planoRun = (p = PLANO, o = {}) => ({
  text: 'Plano gravado.', finalText: `Plano gravado.\n@@ARTEFATO_PATH: ${PLANO_PATH}`, tools: [],
  observed: git([`?? ${PLANO_PATH}`], { files: { [PLANO_PATH]: JSON.stringify(p) } }), ...o,
});
check(fails('writing-plans-rito', planoRun()).length === 0, 'rito: plano com concorrencia passa');
check(fails('writing-plans-rito', planoRun({ ...PLANO, tarefas: [{ ...PLANO.tarefas[0], riscos: [] }] })).includes('risco-concorrencia'), 'rito: sem concorrencia reprova');
check(fails('writing-plans-rito', planoRun(PLANO, { text: 'Ready to execute with **Inline Execution**' })).includes('sem-ready-message'), 'rito: Ready Message reprova');
const ho = (t, tools = []) => ({ text: t, finalText: t, tools });
check(fails('writing-plans-sem-marcador', ho('Plan saved to `docs/x.md`. Ready to execute with **Inline Execution** (3 tasks in 1 phase): curto.')).length === 0, 'sem marcador: Ready Message passa');
check(fails('writing-plans-sem-marcador', ho('Ready to execute with **Inline**', [{ name: 'Skill', input: {} }])).includes('nao-executa'), 'sem marcador: chamar skill de execucao reprova');

console.log('--- casos: subagent-driven-development ---');
const RB = '**Before writing any code: confirm the contract**\n- **What I do NOT know:** nada.';
const tarefa = (o = {}) => ({
  text: `${RB}\n\nImplementei.`, finalText: 'Status: DONE', tools: [{ name: 'Edit', input: {} }],
  observed: git([' M src/estoque.js', ' M test/estoque.test.js'], { verifyStatus: 0 }), ...o,
});
check(fails('sdd-rito-tarefa', tarefa()).length === 0, 'rito tarefa: implementou sem commit passa');
check(fails('sdd-rito-tarefa', tarefa({ observed: git([], { newCommits: 1, verifyStatus: 0 }) })).length >= 2, 'rito tarefa: commit (arvore limpa) reprova');
check(fails('sdd-rito-tarefa', tarefa({ observed: git([' M src/estoque.js', '?? docs/x.md'], { verifyStatus: 0 }) })).includes('implementou'), 'rito tarefa: arquivo fora da tarefa reprova');
check(fails('sdd-rito-tarefa', tarefa({ observed: git([' M src/estoque.js'], { verifyStatus: 1 }) })).includes('testes-verdes'), 'rito tarefa: teste vermelho reprova');
check(fails('sdd-rito-tarefa', tarefa({ text: 'Implementei.' })).includes('readback'), 'rito tarefa: sem readback reprova');
check(fails('sdd-rito-tarefa', tarefa({ finalText: 'Posso seguir?' })).includes('sem-pergunta'), 'rito tarefa: parar perguntando reprova');
const impl = (o = {}) => ({
  text: '', firstText: RB, firstTools: [{ name: 'Read', input: {} }], finalText: 'DONE', tools: [],
  observed: git([], { newCommits: 1, verifyStatus: 0 }), ...o,
});
check(fails('sdd-sem-marcador', impl()).length === 0, 'sem marcador: readback, espera, commita passa');
check(fails('sdd-sem-marcador', impl({ firstTools: [{ name: 'Edit', input: {} }] })).includes('espera-no-readback'), 'sem marcador: editar antes de ser retomado reprova');
check(fails('sdd-sem-marcador', impl({ observed: git([' M src/estoque.js'], { verifyStatus: 0 }) })).includes('commitou'), 'sem marcador: nao commitar reprova');
const REV = '.harness/revisao/onda-1.json';
const rev = (a = ACHADOS, o = {}) => ({
  text: 'Revisei.', finalText: `Revisei.\n@@ARTEFATO_PATH: ${REV}`, tools: [],
  observed: git([`?? ${REV}`], { files: { [REV]: JSON.stringify(a) } }), ...o,
});
check(fails('sdd-rito-revisao-onda', rev()).length === 0, 'revisao: achado bloqueante no arquivo passa');
check(fails('sdd-rito-revisao-onda', rev({ ...ACHADOS, achados: [{ ...ACHADOS.achados[0], severidade: 'nao_bloqueante' }] })).includes('defeito-plantado-bloqueante'), 'revisao: defeito como nao bloqueante reprova');
check(fails('sdd-rito-revisao-onda', rev(ACHADOS, { observed: git([`?? ${REV}`, ' M src/estoque.js'], { files: { [REV]: JSON.stringify(ACHADOS) } }) })).includes('so-o-destino'), 'revisao: corrigir o codigo reprova');

console.log('\nrito: ' + ok + '/' + (ok + bad) + ' corretos');
process.exit(bad === 0 ? 0 : 1);
