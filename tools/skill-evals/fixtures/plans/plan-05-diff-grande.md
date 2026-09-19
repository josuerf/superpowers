# Troca da biblioteca de acesso a dados Implementation Plan

**Goal:** Troca da biblioteca de acesso a dados
**Architecture:** Substituicao do ORM em todo o projeto. Poucas tarefas, cada uma varrendo dezenas de arquivos.
**Tech Stack:** TypeScript, Node, Postgres, Jest

## Global Constraints

- Node 20+
- Todos os endpoints exigem autenticacao por token
- Cobertura minima de 80% nos modulos tocados

---

### Task 1: Trocar a camada de repositorios

**Files:**
- Modify: `src/repo/r1.ts`
- Modify: `src/repo/r2.ts`
- Modify: `src/repo/r3.ts`
- Modify: `src/repo/r4.ts`
- Modify: `src/repo/r5.ts`
- Modify: `src/repo/r6.ts`
- Modify: `src/repo/r7.ts`
- Modify: `src/repo/r8.ts`
- Modify: `src/repo/r9.ts`
- Modify: `src/repo/r10.ts`
- Modify: `src/repo/r11.ts`
- Test: `tests/trocar-a-camada-de-repositorios.test.ts`

**Interfaces:**
- Consumes: nada de tarefas anteriores
- Produces: repositorios no novo ORM

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Trocar a camada de repositorios', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/trocar-a-camada-de-repositorios`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/trocar-a-camada-de-repositorios`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Trocar a camada de repositorios"
```


### Task 2: Trocar os mapeamentos de entidade

**Files:**
- Modify: `src/entity/e1.ts`
- Modify: `src/entity/e2.ts`
- Modify: `src/entity/e3.ts`
- Modify: `src/entity/e4.ts`
- Modify: `src/entity/e5.ts`
- Modify: `src/entity/e6.ts`
- Modify: `src/entity/e7.ts`
- Modify: `src/entity/e8.ts`
- Modify: `src/entity/e9.ts`
- Test: `tests/trocar-os-mapeamentos-de-entidade.test.ts`

**Interfaces:**
- Consumes: repositorios
- Produces: entidades no novo ORM

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Trocar os mapeamentos de entidade', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/trocar-os-mapeamentos-de-entidade`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/trocar-os-mapeamentos-de-entidade`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Trocar os mapeamentos de entidade"
```


### Task 3: Ajustar as transacoes nos servicos

**Files:**
- Modify: `src/service/s1.ts`
- Modify: `src/service/s2.ts`
- Modify: `src/service/s3.ts`
- Modify: `src/service/s4.ts`
- Modify: `src/service/s5.ts`
- Modify: `src/service/s6.ts`
- Modify: `src/service/s7.ts`
- Modify: `src/service/s8.ts`
- Modify: `src/service/s9.ts`
- Modify: `src/service/s10.ts`
- Test: `tests/ajustar-as-transacoes-nos-servicos.test.ts`

**Interfaces:**
- Consumes: entidades
- Produces: servicos transacionais

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Ajustar as transacoes nos servicos', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/ajustar-as-transacoes-nos-servicos`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/ajustar-as-transacoes-nos-servicos`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Ajustar as transacoes nos servicos"
```


### Task 4: Atualizar as consultas dos relatorios

**Files:**
- Modify: `src/report/rep1.ts`
- Modify: `src/report/rep2.ts`
- Modify: `src/report/rep3.ts`
- Modify: `src/report/rep4.ts`
- Modify: `src/report/rep5.ts`
- Modify: `src/report/rep6.ts`
- Modify: `src/report/rep7.ts`
- Modify: `src/report/rep8.ts`
- Test: `tests/atualizar-as-consultas-dos-relatorios.test.ts`

**Interfaces:**
- Consumes: entidades
- Produces: relatorios migrados

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Atualizar as consultas dos relatorios', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/atualizar-as-consultas-dos-relatorios`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/atualizar-as-consultas-dos-relatorios`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Atualizar as consultas dos relatorios"
```


### Task 5: Remover o ORM antigo e suas configuracoes

**Files:**
- Modify: `src/db/legacy.ts`
- Modify: `src/db/config.ts`
- Modify: `package.json`
- Test: `tests/remover-o-orm-antigo-e-suas-configuracoes.test.ts`

**Interfaces:**
- Consumes: tudo acima
- Produces: projeto sem o ORM antigo

**Steps:**

- [ ] **Step 1: Write failing test**

```ts
it('Remover o ORM antigo e suas configuracoes', () => { expect(run()).toBe(true); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/remover-o-orm-antigo-e-suas-configuracoes`
Expected: FAIL with "run is not defined"

- [ ] **Step 3: Implement minimal change**

```ts
export function run() { return true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/remover-o-orm-antigo-e-suas-configuracoes`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Remover o ORM antigo e suas configuracoes"
```

