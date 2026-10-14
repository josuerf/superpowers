# Cancelamento de reserva Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: implement this plan task-by-task with superpowers-prepared:subagent-driven-development.

**Goal:** uma reserva aberta pode ser cancelada, devolvendo a quantidade ao saldo do item.

**Architecture:** uma funcao nova em `src/estoque.js`, no mesmo estilo de `reservar`, e os testes dela.

**Tech Stack:** Node 24, CommonJS, `node --test`

**Spec:** n/a (demanda EST-7)

**Laudo:** n/a

**Harness:** README.md (convencoes)

## Global Constraints

- CommonJS; nenhuma dependencia nova.
- Mensagens de erro em portugues, sem acento, como as que ja existem.

## Blast Radius

| What changes | Who consumes it today | How it was verified (command) | Result | What happens to the consumer |
|---|---|---|---|---|
| `module.exports` de `src/estoque.js` | `test/estoque.test.js` | `grep -rn "require('../src/estoque')" .` | 1 | ganha `cancelarReserva`; nada muda para quem ja usa |

## Invariants

- O saldo de um item nunca passa do saldo antes das reservas: cancelar a mesma reserva duas vezes nao devolve a quantidade duas vezes (EST-7).
- `reservar` continua recusando quantidade invalida e saldo insuficiente (src/estoque.js:14-21).

## Review Focus

- Cancelar duas vezes a mesma reserva.

### Task 1: Cancelar reserva

**Files:**
- Modify: `src/estoque.js`
- Test: `test/estoque.test.js`

**Risk flags:** `none`

**Acceptance criteria:**
- `cancelarReserva(estoque, id)` devolve a quantidade ao saldo do item e tira a reserva das abertas.
- id inexistente, ou reserva ja cancelada, falha com `reserva inexistente`.

**Follow:** README.md (convencoes); `reservar` em `src/estoque.js` como irmao.

- [ ] **Step 1: Write the failing tests** `cancelar reserva devolve o saldo` e `cancelar duas vezes falha` em `test/estoque.test.js`.
- [ ] **Step 2: Run** `node --test` — Expected: FAIL
- [ ] **Step 3: Implement** `cancelarReserva(estoque, id): reserva` em `src/estoque.js`, exportada.
- [ ] **Step 4: Run** `node --test` — Expected: PASS
- [ ] **Step 5: Commit**

```bash
git add src/estoque.js test/estoque.test.js
git commit -m "feat: cancelar reserva

SDD-Plan: plan.md
SDD-Task: 1"
```
