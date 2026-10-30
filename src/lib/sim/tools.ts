import { z } from "zod";
import {
  toolDescriptions,
  toolSchemas,
  TOOL_NAMES,
  TRANSFER_TOOL_NAME,
  type ToolName,
} from "@/lib/bolna/tools";
import {
  callbackSlot,
  validateAmount,
  validPromiseDate,
} from "@/lib/tools/validators";
import { addIstDays, istDay } from "@/lib/time";
import type { Tool } from "@/lib/llm";

export const SIM_ACCOUNT_ID = "11111111-1111-4111-8111-111111111111";
export const SIM_CALL_TOKEN = "a".repeat(64);
const transferSchema = z.strictObject({
  reason: z.string().max(200).optional(),
});

export const simulationTools = (): Tool[] => [
  ...TOOL_NAMES.map((name) => ({
    name,
    description: toolDescriptions[name],
    schema: toolSchemas[name],
  })),
  {
    name: TRANSFER_TOOL_NAME,
    description:
      "Transfer only when the caller explicitly asks for the owner or a person.",
    schema: transferSchema,
  },
];

export type MockToolCall = {
  name: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
};

export class InMemoryToolMock {
  readonly calls: MockToolCall[] = [];
  private paymentSent = false;

  constructor(
    private readonly now = new Date("2026-10-31T07:00:00.000Z"),
    private readonly outstanding = 1_250_000n,
  ) {}

  run(name: string, raw: unknown) {
    let result: Record<string, unknown>;
    if (name === TRANSFER_TOOL_NAME) {
      const args = transferSchema.parse(raw);
      result = {
        ok: true,
        say: "मैं owner से connect करती हूँ।",
        transferred: true,
      };
      this.calls.push({ name, args, result });
      return result;
    }
    if (!Object.hasOwn(toolSchemas, name))
      throw new Error(`Unknown simulator tool: ${name}`);
    const tool = name as ToolName;
    const args = toolSchemas[tool].parse(raw) as Record<string, unknown>;
    if (
      args.account_id !== SIM_ACCOUNT_ID ||
      args.call_token !== SIM_CALL_TOKEN
    )
      throw new Error("Simulator tool context mismatch");
    if (tool === "send_payment_link") {
      const amount = validateAmount(
        Number(args.amount_rupees),
        this.outstanding,
      );
      result = amount.valid
        ? {
            ok: true,
            say: "Payment link WhatsApp पर भेज दी है।",
            status: "queued",
          }
        : { ok: false, say: "कृपया valid amount बताइए।" };
      this.paymentSent = amount.valid;
    } else if (tool === "record_promise_to_pay") {
      const amount = validateAmount(
        Number(args.amount_rupees),
        this.outstanding,
      );
      const validDate = validPromiseDate(String(args.promise_date), this.now);
      result =
        amount.valid && validDate
          ? { ok: true, say: "Promise note कर लिया है।" }
          : { ok: false, say: "सही amount और अगले 30 दिनों की date बताइए।" };
    } else if (tool === "check_payment_status") {
      result = this.paymentSent
        ? { ok: true, say: "Payment अभी pending है।", status: "created" }
        : { ok: false, say: "अभी payment link नहीं है।" };
    } else if (tool === "schedule_callback") {
      const slot = callbackSlot(
        String(args.callback_date),
        args.time_window as "morning" | "afternoon" | "evening" | "after_hours",
        { start: "09:00", end: "18:30" },
        this.now,
      );
      result = {
        ok: true,
        say: slot.adjusted
          ? "Allowed hours में अगला callback note किया है।"
          : "Callback schedule हो गया।",
        scheduled_for: slot.scheduled.toISOString(),
      };
    } else if (tool === "flag_dispute") {
      result = {
        ok: true,
        say: "Owner review करेंगे। Payment calls pause हैं।",
      };
    } else if (tool === "register_opt_out") {
      result = { ok: true, say: "अब हम आपको call नहीं करेंगे।" };
    } else {
      result = { ok: true, say: "Tool completed." };
    }
    this.calls.push({ name, args, result });
    return result;
  }

  defaults() {
    return {
      account_id: SIM_ACCOUNT_ID,
      call_token: SIM_CALL_TOKEN,
      today: istDay(this.now),
      tomorrow: addIstDays(istDay(this.now), 1),
    };
  }
}
