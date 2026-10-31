import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getBriefPage, runDailyBrief } from "@/lib/brief";
import { generatePromptPR, listPromptPRs } from "@/lib/promptprs";

const workspace = "11111111-1111-4111-8111-111111111111";
const otherWorkspace = "22222222-2222-4222-8222-222222222222";

vi.mock("@/lib/tenancy/guard", () => ({
  requireMember: vi.fn(async () => ({
    ok: true,
    businessId: "11111111-1111-4111-8111-111111111111",
    role: "admin",
  })),
}));
vi.mock("@/lib/brief", () => ({
  getBriefPage: vi.fn(async () => ({ brief: null, history: [] })),
  runDailyBrief: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/promptprs", () => ({
  listPromptPRs: vi.fn(async () => []),
  generatePromptPR: vi.fn(async () => ({ id: "test" })),
}));
vi.mock("@/lib/billing/entitlements", () => ({
  checkFeature: vi.fn(async () => ({ ok: true })),
}));

beforeEach(() => vi.clearAllMocks());

describe("workspace API boundaries", () => {
  it("reads only the signed-in workspace's brief", async () => {
    const { GET } = await import("@/app/api/brief/route");
    const response = await GET(new NextRequest("http://localhost/api/brief"));
    expect(response.status).toBe(200);
    expect(getBriefPage).toHaveBeenCalledWith(workspace);
  });

  it("ignores a body workspace when generating a brief", async () => {
    const { POST } = await import("@/app/api/brief/run/route");
    const response = await POST(
      new NextRequest("http://localhost/api/brief/run", {
        method: "POST",
        body: JSON.stringify({ date: "today", businessId: otherWorkspace }),
      }),
    );
    expect(response.status).toBe(200);
    expect(runDailyBrief).toHaveBeenCalledWith({
      date: "today",
      deliver: ["dashboard"],
      businessId: workspace,
    });
  });

  it("binds Prompt PR reads and generation to the signed-in workspace", async () => {
    const { GET, POST } = await import("@/app/api/prompt-prs/route");
    await GET(new NextRequest("http://localhost/api/prompt-prs"));
    expect(listPromptPRs).toHaveBeenCalledWith(workspace);
    const response = await POST(
      new NextRequest("http://localhost/api/prompt-prs", { method: "POST" }),
    );
    expect(response.status).toBe(201);
    expect(generatePromptPR).toHaveBeenCalledWith("collections", workspace);
  });
});
