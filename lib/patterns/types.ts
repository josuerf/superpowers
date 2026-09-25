export type PatternCategory = "error_pattern" | "good_practice" | "project_constraint";
export type PatternSeverity = "high" | "medium" | "low";
export type PatternStatus = "promoted" | "pending" | "bootstrap" | "archived";

export interface PatternEntry {
  id: string;
  category: PatternCategory;
  module: string;
  severity: PatternSeverity;
  frequency: number;
  firstSeen: string;
  lastSeen: string;
  projects: string[];
  status: PatternStatus;
  title: string;
  pattern: string;
  symptom: string;
  rootCause: string;
  fix: string;
  check: string;
  checkRegex?: string;
  related: string[];
  supersededBy?: string;
  supersededAt?: string;
  /**
   * Set by `patterns record` (lib/patterns/record.ts). `signature` is the
   * dedup key an occurrence is folded under; `findingCategory` keeps the
   * reviewer's own category (bug, business-rule, security...), which
   * `category` cannot carry; `confidence` is the running mean over
   * occurrences; `sources` lists one key per occurrence so re-recording the
   * same review never double-counts.
   */
  signature?: string;
  findingCategory?: string;
  confidence?: number;
  sources?: string[];
}

export interface PatternQuery {
  module?: string;
  categories?: PatternCategory[];
  severity?: PatternSeverity[];
  maxResults?: number;
  excludeArchived?: boolean;
}

export interface PatternsConfig {
  enabled: boolean;
  globalWiki: boolean;
  globalPath: string;
  bootstrapThreshold: number;
  recurrenceThreshold: {
    minFrequency: number;
    minProjects: number;
  };
  staleness: {
    reviewDays: number;
    archiveDays: number;
  };
  /** A recorded entry still in pending/ with no new occurrence for this many days is archived by `archive --stale-pending`. */
  pendingDecayDays?: number;
}

export interface WikiPaths {
  global: string;
  project: string;
}

export interface PatternViolation {
  pattern: string;
  message: string;
  severity: PatternSeverity;
  fix: string;
  file?: string;
  line?: number;
  recurrence: string;
}

export interface PatternsValidationResult {
  passed: boolean;
  violations: PatternViolation[];
  blocking: boolean;
}

export interface PatternLogEntry {
  date: string;
  action: "created" | "updated" | "promoted" | "archived" | "superseded" | "rejected";
  id: string;
  category: PatternCategory;
  trigger?: string;
  details?: string;
}
