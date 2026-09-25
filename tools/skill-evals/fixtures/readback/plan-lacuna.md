# Exportacao SIM-AM completa Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: implement this plan task-by-task with superpowers-prepared:subagent-driven-development.

**Goal:** O arquivo SIM-AM passa a trazer todas as propostas do exercicio.

**Architecture:** Uma clausula a menos na query nativa de exportacao.

**Tech Stack:** Java 8, Spring Boot 2, JUnit 4

**Spec:** docs/specs/2026-09-12-simam-completo.md

## Global Constraints

- Nivel de linguagem Java 8.
- O layout do arquivo SIM-AM e fixo e nao muda.

## Invariants

- Toda consulta de proposta continua restrita a entidade do usuario logado (PropostaRepository.java:12).

## Phase 1: Exportacao

**Depends on:** none
**Cohesion:** uma query e seu unico consumidor

### Task 1: Tirar a clausula de selecao da query de exportacao

**Files:**
- Modify: `src/main/java/br/gov/licitacao/repo/PropostaRepository.java`
- Test: `src/test/java/br/gov/licitacao/repo/PropostaRepositoryTest.java`

- [ ] **Step 1: Write failing test** — `buscarParaExportacao(1L, 2026)` retorna tambem proposta com `flag_selecionado = 'N'`.
- [ ] **Step 2: Run test to verify it fails** — `mvn -q test -Dtest=PropostaRepositoryTest`
- [ ] **Step 3: Implement** — remover a linha `AND p.flag_selecionado = 'S'` de `buscarParaExportacao`.
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**
