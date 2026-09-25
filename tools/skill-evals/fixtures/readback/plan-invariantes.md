# Filtro por status na consulta por modalidade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: implement this plan task-by-task with superpowers-prepared:subagent-driven-development.

**Goal:** `buscarPorModalidade` passa a retornar so propostas ativas.

**Architecture:** Uma clausula a mais na query nativa de modalidade e o teste do repositorio.

**Tech Stack:** Java 8, Spring Boot 2, JUnit 4

**Spec:** docs/specs/2026-09-10-modalidade-ativa.md

**Laudo:** n/a

**Harness:** engineering/java/conventions.md

## Global Constraints

- Nivel de linguagem Java 8; nada de `var` nem APIs do Java 9+.
- Queries nativas continuam em `@Query(nativeQuery = true)`; nada de Criteria.

## Blast Radius

| What changes | Who consumes it today | How it was verified (command) | Result | What happens to the consumer |
|---|---|---|---|---|
| `PropostaRepository.buscarPorModalidadeNativo` | `buscarPorModalidade` | `grep -rn "buscarPorModalidade" src/` | 2 | passa a receber so ativas |

## Invariants

- Toda consulta de proposta continua restrita a entidade do usuario logado: o filtro `cod_entidade` que ja existe nas queries tocadas nao sai (PropostaRepository.java:12).
- Propostas com `flag_selecionado = 'S'` continuam sendo as unicas que entram no arquivo do SIM-AM (laudo ADM-2845 §5).

## Review Focus

- Modalidade nula.

## Phase 1: Consulta

**Depends on:** none
**Cohesion:** uma query e seu teste

### Task 1: Clausula de status na query de modalidade

**Files:**
- Modify: `src/main/java/br/gov/licitacao/repo/PropostaRepository.java`
- Test: `src/test/java/br/gov/licitacao/repo/PropostaRepositoryTest.java`

**Risk flags:** `data-migration`

- [ ] **Step 1: Write failing test** — `buscarPorModalidade("PREGAO")` nao retorna proposta `CANCELADA`.
- [ ] **Step 2: Run test to verify it fails** — `mvn -q test -Dtest=PropostaRepositoryTest`
- [ ] **Step 3: Implement** — acrescentar `AND p.status = 'ATIVA'` em `buscarPorModalidadeNativo`.
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**
