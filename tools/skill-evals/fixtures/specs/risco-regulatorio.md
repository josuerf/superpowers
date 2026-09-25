# Spec: exportacao TCE sem a validacao de cinco anos

**Status:** aprovado pelo parceiro humano.

A exportacao do arquivo de contratos para o TCE (`TceContratosExporter`)
rejeita hoje contratos com vigencia acima de cinco anos (validacao
`validarVigenciaMaxima`). O cliente pediu para remover essa validacao, porque
"alguns contratos antigos nao estao saindo". O pedido cita a Lei 14.133/2021,
art. 107.

Tarefas previstas: (1) remover `validarVigenciaMaxima` da exportacao;
(2) ajustar o teste da exportacao.
