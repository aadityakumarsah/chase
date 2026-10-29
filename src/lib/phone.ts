import { z } from "zod";
export const e164Schema = z.string().regex(/^\+[1-9]\d{6,14}$/);
export function normalisePhone(input: string): string {
  z.string()
    .min(1)
    .max(40)
    .regex(/^[+\d\s().-]+$/)
    .parse(input);
  let digits = input.replace(/[\s().-]/g, "");
  if (digits.startsWith("0091")) digits = `+91${digits.slice(4)}`;
  if (/^0[6-9]\d{9}$/.test(digits)) digits = digits.slice(1);
  if (/^[6-9]\d{9}$/.test(digits)) digits = `+91${digits}`;
  if (/^91[6-9]\d{9}$/.test(digits)) digits = `+${digits}`;
  return z
    .string()
    .regex(/^\+91[6-9]\d{9}$/)
    .parse(digits);
}
export function maskPhone(input: string): string {
  const phone = normalisePhone(input);
  const national = phone.slice(3);
  return `+91 ${national.slice(0, 2)}XXX XX${national.slice(-3)}`;
}
