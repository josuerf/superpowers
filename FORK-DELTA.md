# FORK-DELTA — o que o fork mudou em arquivos que o upstream também mantém

Cada linha aqui é um conflito futuro de `sync-upstream`. A regra do fork é que
essa lista só cresce quando não existe alternativa em arquivo próprio (§4.2 do
plano M). Antes de acrescentar uma linha, pergunte: dá para fazer isso num hook,
num script novo, ou no brief?

A tabela tem **uma linha por arquivo** com status `M` em
`git diff --name-status upstream/main..HEAD --diff-filter=M`.
`tests/fork-delta/test-fork-delta.sh` falha se um arquivo `M` não estiver aqui,
ou se uma linha daqui não for mais `M`.

Na coluna *Marcador*: `<!-- [fork] -->` / `# [fork]` / `// [fork]` marcam o que o
fork acrescentou (em conflito, o que tem marcador é do fork e fica). "nenhum
(pré-convenção)" é delta anterior ao card IAF-533, quando a convenção ainda não
existia. "só EOL" é arquivo que difere do upstream apenas em fim de linha
(CRLF de checkout no Windows): não é customização, e reverter para o EOL do
upstream tira a linha desta tabela.

| Arquivo | Delta do fork | Por que não deu para fazer fora | Marcador |
|---|---|---|---|
| `.antigravity-plugin/plugin.json` | identidade do fork (nome, autor, homepage, repositório) e versão do fork | o manifesto do Antigravity é único | nenhum (JSON não tem comentário) |
| `.claude-plugin/marketplace.json` | nome `superpowers-prepared`, autor "forked by josuerf", descrição e versão do fork | o manifesto do marketplace é único por plugin | nenhum (JSON; pré-convenção) |
| `.claude-plugin/plugin.json` | nome `superpowers-prepared`, versão e autor do fork | manifesto do plugin: identidade do pacote | nenhum (JSON; pré-convenção) |
| `.codex-plugin/plugin.json` | nome `superpowers-prepared`, versão; remove `"hooks": {}` | manifesto do plugin para Codex | nenhum (JSON; pré-convenção) |
| `.cursor-plugin/plugin.json` | nome/`displayName` do fork ("Superpowers Optimized"), versão | manifesto do plugin para Cursor | nenhum (JSON; pré-convenção) |
| `.devin-plugin/plugin.json` | nome `superpowers-prepared`, versão e autor do fork | manifesto do plugin para Devin | nenhum (JSON; pré-convenção) |
| `.github/FUNDING.yml` | `github: [josuerf]` no lugar de `[obra]` | arquivo único do GitHub | nenhum (pré-convenção) |
| `.gitignore` | ignora `dist/`, artefatos do harness e relatórios locais (`todo`, `loss-report.md`...) | o git lê um `.gitignore` por diretório; o da raiz é compartilhado | nenhum (pré-convenção) |
| `.hermes-plugin/__init__.py` | marcador de bootstrap e mensagens com `superpowers-prepared`; instalação `josuerf/superpowers-prepared` | o nome do plugin está embutido no código do loader | nenhum (pré-convenção) |
| `.hermes-plugin/plugin.yaml` | nome `superpowers-prepared`, versão, autor `josuerf` | manifesto do plugin para Hermes | nenhum (pré-convenção) |
| `.kimi-plugin/plugin.json` | só a versão do fork (7.0.1, card C123); o resto é igual ao upstream | o manifesto é único e carrega a versão | nenhum (JSON não tem comentário) |
| `.muse-plugin/marketplace.json` | só a versão do fork (7.0.1, card C123); o resto é igual ao upstream | o manifesto é único e carrega a versão | nenhum (JSON não tem comentário) |
| `.muse-plugin/plugin.json` | só a versão do fork (7.0.1, card C123); o resto é igual ao upstream | o manifesto é único e carrega a versão | nenhum (JSON não tem comentário) |
| `.opencode/INSTALL.md` | instalação reescrita para o repositório e o plugin do fork (Unix/Windows) | é o documento que o OpenCode aponta para instalar | nenhum (pré-convenção) |
| `README.md` | README do fork: badges, harness, `.harness.config.json`, duplicação/complexidade, carrasco | a página inicial do repositório é única | nenhum (pré-convenção) |
| `RELEASE-NOTES.md` | notas de release do fork (v6.x "Superpowers Optimized"), inclusive os syncs com o upstream | histórico de versões é um arquivo só | nenhum (pré-convenção) |
| `docs/README.opencode.md` | URLs e nomes de arquivo do plugin trocados para `superpowers-prepared` | documento de instalação do upstream, com o nome do pacote | nenhum (pré-convenção) |
| `gemini-extension.json` | só a versão do fork (7.0.1, card C123); o resto é igual ao upstream | o manifesto é único e carrega a versão | nenhum (JSON não tem comentário) |
| `hooks/hooks-cursor.json` | session-start com matcher `startup\|clear\|compact`, `context-engine.js` e `bash-compress-hook.js` (matcher `Bash`) no Cursor | o manifesto de hooks do Cursor é único | nenhum (JSON; pré-convenção) |
| `hooks/hooks.json` | card IAF-533: registra `sdd-trailer.js` (PreToolUse `Bash`) e `inject-harness-context.js` (PreToolUse `Task\|Agent`, opt-in por config); antes: `session-start` chamado direto por `bash`, verify-on-stop, stop-reminders e hooks do harness/carrasco | o manifesto de hooks do Claude Code é único | nenhum (JSON não tem comentário) |
| `hooks/run-hook.cmd` | 3 linhas `REM NOTE` sobre o limite de 8 argumentos | comentário no próprio wrapper | nenhum (pré-convenção) |
| `hooks/session-start` | card C123 (C-35): com `SUPERPOWERS_PREPARED_RITO=1` não gera `.harness.config.json` (a sessão do forge não escreve na árvore do Produto); checagem de atualização (git/marketplace), geração de `.harness.config.json`, contexto do harness no início da sessão; sync v7.0.0: bootstrap lido em bash puro (`$(<file)` + expansão, sem `awk`) para sobreviver a `PATH` quebrado | o upstream injeta o bootstrap neste script; não há ponto de extensão | `# [fork]` (card C123); pré-convenção no resto |
| `package.json` | card IAF-533: script `sdd:metrics` (`tools/sdd-metrics/collect.ts`); antes: nome/versão do fork, `main` do plugin OpenCode, scripts `harness:*`/`patterns:*`, config do Jest | npm lê um `package.json` só | nenhum (JSON não tem comentário) |
| `skills/brainstorming/SKILL.md` | card C123: uma linha abaixo do título, `@@RITO:` no pedido → ler `rito.md` desta pasta; sync v7.0.0 (esqueleto do upstream): blocos `[fork]` com opt-out que não pula os Quality Gates, harness como default do "how it gets made", leitura do repo/harness sem oferecer recon, diagrama junto do playback de fluxos, apelidos quick/bounded/architectural, mini-envelope (IAF-533), failure-mode check, caminho `docs/superpowers-prepared/specs/`, Quality Gates, red flags, checagem de superfície visual ampliada para fluxos/mapas mentais, companion local × Artifact; `description` de roteamento | a instrução precisa estar no texto que a skill carrega | `<!-- [fork] -->` em todos os blocos |
| `skills/brainstorming/builder-check-prompt.md` | sync v7.0.0: parágrafo "Count as guesses too" (regra do harness, invariante dos dados, regra regulatória/exportação) | é o prompt do construtor; o critério de chute mora nele | `<!-- [fork] -->` acima do bloco |
| `skills/brainstorming/scripts/server.cjs` | sync v7.0.0: `EACCES` conta como porta recusada e porta sorteada é sorteada de novo (até 10x); `server-info` gravado antes da linha `server-started` via tmp + rename; relógio de ociosidade começa no `listen` | o servidor do companion é do upstream; o bind e o anúncio moram aqui | `// [fork]` |
| `skills/executing-plans/SKILL.md` | card IAF-533: `--root projects/<repo>` do harness em workspace (sem marcador — ver pendência) e commit dos artefatos SDD antes de apagar o workspace quando o repo os versiona; sync v7.0.0: seguir **Follow**/Design Decisions e o harness, código do plano é intenção; antes: lote como unidade de despacho, prefixo `superpowers-prepared:` | o passo final da execução está nesta skill | `<!-- [fork] -->` (artefatos e Follow) |
| `skills/executing-plans/scripts/task-done` | chama `sdd-workspace` via `${BASH:-bash}` | exec bit perdido em pacote de marketplace (#2040); o script é do upstream | nenhum (pré-convenção) |
| `skills/executing-plans/scripts/task-start` | chama `task-brief` via `${BASH:-bash}` e lê o formato de saída do `task-brief` do fork (lotes) | idem; o parser da saída mora aqui | nenhum (pré-convenção) |
| `skills/requesting-code-review/SKILL.md` | card IAF-533: red team obrigatório quando o plano marca `Risk flags` diferente de `none`; antes: carrasco (revisão em chunks, configurável) e lote; sync v7.0.0: exemplo solto virou `## Example` com o `cut` do upstream | o gatilho da revisão está nesta skill | `<!-- [fork] -->` (card); pré-convenção no resto |
| `skills/requesting-code-review/code-reviewer.md` | card IAF-533: "What would prove you wrong" antes de fechar o relatório; antes: seção `## Inputs` com os placeholders | é o prompt que o revisor recebe | `<!-- [fork] -->` (card); pré-convenção no resto |
| `skills/subagent-driven-development/SKILL.md` | card C123: uma linha abaixo do título, `@@RITO:` no pedido → ler `rito.md` desta pasta; card IAF-533: `--root` por repositório, leitura do readback antes de retomar o implementador, red team em lote com `Risk flags` (tabela flag → categorias), Review Focus e `Ruling:` para o revisor, commit dos artefatos SDD; sync v7.0.0: preferir agentes, skills e playbooks do projeto a `general-purpose`; antes: lote como unidade de despacho, harness, limiar de escolha de execução | é a skill que o controlador segue; o fluxo de despacho é dela | `<!-- [fork] -->` / `<!-- [/fork] -->` (card); pré-convenção no resto |
| `skills/subagent-driven-development/implementer-prompt.md` | card IAF-533: Global constraints/Invariants do brief são normativos, primeira resposta é o readback do contrato, trailers `SDD-Plan`/`SDD-Task`/`SDD-Batch`; sync v7.0.0: seguir **Follow**/harness e não copiar código do plano, agente do projeto no lugar de `general-purpose`; antes: implementador por lote | é o prompt que o subagente lê | `<!-- [fork] -->` (card); pré-convenção no resto |
| `skills/subagent-driven-development/re-review-prompt.md` | card IAF-533: "What would prove you wrong" no re-review; antes: re-review por lote/chunk bloqueado | é o prompt do re-revisor | `<!-- [fork] -->` (card); pré-convenção no resto |
| `skills/subagent-driven-development/scripts/task-brief` | card IAF-533: 1 linha, anexa a saída de `task-brief-context` ao brief; antes: briefs por lote | o ponto de emissão do brief é aqui | `# [fork]` (card); pré-convenção no resto |
| `skills/subagent-driven-development/task-reviewer-prompt.md` | card IAF-533: ler métodos irmãos (`forge_siblings` ou grep com contagem), readback não é prova, "What would prove you wrong"; antes: revisor por lote | é o prompt do revisor de tarefa | `<!-- [fork] -->` (card); pré-convenção no resto |
| `skills/systematic-debugging/SKILL.md` | `description` reescrita (gatilhos) e prefixo `superpowers-prepared:` | roteamento depende da `description` da própria skill | nenhum (pré-convenção) |
| `skills/systematic-debugging/test-academic.md` | só EOL | — (sem customização) | só EOL |
| `skills/systematic-debugging/test-pressure-1.md` | só EOL | — (sem customização) | só EOL |
| `skills/systematic-debugging/test-pressure-2.md` | só EOL | — (sem customização) | só EOL |
| `skills/systematic-debugging/test-pressure-3.md` | só EOL | — (sem customização) | só EOL |
| `skills/test-driven-development/writing-good-tests.md` | seção "derive o dublê da interface, não do chamador"; prefixo `superpowers-prepared:` | é o material de referência que a skill de TDD carrega | nenhum (pré-convenção) |
| `skills/using-git-worktrees/SKILL.md` | `description` em bloco e abertura reescrita ("Required Start", defaults seguros) | roteamento e instrução moram na própria skill | nenhum (pré-convenção) |
| `skills/using-superpowers/SKILL.md` | `description` como requisito bloqueante (roteador de workflow), lote, prefixo `superpowers-prepared:` | é a skill de bootstrap que o session-start injeta | nenhum (pré-convenção) |
| `skills/using-superpowers/references/claude-code-tools.md` | prefixo `superpowers-prepared:` nas referências de skill | o nome da skill faz parte do texto | nenhum (pré-convenção) |
| `skills/using-superpowers/references/gemini-tools.md` | prefixo `superpowers-prepared:` nas referências de skill | idem | nenhum (pré-convenção) |
| `skills/using-superpowers/references/hermes-tools.md` | caminho `~/.hermes/plugins/superpowers-prepared/` | o caminho de instalação tem o nome do plugin | nenhum (pré-convenção) |
| `skills/verification-before-completion/SKILL.md` | skill reescrita: `description` com gatilhos de conclusão e exigência de saída de comando fresca | roteamento e regra moram na própria skill | nenhum (pré-convenção) |
| `skills/writing-plans/SKILL.md` | card C123: uma linha abaixo do título, `@@RITO:` no pedido → ler `rito.md` desta pasta; card IAF-533: campos `Laudo:`/`Harness:`, seções `## Blast Radius` (comando + contagem, `forge_*` ou grep, irmãos) e `## Invariants`, `Risk flags` no lugar de `Security flag`, trailers SDD no commit, item 8 do Self-Review; sync v7.0.0: parágrafo "o harness decide como o código fica", seção `## Design Decisions`, campos **Acceptance criteria** e **Follow** na task, proporção medida só sobre os passos, item 7 do Self-Review; antes: limiar derrotável na escolha de execução, lote, visual preview | o plano é o artefato do upstream; não há arquivo paralelo | `<!-- [fork] -->` / `# [fork]` (card); pré-convenção no resto |
| `skills/writing-skills/SKILL.md` | prefixo `superpowers-prepared:` nas referências de skill | o nome da skill faz parte do texto | nenhum (pré-convenção) |
| `skills/writing-skills/examples/CLAUDE_MD_TESTING.md` | só EOL | — (sem customização) | só EOL |
| `skills/writing-skills/persuasion-principles.md` | só EOL | — (sem customização) | só EOL |
| `skills/writing-skills/render-graphs.js` | só EOL | — (sem customização) | só EOL |
| `skills/writing-skills/testing-skills-with-subagents.md` | prefixo `superpowers-prepared:` nas referências de skill | o nome da skill faz parte do texto | nenhum (pré-convenção) |
| `tests/antigravity/test-plugin-manifest.sh` | nome `superpowers-prepared` e frase de bootstrap da `description` do fork ("invoke this skill BEFORE") | o teste cobre o manifesto que o fork rebatizou | `# [fork]` |
| `tests/brainstorm-server/lifecycle.test.js` | sync v7.0.0: caso `EACCES` (faixa excluída do Windows ou porta privilegiada), teto de partida 10s (`STARTUP_POLLS`), idle 1500ms no teste de WebSocket aberto | o teste cobre o servidor que o fork alterou | `// [fork]` |
| `tests/claude-code/test-sdd-workspace.sh` | regex aceita o sufixo ", N task(s)" da saída do `task-brief` do fork | o teste cobre o script que o fork alterou | `# [fork]` |
| `tests/devin/test-devin-plugin.sh` | espera o nome `superpowers-prepared` e o repositório do fork | o teste confere o manifesto renomeado | nenhum (pré-convenção) |
| `tests/hermes/test_bootstrap.py` | marcador de bootstrap e `skill_view` com `superpowers-prepared:` | idem, para Hermes | nenhum (pré-convenção) |
| `tests/hermes/test_plugin.py` | marcador de bootstrap com `superpowers-prepared:` | idem | nenhum (pré-convenção) |
| `tests/hooks/test-session-start.sh` | espera `bash "${CLAUDE_PLUGIN_ROOT}/hooks/session-start"` no lugar de `run-hook.cmd` | o teste cobre o registro que o fork mudou | nenhum (pré-convenção) |
| `tests/opencode/setup.sh` | arquivo do plugin `superpowers-prepared.js` | o nome do arquivo do plugin mudou | nenhum (pré-convenção) |
| `tests/opencode/test-bootstrap-caching.mjs` | usa `SuperpowersOptimizedPlugin` | o export do plugin OpenCode mudou de nome | nenhum (pré-convenção) |
| `tests/opencode/test-plugin-loading.sh` | link `plugins/superpowers-prepared.js` | o nome do arquivo do plugin mudou | nenhum (pré-convenção) |
| `tests/opencode/test-session-bootstrap.mjs` | `SuperpowersOptimizedPlugin` e marcador "You have superpowers-prepared." | idem | nenhum (pré-convenção) |
| `tests/opencode/test-session-bootstrap.sh` | caminho `.opencode/plugins/superpowers-prepared.js` | idem | nenhum (pré-convenção) |
| `tests/opencode/test-skill-registration.mjs` | marcador e fixture com `superpowers-prepared` | idem | nenhum (pré-convenção) |
| `tests/opencode/test-skill-registration.sh` | caminho `plugins/superpowers-prepared.js` | idem | nenhum (pré-convenção) |
| `tests/pi/test-pi-extension.mjs` | espera `pkg.name === 'superpowers-prepared'` | o teste confere o `package.json` renomeado | nenhum (pré-convenção) |

## Arquivos novos do fork que outras ferramentas leem (contrato)

Não entram na tabela (o teste só olha status `M`): são arquivos que só o fork
tem, logo sem conflito de `sync-upstream`. Estão aqui porque o forge do Iguaçu
Flow depende deles e o sync precisa preservar as linhas que apontam para eles.

- `skills/brainstorming/rito.md`, `skills/writing-plans/rito.md`,
  `skills/subagent-driven-development/rito.md` (card C123, `[fork]` na
  primeira linha do texto): o modo rito, lido só quando o pedido traz
  `@@RITO:`. O conflito possível no sync é a linha do marcador em cada
  `SKILL.md` (tabela acima): se o upstream mexer no título ou no parágrafo de
  abertura, a linha fica, logo abaixo do título.
- `tools/skill-evals/rito.js`, `rito-checks.js`, `rito-test.js`,
  `cases-modo-rito.json` e `fixtures/rito/` (card C123): a suíte
  `modo-rito`, que prova os dois lados (com e sem o marcador).
- `SUPERPOWERS_PREPARED_RITO=1` (card C123, contrato C-35 da fase 22): o forge
  passa a variável em toda sessão de etapa; `hooks/session-start` (linha da
  tabela) e `hooks/context-engine.js` deixam de escrever na pasta corrente,
  `hooks/track-edits.js` não mexe no `.gitignore`, e `hooks/verify-on-stop.js`
  e `hooks/stop-reminders.js` não bloqueiam o Stop com ordem de revisar ou
  commitar (os quatro são arquivos só do fork). Teste:
  `tests/hooks/test-rito-hooks.sh`.

## Arquivos que o upstream apagou e o fork manteve

Não entram na tabela (o teste só olha status `M`), mas reaparecem como conflito modify/delete se o fork mexer neles e o upstream os recriar.

- `skills/writing-plans/plan-document-reviewer-prompt.md`: o upstream removeu na v6.4.2 (nenhuma skill o despachava). O fork mantém porque o eval `revisor-plano-desconfirmatorio` (`tools/skill-evals/cases-readback.json`) o usa; ganhou as linhas Transcript e Harness no sync v7.0.0.
- `CLAUDE.md` da raiz: o upstream removeu na v6.4.2; o fork manteve a linha que aponta para `AGENTS.md`.
