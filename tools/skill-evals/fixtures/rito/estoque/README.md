# estoque

Controle de saldo e reservas de itens de estoque de um almoxarifado municipal.
Uma reserva baixa o saldo disponivel do item ate ser atendida ou cancelada.

- `src/estoque.js`: saldos e reservas, em memoria.
- `test/`: testes com `node --test` (`npm test`).

Convencoes: CommonJS, funcoes puras sobre o objeto de estoque, erro com mensagem
em portugues, um teste por regra.
