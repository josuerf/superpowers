'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { criarEstoque, saldoDisponivel, reservar, cancelarReserva } = require('../src/estoque');

test('reservar baixa o saldo disponivel', () => {
  const e = criarEstoque({ papel: 10 });
  reservar(e, 'papel', 4);
  assert.strictEqual(saldoDisponivel(e, 'papel'), 6);
});

test('reservar mais que o saldo falha', () => {
  const e = criarEstoque({ papel: 2 });
  assert.throws(() => reservar(e, 'papel', 3), /saldo insuficiente/);
});

test('cancelar reserva devolve o saldo', () => {
  const e = criarEstoque({ papel: 10 });
  const r = reservar(e, 'papel', 4);
  cancelarReserva(e, r.id);
  assert.strictEqual(saldoDisponivel(e, 'papel'), 10);
});
