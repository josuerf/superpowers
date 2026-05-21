# Quality Gate Analysis — Superpowers Prepared Harness

**Date:** 2026-05-21
**Scope:** Análise profunda do quality gate do harness superpowers-prepared, cobrindo análise estática, complexidade, code smells, race conditions e arquitetura de review.

---

## 1. Visão Geral do Quality Gate

O harness opera em dois modos principais:

| Modo | Pipeline |
|------|----------|
| `verify-local` (fast) | completeness → lint → typecheck → test → coverage → patterns |
| `verify-all` (full) | verify-local + security → integration → domain-specific → dead-code → drift-analysis |

O quality gate é executado via `npx ts-node tools/harness/cli.ts <command>`.

---

## 2. Análise de Duplicação de Código

### Status: **PARCIALMENTE COBERTO (apenas via review LLM, sem ferramenta estática)**

**O que existe:**

- **Base prompt do reviewer** (`lib/harness/reviewers/base-prompt.md:18`): Inclui "DRY (Don't Repeat Yourself) — duplicated logic must be modularized" no Universal Engineering Checklist. Isso significa que o **subagente de code review** é instruído a identificar duplicação de código como parte da revisão.
- **Stack-specific prompts**: Alguns stacks mencionam deduplicação específica (ex: `node-elysia.md` para plugin deduplication, `node-drizzle-typeorm.md` para schema reuse).
- **Wiki Linter** (`lib/patterns/linter.ts`): Detecta padrões duplicados na wiki de padrões (não no código do projeto).

**O que NÃO existe:**

- **Nenhuma ferramenta estática de detecção de clones/duplicação** como `jscpd`, `PMD CPD`, `sonar-scanner`, ou similar.
- O harness **não executa** análise automática de duplicação como parte do pipeline `verify-local` ou `verify-all`.
- Não há validador `validators/duplication.ts` ou equivalente.

**Gap:** A detecção de duplicação depende inteiramente da capacidade do LLM reviewer de identificar código repetido visualmente no diff. Para diffs grandes ou duplicação sutil entre arquivos, isso é propenso a falhas.

**Recomendação:** Adicionar `jscpd` ou ferramenta similar como etapa opcional no `verify-all`, com threshold configurável (ex: 5% duplication rate).

---

## 3. Análise de Complexidade Ciclomática

### Status: **NÃO COBERTO**

**O que existe:**

- **Nenhum validador de complexidade ciclomática** no harness.
- **Nenhuma referência** a métricas McCabe, `eslint-complexity`, `codeclimate`, ou similar no código do harness.
- O termo "complexity" aparece apenas no contexto de **classificação de tarefas** (micro/lightweight/full no `using-superpowers`) e **complexidade de task** para seleção de modelo no subagent-driven-development.

**O que NÃO existe:**

- Não há `validators/complexity.ts` ou equivalente.
- O `validateLint` executa apenas `eslint . --format stylish` — que poderia incluir complexidade se o plugin `eslint-plugin-complexity` fosse configurado, mas **não é**.
- Os prompts de review (base-prompt, code-reviewer.md, code-quality-reviewer-prompt.md) **não mencionam** complexidade ciclomática como critério de avaliação.

**Gap total:** Não há nenhuma análise — estática ou via LLM — de complexidade ciclomática do código sendo desenvolvido.

**Recomendação:**
1. Adicionar `eslint-plugin-complexity` com threshold (ex: max 10) como parte do step de lint.
2. Incluir verificação de complexidade no code quality reviewer prompt.

---

## 4. Análise de Code Smells / Possíveis Bugs no Review

### Status: **COBERTO (via LLM review + Semgrep)**

**O que existe:**

#### 4.1 Code Quality Review (LLM-based)
- **Two-stage review no subagent-driven-development:**
  1. **Spec Reviewer** (`spec-reviewer-prompt.md`): Verifica conformidade com requisitos
  2. **Code Quality Reviewer** (`code-quality-reviewer-prompt.md` → `requesting-code-review/code-reviewer.md`): Verifica qualidade do código

