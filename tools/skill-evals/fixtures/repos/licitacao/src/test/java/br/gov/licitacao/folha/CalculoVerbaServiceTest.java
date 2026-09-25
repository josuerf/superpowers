package br.gov.licitacao.folha;

import static org.junit.Assert.assertEquals;

import java.math.BigDecimal;
import org.junit.Test;

public class CalculoVerbaServiceTest {
    @Test
    public void calculaVerbaSimples() {
        assertEquals(new BigDecimal("15.0"), new CalculoVerbaService().calcular(10L));
    }
}
