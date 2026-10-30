import { z } from "zod";

const context = {
  account_id: z.uuid(),
  call_token: z.string().regex(/^[a-f0-9]{64}$/),
};
const amount = z.coerce.number().int().positive().max(100_000_000);
export const toolSchemas = {
  send_payment_link: z.object({ ...context, amount_rupees: amount }),
  record_promise_to_pay: z.object({
    ...context,
    amount_rupees: amount,
    promise_date: z.iso.date(),
    reason_code: z.enum([
      "salary_delay",
      "cash_flow",
      "hardship",
      "avoidance",
      "other",
    ]),
  }),
  check_payment_status: z.object(context),
  schedule_callback: z.object({
    ...context,
    callback_date: z.iso.date(),
    time_window: z.enum(["morning", "afternoon", "evening"]),
  }),
  flag_dispute: z.object({
    ...context,
    dispute_type: z.enum([
      "wrong_amount",
      "already_paid",
      "not_my_invoice",
      "quality_issue",
      "other",
    ]),
    details: z.string().min(1).max(1000),
  }),
  register_opt_out: z.object({ ...context, scope: z.enum(["call", "all"]) }),
};
export type ToolName = keyof typeof toolSchemas;
export const TOOL_NAMES = Object.keys(toolSchemas) as ToolName[];
export const TRANSFER_TOOL_NAME = "transfer_to_owner";
const descriptions: Record<ToolName, string> = {
  send_payment_link:
    "After identity confirmation and agreement to pay now, send a link for the agreed whole-rupee amount.",
  record_promise_to_pay:
    "Record a specific amount and date the caller has confirmed, between today and 30 days later.",
  check_payment_status:
    "Check payment after the caller says they paid; never assume a payment arrived.",
  schedule_callback:
    "Record a requested date and time window; tell the caller only the allowed time returned.",
  flag_dispute:
    "Immediately flag a disputed amount, invoice or already-paid claim for owner review. Never argue.",
  register_opt_out:
    "Immediately honor a request to stop calls or all contact. Do not try to persuade them again.",
};
const preCall: Partial<Record<ToolName, string>> = {
  send_payment_link: "एक second, मैं WhatsApp पर link भेज रही हूँ।",
  record_promise_to_pay: "ठीक है, मैं note कर रही हूँ।",
  check_payment_status: "एक second, मैं check करती हूँ।",
};
export function toolUrl(baseUrl: string, name: string) {
  return `${baseUrl.replace(/\/$/, "")}/api/tools/${name}`;
}
export function buildApiTools(input: {
  baseUrl: string;
  toolSecret: string;
  transferTo?: string;
}) {
  z.url({ protocol: /^https$/ }).parse(input.baseUrl);
  z.string().min(16).parse(input.toolSecret);
  if (input.transferTo)
    z.string()
      .regex(/^\+[1-9]\d{6,14}$/)
      .parse(input.transferTo);
  const tools: Record<string, unknown>[] = [];
  const tools_params: Record<string, unknown> = {};
  for (const name of TOOL_NAMES) {
    const { $schema: ignored, ...parameters } = z.toJSONSchema(
      toolSchemas[name],
    );
    void ignored;
    const properties = parameters.properties!;
    for (const key of ["account_id", "call_token"])
      properties[key] = {
        type: "string",
        description: `Automatically supplied from {{${key}}}; never ask the caller or read it aloud.`,
      };
    const param = Object.fromEntries(
      Object.keys(properties).map((key) => [
        key,
        `%(${key})${key === "amount_rupees" ? "i" : "s"}`,
      ]),
    );
    tools.push({
      name,
      description: descriptions[name],
      pre_call_message: preCall[name] ?? "ठीक है, एक second।",
      parameters,
      key: "custom_task",
    });
    tools_params[name] = {
      method: "POST",
      url: toolUrl(input.baseUrl, name),
      api_token: `Bearer ${input.toolSecret}`,
      headers: {},
      param,
    };
  }
  if (input.transferTo) {
    tools.push({
      name: TRANSFER_TOOL_NAME,
      key: "transfer_call",
      description:
        "Transfer only when the caller asks for the owner or a person.",
      pre_call_message: "मैं owner से connect करती हूँ।",
      parameters: {
        type: "object",
        properties: { call_sid: { type: "string" } },
        required: ["call_sid"],
      },
    });
    tools_params[TRANSFER_TOOL_NAME] = {
      method: "POST",
      url: null,
      headers: {},
      param: {
        call_transfer_number: input.transferTo,
        call_sid: "%(call_sid)s",
      },
    };
  }
  return { tools, tools_params };
}
export const toolSpecNames = () => [...TOOL_NAMES];
