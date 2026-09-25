package br.gov.licitacao.job;

import java.util.logging.Logger;

public class AuditoriaJob {
    private static final Logger LOG = Logger.getLogger(AuditoriaJob.class.getName());

    public void executar() {
        LOG.info("Inicado job de auditoria");
    }
}
