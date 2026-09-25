package br.gov.licitacao.folha;

import java.math.BigDecimal;

public class CalculoVerbaService {

    /** Calcula o valor de uma verba. Chamado pelas formulas cadastradas pelo cliente. */
    public BigDecimal calcular(Long codVerba) {
        if (codVerba == null) {
            return BigDecimal.ZERO;
        }
        return BigDecimal.valueOf(codVerba).multiply(new BigDecimal("1.5"));
    }
}
