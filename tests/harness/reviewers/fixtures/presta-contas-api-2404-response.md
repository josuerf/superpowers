<!-- REVIEWER_DECISION -->
```json
{
  "harness_action": "BLOCK",
  "metrics": {
    "total_findings": 2,
    "critical_high_count": 2
  },
  "asi_target": {
    "has_asi": true,
    "file": "projects/presta-contas-api/src/main/java/br/com/equiplano/nova/asgard/contas/repository/licitacaodb/cancelamentolicitacaoresultado/CancelamentoLicitacaoResultadoRepository.java",
    "line": 45,
    "issue_summary": "Removed the lr.flag_selecionado = 'S' filter: the SIMAM 'CancelamentoVencedorLicitacao' export now includes cancellations of bid results that were never selected as winners.",
    "fix_instruction": "Restore `\"and lr.flag_selecionado = 'S' \\n\" +` in the WHERE clause of buscarDadosArquivoSimamCancelamentoVencedorLicitacao, between the `lc.data_cancelamento between` line and the `ent.uuid = :entidadeUuid` line. If the removal is intentional because cancelling a winner flips flag_selecionado to 'N', do not drop the filter entirely: replace it with a criterion that identifies the result that WAS the winner (for example, a history field or a status on licitacao_cancelamento), and document the rule in the commit."
  },
  "findings": [
    {
      "severity": "High",
      "category": "business-rule",
      "file": "projects/presta-contas-api/src/main/java/br/com/equiplano/nova/asgard/contas/repository/licitacaodb/cancelamentolicitacaoresultado/CancelamentoLicitacaoResultadoRepository.java",
      "line": 45,
      "issue": "Removed the `lr.flag_selecionado = 'S'` filter from the query behind the SIMAM 'Cancelamento Vencedor Licitação' file for the TCE. With no justification in the diff or in the method name (which still says 'Vencedor'), any licitacao_resultado that has a row in licitacao_cancelamento goes into the file, winner or not. Trigger: a bid with two bidders on the same item/lot, where the result for bidder A has flag_selecionado='S' and the result for bidder B has flag_selecionado='N', and both have a licitacao_cancelamento row with data_cancelamento inside [dataInicio, dataFim]. Before the change, 1 row went out (A). Now 2 go out (A and B), and B is reported to the TCE as a winner's cancellation.",
      "suggestion": "Restore the line:\n```diff\n             \"where lc.data_cancelamento between :dataInicio and :dataFim \\n\" +\n+            \"and lr.flag_selecionado = 'S' \\n\" +\n             \"and ent.uuid = :entidadeUuid\\n\" +\n```\nIf the reason for the removal is that cancelling the winner flips flag_selecionado to 'N' (so the cancelled winner vanished from the file), fix it with a criterion that still identifies the ORIGINAL winner, not by dropping the filter. Record the rule in the commit and add a regression test with one selected result and one non-selected result, both cancelled."
    },
    {
      "severity": "High",
      "category": "business-rule",
      "file": "projects/presta-contas-api/src/main/java/br/com/equiplano/nova/asgard/contas/repository/licitacaodb/cancelamentolicitacaoresultado/CancelamentoLicitacaoResultadoRepository.java",
      "line": 47,
      "issue": "Removed the `lf.tipo_operacao_novos_executores_licitacao_tce_id is null` filter. `lf` comes in through a LEFT JOIN on (licitacao_id, fornecedor_uuid). The filter did two things: it excluded suppliers linked through a 'novos executores' operation from the TCE, and it held the join to at most the original link row. No justification is given for either. Trigger 1 (inclusion): a supplier whose only licitacao_fornecedor row has tipo_operacao_novos_executores_licitacao_tce_id filled in (for example, a substitute executor) and whose result was cancelled within the period. Before, it was excluded (the IS NULL test on the WHERE fails when lf matches with a non-null value). Now it goes into the file. Trigger 2 (duplication): a supplier with two licitacao_fornecedor rows for the same bid, the original one (op null) and one for a novos-executores operation. Before, the join produced 1 row per cancellation. Now it produces 2 identical rows, which duplicates the cancellation record in the SIMAM file.",
      "suggestion": "Restore the line:\n```diff\n             \"and ent.uuid = :entidadeUuid\\n\" +\n+            \"and lf.tipo_operacao_novos_executores_licitacao_tce_id is null \\n\" +\n             \"AND tmlt.codigo != 999 and l.data_emissao <= '2026-04-30 23:59:59' \" +\n```\nIf the intent really is to include novos executores, move the condition into the ON clause of the LEFT JOIN, or guarantee cardinality 1 per (licitacao, fornecedor) with DISTINCT ON or a subquery. Document which TCE rule now requires including them."
    }
  ]
}
```
<!-- /REVIEWER_DECISION -->

# Relatório de auditoria

**Limite desta revisão:** eu só tinha as ferramentas do Atlassian nesta sessão. Não havia leitura de arquivo, grep nem `forge_siblings`/`forge_locate`. O arquivo também não faz parte deste worktree (`sp-wt/b2`). Por isso **não fiz a comparação com os métodos irmãos** do repositório, e nenhum achado depende dela: a política proíbe achado de divergência sem citar o irmão. Os dois achados abaixo valem pela regra "remoção é achado até que se prove o contrário".

Um ponto a favor: o diff é pequeno e mexe só na cláusula WHERE. Não afeta assinatura, projeção nem ordenação.

