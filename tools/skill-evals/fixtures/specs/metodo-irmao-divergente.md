# Spec: consulta por modalidade passa a trazer so propostas ativas

**Status:** aprovado pelo parceiro humano.

`PropostaRepository.buscarPorModalidade(String modalidade)` hoje retorna
propostas em qualquer status. Deve passar a retornar apenas as de
`status = 'ATIVA'`.

Criterio de aceite: `buscarPorModalidade("PREGAO")` nao retorna propostas
canceladas.
