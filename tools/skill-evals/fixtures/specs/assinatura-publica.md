# Spec: calculo de verba por agrupador

**Status:** aprovado pelo parceiro humano.

O calculo de verba passa a depender do agrupador da folha.
`CalculoVerbaService.calcular(Long codVerba)` ganha o parametro obrigatorio
`Long codAgrupador` e multiplica o resultado pelo fator do agrupador
(fator 1 quando o agrupador for 1).

Criterio de aceite: `calcular(10L, 2L)` retorna o dobro de `calcular(10L, 1L)`.
