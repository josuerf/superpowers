#!/usr/bin/env node
/**
 * Ingest the GitLab MR review findings TSV into the patterns wiki through the
 * same path as `patterns record` (lib/patterns/record.ts).
 *
 * Usage:
 *   npx tsx tools/patterns/import-gitlab-review.ts <findings.tsv>
 *     [--wiki <dir>]            write to this wiki instead of the configured one
 *     [--severities CRITICAL,HIGH]  default CRITICAL,HIGH — the first load is
 *                               deliberately the high-severity slice only
 *     [--no-promote]            record occurrences but leave everything in pending/
 *
 * A malformed TSV aborts before anything is written (exit 2).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { PatternCatalog } from "../../lib/patterns/catalog";
import { loadPatternsConfig, resolveWikiPaths } from "../../lib/patterns/config";
import { parseGitlabReviewTsv, rowToFinding, TsvFormatError } from "../../lib/patterns/gitlab-tsv";
import { recordFindings, type ReviewSeverity } from "../../lib/patterns/record";

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function main(): void {
  const args = process.argv.slice(2);
  const tsvPath = args.find((a, i) => !a.startsWith("--") && (i === 0 || !["--wiki", "--severities"].includes(args[i - 1])));
  if (!tsvPath) {
    console.error("Usage: import-gitlab-review <findings.tsv> [--wiki <dir>] [--severities CRITICAL,HIGH] [--no-promote]");
    process.exit(1);
  }
  if (!fs.existsSync(tsvPath)) {
    console.error(`File not found: ${tsvPath}`);
    process.exit(1);
  }

  let rows;
  try {
    rows = parseGitlabReviewTsv(fs.readFileSync(tsvPath, "utf-8"));
  } catch (e) {
    if (e instanceof TsvFormatError) {
      console.error(`Malformed review TSV (${tsvPath}): ${e.message}. Nothing was written.`);
      process.exit(2);
    }
    throw e;
  }

  const severities = (flag(args, "--severities") ?? "CRITICAL,HIGH")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean) as ReviewSeverity[];

  const projectRoot = process.cwd();
  const config = loadPatternsConfig(projectRoot);
  const wiki = flag(args, "--wiki") ?? resolveWikiPaths(config, projectRoot).global;
  const catalog = new PatternCatalog(wiki, wiki);

  const summary = recordFindings(rows.map(rowToFinding), catalog, config, {
    promote: !args.includes("--no-promote"),
    severities,
    logPath: path.join(wiki, "patterns.log"),
    trigger: `import-gitlab-review:${path.basename(tsvPath)}`,
  });
  catalog.regenerateIndex();

  console.log(`Imported ${path.basename(tsvPath)} into ${wiki}`);
  console.log(`  Rows: ${rows.length} | In severity set (${severities.join(",")}): ${rows.length - summary.discarded.belowSeverity}`);
  console.log(`  Entries created: ${summary.created} | Occurrences folded: ${summary.incremented} | Already recorded: ${summary.alreadySeen}`);
  console.log(`  Promoted: ${summary.promoted.length} | Discarded without citation: ${summary.discarded.noCite}`);
}

main();
