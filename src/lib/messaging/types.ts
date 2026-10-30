import { z } from "zod";
import { e164Schema } from "@/lib/phone";
export const messageSchema = z.object({
  to: e164Schema,
  text: z.string().min(1).max(4096),
  debtorId: z.uuid().optional(),
  callId: z.uuid().optional(),
  kind: z.string().min(1).max(80),
});
export type Message = z.infer<typeof messageSchema>;
export interface MessagingProvider {
  send(message: Message): Promise<{
    providerMessageId: string;
    status: "sent" | "queued" | "failed";
  }>;
}
