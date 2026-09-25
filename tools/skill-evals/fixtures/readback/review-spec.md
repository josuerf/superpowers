# Spec: calculo de verba por agrupador

`CalculoVerbaService.calcular(Long codVerba)` ganha o parametro obrigatorio
`Long codAgrupador` e multiplica o resultado pelo fator do agrupador.
As formulas de verba ja cadastradas pelos clientes chamam `calcular` pelo
`FormulaResolver`.
