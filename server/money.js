import { check } from "./db.js";
export const today = (now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Costa_Rica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
export function cents(value) {
  const text = String(value);
  check(
    /^\d{1,10}(\.\d{1,2})?$/.test(text),
    "Indica un monto positivo con un máximo de dos decimales",
  );
  const [a, b = ""] = text.split(".");
  const n = Number(a) * 100 + Number(b.padEnd(2, "0"));
  check(
    Number.isSafeInteger(n) && n > 0 && n <= 1e12,
    "El monto está fuera del rango permitido",
  );
  return n;
}
export function date(value) {
  check(
    typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !isNaN(Date.parse(value)) &&
      new Date(value + "T12:00:00Z").toISOString().slice(0, 10) === value,
    "Fecha inválida",
  );
  return value;
}
function addDays(d, n) {
  const x = new Date(date(d) + "T12:00:00Z");
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}
function monthDate(year, month, day) {
  return new Date(
    Date.UTC(
      year,
      month,
      Math.min(day, new Date(Date.UTC(year, month + 1, 0)).getUTCDate()),
      12,
    ),
  )
    .toISOString()
    .slice(0, 10);
}
export function makeSchedule(total, plan) {
  check(
    Number.isSafeInteger(total) && total > 0 && total <= 1e12,
    "Total inválido",
  );
  check(plan && typeof plan === "object", "Define el calendario");
  if (plan.frequency === "custom") {
    check(
      Array.isArray(plan.dates) &&
        plan.dates.length > 0 &&
        plan.dates.length <= 1000,
      "Añade entre 1 y 1000 vencimientos",
    );
    const rows = plan.dates
      .map((r, i) => ({
        id: r.id || `q${i + 1}`,
        due: date(r.due),
        amount: cents(r.amount),
      }))
      .sort((a, b) => a.due.localeCompare(b.due));
    check(
      new Set(rows.map((r) => r.id)).size === rows.length,
      "Cuotas duplicadas",
    );
    check(
      rows.reduce((s, r) => s + r.amount, 0) === total,
      "Los vencimientos deben sumar el total exacto",
    );
    return rows;
  }
  const start = date(plan.start);
  const amount = cents(plan.installment);
  const count = Math.ceil(total / amount);
  check(count <= 1000, "El calendario no puede superar 1000 cuotas");
  const allowed = [
    "daily",
    "weekly",
    "biweekly",
    "semimonthly",
    "monthly",
    "quarterly",
  ];
  check(allowed.includes(plan.frequency), "Frecuencia inválida");
  const day = Number(plan.day || Number(start.slice(8)));
  check(
    Number.isInteger(day) && day >= 1 && day <= 31,
    "El día debe estar entre 1 y 31",
  );
  let due = start;
  const rows = [];
  const [y, m] = start.split("-").map(Number);
  let fixed = (plan.days || [15, 30]).map(Number).sort((a, b) => a - b);
  if (plan.frequency === "semimonthly")
    check(
      fixed.length === 2 &&
        fixed[0] >= 1 &&
        fixed[1] <= 31 &&
        fixed[0] < fixed[1],
      "Elige dos días diferentes del mes",
    );
  for (let i = 0; i < count; i++) {
    if (plan.frequency === "monthly" || plan.frequency === "quarterly") {
      const step = plan.frequency === "quarterly" ? 3 : 1;
      const initial = monthDate(y, m - 1, day) < start ? step : 0;
      due = monthDate(y, m - 1 + initial + i * step, day);
    } else if (plan.frequency === "semimonthly") {
      let cursor = i ? addDays(rows[i - 1].due, 1) : start;
      for (let j = 0; j < 370; j++) {
        const [cy, cm, cd] = cursor.split("-").map(Number);
        const matches = [
          ...new Set(fixed.map((d) => monthDate(cy, cm - 1, d))),
        ];
        if (matches.includes(cursor)) {
          due = cursor;
          break;
        }
        cursor = addDays(cursor, 1);
      }
    } else if (i) {
      due = addDays(due, { daily: 1, weekly: 7, biweekly: 15 }[plan.frequency]);
    }
    rows.push({
      id: `q${i + 1}`,
      due,
      amount: Math.min(amount, total - i * amount),
    });
  }
  return rows;
}
export function ledger(purchase, payments, asOf = today()) {
  const total = purchase.unit_price * purchase.quantity;
  check(Number.isSafeInteger(total), "Total fuera de rango");
  const rows = purchase.schedule.map((r) => ({ ...r, paid: 0 }));
  check(
    rows.reduce((s, r) => s + r.amount, 0) === total,
    "El calendario no coincide con el total",
  );
  let paid = 0;
  for (const p of payments.filter((p) => !p.voided)) {
    check(
      p.amount > 0 && p.amount <= total - paid,
      "El pago supera el saldo disponible",
    );
    let remaining = p.amount;
    if (p.kind === "capital") {
      for (let i = rows.length - 1; i >= 0 && remaining; i--) {
        const n = Math.min(remaining, rows[i].amount - rows[i].paid);
        rows[i].amount -= n;
        remaining -= n;
      }
    } else {
      const target =
        Array.isArray(p.targets) && p.targets.length
          ? rows.filter((r) => p.targets.includes(r.id))
          : rows;
      for (const r of target) {
        const n = Math.min(remaining, r.amount - r.paid);
        r.paid += n;
        remaining -= n;
        if (!remaining) break;
      }
    }
    check(
      remaining === 0,
      "El pago excede las cuotas seleccionadas. Revisa las aplicaciones posteriores",
    );
    paid += p.amount;
  }
  const schedule = rows.map((r) => ({
    ...r,
    remaining: r.amount - r.paid,
    status:
      r.amount === r.paid
        ? "paid"
        : r.due < asOf
          ? "overdue"
          : r.paid
            ? "partial"
            : "pending",
  }));
  return {
    total,
    paid,
    balance: total - paid,
    schedule,
    remaining_count: schedule.filter((r) => r.remaining > 0).length,
    next: schedule.find((r) => r.remaining > 0) || null,
    overdue: schedule
      .filter((r) => r.due < asOf)
      .reduce((s, r) => s + r.remaining, 0),
  };
}
