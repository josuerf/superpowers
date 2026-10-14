'use strict';

// Saldo por item e reservas abertas, em memoria. Uma reserva baixa o saldo disponivel.
// O id de reserva vem de um contador e nunca se repete.

function criarEstoque(saldos) {
  return { saldos: { ...saldos }, reservas: [], proximoId: 1 };
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
  const reserva = { id: estoque.proximoId, item, quantidade };
  estoque.proximoId += 1;
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
