import { z } from "zod";
export const uuid = z.string().uuid();
export const name = z.string().trim().min(1).max(150);
export const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9_.-]{3,50}$/,
    "Usa de 3 a 50 letras, números, puntos o guiones",
  );
export const text = z.string().max(5000).default("");
export const key = z.string().min(8).max(100);
export const amount = z.union([z.string(), z.number()]);
export const plan = z.object({
  frequency: z.enum([
    "daily",
    "weekly",
    "biweekly",
    "semimonthly",
    "monthly",
    "quarterly",
    "custom",
  ]),
  start: z.string().optional(),
  installment: amount.optional(),
  day: z.coerce.number().optional(),
  days: z.array(z.coerce.number()).optional(),
  dates: z
    .array(
      z.object({ id: z.string().max(70).optional(), due: z.string(), amount }),
    )
    .max(1000)
    .optional(),
});
export const parse = (schema, req) => schema.parse(req.body);
export { z };
