import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import type { PatternCatalog } from "./catalog";
import type { PatternEntry, PatternsConfig, PatternSeverity } from "./types";
import { detectModuleType } from "./matcher";

/**
 * `patterns record`: review findings become `error_pattern` entries.
 *
 * The rule the whole module is built around: a noisy catalog is worse than an
 * empty one. So every entry is born in pending/, an occurrence is folded into
 * an existing entry whenever its signature matches, and promotion out of
 * pending/ only happens when a caller that is allowed to promote sees the
 * entry cross BOTH recurrence thresholds (minFrequency occurrences across at
 * least minProjects projects). The automatic caller (`review aggregate`)
 * never promotes; only an explicit `record`/import run or `promote` does.
 *
 * The signature is deliberately coarse. Measured on the 308 findings of the
 * GitLab review study, a literal-phrase key yields 305 distinct keys for 308
 * findings — it groups nothing. The key here is reviewer category + a path
 * pattern (extension and layer, never the file name) + a key phrase built
 * from a small concept lexicon, falling back to the title's significant
 * words with numbers and identifiers stripped.
 */

export type ReviewSeverity = "critical" | "high" | "medium" | "low";

export interface ReviewFinding {
  severity: ReviewSeverity;
  /** The reviewer's own category (bug, business-rule, security, correctness...). */
  category?: string;
  /** Cited file, repo-relative. Empty when the finding cites nothing. */
  file: string;
  line?: number;
  title: string;
  suggestion?: string;
  /** Project (repository) the occurrence came from. */
  project: string;
  /** Unique key of this occurrence, so re-recording the same review never double-counts. */
  sourceKey: string;
  /** 0..1; defaults to 0.5 when the source carries no confidence signal. */
  confidence?: number;
}

export interface RecordOptions {
  /** false for the automatic caller: entries stay in pending/ whatever their counts. */
  promote: boolean;
  /** Severities that are recorded. Default: critical + high. */
  severities?: ReviewSeverity[];
  /**
   * When set, a finding is only recorded if its `file:line` citation resolves
   * under this root (file exists, line within the file). Unresolvable
   * citations are discarded and counted.
   */
  verifyCitesRoot?: string;
  /** Where discard counts and writes are logged (JSON lines). Usually `<wiki>/patterns.log`. */
  logPath?: string;
  /** YYYY-MM-DD; injectable for tests. */
  today?: string;
  /** Label of the caller, written to the log. */
  trigger?: string;
}

export interface RecordSummary {
  considered: number;
  created: number;
  incremented: number;
  alreadySeen: number;
  promoted: string[];
  discarded: { belowSeverity: number; noCite: number; unresolvableCite: number };
  /** Ids of every entry this run created or touched. */
  touched: string[];
}

const DEFAULT_SEVERITIES: ReviewSeverity[] = ["critical", "high"];

// ──────────────────────────────────────────────────────────────────────────
// Signature
// ──────────────────────────────────────────────────────────────────────────

/** Reviewer vocabularies differ (carrasco, SDD, GitLab bot); fold them onto one set. */
const CATEGORY_ALIASES: Record<string, string> = {
  bug: "correctness",
  correctness: "correctness",
  "business-rule": "business-rule",
  business_rule: "business-rule",
  security: "security",
  governance: "governance",
  process: "governance",
  design: "design",
  performance: "performance",
  convention: "maintainability",
  maintainability: "maintainability",
  database: "database",
  test: "test",
  "test-coverage": "test",
};

export function canonicalCategory(category: string | undefined): string {
  const c = (category ?? "").trim().toLowerCase();
  if (!c) return "unclassified";
  return CATEGORY_ALIASES[c] ?? c.replace(/[^a-z0-9-]+/g, "-");
}

const ROLE_BY_NAME: Array<[RegExp, string]> = [
  [/(Controller|Controlador|Resource|Endpoint)$/, "controller"],
  [/(Repository|Repositorio|Dao)(Impl)?$/, "repository"],
  [/(Service|Servico)(Impl)?$/, "service"],
  [/(API|Api|Client)$/, "client"],
  [/Mapper$/, "mapper"],
  [/Validator$/, "validator"],
  [/Strategy$/, "strategy"],
  [/(Thread|Job|Task|Scheduler|Worker)$/, "job"],
  [/(Config|Configuration)$/, "config"],
  [/Enum$/, "enum"],
  [/(Dto|DTO|Request|Response)$/, "dto"],
  [/Filter(Impl)?$/, "filter"],
  [/Function$/, "function"],
];

