# Spec: contabilizacao de lotes em paralelo

**Status:** aprovado pelo parceiro humano.

A rotina `ContabilizacaoJob` processa hoje os lotes de lancamentos em
sequencia. Deve passar a processa-los com 4 workers em paralelo. Todos os
workers incrementam o mesmo contador de sequencia `seq_lancamento` por
`groupKey` e gravam na mesma tabela `ctb_lancamento`, cada lote em uma
transacao.

Tarefas previstas: (1) pool de workers; (2) particionar os lotes por
`groupKey`; (3) relatorio de conclusao da rotina.
