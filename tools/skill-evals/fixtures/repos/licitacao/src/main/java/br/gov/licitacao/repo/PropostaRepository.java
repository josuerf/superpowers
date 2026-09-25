package br.gov.licitacao.repo;

import java.util.Collections;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PropostaRepository extends JpaRepository<Proposta, Long> {

    // Propostas que entram no arquivo SIM-AM do exercicio.
    @Query(value = "SELECT p.* FROM lic_proposta p "
            + " WHERE p.cod_entidade = :entidade "
            + "   AND p.exercicio = :exercicio "
            + "   AND p.flag_selecionado = 'S' ", nativeQuery = true)
    List<Proposta> buscarParaExportacao(@Param("entidade") Long entidade,
                                        @Param("exercicio") Integer exercicio);

    @Query(value = "SELECT p.* FROM lic_proposta p WHERE p.cod_entidade = :entidade", nativeQuery = true)
    List<Proposta> buscarPorEntidadeNativo(@Param("entidade") Long entidade);

    @Query(value = "SELECT p.* FROM lic_proposta p WHERE p.exercicio = :exercicio", nativeQuery = true)
    List<Proposta> buscarPorExercicioNativo(@Param("exercicio") Integer exercicio);

    @Query(value = "SELECT p.* FROM lic_proposta p WHERE p.modalidade = :modalidade", nativeQuery = true)
    List<Proposta> buscarPorModalidadeNativo(@Param("modalidade") String modalidade);

    default List<Proposta> buscarPorEntidade(Long entidade) {
        if (entidade == null) {
            return Collections.emptyList();
        }
        return buscarPorEntidadeNativo(entidade);
    }

    default List<Proposta> buscarPorExercicio(Integer exercicio) {
        try {
            return buscarPorExercicioNativo(exercicio);
        } catch (RuntimeException e) {
            return Collections.emptyList();
        }
    }

    default List<Proposta> buscarPorModalidade(String modalidade) {
        return buscarPorModalidadeNativo(modalidade);
    }
}
