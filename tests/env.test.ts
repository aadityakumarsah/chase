import { describe, expect, it } from "vitest";
import { configReport, loadEnv } from "@/lib/env";
describe("environment", () => {
  it("uses safe defaults and treats empty values as unset", () => {
    const env = loadEnv({
      DEMO_MODE: "",
      DATABASE_URL: "",
      ENABLE_TRANSFER: "false",
    });
    expect(env.DEMO_MODE).toBe(true);
    expect(env.ENABLE_TRANSFER).toBe(false);
    expect(env.CALL_ALLOWLIST).toEqual([]);
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.DEFAULT_TZ).toBe("Asia/Kolkata");
  });
  it("maps legacy aliases but prefers canonical nonempty values", () => {
    const env = loadEnv({
      BOLNA_API_KEY: "unit-canonical",
      BOLNA_API_NAME: "unit-legacy",
      META_WA_ACCESS_TOKEN: "unit-meta",
      TWILIO_PHONE_NUMBER: "+919876543210",
    });
    expect(env.BOLNA_API_KEY).toBe("unit-canonical");
    expect(env.META_WA_TOKEN).toBe("unit-meta");
    expect(env.TWILIO_SMS_FROM).toBe("+919876543210");
    expect(
      loadEnv({ BOLNA_API_KEY: "", BOLNA_TOKEN: "unit-token" }).BOLNA_API_KEY,
    ).toBe("unit-token");
  });
  it("rejects invalid boundary values without echoing inputs", () => {
    for (const input of [
      { DEMO_MODE: "unit-sensitive" },
      { LLM_PROVIDER: "unit-sensitive" },
      { DATABASE_URL: "unit-sensitive" },
      { CALL_ALLOWLIST: "9876543210" },
    ]) {
      try {
        loadEnv(input);
        expect.fail("Expected rejection");
      } catch (e) {
        expect(String(e)).not.toContain("unit-sensitive");
        expect(String(e)).toContain("Invalid environment keys");
      }
    }
    expect(
      loadEnv({ CALL_ALLOWLIST: " +919876543210 , +919876543211 " })
        .CALL_ALLOWLIST,
    ).toHaveLength(2);
  });
  it("reports missing names only and validates the selected integration", () => {
    const env = loadEnv({
      BOLNA_API_KEY: "unit-secret-value",
      LLM_PROVIDER: "openai_compatible",
      LLM_API_KEY: "unit-llm-value",
    });
    const report = configReport(env);
    expect(report.bolna.status).toBe("configured");
    expect(report.messaging.status).toBe("configured");
    expect(report.llm.missing).toEqual(["LLM_BASE_URL"]);
    expect(JSON.stringify(report)).not.toContain("unit-secret-value");
    expect(JSON.stringify(report)).not.toContain("unit-llm-value");
    expect(report.security.missing).toContain("CHASE_TOOL_SECRET");
    // Accounts replaced the shared passcode: Supabase credentials are what the
    // report must now flag as missing authentication.
    expect(report.auth.status).toBe("missing");
    expect(report.auth.missing).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(report.auth.missing).toContain(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    );
    expect(
      configReport(
        loadEnv({
          NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-test-key",
        }),
      ).auth.status,
    ).toBe("configured");
  });
});
