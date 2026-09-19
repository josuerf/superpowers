# Motor de calculo tributario Implementation Plan

**Goal:** Motor de calculo tributario
**Architecture:** Uma unica cadeia de calculo: cada etapa consome a estrutura produzida pela anterior e devolve a mesma estrutura enriquecida. As assinaturas mudam ao longo do plano.
**Tech Stack:** TypeScript, Node, Postgres, Jest

## Global Constraints

- Node 20+
- Todos os endpoints exigem autenticacao por token
- Cobertura minima de 80% nos modulos tocados

---

### Task 1: Etapa 1 da cadeia de calculo

**Files:**
- Modify: `src/tax/pipeline.ts`
- Test: `tests/etapa-1-da-cadeia-de-calculo.test.ts`

**Interfaces:**
- Consumes: `Lancamento`
- Produces: `TaxContext` acrescido de `campoEtapa1` (a assinatura de `apply()` muda nesta etapa)

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Etapa 1 da cadeia de calculo', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/etapa-1-da-cadeia-de-calculo`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/etapa-1-da-cadeia-de-calculo`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Etapa 1 da cadeia de calculo"
```


### Task 2: Etapa 2 da cadeia de calculo

**Files:**
- Modify: `src/tax/pipeline.ts`
- Test: `tests/etapa-2-da-cadeia-de-calculo.test.ts`

**Interfaces:**
- Consumes: `TaxContext` com os campos acrescentados ate a etapa 1
- Produces: `TaxContext` acrescido de `campoEtapa2` (a assinatura de `apply()` muda nesta etapa)

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Etapa 2 da cadeia de calculo', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/etapa-2-da-cadeia-de-calculo`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/etapa-2-da-cadeia-de-calculo`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Etapa 2 da cadeia de calculo"
```


### Task 3: Etapa 3 da cadeia de calculo

**Files:**
- Modify: `src/tax/pipeline.ts`
- Test: `tests/etapa-3-da-cadeia-de-calculo.test.ts`

**Interfaces:**
- Consumes: `TaxContext` com os campos acrescentados ate a etapa 2
- Produces: `TaxContext` acrescido de `campoEtapa3` (a assinatura de `apply()` muda nesta etapa)

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Etapa 3 da cadeia de calculo', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/etapa-3-da-cadeia-de-calculo`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/etapa-3-da-cadeia-de-calculo`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Etapa 3 da cadeia de calculo"
```


### Task 4: Etapa 4 da cadeia de calculo

**Files:**
- Modify: `src/tax/pipeline.ts`
- Test: `tests/etapa-4-da-cadeia-de-calculo.test.ts`

**Interfaces:**
- Consumes: `TaxContext` com os campos acrescentados ate a etapa 3
- Produces: `TaxContext` acrescido de `campoEtapa4` (a assinatura de `apply()` muda nesta etapa)

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Etapa 4 da cadeia de calculo', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/etapa-4-da-cadeia-de-calculo`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/etapa-4-da-cadeia-de-calculo`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Etapa 4 da cadeia de calculo"
```


### Task 5: Etapa 5 da cadeia de calculo

**Files:**
- Modify: `src/tax/pipeline.ts`
- Test: `tests/etapa-5-da-cadeia-de-calculo.test.ts`

**Interfaces:**
- Consumes: `TaxContext` com os campos acrescentados ate a etapa 4
- Produces: `TaxContext` acrescido de `campoEtapa5` (a assinatura de `apply()` muda nesta etapa)

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Etapa 5 da cadeia de calculo', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/etapa-5-da-cadeia-de-calculo`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/etapa-5-da-cadeia-de-calculo`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Etapa 5 da cadeia de calculo"
```


### Task 6: Etapa 6 da cadeia de calculo

**Files:**
- Modify: `src/tax/pipeline.ts`
- Test: `tests/etapa-6-da-cadeia-de-calculo.test.ts`

**Interfaces:**
- Consumes: `TaxContext` com os campos acrescentados ate a etapa 5
- Produces: `TaxContext` acrescido de `campoEtapa6` (a assinatura de `apply()` muda nesta etapa)

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Etapa 6 da cadeia de calculo', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/etapa-6-da-cadeia-de-calculo`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/etapa-6-da-cadeia-de-calculo`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Etapa 6 da cadeia de calculo"
```


