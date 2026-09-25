package br.gov.licitacao.folha;

import java.math.BigDecimal;

/** Resolve as formulas de verba cadastradas em producao: "VERBA(123)". */
public class FormulaResolver {
    private final CalculoVerbaService calculo = new CalculoVerbaService();

    public BigDecimal resolver(String formula) {
        Long cod = Long.valueOf(formula.replaceAll("\D", ""));
        return calculo.calcular(cod);
    }
}
