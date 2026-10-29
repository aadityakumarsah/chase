import { z } from "zod";
export const healthSchema = z.object({
  ok: z.boolean(),
  db: z.enum(["reachable", "missing", "unreachable"]),
  bolna: z.enum(["configured", "missing"]),
  llm: z.object({ provider: z.string(), model: z.string() }),
  messaging: z.string(),
  payments: z.string(),
  demoMode: z.boolean(),
});
export type Health = z.infer<typeof healthSchema>;