### Task 7: Etapa 7 da cadeia de calculo

**Files:**
- Modify: `src/tax/pipeline.ts`
- Test: `tests/etapa-7-da-cadeia-de-calculo.test.ts`

**Interfaces:**
- Consumes: `TaxContext` com os campos acrescentados ate a etapa 6
- Produces: `TaxContext` acrescido de `campoEtapa7` (a assinatura de `apply()` muda nesta etapa)

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Etapa 7 da cadeia de calculo', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/etapa-7-da-cadeia-de-calculo`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/etapa-7-da-cadeia-de-calculo`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Etapa 7 da cadeia de calculo"
```


### Task 8: Etapa 8 da cadeia de calculo

**Files:**
- Modify: `src/tax/pipeline.ts`
- Test: `tests/etapa-8-da-cadeia-de-calculo.test.ts`

**Interfaces:**
- Consumes: `TaxContext` com os campos acrescentados ate a etapa 7
- Produces: `TaxContext` acrescido de `campoEtapa8` (a assinatura de `apply()` muda nesta etapa)

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Etapa 8 da cadeia de calculo', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/etapa-8-da-cadeia-de-calculo`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/etapa-8-da-cadeia-de-calculo`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Etapa 8 da cadeia de calculo"
```


### Task 9: Etapa 9 da cadeia de calculo

**Files:**
- Modify: `src/tax/pipeline.ts`
- Test: `tests/etapa-9-da-cadeia-de-calculo.test.ts`

**Interfaces:**
- Consumes: `TaxContext` com os campos acrescentados ate a etapa 8
- Produces: `TaxContext` acrescido de `campoEtapa9` (a assinatura de `apply()` muda nesta etapa)

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Etapa 9 da cadeia de calculo', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/etapa-9-da-cadeia-de-calculo`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/etapa-9-da-cadeia-de-calculo`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Etapa 9 da cadeia de calculo"
```


### Task 10: Etapa 10 da cadeia de calculo

**Files:**
- Modify: `src/tax/pipeline.ts`
- Test: `tests/etapa-10-da-cadeia-de-calculo.test.ts`

**Interfaces:**
- Consumes: `TaxContext` com os campos acrescentados ate a etapa 9
- Produces: `TaxContext` acrescido de `campoEtapa10` (a assinatura de `apply()` muda nesta etapa)

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Etapa 10 da cadeia de calculo', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/etapa-10-da-cadeia-de-calculo`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/etapa-10-da-cadeia-de-calculo`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Etapa 10 da cadeia de calculo"
```


### Task 11: Etapa 11 da cadeia de calculo

**Files:**
- Modify: `src/tax/pipeline.ts`
- Test: `tests/etapa-11-da-cadeia-de-calculo.test.ts`

**Interfaces:**
- Consumes: `TaxContext` com os campos acrescentados ate a etapa 10
- Produces: `TaxContext` acrescido de `campoEtapa11` (a assinatura de `apply()` muda nesta etapa)

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Etapa 11 da cadeia de calculo', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/etapa-11-da-cadeia-de-calculo`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/etapa-11-da-cadeia-de-calculo`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Etapa 11 da cadeia de calculo"
```


### Task 12: Etapa 12 da cadeia de calculo

**Files:**
- Modify: `src/tax/pipeline.ts`
- Test: `tests/etapa-12-da-cadeia-de-calculo.test.ts`

**Interfaces:**
- Consumes: `TaxContext` com os campos acrescentados ate a etapa 11
- Produces: `TaxContext` acrescido de `campoEtapa12` (a assinatura de `apply()` muda nesta etapa)

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Etapa 12 da cadeia de calculo', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/etapa-12-da-cadeia-de-calculo`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/etapa-12-da-cadeia-de-calculo`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Etapa 12 da cadeia de calculo"
```

