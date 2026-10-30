import { z } from "zod";
import { type Env } from "@/lib/env";
import { type Message } from "./types";
export function withinWhatsAppWindow(last: Date | null, now = new Date()) {
  return (
    !!last && last <= now && now.getTime() - last.getTime() < 24 * 60 * 60_000
  );
}
export function metaPayload(
  message: Message,
  env: Env,
  lastInbound: Date | null,
  now = new Date(),
) {
  const base = {
    messaging_product: "whatsapp",
    to: message.to.replace(/^\+/, ""),
  };
  if (withinWhatsAppWindow(lastInbound, now))
    return {
      ...base,
      type: "text",
      text: { body: message.text, preview_url: true },
    };
  if (!env.META_WA_TEMPLATE_NAME) throw new Error("whatsapp_template_required");
  // The configured approved template must have one body parameter for this message.
  return {
    ...base,
    type: "template",
    template: {
      name: env.META_WA_TEMPLATE_NAME,
      language: { code: env.META_WA_TEMPLATE_LANGUAGE },
      components: [
        { type: "body", parameters: [{ type: "text", text: message.text }] },
      ],
    },
  };
}
export async function sendExternal(
  message: Message,
  env: Env,
  lastInbound: Date | null,
) {
  let response: Response;
  if (env.MESSAGING_PROVIDER === "meta_whatsapp") {
    if (!env.META_WA_TOKEN || !env.META_WA_PHONE_NUMBER_ID)
      throw new Error("messaging_not_configured");
    response = await fetch(
      `https://graph.facebook.com/${env.META_GRAPH_VERSION}/${encodeURIComponent(env.META_WA_PHONE_NUMBER_ID)}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.META_WA_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(metaPayload(message, env, lastInbound)),
        signal: AbortSignal.timeout(5000),
        redirect: "error",
      },
    );
    if (!response.ok) throw new Error(`meta_http_${response.status}`);
    return z
      .object({ messages: z.array(z.object({ id: z.string() })).min(1) })
      .parse(await response.json()).messages[0].id;
  }
  const whatsapp = env.MESSAGING_PROVIDER === "twilio_whatsapp";
  const from = whatsapp ? env.TWILIO_WHATSAPP_FROM : env.TWILIO_SMS_FROM;
  if (!from || !env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN)
    throw new Error("messaging_not_configured");
  const number = (value: string) =>
    whatsapp ? "whatsapp:" + value.replace(/^whatsapp:/, "") : value;
  response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(env.TWILIO_ACCOUNT_SID)}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(
            `${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`,
          ).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: number(message.to),
        From: number(from),
        Body: message.text,
      }),
      signal: AbortSignal.timeout(5000),
      redirect: "error",
    },
  );
  if (!response.ok) throw new Error(`twilio_http_${response.status}`);
  return z.object({ sid: z.string() }).parse(await response.json()).sid;
}
