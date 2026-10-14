'use strict';

// Saldo por item e reservas abertas, em memoria. Uma reserva baixa o saldo disponivel.

function criarEstoque(saldos) {
  return { saldos: { ...saldos }, reservas: [] };
}

function saldoDisponivel(estoque, item) {
  return estoque.saldos[item] ?? 0;
}

function reservar(estoque, item, quantidade) {
  if (!Number.isInteger(quantidade) || quantidade <= 0) {
    throw new Error('quantidade invalida');
  }
  const saldo = saldoDisponivel(estoque, item);
  if (quantidade > saldo) {
    throw new Error('saldo insuficiente');
  }
  estoque.saldos[item] = saldo - quantidade;
  const reserva = { id: estoque.reservas.length + 1, item, quantidade };
  estoque.reservas.push(reserva);
  return reserva;
}

// Cancela uma reserva aberta e devolve a quantidade ao saldo do item.
function cancelarReserva(estoque, id) {
  const reserva = estoque.reservas.find((r) => r.id === id);
  if (!reserva) {
    throw new Error('reserva inexistente');
  }
  estoque.saldos[reserva.item] = saldoDisponivel(estoque, reserva.item) + reserva.quantidade;
  return reserva;
}

module.exports = { criarEstoque, saldoDisponivel, reservar, cancelarReserva };
