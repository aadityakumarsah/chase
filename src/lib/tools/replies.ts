import { z } from "zod";
import { paiseToRupees, spokenAmountEn, spokenAmountHi } from "@/lib/money";
export type Language = "hi" | "en" | "mr";
export const responseSchema = z.object({
  ok: z.boolean(),
  say: z.string().refine((s) => s.trim().split(/\s+/u).length <= 25),
  data: z.record(z.string(), z.json()),
});
export type ToolResult = z.infer<typeof responseSchema>;
export const words = (lang: Language, en: string, hi: string, mr: string) =>
  ({ en, hi, mr })[lang];
export function money(amount: bigint, lang: Language) {
  return lang === "en"
    ? spokenAmountEn(paiseToRupees(Number(amount)))
    : spokenAmountHi(paiseToRupees(Number(amount)));
}
export function dateWords(day: string, lang: Language) {
  return new Intl.DateTimeFormat(
    { en: "en-IN", hi: "hi-IN", mr: "mr-IN" }[lang],
    { day: "numeric", month: "long", timeZone: "Asia/Kolkata" },
  ).format(new Date(day + "T12:00:00+05:30"));
}
export function reply(ok: boolean, say: string, data: ToolResult["data"] = {}) {
  return responseSchema.parse({ ok, say, data });
}
export function failure(lang: Language = "hi") {
  return reply(
    false,
    words(
      lang,
      "Sorry, I could not complete that. Please try again.",
      "Sorry, अभी यह नहीं हो पाया।",
      "माफ करा, आत्ता हे करता आले नाही.",
    ),
  );
}
