import { describe, expect, it, vi } from "vitest";
import { BolnaClient } from "@/lib/bolna/client";
import {
  authorizeToolRequest,
  idempotencyKey,
  ToolError,
  toolBodySchema,
} from "@/lib/calls/tools";
import {
  mapExecutionToCall,
  hasConversation,
  isStaleExecution,
  TERMINAL_STATUSES,
  verifyWebhookSecret,
} from "@/lib/calls/webhook";
import { bolnaScheduledAt } from "@/lib/time";

const apiKey = "unit-test-bolna-secret";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
const env = {
  CHASE_TOOL_SECRET: "tool-secret-long-enough",
  CHASE_WEBHOOK_SECRET: "webhook-secret-long-enough",
} as never;

describe("dialling Bolna", () => {
  it("sends the documented call body and never retries a dial", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({}, 503))
      .mockResolvedValueOnce(
        json({ execution_id: "exec-1", status: "queued" }),
      );
    const client = new BolnaClient({ apiKey, fetch: request, maxRetries: 2 });
    await expect(
      client.startCall({
        agent_id: "agent-1",
        recipient_phone_number: "+919876543210",
      }),
    ).rejects.toThrow();
    // One attempt only: a retried POST /call would place a second real call.
    expect(request).toHaveBeenCalledTimes(1);

    const ok = new BolnaClient({ apiKey, fetch: request });
    const result = await ok.startCall({
      agent_id: "agent-1",
      recipient_phone_number: "+919876543210",
      user_data: { debtor_name: "Ramesh", outstanding_rupees: 12500 },
      scheduled_at: bolnaScheduledAt(new Date("2026-10-29T12:00:00Z")),
    });
    expect(result.execution_id).toBe("exec-1");
    const [url, init] = request.mock.calls[1];
    expect(url).toBe("https://api.bolna.ai/call");
    expect(init?.method).toBe("POST");
    const body = JSON.parse(String(init?.body));
    expect(body.scheduled_at).toMatch(/\+00:00$/);
    expect(body.user_data.debtor_name).toBe("Ramesh");
  });

  it("rejects a bad recipient, agent id or Z-suffixed schedule", async () => {
    const client = new BolnaClient({
      apiKey,
      fetch: vi.fn<typeof fetch>().mockResolvedValue(json({})),
    });
    await expect(
      client.startCall({
        agent_id: "agent-1",
        recipient_phone_number: "9876543210",
      }),
    ).rejects.toThrow();
    await expect(
      client.startCall({
        agent_id: "agent-1",
        recipient_phone_number: "+919876543210",
        // Bolna returns a 500 for a trailing "Z" instead of an offset.
        scheduled_at: "2026-10-29T12:00:00Z",
      }),
    ).rejects.toThrow();
    await expect(client.getExecution("../../user/me")).rejects.toThrow();
  });

  it("reads an execution defensively and keeps unknown fields", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      json({
        id: 4242,
        status: "completed",
        transcript: "agent: नमस्ते",
        total_cost: 1.5,
        future_field: { nested: true },
        telephony_data: { duration: 42, recording_url: "https://x/y.wav" },
      }),
    );
    const execution = await new BolnaClient({
      apiKey,
      fetch: request,
    }).getExecution("exec-1");
    expect(execution.id).toBe("4242");
    expect(execution).toHaveProperty("future_field");
  });
});

