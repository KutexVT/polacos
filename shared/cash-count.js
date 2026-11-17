// Same CRC denominations and quantity limits as Bar Chana.
export const cashGroups = [
  {
    name: "Billetes",
    singular: "billetes",
    values: [20000, 10000, 5000, 2000, 1000],
  },
  { name: "Monedas", singular: "monedas", values: [500, 100, 50, 25, 10] },
];
export const methods = ["cash", "sinpe", "card"];
export const methodNames = {
  cash: "Efectivo",
  sinpe: "SINPE",
  card: "Tarjeta",
};
export function cashQuantity(value = "") {
  if (value === "") return 0;
  return /^\d{1,7}$/.test(String(value)) && Number(value) <= 1000000
    ? Number(value)
    : null;
}
export function cashTotal(values, counts) {
  let total = 0;
  for (const value of values) {
    const n = cashQuantity(counts[value]);
    if (n === null) return null;
    total += value * n * 100;
  }
  return total;
}
