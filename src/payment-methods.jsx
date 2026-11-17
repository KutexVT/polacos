import { useState } from "react";
import { Field } from "./ui";
import { money } from "./api";
import { methods, methodNames } from "../shared/cash-count";
export function paymentFromForm(values, amount) {
  const {
    payment_method,
    payment_cash,
    payment_sinpe,
    payment_card,
    cash_received,
    ...body
  } = values;
  const payment = payment_method
    ? Object.fromEntries(
        methods.map((m) => [
          m,
          payment_method === "mixed"
            ? values["payment_" + m] || "0"
            : payment_method === m
              ? amount
              : 0,
        ]),
      )
    : undefined;
  if (payment && cash_received?.trim()) payment.cash_received = cash_received;
  return { ...body, payment };
}
export function PaymentMethods({ amount, previous }) {
  const initial = previous
    ? previous.payment_cash == null
      ? ""
      : methods.filter((m) => previous["payment_" + m] > 0).length > 1
        ? "mixed"
        : methods.find((m) => previous["payment_" + m] > 0)
    : "cash";
  const [method, setMethod] = useState(initial),
    [split, setSplit] = useState(
      Object.fromEntries(
        methods.map((m) => [m, previous?.["payment_" + m] / 100 || ""]),
      ),
    ),
    [received, setReceived] = useState(
      previous?.cash_received == null
        ? ""
        : String(previous.cash_received / 100),
    );
  const cash =
    method === "mixed"
      ? Number(split.cash || 0)
      : method === "cash"
        ? Number(amount || 0)
        : 0;
  const total = methods.reduce(
    (sum, m) => sum + Math.round(Number(split[m] || 0) * 100),
    0,
  );
  return (
    <>
      <Field label="Medio de pago">
        <select
          name="payment_method"
          value={method}
          onChange={(e) => {
            setMethod(e.target.value);
            setReceived("");
          }}
        >
          {previous?.payment_cash == null && previous && (
            <option value="">Sin clasificar</option>
          )}
          {methods.map((m) => (
            <option key={m} value={m}>
              {methodNames[m]}
            </option>
          ))}
          <option value="mixed">Pago mixto</option>
        </select>
      </Field>
      {method === "mixed" && (
        <>
          <div className="form-grid">
            {methods.map((m) => (
              <Field
                key={m}
                label={methodNames[m] + " (₡)"}
                name={"payment_" + m}
                type="number"
                min="0"
                step="0.01"
                value={split[m]}
                onChange={(e) => setSplit({ ...split, [m]: e.target.value })}
              />
            ))}
          </div>
          <p
            className={
              total === Math.round(Number(amount) * 100)
                ? "muted"
                : "text-danger"
            }
          >
            Suma de los medios: {money(total)} de{" "}
            {money(Math.round(Number(amount) * 100))}
          </p>
        </>
      )}
      {(method === "cash" || method === "mixed") && (
        <>
          <Field
            label="Efectivo entregado (₡)"
            name="cash_received"
            type="number"
            min={cash}
            step="0.01"
            placeholder="Importe exacto"
            value={received}
            onChange={(e) => setReceived(e.target.value)}
            hint="El vuelto se calcula solo sobre la parte en efectivo"
          />
          <p>
            Vuelto:{" "}
            {money(
              received === "" ? 0 : Math.round((Number(received) - cash) * 100),
            )}
          </p>
        </>
      )}
      {method === "" && (
        <p className="notice">
          Este pago no registró el medio de cobro. Elige uno solo si puedes
          verificarlo
        </p>
      )}
    </>
  );
}