- **Base Prompt do Reviewer** (`base-prompt.md`): Checklist universal incluindo:
  - SOLID principles
  - Clean Code conventions
  - Design patterns (YAGNI)
  - Error handling resiliente
  - Low coupling / High cohesion
  - Performance (N+1 queries, re-renders)
  - DRY

- **Code Reviewer Template** (`code-reviewer.md`): Verifica:
  - Plan alignment
  - Code quality (separation of concerns, error handling, type safety, DRY, edge cases)
  - Architecture (design decisions, scalability, security)
  - Testing (real behavior, edge cases, integration)
  - Production readiness (migrations, backward compatibility, documentation)

#### 4.2 Semgrep (estático)
- **Security validator** (`validators/security.ts`): Executa `npx semgrep --config=auto --json --quiet .`
- Semgrep detecta automaticamente muitos code smells e bugs comuns (SQL injection, XSS, hardcoded secrets, etc.)
- Integrado no `verify-all` (security step) e `verify-security`

#### 4.3 Pattern Catalog (error patterns)
- **Patterns validator** (`validators/patterns.ts`): Verifica código contra um catálogo de padrões de erro conhecidos via regex
- Patterns com severity "high" **bloqueiam** o build

#### 4.4 Self-Review do Implementer
- **Implementer prompt** (`implementer-prompt.md:83-106`): Instrui o implementer a fazer self-review antes de reportar, cobrindo:
  - Completude
  - Qualidade
  - Disciplina (YAGNI)
  - Testing

**O que poderia melhorar:**
- Não há separação explícita de "code smell" vs "bug" nos prompts — ambos caem sob "Issues" genéricos
- Semgrep roda apenas no `verify-all`, não no `verify-local` (fast path)

---

## 5. Análise de Race Conditions

### Status: **COBERTO (apenas via Red Team agent, não estático)**

**O que existe:**

#### 5.1 Red Team Agent (`agents/red-team.md`)
- **Categoria 4: Concurrency & Timing** (linha 57-62):
  - Race conditions: duas requests modificando o mesmo recurso simultaneamente
  - TOCTOU (time-of-check to time-of-use)
  - Deadlocks: circular lock acquisition
  - Lost updates: read-modify-write sem locking
  - Stale closures: callbacks que capturam variáveis que mudaram

- **Categoria 3: State Corruption** (linha 50-55):
  - Partial writes e rollback
  - Cache invalidation
  - Retry semantics / idempotency
  - Ordering assumptions

- O Red Team é **dispatchado em paralelo** com o code reviewer quando mudanças tocam: lógica complexa, concorrência, state machines, data pipelines, retry/rollback logic.

#### 5.2 Stack-Specific Checks
- **node-drizzle-typeorm.md:20**: "Reject check-then-insert patterns (race condition risk). Use `.onConflictDoUpdate()` for atomic upserts."
- **node-express.md:5-6**: "No Event Loop Blocking" e "Async-First I/O"
- **react-nextjs.md** (via `server-no-shared-module-state.md`): "Server renders can run concurrently... race conditions, cross-request contamination"

#### 5.3 Auto-Fix Pipeline
- Quando o Red Team encontra Critical/High findings (incluindo race conditions), o auto-fix pipeline:
  1. Escreve um teste que falha (provando o cenário)
  2. Aplica o fix mínimo
  3. Re-roda o test suite

**O que NÃO existe:**
- **Nenhuma ferramenta estática** de detecção de race conditions (ex: ThreadSanitizer, Go race detector, `eslint-plugin-react-hooks` para stale closures)
- A análise de race conditions é **100% dependente do LLM Red Team** — se o Red Team não for dispatchado (task não considerada "complexa"), não há análise de concorrência.

**Gap:** O Red Team é **opcional** — dispara apenas quando mudanças tocam áreas específicas. Para código concorrente que não é classificado como "complexo", race conditions podem passar sem detecção.

---

## 6. Arquitetura de Review: Single vs Multi Subagent

### Status: **MULTI-SUBAGENT COM GATES SEPARADOS (bem arquitetado)**

#### 6.1 Subagent-Driven Development

