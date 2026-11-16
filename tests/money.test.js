import test from "node:test";
import assert from "node:assert/strict";
import { cents, makeSchedule, ledger, today, date } from "../server/money.js";
const plan = {
  frequency: "monthly",
  start: "2026-01-31",
  day: 31,
  installment: 10000,
};
test("Dinero exacto: centavos, decimales inválidos y límites", () => {
  assert.equal(cents("0.29"), 29);
  assert.equal(cents("100000.01"), 10000001);
  for (const s of ["-1", "0", "0.001", "1e4", "NaN", 1.234])
    assert.throws(() => cents(s));
});
test("Costa Rica y fechas válidas", () => {
  assert.equal(today(new Date("2026-02-01T03:00:00Z")), "2026-01-31");
  assert.throws(() => date("2026-02-30"));
});
test("Fin de mes, trimestre, diaria y semanal", () => {
  assert.deepEqual(
    makeSchedule(cents(30000), plan).map((r) => r.due),
    ["2026-01-31", "2026-02-28", "2026-03-31"],
  );
  assert.deepEqual(
    makeSchedule(cents(30000), { ...plan, frequency: "quarterly" }).map(
      (r) => r.due,
    ),
    ["2026-01-31", "2026-04-30", "2026-07-31"],
  );
  assert.deepEqual(
    makeSchedule(cents(30000), { ...plan, day: 15 }).map((r) => r.due),
    ["2026-02-15", "2026-03-15", "2026-04-15"],
  );
  assert.equal(
    makeSchedule(cents(20000), { ...plan, frequency: "weekly" })[1].due,
    "2026-02-07",
  );
  assert.equal(
    makeSchedule(cents(20000), { ...plan, frequency: "daily" })[1].due,
    "2026-02-01",
  );
});
test("Quincenas distintas y vencimientos personalizados", () => {
  assert.deepEqual(
    makeSchedule(cents(30000), {
      ...plan,
      start: "2026-02-15",
      frequency: "biweekly",
    }).map((r) => r.due),
    ["2026-02-15", "2026-03-02", "2026-03-17"],
  );
  assert.deepEqual(
    makeSchedule(cents(30000), {
      ...plan,
      start: "2026-02-15",
      frequency: "semimonthly",
      days: [15, 31],
    }).map((r) => r.due),
    ["2026-02-15", "2026-02-28", "2026-03-15"],
  );
  assert.equal(makeSchedule(cents(25000), plan)[2].amount, cents(5000));
  assert.throws(() =>
    makeSchedule(cents(10000), {
      frequency: "custom",
      dates: [{ due: "2026-01-01", amount: 9999 }],
    }),
  );
  assert.equal(
    makeSchedule(cents(10000), {
      frequency: "custom",
      dates: [
        { due: "2026-01-01", amount: 6000 },
        { due: "2026-02-01", amount: 4000 },
      ],
    }).length,
    2,
  );
});
test("Abono obligatorio: 100000 - 20000 conserva cuotas de 10000 y elimina dos finales", () => {
  const p = {
    unit_price: cents(100000),
    quantity: 1,
    schedule: makeSchedule(cents(100000), plan),
  };
  const l = ledger(p, [{ amount: cents(20000), kind: "capital" }]);
  assert.equal(l.balance, cents(80000));
  assert.equal(l.remaining_count, 8);
  assert.equal(l.schedule[0].remaining, cents(10000));
  assert.equal(l.schedule[8].amount, 0);
  assert.equal(l.schedule[9].amount, 0);
});
test("Parcial, adelanto seleccionado, abono y liquidación conservan saldo e historia", () => {
  const p = {
    unit_price: cents(100000),
    quantity: 1,
    schedule: makeSchedule(cents(100000), plan),
  };
  const pays = [
    { amount: cents(4000), kind: "installment", targets: ["q1"] },
    { amount: cents(10000), kind: "installment", targets: ["q3"] },
    { amount: cents(20000), kind: "capital" },
  ];
  let l = ledger(p, pays, "2026-02-01");
  assert.equal(l.overdue, cents(6000));
  assert.equal(l.schedule[2].status, "paid");
  assert.equal(l.schedule[0].paid, cents(4000));
  l = ledger(p, [...pays, { amount: cents(66000), kind: "capital" }]);
  assert.equal(l.balance, 0);
  assert.equal(l.remaining_count, 0);
  assert.throws(() => ledger(p, [{ amount: cents(110000), kind: "capital" }]));
  assert.throws(() =>
    ledger(p, [{ amount: cents(20000), kind: "installment", targets: ["q1"] }]),
  );
  assert.equal(ledger(p, [{ ...pays[0], voided: true }]).paid, 0);
});
