#!/usr/bin/env node
/**
 * sdd-metrics report — render collect.ts output as Markdown (plan M, M0.3).
 *
 * Usage:
 *   npx tsx tools/sdd-metrics/report.ts --input <metrics.json>
 *   npx tsx tools/sdd-metrics/report.ts --workspace <path> | --discover <dir> [collect options]
 *
 * One section per workspace: the nine series, then the gate counter that
 * decides the warn→block promotion, then the retroactive reconstruction —
 * which is a heuristic and is labeled as one, so nobody reads it as measured.
 */
import * as fs from "node:fs";
import { SERIES, collectFromArgs, parseArgs, type WorkspaceMetrics } from "./collect";

type Json = unknown;

function fmt(value: Json): string {
	if (value === null || value === undefined) return "—";
	if (typeof value === "object") {
		const entries = Object.entries(value as Record<string, Json>);
		if (entries.length === 0) return "—";
		return entries
			.map(([k, v]) => `${k}: ${typeof v === "object" && v !== null ? fmt(v) : String(v)}`)
			.join("; ");
	}
	return String(value);
}

function renderWorkspace(m: WorkspaceMetrics): string {
	const lines: string[] = [];
	lines.push(`## ${m.nome}`, "");
	lines.push(`Workspace: \`${m.workspace}\` · desde: ${m.desde || "início"} · gerado em ${m.gerado_em}`);
	lines.push(`Repositórios: ${m.repositorios.map((r) => `\`${r}\``).join(", ") || "nenhum"}`, "");

	lines.push("| Série | Valor |", "|---|---|");
	const series = m.series as Record<string, Json>;
	for (const name of SERIES) {
		lines.push(`| \`${name}\` | ${fmt(series[name]).replace(/\|/g, "\\|")} |`);
	}
	lines.push("");

	lines.push("### Gates (modo warn)", "");
	lines.push(
		`\`gate_would_block\`: **${m.gates.gate_would_block}** de ${m.gates.eventos} eventos no gate-log` +
			(Object.keys(m.gates.por_repo).length ? ` (${fmt(m.gates.por_repo)})` : ""),
		"",
	);

	lines.push("### Retroativo (heurística, não medição)", "");
	lines.push(`Heurística: ${m.retroativo.heuristica}.`, "");
	lines.push(`Commits provavelmente SDD: **${m.retroativo.commits_provaveis_sdd}**`, "");
	if (m.retroativo.lotes.length) {
		lines.push("| Lote | Janela | Commits no período | Com trailer |", "|---|---|---:|---:|");
		for (const l of m.retroativo.lotes) {
			lines.push(`| \`${l.lote}\` | ${l.inicio.slice(0, 16)} → ${l.fim.slice(0, 16)} | ${l.commits_no_periodo} | ${l.commits_com_trailer} |`);
		}
		lines.push("");
	}
	return lines.join("\n");
}

export function renderReport(data: { workspaces: WorkspaceMetrics[] }): string {
	return ["# Painel SDD", "", ...data.workspaces.map(renderWorkspace)].join("\n");
}

function main() {
	try {
		const args = parseArgs(process.argv.slice(2));
		const data = args.input ? JSON.parse(fs.readFileSync(args.input, "utf8")) : collectFromArgs(args);
		const md = renderReport(data);
		if (args.out) fs.writeFileSync(args.out, `${md}\n`);
		else process.stdout.write(`${md}\n`);
	} catch (e) {
		console.error(e instanceof Error ? e.message : e);
		process.exit(2);
	}
}

if (process.argv[1] && /report\.[jt]s$/.test(process.argv[1])) main();
