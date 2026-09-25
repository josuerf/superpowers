# Calculo de verba por agrupador Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: implement this plan task-by-task with superpowers-prepared:executing-plans.

**Goal:** `calcular` passa a considerar o agrupador da folha.

**Architecture:** Novo parametro em `CalculoVerbaService.calcular`.

**Tech Stack:** Java 8, JUnit 4

**Spec:** review-spec.md

## Global Constraints

- Nivel de linguagem Java 8.

## Blast Radius

| What changes | Who consumes it today | How it was verified (command) | Result | What happens to the consumer |
|---|---|---|---|---|
| `CalculoVerbaService.calcular` | nenhum consumidor relevante | revisado | ok | nada |

## Invariants

- O calculo continua retornando zero para verba nula.

## Review Focus

- Agrupador nulo.

### Task 1: Parametro codAgrupador

**Files:**
- Modify: `src/main/java/br/gov/licitacao/folha/CalculoVerbaService.java`
- Test: `src/test/java/br/gov/licitacao/folha/CalculoVerbaServiceTest.java`

**Risk flags:** `none`

- [ ] **Step 1: Write failing test** — `calcular(10L, 2L)` igual a 2x `calcular(10L, 1L)`.
- [ ] **Step 2: Run test to verify it fails** — `mvn -q test -Dtest=CalculoVerbaServiceTest`
- [ ] **Step 3: Implement** — `public BigDecimal calcular(Long codVerba, Long codAgrupador)`.
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**