describe("execution webhook", () => {
  const now = new Date("2026-10-29T13:00:00Z");

  it("authenticates with a constant-time secret comparison", () => {
    expect(verifyWebhookSecret("webhook-secret-long-enough", env)).toBe(true);
    expect(verifyWebhookSecret("wrong", env)).toBe(false);
    expect(verifyWebhookSecret(null, env)).toBe(false);
    expect(
      verifyWebhookSecret("x", { CHASE_WEBHOOK_SECRET: undefined } as never),
    ).toBe(false);
  });

  it("maps a completed execution onto the call row", () => {
    const update = mapExecutionToCall(
      {
        id: "exec-1",
        status: "completed",
        transcript: "assistant: hello\nuser: Yes, speaking",
        total_cost: 2.345,
        conversation_duration: 61,
        created_at: "2026-10-29T12:50:00Z",
        updated_at: "2026-10-29T12:52:00Z",
        telephony_data: {
          duration: 63,
          recording_url: "https://rec/1.wav",
          hangup_reason: "Normal Hangup",
        },
      } as never,
      now,
    );
    expect(update).toMatchObject({
      status: "completed",
      connected: true,
      // Conversation duration determines whether a conversation happened.
      durationSec: 61,
      recordingUrl: "https://rec/1.wav",
      terminationReason: "Normal Hangup",
    });
    expect(update.costCents).toBe(2n);
    expect(update.endedAt?.toISOString()).toBe("2026-10-29T12:52:00.000Z");
  });

  it("marks an unanswered call as not connected and keeps the error", () => {
    const update = mapExecutionToCall(
      {
        id: "exec-2",
        status: "no-answer",
        error_message: "callee did not pick up",
      } as never,
      now,
    );
    expect(update.connected).toBe(false);
    expect(update.terminationReason).toBe("callee did not pick up");
    expect(update.endedAt).toEqual(now);
    expect(update.durationSec).toBeUndefined();
  });

  it("does not treat a disconnect as the final state", () => {
    expect(TERMINAL_STATUSES.has("call-disconnected")).toBe(false);
    expect(TERMINAL_STATUSES.has("completed")).toBe(true);
    expect(TERMINAL_STATUSES.has("balance-low")).toBe(true);
    const update = mapExecutionToCall(
      { id: "exec-3", status: "call-disconnected" } as never,
      now,
    );
    expect(update.connected).toBe(false);
    expect(update.endedAt).toBeUndefined();
  });
});

describe("tool endpoint guards", () => {
  it("accepts only the exact tool bearer secret", () => {
    expect(() =>
      authorizeToolRequest("Bearer tool-secret-long-enough", env),
    ).not.toThrow();
    expect(() => authorizeToolRequest("Bearer wrong", env)).toThrow(ToolError);
    expect(() =>
      authorizeToolRequest("tool-secret-long-enough", env),
    ).toThrow();
    expect(() => authorizeToolRequest(null, env)).toThrow();
    expect(() =>
      authorizeToolRequest("Bearer anything", {
        CHASE_TOOL_SECRET: undefined,
      } as never),
    ).toThrow(/not configured/);
  });

  it("requires a well-formed call token", () => {
    expect(
      toolBodySchema.safeParse({
        account_id: "11111111-1111-4111-8111-111111111111",
        call_token: "a".repeat(64),
      }).success,
    ).toBe(true);
    expect(toolBodySchema.safeParse({ call_token: "short" }).success).toBe(
      false,
    );
    expect(toolBodySchema.safeParse({}).success).toBe(false);
    // Unsubstituted Bolna placeholders must not pass as a token.
    expect(
      toolBodySchema.safeParse({ call_token: "%(call_token)s" }).success,
    ).toBe(false);
  });

  it("dedupes stubs by call and canonical arguments", () => {
    const token = "b".repeat(64);
    const args = {
      call_token: token,
      amount_rupees: 5000,
      promise_date: "2026-11-05",
    };
    expect(idempotencyKey("record_promise_to_pay", token, args)).toBe(
      idempotencyKey("record_promise_to_pay", token, {
        ...args,
        account_id: "x",
      }),
    );
    expect(idempotencyKey("record_promise_to_pay", token, args)).not.toBe(
      idempotencyKey("record_promise_to_pay", token, {
        ...args,
        amount_rupees: 6000,
      }),
    );
    expect(idempotencyKey("check_payment_status", token, args)).toBe(
      idempotencyKey("check_payment_status", token, args),
    );
  });
});

it("requires both duration and a user utterance; ignores late lifecycle regressions", () => {
  expect(
    hasConversation({
      id: "x",
      status: "completed",
      conversation_duration: 20,
      transcript: "assistant: Hello",
    }),
  ).toBe(false);
  expect(
    hasConversation({
      id: "x",
      status: "completed",
      conversation_duration: 20,
      transcript: "assistant: Hello\nuser: Yes",
    }),
  ).toBe(true);
  expect(isStaleExecution("completed", "ringing")).toBe(true);
  expect(isStaleExecution("completed", "completed")).toBe(false);
  expect(isStaleExecution("ringing", "completed")).toBe(false);
  expect(isStaleExecution("call-disconnected", "completed")).toBe(false);
  expect(isStaleExecution("completed", "call-disconnected")).toBe(true);
});
