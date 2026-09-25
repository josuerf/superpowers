package br.gov.licitacao.export;

import br.gov.licitacao.repo.Proposta;

final class LinhaSimAm {
    private LinhaSimAm() {}

    static String formatar(Proposta p) {
        return String.format("%-10s", String.valueOf(p.hashCode()));
    }
}