/** Layer of a file, inferred from its path and name — never the name itself. */
export function fileRole(file: string): string {
  const f = file.replace(/\\/g, "/");
  const lower = f.toLowerCase();
  const base = f.split("/").pop() ?? f;
  // A version suffix (ConsoleControladorV2) says nothing about the layer.
  const stem = base.replace(/\.[^.]+$/, "").replace(/_?[Vv]\d+$/, "");

  if (/(^|\/)(test|tests|__tests__|spec)\//.test(lower) || /(Test|Tests|Spec)$/.test(stem) || /[._-](test|spec)$/i.test(stem)) return "test";
  if (/^chart\.ya?ml$/i.test(base) || /values\.ya?ml$/i.test(base) || /(^|\/)templates\/.*\.ya?ml$/.test(lower) || /^(deployment|ingress|service)\.ya?ml$/i.test(base)) return "helm";
  if (/\.sql$/i.test(base) || /\/(migration|migrations|changelog|flyway)\//.test(lower)) return "migration";
  if (/\.(jrxml|jasper)$/i.test(base)) return "report-template";
  if (/\.component\.(ts|html)$/i.test(base)) return "component";
  for (const [re, role] of ROLE_BY_NAME) if (re.test(stem)) return role;
  if (/\.(ya?ml|json|properties|xml|toml|ini)$/i.test(base)) return "config";
  if (/\.(sh|ps1|bat|cmd)$/i.test(base)) return "script";
  return "other";
}

export function pathPattern(file: string): string {
  const base = file.replace(/\\/g, "/").split("/").pop() ?? "";
  const m = base.match(/\.([A-Za-z0-9]+)$/);
  let ext = m ? m[1].toLowerCase() : "none";
  if (ext === "yml") ext = "yaml";
  return `${ext}:${fileRole(file)}`;
}

/**
 * Concept lexicon, in priority order. Matched against the accent-stripped,
 * lower-cased title with separators turned into spaces. Portuguese and English
 * because both reviewer populations write in both.
 */
const CONCEPTS: Array<[string, RegExp]> = [
  ["hardcoded-secret", /credencia|senha|password|\btoken|hardcoded|texto claro/],
  ["runs-as-root", /\broot\b|runasuser/],
  ["missing-tls", /\btls\b|http puro|sem https/],
  ["probe-target", /probe|liveness|readiness/],
  ["missing-migration", /migrac|migration|flyway|liquibase|\bddl\b/],
  ["missing-test", /nenhum teste|sem teste|nunca testad|nao testad|teste que devia|untested|no test|missing test/],
  ["removed-filter", /(remoc|removid|deixou de|deixa de|nao filtra|nao e mais usado|sem filtr).{0,40}(filtr|where|entidade|particion)|filtr\S*.{0,30}(removid|ausente)/],
  ["tenant-scope", /entidade|tenant|x entity/],
  ["null-safety", /\bnull|\bnpe\b|nullpointer/],
  ["exception-handling", /try ?catch|\bcatch\b|excec|exception|aborta/],
  ["concurrency-idempotency", /corrida|concorren|\brace\b|idempot|duplica/],
  ["query-in-loop", /\bn ?\+? ?1\b|dentro de loop|consulta o destino|repositorio dentro/],
  ["pagination", /paginac|findall/],
  ["contract-break", /quebra\S*.{0,20}contrato|parametro obrigatorio|assinatura antiga|ainda referenciad|remoc\S* de metodo|breaking change/],
  ["sibling-inconsistency", /\birma|padrao estabelecido|ao contrario do|inconsisten/],
  ["silent-failure", /silencios|silently/],
  ["encoding", /encoding|utf ?8|iso ?8859|charset/],
  ["sql-query", /\bsql\b|\bquery|queries|nativ|\bjoin\b|\bcte/],
  ["dead-code", /codigo morto|dead code/],
  ["cross-service-coupling", /acoplamento|compartilhad|coupling/],
  ["removal", /remoc|removid|apagad|removed|deleted/],
];

const STOPWORDS = new Set(
  (
    "a o os as um uma uns umas de do da dos das em no na nos nas por para pelo pela pelos pelas com sem " +
    "e ou que se nao mais menos ja so ainda mesmo mesma ao aos como quando onde entre sobre apos antes " +
    "pode podem deve devem esta estao este esse essa isso ser sao foi era fica ficam tem ter todo todos " +
    "the an of in on at to for from with without and or not is are was be can may should does do this that " +
    "its it into than then when which while"
  ).split(" "),
);

export function normalizeTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[`'"()[\]{}<>,;:!?]/g, " ")
    .replace(/[-_/.|=+*]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The key phrase of a title: the highest-priority lexicon concept it
 * mentions (one, not two — on the study data a second concept split groups
 * that were the same defect, e.g. "removed filter" with and without "in the
 * SQL"); failing that, the first three significant words (identifiers,
 * numbers, and glued slug words longer than 16 characters removed), sorted
 * so word order does not split a group.
 */
export function keyPhrase(title: string): string {
  // Identifiers go first, before separators are flattened: camelCase, snake_case,
  // dotted names, ALLCAPS runs, anything with a digit.
  const withoutIds = title
    .split(/\s+/)
    .filter((tok) => !/[a-z][A-Z]|_|\w\.\w|\d|[A-Z]{4,}/.test(tok))
    .join(" ");
  const norm = normalizeTitle(title);
  for (const [name, re] of CONCEPTS) {
    if (re.test(norm)) return name;
  }

  const words = normalizeTitle(withoutIds)
    .split(" ")
    .filter((w) => w.length >= 4 && w.length <= 16 && !STOPWORDS.has(w) && !/\d/.test(w))
    .map((w) => w.replace(/s$/, ""));
  const picked = Array.from(new Set(words)).slice(0, 3).sort();
  return picked.length > 0 ? picked.join("+") : "untitled";
}

export function computeSignature(f: Pick<ReviewFinding, "category" | "file" | "title">): string {
  return `${canonicalCategory(f.category)}|${pathPattern(f.file)}|${keyPhrase(f.title)}`;
}

export function signatureId(signature: string): string {
  const cat = signature.split("|")[0];
  const hash = createHash("sha256").update(signature).digest("hex").slice(0, 10);
  return `rv-${cat}-${hash}`;
}

// ──────────────────────────────────────────────────────────────────────────
// Recording
// ──────────────────────────────────────────────────────────────────────────

export function crossesRecurrence(entry: Pick<PatternEntry, "frequency" | "projects">, config: PatternsConfig): boolean {
  return (
    entry.frequency >= config.recurrenceThreshold.minFrequency &&
    entry.projects.length >= config.recurrenceThreshold.minProjects
  );
}

function oneLine(s: string, max = 300): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function mapSeverity(s: ReviewSeverity): PatternSeverity {
  return s === "critical" || s === "high" ? "high" : s;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function citeResolves(root: string, file: string, line: number | undefined): boolean {
  const abs = path.resolve(root, file.replace(/\\/g, "/"));
  let content: string;
  try {
    if (!fs.statSync(abs).isFile()) return false;
    content = fs.readFileSync(abs, "utf-8");
  } catch {
    return false;
  }
  if (line === undefined || !Number.isFinite(line)) return true;
  const lines = content.split("\n").length;
  return line >= 1 && line <= lines;
}

function log(opts: RecordOptions, record: Record<string, unknown>): void {
  if (!opts.logPath) return;
  try {
    fs.mkdirSync(path.dirname(opts.logPath), { recursive: true });
    fs.appendFileSync(
      opts.logPath,
      `${JSON.stringify({ date: new Date().toISOString(), trigger: opts.trigger ?? "record", ...record })}\n`,
      "utf-8",
    );
  } catch {
    // the log is diagnostics; it never fails a record run
  }
}

export function recordFindings(
  findings: ReviewFinding[],
  catalog: PatternCatalog,
  config: PatternsConfig,
  opts: RecordOptions,
): RecordSummary {
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const severities = opts.severities ?? DEFAULT_SEVERITIES;
  const summary: RecordSummary = {
    considered: findings.length,
    created: 0,
    incremented: 0,
    alreadySeen: 0,
    promoted: [],
    discarded: { belowSeverity: 0, noCite: 0, unresolvableCite: 0 },
    touched: [],
  };
  const touched = new Set<string>();

  for (const f of findings) {
    if (!severities.includes(f.severity)) {
      summary.discarded.belowSeverity++;
      continue;
    }
    if (!f.file || !f.file.trim()) {
      summary.discarded.noCite++;
      continue;
    }
    if (opts.verifyCitesRoot && !citeResolves(opts.verifyCitesRoot, f.file, f.line)) {
      summary.discarded.unresolvableCite++;
      continue;
    }

    const signature = computeSignature(f);
    const id = signatureId(signature);
    const confidence = f.confidence ?? 0.5;
    const existing = catalog.getById(id);

    if (existing) {
      const sources = existing.sources ?? [];
      if (sources.includes(f.sourceKey)) {
        summary.alreadySeen++;
        continue;
      }
      const frequency = existing.frequency + 1;
      const prevConfidence = existing.confidence ?? 0.5;
      const updates: Partial<PatternEntry> = {
        frequency,
        lastSeen: today,
        projects: existing.projects.includes(f.project) ? existing.projects : [...existing.projects, f.project],
        confidence: round2((prevConfidence * existing.frequency + confidence) / frequency),
        sources: [...sources, f.sourceKey],
        severity: existing.severity === "high" ? "high" : mapSeverity(f.severity),
        // An archived (decayed) entry that recurs comes back to pending/, not
        // straight to the catalog: it re-earns promotion like any other.
        status: existing.status === "archived" && !existing.supersededBy ? "pending" : existing.status,
      };
      catalog.update(id, updates);
      summary.incremented++;
      log(opts, { action: "updated", id, signature, frequency });
    } else {
      const entry: PatternEntry = {
        id,
        category: "error_pattern",
        module: detectModuleType([f.file]),
        severity: mapSeverity(f.severity),
        frequency: 1,
        firstSeen: today,
        lastSeen: today,
        projects: [f.project],
        status: "pending",
        title: oneLine(`${canonicalCategory(f.category)} in ${pathPattern(f.file)}: ${keyPhrase(f.title)}`, 120),
        pattern: oneLine(f.title),
        symptom: oneLine(f.title),
        rootCause: "",
        fix: oneLine(f.suggestion ?? ""),
        check: oneLine(`Before merging a change to a ${fileRole(f.file)} file (${pathPattern(f.file)}), check for: ${keyPhrase(f.title).replace(/\+/g, ", ")}`),
        related: [],
        signature,
        findingCategory: canonicalCategory(f.category),
        confidence: round2(confidence),
        sources: [f.sourceKey],
      };
      catalog.create(entry);
      summary.created++;
      log(opts, { action: "created", id, signature });
    }
    touched.add(id);
  }

  if (opts.promote) {
    // Sweep every recorded pending entry, not just the ones touched now: the
    // automatic caller accumulates occurrences without ever promoting, and
    // this is where those get their promotion.
    for (const e of catalog.query({ categories: ["error_pattern"], excludeArchived: true })) {
      if (e.status !== "pending" || !e.signature) continue;
      if (!crossesRecurrence(e, config)) continue;
      catalog.update(e.id, { status: "promoted" });
      summary.promoted.push(e.id);
      log(opts, { action: "promoted", id: e.id, frequency: e.frequency, projects: e.projects.length });
    }
  }

  summary.touched = Array.from(touched);
  log(opts, {
    action: "summary",
    considered: summary.considered,
    created: summary.created,
    incremented: summary.incremented,
    alreadySeen: summary.alreadySeen,
    promoted: summary.promoted.length,
    discarded: summary.discarded,
  });
  return summary;
}

/**
 * Decay: a recorded entry still in pending/ that saw no new occurrence for
 * `pendingDecayDays` is archived. Archive, not delete — a later occurrence
 * revives it (see recordFindings).
 */
export function archiveStalePending(
  catalog: PatternCatalog,
  config: PatternsConfig,
  today: string = new Date().toISOString().slice(0, 10),
): string[] {
  const archived: string[] = [];
  const now = Date.parse(today);
  for (const e of catalog.query({ excludeArchived: true })) {
    if (e.status !== "pending" || !e.signature) continue;
    const last = Date.parse(e.lastSeen);
    if (Number.isNaN(last)) continue;
    const days = Math.floor((now - last) / 86_400_000);
    if (days > (config.pendingDecayDays ?? 60)) {
      catalog.archive(e.id);
      archived.push(e.id);
    }
  }
  return archived;
}