O fluxo usa **subagentes separados por responsabilidade**:

```
Per Task:
┌─────────────────────┐
│ Implementer Subagent │  ← Fresh subagent, contexto isolado
│ (implementa + testa  │
│  + self-review)      │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ Spec Reviewer        │  ← Subagent separado
│ (conformidade com    │     Foca APENAS em: requirements met?
│  requisitos)         │     Missing scope? Extra scope?
└─────────┬───────────┘
          │ Se PASS
          ▼
┌─────────────────────┐
│ Code Quality Reviewer│  ← Subagent separado
│ (qualidade do código)│     Foca APENAS em: clean code, architecture,
│                      │     security, testing, production readiness
└─────────┬───────────┘
          │ Se PASS
          ▼
    Task Complete
```

**Detalhes importantes:**

- **Cada subagent é fresco** — não herda contexto da sessão pai (`SKILL.md:193-201`)
- **Dois gates sequenciais**: spec review DEVE passar antes de quality review (`SKILL.md:354`)
- **Loop de correção**: Se review falha, retorna ao implementer → fix → re-review
- **Contexto mínimo**: `extract-boundary` fornece apenas tipos, interfaces e function signatures necessários

#### 6.2 Requesting Code Review (nível mais alto)

Quando o `requesting-code-review` é invocado (após tasks ou antes de merge):

```
requesting-code-review
├── Code Reviewer Subagent (sempre)
│   └── Checklist: OWASP, CWE, spec alignment, correctness, test quality
│
└── Red Team Subagent (condicional, em paralelo)
    └── Adversarial: race conditions, state corruption, resource exhaustion
    └── Dispara quando: complex logic, concurrency, state machines, data pipelines
```

#### 6.3 Context Passing

**Como o contexto é passado entre subagentes:**

| De | Para | O que é passado |
|---|------|-----------------|
| Main Agent | Implementer | Task text, constraints, file paths, pattern catalog |
| Implementer | Spec Reviewer | Requirements, implementation summary, diff |
| Implementer | Quality Reviewer | WHAT_WAS_IMPLEMENTED, BASE_SHA, HEAD_SHA, plan reference |
| Main Agent | Red Team | Changed files, git diff, stack modules |

**O que é bem feito:**
- Cada subagent recebe **apenas o contexto necessário** (context isolation)
- SHAs do git são passados para review baseado em diff real
- Pattern catalog é injetado tanto no implementer quanto no reviewer

**O que poderia melhorar:**
- Não há um "review orchestrator" dedicado — o Main Agent coordena tudo
- Se o Main Agent tem viés ou perde contexto, afeta toda a pipeline
- O spec reviewer e quality reviewer **não compartilham findings** entre si — poderiam aprender um com o outro

---

## 7. Resumo dos Gaps

| Análise | Cobertura | Tipo | Gap |
|---------|-----------|------|-----|
| Duplicação de código | Parcial | LLM review apenas | Sem ferramenta estática (jscpd, etc.) |
| Complexidade ciclomática | **Nenhuma** | — | Sem plugin eslint, sem validador, sem menção nos prompts |
| Code smells / bugs | Bom | LLM + Semgrep + Patterns | Semgrep só no verify-all |
| Race conditions | Parcial | Red Team LLM apenas | Sem ferramenta estática, Red Team é condicional |
| Arquitetura de review | Bom | Multi-subagent | Main Agent como single point, sem cross-learning entre reviewers |

---

## 8. Recomendações Prioritárias

1. **Alta prioridade:** Adicionar análise de complexidade ciclomática via `eslint-plugin-complexity` no step de lint
2. **Alta prioridade:** Adicionar `jscpd` como step opcional no `verify-all` para detecção estática de duplicação
3. **Média prioridade:** Incluir Semgrep também no `verify-local` (pelo menos regras de segurança críticas)
4. **Média prioridade:** Tornar Red Team obrigatório para qualquer código com async/concurrency patterns (não apenas "complexo")
5. **Baixa prioridade:** Adicionar cross-review findings sharing entre spec reviewer e quality reviewer
