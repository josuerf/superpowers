package br.gov.licitacao.repo;

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.Id;
import javax.persistence.Table;

@Entity
@Table(name = "lic_proposta")
public class Proposta {
    @Id
    private Long id;
    @Column(name = "cod_entidade")
    private Long codEntidade;
    private Integer exercicio;
    private String modalidade;
    @Column(name = "flag_selecionado")
    private String flagSelecionado;
    private String status;
}
