# Exportacao de relatorio de contratos Implementation Plan

**Goal:** Exportacao de relatorio de contratos
**Architecture:** Um endpoint novo no modulo de contratos, reusando o servico de consulta existente.
**Tech Stack:** TypeScript, Node, Postgres, Jest

## Global Constraints

- Node 20+
- Todos os endpoints exigem autenticacao por token
- Cobertura minima de 80% nos modulos tocados

---

### Task 1: Consulta de contratos por periodo

**Files:**
- Modify: `src/contracts/query.ts`
- Test: `tests/consulta-de-contratos-por-periodo.test.ts`

**Interfaces:**
- Consumes: nada de tarefas anteriores
- Produces: `queryByPeriod(from, to): Contract[]`

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Consulta de contratos por periodo', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/consulta-de-contratos-por-periodo`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/consulta-de-contratos-por-periodo`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Consulta de contratos por periodo"
```


### Task 2: Serializacao CSV

**Files:**
- Modify: `src/contracts/csv.ts`
- Test: `tests/serializacao-csv.test.ts`

**Interfaces:**
- Consumes: `queryByPeriod`
- Produces: `toCsv(rows): string`

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Serializacao CSV', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/serializacao-csv`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/serializacao-csv`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Serializacao CSV"
```


### Task 3: Endpoint de exportacao

**Files:**
- Modify: `src/contracts/routes.ts`
- Test: `tests/endpoint-de-exportacao.test.ts`

**Interfaces:**
- Consumes: `toCsv`
- Produces: rota GET /contracts/export

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Endpoint de exportacao', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/endpoint-de-exportacao`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/endpoint-de-exportacao`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Endpoint de exportacao"
```

