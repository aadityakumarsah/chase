import { z } from "zod";
const paiseSchema = z.number().int().safe();
export function paiseToRupees(paise: number): number {
  return paiseSchema.parse(paise) / 100;
}
export function rupeesToPaise(rupees: number | string): number {
  const value = z
    .union([z.number().finite(), z.string().regex(/^-?\d+(\.\d{1,2})?$/)])
    .parse(rupees);
  const text = String(value);
  if (!/^-?\d+(\.\d{1,2})?$/.test(text))
    throw new Error("Rupees must have at most two decimal places");
  const [whole, fractional = ""] = text.replace(/^-/, "").split(".");
  const result = BigInt(whole) * 100n + BigInt(fractional.padEnd(2, "0"));
  return paiseSchema.parse(Number(text.startsWith("-") ? -result : result));
}
export function formatINR(paise: number, decimals = 0): string {
  z.number().int().min(0).max(2).parse(decimals);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(paiseToRupees(paise));
}
// Spoken helpers explicitly take display rupees to match the requested voice contract.
// Convert domain paise with paiseToRupees before calling these.
function spoken(rupees: number): string {
  z.number().finite().parse(rupees);
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(
    rupees,
  );
}
export const spokenAmountHi = (rupees: number): string =>
  `${spoken(rupees)} रुपये`;
export const spokenAmountEn = (rupees: number): string =>
  `${spoken(rupees)} rupees`;
