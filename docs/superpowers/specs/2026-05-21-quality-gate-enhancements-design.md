# Design Spec: Quality Gate Enhancements — Duplication, Complexity, Cross-Review

**Date:** 2026-05-21
**Status:** Draft
**Author:** josuerf + AI Assistant

## Summary

Três melhorias no quality gate do harness superpowers-prepared para cobrir gaps identificados na análise de qualidade:

1. **Detecção estática de duplicação de código** — `jscpd` integrado ao `verify-all` com threshold configurável
2. **Análise de complexidade ciclomática** — ferramentas por stack (TS/JS, Java, C#, Python, Go) integradas ao `verify-local`
3. **Cross-review sharing** — spec reviewer gera report estruturado injetado no quality reviewer para evitar redundância e focar em gaps não cobertos

## Architecture

### Core Principle

Seguir o padrão existente do harness: novo validador em `lib/harness/validators/`, chamado pelo orchestrator `index.ts`, configurável via `.harness.config.json`, com report salvo em `.harness/reports/`.

### Directory Structure (changes only)

```
superpowers-prepared/
├── lib/
│   └── harness/
│       ├── index.ts                    — ADICIONAR: imports e calls para duplication e complexity
│       ├── config.ts                   — ADICIONAR: tipos para duplication e complexity config
│       ├── types.ts                    — ADICIONAR: interfaces DuplicationResult, ComplexityResult
│       ├── validators/
│       │   ├── duplication.ts          — NOVO: jscpd wrapper
│       │   └── complexity.ts           — NOVO: multi-stack complexity checker
│       └── reviewers/
│           └── stacks/                 — ADICIONAR: instrução de complexidade para stacks sem ferramenta
├── skills/
│   └── subagent-driven-development/
│       ├── spec-reviewer-prompt.md     — MODIFICAR: adicionar output JSON estruturado
│       └── code-quality-reviewer-prompt.md — MODIFICAR: adicionar seção "Spec Review Findings"
├── tools/
│   └── harness/
│       ├── cli.ts                      — ADICIONAR: comandos duplication e complexity
│       └── install-tools.ts            — ADICIONAR: jscpd, radon, gocyclo na lista de instalação
└── .harness.config.json                — NOVO: schema com duplication e complexity thresholds
```

## Component 1: Duplicação de Código (jscpd)

### Validação

**Arquivo:** `lib/harness/validators/duplication.ts`

**Funcionamento:**
- Executa `npx jscpd --json --output .harness/.jscpd-report.json --min-lines 5 --threshold {maxDuplication}`
- Parse do JSON report para extrair: bloco duplicado, arquivos envolvidos, linhas, linguagem, % duplicação
- Se `duplicationPercent > config.duplication.maxDuplication` → `passed: false`

**Interface de retorno:**
```typescript
interface DuplicationResult {
  passed: boolean;
  duplicationPercent: number;
  totalDuplicationLines: number;
  errors: ParsedError[];       // blocos que excedem threshold
  warnings: string[];           // blocos abaixo do threshold
  duration: number;
}
```

**Integração no pipeline:**
- Roda no `verify-all` após `patterns`, antes de `security`
- Não roda no `verify-local` (jscpd é slow em codebases grandes)
- Comando CLI: `npx ts-node tools/harness/cli.ts duplication`

**Configuração (.harness.config.json):**
```json
{
  "duplication": {
    "enabled": true,
    "maxDuplication": 5,
    "minLines": 5,
    "minTokens": 50,
    "ignorePatterns": ["**/*.test.ts", "**/*.spec.ts", "**/node_modules/**", "**/*.min.js"]
  }
}
```

**Stack support:** jscpd suporta nativamente TypeScript, JavaScript, Python, Go, C#, Java, Terraform. Para stacks sem suporte nativo, fallback para detecção via grep de blocos idênticos (3+ linhas consecutivas idênticas).

### Config

**Mudanças em `lib/harness/config.ts`:**
- Adicionar `duplication` ao `DEFAULT_CONFIG` com valores padrão
- Adicionar tipagem `DuplicationConfig` em `types.ts`

### CLI

**Mudanças em `tools/harness/cli.ts`:**
- Adicionar comando `duplication` que roda apenas o validador de duplicação
- Flag `--threshold N` para override do `maxDuplication` configurado

### Install

**Mudanças em `tools/harness/install-tools.ts`:**
- Adicionar `jscpd` à lista de ferramentas com `npm install -g jscpd`

## Component 2: Complexidade Ciclomática

### Validação

**Arquivo:** `lib/harness/validators/complexity.ts`

**Funcionamento:**
- Detecta stack do projeto via `detectStack(cwd)` existente
- Seleciona ferramenta do mapa por stack
- Executa comando e parse do output
- Se qualquer função/método exceder threshold → `passed: false`

**Mapa de ferramentas:**

| Stack | Ferramenta | Comando | Threshold padrão |
|-------|-----------|---------|------------------|
| react-nextjs | eslint-plugin-complexity | `npx eslint --rule 'complexity: [error, 10]' .` | 10 |
| node-express | eslint-plugin-complexity | `npx eslint --rule 'complexity: [error, 10]' .` | 10 |
| node-fastify | eslint-plugin-complexity | `npx eslint --rule 'complexity: [error, 10]' .` | 10 |
| node-elysia | eslint-plugin-complexity | `npx eslint --rule 'complexity: [error, 10]' .` | 10 |
| java-springboot | pmd | `pmd cpd --minimum-tokens 50 --dir .` + `pmd design` | 10 |
| csharp-dotnet | Microsoft.CodeAnalysis.Metrics | `dotnet build /p:RunAnalyzers=true` | 15 |
| csharp-aspnet | Microsoft.CodeAnalysis.Metrics | `dotnet build /p:RunAnalyzers=true` | 15 |
| python-fastapi | radon | `radon cc --min C src/` | C (11+) |
| go-std | gocyclo | `gocyclo -over 10 .` | 10 |
| terraform | LLM review | — | — |

**Interface de retorno:**
```typescript
interface ComplexityResult {
  passed: boolean;
  maxComplexityFound: number;
  violations: Array<{
    file: string;
    line: number;
    name: string;
    complexity: number;
    threshold: number;
  }>;
  duration: number;
}
```

**Integração no pipeline:**
- Roda no `verify-local` após `typecheck`, antes de `test`
- É fast check (a maioria das ferramentas roda em <5s)
- Comando CLI: `npx ts-node tools/harness/cli.ts complexity`

**Configuração (.harness.config.json):**
```json
{
  "complexity": {
    "enabled": true,
    "thresholds": {
      "react-nextjs": 10,
      "node-express": 10,
      "node-fastify": 10,
      "node-elysia": 10,
      "java-springboot": 10,
      "csharp-dotnet": 15,
      "csharp-aspnet": 15,
      "python-fastapi": 10,
      "go-std": 10
    }
  }
}
```

**Stacks sem ferramenta dedicada:** terraform, e stacks futuros sem ferramenta estática recebem instrução no reviewer prompt (`lib/harness/reviewers/base-prompt.md`) para avaliar complexidade ciclomática como parte do review LLM.

### Config

**Mudanças em `lib/harness/config.ts`:**
- Adicionar `complexity` ao `DEFAULT_CONFIG`
- Adicionar tipagem `ComplexityConfig` em `types.ts`

### CLI

**Mudanças em `tools/harness/cli.ts`:**
- Adicionar comando `complexity` que roda apenas o validador de complexidade
- Flag `--stack <stack-name>` para rodar apenas para um stack específico
- Flag `--threshold N` aplica o mesmo threshold a todos os stacks (override do config)

### Install

**Mudanças em `tools/harness/install-tools.ts`:**
- Adicionar à lista:
  - `eslint-plugin-complexity` (via npm, já bundled com eslint)
  - `radon` (via pip: `pip install radon`)
  - `gocyclo` (via go: `go install github.com/fzipp/gocyclo/cmd/gocyclo@latest`)
  - `pmd` (via download binário ou npm wrapper)

## Component 3: Cross-Review Sharing

### Fluxo

```
Implementer (task N)
  ↓ implementa, testa, self-review, commit
Spec Reviewer
  ↓ analisa conformidade com requisitos
  ↓ gera spec-review-report.json
Main Agent
  ↓ lê spec-review-report.json
  ↓ injeta no prompt do Quality Reviewer
Quality Reviewer
  ↓ recebe spec findings + diff + contexto
  ↓ foca em: qualidade, arquitetura, edge cases não cobertos
  ↓ ignora o que já foi validado pelo spec reviewer
```

### Spec Review Report

**Formato JSON:**
```json
{
  "taskId": "task-N",
  "verdict": "PASS",
  "requirements_met": ["AC1", "AC2", "AC3"],
  "requirements_missing": [],
  "extra_scope": [],
  "files_reviewed": ["src/foo.ts", "src/bar.ts"],
  "concerns": ["File foo.ts is growing large (450 lines)"],
  "timestamp": "2026-05-21T10:30:00Z"
}
```

### Mudanças nos Prompts

**`skills/subagent-driven-development/spec-reviewer-prompt.md`:**
- Adicionar instrução para gerar output JSON estruturado além do verdict
- JSON deve ser wrapped em `<!-- SPEC_REVIEW_REPORT -->` markers para fácil parsing

**`skills/subagent-driven-development/code-quality-reviewer-prompt.md`:**
- Adicionar seção "Spec Review Findings" antes do escopo padrão de qualidade
- Incluir instrução: "O spec reviewer já verificou conformidade com requisitos. Os arquivos listados em `files_reviewed` foram analisados para scope. Foque em: qualidade do código, arquitetura, edge cases não cobertos pelo spec review, e qualquer gap que o spec reviewer não abordou. Não repita verificações de scope já feitas."

### Integração no subagent-driven-development

**Mudanças em `skills/subagent-driven-development/SKILL.md`:**
- Após spec reviewer passar, Main Agent salva report em `.harness/reviews/<task-id>/spec-review.json`
- Quality reviewer recebe o conteúdo do report injetado no prompt
- Se spec review falhou (FAIL), quality review não dispara (comportamento existente mantido)

**Storage:**
- Reports salvos em `.harness/reviews/<feature-name>/<task-id>/spec-review.json`
- Não persistem entre sessões (são gerados por task)
- Podem ser usados para audit trail pós-merge

### Parser

**Novo arquivo:** `lib/harness/reviewers/spec-review-parser.ts`
- Função `parseSpecReviewReport(response: string): SpecReviewReport | null`
- Extrai JSON entre markers `<!-- SPEC_REVIEW_REPORT -->`
- Valida schema do report
- Retorna null se não encontrar report válido

## Error Handling

### Duplicação
- jscpd não instalado → fail open com warning, não bloqueia
- Report JSON malformado → fail open com warning
- Timeout (>60s) → fail open com warning

### Complexidade
- Ferramenta não instalada → fail open com warning para stacks com ferramenta; fallback para LLM review para stacks sem ferramenta
- Output não parseável → fail open com warning
- Timeout (>30s) → fail open com warning

### Cross-Review
- Spec review report não encontrado → quality reviewer roda normalmente sem findings injetados
- Report malformado → quality reviewer ignora e roda normalmente
- Nenhum impacto no pipeline se falhar

## Testing

### Duplicação
- Test unitário: `tests/harness/duplication/validator.test.ts`
  - Passa quando duplicação < threshold
  - Falha quando duplicação > threshold
  - Ignora arquivos em ignorePatterns
  - Reporta corretamente file:line dos blocos duplicados
- Test de integração: criar arquivos com código duplicado conhecido, rodar validador, verificar detecção

### Complexidade
- Test unitário: `tests/harness/complexity/validator.test.ts`
  - Passa quando complexidade < threshold
  - Falha quando complexidade > threshold
  - Reporta corretamente função:file:line:complexity
- Test de integração: criar funções com complexidade conhecida, rodar validador, verificar detecção

### Cross-Review
- Test unitário: `tests/harness/reviewers/spec-review-parser.test.ts`
  - Parse correto de report válido
  - Retorna null para report malformado
  - Retorna null para response sem markers
- Test de integração: simular fluxo completo spec → quality com report injetado

## Config Schema

**Novo arquivo:** `.harness.config.json` (schema completo)

```json
{
  "coverageMin": 80,
  "securityScan": {
    "enabled": true,
    "tools": { "semgrep": true, "gitleaks": true, "npmAudit": true, "trivy": false }
  },
  "domainSpecific": {},
  "timeout": { "verifyLocal": 30, "verifyAll": 300 },
  "failOn": { "lint": "error", "coverage": "warning", "security": "error" },
  "duplication": {
    "enabled": true,
    "maxDuplication": 5,
    "minLines": 5,
    "minTokens": 50,
    "ignorePatterns": ["**/*.test.ts", "**/*.spec.ts", "**/node_modules/**"]
  },
  "complexity": {
    "enabled": true,
    "thresholds": {
      "react-nextjs": 10,
      "node-express": 10,
      "node-fastify": 10,
      "node-elysia": 10,
      "java-springboot": 10,
      "csharp-dotnet": 15,
      "csharp-aspnet": 15,
      "python-fastapi": 10,
      "go-std": 10
    }
  }
}
```

## Pipeline Atualizado

### verify-local (fast)
1. completeness
2. lint
3. typecheck
4. **complexity** ← NOVO
5. test
6. coverage
7. patterns

### verify-all (full)
1-7. All of verify-local
8. **duplication** ← NOVO
9. security
10. integration
11. domain-specific
12. dead-code
13. drift-analysis

## README Documentation

**Arquivo:** `README.md`

**3 mudanças na seção "Learning Harness":**

**1. Tabela Verification Pipeline** — Atualizar passos do pipeline:

```markdown
| Pipeline | Steps |
|----------|-------|
| `verify-local` (fast) | lint → typecheck → complexity → test → coverage → patterns |
| `verify-all` (full) | verify-local + duplication → security → integration → domain-specific → migration |
```

**2. Novas subseções após Drift Analysis:**

```markdown
**Code Duplication Detection** — Static analysis for duplicated code blocks:
- **jscpd Integration** — Runs jscpd with configurable thresholds, ignores test files and node_modules
- **Duplication Validator** — Reports file:line of duplicated blocks, blocks build when threshold exceeded

**Cyclomatic Complexity Analysis** — Per-stack complexity gate:
- **TS/JS:** eslint-plugin-complexity
- **Java:** PMD design rules
- **C#:** Microsoft.CodeAnalysis.Metrics
- **Python:** radon
- **Go:** gocyclo
- **Complexity Validator** — Reports function:file:line:complexity, blocks build when threshold exceeded
```

**3. CLI commands** — Adicionar `duplication` e `complexity`:

```markdown
**CLI** — `npx ts-node tools/harness/cli.ts <command>` with commands: `local`, `all`, `security`, `completeness`, `deadcode`, `duplication`, `complexity`, `explain-drift`, `scan`, `install-tools`
```

## Success Criteria

1. `npx ts-node tools/harness/cli.ts duplication` detecta blocos duplicados conhecidos em projeto teste
2. `npx ts-node tools/harness/cli.ts complexity` detecta funções com complexidade acima do threshold em projeto teste
3. Spec reviewer gera report JSON parseável em fluxo subagent-driven-development
4. Quality reviewer recebe spec findings e não repete verificações de scope
5. `npx ts-node tools/harness/cli.ts all` roda sem erros com duplicação e complexidade habilitados
6. Configuração via `.harness.config.json` funciona para todos os novos validadores
7. `tools/harness/install-tools.ts` instala todas as novas ferramentas
