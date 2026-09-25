package br.gov.licitacao.export;

import br.gov.licitacao.repo.Proposta;
import br.gov.licitacao.repo.PropostaRepository;
import java.util.List;

/** Gera o arquivo de propostas do SIM-AM (layout fixo do TCE). */
public class SimAmExporter {
    private final PropostaRepository repo;

    public SimAmExporter(PropostaRepository repo) {
        this.repo = repo;
    }

    public String gerar(Long entidade, Integer exercicio) {
        List<Proposta> propostas = repo.buscarParaExportacao(entidade, exercicio);
        StringBuilder sb = new StringBuilder();
        for (Proposta p : propostas) {
            sb.append(LinhaSimAm.formatar(p)).append('\n');
        }
        return sb.toString();
    }
}
