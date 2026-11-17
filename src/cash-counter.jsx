import { Banknote, Coins, Minus, Plus, RotateCcw } from "lucide-react";
import { useApp } from "./main";
import { Heading } from "./commerce";
import { Button } from "./ui";
import { money } from "./api";
import { cashGroups, cashQuantity, cashTotal } from "../shared/cash-count";
export function CashCounter({ counts, onChange, embedded = false }) {
  const total = cashTotal(
    cashGroups.flatMap((g) => g.values),
    counts,
  );
  return (
    <section className="cash-counter" aria-label="Contador de efectivo">
      {embedded ? (
        <div className="section-heading">
          <h2>Contar efectivo de la caja</h2>
          <Button
            type="button"
            variant="quiet"
            icon={RotateCcw}
            onClick={() => onChange({})}
          >
            Limpiar conteo
          </Button>
        </div>
      ) : (
        <Heading
          title="Contar efectivo"
          description="Indica cuántos billetes y monedas tienes. El total se calcula al momento"
        >
          <Button
            icon={RotateCcw}
            variant="secondary"
            onClick={() => onChange({})}
          >
            Limpiar conteo
          </Button>
        </Heading>
      )}
      <div
        className="cash-count-summary"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <span>Total contado</span>
        <output aria-label="Total contado">
          {total === null ? "Revisa las cantidades" : money(total)}
        </output>
        <small>
          {embedded
            ? "Incluye todo el efectivo de la caja y el fondo inicial"
            : "Conteo independiente de los cobros · Colones costarricenses"}
        </small>
      </div>
      <div className="cash-groups">
        {cashGroups.map((g, index) => {
          const subtotal = cashTotal(g.values, counts),
            Icon = index === 0 ? Banknote : Coins;
          return (
            <section className="cash-group" key={g.name}>
              <h3>
                <Icon size={20} aria-hidden="true" />
                {g.name}
              </h3>
              <div className="cash-columns" aria-hidden="true">
                <span>Valor</span>
                <span>Cantidad</span>
                <span>Subtotal</span>
              </div>
              {g.values.map((value) => {
                const quantity = cashQuantity(counts[value]);
                return (
                  <div className="cash-row" key={value}>
                    <strong>{money(value * 100)}</strong>
                    <div className="cash-stepper">
                      <button
                        type="button"
                        aria-label={"Quitar " + g.singular + " de ₡" + value}
                        disabled={quantity === null || quantity === 0}
                        onClick={() =>
                          onChange({ ...counts, [value]: String(quantity - 1) })
                        }
                      >
                        <Minus size={16} />
                      </button>
                      <input
                        aria-label={
                          "Cantidad de " + g.singular + " de ₡" + value
                        }
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        autoComplete="off"
                        placeholder="0"
                        value={counts[value] ?? ""}
                        aria-invalid={quantity === null}
                        aria-describedby={
                          quantity === null ? "cash-error-" + value : undefined
                        }
                        onChange={(e) =>
                          onChange({ ...counts, [value]: e.target.value })
                        }
                      />
                      <button
                        type="button"
                        aria-label={"Agregar " + g.singular + " de ₡" + value}
                        disabled={quantity === null || quantity >= 1000000}
                        onClick={() =>
                          onChange({ ...counts, [value]: String(quantity + 1) })
                        }
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                    <span className="cash-row-total">
                      {quantity === null
                        ? "Revisa la cantidad"
                        : money(value * quantity * 100)}
                    </span>
                    {quantity === null && (
                      <small
                        id={"cash-error-" + value}
                        className="cash-error text-danger"
                      >
                        Usa una cantidad entera entre 0 y 1000000
                      </small>
                    )}
                  </div>
                );
              })}
              <div className="cash-subtotal">
                <span>Subtotal {g.name.toLowerCase()}</span>
                <strong>
                  {subtotal === null
                    ? "Revisa las cantidades"
                    : money(subtotal)}
                </strong>
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
export function CashCounterPage() {
  const a = useApp();
  return (
    <>
      <CashCounter counts={a.cashCounts} onChange={a.setCashCounts} />
      <div className="cash-count-action">
        <Button onClick={() => a.navigate("/register")}>
          Usar este conteo en el cierre
        </Button>
      </div>
    </>
  );
}
