# skill-evals — eval de decisão (nível 1)

Mede **decisões** que as skills tomam, não a implementação que vem depois.
Barato e repetível: cada caso é uma invocação de `claude -p` que para no ponto
da decisão.

Para evals de comportamento ponta a ponta (implementação real, nota de
qualidade, tempo, tokens), o harness é outro — Quorum, em `evals/`, descrito em
`docs/testing.md`. Este aqui não o substitui; responde uma pergunta menor por um
custo muito menor.

## O que mede

| Suíte | Pergunta | Métrica |
|---|---|---|
| `visual-companion` | O companion é oferecido quando a demanda tem superfície visual? | sensibilidade (ofereceu quando devia) e falso positivo (ofereceu quando não devia) |
| `execution-choice` | O handoff escolhe inline ou subagentes, e justifica? | aderência ao default em casos limpos; desvio correto em casos com razão plantada |
| `blast-radius` | O plano enumera consumidores e irmãos com comando e contagem, e declara remoções no `Does NOT cover`? | casos aprovados (todos os checks); `teatro-negativo` confere no stream se a busca foi feita |
| `readback` | O implementador emite o readback antes de editar, reescreve os invariantes e declara a lacuna plantada? O revisor de plano nomeia o que o refutaria? | emissão, fidelidade (n-gramas copiados), honestidade, desconfirmação |
| `risk-flags` | O planejador atribui a `Risk flag` certa — e nenhuma onde não há risco? | casos aprovados; `trivial-none` mede falso positivo |

## Como funciona

O conteúdo da `SKILL.md` sob teste é injetado no prompt e o cenário vem logo
depois. Isso mede exatamente o que se está mudando — o texto da skill — sem
depender de ter o plugin instalado, e permite comparar dois refs lendo o arquivo
de cada um.

**Limite honesto:** isto **não** mede roteamento (se a skill seria ativada
sozinha a partir da fala do usuário). Mede o comportamento dado que ela está
carregada.

## Uso

```bash
node tools/skill-evals/make-fixtures.js          # gera os planos sintéticos
node tools/skill-evals/run.js --suite both --reps 3 --label baseline
node tools/skill-evals/score.js results/<arquivo>.json
node tools/skill-evals/score.js results/<antes>.json results/<depois>.json   # comparação
```

Opções de `run.js`: `--suite visual|execution|both|blast|readback|risk|all`,
`--reps N`, `--case ID`, `--model NOME`, `--label TEXTO`.

As três suítes por caso (`blast`, `readback`, `risk`) declaram `checks` no
JSON de cada caso, pontuados por `checks.js` (regex, eventos de ferramenta do
stream e sobreposição de n-gramas). Cada caso roda num diretório temporário
fora do repositório, com ferramentas de leitura liberadas e sem MCP
(`--strict-mcp-config`); `blast` copia para lá `fixtures/repos/licitacao`, e
`readback` gera o brief com o `scripts/task-brief` do ref em teste — é isso que
muda entre antes e depois. `SKILL_EVALS_BASH` troca o `bash` usado (no Windows,
o `bash` do PATH pode ser o do WSL).

## Como comparar antes/depois honestamente

As skills são os arquivos que o próprio harness carrega, então "antes" e
"depois" precisam de dois checkouts:

```bash
git worktree add /tmp/sp-antes <ref-anterior>
cd /tmp/sp-antes && node tools/skill-evals/run.js --suite both --reps 3 --label antes
```

Mesmos casos, mesmo modelo, mesmo número de repetições. O `score.js` com dois
arquivos imprime as métricas lado a lado.

## Decisões de medição deste ambiente

- **Tokens saem da soma do stream**, nunca do evento `result` final, que
  subestima o consumo em cerca de 5×.
- **Execução em série, nunca em paralelo.** Matar o processo pai não mata os
  filhos, e execuções concorrentes se contaminam.
- **O prompt vai por stdin**, porque a `SKILL.md` inteira estoura o limite de
  linha de comando do Windows.
- **Pontuação por regex, sem verificador LLM.** Isso é possível porque as duas
  decisões têm marcadores observáveis (a linha de checagem de superfície e a
  Ready Message em formato fixo). O detector de oferta tem um teste próprio de
  positivos e negativos sintéticos — se ele for alterado, rode-o antes de
  confiar em qualquer número.

## Onde este eval pode enganar

- Mede a presença do marcador, **não** se a oferta foi útil àquela demanda.
- Casos escritos depois de conhecer a correção tendem a favorecê-la. Os casos
  aqui foram escritos **antes** da alteração das skills, e há dois casos
  deliberadamente ambíguos (`surface: null`) que não entram em nenhuma das duas
  taxas — só são reportados.
- Com 3 repetições, só diferenças grandes são sinal. Uma variação de poucos
  pontos percentuais não é.
- **Os planos fixture são sintéticos e os agentes percebem.** Os passos repetem
  o mesmo teste e a mesma implementação de exemplo; já houve execução que
  apontou isso na resposta. Isso não contamina o que a suíte mede — a escolha
  depende de contagem de tarefas, fases, acoplamento e número de arquivos, e
  todos são reais nos fixtures — mas significa que a suíte não serve para
  avaliar qualidade de plano, só a decisão de handoff.
- `results/` não é versionado: cada arquivo carrega as respostas completas.
