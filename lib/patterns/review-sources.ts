import { createHash } from "node:crypto";
import * as path from "node:path";
import type { ReviewFinding, ReviewSeverity } from "./record";

/**
 * Readers for the review artifacts `patterns record --from-review` accepts.
 * Each one turns its format into ReviewFinding[]; recording, dedup and the
 * severity filter live in record.ts, so every source goes through one rule.
 *
 * - decision.json / carrasco-review.json — `review aggregate` output
 *   (lib/harness/reviewers/aggregator.ts): top-level `findings`, or the
 *   per-chunk `chunkVerdicts[].findings` of a saved decision.
 * - findings .md — either the carrasco markdown (`**[High]** \`file:line\` — issue`)
 *   or an SDD reviewer findings file (`#### Critical` / `#### Important` /
 *   `#### Minor` sections whose items cite `file:line`).
 * - SDD ledger (`progress.md`, skills/subagent-driven-development/SKILL.md) —
 *   `Batch <B>: parked — <finding> — Ruling: <why>`, breaker rulings
 *   `Batch <B>: Ruling: <finding> — <decision>`, and
 *   `Batch <B>: minor (deferred): <one-liner>`. Parked findings and breaker
 *   rulings are Critical/Important findings that survived the fix loop, so
 *   they read as high; deferred minors read as low and are filtered out by
 *   the default severity set. Preflight rulings (`Ruling:` with no `Batch`)
 *   are decisions, not findings, and are skipped.
 */

export type ReviewSourceKind = "decision-json" | "findings-md" | "ledger";

function shortHash(s: string): string {
  return createHash("sha256").update(s.replace(/\s+/g, " ").trim().toLowerCase()).digest("hex").slice(0, 12);
}

