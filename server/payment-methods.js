import { z, amount } from "./validate.js";
import { cents } from "./money.js";
import { check } from "./db.js";
export const paymentSchema = z
  .object({
    cash: amount,
    sinpe: amount,
    card: amount,
    cash_received: amount.optional(),
  })
  .strict();
export function nonnegative(value) {
  const text = String(value);
  check(
    /^\d{1,10}(\.\d{1,2})?$/.test(text),
    "Indica un importe válido con hasta dos decimales",
  );
  return Number(text) === 0 ? 0 : cents(text);
}
export function paymentMethodValues(input, total, previous = null) {
  if (!input) {
    check(
      !previous || previous.payment_cash == null || previous.amount === total,
      "Indica los medios de pago para el nuevo importe",
    );
    return previous
      ? {
          payment_cash: previous.payment_cash,
          payment_sinpe: previous.payment_sinpe,
          payment_card: previous.payment_card,
          cash_received: previous.cash_received,
          cash_change: previous.cash_change,
        }
      : {
          payment_cash: null,
          payment_sinpe: null,
          payment_card: null,
          cash_received: null,
          cash_change: null,
        };
  }
  const cash = nonnegative(input.cash),
    sinpe = nonnegative(input.sinpe),
    card = nonnegative(input.card);
  check(
    cash + sinpe + card === total,
    "Efectivo SINPE y tarjeta deben sumar el monto del pago",
  );
  const received =
    input.cash_received === undefined ? cash : nonnegative(input.cash_received);
  check(
    received >= cash && (cash > 0 || received === 0),
    "El efectivo entregado debe cubrir la parte en efectivo",
  );
  return {
    payment_cash: cash,
    payment_sinpe: sinpe,
    payment_card: card,
    cash_received: received,
    cash_change: received - cash,
  };
}
