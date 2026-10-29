import { z } from "zod";
export const DossierSchema = z.strictObject({
  dossier_text: z
    .string()
    .max(600)
    .describe("Plain English, third person; use only supplied facts"),
  preferred_language: z.enum(["hi", "en", "mr"]),
  best_time_window: z.enum(["morning", "afternoon", "evening", "unknown"]),
  tone_hint: z.string().max(80),
  open_commitments: z
    .array(
      z.strictObject({
        type: z.enum(["promise", "callback", "dispute"]),
        detail: z.string().max(200),
        due: z.union([z.iso.date(), z.literal("")]),
      }),
    )
    .max(20),
  do_not_mention: z.array(z.string().max(160)).max(20),
});
export type Dossier = z.infer<typeof DossierSchema>;