function normFile(file: string): string {
  return file.replace(/\\/g, "/").replace(/^\.\//, "").trim();
}

function toSeverity(raw: string): ReviewSeverity | null {
  switch (raw.trim().toLowerCase()) {
    case "critical":
      return "critical";
    case "high":
    case "important":
      return "high";
    case "medium":
      return "medium";
    case "low":
    case "minor":
      return "low";
    default:
      return null;
  }
}

/** First `path/with.ext:line` citation in a piece of text. */
const CITE_RE = /`?((?:[A-Za-z]:)?[\w@.\-\/\\]*[\w\-]\.[A-Za-z0-9]{1,8}):(\d+)(?:-\d+)?`?/;

function extractCite(text: string): { file: string; line?: number; rest: string } {
  const m = text.match(CITE_RE);
  if (!m) return { file: "", rest: text };
  return { file: normFile(m[1]), line: Number(m[2]), rest: text.replace(m[0], " ").replace(/\s+/g, " ").trim() };
}

export function detectReviewSource(filePath: string, content: string): ReviewSourceKind {
  if (/\.json$/i.test(filePath)) return "decision-json";
  if (/^#\s*SDD ledger/m.test(content) || /^\s*[-*]?\s*Batch\s+\S+?:\s+(parked\b|Ruling:|minor \(deferred\):)/m.test(content)) {
    return "ledger";
  }
  return "findings-md";
}

export function parseDecisionJson(content: string, project: string): ReviewFinding[] {
  let doc: any;
  try {
    doc = JSON.parse(content);
  } catch (e) {
    throw new Error(`not valid JSON: ${e instanceof Error ? e.message : e}`);
  }
  const feature = typeof doc?.feature === "string" ? doc.feature : "review";
  const raw: any[] = Array.isArray(doc?.findings)
    ? doc.findings
    : Array.isArray(doc?.chunkVerdicts)
      ? doc.chunkVerdicts.flatMap((c: any) => (Array.isArray(c?.findings) ? c.findings : []))
      : [];
  if (!Array.isArray(doc?.findings) && !Array.isArray(doc?.chunkVerdicts)) {
    throw new Error("JSON has neither `findings` nor `chunkVerdicts` — not a review decision");
  }
  const out: ReviewFinding[] = [];
  for (const f of raw) {
    const severity = toSeverity(String(f?.severity ?? ""));
    if (!severity) continue;
    const file = normFile(String(f?.file ?? ""));
    const issue = String(f?.issue ?? f?.title ?? "");
    out.push({
      severity,
      category: f?.category,
      file,
      line: Number.isFinite(Number(f?.line)) ? Number(f.line) : undefined,
      title: issue,
      suggestion: f?.suggestion ? String(f.suggestion) : undefined,
      project,
      // line deliberately excluded: fixing one finding shifts the others' lines
      sourceKey: `${project}:${feature}:${file}:${shortHash(issue)}`,
    });
  }
  return out;
}

const CARRASCO_LINE = /\*\*\[(Critical|High|Medium|Low)\]\*\*\s+`([^`]+?):(\d+)`\s+[—-]+\s+(.+)$/;

export function parseFindingsMarkdown(content: string, project: string, sourceName: string): ReviewFinding[] {
  const lines = content.split(/\r?\n/);
  const out: ReviewFinding[] = [];

  if (lines.some((l) => CARRASCO_LINE.test(l))) {
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(CARRASCO_LINE);
      if (!m) continue;
      const severity = toSeverity(m[1])!;
      const fix = lines[i + 1]?.match(/^\s*Fix:\s*(.+)$/);
      const file = normFile(m[2]);
      out.push({
        severity,
        file,
        line: Number(m[3]),
        title: m[4].trim(),
        suggestion: fix ? fix[1].trim() : undefined,
        project,
        sourceKey: `${project}:${sourceName}:${file}:${shortHash(m[4])}`,
      });
    }
    return out;
  }

  // SDD reviewer findings file: severity comes from the enclosing heading.
  let current: ReviewSeverity | null = null;
  let item: string[] | null = null;
  const flush = () => {
    if (!item || !current) return;
    const text = item.join(" ").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
    item = null;
    if (!text || /^none\b/i.test(text)) return;
    const cite = extractCite(text);
    out.push({
      severity: current,
      file: cite.file,
      line: cite.line,
      title: cite.rest.replace(/^[,:—\-\s]+/, ""),
      project,
      sourceKey: `${project}:${sourceName}:${cite.file}:${shortHash(cite.rest)}`,
    });
  };
  for (const line of lines) {
    const h = line.match(/^#{2,6}\s*(Critical|Important|Minor|High|Medium|Low)\b/i);
    if (h) {
      flush();
      current = toSeverity(h[1]);
      continue;
    }
    if (/^#{1,6}\s/.test(line)) {
      flush();
      current = null;
      continue;
    }
    if (!current) continue;
    if (/^\s*(?:[-*]|\d+[.)])\s+/.test(line)) {
      flush();
      item = [line.replace(/^\s*(?:[-*]|\d+[.)])\s+/, "")];
    } else if (item && line.trim()) {
      item.push(line.trim());
    } else if (!line.trim()) {
      flush();
    }
  }
  flush();
  return out;
}

const LEDGER_LINE = /^\s*[-*]?\s*\[?(?:Ledger:\s*)?Batch\s+([^:\s]+)(?:\s*\([^)]*\))?:\s+(.*?)\]?\s*$/;
const DASH = /\s+(?:—|–|--)\s+/;

export function parseLedger(content: string, project: string, sourceName: string): ReviewFinding[] {
  const out: ReviewFinding[] = [];
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(LEDGER_LINE);
    if (!m) continue;
    const batch = m[1];
    const body = m[2];
    let severity: ReviewSeverity;
    let finding: string;
    let confidence: number;
    let pm: RegExpMatchArray | null;
    if ((pm = body.match(/^parked\s*(?:—|–|--|-|:)\s*(.*)$/i))) {
      // `parked — <finding> — Ruling: <why the code stands>`: contested at the cap.
      finding = pm[1].split(/\s+(?:—|–|--)\s+Ruling:/)[0];
      severity = "high";
      confidence = 0.4;
    } else if ((pm = body.match(/^Ruling:\s*(.*)$/))) {
      // breaker ruling on a real, load-bearing finding
      finding = pm[1].split(DASH)[0];
      severity = "high";
      confidence = 0.7;
    } else if ((pm = body.match(/^minor \(deferred\):\s*(.*)$/i))) {
      finding = pm[1];
      severity = "low";
      confidence = 0.5;
    } else {
      continue;
    }
    const cite = extractCite(finding);
    out.push({
      severity,
      file: cite.file,
      line: cite.line,
      title: cite.rest,
      project,
      confidence,
      sourceKey: `${project}:${sourceName}:batch-${batch}:${shortHash(finding)}`,
    });
  }
  return out;
}

export function readReviewSource(filePath: string, content: string, project: string): { kind: ReviewSourceKind; findings: ReviewFinding[] } {
  const kind = detectReviewSource(filePath, content);
  const sourceName = path.basename(filePath);
  switch (kind) {
    case "decision-json":
      return { kind, findings: parseDecisionJson(content, project) };
    case "ledger":
      return { kind, findings: parseLedger(content, project, sourceName) };
    default:
      return { kind, findings: parseFindingsMarkdown(content, project, sourceName) };
  }
}
