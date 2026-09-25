import { createHash } from "node:crypto";
import type { ReviewFinding, ReviewSeverity } from "./record";

/**
 * Reader for the GitLab MR review findings TSV (the code-review study's
 * `07-achados-completo.tsv` / `findings.tsv` format). One row per finding.
 *
 * A malformed file is an error, never a partial import: a TSV that loses a
 * column shifts every value one cell to the left, and recording that would
 * put file paths in the title and severities in the file. So the header is
 * checked, every row's cell count is checked, and the typed cells are
 * validated — the first failure throws a TsvFormatError naming the line.
 */

export const REQUIRED_COLUMNS = [
  "grupo",
  "produto",
  "repo",
  "mr_iid",
  "severity",
  "category",
  "file",
  "line",
  "title",
  "confidence",
  "resolved",
] as const;

export class TsvFormatError extends Error {
  constructor(
    message: string,
    public readonly lineNumber?: number,
  ) {
    super(lineNumber ? `TSV line ${lineNumber}: ${message}` : `TSV: ${message}`);
    this.name = "TsvFormatError";
  }
}

export interface GitlabReviewRow {
  grupo: string;
  produto: string;
  repo: string;
  mrIid: string;
  severity: ReviewSeverity;
  category: string;
  file: string;
  line?: number;
  title: string;
  /** 0-100 as written by the reviewer; undefined when the cell is empty. */
  confidence?: number;
  resolved?: boolean;
  humanReplies: number;
  noteUrl?: string;
}

const SEVERITIES: Record<string, ReviewSeverity> = {
  CRITICAL: "critical",
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
};

export function parseGitlabReviewTsv(content: string): GitlabReviewRow[] {
  const lines = content.replace(/^﻿/, "").split(/\r?\n/);
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
  if (lines.length === 0) throw new TsvFormatError("empty file");

  const header = lines[0].split("\t").map((h) => h.trim());
  const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length > 0) throw new TsvFormatError(`missing required column(s): ${missing.join(", ")}`, 1);
  const col = (name: string) => header.indexOf(name);

  const rows: GitlabReviewRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const lineNumber = i + 1;
    if (lines[i].trim() === "") continue;
    const cells = lines[i].split("\t");
    if (cells.length !== header.length) {
      throw new TsvFormatError(`expected ${header.length} cells, found ${cells.length}`, lineNumber);
    }
    const get = (name: string) => (col(name) >= 0 ? cells[col(name)].trim() : "");

    const sevRaw = get("severity").toUpperCase();
    const severity = SEVERITIES[sevRaw];
    if (!severity) throw new TsvFormatError(`invalid severity "${get("severity")}"`, lineNumber);

    const lineRaw = get("line");
    if (lineRaw && !/^\d+$/.test(lineRaw)) throw new TsvFormatError(`invalid line "${lineRaw}"`, lineNumber);

    const confRaw = get("confidence");
    if (confRaw && (!/^\d+(\.\d+)?$/.test(confRaw) || Number(confRaw) > 100)) {
      throw new TsvFormatError(`invalid confidence "${confRaw}" (expected 0-100)`, lineNumber);
    }

    const resolvedRaw = get("resolved").toLowerCase();
    if (resolvedRaw && resolvedRaw !== "true" && resolvedRaw !== "false") {
      throw new TsvFormatError(`invalid resolved "${get("resolved")}" (expected true/false)`, lineNumber);
    }

    const repliesRaw = get("n_human_replies");
    if (repliesRaw && !/^\d+$/.test(repliesRaw)) {
      throw new TsvFormatError(`invalid n_human_replies "${repliesRaw}"`, lineNumber);
    }

    if (!get("repo")) throw new TsvFormatError("empty repo", lineNumber);
    if (!get("title")) throw new TsvFormatError("empty title", lineNumber);

    rows.push({
      grupo: get("grupo"),
      produto: get("produto"),
      repo: get("repo"),
      mrIid: get("mr_iid"),
      severity,
      category: get("category"),
      file: get("file"),
      line: lineRaw ? Number(lineRaw) : undefined,
      title: get("title"),
      confidence: confRaw ? Number(confRaw) : undefined,
      resolved: resolvedRaw ? resolvedRaw === "true" : undefined,
      humanReplies: repliesRaw ? Number(repliesRaw) : 0,
      noteUrl: get("note_url") || undefined,
    });
  }
  return rows;
}

/**
 * Confidence of one occurrence, 0..1: the reviewer's own confidence (0.5 when
 * absent), discounted when nobody acted on the finding. A resolved thread is
 * the strongest signal that the finding was real; a human reply without
 * resolution is weaker; neither is weakest.
 */
export function rowConfidence(row: GitlabReviewRow): number {
  const base = row.confidence !== undefined ? row.confidence / 100 : 0.5;
  const factor = row.resolved ? 1 : row.humanReplies > 0 ? 0.85 : 0.6;
  return Math.round(base * factor * 100) / 100;
}

export function rowToFinding(row: GitlabReviewRow): ReviewFinding {
  const key =
    row.noteUrl ??
    `${row.repo}!${row.mrIid}:${row.file}:${row.line ?? ""}:${createHash("sha256").update(row.title).digest("hex").slice(0, 12)}`;
  return {
    severity: row.severity,
    category: row.category,
    file: row.file,
    line: row.line,
    title: row.title,
    project: row.repo,
    sourceKey: key,
    confidence: rowConfidence(row),
  };
}
