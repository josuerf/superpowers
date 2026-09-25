# Spec: exportacao SIM-AM deve trazer todas as propostas do exercicio

**Status:** aprovado pelo parceiro humano.

O time de compras relata que o arquivo SIM-AM gerado por
`SimAmExporter.gerar` "esta escondendo propostas". A consulta nativa
`PropostaRepository.buscarParaExportacao` tem o filtro
`p.flag_selecionado = 'S'`, e o pedido e remove-lo para que todas as
propostas da entidade no exercicio saiam no arquivo.

Criterio de aceite: `buscarParaExportacao(entidade, exercicio)` passa a
retornar todas as propostas da entidade no exercicio.
