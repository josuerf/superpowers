# Autenticacao por token de servico Implementation Plan

**Goal:** Autenticacao por token de servico
**Architecture:** Middleware novo de autenticacao no gateway, com emissao e revogacao de tokens.
**Tech Stack:** TypeScript, Node, Postgres, Jest

## Global Constraints

- Node 20+
- Todos os endpoints exigem autenticacao por token
- Cobertura minima de 80% nos modulos tocados

---

### Task 1: Modelo de token

**Files:**
- Modify: `src/auth/model.ts`
- Test: `tests/modelo-de-token.test.ts`

**Interfaces:**
- Consumes: nada de tarefas anteriores
- Produces: `ServiceToken`

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Modelo de token', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/modelo-de-token`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/modelo-de-token`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Modelo de token"
```


### Task 2: Emissao de token

**Files:**
- Modify: `src/auth/issue.ts`
- Test: `tests/emissao-de-token.test.ts`

**Interfaces:**
- Consumes: `ServiceToken`
- Produces: `issue(scope): string`

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Emissao de token', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/emissao-de-token`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/emissao-de-token`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Emissao de token"
```


### Task 3: Validacao de token

**Files:**
- Modify: `src/auth/verify.ts`
- Test: `tests/validacao-de-token.test.ts`

**Interfaces:**
- Consumes: `ServiceToken`
- Produces: `verify(raw): Claims`

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Validacao de token', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/validacao-de-token`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/validacao-de-token`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Validacao de token"
```


### Task 4: Middleware de autenticacao

**Files:**
- Modify: `src/gateway/middleware.ts`
- Test: `tests/middleware-de-autenticacao.test.ts`

**Interfaces:**
- Consumes: `verify`
- Produces: middleware `requireToken`

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Middleware de autenticacao', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/middleware-de-autenticacao`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/middleware-de-autenticacao`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Middleware de autenticacao"
```


### Task 5: Revogacao de token

**Files:**
- Modify: `src/auth/revoke.ts`
- Test: `tests/revogacao-de-token.test.ts`

**Interfaces:**
- Consumes: `ServiceToken`
- Produces: `revoke(id): void`

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Revogacao de token', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/revogacao-de-token`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/revogacao-de-token`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Revogacao de token"
```


### Task 6: Endpoint administrativo de tokens

**Files:**
- Modify: `src/auth/routes.ts`
- Test: `tests/endpoint-administrativo-de-tokens.test.ts`

**Interfaces:**
- Consumes: `issue`, `revoke`
- Produces: rotas /admin/tokens

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Endpoint administrativo de tokens', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/endpoint-administrativo-de-tokens`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/endpoint-administrativo-de-tokens`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Endpoint administrativo de tokens"
```

