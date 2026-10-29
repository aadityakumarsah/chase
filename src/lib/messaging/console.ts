import { appendEvent } from "@/lib/events";
import { maskPhone } from "@/lib/phone";
import { messageSchema, type MessagingProvider } from "./types";
export class ConsoleMessaging implements MessagingProvider {
  async send(
    input: Parameters<MessagingProvider["send"]>[0],
  ): ReturnType<MessagingProvider["send"]> {
    const message = messageSchema.parse(input);
    const event = await appendEvent({
      type: "message.simulated",
      payload: { to: maskPhone(message.to), text: message.text },
    });
    return { id: event.id, status: "simulated" };
  }
}
