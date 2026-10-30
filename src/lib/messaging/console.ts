import { enqueueMessage, deliverMessage } from "./index";
import { type Message, type MessagingProvider } from "./types";
export class ConsoleMessaging implements MessagingProvider {
  async send(input: Message) {
    const row = await enqueueMessage(input, { forceConsole: true });
    await deliverMessage(row.id);
    return { providerMessageId: `console:${row.id}`, status: "sent" as const };
  }
}
