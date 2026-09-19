# Portal de autoatendimento do contribuinte Implementation Plan

**Goal:** Portal de autoatendimento do contribuinte
**Architecture:** Tres modulos independentes: cadastro, debitos e emissao de guias.
**Tech Stack:** TypeScript, Node, Postgres, Jest

## Global Constraints

- Node 20+
- Todos os endpoints exigem autenticacao por token
- Cobertura minima de 80% nos modulos tocados

---

## Phase 1: Cadastro

**Depends on:** none
**Cohesion:** dados cadastrais do contribuinte


### Task 1: Cadastro parte 1

**Files:**
- Modify: `src/cadastro/part1.ts`
- Test: `tests/cadastro-parte-1.test.ts`

**Interfaces:**
- Consumes: nada de tarefas anteriores
- Produces: `cadastroPart1()`

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Cadastro parte 1', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/cadastro-parte-1`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/cadastro-parte-1`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Cadastro parte 1"
```


### Task 2: Cadastro parte 2

**Files:**
- Modify: `src/cadastro/part2.ts`
- Test: `tests/cadastro-parte-2.test.ts`

**Interfaces:**
- Consumes: `cadastroPart1`
- Produces: `cadastroPart2()`

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Cadastro parte 2', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/cadastro-parte-2`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/cadastro-parte-2`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Cadastro parte 2"
```


### Task 3: Cadastro parte 3

**Files:**
- Modify: `src/cadastro/part3.ts`
- Test: `tests/cadastro-parte-3.test.ts`

**Interfaces:**
- Consumes: `cadastroPart2`
- Produces: `cadastroPart3()`

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Cadastro parte 3', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/cadastro-parte-3`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/cadastro-parte-3`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Cadastro parte 3"
```


### Task 4: Cadastro parte 4

**Files:**
- Modify: `src/cadastro/part4.ts`
- Test: `tests/cadastro-parte-4.test.ts`

**Interfaces:**
- Consumes: `cadastroPart3`
- Produces: `cadastroPart4()`

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Cadastro parte 4', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/cadastro-parte-4`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/cadastro-parte-4`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Cadastro parte 4"
```


### Task 5: Cadastro parte 5

**Files:**
- Modify: `src/cadastro/part5.ts`
- Test: `tests/cadastro-parte-5.test.ts`

**Interfaces:**
- Consumes: `cadastroPart4`
- Produces: `cadastroPart5()`

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Cadastro parte 5', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/cadastro-parte-5`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/cadastro-parte-5`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Cadastro parte 5"
```


### Task 6: Cadastro parte 6

**Files:**
- Modify: `src/cadastro/part6.ts`
- Test: `tests/cadastro-parte-6.test.ts`

**Interfaces:**
- Consumes: `cadastroPart5`
- Produces: `cadastroPart6()`

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Cadastro parte 6', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/cadastro-parte-6`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/cadastro-parte-6`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Cadastro parte 6"
```


## Phase 2: Debitos

**Depends on:** none
**Cohesion:** consulta e composicao de debitos


### Task 7: Debitos parte 1

**Files:**
- Modify: `src/debitos/part1.ts`
- Test: `tests/debitos-parte-1.test.ts`

**Interfaces:**
- Consumes: nada de tarefas anteriores
- Produces: `debitosPart1()`

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Debitos parte 1', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/debitos-parte-1`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/debitos-parte-1`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Debitos parte 1"
```


### Task 8: Debitos parte 2

**Files:**
- Modify: `src/debitos/part2.ts`
- Test: `tests/debitos-parte-2.test.ts`

**Interfaces:**
- Consumes: `debitosPart1`
- Produces: `debitosPart2()`

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Debitos parte 2', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/debitos-parte-2`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/debitos-parte-2`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Debitos parte 2"
```


### Task 9: Debitos parte 3

**Files:**
- Modify: `src/debitos/part3.ts`
- Test: `tests/debitos-parte-3.test.ts`

**Interfaces:**
- Consumes: `debitosPart2`
- Produces: `debitosPart3()`

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Debitos parte 3', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/debitos-parte-3`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/debitos-parte-3`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Debitos parte 3"
```


### Task 10: Debitos parte 4

**Files:**
- Modify: `src/debitos/part4.ts`
- Test: `tests/debitos-parte-4.test.ts`

**Interfaces:**
- Consumes: `debitosPart3`
- Produces: `debitosPart4()`

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Debitos parte 4', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/debitos-parte-4`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/debitos-parte-4`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Debitos parte 4"
```


### Task 11: Debitos parte 5

**Files:**
- Modify: `src/debitos/part5.ts`
- Test: `tests/debitos-parte-5.test.ts`

**Interfaces:**
- Consumes: `debitosPart4`
- Produces: `debitosPart5()`

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Debitos parte 5', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/debitos-parte-5`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/debitos-parte-5`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Debitos parte 5"
```


### Task 12: Debitos parte 6

**Files:**
- Modify: `src/debitos/part6.ts`
- Test: `tests/debitos-parte-6.test.ts`

**Interfaces:**
- Consumes: `debitosPart5`
- Produces: `debitosPart6()`

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Debitos parte 6', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/debitos-parte-6`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/debitos-parte-6`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Debitos parte 6"
```


## Phase 3: Guias

**Depends on:** Phase 2
**Cohesion:** emissao e baixa de guias


### Task 13: Guias parte 1

**Files:**
- Modify: `src/guias/part1.ts`
- Test: `tests/guias-parte-1.test.ts`

**Interfaces:**
- Consumes: `debitosPart6`
- Produces: `guiasPart1()`

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Guias parte 1', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/guias-parte-1`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/guias-parte-1`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Guias parte 1"
```


### Task 14: Guias parte 2

**Files:**
- Modify: `src/guias/part2.ts`
- Test: `tests/guias-parte-2.test.ts`

**Interfaces:**
- Consumes: `guiasPart1`
- Produces: `guiasPart2()`

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Guias parte 2', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/guias-parte-2`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/guias-parte-2`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Guias parte 2"
```


### Task 15: Guias parte 3

**Files:**
- Modify: `src/guias/part3.ts`
- Test: `tests/guias-parte-3.test.ts`

**Interfaces:**
- Consumes: `guiasPart2`
- Produces: `guiasPart3()`

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Guias parte 3', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/guias-parte-3`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/guias-parte-3`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Guias parte 3"
```


### Task 16: Guias parte 4

**Files:**
- Modify: `src/guias/part4.ts`
- Test: `tests/guias-parte-4.test.ts`

**Interfaces:**
- Consumes: `guiasPart3`
- Produces: `guiasPart4()`

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Guias parte 4', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/guias-parte-4`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/guias-parte-4`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Guias parte 4"
```


### Task 17: Guias parte 5

**Files:**
- Modify: `src/guias/part5.ts`
- Test: `tests/guias-parte-5.test.ts`

**Interfaces:**
- Consumes: `guiasPart4`
- Produces: `guiasPart5()`

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Guias parte 5', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/guias-parte-5`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/guias-parte-5`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Guias parte 5"
```


### Task 18: Guias parte 6

**Files:**
- Modify: `src/guias/part6.ts`
- Test: `tests/guias-parte-6.test.ts`

**Interfaces:**
- Consumes: `guiasPart5`
- Produces: `guiasPart6()`

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Guias parte 6', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/guias-parte-6`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/guias-parte-6`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Guias parte 6"
```

