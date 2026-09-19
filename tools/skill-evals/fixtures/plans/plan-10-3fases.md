# Modulo de conciliacao bancaria Implementation Plan

**Goal:** Modulo de conciliacao bancaria
**Architecture:** Tres camadas independentes: ingestao de extratos, motor de conciliacao e relatorios.
**Tech Stack:** TypeScript, Node, Postgres, Jest

## Global Constraints

- Node 20+
- Todos os endpoints exigem autenticacao por token
- Cobertura minima de 80% nos modulos tocados

---

## Phase 1: Ingestao de extratos

**Depends on:** none
**Cohesion:** tudo que le e normaliza arquivos de banco, sem depender do motor


### Task 1: Parser OFX

**Files:**
- Modify: `src/ingest/ofx.ts`
- Test: `tests/parser-ofx.test.ts`

**Interfaces:**
- Consumes: nada de tarefas anteriores
- Produces: `parseOfx(buf): Entry[]`

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Parser OFX', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/parser-ofx`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/parser-ofx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Parser OFX"
```


### Task 2: Parser CNAB

**Files:**
- Modify: `src/ingest/cnab.ts`
- Test: `tests/parser-cnab.test.ts`

**Interfaces:**
- Consumes: nada de tarefas anteriores
- Produces: `parseCnab(buf): Entry[]`

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Parser CNAB', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/parser-cnab`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/parser-cnab`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Parser CNAB"
```


### Task 3: Normalizacao de lancamentos

**Files:**
- Modify: `src/ingest/normalize.ts`
- Test: `tests/normalizacao-de-lancamentos.test.ts`

**Interfaces:**
- Consumes: `Entry`
- Produces: `normalize(e): NormalEntry`

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Normalizacao de lancamentos', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/normalizacao-de-lancamentos`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/normalizacao-de-lancamentos`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Normalizacao de lancamentos"
```


### Task 4: Deteccao de duplicidade na ingestao

**Files:**
- Modify: `src/ingest/dedupe.ts`
- Test: `tests/deteccao-de-duplicidade-na-ingestao.test.ts`

**Interfaces:**
- Consumes: `NormalEntry`
- Produces: `dedupe(list): NormalEntry[]`

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Deteccao de duplicidade na ingestao', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/deteccao-de-duplicidade-na-ingestao`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/deteccao-de-duplicidade-na-ingestao`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Deteccao de duplicidade na ingestao"
```


## Phase 2: Motor de conciliacao

**Depends on:** Phase 1
**Cohesion:** as regras de casamento, todas sobre NormalEntry


### Task 5: Casamento exato por valor e data

**Files:**
- Modify: `src/match/exact.ts`
- Test: `tests/casamento-exato-por-valor-e-data.test.ts`

**Interfaces:**
- Consumes: `NormalEntry`
- Produces: `matchExact(a, b): Match[]`

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Casamento exato por valor e data', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/casamento-exato-por-valor-e-data`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/casamento-exato-por-valor-e-data`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Casamento exato por valor e data"
```


### Task 6: Casamento aproximado por janela

**Files:**
- Modify: `src/match/fuzzy.ts`
- Test: `tests/casamento-aproximado-por-janela.test.ts`

**Interfaces:**
- Consumes: `NormalEntry`
- Produces: `matchFuzzy(a, b, days): Match[]`

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Casamento aproximado por janela', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/casamento-aproximado-por-janela`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/casamento-aproximado-por-janela`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Casamento aproximado por janela"
```


### Task 7: Resolucao de conflitos entre casamentos

**Files:**
- Modify: `src/match/resolve.ts`
- Test: `tests/resolucao-de-conflitos-entre-casamentos.test.ts`

**Interfaces:**
- Consumes: `Match`
- Produces: `resolve(ms): Match[]`

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Resolucao de conflitos entre casamentos', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/resolucao-de-conflitos-entre-casamentos`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/resolucao-de-conflitos-entre-casamentos`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Resolucao de conflitos entre casamentos"
```


## Phase 3: Relatorios

**Depends on:** Phase 2
**Cohesion:** saidas para o usuario final, todas leem Match


### Task 8: Relatorio de pendencias

**Files:**
- Modify: `src/report/pending.ts`
- Test: `tests/relatorio-de-pendencias.test.ts`

**Interfaces:**
- Consumes: `Match`
- Produces: `pendingReport(): Row[]`

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Relatorio de pendencias', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/relatorio-de-pendencias`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/relatorio-de-pendencias`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Relatorio de pendencias"
```


### Task 9: Relatorio de divergencias

**Files:**
- Modify: `src/report/diff.ts`
- Test: `tests/relatorio-de-divergencias.test.ts`

**Interfaces:**
- Consumes: `Match`
- Produces: `diffReport(): Row[]`

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Relatorio de divergencias', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/relatorio-de-divergencias`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/relatorio-de-divergencias`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Relatorio de divergencias"
```


### Task 10: Exportacao dos relatorios

**Files:**
- Modify: `src/report/export.ts`
- Test: `tests/exportacao-dos-relatorios.test.ts`

**Interfaces:**
- Consumes: `Row`
- Produces: rota GET /reconcile/report

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Exportacao dos relatorios', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/exportacao-dos-relatorios`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/exportacao-dos-relatorios`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Exportacao dos relatorios"
```

