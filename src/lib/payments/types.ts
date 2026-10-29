import { z } from "zod";
export const paymentRequestSchema = z.object({
  amountPaise: z.number().int().positive().safe(),
  debtorId: z.uuid(),
});
export type PaymentRequest = z.infer<typeof paymentRequestSchema>;
export interface PaymentsProvider {
  createLink(input: PaymentRequest): Promise<{ id: string; url: string }>;
  checkStatus(id: string): Promise<"pending" | "paid" | "failed">;
}
